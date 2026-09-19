// Playtest scenarios for the pond work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   pond - four seats on the millpond jetty: seat 0 casts, the float lands in its column, a press during the wait
//          does nothing at all, the fish bites on its own, and REEL_PRESSES taps of action reel it in (count 1, the
//          bucket shows it). Reaching the target drops the FISH sign and returns to the map with the catch gathered.
//          Writes pond-cast / pond-bite / pond-reel / pond-hooked / pond-columns / pond-sign into tools/screens.
import { withPage, assert } from '../playtest.js';

/** The screen's own numbers, mirrored here so a change to either side shows up as a failing assert. */
const WAIT_MIN = 60, WAIT_MAX = 150, REEL_PRESSES = 12;
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
      assert(seat0(w).state === 'wait' && seat0(w).fx === 170 && seat0(w).fy === 278, `the float lands in P1's own water 80 px right of its seat (${seat0(w).fx}, ${seat0(w).fy}) and waits ${seat0(w).t} frames`);
      assert(seat0(w).t >= WAIT_MIN && seat0(w).t <= WAIT_MAX, `the wait is seeded inside ${WAIT_MIN}..${WAIT_MAX} (${seat0(w).t} left after landing)`);
      assert(w.top.seats.slice(1).every((x) => x.state === 'idle'), 'the other seats did not cast');

      // a keen press during the wait is nothing: no miss, no pop, the float stays out
      await api.step(5);
      await api.press(0, { action: true }, 1, 0);
      const keen = await api.summary();
      assert(seat0(keen).state === 'wait' && seat0(keen).count === 0, `a press during the wait does nothing (state ${seat0(keen).state}, count ${seat0(keen).count})`);

      // the bite comes on its own and stays: nothing to time
      const b = await untilState(api, 'bite', 200);
      assert(seat0(b).state === 'bite' && seat0(b).reel === 0, `the fish bites on its own (state ${seat0(b).state}, reel ${seat0(b).reel})`);
      // this bite is the trout whatever the seed rolled: the boot has a scenario of its own below
      await page.evaluate(() => { window.__game.game.screen.seats[0].boot = 0; });
      await api.step(6);
      await api.shot('pond-bite');
      await api.step(60);
      const still = await api.summary();
      assert(seat0(still).state === 'bite', `the fish stays on however long nobody taps (${seat0(still).state} after 60 frames)`);

      // reel it in: one tap short is still a bite, the last tap lands it
      for (let i = 0; i < REEL_PRESSES - 1; i++) {
        await api.press(0, { action: true }, 1, 3);
        if (i === 2) await api.shot('pond-reel');
      }
      const almost = await api.summary();
      assert(seat0(almost).state === 'bite' && seat0(almost).reel === REEL_PRESSES - 1, `${REEL_PRESSES - 1} taps are ${REEL_PRESSES - 1} turns of the reel (state ${seat0(almost).state}, reel ${seat0(almost).reel})`);
      await api.press(0, { action: true }, 1, 0);
      const h = await api.summary();
      assert(seat0(h).state === 'hooked' && seat0(h).count === 1 && h.top.total === 1, `the ${REEL_PRESSES}th tap lands the trout (state ${seat0(h).state}, count ${seat0(h).count})`);
      await api.step(8);
      await api.shot('pond-hooked');
      await api.step(37);
      const back = await api.summary();
      assert(seat0(back).state === 'idle', `the seat is back to idle after 40 frames (${seat0(back).state})`);

      // the whole crew out at once: four floats, four columns, four depths, spread across the full 640 (note 8)
      await api.step(40);
      for (let i = 0; i < 4; i++) await api.press(i, { action: true }, 1, 0);
      let all = await api.summary();
      for (let i = 0; i < 60 && !all.top.seats.every((x) => x.state === 'wait'); i++) { await api.step(1); all = await api.summary(); }
      assert(all.top.seats.every((x) => x.state === 'wait'), `all four seats are fishing (${all.top.seats.map((x) => x.state).join()})`);
      const cols = all.top.seats.map((x) => x.fx);
      assert(cols.every((x, i) => i === 0 || x - cols[i - 1] === 130), `the four columns are one seat pitch apart (${cols.join()})`);
      await api.step(20);
      await api.shot('pond-columns');

      // the target is reached: the FISH sign drops, the catch is gathered, and the pond hands back to the map. There
      // is no clock to force - a round ends only when the party's total reaches the target - so the finish line is
      // brought down to what the bucket holds.
      const errsBefore = (await api.errors()).length;
      await api.step(20);
      const before = await api.summary();
      assert(before.top.total >= 1, `something was reeled in before the ending (total ${before.top.total})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.countStr = sc.total + '/' + sc.target; });
      await api.step(2);
      const e = await api.summary();
      assert(e.top.ending === true, 'the round ends when the target is reached');
      await api.step(20);
      await api.shot('pond-sign');
      await api.step(SIGN_SLAM + SIGN_HOLD + 10);
      const end = await api.summary();
      assert(end.screen === 'map', `the pond returns to the map after the sign (now on ${end.screen})`);
      assert(end.run.needs.some((x) => x.startsWith('fish:1/')) || end.run.needs.every((x) => !x.startsWith('fish')), `the catch was gathered into the order (${end.run.needs.join()})`);
      assert((await api.errors()).length === errsBefore, 'no errors across the hand-off');
    });
  },
};
/** The boot's sequence (screens/pond.ts): the arc up, the hold, the lob. */
const BOOT_ARC = 20, BOOT_HOLD = 30, BOOT_TOSS = 16, BOOT_FRAMES = BOOT_ARC + BOOT_HOLD + BOOT_TOSS;

/**
 * pondBoot - the joke: a bite that is the old boot reels in with the same twelve taps, comes up to the paw, is held
 *            and tipped, and is lobbed back; the count and the total stay at 0, the seat is idle again after
 *            BOOT_FRAMES, and the bite after a boot is a fish whatever the rng says. Writes pond-boot.
 */
SCENARIOS.pondBoot = async (server) => {
  await withPage(server, 'skipTo=pond&critters=0,1', async (api, page) => {
    await api.step(5);
    await api.press(0, { action: true }, 1, 0);
    const b = await untilState(api, 'bite', 260);
    assert(seat0(b).state === 'bite', `the bite came (${seat0(b).state})`);
    await page.evaluate(() => { window.__game.game.screen.seats[0].boot = 1; });
    for (let i = 0; i < REEL_PRESSES; i++) await api.press(0, { action: true }, 1, 3);
    const up = await api.summary();
    assert(seat0(up).state === 'boot' && seat0(up).count === 0 && up.top.total === 0 && up.top.boots === 1, `the twelfth tap brings up the boot and nothing is counted (state ${seat0(up).state}, count ${seat0(up).count}, total ${up.top.total}, boots ${up.top.boots})`);
    await api.step(BOOT_ARC + 16);
    await api.shot('pond-boot');
    const held = await api.summary();
    assert(seat0(held).state === 'boot', `the boot is still held and tipped (${seat0(held).state})`);
    await api.step(BOOT_FRAMES - BOOT_ARC - 16 - 4 + 2);
    const back = await untilState(api, 'idle', 8);
    assert(seat0(back).state === 'idle' && seat0(back).count === 0, `the seat is back to idle with nothing in the bucket after the lob (${seat0(back).state}, count ${seat0(back).count})`);
    // never two boots in a row: the next bite is a fish however the rng rolls
    await api.press(0, { action: true }, 1, 0);
    const b2 = await untilState(api, 'bite', 260);
    assert(seat0(b2).state === 'bite' && seat0(b2).boot === 0, `the bite after a boot is always a fish (boot ${seat0(b2).boot})`);
    for (let i = 0; i < REEL_PRESSES; i++) await api.press(0, { action: true }, 1, 3);
    const h = await api.summary();
    assert(seat0(h).state === 'hooked' && seat0(h).count === 1, `and it lands (${seat0(h).state}, count ${seat0(h).count})`);
  });
};

/** game/minigame.js: the end sign slams in over 6 frames and hangs for the GDD's 60. */
const SIGN_SLAM = 6, SIGN_HOLD = 60;
