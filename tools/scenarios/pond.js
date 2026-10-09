// Playtest scenarios for the pond work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   pond       - four seats on the millpond jetty: seat 0 casts, the float lands in its column, a press during the
//                wait does nothing at all, the fish bites on its own, and REEL_PRESSES taps of action reel it in
//                (count 1, the bucket shows it). Reaching the target drops the FISH sign and returns to the map with
//                the catch gathered. The rules, so both jokes are held off: every cast is cleared of its deal as it
//                lands. Writes pond-cast / pond-bite / pond-reel / pond-hooked / pond-columns / pond-sign.
//   pondBoot   - the old boot, dealt by hand: the snagged float, the twelve taps, the torrent and the ?!, the tiny
//                fish, the lob and SPLOSH!; nothing counted, and the cast after a boot is never a boot.
//   pondBigOne - the big one, dealt by hand: the shadow, the zip, the drag along the planks with the !, the yank and
//                SPLOOSH!, the climb out with the lily pad and the frog, the fish into the bucket (+1, exactly),
//                the shake, and the seat back on its spot and casting; the cast after a big one is never a big one.
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
/** Word cards up (game/gags.ts): the same module instance as the game's, since the URL is the same. */
const gagsUp = (page) => page.evaluate(async () => (await import('/src/game/gags.ts')).gagsUp());

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
      // the cast is dealt as it lands; this one is the trout whatever the seed dealt (both jokes have scenarios below)
      await page.evaluate(() => { const s = window.__game.game.screen.seats[0]; s.boot = 0; s.big = 0; });

      // a keen press during the wait is nothing: no miss, no pop, the float stays out
      await api.step(5);
      await api.press(0, { action: true }, 1, 0);
      const keen = await api.summary();
      assert(seat0(keen).state === 'wait' && seat0(keen).count === 0, `a press during the wait does nothing (state ${seat0(keen).state}, count ${seat0(keen).count})`);

      // the bite comes on its own and stays: nothing to time
      const b = await untilState(api, 'bite', 200);
      assert(seat0(b).state === 'bite' && seat0(b).reel === 0 && seat0(b).big === 0 && seat0(b).boot === 0, `the fish bites on its own, and it is a fish (state ${seat0(b).state}, reel ${seat0(b).reel}, big ${seat0(b).big}, boot ${seat0(b).boot})`);
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
      assert(seat0(almost).drag === 0 && seat0(almost).weapon === 'rod', `a trout drags nobody anywhere and bends no rod (drag ${seat0(almost).drag}, ${seat0(almost).weapon})`);
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
      // no shadow under any of them and no float lying over: four plain casts, whatever was dealt
      await page.evaluate(() => { for (const s of window.__game.game.screen.seats) { s.boot = 0; s.big = 0; } });
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
      assert(e.top.boots === 0 && e.top.bigOnes === 0, `the rules round played no joke (boots ${e.top.boots}, big ones ${e.top.bigOnes})`);
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

/** The boot's sequence (screens/pondGags.ts), from the twelfth tap: up the line, turned over, the torrent, the tiny fish, the lob; the ?! into the torrent. */
const BOOT_ARC = 20, BOOT_TIP = 8, BOOT_GUSH = 44, BOOT_FLOP = 14, BOOT_TOSS = 14, HUH_AT = 8;
const BOOT_FRAMES = BOOT_ARC + BOOT_TIP + BOOT_GUSH + BOOT_FLOP + BOOT_TOSS;

/**
 * pondBoot - the old boot. Dealt by hand as the float lands (the same two fields the deal writes): the float lies
 *            over and keeps still (the tell); the same twelve taps bring the boot up the line; it is turned over and
 *            a torrent pours out of it with the ?! up; a tiny fish flops out last and back into the pond; the boot
 *            is lobbed back, SPLOSH!, and the seat is idle after BOOT_FRAMES with nothing counted. The cast after a
 *            boot is never a boot whatever the rng says. Writes pond-boot-snag / -gush / -tinyfish / -splosh.
 */
SCENARIOS.pondBoot = async (server) => {
  await withPage(server, 'skipTo=pond&critters=0,1', async (api, page) => {
    await api.step(5);
    await api.press(0, { action: true }, 1, 0);
    await untilState(api, 'wait', 60);
    await page.evaluate(() => { const s = window.__game.game.screen.seats[0]; s.boot = 1; s.big = 0; });
    await api.step(10);
    const snag = await api.summary();
    assert(seat0(snag).state === 'wait' && seat0(snag).boot === 1, `the boot is dealt: a float snagged on something that is not swimming (state ${seat0(snag).state}, boot ${seat0(snag).boot})`);
    await api.shot('pond-boot-snag');
    const b = await untilState(api, 'bite', 260);
    assert(seat0(b).state === 'bite', `the bite came (${seat0(b).state})`);
    for (let i = 0; i < REEL_PRESSES - 1; i++) await api.press(0, { action: true }, 1, 3);
    await api.press(0, { action: true }, 1, 0);
    const up = await api.summary();
    assert(seat0(up).state === 'boot' && seat0(up).count === 0 && up.top.total === 0 && up.top.boots === 1, `the twelfth tap brings up the boot and nothing is counted (state ${seat0(up).state}, count ${seat0(up).count}, total ${up.top.total}, boots ${up.top.boots})`);
    // into the torrent, past the ?!: still pouring, the critter staring at it
    const gushK = BOOT_ARC + BOOT_TIP + HUH_AT + 4;
    await api.step(gushK);
    const gush = await api.summary();
    assert(seat0(gush).state === 'boot' && seat0(gush).anim === 'bootStare' && seat0(gush).weapon === 'none', `the boot is turned over and pouring, the rod set down (anim '${seat0(gush).anim}', ${seat0(gush).weapon})`);
    assert((await gagsUp(page)) > 0, 'the ?! is up over the stare');
    await api.shot('pond-boot-gush');
    // the last thing out: the tiny fish, flopping for the edge
    const flopK = BOOT_ARC + BOOT_TIP + BOOT_GUSH + 6;
    await api.step(flopK - gushK);
    const flop = await api.summary();
    assert(seat0(flop).state === 'boot' && seat0(flop).anim === 'bootPeer' && seat0(flop).count === 0, `the tiny fish flops out and away, and is not a catch (anim '${seat0(flop).anim}', count ${seat0(flop).count})`);
    await api.shot('pond-boot-tinyfish');
    await api.step(BOOT_FRAMES - flopK);
    const back = await api.summary();
    assert(seat0(back).state === 'idle' && seat0(back).count === 0 && back.top.total === 0, `the boot is lobbed back and the seat is idle with nothing in the bucket after ${BOOT_FRAMES} frames (${seat0(back).state}, count ${seat0(back).count})`);
    assert((await gagsUp(page)) > 0, 'SPLOSH! is up over the water it went back into');
    await api.step(6);
    await api.shot('pond-boot-splosh');
    // never two boots in a row: the next cast lands without one however the rng rolls
    await api.press(0, { action: true }, 1, 0);
    const w2 = await untilState(api, 'wait', 60);
    assert(seat0(w2).state === 'wait' && seat0(w2).boot === 0, `the cast after a boot is never a boot (boot ${seat0(w2).boot})`);
    await page.evaluate(() => { window.__game.game.screen.seats[0].big = 0; });   // and a trout: the big one is pondBigOne's
    await untilState(api, 'bite', 200);
    for (let i = 0; i < REEL_PRESSES; i++) await api.press(0, { action: true }, 1, 3);
    const h = await api.summary();
    assert(seat0(h).state === 'hooked' && seat0(h).count === 1, `and it lands (${seat0(h).state}, count ${seat0(h).count})`);
  });
};

/**
 * The big one's sequence (screens/pondGags.ts), from the twelfth tap: in the air, under the water, climbing out,
 * stood dripping with the frog (its RIBBIT, the fish leaving the paw, the fish into the bucket), shaking off.
 */
const BIG_FLY = 14, BIG_UNDER = 24, BIG_CLIMB = 26, BIG_STAND = 56, BIG_SHAKE = 30, RIBBIT_AT = 6, FISH_AT = 30, FISH_HOP = 10;
const BIG_FRAMES = BIG_FLY + BIG_UNDER + BIG_CLIMB + BIG_STAND + BIG_SHAKE;
const K_STAND = BIG_FLY + BIG_UNDER + BIG_CLIMB, K_LAND = K_STAND + FISH_AT + FISH_HOP, K_SHAKE = K_STAND + BIG_STAND;

/**
 * pondBigOne - the big one. Dealt by hand as the float lands (the same two fields the deal writes): the shadow
 *              circles (the tell), and the bite braces the critter with the rod that bends. Every tap drags it a
 *              step along the planks - drawn, never moved: the seat's x is its spot throughout - with the ! as it
 *              starts; the twelfth YANKS it in (a press now does nothing), SPLOOSH! lands with the card up and the
 *              big-one count up; it climbs back out pond-green with the lily pad and the frog (RIBBIT), the fish
 *              goes into the bucket - the count and the total +1 exactly, the fish counts - it shakes it off, and
 *              after BIG_FRAMES the seat is idle on its own spot with its rod and casts again. The cast after a big
 *              one is never a big one. Writes pond-bigone-shadow / -zip / -drag / -sploosh / -climb / -lilypad /
 *              -shake.
 */
SCENARIOS.pondBigOne = async (server) => {
  await withPage(server, 'skipTo=pond&critters=0,1', async (api, page) => {
    await api.step(5);
    const x0 = seat0(await api.summary()).x;
    await api.press(0, { action: true }, 1, 0);
    await untilState(api, 'wait', 60);
    await page.evaluate(() => { const s = window.__game.game.screen.seats[0]; s.big = 1; s.boot = 0; });
    await api.step(20);
    const tell = await api.summary();
    assert(seat0(tell).state === 'wait' && seat0(tell).big === 1 && seat0(tell).boot === 0, `the big one is dealt: its shadow circles the waiting float (state ${seat0(tell).state}, big ${seat0(tell).big})`);
    await api.shot('pond-bigone-shadow');
    const b = await untilState(api, 'bite', 200);
    assert(seat0(b).state === 'bite' && seat0(b).big === 1 && seat0(b).anim === 'bigReel' && seat0(b).weapon === 'bent', `it takes: the critter braces with the rod that bends (anim '${seat0(b).anim}', ${seat0(b).weapon})`);
    await api.step(4);
    await api.shot('pond-bigone-zip');

    // the wind-up: every tap is a turn of the reel AND a step toward the edge, and the ! goes up as it starts
    const cardsBefore = await gagsUp(page);
    await api.press(0, { action: true }, 1, 2);
    const t1 = await api.summary();
    assert(seat0(t1).state === 'bite' && seat0(t1).reel === 1 && seat0(t1).drag > 0, `the first tap reels and drags (reel ${seat0(t1).reel}, drag ${seat0(t1).drag})`);
    assert((await gagsUp(page)) > cardsBefore, 'the ! goes up as the drag starts');
    for (let i = 1; i < 6; i++) await api.press(0, { action: true }, 1, 2);
    const t6 = await api.summary();
    assert(seat0(t6).drag > seat0(t1).drag, `each tap drags it further (drag ${seat0(t1).drag} -> ${seat0(t6).drag})`);
    await api.shot('pond-bigone-drag');
    for (let i = 6; i < REEL_PRESSES - 1; i++) await api.press(0, { action: true }, 1, 2);
    const t11 = await api.summary();
    assert(seat0(t11).state === 'bite' && seat0(t11).reel === REEL_PRESSES - 1 && seat0(t11).x === x0, `eleven taps: still on, and the seat's own x never moved - the drag is drawn (reel ${seat0(t11).reel}, x ${seat0(t11).x} vs ${x0})`);

    // the twelfth: YANKED. Nothing is counted yet, and a press does nothing while it plays
    await api.press(0, { action: true }, 1, 0);
    const y = await api.summary();
    assert(seat0(y).state === 'big' && seat0(y).count === 0 && y.top.total === 0 && seat0(y).anim === 'yanked', `the twelfth tap yanks it off the jetty (state ${seat0(y).state}, anim '${seat0(y).anim}', count ${seat0(y).count})`);
    await api.press(0, { action: true }, 1, 0);
    const locked = await api.summary();
    assert(seat0(locked).state === 'big' && seat0(locked).t === BIG_FRAMES - 1, `a press in the air does nothing (state ${seat0(locked).state}, t ${seat0(locked).t})`);

    // SPLOOSH: the bang lands on the BIG_FLY'th frame with its card, and the big-one count goes up
    await api.step(BIG_FLY - 1);
    const sp = await api.summary();
    assert(sp.top.bigOnes === 1 && (await gagsUp(page)) > 0 && seat0(sp).count === 0, `SPLOOSH: the card is up and the big one counted (big ones ${sp.top.bigOnes}, count ${seat0(sp).count})`);
    assert(seat0(sp).weapon === 'none', `the rod went in with it (${seat0(sp).weapon})`);
    await api.step(8);
    await api.shot('pond-bigone-sploosh');

    // the look: it climbs back out, stands there pond-green with the lily pad and the frog, and the frog says RIBBIT
    const climbK = BIG_FLY + BIG_UNDER + 12;
    await api.step(climbK - BIG_FLY - 8);
    const cl = await api.summary();
    assert(seat0(cl).state === 'big' && seat0(cl).anim === 'climbOut', `it hauls itself back up onto its spot (anim '${seat0(cl).anim}')`);
    await api.shot('pond-bigone-climb');
    const ribbitK = K_STAND + RIBBIT_AT + 4;
    await api.step(ribbitK - climbK);
    const lp = await api.summary();
    assert(seat0(lp).anim === 'soaked' && seat0(lp).count === 0 && (await gagsUp(page)) > 0, `stood dripping with the fish in its paw, the frog's RIBBIT up (anim '${seat0(lp).anim}', count ${seat0(lp).count})`);
    await api.shot('pond-bigone-lilypad');

    // the fish goes in the bucket: +1, exactly, and it counts toward the round
    await api.step(K_LAND - ribbitK);
    const land = await api.summary();
    assert(seat0(land).count === 1 && land.top.total === 1 && seat0(land).anim === 'drip', `the big one goes in the bucket: +1 (count ${seat0(land).count}, total ${land.top.total}, anim '${seat0(land).anim}')`);

    // the shake, and the seat a player again on its own spot
    await api.step(K_SHAKE + 4 - K_LAND);
    const sh = await api.summary();
    assert(seat0(sh).anim === 'shakeOff', `it shakes the pond off (anim '${seat0(sh).anim}')`);
    await api.shot('pond-bigone-shake');
    await api.step(BIG_FRAMES - K_SHAKE - 4);
    const done = await api.summary();
    assert(seat0(done).state === 'idle' && seat0(done).drag === 0 && seat0(done).x === x0 && seat0(done).weapon === 'rod', `after ${BIG_FRAMES} frames it is back on its spot with its rod (state ${seat0(done).state}, x ${seat0(done).x}, ${seat0(done).weapon})`);
    assert(seat0(done).count === 1 && done.top.total === 1, `nothing lost and nothing extra: one fish (count ${seat0(done).count}, total ${done.top.total})`);
    await api.press(0, { action: true }, 1, 0);
    assert(seat0(await api.summary()).state === 'cast', 'and it casts again');
    const w2 = await untilState(api, 'wait', 60);
    assert(seat0(w2).state === 'wait' && seat0(w2).big === 0, `the cast after a big one is never a big one (big ${seat0(w2).big})`);
  });
};

/** game/minigame.js: the end sign slams in over 6 frames and hangs for the GDD's 60. */
const SIGN_SLAM = 6, SIGN_HOLD = 60;
