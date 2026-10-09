// Pure-Node tests for this game's half of the netcode: the wire format round-trips (the START packet), the input
// mask layout, the run checksum, the roster rules and the session's lobby logic. The library's half -- the
// lockstep scheduler under loss and reordering, deterministic trig, the framing, the checksum kernel -- is tested
// where it lives, in game-engine's tools/nettest.ts. Runs in CI before the build.
import { ACTIONS, packMask, unpackMask, input } from '../src/engine/input.ts';
import { encodeInput, encodeChecksum, encodeStart, encodeDrop, encodeRelay, encodePing, encodeJson, decodeMessage, MSG, PROTOCOL_VERSION } from '../src/net/protocol.ts';
import { runChecksum } from '../src/net/checksum.ts';
import { makeMember, packSeats, freeSlot, uniquePicks, critterTaken, firstFreeCritter, picksDistinct, sortRoster, resetSeats, releaseSeats } from '../src/net/roster.ts';
import { MAX_PLAYERS } from '../src/constants.ts';
import { DAYS_PER_WEEK, DAY_SHAPES, planWeek, planDay, shapeOf, dishesIn, batchSize, BATCH_MAX, LINE_MAX, DINERS } from '../src/game/run.ts';
import * as bindings from '../src/engine/bindings.ts';
import { createNetSession, delayForRtt } from '../src/net/session.ts';

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
const st = decodeMessage(encodeStart({ seed: 123456789, scene: 3, delay: 4, critters: [0, 2, 1], day: 3 }));
assert(st && st.seed === 123456789 && st.scene === 3 && st.delay === 4 && st.critters.join() === '0,2,1', 'START round trip');
assert(st && st.day === 3, 'START carries the host\'s day of the week');
const st0 = decodeMessage(encodeStart({ seed: 1, scene: 0, delay: 1, critters: [0] }));
assert(st0 && st0.day === 0, 'a START built without a day opens on day 0');
const stLast = decodeMessage(encodeStart({ seed: 1, scene: 0, delay: 1, critters: [0, 1, 2, 3], day: DAYS_PER_WEEK - 1 }));
assert(stLast && stLast.day === DAYS_PER_WEEK - 1 && stLast.critters.length === 4, 'the last day of a four-seat week round trips');
// a START cut short anywhere must decode to null rather than to a half-read day or party
const full = encodeStart({ seed: 5, scene: 2, delay: 3, critters: [1, 2], day: 4 });
let truncOk = true;
for (let i = 1; i < full.length; i++) if (decodeMessage(full.subarray(0, i)) !== null) truncOk = false;
assert(truncOk, 'every truncation of a START decodes to null');
const dr = decodeMessage(encodeDrop(3, 777)); assert(dr && dr.slot === 3 && dr.frame === 777, 'DROP round trip');
const rl = decodeMessage(encodeRelay(1, encodePing(2, 9))); assert(rl && rl.to === 1 && decodeMessage(rl.payload).id === 9, 'RELAY carries an inner packet');
const hj = decodeMessage(encodeJson(MSG.HELLO, { v: PROTOCOL_VERSION, id: 'abc' })); assert(hj && hj.v === PROTOCOL_VERSION && hj.id === 'abc', 'HELLO json');
assert(decodeMessage(new Uint8Array([99])) === null && decodeMessage(new Uint8Array(0)) === null, 'unknown / empty packets decode to null');

// ---- game/run.js planWeek: the week is a PURE function of the seed, which is what the one day byte rests on ----
{
  const a = planWeek(481920), b = planWeek(481920), c = planWeek(7);
  assert(JSON.stringify(a) === JSON.stringify(b), 'the same seed lays the same week out');
  assert(JSON.stringify(a) !== JSON.stringify(c), 'another seed lays another week out');
  assert(a.length === DAYS_PER_WEEK && DAYS_PER_WEEK === DAY_SHAPES.length, `a week is ${DAYS_PER_WEEK} days`);
  for (let d = 0; d < DAYS_PER_WEEK; d++) {
    const shape = DAY_SHAPES[d], plan = a[d];
    assert(plan.lines.length === shape.lines.length, `day ${d} forms ${shape.lines.length} queues`);
    assert(plan.lines.every((l, i) => l.customers.length === shape.lines[i]), `day ${d}'s queues are ${shape.lines.join()} long`);
    assert(plan.recipes.length === shape.recipes, `day ${d}'s menu is ${shape.recipes} recipes`);
    const places = plan.lines.map((l) => l.place);
    assert(new Set(places).size === places.length && places.every((x) => x !== 'home'), `day ${d}'s queues are at distinct landmarks, none of them home`);
    const ordered = plan.lines.flatMap((l) => l.customers.map((cu) => cu.recipe));
    assert(ordered.every((r) => plan.recipes.includes(r)), `day ${d}: every customer orders off the menu`);
    assert(plan.recipes.every((r) => ordered.includes(r)), `day ${d}: every recipe on the menu is ordered`);
    if (!shape.twists) assert(plan.lines.every((l) => l.customers.every((cu) => !cu.twist)), `day ${d} deals no twists`);
    if (shape.weather === 'clear') assert(plan.weather === 0, `day ${d} is always clear`);
    if (shape.weather === 'wet') assert(plan.weather === 1 || plan.weather === 2, `day ${d} is always wet (got ${plan.weather})`);
    // ONE GIANT LINE: a single queue a day, a crowd of different animals, served in even rounds the kitchen can carry
    assert(plan.lines.length === 1 && shape.lines.length === 1, `day ${d} is one giant line`);
    assert(plan.lines.every((l) => l.customers.length <= LINE_MAX), `day ${d}'s line fits the lane (${LINE_MAX} at most)`);
    assert(plan.lines.every((l) => l.customers.every((cu) => DINERS.includes(cu.customer))), `day ${d}: everyone in the line is a diner on the roll`);
    assert(plan.lines.every((l) => new Set(l.customers.map((cu) => cu.customer)).size === l.customers.length), `day ${d}: nobody in the line is the same animal twice`);
    assert(plan.lines.every((l) => l.customers.every((cu, i) => i === 0 || cu.customer !== l.customers[i - 1].customer)), `day ${d}: nobody stands behind their own twin`);
    assert(shapeOf(d) === shape && dishesIn(shape) === shape.lines.reduce((t, n) => t + n, 0), `day ${d}'s shape reads back`);
  }
  // the roll is big: across a week the village sends many different animals, not three on repeat
  assert(DINERS.length >= 16 && new Set(DINERS).size === DINERS.length, `the village has ${DINERS.length} different diners`);
  assert(new Set(a.flatMap((p) => p.lines.flatMap((l) => l.customers.map((cu) => cu.customer)))).size >= 12, 'a week of lines seats at least a dozen different animals');
  // the rounds: as even as they can be, never more than the kitchen carries, and they always add back up to the line
  for (let n = 1; n <= LINE_MAX; n++) {
    const size = batchSize(n); let left = n, rounds = 0;
    while (left > 0) { left -= Math.min(size, left); rounds++; }
    assert(size >= 1 && size <= BATCH_MAX && rounds === Math.ceil(n / size) && (n > BATCH_MAX || size === n), `a line of ${n} is ${rounds} rounds of ${size}`);
  }
  assert([4, 6, 9].map(batchSize).join() === '2,3,3', 'a line of 4, 6 and 9 goes up 2, 3 and 3 at a time');
  // THE FETE cooks the week again: nothing on its menu is a dish the week has not already served
  const fete = DAY_SHAPES.findIndex((sh) => sh.fromWeek);
  if (fete > 0) {
    const before = new Set(a.slice(0, fete).flatMap((p) => p.recipes));
    assert(a[fete].recipes.every((r) => before.has(r)), 'the fete draws its menu from what the week already served');
  }
  // the dev jumps land on the day they name and leave the rest of the week alone
  const jumped = planWeek(481920, { recipes: [0, 2], day: 2 });
  assert(jumped[2].recipes.length === 2 && jumped[2].recipes[0] !== undefined, '?recipes= fixes the menu of the day it names');
  assert(jumped[2].lines.every((l) => l.customers.every((cu) => !cu.twist)), 'a dev-jump day carries no twist');
  // planDay on its own is still the ordinary day, unchanged
  const one = planDay(99);
  assert(one.lines.length === DAY_SHAPES[1].lines.length && one.recipes.length === DAY_SHAPES[1].recipes, 'a bare planDay() is still the ordinary day');
}

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

// ---- gamepads: one player per machine, on whichever pad they pick up (engine/input.js allPadsMask / pollRaw) ----
/** A fake navigator.getGamepads() entry: `down` is a list of standard button indices held this step. */
const fakePad = (down = [], axes = [0, 0]) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })), axes });
/** Back to a bare machine: no pads, no seat virtual, nobody in the room but this machine's own seat. */
function padReset(padList = []) {
  input.setPadVirtual(padList);
  for (let s = 0; s < MAX_PLAYERS; s++) input.clearVirtual(s);
  input.resetJoins();
  input.update();
}

// one pad: it drives the one seat there is
padReset([fakePad([0])]);
assert(input.device(0) === 'gamepad' && input.held(0, 'action'), "a lone pad drives seat 1 and its A is ACTION");

// several pads are all the same player's: whichever is pressed drives seat 1, and nobody else is seated by it
padReset([fakePad(), fakePad(), fakePad(), fakePad()]);
input.setPadVirtual([fakePad(), fakePad(), fakePad([0]), fakePad()]); input.update();
assert(input.held(0, 'action'), 'the third pad of four drives seat 1 too: a pad sits in no seat of its own');
assert(!input.joined(1) && !input.joined(2) && !input.joined(3), 'and pressing it seats nobody else - there is no couch to fill');
assert([1, 2, 3].every((s) => input.mask(s) === 0), 'so the other seats hold nothing at all');
input.setPadVirtual([fakePad([14]), fakePad([15]), fakePad(), fakePad()]); input.update();
assert(input.held(0, 'left') && input.held(0, 'right') && input.axisX(0) === 0, 'two pads pressing at once are one player pressing both');
input.setPadVirtual([fakePad(), fakePad(), fakePad(), fakePad(), fakePad([0])]); input.update();
assert(input.held(0, 'action'), 'and a fifth pad is no different from the first');

// the left stick is the d-pad, past the dead zone only
padReset([fakePad([], [0.3, -0.3])]);
assert(input.mask(0) === 0, 'a pad resting inside the dead zone presses nothing');
input.setPadVirtual([fakePad([], [0.9, -0.9])]); input.update();
assert(input.held(0, 'right') && input.held(0, 'up') && !input.held(0, 'left'), 'past the dead zone the left stick is the d-pad');

// pollRaw: the wire sees every pad, which is what an online seat sends whatever slot it holds
padReset([fakePad(), fakePad([0])]);
assert((input.pollRaw(0) & packMask({ action: true })) !== 0, 'pollRaw sees every pad - there is one human here and every pad is theirs');
assert((input.pollRaw(2) & packMask({ action: true })) !== 0, 'and asking on behalf of another seat changes nothing: these are still the hands at this machine');

// a seat a net session is injecting reads the injection, and a pad pressed meanwhile does not reach it
padReset([fakePad()]);
input.setVirtual(1, packMask({ left: true }));
input.setPadVirtual([fakePad([15])]); input.update();
assert(input.held(1, 'left') && !input.held(1, 'right'), 'an injected seat holds what the session says, not what the pad here is pressing');
assert(input.held(0, 'right'), 'while the pad still drives this machine\'s own seat');
padReset([]);
input.setPadVirtual(null);

// ---- bindings: the rules a rebind has to obey (engine/bindings.js) ----
const KEY_ALT_DEFAULT = bindings.KEY_DEFAULTS.alt.join();
const KEY_CANCEL_DEFAULT = bindings.KEY_DEFAULTS.cancel.join();
bindings.resetAll();
assert(bindings.isDefault(), 'a fresh set of bindings is the default set');
assert(bindings.keyLabel('KeyZ') === 'Z' && bindings.keyLabel('ArrowLeft') === '←' && bindings.keyLabel('Space') === 'SPACE', 'keys are labelled as a player would name them');
assert(bindings.keyLabel('Semicolon') === ';' && bindings.keyLabel('Numpad7') === 'NUM7' && bindings.keyLabel('') === '', 'and the odd ones have names too');
assert(bindings.padLabel(0) === 'A' && bindings.padLabel(7) === 'RT' && bindings.padLabel(12) === 'D-UP', 'every standard button is named, shoulders and triggers included');

// a rebind SETS the action to exactly one input
assert(bindings.bindKey('action', 'KeyM').ok, 'ACTION moves to M');
assert(bindings.keyboardMap().action.join() === 'KeyM', 'and M is the only thing on it - the Z/SPACE alternates went with it');
assert(!bindings.isDefault(), 'the set is no longer stock');

// an action may not be left with nothing on it
const takeLast = bindings.bindKey('start', 'KeyM');
assert(!takeLast.ok && /M IS ACTION/.test(takeLast.reason || ''), `START cannot take ACTION's only key (${takeLast.reason})`);
assert(bindings.keyboardMap().action.join() === 'KeyM', 'and the refusal left it where it was');
// but a code an action has a spare of moves freely
assert(bindings.bindKey('up', 'KeyA').ok, "UP takes A, which LEFT had as a spare");
assert(bindings.keyboardMap().left.join() === 'ArrowLeft' && bindings.keyboardMap().up.join() === 'KeyA', 'LEFT keeps the arrow and UP has the letter');

// reserved codes are not for binding
const esc = bindings.bindKey('alt', 'Escape');
assert(!esc.ok && /RESERVED/.test(esc.reason || ''), `ESC cancels a rebind, so it can never be one (${esc.reason})`);
assert(!bindings.bindKey('alt', 'Tab').ok && !bindings.bindKey('alt', '').ok, 'nor TAB, nor nothing at all');
assert(!bindings.bindKey('nope', 'KeyQ').ok, 'and a made-up action has no key to take');

// the keys an old build's couch P2 had (T F G H, V B N 5) are free for the one player there is
assert(bindings.bindKey('cancel', 'KeyV').ok && bindings.keyboardMap().cancel.join() === 'KeyV', 'V, once P2\'s ACTION, binds like any other key');

// the pad table is one table, shared by every controller
assert(bindings.bindPad('action', 7).ok && bindings.padMap().action.join() === '7', 'ACTION moves to the right trigger');
const stealA = bindings.bindPad('alt', 1);
assert(!stealA.ok && /CANCEL/.test(stealA.reason || ''), `and B cannot be taken off CANCEL, its only button (${stealA.reason})`);
assert(!bindings.bindPad('alt', 16).ok && !bindings.bindPad('nope', 3).ok, 'the guide button and made-up actions are both refused');

// a remapped button really does drive the seat
padReset([fakePad([7])]);
assert(input.held(0, 'action'), 'a pad pressing RT now presses ACTION');
padReset([fakePad([0])]);
assert(!input.held(0, 'action'), 'and A, which ACTION used to be on, no longer does');

// capture: while a rebind is listening nothing plays, and the button that lands is swallowed until released
bindings.resetAll();
padReset([fakePad()]);
input.capture();
assert(input.capturing(), 'capture is open');
input.setPadVirtual([fakePad([5])]); input.update();
assert(input.capturedButton() === 5, 'the first button down is reported as RB');
assert(input.mask(0) === 0, 'and while listening no seat reads input');
assert(bindings.bindPad('cancel', 5).ok, 'RB becomes CANCEL');
input.endCapture();
input.update();
assert(!input.capturing() && input.mask(0) === 0, 'the button that bound CANCEL is swallowed while it is still held');
input.setPadVirtual([fakePad()]); input.update();
input.setPadVirtual([fakePad([5])]); input.update();
assert(input.held(0, 'cancel'), 'and works normally once it has been let go and pressed again');

// storage round trip (node has no localStorage, so the pure pair is what is tested)
bindings.resetAll();
bindings.bindKey('start', 'KeyP');
bindings.bindPad('start', 4);
const saved = bindings.serialize();
bindings.resetAll();
assert(bindings.isDefault(), 'reset puts everything back');
assert(bindings.deserialize(saved), 'a saved set is taken back in');
assert(bindings.keyboardMap().start.join() === 'KeyP' && bindings.padMap().start.join() === '4', 'and it is the set that was saved');
assert(!bindings.isDefault(), 'and knows it is not stock');
assert(!bindings.deserialize(null) && !bindings.deserialize({ v: 999 }), 'a missing or wrong-version set is ignored');
// junk falls back per action rather than costing a player the rest of their setup
bindings.resetAll();
assert(bindings.deserialize({ v: saved.v, keys: [{ action: ['KeyJ'], alt: [42], cancel: ['Escape'] }], pad: { action: [3], alt: [99] } }), 'a set with junk in it still loads');
assert(bindings.keyboardMap().action.join() === 'KeyJ', 'the good entry is kept');
assert(bindings.keyboardMap().alt.join() === KEY_ALT_DEFAULT && bindings.keyboardMap().cancel.join() === KEY_CANCEL_DEFAULT, 'a non-string key and a reserved one fall back to the defaults');
assert(bindings.padMap().action.join() === '3' && bindings.padMap().alt.join() === '2', 'and so does a button that is not on a standard pad');
// a set saved by a build that still had a couch P2 block: P1's keys come back, and P2's are not read at all
bindings.resetAll();
assert(bindings.deserialize({ v: saved.v, keys: [{ action: ['KeyK'] }, { action: ['KeyL'], cancel: ['KeyN'] }], pad: {} }), 'a two-block set from before local co-op went still loads');
assert(bindings.keyboardMap().action.join() === 'KeyK' && bindings.keyboardMap().cancel.join() === KEY_CANCEL_DEFAULT, "as the first block's keys, and nothing of the second's");
assert(bindings.serialize().keys.length === 1, 'and is written back as one block');
bindings.resetAll();
assert(bindings.isDefault(), 'which reset puts back to stock');
padReset([]);
input.setPadVirtual(null);

// ---- net/session.js: the lobby rules, on a party seated by hand (start() needs a browser) ----
const stubInput = { setVirtual() {}, clearVirtual() {}, consume() {}, setJoined() {}, pollRaw: () => 0, playerCount: 4 };
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
