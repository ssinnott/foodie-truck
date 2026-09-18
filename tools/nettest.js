// Pure-Node tests for the netcode that needs no browser: the wire format round-trips, the input mask layout,
// the lockstep scheduler with 2-4 simulated peers under packet loss and reordering, the desync canary, the
// roster rules and the session's lobby logic. Runs in CI before the build.
import { ACTIONS, packMask, unpackMask, input } from '../src/engine/input.ts';
import { encodeInput, encodeChecksum, encodeStart, encodeDrop, encodeRelay, encodePing, encodeJson, decodeMessage, MSG, PROTOCOL_VERSION } from '../src/net/protocol.ts';
import { createLockstep } from '../src/lib/net/lockstep.ts';
import { runChecksum } from '../src/net/checksum.ts';
import { makeMember, packSeats, freeSlot, uniquePicks, critterTaken, firstFreeCritter, picksDistinct, sortRoster, resetSeats, releaseSeats } from '../src/net/roster.ts';
import { LOCAL_PLAYERS, MAX_PLAYERS } from '../src/constants.ts';
import * as bindings from '../src/engine/bindings.ts';
import { createNetSession, delayForRtt } from '../src/net/session.ts';
import { dsin, dcos } from '../src/lib/engine/trig.ts';

let failures = 0, passes = 0;
function assert(c, msg) { if (!c) { failures++; console.log('  FAIL: ' + msg); } else { passes++; } }

// ---- masks ----
assert(ACTIONS.length === 8, 'eight actions');
const m = packMask({ left: true, action: true, start: true });
assert(m === (1 | 16 | 128), 'packMask bit layout');
const u = unpackMask(m);
assert(u.left && u.action && u.start && !u.right && !u.cancel, 'unpackMask round trip');

// ---- protocol ----
const inp = decodeMessage(encodeInput(2, 1000, [1, 2, 3, 255]));
assert(inp && inp.type === MSG.INPUT && inp.slot === 2 && inp.baseFrame === 1000 && inp.masks.join() === '1,2,3,255', 'INPUT round trip');
const cs = decodeMessage(encodeChecksum(1, 30, 0xdeadbeef));
assert(cs && cs.slot === 1 && cs.frame === 30 && cs.sum === 0xdeadbeef, 'CHECKSUM round trip');
const st = decodeMessage(encodeStart({ seed: 123456789, scene: 3, delay: 4, critters: [0, 2, 1] }));
assert(st && st.seed === 123456789 && st.scene === 3 && st.delay === 4 && st.critters.join() === '0,2,1', 'START round trip');
const dr = decodeMessage(encodeDrop(3, 777)); assert(dr && dr.slot === 3 && dr.frame === 777, 'DROP round trip');
const rl = decodeMessage(encodeRelay(1, encodePing(2, 9))); assert(rl && rl.to === 1 && decodeMessage(rl.payload).id === 9, 'RELAY carries an inner packet');
const hj = decodeMessage(encodeJson(MSG.HELLO, { v: PROTOCOL_VERSION, id: 'abc' })); assert(hj && hj.v === PROTOCOL_VERSION && hj.id === 'abc', 'HELLO json');
assert(decodeMessage(new Uint8Array([99])) === null && decodeMessage(new Uint8Array(0)) === null, 'unknown / empty packets decode to null');

// ---- lockstep: N peers, lossy links, byte-identical consumption ----
function simulate(n, delay, loss, frames, seed = 1) {
  let s = seed; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const peers = Array.from({ length: n }, (_, i) => createLockstep({ localSlot: i, players: n, delay }));
  const inbox = peers.map(() => []);
  const consumed = peers.map(() => []);
  for (let tick = 0; tick < frames * 3; tick++) {
    for (let i = 0; i < n; i++) {
      const ls = peers[i];
      // deliver (reordered) inbox
      const box = inbox[i]; box.sort(() => rnd() - 0.5);
      while (box.length) { const p = box.pop(); ls.receiveInput(p.slot, p.baseFrame, p.masks); }
      if (ls.canAdvance() && ls.frame < frames) {
        const pkt = ls.recordLocal((i * 37 + ls.frame * 11) & 0xff);
        consumed[i].push(ls.inputs().join(','));
        ls.advance();
        for (let j = 0; j < n; j++) if (j !== i && rnd() >= loss) inbox[j].push({ slot: i, ...pkt });
      } else {
        // Stalled, or finished: keep re-sending the window. A peer that goes quiet once it is done would
        // strand anyone whose copy of its last packet was lost, exactly as a real session keeps pumping.
        ls.stall();
        const pkt = ls.resend();
        for (let j = 0; j < n; j++) if (j !== i && rnd() >= loss) inbox[j].push({ slot: i, ...pkt });
      }
    }
  }
  const done = peers.every((p) => p.frame >= frames);
  const same = consumed.every((c) => c.length === frames && c.join('|') === consumed[0].join('|'));
  return { done, same };
}
for (const n of [2, 3, 4]) {
  const r = simulate(n, 3, 0.5, 600, n);
  assert(r.done, `${n} peers reach the end under 50% loss`);
  assert(r.same, `${n} peers consume byte-identical input`);
}
const ls = createLockstep({ localSlot: 0, players: 2, delay: 2 });
assert(ls.canAdvance() && ls.frame === 0, 'opening frames are pre-filled');
ls.recordLocal(5); ls.advance(); ls.recordLocal(6); ls.advance();
assert(!ls.canAdvance(), 'frame 2 waits for the remote');
ls.receiveInput(1, 0, [0, 0, 9]);
assert(ls.canAdvance() && ls.inputs()[1] === 9, 'remote input unblocks and is read back');
ls.dropSlot(1, 3); ls.advance(); assert(ls.canAdvance() && ls.inputs()[1] === 0, 'a dropped slot reads as neutral from its drop frame');
ls.noteLocalChecksum(30, 42); ls.receiveChecksum(1, 30, 43); assert(ls.desync && ls.desync.frame === 30, 'checksum mismatch is caught');

// ---- deterministic trig ----
let maxErr = 0; for (let i = -2000; i <= 2000; i++) { const a = i * 0.37; maxErr = Math.max(maxErr, Math.abs(dsin(a) - Math.sin(a)), Math.abs(dcos(a) - Math.cos(a))); }
assert(maxErr < 1e-14, `dsin/dcos within 1e-14 of Math (got ${maxErr})`);

// ---- net/checksum.js: must catch every divergence of the run and produce ZERO false positives ----
const fakeGame = (screen = { id: 'map', checksumFields: () => [1.5, 2] }) => ({
  rng: { state: 12345 }, frame: 10, screen,
  run: {
    seed: 7, line: 0, customer: 0, served: 0, score: 0, frame: 0,
    recipes: ['pie'],
    lines: [{ place: 'mill', served: false, customers: [{ customer: 'owl', recipe: 'pie', stars: 0 }] }],
    needs: [{ id: 'apple', amount: 3, have: 1, used: 0 }],
    order: { id: 'pie', customer: 'owl', needs: [{ id: 'apple', amount: 3, have: 1 }] },
    truck: { x: 10, y: 20, heading: 0, at: 'home' },
    party: [{ slot: 0, critter: 'generic', score: 0 }, { slot: 1, critter: 'generic', score: 0 }],
  },
});
const withGame = (fn, screen) => { const g = fakeGame(screen); fn(g); return runChecksum(g); };
const base = runChecksum(fakeGame());
assert(runChecksum(fakeGame()) === base, 'identical state hashes identically');
assert(withGame((g) => { g.run.truck.x = -0; }) === withGame((g) => { g.run.truck.x = 0; }), '-0 and 0 hash identically');
assert(withGame((g) => { g.run.truck.y = NaN; }) === withGame((g) => { g.run.truck.y = NaN; }), 'NaN hashes stably');
assert(withGame((g) => { g.run.truck.x = 10.0000001; }) !== base, 'a 1e-7 truck position difference is caught');
assert(withGame((g) => { g.rng.state = 12346; }) !== base, 'an rng stream divergence is caught');
assert(withGame((g) => { g.frame = 11; }) !== base, 'a frame counter difference is caught');
assert(withGame((g) => { g.run.order.needs[0].have = 2; }) !== base, 'a gathered-ingredient difference is caught');
assert(withGame((g) => { g.run.truck.at = 'orchard'; }) !== base, 'a STRING field difference is caught (truck.at is a place id)');
assert(withGame((g) => { g.run.party[1].critter = 'other'; }) !== base, 'a party critter difference is caught');
assert(withGame((g) => { g.run.party.pop(); }) !== base, 'a party size difference is caught');
assert(withGame((g) => { g.run.score = 100; g.run.served = 1; }) !== base, 'a score / served difference is caught');
assert(withGame((g) => { g.run.needs[0].have = 2; }) !== base, 'a shopping-list difference is caught');
assert(withGame((g) => { g.run.needs[0].used = 1; }) !== base, 'a pantry draw-down difference is caught');
assert(withGame((g) => { g.run.lines[0].customers[0].stars = 3; }) !== base, 'a customer rating difference is caught');
assert(withGame((g) => { g.run.lines[0].served = true; }) !== base, 'a served-line difference is caught');
assert(withGame((g) => { g.run.lines[0].place = 'hive'; }) !== base, 'a line placed elsewhere is caught');
assert(withGame((g) => { g.run.customer = 1; }) !== base, 'a different customer at the hatch is caught');
assert(withGame((g) => { g.screen.id = 'orchard'; }) !== base, 'one peer on a different screen is caught');
assert(runChecksum(fakeGame({ id: 'map', checksumFields: () => [1.5, 3] })) !== base, "a difference in the screen's checksumFields is caught");
assert(runChecksum(fakeGame({ id: 'map', checksumFields: () => [1.5, 2, 0] })) !== base, 'an extra checksum field is caught');
assert(runChecksum(fakeGame({ id: 'map' })) !== base && runChecksum(fakeGame({ id: 'map' })) === runChecksum(fakeGame({ id: 'map' })), 'a screen without checksumFields hashes stably');
assert(runChecksum(fakeGame({ id: 'map', checksumFields: () => ['AB', 'C'] })) !== runChecksum(fakeGame({ id: 'map', checksumFields: () => ['A', 'BC'] })), 'string fields are length-prefixed');
const tagged = [[0], [''], [false], [null]].map((f) => runChecksum(fakeGame({ id: 'map', checksumFields: () => f })));
assert(new Set(tagged).size === 4, 'type tags keep 0, "", false and null apart');
assert(withGame((g) => { g.run = null; }) !== base && withGame((g) => { g.run = null; }) === withGame((g) => { g.run = null; }), 'no run at all hashes stably');

// ---- net/session.js: the input delay must exceed the one-way latency, within playable bounds ----
assert(delayForRtt(null) === 3, 'no measurement yet: the default guess');
assert(delayForRtt(0) === 2 && delayForRtt(5) === 2, 'a LAN round trip still leaves two frames (zero-delay lockstep deadlocks)');
assert(delayForRtt(1000) === 10 && delayForRtt(1e6) === 10, 'a terrible link is clamped to ten frames');
{
  let mono = true, covers = true, prev = 0;
  for (let r = 0; r <= 400; r += 5) { const d = delayForRtt(r); if (d < prev) mono = false; prev = d; if (d < 10 && d * (1000 / 60) <= r / 2) covers = false; }
  assert(mono, 'the delay never shrinks as the round trip grows');
  assert(covers, 'the delay exceeds the one-way latency wherever it is not clamped');
}

// ---- net/roster.js: dense seats, one critter each (modulo the cast), the match-boundary input reset ----
const packed = packSeats([makeMember('a', 0, 0, true), null, makeMember('c', 2, 2), undefined, makeMember('d', 3, 3)]);
assert(packed.length === 3 && packed.map((m) => m.slot).join() === '0,1,2' && packed[1].pid === 'c' && packed[0].local, 'seats stay dense after a departure');
assert(freeSlot([makeMember('a', 0, 0)]) === 1 && freeSlot([makeMember('a', 0, 0), null, makeMember('c', 2, 2)]) === 1 && freeSlot([1, 2, 3, 4]) === -1, 'the first empty seat is handed out, and a full room has none');
assert(!uniquePicks(1, 2) && !uniquePicks(3, 4) && uniquePicks(4, 4) && uniquePicks(2, 2), 'one critter each only while the cast can seat the whole party');
const party = [makeMember('a', 0, 0, true), makeMember('b', 1, 2)];
assert(critterTaken(party, 2, 4, 0) && !critterTaken(party, 1, 4, 0) && !critterTaken(party, 0, 4, 0), "from seat 0, the other seat's critter is the only one taken");
assert(critterTaken(party, 6, 4, 0) && critterTaken(party, -2, 4, 0), 'picks compare modulo the cast (6 and -2 are critter 2 of four)');
assert(!critterTaken(party, 2, 1, 0), 'with a single critter nobody is refused');
assert(critterTaken(party, 0, 4, 1) && !critterTaken(party, 2, 4, 1), 'and from seat 1, seat 0 holds the taken one');
assert(firstFreeCritter(party, 4) === 1 && firstFreeCritter([0, 1, 2, 3].map((i) => makeMember('p' + i, i, i)), 4) === 0, 'a new arrival gets the first free critter, or 0 when none is');
assert(picksDistinct(party, 4) && !picksDistinct([makeMember('a', 0, 0), makeMember('b', 1, 4)], 4) && picksDistinct([makeMember('a', 0, 0), makeMember('b', 1, 0)], 1), 'a party is ready only on distinct picks, unless the cast is too small');
const sorted = sortRoster([{ pid: 'b', slot: 1, critter: 1 }, { pid: 'a', slot: 0, critter: 0, ready: true }], 'b');
assert(sorted[0].pid === 'a' && sorted[1].local && !sorted[0].local && sorted[0].ready === true && sorted[1].gone === false, 'a roster is stored by seat with our own entry marked');

input.setVirtual(0, { action: true }); input.update(); input.setVirtual(0, 0); input.update();
assert(input.buffered(0, 'action') && !input.pressed(0, 'action'), 'a menu press is still buffered a frame later, which is the point of the buffer');
input.setVirtual(3, { left: true }); input.update();
resetSeats(input, 2); input.update();
assert(!input.buffered(0, 'action'), 'the match boundary forgets it: the READY press must not open the map for somebody else on frame 0');
assert(input.joined(1) && !input.joined(2) && !input.joined(3), 'every seat of the party is joined and the rest are not');
assert(input.mask(3) === 0, 'no seat is left virtual');
input.setVirtual(0, 1); input.setVirtual(1, 2); input.update();
releaseSeats(input, { players: 2, keep: 0, freeze: true }); input.update();
assert(input.mask(0) === 1 && input.mask(1) === 0 && !input.joined(1), "an ended session freezes the other seat at neutral and un-joins it, keeping the survivor's own");
releaseSeats(input); input.update();
assert(input.mask(0) === 0, 'leaving hands every seat back to the real devices');

// ---- gamepads: four pads on the couch (engine/input.js claimPads / pollRaw) ----
/** A fake navigator.getGamepads() entry: `down` is a list of standard button indices held this step. */
const fakePad = (down = [], axes = [0, 0]) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })), axes });
const NO_PAD = null;
/** Back to a bare couch: no pads, no claims, nobody joined but P1, and no keyboard device stuck on a seat. */
function couchReset(padList = []) {
  input.setPadVirtual(padList);
  input.setPadClaims(true);
  for (let s = 0; s < MAX_PLAYERS; s++) input.clearVirtual(s);
  input.resetClaims();
  input.update();
}

assert(LOCAL_PLAYERS === 4, 'the couch seats four');

// one pad, nobody on the keys: it takes P1's seat and drives it
couchReset([fakePad([0])]);
assert(input.padOf(0) === 0 && input.device(0) === 'gamepad' && input.held(0, 'action'), 'a lone pad sits down in seat 1 and its A is ACTION');

// four pads, pressing one at a time: dense seats, lowest first, one pad each
couchReset([fakePad(), fakePad(), fakePad(), fakePad()]);
input.setPadVirtual([fakePad([9]), fakePad(), fakePad(), fakePad()]); input.update();
assert(input.padOf(0) === 0 && !input.joined(1), 'the first pad to press takes the lowest seat and nobody else is seated');
input.setPadVirtual([fakePad(), fakePad([0]), fakePad(), fakePad()]); input.update();
input.setPadVirtual([fakePad(), fakePad(), fakePad([0]), fakePad()]); input.update();
input.setPadVirtual([fakePad(), fakePad(), fakePad(), fakePad([0])]); input.update();
assert([0, 1, 2, 3].every((s) => input.padOf(s) === s), 'four pads take the four seats in the order they pressed');
assert([0, 1, 2, 3].every((s) => input.joined(s)), 'and every one of the four seats is joined');

// each seat now reads ONLY its own pad: seat 3 pressing must not move seat 1
input.setPadVirtual([fakePad(), fakePad(), fakePad([14]), fakePad([15])]); input.update();
assert(input.axisX(2) === -1 && input.axisX(3) === 1 && input.axisX(0) === 0 && input.axisX(1) === 0, 'a claimed pad drives its own seat and no other');
assert(input.mask(0) === 0, "seat 1 stops reading the loose pads once they are somebody's");

// a fifth pad has nowhere to sit: the couch is four, so it claims nothing and drives nobody
input.setPadVirtual([fakePad(), fakePad(), fakePad(), fakePad(), fakePad([0])]); input.update();
assert(input.padOf(0) === 0 && input.mask(0) === 0, 'a fifth pad finds no free seat and is read by nobody');

// the left stick is the d-pad, past the dead zone only
couchReset([fakePad([], [0.3, -0.3])]);
assert(input.mask(0) === 0 && input.padOf(0) === -1, 'a pad resting inside the dead zone claims no seat and presses nothing');
input.setPadVirtual([fakePad([], [0.9, -0.9])]); input.update();
assert(input.held(0, 'right') && input.held(0, 'up') && !input.held(0, 'left'), 'past the dead zone the left stick is the d-pad');

// a keyboard seat is not taken out from under its player while a seat is free
couchReset([]);
input.setVirtual(0, 0); input.update(); input.clearVirtual(0);   // nothing; seat 0 device is still 'none'
input.setPadVirtual([fakePad([0])]); input.update();
assert(input.padOf(0) === 0, 'with nobody on the keys the pad is P1');
couchReset([fakePad([0])]);
assert(input.padOf(0) === 0, 'and claims again from a clean couch');

// pollRaw: the wire sees every pad, claimed or not
couchReset([fakePad(), fakePad()]);
input.setPadVirtual([fakePad([0]), fakePad()]); input.update();         // pad 0 claims seat 0
input.setPadVirtual([fakePad(), fakePad([1])]); input.update();         // pad 1 claims seat 1
assert(input.padOf(1) === 1 && input.mask(0) === 0, 'the second pad is seat 2 and seat 1 is quiet');
input.setPadVirtual([fakePad(), fakePad([0])]);
assert((input.pollRaw(0) & packMask({ action: true })) !== 0, "pollRaw sees a pad claimed by another couch seat - online there is one human here and every pad is theirs");

// online: claiming is off, so no pad sits in a seat that belongs to another machine
couchReset([fakePad(), fakePad()]);
input.setPadClaims(false);
input.resetClaims();
input.setPadVirtual([fakePad([0]), fakePad([0])]); input.update();
assert(input.padOf(0) === -1 && input.padOf(1) === -1 && !input.joined(1), 'with claiming off no pad takes a seat');
assert(input.held(0, 'action') && (input.pollRaw(0) & packMask({ action: true })) !== 0, 'and both pads still drive the local seat');
// a seat a net session is injecting is never claimable, even with claiming back on
input.setPadClaims(true);
input.setVirtual(0, 0); input.setVirtual(1, 0); input.update();
assert(input.padOf(0) === -1 && input.padOf(1) === -1, 'a virtual seat is not free for a pad');
couchReset([]);
input.setPadVirtual(null);

// ---- bindings: the rules a rebind has to obey (engine/bindings.js) ----
const KEY_ALT_DEFAULT = bindings.KEY_DEFAULTS[0].alt.join();
const KEY_CANCEL_DEFAULT = bindings.KEY_DEFAULTS[0].cancel.join();
bindings.resetAll();
assert(bindings.isDefault(), 'a fresh set of bindings is the default set');
assert(bindings.keyLabel('KeyZ') === 'Z' && bindings.keyLabel('ArrowLeft') === '←' && bindings.keyLabel('Space') === 'SPACE', 'keys are labelled as a player would name them');
assert(bindings.keyLabel('Semicolon') === ';' && bindings.keyLabel('Numpad7') === 'NUM7' && bindings.keyLabel('') === '', 'and the odd ones have names too');
assert(bindings.padLabel(0) === 'A' && bindings.padLabel(7) === 'RT' && bindings.padLabel(12) === 'D-UP', 'every standard button is named, shoulders and triggers included');

// a rebind SETS the action to exactly one input
assert(bindings.bindKey(0, 'action', 'KeyM').ok, "P1's ACTION moves to M");
assert(bindings.keyboardMap(0).action.join() === 'KeyM', 'and M is the only thing on it - the Z/SPACE alternates went with it');
assert(!bindings.isDefault(), 'the set is no longer stock');

// an action may not be left with nothing on it
const takeLast = bindings.bindKey(1, 'action', 'KeyM');
assert(!takeLast.ok && /P1 ACTION/.test(takeLast.reason || ''), `P2 cannot take P1's only ACTION key (${takeLast.reason})`);
assert(bindings.keyboardMap(0).action.join() === 'KeyM', 'and the refusal left it where it was');
// but a code an action has a spare of moves freely, across seats as well as within one
assert(bindings.bindKey(1, 'left', 'KeyA').ok, "P2 takes A, which P1's LEFT had as a spare");
assert(bindings.keyboardMap(0).left.join() === 'ArrowLeft' && bindings.keyboardMap(1).left.join() === 'KeyA', 'P1 keeps the arrow and P2 has the letter');

// reserved codes are not for binding
const esc = bindings.bindKey(0, 'alt', 'Escape');
assert(!esc.ok && /RESERVED/.test(esc.reason || ''), `ESC cancels a rebind, so it can never be one (${esc.reason})`);
assert(!bindings.bindKey(0, 'alt', 'Tab').ok && !bindings.bindKey(0, 'alt', '').ok, 'nor TAB, nor nothing at all');
assert(!bindings.bindKey(9, 'alt', 'KeyQ').ok, 'and a seat with no keyboard block has no keys to bind');

// the pad table is one table, shared by every controller
assert(bindings.bindPad('action', 7).ok && bindings.padMap().action.join() === '7', 'ACTION moves to the right trigger');
const stealA = bindings.bindPad('alt', 1);
assert(!stealA.ok && /CANCEL/.test(stealA.reason || ''), `and B cannot be taken off CANCEL, its only button (${stealA.reason})`);
assert(!bindings.bindPad('alt', 16).ok && !bindings.bindPad('nope', 3).ok, 'the guide button and made-up actions are both refused');

// a remapped button really does drive a seat
couchReset([fakePad([7])]);
assert(input.held(0, 'action') && input.padOf(0) === 0, 'a pad pressing RT now presses ACTION, and claims a seat with it');
couchReset([fakePad([0])]);
assert(!input.held(0, 'action'), 'and A, which ACTION used to be on, no longer does');

// capture: while a rebind is listening nothing plays, and the button that lands is swallowed until released
bindings.resetAll();
couchReset([fakePad()]);
input.capture();
assert(input.capturing(), 'capture is open');
input.setPadVirtual([fakePad([5])]); input.update();
assert(input.capturedButton() === 5, 'the first button down is reported as RB');
assert(input.mask(0) === 0 && input.padOf(0) === -1, 'and while listening no seat reads input and no pad takes a seat');
assert(bindings.bindPad('cancel', 5).ok, 'RB becomes CANCEL');
input.endCapture();
input.update();
assert(!input.capturing() && input.mask(0) === 0, 'the button that bound CANCEL is swallowed while it is still held');
input.setPadVirtual([fakePad()]); input.update();
input.setPadVirtual([fakePad([5])]); input.update();
assert(input.held(0, 'cancel'), 'and works normally once it has been let go and pressed again');

// storage round trip (node has no localStorage, so the pure pair is what is tested)
bindings.resetAll();
bindings.bindKey(0, 'start', 'KeyP');
bindings.bindPad('start', 4);
const saved = bindings.serialize();
bindings.resetAll();
assert(bindings.isDefault(), 'reset puts everything back');
assert(bindings.deserialize(saved), 'a saved set is taken back in');
assert(bindings.keyboardMap(0).start.join() === 'KeyP' && bindings.padMap().start.join() === '4', 'and it is the set that was saved');
assert(!bindings.deserialize(null) && !bindings.deserialize({ v: 999 }), 'a missing or wrong-version set is ignored');
// junk falls back per action rather than costing a player the rest of their setup
bindings.resetAll();
assert(bindings.deserialize({ v: saved.v, keys: [{ action: ['KeyJ'], alt: [42], cancel: ['Escape'] }], pad: { action: [3], alt: [99] } }), 'a set with junk in it still loads');
assert(bindings.keyboardMap(0).action.join() === 'KeyJ', 'the good entry is kept');
assert(bindings.keyboardMap(0).alt.join() === KEY_ALT_DEFAULT && bindings.keyboardMap(0).cancel.join() === KEY_CANCEL_DEFAULT, 'a non-string key and a reserved one fall back to the defaults');
assert(bindings.padMap().action.join() === '3' && bindings.padMap().alt.join() === '2', 'and so does a button that is not on a standard pad');
bindings.resetAll();
couchReset([]);
input.setPadVirtual(null);

// ---- net/session.js: the lobby rules, on a party seated by hand (start() needs a browser) ----
const stubInput = { setVirtual() {}, clearVirtual() {}, consume() {}, setJoined() {}, resetClaims() {}, pollRaw: () => 0, playerCount: 4 };
const stubGame = (n) => ({ critters: Array.from({ length: n }, (_, i) => ({ id: 'c' + i })), options: {}, rng: { seed() {}, state: 0 }, run: null, frame: 0, reset() {} });
const seatParty = (net, picks, mine) => {
  net.lobby.members = picks.map((c, i) => ({ ...makeMember('p' + i, i, c, i === mine), rtt: 0 }));
  net.localSlot = mine; net.players = picks.length; net.lobby.myCritter = picks[mine]; net.state = 'lobby';
  return net;
};
const host = seatParty(createNetSession({ game: stubGame(4), input: stubInput, isHost: true }), [0, 2], 0);
assert(/^[23456789BCDFGHJKMNPQRSTVWXYZ]{6}$/.test(host.room) && host.pid.length === 8, 'a host mints a six-character host key and an eight-character peer id');
assert(createNetSession({ game: stubGame(4), input: stubInput, isHost: false, room: 'ABCDEF' }).room === 'ABCDEF', 'a guest joins the code it was given');
assert(host.critterTaken(2) && !host.critterTaken(1), "the other seat's critter is the only one marked taken");
assert(host.setCritter(3) && host.lobby.myCritter === 3 && host.lobby.members[0].critter === 3, 'a free critter can be chosen, and the host seats itself on it at once');
assert(host.setCritter(2) === false && host.lobby.myCritter === 3, 'a critter somebody else holds is refused, and the pick does not move');
assert(host.setCritter(6) === false && host.setCritter(5) && host.lobby.myCritter === 5, 'the refusal is modulo the cast (6 is critter 2, 5 is critter 1)');
assert(host.canStep() === true && host.beforeStep() === false && host.dropFrameOf(1) === -1, 'outside a match the loop is not gated and nothing is injected');
host.afterStep();
const sum = host.summary();
assert(sum.state === 'lobby' && sum.party.length === 2 && sum.party[1].critter === 2 && sum.frame === -1 && sum.desync === null, 'summary() reports the room as plain data');
assert(host.remoteSlots().join() === '1' && host.party()[0].local, 'remoteSlots() is everyone but us');
assert(host.beginMatch(0) === false, 'a party whose links are not open cannot be started');
host.end('test over');
assert(host.state === 'ended' && host.endReason === 'test over' && host.setCritter(0) === false && host.setReady(true) === false, 'an ended session refuses picks and ready flags');
host.end('again'); assert(host.endReason === 'test over', 'ending twice is a no-op');
const solo = seatParty(createNetSession({ game: stubGame(1), input: stubInput, isHost: true }), [0, 0], 0);
assert(!solo.critterTaken(0) && solo.setCritter(0), 'with a single critter every seat may share it');
const three = seatParty(createNetSession({ game: stubGame(3), input: stubInput, isHost: false }), [0, 1, 2, 0], 3);
assert(!three.critterTaken(0) && three.setCritter(1), 'with fewer critters than seats, duplicates are allowed');
const four = seatParty(createNetSession({ game: stubGame(4), input: stubInput, isHost: false }), [0, 1, 2, 3], 2);
assert(four.localSlot === 2 && [0, 1, 3].every((i) => four.critterTaken(i)) && !four.critterTaken(2) && four.setCritter(1) === false, 'in a full room every other critter is taken');

console.log(`nettest: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
