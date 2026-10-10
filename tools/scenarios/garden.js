// Playtest scenarios for the farm work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   garden - four seats in Furrow Farm's kitchen garden on the CARROT SOUP order, so the target is the
//            order's own carrot line and not the fallback. Both jokes are held off first (every top made plain and
//            the spawner pushed out of reach): a rules test that tugged out a rocket root would read as a lost pull.
//            Then, in order:
//              REAL INPUT   seat 0 is walked along the row with the stick (it moved, it stayed inside the row, and
//                           the three seats with no input stayed exactly where they were), walked onto the nearest
//                           top, `action`-ed into a grip (the gauge opened at zero), and then `action`-ed
//                           PULL_PRESSES more times - the party's total went up on the last one and not before. A
//                           dead reach, a dead gauge or a dead pull fails one of those.
//              LETTING GO   a grip nobody presses on for GRIP_TIMEOUT frames is let go of: no carrot, nothing lost,
//                           the top standing where it was.
//              THE HAND-OFF the finish line is brought down to the party's total: the CARROTS sign drops, is held, and the screen
//                           hands back to the map with the order's carrot line updated by the party's total.
//            Shots: tools/screens/garden-grip.png (a seat with hold of a top and an empty gauge over its head),
//            garden-pull.png (the root out of the ground and in the air, the hole behind it) and garden-gauges.png
//            (all four seats gripping at once at four different fills - the shot the "four gauges are not a wall"
//            claim is judged from), plus garden-sign.png.
//   gardenWhopper, gardenRocket - the scene's two jokes, beat by beat (screens/gardenGags.ts); each says what it checks.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** ?order=6 is ORDERS[5], CARROT SOUP: carrot 4 + milk 2, so `carrot` is a real line on the ticket. */
const BOOT = 'skipTo=garden&critters=0,1,2,3&order=6';
/** The screen's own numbers, mirrored here so a change to either side shows up as a failing assert. */
const PULL_PRESSES = 12, PULL_FRAMES = 14, GRIP_TIMEOUT = 150, GAUGE_UNITS = 120;
/** The frame of the pull the shot is taken on: the root is mid-arc and the hole is still open behind it. */
const PULL_SHOT = 5;
/** The jokes' numbers (screens/gardenGags.ts, art/gardenGags.ts), mirrored the same way. */
const NO_GAG = 0, WHOPPER = 1, ROCKET = 2, DEAL_ODDS = 8, ALARM_PRESSES = 8;
/** The whopper: the somersault, flat on its back, shoved off; the seat thrown a pixel a frame for FLING frames. */
const FLIP_FRAMES = 20, PINNED_FRAMES = 50, ROLL_FRAMES = 20, FLING = 12;
const ROLL_AT = FLIP_FRAMES + PINNED_FRAMES, W_LAND_AT = ROLL_AT + 16, WHOPPER_FRAMES = ROLL_AT + ROLL_FRAMES;
/** The rocket root, in frames from the POP: the stare, the '?', the fall, the bonk, the stars, the landing, the end. */
const LOOK_AT = 13, HUH_AT = 36, FALL_AT = 54, BONK_AT = 70, DIZZY_AT = BONK_AT + 8, LAND_AT = BONK_AT + 18;
const SHAKE_AT = BONK_AT + 40, ROCKET_FRAMES = SHAKE_AT + 24, MMM_AT = BONK_AT + 30, CHOMP_DONE = BONK_AT + 42;

/** Seat `i` as the sim holds it (summary() carries the rest), with the joke it is playing. */
function seatOf(page, i = 0) {
  return page.evaluate((k) => {
    const sc = window.__game.game.screen, s = sc.seats[k];
    return { x: s.x, count: s.count, state: s.state, t: s.t, anim: s.anim, top: s.top, pull: s.pull, gag: s.gag, gt: s.gt, owed: s.owed,
      trug: s.rig.weapon ? 1 : 0, total: sc.total, pulls: sc.pulls, whoppers: sc.whoppers, rockets: sc.rockets,
      tops: sc.tops.map((t) => [t.x, t.active ? 1 : 0, t.held, t.whopper, t.rocket]) };
  }, i);
}
const seat0 = (page) => seatOf(page, 0);

/** Hold the finish line out of reach so a +1 can never end the round mid-test (run.gather still clamps to the order). */
function holdTarget(page) {
  return page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 4); sc.setTotal(sc.total); });
}

/** The nearest standing top to x, as [x, held], or null. */
function nearestTop(tops, x) {
  let best = null, bd = 1e9;
  for (const t of tops) { const d = Math.abs(t[0] - x); if (d < bd) { bd = d; best = t; } }
  return best;
}

/**
 * Hold both jokes off: every top in the bed made a plain root and the spawner pushed out of reach, so nothing dealt
 * later can be one either. The jokes' own scenarios put one back by hand, in the very fields the deal sets.
 */
function jokesOff(page) {
  return page.evaluate(() => { const sc = window.__game.game.screen; sc.nextSpawn = 100000; for (const t of sc.tops) { t.whopper = 0; t.rocket = 0; } });
}

/** Make the free top nearest `nearX` a joke (`kind` 'whopper' or 'rocket') and stand seat `i` on it, facing it. Returns its x. */
function standOnJoke(page, i, kind, nearX) {
  return page.evaluate(([k, kd, nx]) => {
    const sc = window.__game.game.screen, s = sc.seats[k];
    const t = sc.tops.filter((t) => t.active && !t.held).sort((a, b) => Math.abs(a.x - nx) - Math.abs(b.x - nx))[0];
    t.whopper = kd === 'whopper' ? 1 : 0; t.rocket = kd === 'rocket' ? 1 : 0;
    s.x = t.x - 6; s.facing = 1; s.moving = false;
    return t.x;
  }, [i, kind, nearX]);
}

/** Grip the top under seat `i` (the press that grips is not a tug) and tug it `tugs` times. */
async function gripAndTug(api, i, tugs) {
  await api.press(i, { action: true }, 1, 2);
  for (let k = 0; k < tugs; k++) await api.press(i, { action: true }, 1, 3);
}

/** The word cards up right now (game/gags.ts: the page's own module instance, the URL being the game's). */
const cardsUp = (page) => page.evaluate(async () => (await import('/src/game/gags.ts')).gagsUp());

/** Step until seat `i`'s joke has run `gt` frames since its root came out (gt only counts up). */
async function stepToBeat(api, page, i, gt) {
  const s = await seatOf(page, i);
  if (gt > s.gt) await api.step(gt - s.gt);
}

export const SCENARIOS = {
  /**
   * gardenWhopper - the old joke, made big. The nearest top is made the whopper (nothing above ground shows it), seat
   *                 0 grips it and taps it out. On the twelfth tap NOTHING is counted yet: the seat is thrown backwards
   *                 head over heels (state 'pull', gag whopper, whopperFlip, the trug down on the soil), FLING px back
   *                 along the row with the stick dead; it lands flat on its back with the giant root on top - WHOA!,
   *                 a card up, pinned with its legs kicking - for PINNED_FRAMES; then it shoves the root off, the root
   *                 rolls into the trug and THAT is the +1, exactly one; and it is on its feet with the trug in its paw
   *                 and the stick live at WHOPPER_FRAMES. Writes garden-whopper-flip (mid-somersault),
   *                 garden-whopper (pinned under the root) and garden-whopper-roll (the root rolling off).
   */
  async gardenWhopper(server) {
    await withPage(server, 'skipTo=garden&critters=0,1&order=6', async (api, page) => {
      await api.step(2);
      await holdTarget(page);
      await jokesOff(page);
      // the top nearest the middle of the row, so the shots show the throw and not the edge of the frame
      const x = await standOnJoke(page, 0, 'whopper', 320);
      await api.press(0, { action: true }, 1, 2);
      const g = await seat0(page);
      assert(g.state === 1 && g.top >= 0 && g.anim === 'grip', `seat 0 has hold of the whopper's top at ${x}, and nothing gives it away (state ${g.state}, top ${g.top}, anim '${g.anim}')`);
      for (let i = 0; i < PULL_PRESSES - 1; i++) await api.press(0, { action: true }, 1, 3);
      const before = await seat0(page);
      await api.press(0, { action: true }, 1, 0);
      const w = await seat0(page);
      assert(w.count === before.count && w.total === before.total && w.owed === 1, `the twelfth tap brings it out, owed rather than counted (count ${before.count} -> ${w.count}, owed ${w.owed})`);
      assert(w.state === 2 && w.gag === WHOPPER && w.t === WHOPPER_FRAMES && w.anim === 'whopperFlip' && w.whoppers === 1 && w.trug === 0,
        `and the seat is thrown head over heels, its trug down (state ${w.state}, gag ${w.gag}, t ${w.t}, anim '${w.anim}', whoppers ${w.whoppers}, trug ${w.trug})`);
      // the stick is dead through the throw: held right all the way, the seat still goes back along the row by FLING
      await api.hold(0, { right: true });
      await api.step(8);
      await api.shot('garden-whopper-flip');
      await stepToBeat(api, page, 0, FLIP_FRAMES);
      await api.release(0);
      const down = await seat0(page);
      assert(Math.round(down.x) === Math.round(w.x) - FLING, `thrown ${FLING} px back along the row, whatever the stick said (${Math.round(w.x)} -> ${Math.round(down.x)})`);
      assert(down.anim === 'pinned' && (await cardsUp(page)) >= 1 && down.count === before.count, `flat on its back under the root with WHOA! up, still owed (anim '${down.anim}', count ${down.count})`);
      await api.step(10);
      await api.shot('garden-whopper');
      await stepToBeat(api, page, 0, ROLL_AT + 4);
      const roll = await seat0(page);
      assert(roll.anim === 'rollOff' && roll.owed === 1, `it shoves the root off after ${PINNED_FRAMES} frames pinned (anim '${roll.anim}', owed ${roll.owed})`);
      await api.shot('garden-whopper-roll');
      await stepToBeat(api, page, 0, W_LAND_AT);
      const landed = await seat0(page);
      assert(landed.count === before.count + 1 && landed.total === before.total + 1 && landed.owed === 0, `the root rolls into the trug: +1, exactly one (count ${before.count} -> ${landed.count}, total ${before.total} -> ${landed.total})`);
      await stepToBeat(api, page, 0, WHOPPER_FRAMES);
      const up = await seat0(page);
      assert(up.state === 0 && up.t === 0 && up.gag === NO_GAG && up.trug === 1 && up.count === landed.count, `on its feet with the trug in its paw after ${WHOPPER_FRAMES} frames (state ${up.state}, gag ${up.gag}, trug ${up.trug})`);
      await api.hold(0, { right: true });
      await api.step(4);
      await api.release(0);
      assert((await seat0(page)).x > up.x, 'and the stick walks it again');
    });
  },

  /**
   * gardenRocket - the new joke, with Sorrel in seat 0 and Barley in seat 1, the rocket root put in the bed by hand
   *                (the fields the deal sets), every beat checked and shot:
   *                  TELL     summary() flags the top (and it is no whopper): garden-rocket-tell, from across the row.
   *                  WIND-UP  the grip is the wary one; the ALARM_PRESSES-th tug puts the '!' up and opens the mouth
   *                           (gripAlarm): garden-rocket-windup, the heave grown with the gauge.
   *                  BANG     the twelfth: POP! - rockets 1, the trug down, the root owed and NOT counted, and the
   *                           stick dead through the whole beat: garden-rocket-launch, the root through its own POP!.
   *                  LOOK     staring at the sky (lookUp, the '?'): garden-rocket-lookup. BONK on the head (bonked, a
   *                           card, still owed): garden-rocket-bonk. It bounces into the trug: +1, exactly one; the
   *                           stars (dizzy): garden-rocket-dizzy; shakeOff; and at ROCKET_FRAMES the trug is back in
   *                           the paw and the stick walks.
   *                  BARLEY   catches it in his mouth instead: gape, then chomp - never bonked - +1 all the same, MMM!,
   *                           done at CHOMP_DONE: garden-rocket-chomp.
   *                  BANKED   a round that ends while a rocket root is still in the air banks it, and the sign says so.
   *                  THE DEAL one roll per planted top (gardenGags.ts dealTop): each joke about one top in DEAL_ODDS,
   *                           never both on one.
   */
  async gardenRocket(server) {
    await withPage(server, 'skipTo=garden&critters=1,0&order=6', async (api, page) => {
      await api.step(2);
      await holdTarget(page);
      await jokesOff(page);
      const who = await page.evaluate(() => window.__game.game.screen.seats.map((s) => s.critter));
      assert(who[0] !== 'barley' && who[1] === 'barley', `seat 0 is not Barley and seat 1 is (${who})`);

      // --- TELL: the top is flagged; the seats are parked away so the shot shows it the way the row does
      const x = await standOnJoke(page, 0, 'rocket', 320);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.seats[0].x = 120; sc.seats[1].x = 560; });
      await api.step(6);
      const tell = (await api.summary()).top.tops.find((t) => t[0] === x);
      assert(!!tell && tell[3] === 1 && tell[2] === 0, `the rocket root's top stands in the bed, flagged and no whopper (${JSON.stringify(tell)})`);
      await api.shot('garden-rocket-tell');

      // --- WIND-UP: the wary grip, then the alarm on the ALARM_PRESSES-th tug
      await page.evaluate((tx) => { const s = window.__game.game.screen.seats[0]; s.x = tx - 6; s.facing = 1; }, x);
      await gripAndTug(api, 0, ALARM_PRESSES - 1);
      const wary = await seat0(page);
      assert(wary.state === 1 && wary.anim === 'gripWary' && (await cardsUp(page)) === 0, `the tug on a heaving top is the wary grip, nothing said yet (anim '${wary.anim}')`);
      await api.press(0, { action: true }, 1, 3);
      const alarm = await seat0(page);
      assert(alarm.anim === 'gripAlarm' && (await cardsUp(page)) === 1, `tug ${ALARM_PRESSES} opens the mouth and puts the '!' up (anim '${alarm.anim}')`);
      await api.shot('garden-rocket-windup');
      for (let i = ALARM_PRESSES; i < PULL_PRESSES - 1; i++) await api.press(0, { action: true }, 1, 3);
      const before = await seat0(page);
      assert(before.state === 1 && before.count === 0, `eleven tugs and still gripping (state ${before.state})`);

      // --- BANG: the twelfth fires it out; nothing is counted until it comes down
      await api.press(0, { action: true }, 1, 0);
      const pop = await seat0(page);
      assert(pop.state === 2 && pop.gag === ROCKET && pop.rockets === 1 && pop.anim === 'rocketPop' && pop.t === ROCKET_FRAMES,
        `POP: the rocket root is out (state ${pop.state}, gag ${pop.gag}, rockets ${pop.rockets}, anim '${pop.anim}', t ${pop.t})`);
      assert(pop.owed === 1 && pop.count === before.count && pop.total === before.total && pop.trug === 0, `owed, not counted, and the trug is down (owed ${pop.owed}, count ${pop.count}, trug ${pop.trug})`);
      assert((await cardsUp(page)) === 1, 'POP! has taken the place of the \'!\' - one card, not a heap of them');
      await api.hold(0, { left: true });
      await api.step(5);
      await api.shot('garden-rocket-launch');
      await stepToBeat(api, page, 0, LOOK_AT + 2);
      await api.release(0);
      const look = await seat0(page);
      assert(look.x === pop.x && look.anim === 'lookUp', `the stick is dead and the critter stares at the sky (x ${pop.x} -> ${look.x}, anim '${look.anim}')`);
      await stepToBeat(api, page, 0, HUH_AT + 4);
      assert((await cardsUp(page)) === 1, 'the \'?\' is up in the POP!\'s place');
      await api.shot('garden-rocket-lookup');

      // --- LOOK: BONK on the head, then the bounce into the trug is the +1
      await stepToBeat(api, page, 0, BONK_AT);
      const bonk = await seat0(page);
      assert(bonk.anim === 'bonked' && bonk.owed === 1 && bonk.count === before.count && (await cardsUp(page)) >= 1, `BONK! on the head, still owed (anim '${bonk.anim}', owed ${bonk.owed})`);
      await api.step(4);
      await api.shot('garden-rocket-bonk');
      await stepToBeat(api, page, 0, LAND_AT);
      const land = await seat0(page);
      assert(land.count === before.count + 1 && land.total === before.total + 1 && land.owed === 0, `it bounces into the trug: +1, exactly one (count ${before.count} -> ${land.count}, total ${before.total} -> ${land.total})`);
      await stepToBeat(api, page, 0, DIZZY_AT + 18);
      assert((await seat0(page)).anim === 'dizzy', 'the stars go round');
      await api.shot('garden-rocket-dizzy');
      await stepToBeat(api, page, 0, SHAKE_AT + 1);
      assert((await seat0(page)).anim === 'shakeOff', 'then it shakes them off');
      await stepToBeat(api, page, 0, ROCKET_FRAMES);
      const done = await seat0(page);
      assert(done.state === 0 && done.gag === NO_GAG && done.trug === 1 && done.count === land.count, `the trug back in the paw after ${ROCKET_FRAMES} frames (state ${done.state}, gag ${done.gag}, trug ${done.trug}, count ${done.count})`);
      await api.hold(0, { right: true });
      await api.step(4);
      await api.release(0);
      assert((await seat0(page)).x > done.x, 'and the stick walks it again');

      // --- BARLEY: the same root comes down into his mouth
      const bx = await standOnJoke(page, 1, 'rocket', 480);
      await page.evaluate(() => { window.__game.game.screen.seats[0].x = 80; });
      await gripAndTug(api, 1, PULL_PRESSES - 1);
      const b0 = await seatOf(page, 1);
      await api.press(1, { action: true }, 1, 0);
      const bPop = await seatOf(page, 1);
      assert(bPop.gag === ROCKET && bPop.t === CHOMP_DONE && bPop.owed === 1 && bPop.count === b0.count, `Barley's top at ${bx} fires too, owed, and his beat is the shorter one (t ${bPop.t}, owed ${bPop.owed})`);
      await stepToBeat(api, page, 1, FALL_AT + 6);
      assert((await seatOf(page, 1)).anim === 'gape', 'he opens wide as it comes down');
      await stepToBeat(api, page, 1, BONK_AT + 4);
      const chomp = await seatOf(page, 1);
      assert(chomp.anim === 'chomp' && chomp.owed === 1, `CHOMP: caught in his mouth, never bonked (anim '${chomp.anim}')`);
      await api.shot('garden-rocket-chomp');
      await stepToBeat(api, page, 1, LAND_AT);
      const bLand = await seatOf(page, 1);
      assert(bLand.count === b0.count + 1 && bLand.owed === 0, `and into the trug with a bite out of it: +1 all the same (count ${b0.count} -> ${bLand.count})`);
      await stepToBeat(api, page, 1, MMM_AT);
      assert((await cardsUp(page)) >= 1, 'MMM!');
      await stepToBeat(api, page, 1, CHOMP_DONE);
      const bDone = await seatOf(page, 1);
      assert(bDone.state === 0 && bDone.gag === NO_GAG && bDone.trug === 1 && bDone.count === bLand.count, `done chewing at ${CHOMP_DONE} (state ${bDone.state}, trug ${bDone.trug})`);

      // --- BANKED: the round ends (another seat's pull, here a hand) while a rocket root is still in the sky
      await standOnJoke(page, 0, 'rocket', 200);
      await gripAndTug(api, 0, PULL_PRESSES);
      await stepToBeat(api, page, 0, FALL_AT - 10);
      const flying = await seat0(page);
      assert(flying.gag === ROCKET && flying.owed === 1, `a rocket root is up in the sky, owed (gag ${flying.gag}, owed ${flying.owed})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = sc.total; sc.setTotal(sc.total); });
      await api.step(2);
      const end = await api.summary(), banked = await seat0(page);
      assert(end.top.phase === 1 && banked.count === flying.count + 1 && banked.total === flying.total + 1 && banked.owed === 0 && banked.gag === NO_GAG,
        `the round ends with it in the air and it is banked anyway (phase ${end.top.phase}, count ${flying.count} -> ${banked.count}, total ${flying.total} -> ${banked.total})`);
      assert(end.top.sign === 'CARROTS: ' + banked.total, `the sign counts it ('${end.top.sign}')`);

      // --- THE DEAL: one roll per top, each joke about one in DEAL_ODDS, never both (the page's own gardenGags.ts)
      const deal = await page.evaluate(async () => {
        const { dealTop } = await import('/src/game/screens/gardenGags.ts');
        let w = 0, r = 0, both = 0;
        const t = { active: true, x: 0, held: 0, whopper: 0, rocket: 0 };
        for (let i = 0; i < 1600; i++) { dealTop(t); w += t.whopper; r += t.rocket; if (t.whopper && t.rocket) both++; }
        return { w, r, both };
      });
      const want = 1600 / DEAL_ODDS;
      assert(deal.both === 0 && Math.abs(deal.w - want) < want * 0.35 && Math.abs(deal.r - want) < want * 0.35,
        `the deal: about one top in ${DEAL_ODDS} each, never both (${deal.w} whoppers, ${deal.r} rockets, ${deal.both} both, of 1600)`);
    });
  },

  async garden(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'garden', `the farm is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4, `four seats work the row (${s0.top.seats.length})`);
      const carrotLine = (s0.run.needs || []).find((n) => n.startsWith('carrot:')) || '';
      assert(carrotLine === `carrot:0/${s0.top.target}` && s0.top.target > 0, `the target is the order's own carrot line (${carrotLine}, target ${s0.top.target})`);
      assert(s0.top.tops.length >= 5, `the bed is already planted when the truck pulls up (${s0.top.tops.length} tops)`);
      const orderTarget = s0.top.target;
      const x0 = s0.top.seats[0].x, others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => s.x));

      // --- REAL INPUT: the stick moves seat 0 along the row and nobody else (the jokes held off: these are the rules)
      await holdTarget(page);
      await jokesOff(page);
      await api.hold(0, { right: true });
      await api.step(40);
      await api.release(0);
      await api.step(2);
      let last = await api.summary();
      assert(last.top.seats[0].x > x0 && last.top.seats[0].x <= 614, `seat 0 walked the row on its own stick (${x0} -> ${last.top.seats[0].x})`);
      assert(JSON.stringify(last.top.seats.slice(1).map((s) => s.x)) === others0, 'the other seats, with no input, stayed put');

      // --- REAL INPUT: walk onto the nearest top, grip it, and tap it out
      let top = nearestTop(last.top.tops, last.top.seats[0].x);
      assert(!!top, 'a top is standing in the row to walk to');
      for (let i = 0; i < 160 && top; i++) {
        const dx = top[0] - last.top.seats[0].x;
        if (Math.abs(dx) <= 6) break;
        await api.hold(0, dx > 0 ? { right: true } : { left: true });
        await api.step(2);
        last = await api.summary();
      }
      await api.release(0);
      await api.step(2);
      const before = (await api.summary()).top;
      // two released frames after the grip press, so the first tap is a fresh edge and not the same press held
      await api.press(0, { action: true }, 1, 2);
      let g = await api.summary();
      const gs = g.top.seats[0];
      assert(gs.state === 'grip' && gs.pull === 0 && gs.top >= 0,
        `action within reach takes hold and opens an empty gauge (state '${gs.state}', pull ${gs.pull}, top ${gs.top})`);
      await api.shot('garden-grip');
      for (let i = 0; i < PULL_PRESSES - 1; i++) await api.press(0, { action: true }, 1, 3);
      g = await api.summary();
      assert(g.top.seats[0].state === 'grip' && g.top.seats[0].pull === (PULL_PRESSES - 1) * GAUGE_UNITS / PULL_PRESSES && g.top.seats[0].count === before.seats[0].count,
        `${PULL_PRESSES - 1} taps fill the gauge to one step short (state '${g.top.seats[0].state}', pull ${g.top.seats[0].pull}, count ${g.top.seats[0].count})`);
      await api.press(0, { action: true }, 1, 0);
      g = await api.summary();
      assert(g.top.seats[0].count === before.seats[0].count + 1, `the ${PULL_PRESSES}th tap brings the root out (seat 0 ${before.seats[0].count} -> ${g.top.seats[0].count})`);
      assert(g.top.total === before.total + 1, `the party's total went up with it (${before.total} -> ${g.top.total})`);
      const beat = await seat0(page);
      assert(beat.state === 2 && beat.t === PULL_FRAMES && beat.anim === 'pullOut' && beat.gag === NO_GAG, `and the seat is in its pull beat, no joke (state ${beat.state}, t ${beat.t}, anim '${beat.anim}', gag ${beat.gag})`);
      assert(g.top.seats.slice(1).every((s) => s.count === 0), 'the other seats, with no input, pulled nothing');
      await api.step(PULL_SHOT);
      await api.shot('garden-pull');
      await api.step(PULL_FRAMES);

      // --- LETTING GO: a grip nobody presses on is let go of, at no cost, with the top still standing
      const parked = await page.evaluate(() => {
        const sc = window.__game.game.screen, s = sc.seats[0];
        sc.nextSpawn = 100000;
        for (const t of sc.tops) { t.active = false; t.held = 0; }
        s.state = 0; s.t = 0; s.top = -1; s.pull = 0; s.facing = 1; s.moving = false;
        const t = sc.tops[0];
        t.active = true; t.held = 0; t.x = Math.round(s.x) + 10;
        sc.tryGrip(s);
        return { count: s.count, state: s.state, top: s.top };
      });
      assert(parked.state === 1 && parked.top === 0, `tryGrip took hold of the hand-placed top (state ${parked.state}, top ${parked.top})`);
      await api.step(GRIP_TIMEOUT + 2);
      const letGo = await seat0(page);
      assert(letGo.state === 0 && letGo.top === -1 && letGo.count === parked.count, `${GRIP_TIMEOUT} frames without a press lets go (state ${letGo.state}, top ${letGo.top}, count ${letGo.count})`);
      assert(letGo.tops[0][1] === 1 && letGo.tops[0][2] === 0, 'and the top is still standing, free for anyone');

      // --- four gauges at once: the shot the HUD claim is judged from
      await page.evaluate(() => {
        const sc = window.__game.game.screen;
        for (const t of sc.tops) { t.active = false; t.held = 0; }
        sc.nextSpawn = 100000;
        for (let i = 0; i < sc.seats.length; i++) {
          const s = sc.seats[i], t = sc.tops[i];
          s.state = 0; s.t = 0; s.top = -1; s.pull = 0; s.facing = 1; s.moving = false; s.count = i;
          t.active = true; t.held = 0; t.x = Math.round(s.x) + 10;
          sc.tryGrip(s);
          s.pull = i * 30;                // four gauges at four different fills, which is the whole point
        }
        // and one more top standing clear of the crew
        sc.tops[4].active = true; sc.tops[4].x = 60; sc.tops[4].held = 0;
      });
      await api.step(2);
      const four = await api.summary();
      assert(four.top.seats.every((s) => s.state === 'grip'), 'all four seats can have hold of a top at the same time');
      await api.shot('garden-gauges');

      // --- the hand-off: bring the finish line down to the party's total (there is no clock to force), watch the
      // sign, then the map
      const beforeEnd = await api.summary();
      assert(beforeEnd.top.total >= 1, `something was pulled before the ending (total ${beforeEnd.top.total})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'garden' && s2.top.phase === 1 && /^CARROTS: \d+$/.test(s2.top.sign), `the target was reached: the CARROTS sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
      await api.shot('garden-sign');
      const banked2 = s2.top.total;
      await api.step(HOLD);
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the garden hands back to the map (on ${s3.screen})`);
      // the target the ORDER asked for, not the screen's (the tests lift the screen's so it cannot end early)
      const line = (s3.run.needs || []).find((n) => n.startsWith('carrot:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(banked2, orderTarget), `run.gather('carrot') banked the party's total (${line}, total ${banked2})`);
    });
  },
};
