// Pure-Node tests for the netcode that needs no browser: the wire format round-trips, the input mask layout,
// and the lockstep scheduler with 2-4 simulated peers under packet loss and reordering. Runs in CI before the build.
import { ACTIONS, packMask, unpackMask } from '../src/engine/input.js';
import { encodeInput, encodeChecksum, encodeStart, encodeDrop, encodeRelay, encodePing, encodeJson, decodeMessage, MSG, PROTOCOL_VERSION } from '../src/net/protocol.js';
import { createLockstep } from '../src/net/lockstep.js';
import { dsin, dcos } from '../src/engine/trig.js';

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

console.log(`nettest: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
