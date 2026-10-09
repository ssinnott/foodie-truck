// Playtest scenarios for Tangle Wood (registered in tools/scenarios/index.js).
//
//   wood          - two seats in the wood on the MUSHROOM SOUP order (?recipes=55): bumps are showing when the truck
//                   arrives and more lift on the spawn timer; seat 0 is stood at a showing bump and brushes it - +1,
//                   the bump gone; a press at bare litter is nothing. The jokes are held off (every toadstool and
//                   every vine cleared), so the rules never see one. Writes wood-brush.
//   woodToadstool - THE TOADSTOOL, forced by hand: brushed, it is two sniffs (the wind-up, stick locked), then the
//                   cloud and PEE-YOO! (a card up), the stagger back out of it (the sim walks the seat away), the
//                   toadstool sinking back into the litter, and the seat a player again - and no +1 anywhere.
//                   Writes wood-sniff, wood-stink and wood-pooh.
//   woodTangle    - THE TANGLE, forced by hand: the curl of vine lies beside a showing bump (the tell), seat 0 walks
//                   to it and brushes: no +1, the vine has the ankle (?!, stick locked); WHOOP! up the vine, upside
//                   down with the basket left on the litter; FLUMP! back down (the world bumps); up wearing leaves,
//                   shaken off, the basket back - and the find still there, +1 on the next brush. Then the deal over
//                   800 bumps, and the round ended mid-dangle. Writes wood-vine, wood-creep, wood-whoop, wood-dangle,
//                   wood-flump and wood-leaves.
import { withPage, assert } from '../playtest.js';

/** The screen's own numbers (screens/wood.ts, art/woodProps.ts), mirrored so a change to either side fails an assert. */
const LIFT_FRAMES = 20, BRUSH_FRAMES = 12, REACH = 34, DEAL_ROLL = 8;
/** THE TOADSTOOL: the sniff, the beat after it, the stagger back and the toadstool's stand-and-sink. */
const SNIFF_FRAMES = 20, POOH_FRAMES = 52, STINK_TOTAL = SNIFF_FRAMES + POOH_FRAMES, STAGGER_FRAMES = 30, STAGGER_STEP = 0.5, SINK_TOTAL = SNIFF_FRAMES + 14 + 20;
/** THE TANGLE's beats and the frames in at which each lands. */
const CREEP_FRAMES = 38, CREEP_REACH = 12, DANGLE_FRAMES = 52, FALL_FRAMES = 8, LIE_FRAMES = 16, GETUP_FRAMES = 10, STAND_FRAMES = 10, SHAKE_FRAMES = 20;
const YANK = CREEP_FRAMES, DROP = YANK + DANGLE_FRAMES, LAND = DROP + FALL_FRAMES, SHAKE = LAND + LIE_FRAMES + GETUP_FRAMES + STAND_FRAMES;
const TANGLE_TOTAL = SHAKE + SHAKE_FRAMES;
/** The bump the jokes are forced on; where seat 0 starts the tangle from (right of it, clear of the curl) and sniffs the toadstool from (left of it, so it shows). */
const BUMP_X = 300, START_X = 360, SNIFF_X = 276;
/** Frames until the HOW TO PLAY card (game/controlcard.ts) has slid away. */
const CARD_GONE = 250;
const BOOT = 'skipTo=wood&critters=0,1&recipes=55';
const seat0 = (s) => s.top.seats[0];
/** Cards up (game/gags.ts: the same module instance as the game's, since the URL is the same). */
const cardsUp = (page) => page.evaluate(async () => (await import('/src/game/gags.ts')).gagsUp());

/** Hold the finish line out of reach and the spawner off, so the beat is the only thing that can move a count. */
function holdRound(page) {
  return page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 6); sc.setTotal(sc.total); sc.nextSpawn = 100000; });
}

/** Clear the litter and lay ONE showing bump at BUMP_X, a toadstool or a vine beside it as asked: the deal's fields, by hand. */
function forceBump(page, kind) {
  return page.evaluate(([x, k]) => {
    const sc = window.__game.game.screen;
    for (const b of sc.bumps) b.active = false;
    const b = sc.bumps[0];
    b.active = true; b.x = x; b.lift = 20; b.show = 0; b.sink = 0; b.toadstool = k === 'toadstool' ? 1 : 0; b.vine = k === 'vine' ? 1 : 0;
  }, [BUMP_X, kind]);
}

/** Seat 0's joke state as the sim and its last draw hold it: the basket in the paw, and whether its head is below its feet. */
function rigOf(page) {
  return page.evaluate(async () => {
    const { jointScreen } = await import('/src/lib/art/rig.ts');
    const s = window.__game.game.screen.seats[0];
    const head = jointScreen(s.rig, 'head', { x: 0, y: 0 }), ankle = jointScreen(s.rig, 'ankleN', { x: 0, y: 0 });
    return { basket: s.rig.weapon ? 1 : 0, headY: Math.round(head.y), ankleY: Math.round(ankle.y), feetY: s.y };
  });
}

export const SCENARIOS = {
  async wood(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'wood' && s0.top.ing === 'mushroom' && s0.top.target > 0, `the wood is up as a mushroom visit (${s0.screen}, ${s0.top.ing}, target ${s0.top.target})`);
      assert(s0.top.bumps.length >= 3, `bumps are showing when the truck arrives (${s0.top.bumps.length})`);
      await holdRound(page);
      // the jokes have scenarios of their own: every toadstool and every vine off the litter, so the rules never see one
      await page.evaluate(() => { for (const b of window.__game.game.screen.bumps) { b.toadstool = 0; b.vine = 0; } });
      // a bump that is up: stand at it and brush
      const b = await page.evaluate(() => { const sc = window.__game.game.screen; const b = sc.bumps.find((b) => b.active); b.lift = 20; sc.seats[0].x = b.x + 4; return b.x; });
      await api.step(1);
      const before = await api.summary();
      await api.press(0, { action: true }, 1, 0);
      await api.step(3);
      const got = await api.summary();
      assert(seat0(got).count === seat0(before).count + 1 && got.top.total === before.top.total + 1, `brushing a showing bump is +1 (count ${seat0(got).count})`);
      assert(!got.top.bumps.some((x) => x[0] === b), `and the bump is gone from the litter`);
      assert(seat0(got).reachT > 0 && seat0(got).reachT <= BRUSH_FRAMES && seat0(got).anim === 'brush', `the crouch plays (reachT ${seat0(got).reachT}, anim '${seat0(got).anim}')`);
      assert(got.top.poohs === 0 && got.top.tangles === 0 && seat0(got).stinkT === 0 && seat0(got).tangleT === 0, `and no joke went off (poohs ${got.top.poohs}, tangles ${got.top.tangles})`);
      await api.shot('wood-brush');
      await api.step(BRUSH_FRAMES);
      // bare litter: nothing
      await page.evaluate(() => { const sc = window.__game.game.screen; for (const b of sc.bumps) b.active = false; });
      await api.press(0, { action: true }, 1, 2);
      const nothing = await api.summary();
      assert(nothing.top.total === got.top.total && seat0(nothing).reachT === 0, `a press at bare litter does nothing (total ${nothing.top.total})`);
      // a bump lifts on the timer and shows after LIFT_FRAMES
      await page.evaluate(() => { window.__game.game.screen.nextSpawn = 1; });
      await api.step(2);
      await page.evaluate(() => { for (const b of window.__game.game.screen.bumps) { b.toadstool = 0; b.vine = 0; } });
      const lifting = await api.summary();
      assert(lifting.top.bumps.length === 1 && lifting.top.bumps[0][1] < LIFT_FRAMES, `a new bump is lifting (${JSON.stringify(lifting.top.bumps)})`);
      await api.step(LIFT_FRAMES);
      const up = await api.summary();
      assert(up.top.bumps.length === 1 && up.top.bumps[0][1] === LIFT_FRAMES, `and shows after ${LIFT_FRAMES} frames`);
    });
  },

  async woodToadstool(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      await holdRound(page);
      await forceBump(page, 'toadstool');
      await api.step(CARD_GONE);
      await page.evaluate((x) => { window.__game.game.screen.seats[0].x = x; }, SNIFF_X);
      await api.step(1);
      // THE WIND-UP: the brush finds a toadstool - no +1, the sniffs, and the toadstool stands there (it cannot be brushed again)
      await api.press(0, { action: true }, 1, 0);
      await api.step(2);
      const p = await api.summary();
      assert(p.top.poohs === 1 && seat0(p).count === 0 && p.top.total === 0, `brushing the toadstool is no +1 (poohs ${p.top.poohs}, count ${seat0(p).count})`);
      assert(seat0(p).stinkT === STINK_TOTAL - 2 && seat0(p).anim === 'sniff', `the sniff plays (stinkT ${seat0(p).stinkT}, anim '${seat0(p).anim}')`);
      assert(p.top.bumps.length === 1 && p.top.bumps[0][2] === 1 && p.top.bumps[0][4] === SINK_TOTAL - 2, `the toadstool stands, sinking (${JSON.stringify(p.top.bumps)})`);
      const x0 = seat0(p).x;
      await api.hold(0, { right: true });
      await api.step(4);
      await api.release(0);
      assert(seat0(await api.summary()).x === x0, 'the stick does nothing through the sniff');
      await api.shot('wood-sniff');
      // THE BANG: the cloud, PEE-YOO!, and the reel back
      await api.step(SNIFF_FRAMES - 6 + 2);
      const bang = await api.summary();
      assert(seat0(bang).anim === 'pooh' && (await cardsUp(page)) >= 1, `PEE-YOO! goes up as the cloud comes out (anim '${seat0(bang).anim}', cards ${await cardsUp(page)})`);
      await api.step(6);
      await api.shot('wood-stink');
      // the LOOK: staggering back out of the smell, walked by the sim, gone green, the stink lines coming off it
      await api.step(14);
      await api.shot('wood-pooh');
      await api.step(STAGGER_FRAMES - 14);
      const back = await page.evaluate(() => window.__game.game.screen.seats[0].x);
      assert(back === x0 - STAGGER_FRAMES * STAGGER_STEP, `it staggers back out of the cloud (x ${x0} -> ${back})`);
      const sunk = await api.summary();
      assert(sunk.top.bumps.length === 0, `and the toadstool has sunk back into the litter (${JSON.stringify(sunk.top.bumps)})`);
      // shaken off: the seat is a player again, and nothing was lost or scored
      await api.step(STINK_TOTAL);
      const fine = await api.summary();
      assert(seat0(fine).stinkT === 0 && seat0(fine).anim === 'carry', `then it shakes its head and carries on (stinkT ${seat0(fine).stinkT}, anim '${seat0(fine).anim}')`);
      assert(seat0(fine).count === 0 && fine.top.total === 0 && fine.top.poohs === 1, `nothing scored, nothing lost (count ${seat0(fine).count}, total ${fine.top.total})`);
      await api.hold(0, { right: true });
      await api.step(4);
      await api.release(0);
      assert(seat0(await api.summary()).x > seat0(fine).x, 'and the stick works again');
    });
  },

  async woodTangle(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      await holdRound(page);
      await forceBump(page, 'vine');
      // past the HOW TO PLAY card (up 210 frames, then it slides away), so the shots show the canopy the vine hangs from
      await api.step(CARD_GONE);
      await page.evaluate((x) => { const sc = window.__game.game.screen; sc.seats[0].x = x; sc.seats[0].facing = -1; sc.seats[1].x = 560; }, START_X);
      await api.step(2);
      // THE TELL: a curl of vine in the leaves beside a showing bump
      const tell = await api.summary();
      assert(tell.top.bumps.length === 1 && tell.top.bumps[0][1] === LIFT_FRAMES && tell.top.bumps[0][3] === 1 && tell.top.bumps[0][2] === 0, `a showing bump with a vine beside it and no toadstool (${JSON.stringify(tell.top.bumps)})`);
      await api.shot('wood-vine');
      // walk to it on the stick, the way a player would
      await api.hold(0, { left: true });
      for (let i = 0; i < 40 && Math.abs(seat0(await api.summary()).x - BUMP_X) > REACH - 10; i++) await api.step(2);
      await api.release(0);
      await api.step(2);
      const at = await api.summary();
      assert(Math.abs(seat0(at).x - BUMP_X) <= REACH, `seat 0 walked up to the bump (x ${seat0(at).x})`);
      // THE WIND-UP: the brush finds the vine, which has the ankle - no +1, ?!, the stick locked
      await api.press(0, { action: true }, 1, 0);
      const snag = await api.summary();
      assert(snag.top.tangles === 1 && seat0(snag).tangleT === TANGLE_TOTAL && seat0(snag).anim === 'snagged', `the vine has the ankle (tangles ${snag.top.tangles}, tangleT ${seat0(snag).tangleT}, anim '${seat0(snag).anim}')`);
      assert(seat0(snag).count === 0 && snag.top.total === 0, `and it is no +1 (count ${seat0(snag).count}, total ${snag.top.total})`);
      assert(snag.top.bumps.length === 1 && snag.top.bumps[0][3] === 0 && snag.top.bumps[0][1] === LIFT_FRAMES, `the vine is gone from the litter and the find is still showing (${JSON.stringify(snag.top.bumps)})`);
      assert((await cardsUp(page)) >= 1, 'the ?! bubble goes up');
      // from here every step is counted in frames into the joke: `to(t)` steps on to frame t of it
      let now = 0;
      const to = async (t) => { await api.step(t - now); now = t; };
      const xs = seat0(snag).x;
      await api.hold(0, { right: true });
      await to(4);
      await api.release(0);
      assert(seat0(await api.summary()).x === xs, 'the stick does nothing while the vine has hold');
      await to(CREEP_REACH + 2);
      await api.shot('wood-creep');
      // THE BANG: WHOOP! up the vine, the basket left on the litter
      await to(YANK + 1);
      const whoop = await api.summary();
      assert(seat0(whoop).anim === 'dangle' && seat0(whoop).basket === 0, `WHOOP: hauled up the vine, the basket left behind (anim '${seat0(whoop).anim}', basket ${seat0(whoop).basket})`);
      assert((await cardsUp(page)) >= 1, 'the WHOOP! card is up');
      // shot once the ?! bubble (up since the brush) has gone and the WHOOP! has popped to full size
      await to(YANK + 8);
      await api.shot('wood-whoop');
      await to(YANK + 24);
      const hang = await rigOf(page);
      assert(hang.headY > hang.ankleY && hang.ankleY < hang.feetY - 60, `it hangs upside down by the ankle, well off the litter (head row ${hang.headY}, ankle row ${hang.ankleY}, lane ${hang.feetY})`);
      await api.shot('wood-dangle');
      // the vine lets go: FLUMP! on the landing frame, and the world bumps
      await to(LAND);
      const flump = await api.summary();
      const shake = await page.evaluate(async () => (await import('/src/game/gags.ts')).gagShakeY());
      assert(seat0(flump).anim === 'flump' && seat0(flump).tangleT === TANGLE_TOTAL - LAND, `FLUMP: down into the litter (anim '${seat0(flump).anim}', tangleT ${seat0(flump).tangleT})`);
      assert(shake !== 0 && (await cardsUp(page)) >= 1, `the FLUMP! card is up and the world bumps (shake ${shake})`);
      await to(LAND + 3);
      await api.shot('wood-flump');
      // THE LOOK: up again wearing the leaves, then shaken off; the basket picked back up
      await to(LAND + LIE_FRAMES + GETUP_FRAMES + 4);
      const look = await rigOf(page);
      assert(look.headY < look.ankleY, `stood up again (head row ${look.headY}, ankle row ${look.ankleY})`);
      await api.shot('wood-leaves');
      await to(SHAKE + 2);
      assert(seat0(await api.summary()).anim === 'shakeOff', 'it shakes the leaves off');
      await to(TANGLE_TOTAL + 2);
      const fine = await api.summary();
      assert(seat0(fine).tangleT === 0 && seat0(fine).basket === 1 && seat0(fine).anim === 'carry', `then it picks up the basket and carries on (tangleT ${seat0(fine).tangleT}, basket ${seat0(fine).basket}, anim '${seat0(fine).anim}')`);
      assert(seat0(fine).count === 0 && fine.top.total === 0 && fine.top.bumps.length === 1, `nothing scored and nothing lost: the find is still there (count ${seat0(fine).count}, ${JSON.stringify(fine.top.bumps)})`);
      // the next brush takes the find
      await api.press(0, { action: true }, 1, 3);
      const got = await api.summary();
      assert(seat0(got).count === 1 && got.top.total === 1 && got.top.bumps.length === 0 && got.top.tangles === 1, `and the next brush takes it, +1 (count ${seat0(got).count}, total ${got.top.total})`);

      // THE DEAL: one roll per bump, a toadstool one time in DEAL_ROLL and a vine one time in DEAL_ROLL, never both
      const deal = await page.evaluate((n) => {
        const sc = window.__game.game.screen, out = { toadstool: 0, vine: 0, both: 0 };
        for (let i = 0; i < n; i++) {
          for (const b of sc.bumps) b.active = false;
          sc.lay(300, 0);
          const b = sc.bumps[0];
          out.toadstool += b.toadstool; out.vine += b.vine; if (b.toadstool && b.vine) out.both++;
        }
        for (const b of sc.bumps) b.active = false;
        return out;
      }, 800);
      const lo = (800 / DEAL_ROLL) * 0.6, hi = (800 / DEAL_ROLL) * 1.4;
      assert(deal.both === 0 && deal.toadstool > lo && deal.toadstool < hi && deal.vine > lo && deal.vine < hi, `the deal over 800 bumps: about 1 in ${DEAL_ROLL} each, never both (${JSON.stringify(deal)})`);

      // the round can end mid-joke: finish() stops the vine and hands the basket back
      await api.step(BRUSH_FRAMES);
      await forceBump(page, 'vine');
      await page.evaluate((x) => { window.__game.game.screen.seats[0].x = x; }, BUMP_X);
      await api.press(0, { action: true }, 1, YANK + 10);
      assert(seat0(await api.summary()).anim === 'dangle', 'a second tangle, hanging');
      await page.evaluate(() => window.__game.game.screen.finish());
      await api.step(2);
      const end = await api.summary();
      assert(end.top.phase === 1 && seat0(end).tangleT === 0 && seat0(end).basket === 1 && seat0(end).anim === 'cheer', `the round ends mid-dangle: the vine lets go and the basket is back (phase ${end.top.phase}, tangleT ${seat0(end).tangleT}, basket ${seat0(end).basket}, anim '${seat0(end).anim}')`);
    });
  },
};
