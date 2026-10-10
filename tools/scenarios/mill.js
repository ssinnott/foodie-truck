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
//          Both jokes are held off throughout (no clog in any spout, no sneeze due on any sack): a rules test that
//          met a joke would read a locked stick as a broken one. Writes tools/screens/mill-fill.png (a sack in the
//          brim band under a pouring chute - the shot the "nearly full" read is judged from).
//
//   millSneeze - the old joke, made bigger: the false start (AH... - nothing - AH-AH...), ACHOO!, blown back a hop,
//          dusty and dazed, on a flour visit and again on a rice visit (the cloud is chaff).
//   millClog - the new joke: a chute that wakes with a clog in it, through the tell, the catch, FWUMP, the heap, the
//          ghost and the shake, with a second seat under the same spout that it does not catch; then a clog nobody
//          fills under, which sticks at the lip until the pour runs dry and lands on the planks; then a rice visit.
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
/** Frames of that hold to be inside the tie beat (90 to fill, 18 of beat), where the sneeze's deal can be taken back. */
const TO_TIE = 95;

/**
 * Stand seat 0 under chute `ci` with an empty sack and that chute pouring, and switch everything else off: no more
 * spouts wake, no other chute is live, no clog is in any spout, no joke is running on any seat, and the target is
 * held out of reach so a +1 cannot end the round in the middle of the beat (run.gather clamps to the order's own
 * line, so the bank assert still reads the real target). `pouring` false leaves the chute DORMANT, which is how the
 * negative case is set up; `clog` true wakes it with a clog in it, through the two fields millGags.ts rollClog deals
 * (clog 1, clogT CLOG_FRAMES), so the test meets the clog exactly where the sim's own roll would. Costs one step.
 */
async function stage(api, page, ci, pouring, clog = false) {
  const before = await page.evaluate(([i, on, clogged, frames]) => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    sc.wake = 100000;
    for (const c of sc.chutes) { c.state = 0; c.t = 0; c.seat = -1; c.clog = 0; c.clogT = 0; c.victim = -1; }
    for (const q of sc.seats) { q.sneezeT = 0; q.sneezeDue = 0; q.clogT = 0; }
    // the chute is put on the LAST frame of its telegraph, not straight into POURING with a made-up timer: one
    // step then gives it the screen's own POUR_FRAMES, so the test never invents a state the sim cannot reach
    if (on) { sc.chutes[i].state = 1; sc.chutes[i].t = 1; }
    if (on && clogged) { sc.chutes[i].clog = 1; sc.chutes[i].clogT = frames; }
    s.x = sc.summary().chutes[i][3]; s.facing = 1; s.moving = false;
    s.fill = 0; s.bumpT = 0; s.tieT = 0; s.chute = -1;
    sc.target = Math.max(sc.target, sc.total + 4); sc.setTotal(sc.total);
    return { count: s.count, total: sc.total, target: sc.target };
  }, [ci, pouring, clog, CLOG_FRAMES]);
  await api.step(1);
  return before;
}

/** Seat `i` as the sim holds it (summary only carries the rounded fill). */
function seatOf(page, i) {
  return page.evaluate((k) => {
    const sc = window.__game.game.screen, s = sc.seats[k];
    return { x: s.x, fill: s.fill, count: s.count, bumpT: s.bumpT, tieT: s.tieT, anim: s.anim, chute: s.chute, total: sc.total, tied: sc.tied, sneezeT: s.sneezeT, sneezes: sc.sneezes, clogT: s.clogT, clogs: sc.clogs, spills: sc.spills };
  }, i);
}
const seat0 = (page) => seatOf(page, 0);

/** Word cards up right now (game/gags.ts gagsUp): the URL is the game's own, so it is the game's module instance. */
const cardsUp = (page) => page.evaluate(async () => (await import('/src/game/gags.ts')).gagsUp());
/** The coat seat `i` is drawn in this frame (screens/millGags.ts jokeCoat), or null. */
const coatOf = (page, i) => page.evaluate(async (k) => {
  const sc = window.__game.game.screen;
  return (await import('/src/game/screens/millGags.ts')).jokeCoat(sc, sc.seats[k]);
}, i);
/** Hold both jokes off between steps of a rules test: no clog left in any spout, no sneeze due on any sack. */
const holdJokesOff = (page) => page.evaluate(() => {
  const sc = window.__game.game.screen;
  for (const c of sc.chutes) { c.clog = 0; c.clogT = 0; c.victim = -1; }
  for (const s of sc.seats) s.sneezeDue = 0;
});

/** The jokes' numbers (screens/millGags.ts), restated so a change on either side shows up as a failing assert. */
const CLOG_SLIDE = 96, CLOG_UP = 30, CLOG_FALL = 6, CLOG_LIP = CLOG_UP + 1, CLOG_FRAMES = CLOG_SLIDE + CLOG_LIP;
/** A pour (screens/mill.ts POUR_FRAMES): a clog nobody fills under holds at the lip until the pour runs dry. */
const POUR_FRAMES = 330;
const HEAP_FRAMES = 40, HEAP_HOLD = 10, HEAP_SETTLE = 8, GHOST_FRAMES = 26, SHAKE_FRAMES = 34;
const LOOK_FRAMES = GHOST_FRAMES + SHAKE_FRAMES, CLOG_SEAT = CLOG_UP + HEAP_FRAMES + LOOK_FRAMES;
const AH_FRAMES = 20, LULL_FRAMES = 10, AHAH_FRAMES = 20, BLOWN_FRAMES = 20, DAZED_FRAMES = 40;
const SNEEZE_FRAMES = AH_FRAMES + LULL_FRAMES + AHAH_FRAMES + BLOWN_FRAMES + DAZED_FRAMES, ACHOO_AT = BLOWN_FRAMES + DAZED_FRAMES;
const SNAP = 3, BLOWN_HOP = 9, BLOWN_STEP = 2;
/** The ghost's coat (game/gags.ts COAT.flour). */
const COAT_FLOUR = '#EFE7D6';
/** ?recipes=15 fixes the menu to ORDERS[15], RICE PUDDING: rice 3 + milk 2, so the mill's visit is for rice. */
const RICE = 'skipTo=mill&critters=2,3&recipes=15';
/** Frames until the HOW TO PLAY card has slid away (game/controlcard.ts CARD_HOLD 210 + CARD_SLIDE 16). */
const CARD_GONE = 226;

/** Let the round's opening card go, so the shots show the hoppers it covers; no joke is let happen meanwhile. */
async function waitOutCard(api, page) {
  for (let k = 0; k < CARD_GONE; k += 50) { await holdJokesOff(page); await api.step(Math.min(50, CARD_GONE - k)); }
}

/**
 * Tie seat 0's sack with the sneeze due and run the tie beat out, so the next frame is the sneeze's first. Seat 0
 * is under a pouring chute 1 a hair under the brim; one held frame ties it, the deal is then set by hand (the field
 * tie() rolls) and the tie beat is stepped through. Returns seat 0 as the tie left it.
 */
async function sneezeOn(api, page) {
  await stage(api, page, 1, true);
  await page.evaluate(() => { window.__game.game.screen.seats[0].fill = 0.99; });
  await api.hold(0, { action: true });
  await api.step(1);
  await api.release(0);
  const tied = await seat0(page);
  await page.evaluate(() => { window.__game.game.screen.seats[0].sneezeDue = 1; });
  await api.step(tied.tieT);
  return tied;
}

/**
 * Wake chute `ci` with a clog in it and seat 0 under it holding action from the pour's FILL_AT-th frame, so its sack
 * is part-full and still filling - not in a tie beat - on the frame the bulge reaches the lip (CLOG_SLIDE), and run
 * the tell out to that frame: the clog goes on seat 0 there and then. Returns seat 0 as it was caught.
 */
const FILL_AT = 40;
async function clogOn(api, page, ci, shot) {
  await stage(api, page, ci, true, true);
  await api.step(FILL_AT);
  await api.hold(0, { action: true });
  await api.step(30);
  if (shot) await api.shot(shot);
  await api.step(CLOG_SLIDE - FILL_AT - 30);
  return seat0(page);
}

export const SCENARIOS = {
  /**
   * millSneeze - the old joke, bigger: a tie with the sneeze due. As the tie beat ends, AH... (sneezeT 110, a
   *              bubble up, the stick locked), the LULL 20 frames in (the head comes back down, relieved), AH-AH...
   *              10 after that, then ACHOO! at 50 frames in (a burst up, the critter blown back BLOWN_STEP a frame
   *              for BLOWN_HOP frames), then dusty (the visit's dust as a coat) and dazed; live again after 110
   *              with the fresh sack untouched (fill 0, count kept) and the stick working. Then the ACHOO again on a
   *              rice visit. Writes mill-sneeze-ah, -ahah, -achoo, -dazed, -rice-achoo, -rice-dazed.
   */
  async millSneeze(server) {
    await withPage(server, 'skipTo=mill&critters=0,1&order=4', async (api, page) => {
      await waitOutCard(api, page);
      const tied = await sneezeOn(api, page);
      assert(tied.count === 1 && tied.tieT > 0, `the sack tied (count ${tied.count}, tieT ${tied.tieT})`);
      const ah = await seat0(page);
      assert(ah.sneezeT === SNEEZE_FRAMES && ah.sneezes === 1 && ah.anim === 'ah', `AH... starts as the tie beat ends (sneezeT ${ah.sneezeT}, sneezes ${ah.sneezes}, anim '${ah.anim}')`);
      assert(await cardsUp(page) >= 1, 'and says so in a bubble');
      // the stick is locked through the whole of it: push right from the first frame
      await api.hold(0, { right: true });
      await api.step(AH_FRAMES - 4);
      await api.shot('mill-sneeze-ah');
      await api.step(4);
      const lull = await seat0(page);
      assert(lull.anim === 'lull' && lull.x === ah.x, `...and it goes away again: the lull (anim '${lull.anim}', x ${ah.x} -> ${lull.x})`);
      await api.step(LULL_FRAMES);
      const ahah = await seat0(page);
      assert(ahah.anim === 'ahah' && ahah.x === ah.x, `AH-AH..., bigger (anim '${ahah.anim}', x ${ahah.x})`);
      await api.step(AHAH_FRAMES - 4);
      await api.shot('mill-sneeze-ahah');
      await api.step(4);
      const achoo = await seat0(page);
      assert(achoo.anim === 'achoo' && achoo.sneezeT === ACHOO_AT, `ACHOO! (anim '${achoo.anim}', sneezeT ${achoo.sneezeT})`);
      assert(await cardsUp(page) >= 1, 'with a burst up');
      await api.step(3);
      await api.shot('mill-sneeze-achoo');
      await api.step(BLOWN_FRAMES - 3);
      const blown = await seat0(page);
      assert(blown.x === ah.x - BLOWN_STEP * BLOWN_HOP, `blown back a hop, against the stick held forward (x ${ah.x} -> ${blown.x}, want ${ah.x - BLOWN_STEP * BLOWN_HOP})`);
      assert(blown.anim === 'dazed' && blown.sneezeT === DAZED_FRAMES, `and standing there dazed (anim '${blown.anim}', sneezeT ${blown.sneezeT})`);
      const dusty = await coatOf(page, 0);
      assert(!!dusty && dusty !== COAT_FLOUR, `in a coat of the visit's dust, not the clog's ghost-white (${dusty})`);
      await api.step(14);
      await api.shot('mill-sneeze-dazed');
      await api.step(DAZED_FRAMES - 14);
      await api.release(0);
      const after = await seat0(page);
      assert(after.sneezeT === 0 && after.fill === 0 && after.count === tied.count && after.total === tied.total,
        `over, with the fresh sack untouched (sneezeT ${after.sneezeT}, fill ${after.fill}, count ${after.count}, total ${after.total})`);
      assert(await coatOf(page, 0) === null, 'and the dust is off');
      await api.hold(0, { right: true }); await api.step(10); await api.release(0);
      const live = await seat0(page);
      assert(live.x > after.x, `the stick works again (x ${after.x} -> ${live.x})`);
    });
    // a rice visit: the same beat, and the cloud and the coat are the rice's chaff
    await withPage(server, RICE, async (api, page) => {
      await waitOutCard(api, page);
      const ing = await page.evaluate(() => window.__game.game.screen.ing);
      assert(ing === 'rice', `?recipes=15 opens the mill for rice (${ing})`);
      await sneezeOn(api, page);
      await api.step(SNEEZE_FRAMES - ACHOO_AT + 3);
      assert((await seat0(page)).anim === 'achoo', 'ACHOO! on a rice visit');
      await api.shot('mill-sneeze-rice-achoo');
      await api.step(BLOWN_FRAMES + 8);
      await api.shot('mill-sneeze-rice-dazed');
    });
  },

  /**
   * millClog - the new joke. Chute 1 wakes with a clog in it (clog 1, clogT 127: the fields the wake's roll deals)
   *            and pours: the TELL runs (the column sputters, the bulge slips down the spout) and still fills the
   *            two seats that step under it. The frame the bulge reaches the lip, it goes on seat 0 - the first
   *            filling, the one the column lands on: the stick locks (right is held), '!', and nothing pours (seat 1's
   *            fill stops too). CLOG_UP frames later it LANDS: clogs 1, FWUMP!, the chute is clear, and seat 0 is
   *            under the heap, which slumps to its eyes; seat 1, never caught, fills again from the clear pour.
   *            Then the GHOST (coat COAT.flour) and the SHAKE, and after CLOG_SEAT frames the seat is live with its
   *            sack exactly as full as when it was caught and nothing scored or lost. Then a clog nobody comes to
   *            fill under: it sticks at the lip until the pour runs dry, then lands on the planks (spills 1).
   *            Then a clog on a rice visit (a heap of rice, grains stuck to the ghost), and the round ended under it
   *            while the critter is still a ghost: the sign drops and the joke is cleanly gone. Writes mill-clog-tell,
   *            -windup, -drop, -fwump, -heap, -ghost, -shake, -ready, -spill and mill-clog-rice-tell, -heap, -ghost.
   */
  async millClog(server) {
    await withPage(server, 'skipTo=mill&critters=0,1&order=4', async (api, page) => {
      await waitOutCard(api, page);
      // seat 1 stands under the same spout a little to the right of seat 0
      await page.evaluate(() => { const sc = window.__game.game.screen, s = sc.seats[1]; s.x = sc.summary().chutes[1][3] + 20; s.facing = -1; s.fill = 0; });
      const before = await stage(api, page, 1, true, true);
      await api.step(FILL_AT);
      const s0 = await api.summary();
      assert(s0.top.chutes[1][0] === 2 && s0.top.chutes[1][4] === 1 && s0.top.chutes[1][5] === CLOG_FRAMES - FILL_AT,
        `the chute pours with a clog in it, counting down the tell (state ${s0.top.chutes[1][0]}, clog ${s0.top.chutes[1][4]}, clogT ${s0.top.chutes[1][5]})`);
      // both step in; seat 0 is first in party order, so the column - and the clog - land on it
      await api.hold(0, { action: true }); await api.hold(1, { action: true });
      await api.step(30);
      const tell = await seat0(page), one = await seatOf(page, 1);
      assert(tell.chute === 1 && Math.abs(tell.fill - 30 / 90) < 0.02 && one.chute === 1 && one.fill > 0.3,
        `a clogged pour still fills both sacks: the tell costs nothing (fills ${tell.fill.toFixed(3)}, ${one.fill.toFixed(3)})`);
      await api.shot('mill-clog-tell');
      await api.step(CLOG_SLIDE - FILL_AT - 30);
      // --- the catch: the bulge reaches the lip with both seats filling under it, and it goes on the first at once
      const caught = await seat0(page), sum = await api.summary();
      assert(caught.clogT === CLOG_SEAT && caught.anim === 'lookUp' && sum.top.chutes[1][6] === 0,
        `at the lip, it goes on seat 0, the first filling under it (clogT ${caught.clogT}, anim '${caught.anim}', victim ${sum.top.chutes[1][6]})`);
      assert(sum.top.chutes[1][5] === CLOG_UP, `...at once: the shudder starts on the catch's frame (chute clogT ${sum.top.chutes[1][5]})`);
      assert(await cardsUp(page) >= 1, '...looking up at it, with a bubble');
      const spared = await seatOf(page, 1);
      assert(spared.clogT === 0, `seat 1, under the same spout but not the one the pour lands on, is not caught (clogT ${spared.clogT})`);
      await api.hold(0, { right: true, action: true });
      await api.step(10);
      const wind = await seat0(page), still1 = await seatOf(page, 1);
      assert(wind.x === caught.x && wind.fill === caught.fill, `the WIND-UP: the stick is locked and the sack holds still (x ${caught.x} -> ${wind.x}, fill ${caught.fill.toFixed(3)} -> ${wind.fill.toFixed(3)})`);
      assert(still1.fill === spared.fill, `the clog stops the mouth: nothing pours, not even for seat 1 (${spared.fill.toFixed(3)} -> ${still1.fill.toFixed(3)})`);
      await api.shot('mill-clog-windup');
      await api.step(CLOG_UP - CLOG_FALL - 10 + 3);
      await api.shot('mill-clog-drop');
      await api.step(CLOG_FALL - 3);
      // --- the BANG
      const bang = await seat0(page), after = await api.summary();
      assert(bang.clogs === 1 && bang.anim === 'buried' && bang.clogT === HEAP_FRAMES + LOOK_FRAMES,
        `FWUMP: it lands on seat 0 (clogs ${bang.clogs}, anim '${bang.anim}', clogT ${bang.clogT})`);
      assert(after.top.chutes[1][4] === 0 && after.top.chutes[1][6] === -1 && after.top.chutes[1][0] === 2, `the chute is clear and pours on (clog ${after.top.chutes[1][4]}, state ${after.top.chutes[1][0]})`);
      assert(await cardsUp(page) >= 1, 'with a burst up');
      await api.step(3);
      await api.shot('mill-clog-fwump');
      await api.step(HEAP_HOLD + HEAP_SETTLE + 6 - 3);
      await api.shot('mill-clog-heap');
      const heap = await seat0(page), free1 = await seatOf(page, 1);
      assert(heap.x === caught.x && heap.fill === caught.fill, `under the heap: not a step taken and not a grain gained (x ${heap.x}, fill ${heap.fill.toFixed(3)})`);
      assert(free1.fill > still1.fill, `...while seat 1 fills again from the clear pour (${still1.fill.toFixed(3)} -> ${free1.fill.toFixed(3)})`);
      await api.release(1);
      // --- the LOOK: out it pops, ghost-white
      await api.step(HEAP_FRAMES - (HEAP_HOLD + HEAP_SETTLE + 6) + 6);
      const ghost = await seat0(page);
      assert(ghost.anim === 'ghost' && await coatOf(page, 0) === COAT_FLOUR, `out it pops, ghost-white (anim '${ghost.anim}')`);
      await api.shot('mill-clog-ghost');
      await api.step(GHOST_FRAMES - 6 + 8);
      const shake = await seat0(page);
      assert(shake.anim === 'shakeOff', `...and shakes it off (anim '${shake.anim}')`);
      await api.shot('mill-clog-shake');
      await api.step(SHAKE_FRAMES - 8);
      const done = await seat0(page);
      assert(done.clogT === 0 && await coatOf(page, 0) === null, `the beat is over and the flour is off (clogT ${done.clogT})`);
      assert(done.x === caught.x && done.fill === caught.fill && done.count === before.count && done.total === before.total,
        `nothing lost and nothing gained: the sack as it was caught (fill ${caught.fill.toFixed(3)} -> ${done.fill.toFixed(3)}, count ${done.count}, total ${done.total})`);
      await api.release(0);
      await api.hold(0, { right: true }); await api.step(10); await api.release(0);
      const live = await seat0(page);
      assert(live.x > done.x && live.clogT === 0, `the stick works again (x ${done.x} -> ${live.x})`);

      // --- a clog nobody is under: seat 0 waits two spouts away; the clog sticks at the lip, rattling, for as long as
      // the pour has a shudder and a drop left in it, then goes on its own and lands on the planks as the chute runs dry
      await stage(api, page, 3, true, true);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.seats[0].x = sc.summary().chutes[1][3]; sc.seats[1].x = sc.summary().chutes[0][3]; });
      await api.step(CLOG_SLIDE + 100);
      const waiting = await api.summary();
      assert(waiting.top.chutes[3][4] === 1 && waiting.top.chutes[3][6] === -1 && waiting.top.chutes[3][5] === CLOG_LIP,
        `at the lip with nobody under it, it waits (clogT ${waiting.top.chutes[3][5]}, victim ${waiting.top.chutes[3][6]})`);
      await api.shot('mill-clog-ready');
      await api.step(POUR_FRAMES - CLOG_SLIDE - 100);
      const miss = await seat0(page), missSum = await api.summary();
      assert(miss.spills === 1 && miss.clogs === 1 && missSum.top.seats.every((q) => q[6] === 0) && missSum.top.chutes[3][0] === 0,
        `with nobody under it, it lands on the planks on the pour's last frame and catches nobody (spills ${miss.spills}, clogs ${miss.clogs}, state ${missSum.top.chutes[3][0]})`);
      await api.step(4);
      await api.shot('mill-clog-spill');
    });
    // a rice visit: a heap of rice, with Chicory's long ears out of the top, and grains stuck to the ghost
    await withPage(server, RICE, async (api, page) => {
      await waitOutCard(api, page);
      const caught = await clogOn(api, page, 1, 'mill-clog-rice-tell');
      assert(caught.clogT === CLOG_SEAT, `a rice visit's clog catches the same way (clogT ${caught.clogT})`);
      await api.step(CLOG_UP + HEAP_HOLD + HEAP_SETTLE + 6);
      await api.shot('mill-clog-rice-heap');
      await api.step(HEAP_FRAMES - (HEAP_HOLD + HEAP_SETTLE + 6) + 10);
      await api.shot('mill-clog-rice-ghost');
      const ghost = await seat0(page);
      assert(ghost.anim === 'ghost' && ghost.clogs === 1, `ghost-white on a rice visit too (anim '${ghost.anim}')`);
      // the round may end in the middle of a joke: bring the finish line to the party (one sack banked, one wanted)
      // while seat 0 is still a ghost - the sign drops, and the joke is gone from the seat and the spout alike
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = 1; sc.setTotal(1); });
      await api.step(2);
      const ended = await seat0(page), endSum = await api.summary();
      assert(endSum.top.phase === 1 && ended.clogT === 0 && await coatOf(page, 0) === null && endSum.top.chutes.every((c) => c[4] === 0 && c[6] === -1),
        `a round that ends mid-joke ends it cleanly (phase ${endSum.top.phase}, clogT ${ended.clogT}, anim '${ended.anim}')`);
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
          // the spouts wake for real here, and one may wake with a clog: a clog lands no sooner than TELEGRAPH +
          // CLOG_FRAMES (150) after its wake, so emptying every spout each 50 frames means none ever does
          await holdJokesOff(page);
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
      // the hold ties a sack on its 90th frame, and the tie deals the sneeze: take it back inside the tie beat
      await api.step(TO_TIE);
      await holdJokesOff(page);
      await api.step(LONG_HOLD - TO_TIE);
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
      assert(lastMill.top.sneezes === 0 && lastMill.top.clogs === 0 && lastMill.top.spills === 0,
        `and the rules ran with no joke in them (sneezes ${lastMill.top.sneezes}, clogs ${lastMill.top.clogs}, spills ${lastMill.top.spills})`);
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
