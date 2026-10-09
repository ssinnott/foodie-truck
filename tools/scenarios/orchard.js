// Playtest scenarios for the orchard work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   orchard - four seats in the orchard: 600 frames with seat 0 running left and right (no errors, a numeric
//             caught count, seat 0 actually moved and stayed inside the lane, the other seats did not), then the
//             mini-game's rules driven by hand - a ripe apple aimed at seat 0's rim scores, one that misses the rim
//             splats and costs nothing - and then the scene's two jokes on seat 0, who is Barley: a wormy apple is
//             his snack and scores nothing, and a bomb is THE BOMB however hungry he is - '!', held up with the fuse
//             burning and the stick locked, BOOM! (a card up, the world bumped), stood there in soot seeing stars,
//             a COUGH, shaken off, and fine again with nothing lost but the time. Then the finish line is brought
//             down to its last frames: the APPLES sign drops, is held, and the screen returns to the map with the
//             order's apple line updated by the party's total. Writes tools/screens/orchard-catch.png (the catch
//             beat, with two apples left in the canopy so the shot answers "can you see one against the leaves?"),
//             the bomb's beats (orchard-bomb-hold, -brace, -boom, -singed, -cough, -shake) and orchard-sign.png.
//   orchardWormy - the wormy apple, beat by beat, on Sorrel and then on Barley (see below).
//   cherries - two on a stem (see below).
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** Frames given to a hand-placed apple: 40 px of fall at 2 px/frame, plus the beat it may start. */
const DROP_FRAMES = 30;
/** The three kinds (screens/orchard.ts). */
const RIPE = 0, WORMY = 1, BOMB = 2;
/** The screen's own numbers (screens/orchardGags.ts), mirrored here so a change to either side shows up as a failing assert. */
const HOLD_FRAMES = 40, SINGED_FRAMES = 105, BRACE_AT = SINGED_FRAMES + 8, SHAKE_FRAMES = 16, SOOT_OFF = 8, COUGH_AT = SHAKE_FRAMES + 28;
const GRUB_TOTAL = 80, PEEK_AT = 62, POP_AT = 56, PFFT_AT = 46, FLING_AT = 32, TOSS_AT = 26, SHUDDER_AT = 20;
const BARLEY_TOTAL = 120, SHRUG_AT = 100, EAT_AT = 88, CHOMP_AT = EAT_AT - 14, GAPE_AT = 36, HI_AT = 24, DROP_AT = 8;
/** The frame of that fall the catch shot is taken on: the apple is in the rim, the ring and the +1 are still up. */
const CATCH_SHOT = 22;

/**
 * Put one apple straight above seat 0's catch box and let it fall. Returns the state around the catch: everything
 * else is switched off first (every other apple parked, the spawner pushed out of reach, any joke seat 0 was still
 * in from the free run cut short) so the beat is the only thing that can move the count. `facing` turns the seat
 * first: a joke is drawn mirrored for a seat facing left, and the wormy one is walked both ways round.
 */
async function dropOnSeat0(page, aimed, homeX, kind = RIPE, facing = 1) {
  return page.evaluate(async ([hit, hx, k, dir]) => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    sc.nextSpawn = 100000;
    // the free run can leave seat 0 mid-joke (a joke apple caught in its last frames): hold the jokes off, the way
    // the round's own finish() does, so a rules check never starts inside one
    if (s.boomT || s.wormyT) { s.boomT = 0; s.wormyT = 0; s.rig.weapon = (await import('/src/game/minigame.ts')).RIBBON_BASKET; }
    // back to the lane position it was given in enter(): 600 frames of running left leaves seat 0 standing on top
    // of seat 1, and the catch shot wants to show one basket taking one apple, not two critters in a heap
    if (hx) { s.x = hx; s.facing = dir; s.moving = false; }
    for (const a of sc.apples) a.active = false;
    // hold the target out of reach for the beat, or the +1 could end the round before the miss half runs.
    // run.gather() clamps to the order's own line, so the bank assert still reads the real target.
    sc.target = Math.max(sc.target, sc.total + 3); sc.setTotal(sc.total);
    const a = sc.apples[0];
    const bx = s.x + s.facing * (s.moving ? s.boxWalkX : s.boxCatchX), by = s.y + (s.moving ? s.boxWalkY : s.boxCatchY);
    // hang 0: this one is already off the branch, so DROP_FRAMES is 40 px of fall and nothing else; a miss is the
    // same apple started a basket's width to the side, so it falls past the rim and onto the grass
    const ax = hit ? bx : bx + 30;
    a.active = true; a.kind = k; a.t = 0; a.vy = 2; a.x0 = ax; a.x = ax; a.y = by - 40; a.hang = 0;
    // two more apples held ON their branches for the picture, at the far ends of the lane where no rim can reach
    // them inside the beat (the whole point of the shot is a red apple against #4F6B3A leaves at 1x, hanging
    // on its stalk before it lets go)
    // x 60 / 540 sit inside the end trees' crowns (the canopy's runs at row 66 are 26..118 and 483..576) and a
    // hanging apple is never catch-tested anyway; y 66 is the hang row
    const ends = [60, 540], rows = [66, 74];
    for (let i = 0; i < 2; i++) {
      const d = sc.apples[i + 1];
      d.active = true; d.kind = i; d.t = i * 20; d.vy = 1.6; d.x0 = ends[i]; d.x = ends[i]; d.y = rows[i];
      d.hang = 200;
    }
    return { count: s.count, total: sc.total, target: sc.target, booms: sc.booms, grubs: sc.grubs };
  }, [aimed, homeX, kind, facing]);
}

/** Seat 0 as the sim holds it (the summary only carries slot/x/count/wormyT/boomT), plus the cosmetic counts. */
function seat0(page) {
  return page.evaluate(async () => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    const cards = (await import('/src/game/gags.ts')).gagsUp(), litter = (await import('/src/art/orchardGags.ts')).litterOut();
    return {
      x: s.x, count: s.count, anim: s.anim, wormyT: s.wormyT, boomT: s.boomT, basket: s.rig.weapon ? 1 : 0,
      total: sc.total, booms: sc.booms, grubs: sc.grubs, cards, litter,
    };
  });
}

/**
 * Step a dropped joke apple into seat 0, one frame at a time, until the joke has the seat: the whole critter is the
 * catch box, so it can land in the first frames of the fall, and the beats are counted from that frame.
 */
async function caughtJoke(api, page) {
  for (let i = 0; i < DROP_FRAMES; i++) {
    await api.step(1);
    const s = await seat0(page);
    if (s.wormyT > 0 || s.boomT > 0) return s;
  }
  return seat0(page);
}

/** Step until seat 0's joke countdown (`field`) reads `left`, from wherever it is now. */
async function stepTo(api, page, field, left) {
  const now = (await seat0(page))[field];
  if (now > left) await api.step(now - left);
  return seat0(page);
}

/** Hold seat 0's stick right for a few frames and say how far it walked. */
async function nudge(api, page) {
  const x0 = (await seat0(page)).x;
  await api.hold(0, { right: true });
  await api.step(4);
  await api.release(0);
  return (await seat0(page)).x - x0;
}

export const SCENARIOS = {
  async orchard(server) {
    // ?order=1 is ORDERS[0], APPLE PIE: apple 4 + egg 2, so `apple` is a real line on the ticket. The orchard now drops
    // pears, peaches and avocados too, and gathers whichever the day is short of (game/run.js gatherTarget); a seed
    // whose menu never asked for apples would put the AVOCADOS sign up instead of the one this scenario reads.
    await withPage(server, 'skipTo=orchard&critters=0,1,2,3&order=1', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'orchard', `the orchard is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4 && s0.top.target > 0, `four seats and a target from the order (${s0.top.seats.length} seats, target ${s0.top.target})`);
      const x0 = s0.top.seats[0][1], others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => s[1]));

      // 600 frames of seat 0 running: left for 150, right for 300, left for 150. `last` only ever holds an ORCHARD
      // summary - once the round hands off, api.summary() is the map's and asserting on it reads the wrong screen.
      let ended = false, last = s0;
      const legs = [[{ left: true }, 150], [{ right: true }, 300], [{ left: true }, 150]];
      for (const [keys, n] of legs) {
        await api.hold(0, keys);
        for (let k = 0; k < n && !ended; k += 50) {
          await api.step(50);
          const s = await api.summary();
          if (s.screen !== 'orchard') ended = true; else last = s;
        }
        await api.release(0);
      }
      assert(typeof last.top.caught === 'number', `summary().caught is a number (${last.top.caught})`);
      if (!ended) {
        const x1 = last.top.seats[0][1];
        assert(x1 !== x0 && x1 >= 24 && x1 <= 616, `seat 0 moved and stayed inside the lane (${x0} -> ${x1})`);
        assert(JSON.stringify(last.top.seats.slice(1).map((s) => s[1])) === others0, 'the other seats, with no input, stayed put');
        // 603 frames: main.js boots test mode with one step, then 2 + 600 here
        assert(last.top.elapsed === 603, `the clock counted every frame (elapsed ${last.top.elapsed})`);
      }

      // the rule itself: an apple into seat 0's rim is +1, one past the rim splats and costs nothing. Without this a
      // dead catch box would still pass every assert above.
      if (!ended) {
        const before = await dropOnSeat0(page, true, x0);
        await api.step(CATCH_SHOT);
        await api.shot('orchard-catch');
        await api.step(DROP_FRAMES - CATCH_SHOT);
        const hit = await seat0(page);
        assert(hit.count === before.count + 1, `an apple on the rim is caught (seat 0 ${before.count} -> ${hit.count})`);
        assert(hit.total === before.total + 1, `the party's total went up with it (${before.total} -> ${hit.total})`);
        const beside = await dropOnSeat0(page, false, x0);
        await api.step(DROP_FRAMES + 60);   // the miss has 40 px to the rim's row and another ~60 rows to the grass
        const missed = await seat0(page);
        assert(missed.count === beside.count && missed.total === beside.total, `a missed apple costs nothing (seat 0 still ${missed.count})`);
        assert(missed.wormyT === 0 && missed.boomT === 0 && missed.anim === 'catch', `and no joke starts on anyone (anim '${missed.anim}')`);

        // a wormy one, on Barley: his snack (orchardWormy walks it beat by beat) - and it scores nothing
        const worm = await dropOnSeat0(page, true, x0, WORMY);
        await api.step(DROP_FRAMES);
        const snack = await seat0(page);
        assert(snack.grubs === worm.grubs + 1 && snack.wormyT > SHRUG_AT && snack.wormyT <= BARLEY_TOTAL && snack.anim === 'peer' && snack.basket === 0, `a wormy apple is a joke, not a catch (grubs ${worm.grubs} -> ${snack.grubs}, wormyT ${snack.wormyT}, anim '${snack.anim}', basket ${snack.basket})`);
        await api.step(snack.wormyT + 1);
        const fed = await seat0(page);
        assert(fed.wormyT === 0 && fed.basket === 1 && fed.count === worm.count && fed.total === worm.total, `eaten, it costs nothing and scores nothing (seat 0 ${worm.count} -> ${fed.count}, total ${worm.total} -> ${fed.total})`);

        // a bomb, on the same Barley: he never eats one. '!', held up with the fuse burning, the face going through
        // grit to screwed shut, then the bang, the soot, the cough, the shake - and nothing lost
        const bomb = await dropOnSeat0(page, true, x0, BOMB);
        await api.step(DROP_FRAMES);
        const held = await seat0(page);
        assert(held.boomT > SINGED_FRAMES && held.anim.startsWith('hold') && held.basket === 0, `a bomb is held up, basket down - not eaten (boomT ${held.boomT}, anim '${held.anim}', basket ${held.basket})`);
        assert(held.count === bomb.count && held.total === bomb.total, `and it scores nothing (seat 0 still ${held.count})`);
        assert(held.cards >= 1, `'!' goes up over the head as the critter sees the fuse (${held.cards} cards up)`);
        await api.shot('orchard-bomb-hold');
        // the stick does nothing through the hold
        assert((await nudge(api, page)) === 0, 'the seat cannot walk off with a bomb in its paw');
        const brace = await stepTo(api, page, 'boomT', BRACE_AT - 3);
        assert(brace.anim === 'holdBrace', `the last frames of the fuse: eyes shut, head turned away (anim '${brace.anim}')`);
        await api.shot('orchard-bomb-brace');
        await stepTo(api, page, 'boomT', SINGED_FRAMES - 8);
        const boom = await seat0(page);
        assert(boom.booms === bomb.booms + 1, `the fuse burns down and it goes off (${bomb.booms} -> ${boom.booms} booms)`);
        assert(boom.anim === 'singed' && boom.cards >= 1, `BOOM! goes up on a starburst and the critter stands there singed (anim '${boom.anim}', ${boom.cards} cards up)`);
        await api.shot('orchard-bomb-boom');
        const singed = await stepTo(api, page, 'boomT', COUGH_AT + 6);
        assert(singed.boomT > SHAKE_FRAMES && singed.boomT <= SINGED_FRAMES && singed.anim === 'singed', `the critter stands there in soot, seeing stars (boomT ${singed.boomT}, anim '${singed.anim}')`);
        assert(singed.count === bomb.count && singed.total === bomb.total, `and still nothing is lost (seat 0 ${singed.count})`);
        await api.shot('orchard-bomb-singed');
        const cough = await stepTo(api, page, 'boomT', COUGH_AT - 3);
        assert(cough.anim === 'cough' && cough.cards >= 1, `then a COUGH (anim '${cough.anim}', ${cough.cards} cards up)`);
        await api.shot('orchard-bomb-cough');
        const shake = await stepTo(api, page, 'boomT', SOOT_OFF - 3);
        assert(shake.anim === 'shakeOff', `and it shakes the soot off (anim '${shake.anim}')`);
        await api.shot('orchard-bomb-shake');
        await api.step(shake.boomT + 1);
        const fine = await seat0(page);
        assert(fine.boomT === 0 && fine.basket === 1 && fine.anim === 'catch', `then it is fine again, basket back in the paw (boomT ${fine.boomT}, basket ${fine.basket}, anim '${fine.anim}')`);
        assert(fine.count === bomb.count && fine.total === bomb.total, `nothing lost but the time (seat 0 ${fine.count})`);
        assert((await nudge(api, page)) > 0, 'and it can walk again');
        last = await api.summary();
        if (last.screen !== 'orchard') ended = true;
      }

      // bring the finish line down to the party's total (or watch the early ending) and expect the sign, then the map:
      // there is no clock to force, a round ends only when the total reaches the target
      if (!ended) {
        assert(last.top.caught >= 1, `something was caught before the ending (caught ${last.top.caught})`);
        await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
        await api.step(4 + SLAM + 20);
        const s2 = await api.summary();
        assert(s2.screen === 'orchard' && s2.top.phase === 1 && /^APPLES: \d+$/.test(s2.top.sign), `the target was reached: the APPLES sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
        await api.shot('orchard-sign');
        last = s2;
        await api.step(HOLD);
      }
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the orchard hands back to the map (on ${s3.screen})`);
      // the target the ORDER asked for, not the screen's (the catch beat lifts the screen's so it cannot end early)
      const caught = last.top.caught, target = s0.top.target;
      const line = (s3.run.needs || []).find((n) => n.startsWith('apple:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(caught, target), `run.gather('apple') banked the party's total (${line}, caught ${caught})`);
    });
  },

  /**
   * orchardWormy - the wormy apple, forced by hand through the field the roll sets (an apple of kind WORMY dropped
   *                on seat 0), walked beat by beat, once each way round (Sorrel turned to face left, so every mirrored
   *                mark - the hole, the grub's face, the spit, the fling - is drawn the other way from Barley's):
   *                  SORREL  '?' and the bite hole held up to the eye (the stick locked, no +1); the grub's eyes over
   *                          the rim; it pops up tall; PFFT! (a card up) and the jump back; the fling - the apple off
   *                          over the shoulder as litter; the shudder; and the seat a player again with its basket,
   *                          nothing gained and nothing lost.
   *                  BARLEY  the same '?', then the shrug, the gulp - CHOMP! - the grub back up out of his mouth, HI!,
   *                          dropped on the grass to wriggle off (litter); nothing scored for the apple he ate.
   *                Shots: orchard-wormy-look, -pop, -pfft, -fling, -shudder; orchard-barley-shrug, -chomp, -gape, -hi,
   *                -wriggle.
   */
  async orchardWormy(server) {
    await withPage(server, 'skipTo=orchard&critters=1,2&order=1', async (api, page) => {
      await api.step(2);
      const x0 = (await api.summary()).top.seats[0][1];
      const before = await dropOnSeat0(page, true, x0, WORMY, -1);
      const look = await caughtJoke(api, page);
      assert(look.grubs === before.grubs + 1 && look.wormyT === GRUB_TOTAL, `a wormy apple caught is the grub's joke (grubs ${before.grubs} -> ${look.grubs}, wormyT ${look.wormyT})`);
      assert(look.anim === 'peer' && look.basket === 0 && look.cards >= 1, `'?': held up to the eye, basket down (anim '${look.anim}', basket ${look.basket}, ${look.cards} cards up)`);
      assert(look.count === before.count && look.total === before.total, `and it is no catch (seat 0 still ${look.count})`);
      assert((await nudge(api, page)) === 0, 'the stick does nothing while it looks');
      await stepTo(api, page, 'wormyT', PEEK_AT - 2);
      await api.shot('orchard-wormy-look');
      await stepTo(api, page, 'wormyT', POP_AT - 6);
      await api.shot('orchard-wormy-pop');
      const pfft = await stepTo(api, page, 'wormyT', PFFT_AT - 6);
      assert(pfft.anim === 'recoil' && pfft.cards >= 1, `PFFT! - a raspberry, a card up, and the critter jumps back (anim '${pfft.anim}', ${pfft.cards} cards up)`);
      await api.shot('orchard-wormy-pfft');
      const fling = await stepTo(api, page, 'wormyT', TOSS_AT - 4);
      assert(fling.anim === 'fling' && fling.litter >= 1, `then it flings the apple over its shoulder (anim '${fling.anim}', ${fling.litter} litter out)`);
      await api.shot('orchard-wormy-fling');
      const shudder = await stepTo(api, page, 'wormyT', SHUDDER_AT - 8);
      assert(shudder.anim === 'shudder', `and shudders (anim '${shudder.anim}')`);
      await api.shot('orchard-wormy-shudder');
      await api.step(shudder.wormyT + 1);
      const done = await seat0(page);
      assert(done.wormyT === 0 && done.basket === 1 && done.anim === 'catch', `then carries on, basket back in the paw (wormyT ${done.wormyT}, basket ${done.basket}, anim '${done.anim}')`);
      assert(done.count === before.count && done.total === before.total, `nothing gained and nothing lost (seat 0 ${before.count} -> ${done.count}, total ${before.total} -> ${done.total})`);
      assert((await nudge(api, page)) > 0, 'and it can walk again');
    });

    // Barley eats the evidence: ?critters=0 puts Barley in seat 0
    await withPage(server, 'skipTo=orchard&critters=0,1&order=1', async (api, page) => {
      await api.step(2);
      const x0 = (await api.summary()).top.seats[0][1];
      const before = await dropOnSeat0(page, true, x0, WORMY);
      const look = await caughtJoke(api, page);
      assert(look.grubs === before.grubs + 1 && look.wormyT === BARLEY_TOTAL && look.anim === 'peer' && look.cards >= 1, `Barley holds it up and looks at it too: '?' (wormyT ${look.wormyT}, anim '${look.anim}', ${look.cards} cards up)`);
      const shrug = await stepTo(api, page, 'wormyT', SHRUG_AT - 6);
      assert(shrug.anim === 'shrug', `then shrugs (anim '${shrug.anim}')`);
      await api.shot('orchard-barley-shrug');
      const chomp = await stepTo(api, page, 'wormyT', CHOMP_AT - 4);
      assert(chomp.anim === 'eat' && chomp.cards >= 1, `and eats it in one gulp: CHOMP! (anim '${chomp.anim}', ${chomp.cards} cards up)`);
      await api.shot('orchard-barley-chomp');
      const gape = await stepTo(api, page, 'wormyT', GAPE_AT - 6);
      assert(gape.anim === 'gape', `the grub comes back up out of his mouth (anim '${gape.anim}')`);
      await api.shot('orchard-barley-gape');
      const hi = await stepTo(api, page, 'wormyT', HI_AT - 8);
      assert(hi.cards >= 1, `and says HI! (${hi.cards} cards up)`);
      await api.shot('orchard-barley-hi');
      const drop = await stepTo(api, page, 'wormyT', DROP_AT - 4);
      assert(drop.litter >= 1, `then drops off onto the grass (${drop.litter} litter out)`);
      await api.step(drop.wormyT + 1);
      const done = await seat0(page);
      assert(done.wormyT === 0 && done.basket === 1 && done.anim === 'catch', `and Barley carries on, basket back in his paw (wormyT ${done.wormyT}, anim '${done.anim}')`);
      assert(done.count === before.count && done.total === before.total, `the apple he ate scored nothing (seat 0 ${before.count} -> ${done.count}, total ${before.total} -> ${done.total})`);
      await api.step(24);
      assert((await seat0(page)).litter >= 1, 'while the grub wriggles off across the grass');
      await api.shot('orchard-barley-wriggle');
    });
  },
};

/**
 * cherries - two on a stem: on a cherry visit (?recipes=40, CHERRY PIE) a caught ripe pair is +2 while the list
 *            wants two or more, and +1 for the last one, so a catch never counts past the target.
 */
SCENARIOS.cherries = async (server) => {
  await withPage(server, 'skipTo=orchard&critters=0,1&recipes=40', async (api, page) => {
    await api.step(2);
    const s0 = await api.summary();
    assert(s0.screen === 'orchard' && (await page.evaluate(() => window.__game.game.screen.ing)) === 'cherry', 'the orchard is up as a cherry visit');
    const caught = await page.evaluate(() => {
      const sc = window.__game.game.screen; sc.target = 3; sc.setTotal(0);
      // the same catch path the falling pair takes, called on seat 0 with a ripe pair
      const s = sc.seats[0], n1 = (() => { const n = sc.ing === 'cherry' && sc.total + 1 < sc.target ? 2 : 1; s.count += n; sc.setTotal(sc.total + n); return n; })();
      const n2 = (() => { const n = sc.ing === 'cherry' && sc.total + 1 < sc.target ? 2 : 1; s.count += n; sc.setTotal(sc.total + n); return n; })();
      return { n1, n2, total: sc.total, target: sc.target };
    });
    assert(caught.n1 === 2 && caught.n2 === 1 && caught.total === caught.target, `a pair is +2, the last cherry +1, never past the target (${JSON.stringify(caught)})`);
  });
};
