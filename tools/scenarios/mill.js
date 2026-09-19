// Playtest scenarios for the mill work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   mill - four seats in Windle Mill on the HONEY LOAF order (the first order that asks for flour, so the screen
//          takes its target from the order line and run.gather has a line to bank into):
//            * the screen is up with four seats, four chutes and a target from the order;
//            * 300 frames of seat 0 running left and right through api.hold - it moved, stayed inside the floor,
//              and the three seats with no input stayed exactly where they were put;
//            * the ONE RULE, driven by hand: with a chute forced to POUR and seat 0 stood under it, holding action
//              raises the fill (a dead FILL_RATE or a dead catch test fails here), the brim ties the sack off BY
//              ITSELF while the button is still down (+1, banked in the party's total), a release under the brim
//              keeps the part fill, and a hold that goes on and on just fills the next sack - nothing bursts. The
//              same hold with the chute dormant fills nothing, which is the assert that catches a fill that forgot
//              to check the chute;
//            * the finish line brought down to the party's total: the FLOUR sign drops with that total on it, is held,
//              the screen hands back to the map and run.gather('flour') has moved the order's flour line.
//          Writes tools/screens/mill-fill.png (a sack in the brim band under a pouring chute - the shot the
//          "nearly full" read is judged from).
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** The screen's own numbers, restated here so a change to either side shows up as a failing assert, not a silent pass. */
const FILL_RATE = 1 / 90, FULL = 1, BRIM_AT = 0.65, TIE_FRAMES = 18;
/** Frames of holding that land the sack inside the brim band: 75/90 = 0.833, comfortably between 0.65 and 1. */
const TO_BRIM = 75;
/** ...and from there to the brim (90/90), where the sack ties itself off; plus one so the test never sits on the edge. */
const TO_FULL = 16;
/** A long hold from empty: a tie at 90, the tie beat, and a good way into the next sack. Nothing bursts. */
const LONG_HOLD = 150;

/**
 * Stand seat 0 under chute `ci` with an empty sack and that chute pouring, and switch everything else off: no more
 * spouts wake, no other chute is live, and the target is held out of reach so a +1 cannot end the round in the
 * middle of the beat (run.gather clamps to the order's own line, so the bank assert still reads the real target).
 * `pouring` false leaves the chute DORMANT, which is how the negative case is set up. Costs one step.
 */
async function stage(api, page, ci, pouring) {
  const before = await page.evaluate(([i, on]) => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    sc.wake = 100000;
    for (const c of sc.chutes) { c.state = 0; c.t = 0; c.seat = -1; }
    // the chute is put on the LAST frame of its telegraph, not straight into POURING with a made-up timer: one
    // step then gives it the screen's own POUR_FRAMES, so the test never invents a state the sim cannot reach
    if (on) { sc.chutes[i].state = 1; sc.chutes[i].t = 1; }
    s.x = sc.summary().chutes[i][3]; s.facing = 1; s.moving = false;
    s.fill = 0; s.bumpT = 0; s.tieT = 0; s.chute = -1; s.sneezeT = 0; s.sneezeDue = 0;
    sc.target = Math.max(sc.target, sc.total + 4); sc.setTotal(sc.total);
    return { count: s.count, total: sc.total, target: sc.target };
  }, [ci, pouring]);
  await api.step(1);
  return before;
}

/** Seat 0 as the sim holds it (summary only carries the rounded fill). */
function seat0(page) {
  return page.evaluate(() => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    return { x: s.x, fill: s.fill, count: s.count, bumpT: s.bumpT, tieT: s.tieT, anim: s.anim, chute: s.chute, total: sc.total, tied: sc.tied, sneezeT: s.sneezeT, sneezes: sc.sneezes };
  });
}

/** The sneeze (screens/mill.ts): the wind-up, and the whole beat. */
const SNEEZE_UP = 24, SNEEZE_FRAMES = 36;

export const SCENARIOS = {
  /**
   * millSneeze - the joke: a tie with the sneeze due. The tie beat plays out, then the wind-up (sneezeT 36, the
   *              stick locked), the ACHOO at 24 frames in (sneezes 1), and the seat is live again after 36 with
   *              the fresh sack untouched (fill 0, count kept). Writes mill-sneeze.
   */
  async millSneeze(server) {
    await withPage(server, 'skipTo=mill&critters=0,1&order=4', async (api, page) => {
      await api.step(2);
      const before = await stage(api, page, 1, true);
      await page.evaluate(() => { window.__game.game.screen.seats[0].fill = 0.99; });
      await api.hold(0, { action: true });
      await api.step(1);
      await api.release(0);
      const tied = await seat0(page);
      assert(tied.count === before.count + 1 && tied.tieT > 0, `the sack tied (count ${tied.count}, tieT ${tied.tieT})`);
      await page.evaluate(() => { window.__game.game.screen.seats[0].sneezeDue = 1; });
      await api.step(tied.tieT);
      const up = await seat0(page);
      assert(up.sneezeT === SNEEZE_FRAMES && up.sneezes === 1 && up.anim === 'sneezeUp', `the wind-up starts as the tie beat ends (sneezeT ${up.sneezeT}, anim '${up.anim}')`);
      // the stick is locked through it
      await api.hold(0, { right: true }); await api.step(SNEEZE_UP + 2); await api.release(0);
      const ach = await seat0(page);
      assert(ach.x === up.x && ach.anim === 'achoo', `ACHOO, and the seat has not moved (x ${up.x} -> ${ach.x}, anim '${ach.anim}')`);
      await api.shot('mill-sneeze');
      await api.step(SNEEZE_FRAMES - SNEEZE_UP);
      const after = await seat0(page);
      assert(after.sneezeT === 0 && after.fill === 0 && after.count === tied.count, `over, with the fresh sack untouched (sneezeT ${after.sneezeT}, fill ${after.fill}, count ${after.count})`);
    });
  },
  async mill(server) {
    // order=4 is HONEY LOAF (content/recipes.js ORDERS index 3): FLOUR 3 + HONEY 2. Without it the boot order is
    // APPLE PIE, the screen falls back to a target of 3 and run.gather('flour') has nothing to bank into.
    await withPage(server, 'skipTo=mill&critters=0,1,2,3&order=4', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'mill', `the mill is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4 && s0.top.target > 0, `four seats and a target from the order (${s0.top.seats.length} seats, target ${s0.top.target})`);
      assert(s0.top.chutes.length === 4, `four chutes along the back wall (${s0.top.chutes.length})`);
      assert((s0.run.needs || []).some((n) => n.startsWith('flour:')), `the order asks for flour (${JSON.stringify(s0.run.needs)})`);
      const x0 = s0.top.seats[0][1], others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => s[1]));

      // 300 frames of real input on seat 0: left, then right past where it started. `last` only ever holds a MILL
      // summary - once the round hands off, api.summary() is the map's.
      let ended = false, last = s0;
      for (const [keys, n] of [[{ left: true }, 100], [{ right: true }, 200]]) {
        await api.hold(0, keys);
        for (let k = 0; k < n && !ended; k += 50) {
          await api.step(50);
          const s = await api.summary();
          if (s.screen !== 'mill') ended = true; else last = s;
        }
        await api.release(0);
      }
      assert(!ended, 'the round is still running after 300 frames of walking');
      const x1 = last.top.seats[0][1];
      assert(x1 !== x0 && x1 >= 34 && x1 <= 606, `seat 0 walked and stayed on the floor (${x0} -> ${x1})`);
      assert(JSON.stringify(last.top.seats.slice(1).map((s) => s[1])) === others0, 'the other seats, with no input, stayed put');
      // 303 frames: main.js boots test mode with one step, then 2 + 300 here
      assert(last.top.elapsed === 303, `the clock counted every frame (elapsed ${last.top.elapsed})`);

      // --- the rule, part one: a chute that is NOT pouring fills nothing, however hard action is held
      await stage(api, page, 1, false);
      await api.hold(0, { action: true });
      await api.step(TO_BRIM);
      await api.release(0);
      const dry = await seat0(page);
      assert(dry.fill === 0 && dry.chute === -1, `holding under a DORMANT chute fills nothing (fill ${dry.fill})`);

      // --- part two: under a pouring chute the sack fills, and the brim band is where the shot is taken
      const before = await stage(api, page, 1, true);
      await api.hold(0, { action: true });
      await api.step(TO_BRIM);
      const brim = await seat0(page);
      assert(brim.chute === 1, `standing under the pouring chute registers it (chute ${brim.chute})`);
      assert(brim.fill > BRIM_AT && brim.fill < FULL,
        `${TO_BRIM} frames of hold puts the sack in the brim band (fill ${brim.fill.toFixed(3)}, band ${BRIM_AT}..${FULL})`);
      assert(Math.abs(brim.fill - TO_BRIM * FILL_RATE) < 0.02, `and it filled at FILL_RATE (${brim.fill.toFixed(3)} vs ${(TO_BRIM * FILL_RATE).toFixed(3)})`);
      // one shot carrying both reads: seat 0 in the brim band (green tie, green on the tag) beside seat 2 just
      // started (its own colour on the tag) - and the gold, which belongs to the pouring chute alone, on the spouts
      await api.hold(2, { action: true });
      await page.evaluate(() => {
        const sc = window.__game.game.screen, s = sc.seats[2];
        sc.chutes[3].state = 2; sc.chutes[3].t = 90;
        s.x = sc.summary().chutes[3][3]; s.facing = 1; s.moving = false; s.fill = 0.3;
      });
      await api.step(1);
      await api.shot('mill-fill');
      await api.release(2);
      await page.evaluate(() => { const s = window.__game.game.screen.seats[2]; s.fill = 0; s.chute = -1; });

      // --- part three: the brim ties the sack off by itself, with the button still down
      await api.step(TO_FULL);
      const tied = await seat0(page);
      assert(tied.count === before.count + 1, `reaching the brim ties the sack off without a release (seat 0 ${before.count} -> ${tied.count})`);
      assert(tied.total === before.total + 1, `and the party's total went up with it (${before.total} -> ${tied.total})`);
      assert(tied.fill === 0 && tied.tieT > 0 && tied.anim === 'tie', `a fresh empty sack and the tie beat (fill ${tied.fill}, tieT ${tied.tieT}, anim '${tied.anim}')`);
      await page.evaluate(() => { window.__game.game.screen.seats[0].sneezeDue = 0; });   // the sneeze has a scenario of its own
      await api.release(0);
      await api.step(TIE_FRAMES + 2);

      // --- part four: a release UNDER the brim keeps the part fill instead of scoring
      const partBefore = await stage(api, page, 1, true);
      await api.hold(0, { action: true });
      await api.step(20);
      await api.release(0);
      await api.step(2);
      const part = await seat0(page);
      assert(part.count === partBefore.count && part.fill > 0 && part.fill < FULL,
        `releasing under the brim keeps the part-filled sack and scores nothing (count ${part.count}, fill ${part.fill.toFixed(3)})`);

      // --- part five: a long hold never bursts - it ties one sack and starts on the next
      const longBefore = await stage(api, page, 1, true);
      // a pour is 110 frames and the first sack and its tie beat take 108 of them: keep this spout going so the
      // hold has something to fill the second sack from
      await page.evaluate(() => { window.__game.game.screen.chutes[1].t = 400; });
      await api.hold(0, { action: true });
      await api.step(LONG_HOLD);
      const long = await seat0(page);
      await api.release(0);
      assert(long.count === longBefore.count + 1 && long.total === longBefore.total + 1,
        `${LONG_HOLD} frames of hold tie one sack (seat 0 ${longBefore.count} -> ${long.count}, total ${longBefore.total} -> ${long.total})`);
      assert(long.fill > 0 && long.fill < FULL, `and the next sack is part way there (fill ${long.fill.toFixed(3)})`);
      assert(long.bumpT === 0 && long.anim !== 'bump', `nothing burst (bumpT ${long.bumpT}, anim '${long.anim}')`);
      await api.step(5);

      // --- the ending: bring the finish line down to the party's total (there is no clock to force), expect the sign,
      // the hold, then the map and the bank
      const lastMill = await api.summary();
      assert(lastMill.top.total >= 1, `something was filled before the ending (total ${lastMill.top.total})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'mill' && s2.top.phase === 1 && s2.top.sign === 'FLOUR: ' + lastMill.top.total,
        `the target was reached: the FLOUR sign is up with the party's total (phase ${s2.top.phase}, '${s2.top.sign}')`);
      await api.step(HOLD);
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the mill hands back to the map (on ${s3.screen})`);
      // the target the ORDER asked for, not the screen's (stage() lifts the screen's so it cannot end early)
      const total = lastMill.top.total, target = s0.top.target;
      const line = (s3.run.needs || []).find((n) => n.startsWith('flour:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(total, target), `run.gather('flour') banked the party's total (${line}, total ${total})`);
    });
  },
};
