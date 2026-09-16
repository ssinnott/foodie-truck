// Playtest scenarios for the pond work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   pond - four seats on the millpond: seat 0 casts, the float lands in its column, a nibble is telegraphed and a
//          bite opens; pressing inside the 18-frame window hooks a trout (count 1, the bucket shows it), pressing
//          too early on a second cast pops the float (PLOP, no count), and forcing the clock drops the FISH sign and
//          returns to the map with the catch gathered. Also writes tools/screens/pond-bite.png at the bite moment.
import { withPage, assert } from '../playtest.js';

const seat0 = (s) => s.top.seats[0];
/** Step one frame at a time until seat 0 is in `state` (or the frame budget runs out); returns the summary. */
async function untilState(api, state, budget) {
  let s = await api.summary();
  for (let i = 0; i < budget && seat0(s).state !== state; i++) { await api.step(1); s = await api.summary(); }
  return s;
}

export const SCENARIOS = {
  async pond(server) {
    await withPage(server, 'skipTo=pond&critters=0,1,2,3', async (api, page) => {
      await api.step(5);
      const s0 = await api.summary();
      assert(s0.screen === 'pond' && s0.top.seats.length === 4, `the pond is up with four seats (${s0.screen}, ${s0.top.seats.length})`);
      assert(s0.top.seats.every((x) => x.state === 'idle'), 'everyone starts idle with the rod low');
      assert(s0.top.target >= 1, `the order sets a target (${s0.top.target})`);

      // cast: the float flies out and lands in seat 0's own column
      await api.press(0, { action: true }, 1, 0);
      const c = await api.summary();
      assert(seat0(c).state === 'cast', `action casts (seat 0 is ${seat0(c).state})`);
      await api.step(9);
      await api.shot('pond-cast');
      const w = await untilState(api, 'wait', 60);
      assert(seat0(w).state === 'wait' && seat0(w).fx === 340 && seat0(w).fy === 243, `the float lands in P1's column (${seat0(w).fx}, ${seat0(w).fy}) and waits ${seat0(w).t} frames`);
      assert(seat0(w).t >= 60 && seat0(w).t <= 240, `the wait is seeded inside 90..240 (${seat0(w).t} left after landing)`);
      assert(w.top.seats.slice(1).every((x) => x.state === 'idle'), 'the other seats did not cast');

      // the nibble telegraph, then the bite window; hook inside it
      const n = await untilState(api, 'nibble', 300);
      assert(seat0(n).state === 'nibble', 'a nibble is telegraphed after the wait');
      const b = await untilState(api, 'bite', 40);
      assert(seat0(b).state === 'bite' && seat0(b).t === 18, `the bite opens an 18-frame window (${seat0(b).t})`);
      await api.step(6);
      await api.shot('pond-bite');
      await api.press(0, { action: true }, 1, 0);
      const h = await api.summary();
      assert(seat0(h).state === 'hooked' && seat0(h).count === 1 && h.top.total === 1, `action inside the window hooks the trout (state ${seat0(h).state}, count ${seat0(h).count})`);
      await api.step(8);
      await api.shot('pond-hooked');
      await api.step(37);
      const back = await api.summary();
      assert(seat0(back).state === 'idle', `the seat is back to idle after 40 frames (${seat0(back).state})`);

      // too early: a second cast pulled during the wait pops the float and scores nothing
      await api.press(0, { action: true }, 1, 0);
      await untilState(api, 'wait', 60);
      await api.step(10);
      await api.press(0, { action: true }, 1, 0);
      const m = await api.summary();
      assert(seat0(m).state === 'missed' && seat0(m).count === 1, `pulling early misses (state ${seat0(m).state}, count still ${seat0(m).count})`);

      // the clock runs out: the FISH sign drops, the catch is gathered, and the pond hands back to the map
      const errsBefore = (await api.errors()).length;
      await page.evaluate(() => { window.__game.game.screen.timer = 1; });
      await api.step(2);
      const e = await api.summary();
      assert(e.top.ending === true, 'the round ends when the clock runs out');
      await api.step(20);
      await api.shot('pond-sign');
      await api.step(SIGN_FRAMES + 10);
      const end = await api.summary();
      assert(end.screen === 'map', `the pond returns to the map after the sign (now on ${end.screen})`);
      assert(end.run.needs.some((x) => x.startsWith('fish:1/')) || end.run.needs.every((x) => !x.startsWith('fish')), `the catch was gathered into the order (${end.run.needs.join()})`);
      assert((await api.errors()).length === errsBefore, 'no errors across the hand-off');
    });
  },
};
const SIGN_FRAMES = 60;
