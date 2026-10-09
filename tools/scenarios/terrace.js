// Playtest scenarios for Thyme Terrace (registered in tools/scenarios/index.js).
//
//   terrace         - two seats on the terrace on the MINT SAUCE order (?recipes=59): six full clumps; seat 0 at a
//                     clump snips three times (+1 each, the clump down to stubble), a fourth press is nothing, and the
//                     clump grows a stage back after REGROW_STEP frames. Both jokes are held off (no hedgehog, nothing
//                     wild), so a rules test never sees one. Writes terrace-snip.
//   terraceHedgehog - the old joke, made bigger: put asleep under a clump (the Z drifting up off it is the tell), the
//                     snip there wakes it - the '!', the ball bouncing in with the stick locked, EEK! off the shins and
//                     the leap with the fur on end, the hopping on one foot, the HMPH - and nothing is scored or lost;
//                     the hedgehog sleeps under another clump and the same clump then gives its sprig. Writes
//                     terrace-hog-asleep, terrace-hog-ball, terrace-hog-leap and terrace-hog-hop.
//   terraceTopiary  - the new joke: a clump put WILD by hand; the first snip at it is the frenzy (the '?!', the storm,
//                     the stick locked, nothing scored yet), then TA-DA! - a statue of the snipper on the clump and its
//                     three snips in the basket - then the step back, the turn and the bow, and the seat is a player
//                     again; the statue stands, sprouting, until the clump has grown back. Again with a second critter,
//                     then once with two left to go (+2, the round ends at the TA-DA, never past the target), and
//                     once with Barley, whose look is a leap at the statue's head and a bite out of it (MMM!). Writes
//                     terrace-wild, terrace-frenzy, terrace-statue-chicory, terrace-bow, terrace-sprouts,
//                     terrace-statue-cress, terrace-tada-last, terrace-bite, terrace-munch and terrace-bitten.
import { withPage, assert } from '../playtest.js';

/** The screen's own numbers, mirrored here so a change to either side shows up as a failing assert. */
const SNIP_FRAMES = 10, REGROW_STEP = 50;
const HOG = 1, TOPIARY = 2;
const HOG_BEAT = 80, BALL_IN = 16, LEAP_FRAMES = 22, REBOUND = 14, HOG_RUN = 96;
const FRENZY_FRAMES = 50, LOOK_FRAMES = 90, TOPIARY_BEAT = FRENZY_FRAMES + LOOK_FRAMES;
const BOW_GAP = 46, TURN_AT = 44, BOW_AT = 56, BITE_GAP = 30, CHOMP_AT = 25, MMM_AT = 48;
/** The snore's Z (art/terraceProps.ts drawSnore): up for the first 40 of every 64 frames, phased by the clump. */
const SNORE_EVERY = 64;
const CLUMP_X = [70, 170, 270, 370, 470, 570];
const seat = (s, i = 0) => s.top.seats[i];
const seat0 = (s) => seat(s, 0);
/** Word cards up (game/gags.ts): the same module instance as the game's, since the URL is the same. */
const gagsUp = (page) => page.evaluate(async () => (await import('/src/game/gags.ts')).gagsUp());
/** The clump fields the summary carries, by name: [x, snips, regrow, wild, statue, face, bite]. */
const clump = (s, i) => { const c = s.top.clumps[i]; return { snips: c[1], regrow: c[2], wild: c[3], statue: c[4], face: c[5], bite: c[6] }; };

/**
 * The bed for a joke test: the target held out of reach (or `left` short of the total), no hedgehog and nothing wild
 * but `wild` (a clump index, or -1), seat `who` at `x` facing `facing`, every other seat parked at `park`.
 */
function setBed(page, { wild = -1, hog = -1, who = 0, x, facing = 1, park = 600, left = 0 }) {
  return page.evaluate(([w, h, k, sx, sf, px, lf]) => {
    const sc = window.__game.game.screen;
    sc.target = lf ? sc.total + lf : Math.max(sc.target, sc.total + 12); sc.setTotal(sc.total);
    sc.hog.at = h; sc.hog.to = -1; sc.hog.t = 0;
    sc.clumps.forEach((c, i) => { c.wild = i === w ? 1 : 0; });
    sc.seats.forEach((s, i) => { if (i === k) { s.x = sx; s.facing = sf; } else s.x = px; });
  }, [wild, hog, who, x, facing, park, left]);
}

export const SCENARIOS = {
  async terrace(server) {
    await withPage(server, 'skipTo=terrace&critters=0,1&recipes=59', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'terrace' && s0.top.ing === 'mint' && s0.top.target > 0, `the terrace is up as a mint visit (${s0.screen}, ${s0.top.ing}, target ${s0.top.target})`);
      assert(s0.top.clumps.length === 6 && s0.top.clumps.every((c) => c[1] === 3), `six full clumps (${s0.top.clumps.map((c) => c[1]).join()})`);
      // the rules alone: no hedgehog under any clump and nothing grown wild
      await setBed(page, { who: 0, x: 274, park: 375 });
      await api.step(1);
      for (let k = 1; k <= 3; k++) {
        await api.press(0, { action: true }, 1, 0);
        await api.step(2);
        const s = await api.summary();
        assert(seat0(s).count === k && s.top.clumps[2][1] === 3 - k, `snip ${k}: +1 and the clump a stage shorter (count ${seat0(s).count}, snips ${s.top.clumps[2][1]})`);
        if (k === 1) { assert(seat0(s).reachT > 0 && seat0(s).anim === 'snip', `the snip beat plays (reachT ${seat0(s).reachT}, anim '${seat0(s).anim}')`); await api.shot('terrace-snip'); }
        await api.step(SNIP_FRAMES);
      }
      await api.press(0, { action: true }, 1, 2);
      const bare = await api.summary();
      assert(seat0(bare).count === 3 && bare.top.clumps[2][1] === 0, `a press at stubble is nothing (count ${seat0(bare).count})`);
      await api.step(REGROW_STEP + 1);
      const grown = await api.summary();
      assert(grown.top.clumps[2][1] === 1, `a stage grows back after ${REGROW_STEP} frames (snips ${grown.top.clumps[2][1]})`);
      assert(grown.top.eeks === 0 && grown.top.topiaries === 0 && seat0(grown).gag === 0, `and no joke was dealt into the rules (eeks ${grown.top.eeks}, topiaries ${grown.top.topiaries})`);
    });
  },

  async terraceHedgehog(server) {
    await withPage(server, 'skipTo=terrace&critters=1,0&recipes=59', async (api, page) => {
      await api.step(2);
      // asleep under clump 3, seat 0 (Sorrel) at its left facing it, seat 1 parked out of the way
      await setBed(page, { hog: 3, who: 0, x: 342, facing: 1, park: 560 });
      // step to a frame with the snore's Z well up off it (the tell a sharp eye can spot)
      const f0 = await page.evaluate(() => window.__game.game.screen.frame);
      await api.step(((20 - f0 - 3 * 17) % SNORE_EVERY + SNORE_EVERY) % SNORE_EVERY + 1);
      await api.shot('terrace-hog-asleep');
      await api.press(0, { action: true }, 1, 0);
      await api.step(1);
      const w = await api.summary();
      assert(w.top.eeks === 1 && seat0(w).gag === HOG && seat0(w).gagT === HOG_BEAT - 1, `the snip at the hedgehog's clump wakes it: the joke starts (eeks ${w.top.eeks}, gag ${seat0(w).gag}, gagT ${seat0(w).gagT})`);
      assert(seat0(w).count === 0 && clump(w, 3).snips === 3, `no sprig, and the clump keeps its snips (count ${seat0(w).count}, snips ${clump(w, 3).snips})`);
      assert(seat0(w).anim === 'braced' && (await gagsUp(page)) >= 1, `the wind-up: braced for the ball, the '!' up (anim '${seat0(w).anim}')`);
      assert(w.top.hog.t === HOG_RUN - 1 && w.top.hog.to >= 0 && w.top.hog.to !== 3, `the hedgehog is off on its run, to sleep under another clump next (${JSON.stringify(w.top.hog)})`);
      // the stick does nothing through the joke
      await api.hold(0, { right: true });
      await api.step(4);
      await api.release(0);
      const held = await api.summary();
      assert(seat0(held).x === seat0(w).x, `the stick is locked while the ball comes in (x ${seat0(w).x} -> ${seat0(held).x})`);
      await api.step(3);
      await api.shot('terrace-hog-ball');
      // the bang: off the shins, EEK!, up in the air with the fur on end
      await api.step(BALL_IN - 8 + 7);
      const leap = await api.summary();
      assert(seat0(leap).anim === 'leap' && (await gagsUp(page)) >= 1, `the bang: EEK! and the leap (anim '${seat0(leap).anim}', gagT ${seat0(leap).gagT})`);
      await api.shot('terrace-hog-leap');
      // the look: down, hopping on one foot, while the hedgehog glares from its clump
      await api.step(LEAP_FRAMES);
      const hop = await api.summary();
      assert(seat0(hop).anim === 'ouchHop' && seat0(hop).gag === HOG, `the look: hopping on one foot (anim '${seat0(hop).anim}')`);
      assert(hop.top.hog.t < HOG_RUN - BALL_IN - REBOUND && hop.top.hog.at === 3, `the hedgehog is back at its clump and glaring (${JSON.stringify(hop.top.hog)})`);
      await api.shot('terrace-hog-hop');
      await api.step(seat0(hop).gagT);
      const done = await api.summary();
      assert(seat0(done).gag === 0 && seat0(done).gagT === 0 && seat0(done).anim === 'carry', `then the seat is a player again (gag ${seat0(done).gag}, anim '${seat0(done).anim}')`);
      assert(seat0(done).count === 0 && done.top.total === 0 && clump(done, 3).snips === 3, `and nothing was scored or lost (count ${seat0(done).count}, snips ${clump(done, 3).snips})`);
      await api.step(done.top.hog.t + 1);
      const slept = await api.summary();
      assert(slept.top.hog.t === 0 && slept.top.hog.at === w.top.hog.to, `and the hedgehog is asleep under the new clump (${JSON.stringify(slept.top.hog)})`);
      await api.press(0, { action: true }, 1, 0);
      await api.step(2);
      const got = await api.summary();
      assert(seat0(got).count === 1 && clump(got, 3).snips === 2, `the same clump now gives its sprig (count ${seat0(got).count}, snips ${clump(got, 3).snips})`);
    });
  },

  async terraceTopiary(server) {
    // Chicory in seat 0 and Cress in seat 1: two statues of two different critters
    await withPage(server, 'skipTo=terrace&critters=2,3&recipes=59', async (api, page) => {
      await api.step(2);
      await setBed(page, { wild: 2, who: 0, x: 240, facing: 1, park: 560 });
      await api.step(4);
      const tell = await api.summary();
      assert(clump(tell, 2).wild === 1 && clump(tell, 2).snips === 3, `the tell: clump 2 has grown wild (${JSON.stringify(clump(tell, 2))})`);
      await api.shot('terrace-wild');
      const total0 = tell.top.total;
      await api.press(0, { action: true }, 1, 0);
      await api.step(1);
      const f = await api.summary();
      assert(seat0(f).gag === TOPIARY && seat0(f).gagT === TOPIARY_BEAT - 1 && seat0(f).anim === 'frenzy', `the first snip at it: the shears run away with the critter (gag ${seat0(f).gag}, gagT ${seat0(f).gagT}, anim '${seat0(f).anim}')`);
      assert(seat0(f).count === 0 && f.top.total === total0 && clump(f, 2).snips === 3 && clump(f, 2).wild === 1, `nothing scored yet, the clump untouched (count ${seat0(f).count}, ${JSON.stringify(clump(f, 2))})`);
      assert((await gagsUp(page)) >= 1, 'the ?! is up');
      await api.hold(0, { left: true });
      await api.step(4);
      await api.release(0);
      const held = await api.summary();
      assert(seat0(held).x === seat0(f).x, `the stick is locked through the frenzy (x ${seat0(f).x} -> ${seat0(held).x})`);
      // seat 1 walks up and tries the same clump: a clump in a storm is nobody else's to snip
      await page.evaluate(() => { window.__game.game.screen.seats[1].x = 296; });
      await api.press(1, { action: true }, 1, 0);
      const other = await api.summary();
      assert(seat(other, 1).count === 0 && seat(other, 1).gag === 0 && seat(other, 1).reachT === 0, `another seat cannot snip the clump in the storm (count ${seat(other, 1).count}, gag ${seat(other, 1).gag})`);
      await page.evaluate(() => { window.__game.game.screen.seats[1].x = 560; });
      await api.step(FRENZY_FRAMES / 2 - 10);
      await api.shot('terrace-frenzy');
      // the bang
      await api.step(seat0(await api.summary()).gagT - LOOK_FRAMES + 3);
      const bang = await api.summary(), c2 = clump(bang, 2);
      assert(bang.top.topiaries === 1 && seat0(bang).gag === TOPIARY && seat0(bang).gagT < LOOK_FRAMES, `the bang: TA-DA (topiaries ${bang.top.topiaries}, gagT ${seat0(bang).gagT})`);
      assert(c2.statue === 1 && c2.wild === 0 && c2.snips === 0 && c2.face === -1, `the clump is a statue of seat 0, looking back at it (${JSON.stringify(c2)})`);
      assert(seat0(bang).count === 3 && bang.top.total === total0 + 3, `and its three snips are in the basket, +1 each (count ${seat0(bang).count}, total ${total0} -> ${bang.top.total})`);
      assert((await gagsUp(page)) >= 1, 'the TA-DA card is up');
      await api.shot('terrace-statue-chicory');
      // the look: back away from it, look up at it, turn to the room, bow
      await api.step(TURN_AT - 2 - (LOOK_FRAMES - seat0(bang).gagT));
      const look = await api.summary();
      assert(seat0(look).anim === 'admire' && seat0(look).facing === 1, `stood back, still facing it, looking up at it (anim '${seat0(look).anim}', facing ${seat0(look).facing})`);
      assert(Math.abs(seat0(look).x - CLUMP_X[2]) === BOW_GAP, `having stepped back to see it (x ${seat0(look).x}, statue at ${CLUMP_X[2]})`);
      await api.step(BOW_AT + 12 - (TURN_AT - 2));
      const bow = await api.summary();
      assert(seat0(bow).anim === 'bow' && seat0(bow).facing === -1, `then the bow, turned to the room with the statue behind (anim '${seat0(bow).anim}', facing ${seat0(bow).facing})`);
      assert(seat0(bow).count === 3 && bow.top.total === total0 + 3, 'still nothing lost');
      await api.shot('terrace-bow');
      await api.step(seat0(bow).gagT);
      const after = await api.summary();
      assert(seat0(after).gag === 0 && seat0(after).anim === 'carry', `then the seat is a player again (gag ${seat0(after).gag}, anim '${seat0(after).anim}')`);
      await api.hold(0, { left: true });
      await api.step(4);
      await api.release(0);
      assert(seat0(await api.summary()).x < seat0(after).x, 'and can walk again');
      // the statue stands, sprouting as it grows back, until the clump is full again
      const sinceBang = TOPIARY_BEAT - FRENZY_FRAMES - 1 + 4;
      await api.step(2 * REGROW_STEP - sinceBang + 2);
      const sprout = await api.summary();
      assert(clump(sprout, 2).statue === 1 && clump(sprout, 2).snips === 2, `the statue still stands two stages back (${JSON.stringify(clump(sprout, 2))})`);
      const nope = seat0(sprout).count;
      await page.evaluate(() => { window.__game.game.screen.seats[0].x = 262; });
      await api.press(0, { action: true }, 1, 2);
      assert(seat0(await api.summary()).count === nope, 'and a statue is not for snipping');
      await api.shot('terrace-sprouts');
      await api.step(REGROW_STEP + 2);
      const back = await api.summary();
      assert(clump(back, 2).statue === 0 && clump(back, 2).snips === 3, `then it has grown back into a clump (${JSON.stringify(clump(back, 2))})`);

      // the second critter: Cress's own statue at clump 4, from its right
      await setBed(page, { wild: 4, who: 1, x: 498, facing: -1, park: 120 });
      await api.step(2);
      await api.press(1, { action: true }, 1, 0);
      await api.step(FRENZY_FRAMES + 4);
      const cress = await api.summary();
      assert(clump(cress, 4).statue === 2 && clump(cress, 4).face === 1 && cress.top.topiaries === 2, `a statue of seat 1 this time, facing back at it (${JSON.stringify(clump(cress, 4))})`);
      await api.shot('terrace-statue-cress');
      await api.step(LOOK_FRAMES);

      // two left to go: the frenzy's snips are +1 each up to the target and no further, and the round ends on the TA-DA
      await setBed(page, { wild: 0, who: 0, x: 96, facing: -1, park: 560, left: 2 });
      const last0 = await api.summary();
      await api.step(2);
      await api.press(0, { action: true }, 1, 0);
      await api.step(FRENZY_FRAMES + 4);
      const last = await api.summary();
      assert(last.top.total === last0.top.total + 2 && last.top.total === last.top.target, `the frenzy scores up to the target and no further (${last0.top.total} -> ${last.top.total} of ${last.top.target})`);
      assert(last.top.phase === 1 && clump(last, 0).statue === 1 && seat0(last).gag === 0, `the round ends on the TA-DA with the statue standing (phase ${last.top.phase}, ${JSON.stringify(clump(last, 0))})`);
      await api.shot('terrace-tada-last');
    });

    // Barley eats the evidence: a leap at the statue's head and a bite out of it, instead of the bow
    await withPage(server, 'skipTo=terrace&critters=0,1&recipes=59', async (api, page) => {
      await api.step(2);
      await setBed(page, { wild: 3, who: 0, x: 400, facing: -1, park: 120 });
      await api.step(2);
      await api.press(0, { action: true }, 1, 0);
      await api.step(FRENZY_FRAMES);
      const bang = await api.summary();
      assert(clump(bang, 3).statue === 1 && seat0(bang).anim === 'admire' && seat0(bang).count === 3, `Barley's statue (${JSON.stringify(clump(bang, 3))}, anim '${seat0(bang).anim}', count ${seat0(bang).count})`);
      await api.step(CHOMP_AT + 1);
      const chomp = await api.summary();
      assert(clump(chomp, 3).bite === 1 && seat0(chomp).anim === 'leapBite', `CHOMP: a bite out of the statue's head (bite ${clump(chomp, 3).bite}, anim '${seat0(chomp).anim}')`);
      assert(Math.abs(seat0(chomp).x - CLUMP_X[3]) === BITE_GAP, `from right up at it (x ${seat0(chomp).x})`);
      await api.shot('terrace-bite');
      await api.step(MMM_AT + 2 - (CHOMP_AT + 1));
      const munch = await api.summary();
      assert(seat0(munch).anim === 'munch' && (await gagsUp(page)) >= 1, `down again, backed off and chewing it over, MMM! (anim '${seat0(munch).anim}')`);
      assert(Math.abs(seat0(munch).x - CLUMP_X[3]) === BOW_GAP, `stood back from it with the bite in view (x ${seat0(munch).x})`);
      await api.shot('terrace-munch');
      await api.step(seat0(munch).gagT);
      const done = await api.summary();
      assert(seat0(done).gag === 0 && seat0(done).count === 3 && clump(done, 3).bite === 1, `then a player again, nothing lost and the bite still out of it (count ${seat0(done).count}, ${JSON.stringify(clump(done, 3))})`);
      await api.step(4);
      await api.shot('terrace-bitten');
    });
  },
};

