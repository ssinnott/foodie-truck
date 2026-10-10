// Playtest scenarios for Bramble Bank (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   bramble - four seats on the bank on the STRAWBERRY TART order, so the target is the order's own strawberry
//            line and not the fallback. Then, in order:
//              THE BANK     the truck arrives to a planted bank: six bushes, SEED_RIPE ripe berries spread over them.
//              REAL INPUT   seat 0 is walked along the path with the stick (it moved, it stayed inside the path, and
//                           the three seats with no input stayed exactly where they were), walked under the nearest
//                           bush with a ripe berry on it, and `action`-ed: one berry off that bush (its ripe mask
//                           lost one bit), the seat's count and the party's total up by one, the reach beat playing.
//              NOTHING      `action` under a bush with nothing ripe on it does nothing at all.
//              RIPENING     a berry ripens on its own inside RIPEN_MIN..RIPEN_MAX frames of the last.
//              THE HAND-OFF the finish line is brought down to the party's total: the STRAWBERRIES sign drops, is held, and the
//                           screen hands back to the map with the order's strawberry line updated.
//            Both jokes are held off (every thorn and every squishy berry cleared before the rules are driven), and
//            the round ends having seen neither. Shots: tools/screens/bramble-pick.png (mid-reach, the berry in the
//            air) and bramble-sign.png.
//   brambleThorn  - the thorn, beat by beat. Writes bramble-thorn-tell, -leap, -hop.
//   brambleSquish - the squishy one, beat by beat, on Sorrel and then on Barley (who licks it off), a round ended in
//            the middle of one, a second berry's juice, and the deal itself. Writes bramble-squish-tell, -hold, -splut,
//            -coat, -lick, -shake, -barley, -coat-blackberry.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** ?recipes=13 fixes the menu to ORDERS[13], STRAWBERRY TART: strawberry 4 + butter 2, so `strawberry` is a real line. */
const BOOT = 'skipTo=bramble&critters=0,1,2,3&recipes=13';
/** The screen's own numbers, mirrored here so a change to either side shows up as a failing assert. */
const BUSH_X = [70, 170, 270, 370, 470, 570], REACH_FRAMES = 12, RIPEN_MAX = 120, SEED_RIPE = 6;
/** art/brambleProps.ts SPOT's x offsets: a bush at an odd index is drawn mirrored, its spots with it. */
const SPOT_DX = [-16, 14, -2];
const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
const ripeTotal = (s) => s.top.bushes.reduce((a, m) => a + bits(m), 0);

/** The jokes (screens/brambleGags.ts), mirrored likewise. */
const DEAL_ODDS = 7;
const PRICK_REACH = 6, PRICK_FREEZE = 6, PRICK_LEAP = 14, PRICK_HOP = 36, PRICK_SETTLE = 8;
const PRICK_TOTAL = PRICK_REACH + PRICK_FREEZE + PRICK_LEAP + PRICK_HOP + PRICK_SETTLE;
const SQUISH_HOLD = 30, SQUISH_SWELL = 14, SQUISH_DRIP = 70, SQUISH_LICK = 24, SQUISH_SHAKE = 16;
const SQUISH_TOTAL = SQUISH_HOLD + SQUISH_DRIP + SQUISH_LICK + SQUISH_SHAKE;
const GULP_SHOCK = 30, GULP_LICK = 18, GULP_LICKS = 3, GULP_NOM = 8, GULP_PAT = 10;
const GULP_TOTAL = SQUISH_HOLD + GULP_SHOCK + GULP_LICK * GULP_LICKS + GULP_PAT;
/** The muted juices (art/brambleProps.ts JUICE), and the two hexes no coat may ever be (SIGNAL.garden, SIGNAL.hot). */
const JUICE = { strawberry: '#9E4258', blackberry: '#5E3A63' }, NEVER = ['#F2C14E', '#E23A2E'];
/** A tell is shot with the picker this far from the bush, walking up to it. */
const TELL_STEP = 64;

/** Hold the finish line out of reach so a +1 can never end the round mid-test (run.gather still clamps to the order). */
function holdTarget(page) {
  return page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 6); sc.setTotal(sc.total); });
}

/** How many word cards (game/gags.ts) are up: the same module instance as the game's, since the URL is the same. */
function gagsUp(page) {
  return page.evaluate(async () => (await import('/src/game/gags.ts')).gagsUp());
}

/**
 * Lay a joke by hand, through the same masks the deal sets: ripening paused, every other joke on the bank cleared,
 * bush `i` given a ripe berry on spot `k` - its LOWEST ripe spot, so the reach takes that one - with `kind` ('thorn'
 * or 'squish') on it, and seat `seat` stood under that bush. Returns { i, k, ripe }.
 */
function layJoke(page, kind, seat, i, k) {
  return page.evaluate(([kd, st, bi, bk, xs]) => {
    const sc = window.__game.game.screen; sc.nextRipen = 100000;
    for (const b of sc.bushes) { b.thorn = 0; b.squish = 0; }
    const b = sc.bushes[bi];
    b.ripe = (b.ripe & ~((1 << bk) - 1)) | (1 << bk);
    b[kd] = 1 << bk;
    sc.seats[st].x = xs[bi];
    return { i: bi, k: bk, ripe: b.ripe };
  }, [kind, seat, i, k, BUSH_X]);
}

/** Stand seat `seat` at x, out of the way of the joke under test. */
function park(page, seat, x) {
  return page.evaluate(([st, px]) => { window.__game.game.screen.seats[st].x = px; }, [seat, x]);
}

/** A seat's pose root (the thorn's leap is the root going up: negative y). */
function rootY(page, seat) {
  return page.evaluate((st) => window.__game.game.screen.seats[st].player.pose.root.y, seat);
}

/**
 * Press `action` for one seat stood under a squishy berry and walk it to just past the bang: the hold (the stick
 * tried and locked, the '!' up) and the SPLUT. Returns the summaries read at each beat and `e`, the frames since the
 * press, so the caller walks on through the look that is that critter's own. `shots` names the shots to take.
 */
async function squishFrom(api, page, seat, shots) {
  const out = {};
  const x0 = (await api.summary()).top.seats[seat].x;
  await api.press(seat, { action: true }, 1, 0);
  await api.step(2);
  out.held = await api.summary();
  // the stick is locked through the hold: a held stick goes nowhere
  await api.hold(seat, { right: true });
  await api.step(4);
  await api.release(seat);
  out.locked = (await api.summary()).top.seats[seat].x === x0;
  // e = 6: on to two frames past the '!' (SQUISH_SWELL)
  await api.step(SQUISH_SWELL - 6 + 2);
  out.swell = await api.summary(); out.swellCards = await gagsUp(page);
  if (shots.hold) await api.shot(shots.hold);
  // e = 16: on to three frames past the bang (SQUISH_HOLD), the card popped and the juice in the air
  await api.step(SQUISH_HOLD - 16 + 3);
  out.bang = await api.summary(); out.bangCards = await gagsUp(page);
  if (shots.splut) await api.shot(shots.splut);
  out.e = SQUISH_HOLD + 3;
  return out;
}

export const SCENARIOS = {
  /**
   * brambleThorn - the thorn, the bank's old joke made big. A thorn is laid across a berry on bush 1 - an odd bush,
   *                drawn MIRRORED, where the thorn used to land on the wrong spot - and seat 0 reaches for it:
   *                  TELL     the thorn is drawn across the berry (bramble-thorn-tell);
   *                  WIND-UP  the reach gets the prick and no berry (pricks 1, prickT counting, anim pricked, the berry
   *                           still ripe, the thorn gone with the prick); the paw in the bush, no card yet, the stick
   *                           locked;
   *                  BANG     OW!: a card up, the bush shaking, and the critter up in the air (bramble-thorn-leap);
   *                  LOOK     hopping on one foot blowing on the paw, still locked (bramble-thorn-hop);
   *                  AFTER    PRICK_TOTAL frames in all, then the stick works, and the next reach picks the berry -
   *                           which hops from where it is DRAWN on the mirrored bush.
   */
  async brambleThorn(server) {
    await withPage(server, 'skipTo=bramble&critters=0,1&recipes=13', async (api, page) => {
      await api.step(2);
      await holdTarget(page);
      const b = await layJoke(page, 'thorn', 0, 1, 0);
      await park(page, 1, BUSH_X[4]);
      // the tell is shot from a step away, the way a picker walking up sees it (stood under the bush, its own name
      // plate is over the berry rows)
      await park(page, 0, BUSH_X[b.i] + TELL_STEP);
      await api.step(2);
      const tell = await api.summary();
      assert(tell.top.thorns[b.i] === 1 << b.k && tell.top.squishy.every((m) => m === 0), `the tell: a thorn across one berry and no other joke on the bank (thorns ${tell.top.thorns.join()})`);
      await api.shot('bramble-thorn-tell');
      await park(page, 0, BUSH_X[b.i]);
      await api.step(1);
      const x0 = BUSH_X[b.i];

      // --- the reach: no berry, the prick
      await api.press(0, { action: true }, 1, 0);
      await api.step(2);
      const p = await api.summary();
      assert(p.top.pricks === 1 && p.top.seats[0].count === 0 && p.top.total === 0, `the reach gets a prick and no berry (pricks ${p.top.pricks}, count ${p.top.seats[0].count})`);
      assert(p.top.seats[0].prickT === PRICK_TOTAL - 2 && p.top.seats[0].anim === 'pricked' && p.top.seats[0].basket === 'far', `the thorn's beat is running, ${PRICK_TOTAL} frames of it, the near paw reaching and the basket in the far one (prickT ${p.top.seats[0].prickT}, anim '${p.top.seats[0].anim}', basket '${p.top.seats[0].basket}')`);
      assert(p.top.bushes[b.i] === b.ripe && p.top.thorns[b.i] === 0, `the berry is still ripe and the thorn is gone (ripe ${p.top.bushes[b.i]}, thorns ${p.top.thorns[b.i]})`);

      // --- the wind-up: the paw in the bush and the critter rigid, no card yet, and the stick does nothing
      await api.hold(0, { right: true });
      await api.step(PRICK_REACH + PRICK_FREEZE - 2 - 1);
      const frozen = await api.summary(), cards0 = await gagsUp(page);
      assert(cards0 === 0 && frozen.top.seats[0].x === x0, `the beat before the bang: no card yet, and the stick is locked (cards ${cards0}, x ${x0} -> ${frozen.top.seats[0].x})`);

      // --- the bang: OW!, the bush shakes, and up it goes
      await api.step(1);
      const cards1 = await gagsUp(page);
      const shake = await page.evaluate((i) => window.__game.game.screen.shakes[i], b.i);
      assert(cards1 >= 1 && shake > 0, `OW!: the card is up and the bush is shaking (cards ${cards1}, shake ${shake})`);
      await api.step(3);
      const air = await rootY(page, 0);
      assert(air <= -12, `the critter leaps straight up off the path (root y ${air})`);
      await api.shot('bramble-thorn-leap');

      // --- the look: hopping on one foot, blowing on the paw, still locked
      await api.step(PRICK_LEAP - 3 + 6);
      const hop = await api.summary();
      assert(hop.top.seats[0].anim === 'pricked' && hop.top.seats[0].prickT > PRICK_SETTLE && hop.top.seats[0].x === x0, `then the hop on one foot, the stick still locked (prickT ${hop.top.seats[0].prickT}, x ${hop.top.seats[0].x})`);
      await api.shot('bramble-thorn-hop');
      await api.release(0);

      // --- after: the beat ends, the stick works, and the next reach picks the berry
      await api.step(hop.top.seats[0].prickT + 1);
      const done = await api.summary();
      assert(done.top.seats[0].prickT === 0 && done.top.seats[0].anim === 'carry' && done.top.seats[0].basket === 'near' && done.top.seats[0].count === 0, `${PRICK_TOTAL} frames and it is over, the basket back in the near paw, nothing lost (prickT ${done.top.seats[0].prickT}, anim '${done.top.seats[0].anim}', basket '${done.top.seats[0].basket}')`);
      await api.press(0, { action: true }, 1, 0);
      await api.step(2);
      const got = await api.summary();
      assert(got.top.seats[0].count === 1 && got.top.total === 1, `and the next reach picks it (count ${got.top.seats[0].count})`);
      const hopX = await page.evaluate(() => { const sc = window.__game.game.screen; return sc.hops[(sc.hopCursor + sc.hops.length - 1) % sc.hops.length].x0; });
      const drawnX = BUSH_X[b.i] + (b.i & 1 ? -1 : 1) * SPOT_DX[b.k];
      assert(hopX === drawnX, `on the mirrored bush the berry hops from where it is drawn (hop x ${hopX}, berry x ${drawnX})`);
    });
  },

  /**
   * brambleSquish - the squishy one, the bank's new joke, laid by hand through the masks the deal sets:
   *   SORREL   TELL     a berry swollen on the bush (bramble-squish-tell);
   *            WIND-UP  the reach takes it OFF the bush and into the paw (not scored, the basket to the far paw), the stick
   *                     locked, the '!' up as it starts to swell (bramble-squish-hold);
   *            BANG     SPLUT!: counted, a card up, the critter coated, the berry gone (bramble-squish-splut);
   *            LOOK     coated and dripping (bramble-squish-coat), the lick with MMM! up (bramble-squish-lick), the
   *                     juice line sweeping down as it shakes off (bramble-squish-shake);
   *            AFTER    SQUISH_TOTAL frames, the basket back, clean, the stick working, nothing lost, the spot a pea.
   *   BARLEY   the same berry, but the hungry one licks the juice off: MMM!, and the coat goes a third at every nom,
   *            the whole joke GULP_TOTAL frames (bramble-squish-barley).
   *   THE END  a round ended in the middle of one: finish() drops it, the coat and all.
   *   BLACKBERRY  a second berry's juice is its own, and purple (bramble-squish-coat-blackberry).
   *   THE DEAL  a thousand ripenings through the screen's own updateBushes: each joke about one in DEAL_ODDS, never
   *            both on one berry.
   */
  async brambleSquish(server) {
    // Sorrel in seat 0 and Barley in seat 1 (cast indices 1 and 0), on the strawberry visit
    await withPage(server, 'skipTo=bramble&critters=1,0&recipes=13', async (api, page) => {
      await api.step(2);
      await holdTarget(page);
      const s0 = await api.summary();
      assert(s0.top.seats[0].critter === 'sorrel' && s0.top.seats[1].critter === 'barley', `Sorrel in seat 0 and Barley in seat 1 (${s0.top.seats.map((s) => s.critter).join()})`);
      assert(s0.top.juice === JUICE.strawberry && !NEVER.includes(s0.top.juice), `a strawberry's juice is its own muted red-pink, never a signal (${s0.top.juice})`);

      // --- SORREL: the tell, shot from a step away as the thorn's is
      const b = await layJoke(page, 'squish', 0, 2, 1);
      await park(page, 1, BUSH_X[5]);
      await park(page, 0, BUSH_X[b.i] - TELL_STEP);
      await api.step(4);
      const tell = await api.summary();
      assert(tell.top.squishy[b.i] === 1 << b.k && tell.top.thorns.every((m) => m === 0), `the tell: one swollen berry on the bank (squishy ${tell.top.squishy.join()})`);
      await api.shot('bramble-squish-tell');
      await park(page, 0, BUSH_X[b.i]);
      await api.step(1);
      const total0 = tell.top.total, count0 = tell.top.seats[0].count;

      // --- the wind-up and the bang
      const sq = await squishFrom(api, page, 0, { hold: 'bramble-squish-hold', splut: 'bramble-squish-splut' });
      const held = sq.held.top.seats[0];
      assert(held.squishT === SQUISH_TOTAL - 2 && held.anim === 'admire' && held.basket === 'far' && held.wet === 0, `the reach takes it up to be admired, the basket to the far paw (squishT ${held.squishT}, anim '${held.anim}', basket ${held.basket})`);
      assert((sq.held.top.bushes[b.i] & (1 << b.k)) === 0 && sq.held.top.squishy[b.i] === 0, `the berry is off the bush and in the paw (ripe ${sq.held.top.bushes[b.i]}, squishy ${sq.held.top.squishy[b.i]})`);
      assert(held.count === count0 && sq.held.top.total === total0, `and it is not scored (count ${held.count}, total ${sq.held.top.total})`);
      assert(sq.locked, 'the stick is locked through the hold');
      assert(sq.swellCards >= 1 && sq.swell.top.squishes === 0, `it starts to wobble: the '!' is up, and it has not gone yet (cards ${sq.swellCards})`);
      const bang = sq.bang.top.seats[0];
      assert(sq.bang.top.squishes === 1 && sq.bangCards === 1, `SPLUT!: it goes, its card up and the '!' it interrupted knocked away (squishes ${sq.bang.top.squishes}, cards ${sq.bangCards})`);
      assert(bang.anim === 'drip' && bang.wet === 1 && bang.basket === 'far', `the critter is coated head to toe (anim '${bang.anim}', wet ${bang.wet}, basket '${bang.basket}')`);
      assert(bang.count === count0 && sq.bang.top.total === total0, `and still nothing scored, nothing lost (count ${bang.count})`);
      const splat = await page.evaluate(() => window.__game.game.screen.splats.some((sp) => sp.t < 20));
      assert(splat, 'the juice is on the path');

      // --- the look: dripping, the lick (MMM!), the shake
      let e = sq.e;
      await api.step(30); e += 30;
      const coat = await api.summary();
      assert(coat.top.seats[0].wet === 1 && coat.top.seats[0].anim === 'drip', `stood coated, dripping (wet ${coat.top.seats[0].wet})`);
      await api.shot('bramble-squish-coat');
      await api.step(SQUISH_HOLD + SQUISH_DRIP + 4 - e); e = SQUISH_HOLD + SQUISH_DRIP + 4;
      const lick = await api.summary(), lickCards = await gagsUp(page);
      assert(lick.top.seats[0].anim === 'lick' && lickCards >= 1 && lick.top.seats[0].wet === 1, `then it licks a paw: MMM! (anim '${lick.top.seats[0].anim}', cards ${lickCards})`);
      await api.shot('bramble-squish-lick');
      const shakeAt = SQUISH_HOLD + SQUISH_DRIP + SQUISH_LICK + SQUISH_SHAKE / 2;
      await api.step(shakeAt - e); e = shakeAt;
      const shake = await api.summary();
      assert(shake.top.seats[0].anim === 'shakeOff' && shake.top.seats[0].wet > 0 && shake.top.seats[0].wet < 1, `and shakes it off, the juice line going down it (anim '${shake.top.seats[0].anim}', wet ${shake.top.seats[0].wet})`);
      await api.shot('bramble-squish-shake');

      // --- after: clean, the basket back, a player again, nothing lost
      await api.step(SQUISH_TOTAL - e + 1);
      const fine = await api.summary(), f0 = fine.top.seats[0];
      assert(f0.squishT === 0 && f0.wet === 0 && f0.basket === 'near' && f0.anim === 'carry', `${SQUISH_TOTAL} frames and it is over: clean, the basket back (squishT ${f0.squishT}, wet ${f0.wet}, basket ${f0.basket}, anim '${f0.anim}')`);
      assert(f0.count === count0 && fine.top.total === total0 && fine.top.squishes === 1, `nothing lost but the time (count ${f0.count}, total ${fine.top.total})`);
      assert((fine.top.bushes[b.i] & (1 << b.k)) === 0, 'and the spot is a green pea again, free to ripen');
      await api.hold(0, { right: true });
      await api.step(4);
      await api.release(0);
      assert((await api.summary()).top.seats[0].x > f0.x, 'and it can walk again');

      // --- BARLEY EATS THE EVIDENCE: the same berry, licked off a third at a time
      const bb = await layJoke(page, 'squish', 1, 4, 0);
      await park(page, 0, BUSH_X[0]);
      await api.step(2);
      const bc0 = (await api.summary()).top.seats[1].count;
      const gq = await squishFrom(api, page, 1, {});
      const gb = gq.bang.top.seats[1];
      assert(gq.held.top.seats[1].squishT === GULP_TOTAL - 2 && (gq.held.top.squishy[bb.i] & (1 << bb.k)) === 0, `Barley takes it up too, on Barley's own clock (squishT ${gq.held.top.seats[1].squishT})`);
      assert(gq.bang.top.squishes === 2 && gb.wet === 1 && gb.anim === 'drip', `SPLUT! on Barley (squishes ${gq.bang.top.squishes}, wet ${gb.wet})`);
      e = gq.e;
      const nom = (n) => SQUISH_HOLD + GULP_SHOCK + GULP_NOM + n * GULP_LICK;
      await api.step(SQUISH_HOLD + GULP_SHOCK + 2 - e); e = SQUISH_HOLD + GULP_SHOCK + 2;
      const lick1 = await api.summary(), mmm = await gagsUp(page);
      assert(lick1.top.seats[1].anim === 'slurp' && mmm === 1 && lick1.top.seats[1].wet === 1, `Barley licks it off instead: MMM!, the SPLUT! read and knocked away (anim '${lick1.top.seats[1].anim}', cards ${mmm})`);
      const wets = [];
      for (let n = 0; n < GULP_LICKS; n++) {
        await api.step(nom(n) + 1 - e); e = nom(n) + 1;
        wets.push((await api.summary()).top.seats[1].wet);
        if (n === 0) await api.shot('bramble-squish-barley');
      }
      assert(wets[0] > 0.6 && wets[0] < 0.7 && wets[1] > 0.3 && wets[1] < 0.4 && wets[2] === 0, `nom, nom, nom: a third of the juice at every lick (${wets.join(' -> ')})`);
      await api.step(GULP_TOTAL - e + 1);
      const clean = await api.summary(), g1 = clean.top.seats[1];
      assert(g1.squishT === 0 && g1.basket === 'near' && g1.anim === 'carry' && GULP_TOTAL < SQUISH_TOTAL, `licked clean in ${GULP_TOTAL} frames, sooner than shaking it off (${SQUISH_TOTAL}), the basket back (squishT ${g1.squishT}, basket ${g1.basket})`);
      assert(g1.count === bc0 && clean.top.total === total0, `and Barley ate the juice, never a banked berry (count ${g1.count}, total ${clean.top.total})`);

      // --- THE END: a round that ends in the middle of one drops it, coat and all
      await layJoke(page, 'squish', 0, 2, 2);
      await api.step(1);
      await api.press(0, { action: true }, 1, 0);
      await api.step(SQUISH_HOLD + 10);
      const mid = (await api.summary()).top.seats[0];
      assert(mid.wet === 1 && mid.squishT > 0, `mid-joke: coated (wet ${mid.wet})`);
      // nothing has been scored this round (a squished berry never is), so the line cannot be brought down to the
      // total the way the rules test does: the screen's own ending is called instead, as the line reaching it would
      await page.evaluate(() => window.__game.game.screen.finish());
      await api.step(2);
      const end = await api.summary();
      assert(end.top.phase === 1 && end.top.seats.every((s) => s.squishT === 0 && s.prickT === 0 && s.wet === 0 && s.basket === 'near'), `the sign drops and every joke is dropped with it (${JSON.stringify(end.top.seats.map((s) => [s.squishT, s.wet, s.basket]))})`);
    });

    // --- a second berry: the blackberry's juice is purple, and its own
    await withPage(server, 'skipTo=bramble&critters=2&recipes=58', async (api, page) => {
      await api.step(2);
      await holdTarget(page);
      const s0 = await api.summary();
      assert(s0.top.juice === JUICE.blackberry && s0.top.juice !== JUICE.strawberry && !NEVER.includes(s0.top.juice), `a blackberry's juice is a muted purple of its own (${s0.top.juice})`);
      await layJoke(page, 'squish', 0, 3, 0);
      await api.step(2);
      const sq = await squishFrom(api, page, 0, {});
      assert(sq.bang.top.squishes === 1 && sq.bang.top.seats[0].wet === 1, `SPLUT! on a blackberry visit too (squishes ${sq.bang.top.squishes})`);
      await api.step(24);
      await api.shot('bramble-squish-coat-blackberry');
    });

    // --- THE DEAL: ripen berry after berry through the screen's own updateBushes and count what each was dealt
    await withPage(server, 'skipTo=bramble&critters=0&recipes=13', async (api, page) => {
      await api.step(2);
      const N = 1400;
      const deal = await page.evaluate((n) => {
        const sc = window.__game.game.screen;
        let thorns = 0, squishes = 0, both = 0, stray = 0;
        for (let i = 0; i < n; i++) {
          for (const b of sc.bushes) { b.ripe = 0; b.thorn = 0; b.squish = 0; }
          sc.nextRipen = 1;
          sc.updateBushes();
          for (const b of sc.bushes) {
            if (b.thorn) thorns++;
            if (b.squish) squishes++;
            if (b.thorn & b.squish) both++;
            if ((b.thorn | b.squish) & ~b.ripe) stray++;
          }
        }
        return { thorns, squishes, both, stray };
      }, N);
      const lo = N / (DEAL_ODDS + 3), hi = N / (DEAL_ODDS - 2);
      assert(deal.thorns > lo && deal.thorns < hi && deal.squishes > lo && deal.squishes < hi, `each joke is about one berry in ${DEAL_ODDS} (${deal.thorns} thorns and ${deal.squishes} squishy in ${N})`);
      assert(deal.both === 0 && deal.stray === 0, `never both on one berry, and never on a berry that is not ripe (both ${deal.both}, stray ${deal.stray})`);
    });
  },

  async bramble(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'bramble', `the bank is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4, `four seats work the path (${s0.top.seats.length})`);
      const line = (s0.run.needs || []).find((n) => n.startsWith('strawberry:')) || '';
      assert(line === `strawberry:0/${s0.top.target}` && s0.top.target > 0, `the target is the order's own strawberry line (${line}, target ${s0.top.target})`);
      assert(s0.top.bushes.length === 6 && ripeTotal(s0) === SEED_RIPE, `the bank is planted when the truck pulls up: ${SEED_RIPE} ripe berries on six bushes (${s0.top.bushes.join()})`);
      const x0 = s0.top.seats[0].x, others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => s.x));
      // the jokes have scenarios of their own: every thorn and every squishy berry is cleared before a key is
      // pressed, so the rules below never meet one (a squishy berry here would read as a pick that scored nothing)
      const holdJokes = () => page.evaluate(() => { for (const b of window.__game.game.screen.bushes) { b.thorn = 0; b.squish = 0; } });
      await holdJokes();

      // --- REAL INPUT: the stick moves seat 0 along the path and nobody else
      await holdTarget(page);
      await api.hold(0, { right: true });
      await api.step(30);
      await api.release(0);
      await api.step(2);
      let last = await api.summary();
      assert(last.top.seats[0].x > x0 && last.top.seats[0].x <= 614, `seat 0 walked the path on its own stick (${x0} -> ${last.top.seats[0].x})`);
      assert(JSON.stringify(last.top.seats.slice(1).map((s) => s.x)) === others0, 'the other seats, with no input, stayed put');

      // --- walk under the nearest bush with a ripe berry and pick it
      // ripening is paused first, so the count of ripe berries is the count the pick changes and nothing else
      await page.evaluate(() => { window.__game.game.screen.nextRipen = 100000; });
      await holdJokes();
      let best = -1, bd = 1e9;
      for (let i = 0; i < BUSH_X.length; i++) { const d = Math.abs(BUSH_X[i] - last.top.seats[0].x); if (last.top.bushes[i] && d < bd) { bd = d; best = i; } }
      assert(best >= 0, 'a bush with a ripe berry is standing somewhere along the bank');
      for (let i = 0; i < 200; i++) {
        const dx = BUSH_X[best] - last.top.seats[0].x;
        if (Math.abs(dx) <= 6) break;
        await api.hold(0, dx > 0 ? { right: true } : { left: true });
        await api.step(2);
        last = await api.summary();
      }
      await api.release(0);
      await api.step(2);
      const before = await api.summary();
      const ripeBefore = ripeTotal(before), maskBefore = before.top.bushes[best];
      await api.press(0, { action: true }, 1, 0);
      await api.step(3);
      const picked = await api.summary();
      assert(picked.top.seats[0].count === before.top.seats[0].count + 1, `action under a ripe bush picks a berry (seat 0 ${before.top.seats[0].count} -> ${picked.top.seats[0].count})`);
      assert(picked.top.total === before.top.total + 1, `the party's total went up with it (${before.top.total} -> ${picked.top.total})`);
      assert(bits(picked.top.bushes[best]) === bits(maskBefore) - 1 && ripeTotal(picked) === ripeBefore - 1, `that bush lost one ripe berry and no other bush changed (${maskBefore} -> ${picked.top.bushes[best]})`);
      assert(picked.top.seats[0].reachT > 0 && picked.top.seats[0].reachT <= REACH_FRAMES && picked.top.seats[0].anim === 'pick', `and the seat is in its reach beat (reachT ${picked.top.seats[0].reachT}, anim '${picked.top.seats[0].anim}')`);
      await api.shot('bramble-pick');
      assert(picked.top.seats.slice(1).every((s) => s.count === 0), 'the other seats, with no input, picked nothing');
      await api.step(REACH_FRAMES);

      // --- NOTHING: a bare bush gives nothing
      const bare = await page.evaluate((b) => {
        const sc = window.__game.game.screen, s = sc.seats[0];
        for (const bush of sc.bushes) bush.ripe = 0;
        s.x = b; s.reachT = 0;
        return sc.total;
      }, BUSH_X[best]);
      await api.press(0, { action: true }, 1, 2);
      const nothing = await api.summary();
      assert(nothing.top.total === bare && nothing.top.seats[0].reachT === 0, `action under a bush with nothing ripe on it does nothing (total ${nothing.top.total}, reachT ${nothing.top.seats[0].reachT})`);

      // --- RIPENING: a berry comes on its own, inside the timer's range
      await page.evaluate(() => { window.__game.game.screen.nextRipen = 40; });
      await api.step(41);
      const ripened = await api.summary();
      assert(ripeTotal(ripened) === 1, `a berry ripened on its own when the timer ran out (${ripened.top.bushes.join()})`);
      const nextRipen = await page.evaluate(() => window.__game.game.screen.nextRipen);
      assert(nextRipen > 0 && nextRipen <= RIPEN_MAX, `and the next is seeded inside the range (${nextRipen})`);
      await holdJokes();

      // --- the hand-off: bring the finish line down to the party's total (there is no clock to force), watch the
      // sign, then the map
      const lastTotal = (await api.summary()).top.total;
      assert(lastTotal >= 1, `something was picked before the ending (total ${lastTotal})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'bramble' && s2.top.phase === 1 && /^STRAWBERRIES: \d+$/.test(s2.top.sign), `the target was reached: the STRAWBERRIES sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
      assert(s2.top.pricks === 0 && s2.top.squishes === 0, `and the rules never met a joke (pricks ${s2.top.pricks}, squishes ${s2.top.squishes})`);
      await api.shot('bramble-sign');
      await api.step(HOLD);
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the bank hands back to the map (on ${s3.screen})`);
      const line3 = (s3.run.needs || []).find((n) => n.startsWith('strawberry:')) || '';
      const have = parseInt(line3.split(':')[1], 10);
      assert(line3 && have === Math.min(lastTotal, s0.top.target), `run.gather('strawberry') banked the party's total (${line3}, total ${lastTotal})`);
    });
  },
};
