// Playtest scenarios for Cockle Cove's beach (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   beach - four seats on the sand on the CRAB CAKES order, so the target is the order's own crab line and not the
//           fallback. Then, in order:
//             THE STRAND   the truck arrives to crabs already on the sand (QUARRY.crab.seed of them, coming up out
//                          of their burrows), and a crab RUNS: its x changes on its own.
//             THE DART     seat 0 is walked at the nearest crab with the stick; the crab darts AWAY from it (its
//                          direction is away from the seat and it is in its dart) and then stops, tired, with its
//                          claws up.
//             THE GRAB     `action` with the tired crab under the critter takes it: the crab is gone from the
//                          strand, the seat's count and the party's total are up by one, the pounce beat plays.
//             NOTHING      `action` on empty sand does nothing at all.
//             THE HAND-OFF the finish line is brought down to the party's total: the CRABS sign drops, is held, and the screen
//                          hands back to the map with the order's crab line updated.
//           Shots: tools/screens/beach-dart.png (the crab darting), beach-grab.png (mid-pounce) and beach-sign.png.
//   beachSalt - two seats on the SALT PRETZELS order: the visit is for salt, the pans fill and crust on their
//           timer, a pan still crusting cannot be scraped, a crusted one can.
//   beachPinch, beachWave, beachGull - the cove's three jokes (screens/beachGags.ts), each forced by hand through the
//           fields its deal sets and walked beat by beat; the rules scenarios above hold all three off.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** ?recipes=10 fixes the menu to ORDERS[10], CRAB CAKES: crab 3 + egg 1, so `crab` is a real line on the ticket. */
const BOOT = 'skipTo=beach&critters=0,1,2,3&recipes=10';
/** ?recipes=12 is ORDERS[12], SALT PRETZELS: flour 3 + salt 1 + butter 1. */
const BOOT_SALT = 'skipTo=beach&critters=0,1&recipes=12';
/** The screen's own numbers, mirrored here so a change to either side shows up as a failing assert. */
const POUNCE_FRAMES = 12, DART_R = 46, DART_FRAMES = 14, TIRED_FRAMES = 36, CRUST = 90, PAN_X = [96, 258, 396, 552];
/** The jokes (screens/beachGags.ts). The pinch: the clamp, then a leg off and a leg back, and the second OW. */
const PINCH_CLAMP = 8, PINCH_LEG = 32, PINCH_FRAMES = PINCH_CLAMP + PINCH_LEG * 2, PINCH_YELL = 54;
/** The seventh wave: the sea drawing back, the rush (the crash on its last frame), sat in the wet, getting up. */
const DRAW_FRAMES = 60, RUSH_FRAMES = 10, SIT_FRAMES = 60, GETUP_FRAMES = 12, WAVE_TOTAL = DRAW_FRAMES + RUSH_FRAMES + SIT_FRAMES + GETUP_FRAMES;
/** The gull: its glide in, how long it watches, its flight off; and the snatch's beats, counted from the grab. */
const ARRIVE_FRAMES = 48, GULL_WATCH = 300, LEAVE_FRAMES = 40;
const SEE = 14, SNATCH = 28, SPIN = 18, BONK = 96, LAND = 108, SHAKE = 124, SNATCH_TOTAL = 134;

/** Hold the finish line out of reach so a +1 can never end the round mid-test (run.gather still clamps to the order). */
function holdTarget(page) {
  // ...and hold the jokes off: the wave and the gull each lock seats for over two seconds, and the beats under test
  // count frames (the gull is AWAY, 0, until a test brings it in)
  return page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 6); sc.setTotal(sc.total); sc.waveIn = 100000; if (sc.gullState === 0) sc.gullT = 100000; });
}
/** The strand's things as the sim holds them. */
function things(page) {
  return page.evaluate(() => window.__game.game.screen.things.map((t) => ({ active: t.active, x: t.x, dir: t.dir, state: t.state, t: t.t, dartT: t.dartT, cool: t.cool })));
}
const nearest = (ts, x) => { let b = -1, bd = 1e9; for (let i = 0; i < ts.length; i++) { if (!ts[i].active) continue; const d = Math.abs(ts[i].x - x); if (d < bd) { bd = d; b = i; } } return b; };
/** How many word cards are up (game/gags.ts): the same module instance the game draws from, since the URL is the same. */
function cardsUp(page) { return page.evaluate(async () => (await import('/src/game/gags.ts')).gagsUp()); }
/** The world's bump this frame (game/gags.ts gagShakeY). */
function shakeY(page) { return page.evaluate(async () => (await import('/src/game/gags.ts')).gagShakeY()); }
/** Bring the gull in and settle it on its post: it glides in for ARRIVE_FRAMES and lands watching. */
async function gullIn(api, page) {
  await page.evaluate(() => { const sc = window.__game.game.screen; sc.gullState = 0; sc.gullT = 1; });
  await api.step(1 + ARRIVE_FRAMES);
}
/** Clear the strand down to one crab, STOPPED and tired at `x` (it will not dart for a while), and nothing coming. */
function oneTiredCrab(page, x) {
  return page.evaluate((cx) => {
    const sc = window.__game.game.screen, i = sc.things.findIndex((t) => t.active);
    sc.nextSpawn = 100000;
    for (const o of sc.things) if (o !== sc.things[i]) o.active = false;
    const t = sc.things[i];
    t.active = true; t.state = 2; t.t = 500; t.cool = 500; t.dartT = 0; t.dir = 1; t.x = cx; t.life = 5000;
    return i;
  }, x);
}
/**
 * A beat's own clock: the page is on frame 0 of it now (the frame its first event landed on), and `at(n)` steps on
 * to frame n of it, so every check below reads as "n frames into the beat" and mirrors the screen's constants.
 */
function beat(api) {
  let k = 0;
  return async (n) => { if (n < k) throw new Error(`beat: frame ${n} is behind ${k}`); if (n > k) await api.step(n - k); k = n; };
}

export const SCENARIOS = {
  /**
   * beachPinch - the pinch: a crab still running is grabbed. It grabs back: no +1, the crab is 'held' on the paw,
   *              the seat is CLAMPED (OW! card up) for PINCH_CLAMP frames, then runs round - off one way and back,
   *              its x moving while the stick does nothing - with a second OW (a bubble) as the first card goes; then
   *              the crab drops to the sand beside the seat, stopped and tired, the seat is back where it was
   *              grabbed, and the next grab takes the crab. Writes beach-pinch-clamp and beach-pinch.
   */
  async beachPinch(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      await holdTarget(page);
      const c = await page.evaluate(() => {
        const sc = window.__game.game.screen, i = sc.things.findIndex((t) => t.active), t = sc.things[i];
        sc.nextSpawn = 100000;
        for (const o of sc.things) if (o !== t) o.active = false;
        t.state = 1; t.t = 300; t.dartT = 0; t.cool = 500; t.dir = 1; t.x = 300;
        sc.seats[0].x = 306; sc.seats[1].x = 560;
        return i;
      });
      await api.press(0, { action: true }, 1, 0);
      const at = beat(api);   // frames since the clamp
      await at(1);
      const p = await api.summary();
      assert(p.top.pinches === 1 && p.top.seats[0].count === 0 && p.top.total === 0, `a running crab grabs back (pinches ${p.top.pinches}, count ${p.top.seats[0].count})`);
      assert(p.top.seats[0].pinchT === PINCH_FRAMES - 1 && p.top.seats[0].anim === 'clamped', `the seat is clamped (pinchT ${p.top.seats[0].pinchT}, anim '${p.top.seats[0].anim}')`);
      assert((await cardsUp(page)) >= 1, `OW!: the clamp's card is up (${await cardsUp(page)})`);
      let ts = await things(page);
      assert(ts[c].active && ts[c].state === 4, `the crab is on the paw (state ${ts[c].state})`);
      const x0 = p.top.seats[0].x;
      await at(4);
      await api.shot('beach-pinch-clamp');
      // the run-around: the stick is held right and does nothing; the seat runs anyway, off and back
      await api.hold(0, { right: true });
      await at(PINCH_CLAMP + 12);
      const run = (await api.summary()).top.seats[0];
      assert(run.anim === 'pinchRun' && run.x !== x0, `then it runs round with the crab on the paw (anim '${run.anim}', x ${x0} -> ${run.x})`);
      await api.shot('beach-pinch');
      await api.release(0);
      // the OW! card (a burst is up 56 frames) is on its last frame of shrinking away as the bubble pops
      await at(PINCH_YELL + 1);
      assert((await cardsUp(page)) === 2, `OW! OW!: a bubble comes up as the first card goes (${await cardsUp(page)} cards)`);
      await at(PINCH_FRAMES);
      ts = await things(page);
      const s = (await api.summary()).top.seats[0];
      assert(s.pinchT === 0 && ts[c].active && ts[c].state === 2 && ts[c].cool > 0 && Math.abs(ts[c].x - s.x) <= 24, `the crab drops beside the seat, tired (state ${ts[c].state}, cool ${ts[c].cool}, x ${ts[c].x} vs seat ${s.x})`);
      assert(Math.abs(s.x - x0) <= 1, `and the run has brought the seat back where it was grabbed (x ${x0} -> ${s.x})`);
      await page.evaluate((x) => { window.__game.game.screen.seats[0].x = x; }, ts[c].x);
      await api.press(0, { action: true }, 1, 0);
      const got = await api.summary();
      assert(got.top.seats[0].count === 1, `and the next grab takes it (count ${got.top.seats[0].count})`);
    });
  },
  /**
   * beachWave - the seventh wave, brought in by hand. THE TELL: the sea draws back, and everyone stops and stares
   *             (waves 1, wetT WAVE_TOTAL on every seat, anim lookOut, a '!' over every head, the stick locked) - and a
   *             gull watching from the post leaves it. THE BANG: the wave lands (SPLOOSH! card, the world bumps),
   *             everyone flung onto their bottoms; THE LOOK: sat in the wet; then everyone gets up, the stick works,
   *             and nothing was lost. A gull due to land while the wave runs waits for it to be over. Writes
   *             beach-wave-draw, beach-wave-sploosh and beach-wave-sit.
   */
  async beachWave(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      await holdTarget(page);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.seats[0].x = 200; sc.seats[1].x = 300; sc.seats[2].x = 400; sc.seats[3].x = 500; });
      await gullIn(api, page);
      assert((await api.summary()).top.gull === 'watch', 'a gull is watching from the post when the wave comes');
      await page.evaluate(() => { window.__game.game.screen.waveIn = 1; });
      await api.step(1);
      const at = beat(api);   // frames since the sea began to draw back
      const w = await api.summary();
      assert(w.top.waves === 1 && w.top.waveT === WAVE_TOTAL && w.top.seats.every((s) => s.wetT === WAVE_TOTAL && s.anim === 'lookOut'), `the sea draws back and everyone stops to stare (waves ${w.top.waves}, waveT ${w.top.waveT}, wetT ${w.top.seats.map((s) => s.wetT).join()}, anims ${w.top.seats.map((s) => s.anim).join()})`);
      assert((await cardsUp(page)) >= w.top.seats.length, `'!' over every head (${await cardsUp(page)} cards)`);
      assert(w.top.gull === 'leave', `and the gull leaves its post (${w.top.gull})`);
      const x0 = w.top.seats[0].x;
      await api.hold(0, { right: true }); await at(12); await api.release(0);
      const mid = await api.summary();
      assert(mid.top.seats[0].x === x0, `the stick does nothing while the sea draws back (x ${x0} -> ${mid.top.seats[0].x})`);
      // a gull comes due while the wave runs
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.gullState = 0; sc.gullT = 2; });
      await at(DRAW_FRAMES - 15);
      await api.shot('beach-wave-draw');
      await at(DRAW_FRAMES + RUSH_FRAMES);
      const hit = await api.summary();
      assert(hit.top.waveT === SIT_FRAMES + GETUP_FRAMES && hit.top.seats.every((s) => s.anim === 'splooshed'), `the wave lands and flings everyone down (waveT ${hit.top.waveT}, anims ${hit.top.seats.map((s) => s.anim).join()})`);
      assert((await cardsUp(page)) >= 1 && (await shakeY(page)) !== 0, `SPLOOSH!: a card and a thump through the world (cards ${await cardsUp(page)}, shake ${await shakeY(page)})`);
      assert(hit.top.gull === 'away', `a gull due while the wave runs does not land (${hit.top.gull})`);
      await at(DRAW_FRAMES + RUSH_FRAMES + 2);
      await api.shot('beach-wave-sploosh');
      await at(DRAW_FRAMES + RUSH_FRAMES + 26);
      const sat = await api.summary();
      assert(sat.top.seats.every((s) => s.anim === 'sitWet' && s.wetT > GETUP_FRAMES), `then everyone sits in the wet (anims ${sat.top.seats.map((s) => s.anim).join()})`);
      await api.shot('beach-wave-sit');
      await at(WAVE_TOTAL);
      const out = await api.summary();
      assert(out.top.waveT === 0 && out.top.seats.every((s) => s.wetT === 0 && s.anim === 'carry') && out.top.total === 0, `everyone is up again and nothing was lost (waveT ${out.top.waveT}, total ${out.top.total}, anims ${out.top.seats.map((s) => s.anim).join()})`);
      await api.hold(0, { right: true }); await api.step(6); await api.release(0);
      const free = await api.summary();
      assert(free.top.seats[0].x > x0 && free.top.gull === 'away', `and the stick works again (x ${x0} -> ${free.top.seats[0].x})`);
      await api.step(free.top.gullT);
      assert((await api.summary()).top.gull === 'arrive', `the gull that waited comes in once the wave has gone (${(await api.summary()).top.gull})`);
    });
  },
  /**
   * beachGull - the gull, brought in by hand through the fields its deal sets (gullState away, gullT 1). THE TELL: it
   *             glides in and watches from the post. THE WIND-UP: seat 0 grabs a tired crab - no +1, the crab is
   *             off the strand and up in the paw, the gull is busy with seat 0, the stick is locked, a '!' comes
   *             up. THE BANG: SQUAWK! (gulls 1), the critter spun round. THE LOOK: the gull lets go, BONK! on the
   *             head, and the crab lands in the basket: +1, exactly the one grabbed. Then the seat is a player
   *             again and the gull has gone. Then: a pinch is not a grab the gull takes, and a gull nobody feeds
   *             gives up and flies off; and on a salt visit it snatches a slab of scraped salt the same way.
   *             Writes beach-gull-post, -swoop, -snatch, -carry, -bonk, -dazed and -salt.
   */
  async beachGull(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      await holdTarget(page);
      const c = await oneTiredCrab(page, 400);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.seats[0].x = 404; sc.seats[1].x = 120; sc.seats[2].x = 240; sc.seats[3].x = 560; });
      await page.evaluate(() => { window.__game.game.screen.gullT = 1; });
      await api.step(1);
      assert((await api.summary()).top.gull === 'arrive', 'THE TELL: the gull comes in when its time comes');
      await api.step(ARRIVE_FRAMES);
      let s = await api.summary();
      assert(s.top.gull === 'watch' && s.top.gullT === GULL_WATCH, `it lands on the post and watches (${s.top.gull}, gullT ${s.top.gullT})`);
      await api.step(20);
      await api.shot('beach-gull-post');

      // THE WIND-UP: the grab is the gull's
      await api.press(0, { action: true }, 1, 0);
      const at = beat(api);   // frames since the grab
      await at(1);
      s = await api.summary();
      const ts = await things(page);
      assert(s.top.gull === 'busy' && s.top.gullSeat === 0 && s.top.seats[0].snatchT === SNATCH_TOTAL - 1, `a grab while the gull watches is its (${s.top.gull}, seat ${s.top.gullSeat}, snatchT ${s.top.seats[0].snatchT})`);
      assert(!ts[c].active && s.top.seats[0].count === 0 && s.top.total === 0, `the crab is off the strand and up in the paw, not in the basket (active ${ts[c].active}, count ${s.top.seats[0].count})`);
      const x0 = s.top.seats[0].x;
      await api.hold(0, { right: true }); await at(SEE + 1); await api.release(0);
      s = await api.summary();
      assert(s.top.seats[0].x === x0 && s.top.seats[0].anim === 'startle', `'!': it has seen the gull coming, stick locked (x ${x0} -> ${s.top.seats[0].x}, anim '${s.top.seats[0].anim}')`);
      assert((await cardsUp(page)) >= 1, `the '!' is up (${await cardsUp(page)} cards)`);
      await at(SEE + 6);
      await api.shot('beach-gull-swoop');

      // THE BANG: the snatch
      await at(SNATCH);
      s = await api.summary();
      const f0 = s.top.seats[0].facing;
      assert(s.top.gulls === 1 && s.top.seats[0].anim === 'spun' && s.top.seats[0].count === 0, `SQUAWK!: the catch is snatched out of the paw (gulls ${s.top.gulls}, anim '${s.top.seats[0].anim}', count ${s.top.seats[0].count})`);
      assert((await cardsUp(page)) >= 1, `the SQUAWK card is up (${await cardsUp(page)})`);
      await at(SNATCH + 4);
      await api.shot('beach-gull-snatch');
      assert((await api.summary()).top.seats[0].facing !== f0, 'the downdraft spins the critter round');
      await at(SNATCH + SPIN + 20);
      s = await api.summary();
      assert(s.top.seats[0].anim === 'shakeFist' && s.top.seats[0].count === 0, `the gull has it up over the head; the critter shakes its basket at it (anim '${s.top.seats[0].anim}')`);
      await api.shot('beach-gull-carry');

      // THE LOOK: dropped on the head, and into the basket
      await at(BONK + 3);
      s = await api.summary();
      assert(s.top.seats[0].count === 0 && (await cardsUp(page)) >= 1 && s.top.seats[0].anim === 'bonked', `BONK!: it lets go, onto the head (anim '${s.top.seats[0].anim}', count ${s.top.seats[0].count})`);
      await api.shot('beach-gull-bonk');
      await at(LAND);
      s = await api.summary();
      assert(s.top.seats[0].count === 1 && s.top.total === 1, `and it bounces into the basket: +1, the one grabbed (count ${s.top.seats[0].count}, total ${s.top.total})`);
      await at(SHAKE - 4);
      assert((await api.summary()).top.seats[0].anim === 'dazed', 'dazed, the stars going round');
      await api.shot('beach-gull-dazed');
      await at(SNATCH_TOTAL);
      s = await api.summary();
      assert(s.top.seats[0].snatchT === 0 && s.top.seats[0].anim === 'carry' && s.top.gull === 'away' && s.top.gullSeat === -1, `then it shakes it off, and the gull has gone (snatchT ${s.top.seats[0].snatchT}, anim '${s.top.seats[0].anim}', gull ${s.top.gull})`);
      const x1 = s.top.seats[0].x;
      await api.hold(0, { right: true }); await api.step(6); await api.release(0);
      s = await api.summary();
      assert(s.top.seats[0].x > x1 && s.top.seats[0].count === 1 && s.top.total === 1, `the stick works again, and nothing was lost (x ${x1} -> ${s.top.seats[0].x}, count ${s.top.seats[0].count})`);

      // a pinch is not a grab the gull takes; and a gull nobody feeds gives up and flies off
      await holdTarget(page);
      await gullIn(api, page);
      await page.evaluate(() => {
        const sc = window.__game.game.screen, t = sc.things.find((o) => !o.active);
        t.active = true; t.state = 1; t.t = 300; t.dartT = 0; t.cool = 500; t.dir = 1; t.x = 300; t.life = 5000;
        sc.seats[0].x = 306;
      });
      await api.press(0, { action: true }, 1, 0);
      s = await api.summary();
      assert(s.top.pinches === 1 && s.top.gull === 'watch' && s.top.seats[0].snatchT === 0, `a running crab is a pinch, and the gull keeps watching (pinches ${s.top.pinches}, gull ${s.top.gull})`);
      await api.step(s.top.gullT);
      assert((await api.summary()).top.gull === 'leave', `nobody grabs while it watches: it gives up and flies off (${(await api.summary()).top.gull})`);
      await api.step(LEAVE_FRAMES);
      s = await api.summary();
      assert(s.top.gull === 'away' && s.top.gullT > 0 && s.top.gulls === 1, `and is away until its next time (${s.top.gull}, gullT ${s.top.gullT})`);
    });

    // every visit kind: on a salt visit the gull takes the slab the critter has just scraped off a pan
    await withPage(server, BOOT_SALT, async (api, page) => {
      await api.step(2);
      assert((await api.summary()).top.ing === 'salt', 'a salt visit');
      await holdTarget(page);
      await page.evaluate((x) => { const sc = window.__game.game.screen; sc.nextSpawn = 100000; sc.things[0].state = 2; sc.things[0].t = 0; sc.seats[0].x = x; }, PAN_X[0]);
      await gullIn(api, page);
      await api.press(0, { action: true }, 1, 0);
      const at = beat(api);   // frames since the scrape
      let s = await api.summary();
      assert(s.top.gull === 'busy' && s.top.seats[0].count === 0 && s.top.things.length === 1, `the scrape is the gull's (${s.top.gull}, count ${s.top.seats[0].count}, ${s.top.things.length} pan left)`);
      await at(SNATCH + SPIN + 20);
      await api.shot('beach-gull-salt');
      await at(SNATCH_TOTAL);
      s = await api.summary();
      assert(s.top.gulls === 1 && s.top.seats[0].count === 1 && s.top.total === 1 && s.top.gull === 'away', `and the salt comes back to the basket: +1 (count ${s.top.seats[0].count}, total ${s.top.total}, gull ${s.top.gull})`);
    });
  },
  async beach(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'beach', `the beach is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4 && s0.top.ing === 'crab', `four seats on the sand, and the visit is for crabs (${s0.top.seats.length}, ${s0.top.ing})`);
      const line = (s0.run.needs || []).find((n) => n.startsWith('crab:')) || '';
      assert(line === `crab:0/${s0.top.target}` && s0.top.target > 0, `the target is the order's own crab line (${line}, target ${s0.top.target})`);
      assert(s0.top.things.length === 3, `three crabs are coming up when the truck pulls up (${s0.top.things.length})`);
      await holdTarget(page);

      // --- a crab runs on its own: the strand is alive without anybody touching it
      // nobody stands near it: the crew is parked at the far end so no dart is provoked
      await page.evaluate(() => { const sc = window.__game.game.screen; for (const s of sc.seats) s.x = 600; sc.nextSpawn = 100000; for (const t of sc.things) if (t.active) { t.x = Math.min(t.x, 300); } });
      await api.step(14);
      let ts = await things(page);
      const c = nearest(ts, 0);
      assert(c >= 0 && ts[c].state === 1, `the crab is up and running after its burrow opens (state ${ts[c].state})`);
      const x1 = ts[c].x;
      await api.step(10);
      ts = await things(page);
      assert(ts[c].x !== x1, `and it moves on its own (${x1} -> ${ts[c].x})`);

      // --- THE DART: walk seat 0 at the crab; it turns away and darts, then tires with its claws up
      await page.evaluate(([i, r]) => { const sc = window.__game.game.screen, t = sc.things[i]; sc.seats[0].x = t.x + r + 30; t.state = 2; t.t = 500; t.cool = 0; t.dartT = 0; t.dir = 1; }, [c, DART_R]);
      let darted = false, dartDir = 0, dartX = 0;
      for (let i = 0; i < 60 && !darted; i++) {
        await api.hold(0, { left: true });
        await api.step(1);
        ts = await things(page);
        if (ts[c].dartT > 0) { darted = true; dartDir = ts[c].dir; dartX = ts[c].x; }
      }
      await api.release(0);
      assert(darted && dartDir === -1, `a crab that sees a critter coming darts AWAY from it (darted ${darted}, dir ${dartDir})`);
      await api.step(3);
      await api.shot('beach-dart');
      await api.step(DART_FRAMES);
      ts = await things(page);
      assert(ts[c].state === 2 && ts[c].dartT === 0 && ts[c].x < dartX, `and stops, tired, further off (state ${ts[c].state}, ${dartX} -> ${ts[c].x})`);
      assert(ts[c].cool > 0, `it will not dart again for a while (cool ${ts[c].cool})`);

      // --- THE GRAB: walk up to the tired crab and take it
      const before = await api.summary();
      const cx = ts[c].x;
      await page.evaluate((x) => { window.__game.game.screen.seats[0].x = x + 6; }, cx);
      await api.press(0, { action: true }, 1, 0);
      await api.step(2);
      const grabbed = await api.summary();
      assert(grabbed.top.seats[0].count === before.top.seats[0].count + 1, `action with the crab under the critter grabs it (seat 0 ${before.top.seats[0].count} -> ${grabbed.top.seats[0].count})`);
      assert(grabbed.top.total === before.top.total + 1, `the party's total went up with it (${before.top.total} -> ${grabbed.top.total})`);
      ts = await things(page);
      assert(!ts[c].active, 'and the crab is off the strand');
      assert(grabbed.top.seats[0].pounceT > 0 && grabbed.top.seats[0].pounceT <= POUNCE_FRAMES && grabbed.top.seats[0].anim === 'pounce', `the seat is in its pounce (pounceT ${grabbed.top.seats[0].pounceT}, anim '${grabbed.top.seats[0].anim}')`);
      await api.shot('beach-grab');
      assert(grabbed.top.seats.slice(1).every((s) => s.count === 0), 'the other seats, with no input, grabbed nothing');
      await api.step(POUNCE_FRAMES);

      // --- NOTHING: a grab at empty sand does nothing
      const bare = await page.evaluate(() => { const sc = window.__game.game.screen; for (const t of sc.things) t.active = false; sc.seats[0].pounceT = 0; return sc.total; });
      await api.press(0, { action: true }, 1, 2);
      const nothing = await api.summary();
      assert(nothing.top.total === bare && nothing.top.seats[0].pounceT === 0, `action on empty sand does nothing (total ${nothing.top.total}, pounceT ${nothing.top.seats[0].pounceT})`);

      // --- the hand-off: bring the finish line down to the party's total (there is no clock to force), watch the
      // sign, then the map
      const lastTotal = (await api.summary()).top.total;
      assert(lastTotal >= 1, `something was grabbed before the ending (total ${lastTotal})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'beach' && s2.top.phase === 1 && /^CRABS: \d+$/.test(s2.top.sign), `the target was reached: the CRABS sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
      await api.shot('beach-sign');
      await api.step(HOLD);
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the beach hands back to the map (on ${s3.screen})`);
      const line3 = (s3.run.needs || []).find((n) => n.startsWith('crab:')) || '';
      const have = parseInt(line3.split(':')[1], 10);
      assert(line3 && have === Math.min(lastTotal, s0.top.target), `run.gather('crab') banked the party's total (${line3}, total ${lastTotal})`);
    });
  },

  async beachSalt(server) {
    await withPage(server, BOOT_SALT, async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'beach' && s0.top.ing === 'salt', `the beach is up for salt (on ${s0.screen}, ${s0.top.ing})`);
      assert(s0.top.things.length === 2 && s0.top.things.every((t) => t[2] === 'run'), `two pans are filling when the truck pulls up (${JSON.stringify(s0.top.things)})`);
      await holdTarget(page);
      await page.evaluate(() => { window.__game.game.screen.nextSpawn = 100000; });
      // a pan still crusting cannot be scraped
      await page.evaluate((x) => { window.__game.game.screen.seats[0].x = x; }, PAN_X[0]);
      await api.press(0, { action: true }, 1, 2);
      let s = await api.summary();
      assert(s.top.total === 0 && s.top.seats[0].pounceT === 0, `a pan still crusting cannot be scraped (total ${s.top.total})`);
      // once the crust is white, it can
      await api.step(CRUST + 2);
      s = await api.summary();
      assert(s.top.things[0][2] === 'stop', `the pan has crusted after ${CRUST} frames (${s.top.things[0][2]})`);
      await api.press(0, { action: true }, 1, 2);
      s = await api.summary();
      assert(s.top.total === 1 && s.top.seats[0].count === 1, `and a crusted pan is scraped for +1 (total ${s.top.total})`);
      assert(s.top.things.length === 1, `the scraped pan is empty again (${s.top.things.length} pan left)`);
    });
  },
};
