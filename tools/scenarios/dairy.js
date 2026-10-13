// Playtest scenarios for the dairy work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   dairy - four seats in the byre on the CUSTARD TART order, so the target is the order's own milk line and not
//           the fallback: seat 0 is milked with REAL input through api.press - twelve taps of action, one pail, the
//           party's total up by one, and the other seats still on zero. Then the two things the byre promises:
//             any rhythm works - twelve taps spread over six seconds fill a pail just the same;
//             nothing else does anything - `alt` moves nothing, and no cow ever kicks.
//           Finally the finish line is brought down to the party's total: the MILK sign drops, is held, and the screen hands back
//           to the map with the order's milk line updated by the party's total.
//           Shots: tools/screens/dairy-pump.png (mid-squirt: the jet, the ring, the chevron on its next step) and
//           dairy-sign.png.
//   dairyButter - two seats on the PEACH COBBLER order, so the byre's visit is for butter: a barrel churn stands
//           beside each stall. Twelve taps fill the pail and bank NOTHING - the seat turns to the churn instead
//           (phase 1, churn 0, the total unchanged); the next eleven taps turn the crank and still bank nothing;
//           the twelfth brings the pat (count and total up by one, the seat back at the cow, phase 0). Then the
//           finish line is brought down to the total: the BUTTER sign and the map with the order's butter line updated. Shots: dairy-churn.png (mid-crank).
//           Both rules scenarios hold the cows' jokes off (jokeIn 999 on every stall) and check at the end that none
//           played: a joke locks the buttons for two seconds, which would read as lost taps.
//   dairySwish - the tail, forced by hand through the deal's own fields: the twitch, the wind-up, THWAP and the
//           somersault, the stars, the climb back, nothing lost. Shots: dairy-swish-tell, -windup, -thwap, -dizzy.
//   dairyCowlick - the cowlick, the same way: the tell with the milking going on, the wind-up, SHLURP, the quiff and
//           its pats and BOINGs, nothing lost; then a butter visit with the pour in the middle of the tell. Shots:
//           dairy-cowlick-tell, -windup, -lick, -quiff, -pat, -boing, -butter.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** The screen's own numbers, mirrored here so a change to either side shows up as a failing assert. */
const PUMP_PER_PAIL = 12;
/** ?order=5 is ORDERS[4], CUSTARD TART: milk 3 + egg 2, so `milk` is a real line on the ticket. */
const BOOT = 'skipTo=dairy&critters=0,1,2,3&order=5';
/** ?recipes=8 fixes the menu to ORDERS[8], PEACH COBBLER: peach 3 + butter 2, so the dairy's visit is for butter. */
// no Barley in the butter party: his one-in-twenty gulp of the only pat would leave the ending with nothing banked
const BOOT_BUTTER = 'skipTo=dairy&critters=1,2&recipes=8';
const CHURN_PRESSES = 12;
/** The frame of the squirt the pump shot is taken on: the jet is still up and the ring has opened. */
const PUMP_SHOT = 3;
/**
 * The jokes' numbers (screens/dairyGags.ts): the two kinds, the deal (a pail in JOKE_ODDS, squirt JOKE_FROM..JOKE_TO
 * of it, at most JOKE_CAP pails apart), the cowlick's countdown and the look's beats inside it, the tail's countdown.
 */
const LICK = 0, TAIL = 1, JOKE_FROM = 3, JOKE_TO = 10, JOKE_CAP = 8;
const LICK_TELL = 40, LICK_WIND = 24, LICK_LOOK = 128, LICK_TOTAL = LICK_TELL + LICK_WIND + LICK_LOOK;
const LICKED = 20, STUN = 22, PAT = 14, PAT_ON = 5, PAT_1 = LICK_LOOK - LICKED - STUN, SPRING_1 = PAT_1 - PAT;
const SWISH_WIND = 30, SWISH_SPIN = 18, SWISH_DIZZY = 48, SWISH_CLIMB = 14;
const SWISH_BANG = SWISH_SPIN + SWISH_DIZZY + SWISH_CLIMB, SWISH_TOTAL = SWISH_WIND + SWISH_BANG;
/** One tap the way the rules scenarios tap: a frame down, TAP_GAP up. */
const TAP_GAP = 3;

/**
 * Hold the finish line out of reach so a +1 cannot end the round mid-test (run.gather still clamps to the order), and
 * hold every cow's jokes: either one locks the buttons for two seconds, which would break a count of taps.
 * dairySwish and dairyCowlick test the jokes on their own.
 */
function holdTarget(page) {
  return page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 4); sc.setTotal(sc.total); for (const s of sc.seats) s.jokeIn = 999; });
}
/** Seat 0 as the sim holds it. */
function seat0(page) {
  return page.evaluate(() => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    return {
      fill: s.fill, count: s.count, gulped: s.gulped, bumpT: s.bumpT, anim: s.anim, total: sc.total, phase: s.phase, churn: s.churn, facing: s.facing,
      jokeIn: s.jokeIn, lickT: s.lickT, swishT: s.swishT, licks: sc.licks, swishes: sc.swishes,
    };
  });
}
/** Deal seat 0's cow a joke by hand, through the fields the deal itself sets: `kind` due `inSquirts` squirts from now. */
function dealSeat0(page, kind, inSquirts) {
  return page.evaluate(([k, n]) => { const s = window.__game.game.screen.seats[0]; s.jokeKind = k; s.jokeIn = n; }, [kind, inSquirts]);
}
/** How many cards (bursts and bubbles) the shared kit has up: the same module the game draws them from. */
function cardsUp(page) {
  return page.evaluate(async () => (await import('/src/game/gags.ts')).gagsUp());
}
/** Step until seat 0's `field` countdown reads `t` (it must be above it now), so a shot lands on the beat it names. */
async function stepTo(api, page, field, t) {
  const now = await page.evaluate((f) => window.__game.game.screen.seats[0][f], field);
  assert(now >= t, `${field} is still above ${t} before stepping to it (${now})`);
  await api.step(now - t);
}

export const SCENARIOS = {
  async dairy(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'dairy', `the dairy is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4 && s0.top.cows.length === 4, `four seats, four cows (${s0.top.seats.length} / ${s0.top.cows.length})`);
      const milkLine = (s0.run.needs || []).find((n) => n.startsWith('milk:')) || '';
      assert(milkLine === `milk:0/${s0.top.target}` && s0.top.target > 0, `the target is the order's own milk line (${milkLine}, target ${s0.top.target})`);
      const others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => s.count));

      // --- real input: twelve quick taps fill a pail and bank one milk for the party
      await holdTarget(page);
      const before = await seat0(page);
      assert(before.fill === 0, `seat 0 starts with an empty pail (fill ${before.fill})`);
      let shot = false;
      for (let i = 0; i < PUMP_PER_PAIL; i++) {
        await api.hold(0, { action: true });
        await api.step(1);
        await api.release(0);
        if (!shot) { await api.step(PUMP_SHOT); await api.shot('dairy-pump'); shot = true; await api.step(4); }
        else await api.step(7);
        const mid = await seat0(page);
        if (i < PUMP_PER_PAIL - 1) assert(mid.fill === i + 1, `tap ${i + 1} is a squirt: the pail is ${i + 1}/${PUMP_PER_PAIL} (fill ${mid.fill})`);
      }
      const filled = await seat0(page);
      // seat 0 is Barley, who gulps one pail in twenty: a full pail is banked (count and total up) or gulped (neither)
      assert(filled.count + filled.gulped === before.count + before.gulped + 1, `twelve taps bank a pail or Barley gulps it (seat 0 ${before.count} -> ${filled.count}, gulped ${filled.gulped})`);
      assert(filled.total === before.total + (filled.count - before.count), `and the party's total goes up only when it is banked (${before.total} -> ${filled.total})`);
      assert(filled.fill === 0, `a fresh pail slides in (fill ${filled.fill})`);
      const after = await api.summary();
      assert(JSON.stringify(after.top.seats.slice(1).map((s) => s.count)) === others0, 'the other seats, with no input, milked nothing');

      // --- any rhythm: twelve slow taps, half a second apart, fill a pail just the same
      const slowBefore = await seat0(page);
      for (let i = 0; i < PUMP_PER_PAIL; i++) await api.press(0, { action: true }, 1, 29);
      const slow = await seat0(page);
      // seat 0 is Barley here, who gulps one pail in twenty (GULP_CHANCE): a full pail is banked or gulped, never both
      assert(slow.count + slow.gulped === slowBefore.count + slowBefore.gulped + 1 && slow.fill === 0, `twelve slow taps fill a pail too, banked or gulped (seat 0 ${slowBefore.count} -> ${slow.count}, gulped ${slow.gulped}, fill ${slow.fill})`);

      // --- nothing else does anything: `alt` is not a pump, and no cow ever kicks
      // forty taps are three more pails: push the finish line well out so the mash cannot end the round under the assert
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = sc.total + 20; sc.setTotal(sc.total); });
      const altBefore = await seat0(page);
      await api.press(0, { alt: true }, 1, 3);
      const alted = await seat0(page);
      assert(alted.fill === altBefore.fill && alted.count === altBefore.count, `alt moves nothing (fill ${alted.fill}, count ${alted.count})`);
      for (let i = 0; i < 40; i++) await api.press(0, { action: true }, 1, 2);
      const mashed = await seat0(page);
      assert(mashed.bumpT === 0 && mashed.anim !== 'bump', `forty taps in a row and nothing kicks (bumpT ${mashed.bumpT}, anim '${mashed.anim}')`);
      // seat 0 is Barley: each full pail is banked or gulped, so count the two together
      assert(mashed.count + mashed.gulped === altBefore.count + altBefore.gulped + Math.floor((altBefore.fill + 40) / PUMP_PER_PAIL), `every one of them banked or gulped (seat 0 ${altBefore.count} -> ${mashed.count}, gulped ${mashed.gulped})`);
      assert(mashed.licks === 0 && mashed.swishes === 0 && mashed.lickT === 0 && mashed.swishT === 0, `held off, no joke played in the rules test (licks ${mashed.licks}, swishes ${mashed.swishes})`);

      // --- the ending: bring the finish line down to the party's total (there is no clock to force), expect the sign,
      // then the map with the milk banked
      const last = await api.summary();
      assert(last.top.total >= 1, `something was milked before the ending (total ${last.top.total})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'dairy' && s2.top.phase === 1 && /^MILK: \d+$/.test(s2.top.sign), `the target was reached: the MILK sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
      await api.shot('dairy-sign');
      await api.step(HOLD);
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the dairy hands back to the map (on ${s3.screen})`);
      // the target the ORDER asked for, not the screen's (holdTarget lifted the screen's so it could not end early)
      const total = last.top.total, target = s0.top.target;
      const line = (s3.run.needs || []).find((n) => n.startsWith('milk:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(total, target), `run.gather('milk') banked the party's total (${line}, total ${total})`);
    });
  },

  /**
   * dairySwish - the old joke made big, forced through the deal's own fields: seat 0's cow is dealt the TAIL three
   *              squirts off. Two taps and it is one squirt off, the tuft twitching (dairy-swish-tell). The third
   *              starts the WIND-UP: the '!' card goes up, the buttons lock (a tap is nothing), and the tail swings
   *              over the rump faster and faster (dairy-swish-windup). THWAP!: `swishes` 1, the card, and the
   *              milker somersaults off the stool (dairy-swish-thwap) into the straw, where it sits seeing stars
   *              (dairy-swish-dizzy) with the buttons still locked. Then it climbs back on: the seat is free, the
   *              pail kept its three, the next joke is dealt a pail or more off, and nine more taps bank the pail.
   */
  async dairySwish(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      await holdTarget(page);
      await dealSeat0(page, TAIL, 3);
      for (let i = 0; i < 2; i++) await api.press(0, { action: true }, 1, TAP_GAP);
      const tell = await seat0(page);
      assert(tell.fill === 2 && tell.jokeIn === 1 && tell.swishT === 0, `two squirts in, the tail is one squirt off and its tuft twitching (fill ${tell.fill}, jokeIn ${tell.jokeIn})`);
      await api.step(4);
      await api.shot('dairy-swish-tell');
      const cards0 = await cardsUp(page);
      await api.press(0, { action: true }, 1, TAP_GAP);
      const wind = await seat0(page);
      assert(wind.fill === 3 && wind.swishT === SWISH_TOTAL - TAP_GAP && wind.anim === 'swishBrace' && wind.swishes === 0,
        `the third squirt starts the wind-up (fill ${wind.fill}, swishT ${wind.swishT}, anim '${wind.anim}', swishes ${wind.swishes})`);
      assert((await cardsUp(page)) > cards0, `the '!' card goes up over the milker (${cards0} -> ${await cardsUp(page)} cards)`);
      await api.press(0, { action: true }, 1, 0);
      assert((await seat0(page)).fill === 3, 'a tap in the wind-up is nothing: the buttons are locked');
      await stepTo(api, page, 'swishT', SWISH_BANG + 8);
      await api.shot('dairy-swish-windup');

      // THWAP: the count, the card, and off the stool
      await stepTo(api, page, 'swishT', SWISH_BANG - 5);
      const thwap = await seat0(page);
      assert(thwap.swishes === 1 && thwap.anim === 'thwapSpin', `THWAP: the tail lands and the milker goes over (swishes ${thwap.swishes}, anim '${thwap.anim}')`);
      assert((await cardsUp(page)) >= 1, 'the THWAP! card is up');
      await api.shot('dairy-swish-thwap');
      await stepTo(api, page, 'swishT', SWISH_CLIMB + SWISH_DIZZY / 2);
      const sat = await seat0(page);
      assert(sat.anim === 'thwapSit' && sat.fill === 3 && sat.count === 0, `sat in the straw seeing stars, the pail untouched (anim '${sat.anim}', fill ${sat.fill})`);
      await api.shot('dairy-swish-dizzy');
      await api.press(0, { action: true }, 1, 0);
      assert((await seat0(page)).fill === 3, 'a tap while it sees stars is nothing');

      // back on the stool: free again, nothing lost, the next joke dealt
      await stepTo(api, page, 'swishT', 0);
      const after = await seat0(page);
      assert(after.swishT === 0 && after.anim === 'milkIdle' && after.fill === 3 && after.count === 0 && after.total === 0,
        `it climbs back on and the pail kept its three (swishT ${after.swishT}, anim '${after.anim}', fill ${after.fill})`);
      const left = PUMP_PER_PAIL - 3;
      assert(after.jokeIn >= left + JOKE_FROM && after.jokeIn <= left + JOKE_CAP * PUMP_PER_PAIL + JOKE_TO,
        `the next joke is dealt into a later pail (jokeIn ${after.jokeIn}, ${left + JOKE_FROM}..${left + JOKE_CAP * PUMP_PER_PAIL + JOKE_TO})`);
      for (let i = 0; i < PUMP_PER_PAIL - 3; i++) await api.press(0, { action: true }, 1, TAP_GAP);
      const banked = await seat0(page);
      assert(banked.count === 1 && banked.total === 1, `nine more taps bank the pail (count ${banked.count}, total ${banked.total})`);
    });
  },

  /**
   * dairyCowlick - the new joke, forced the same way: seat 0's cow is dealt the COWLICK three squirts off. The third
   *              squirt starts the TELL: `lickT` running, her head round with her tongue out (dairy-cowlick-tell),
   *              and the seat still free - two more squirts land in the pail. The WIND-UP locks the buttons, the
   *              tongue unrolls and the '!' goes up (dairy-cowlick-windup). SHLURP!: `licks` 1, the card, the milker up
   *              on its toes (dairy-cowlick-lick). The LOOK: the quiff standing (dairy-cowlick-quiff), patted down
   *              (dairy-cowlick-pat), BOING! back up (dairy-cowlick-boing), the buttons locked throughout. At the end
   *              the seat is free, the pail kept its five, and seven more taps bank it.
   *              Then a BUTTER visit: the tell runs through the pail's twelfth, the pail pours and the milker turns to
   *              the churn, and the lick still lands, on the back of its head (dairy-cowlick-butter): the crank is
   *              locked through the joke and turns again after it, and the joke banks and loses nothing.
   */
  async dairyCowlick(server) {
    await withPage(server, BOOT, async (api, page) => {
      await api.step(2);
      await holdTarget(page);
      await dealSeat0(page, LICK, 3);
      for (let i = 0; i < 3; i++) await api.press(0, { action: true }, 1, TAP_GAP);
      const tell = await seat0(page);
      assert(tell.fill === 3 && tell.lickT === LICK_TOTAL - TAP_GAP && tell.licks === 0, `the third squirt starts the tell (fill ${tell.fill}, lickT ${tell.lickT}, licks ${tell.licks})`);
      await stepTo(api, page, 'lickT', LICK_TOTAL - 16);
      await api.shot('dairy-cowlick-tell');
      for (let i = 0; i < 2; i++) await api.press(0, { action: true }, 1, TAP_GAP);
      const milking = await seat0(page);
      assert(milking.fill === 5 && milking.lickT > LICK_WIND + LICK_LOOK, `the milking goes on through the tell (fill ${milking.fill}, lickT ${milking.lickT})`);

      // the wind-up: locked, the tongue coming, the '!' at the last moment
      await stepTo(api, page, 'lickT', LICK_WIND + LICK_LOOK - 2);
      const wind = await seat0(page);
      assert(wind.anim === 'lickWait', `the wind-up: the milker freezes and stares at the tongue (anim '${wind.anim}')`);
      await api.press(0, { action: true }, 1, 0);
      assert((await seat0(page)).fill === 5, 'a tap in the wind-up is nothing: the buttons are locked');
      await stepTo(api, page, 'lickT', LICK_LOOK + 4);
      assert((await cardsUp(page)) >= 1, "the '!' card is up as the tongue arrives");
      await api.shot('dairy-cowlick-windup');

      // SHLURP: the count, the card, up onto its toes
      await stepTo(api, page, 'lickT', LICK_LOOK - 3);
      const lick = await seat0(page);
      assert(lick.licks === 1 && lick.anim === 'licked', `SHLURP: one lick up the face (licks ${lick.licks}, anim '${lick.anim}')`);
      assert((await cardsUp(page)) >= 1, 'the SHLURP! card is up');
      await api.shot('dairy-cowlick-lick');

      // the look: the quiff, a pat, BOING - and the buttons locked all through it
      await stepTo(api, page, 'lickT', PAT_1 + 6);
      assert((await seat0(page)).anim === 'quiffStun', 'the quiff stands up and the milker stares up at it');
      await api.shot('dairy-cowlick-quiff');
      await stepTo(api, page, 'lickT', PAT_1 - PAT_ON - 3);
      assert((await seat0(page)).anim === 'quiffPat', 'it pats the quiff down');
      await api.shot('dairy-cowlick-pat');
      await stepTo(api, page, 'lickT', SPRING_1 - 4);
      const boing = await seat0(page);
      assert(boing.anim === 'quiffGlare' && (await cardsUp(page)) >= 1, `BOING: it springs back up, the card is up (anim '${boing.anim}')`);
      await api.shot('dairy-cowlick-boing');
      await api.press(0, { action: true }, 1, 0);
      assert((await seat0(page)).fill === 5, 'a tap in the look is nothing');

      // over: free again, nothing lost, the next joke dealt (two squirts of the tell already counted off it)
      await stepTo(api, page, 'lickT', 0);
      const after = await seat0(page);
      assert(after.lickT === 0 && after.anim === 'milkIdle' && after.fill === 5 && after.count === 0 && after.total === 0,
        `the quiff stays down and the pail kept its five (lickT ${after.lickT}, anim '${after.anim}', fill ${after.fill})`);
      const left = PUMP_PER_PAIL - 3 - 2;
      assert(after.jokeIn >= left + JOKE_FROM && after.jokeIn <= left + JOKE_CAP * PUMP_PER_PAIL + JOKE_TO,
        `the next joke is dealt into a later pail (jokeIn ${after.jokeIn})`);
      for (let i = 0; i < PUMP_PER_PAIL - 5; i++) await api.press(0, { action: true }, 1, TAP_GAP);
      const banked = await seat0(page);
      assert(banked.count === 1 && banked.total === 1, `seven more taps bank the pail (count ${banked.count}, total ${banked.total})`);
    });

    // the butter visit: the pour lands in the middle of the tell, and the lick still comes
    await withPage(server, BOOT_BUTTER, async (api, page) => {
      await api.step(2);
      await holdTarget(page);
      for (let i = 0; i < PUMP_PER_PAIL - 3; i++) await api.press(0, { action: true }, 1, TAP_GAP);
      await dealSeat0(page, LICK, 1);
      await api.press(0, { action: true }, 1, TAP_GAP);
      const tell = await seat0(page);
      assert(tell.fill === PUMP_PER_PAIL - 2 && tell.lickT > LICK_WIND + LICK_LOOK, `the tell starts two squirts from a full pail (fill ${tell.fill}, lickT ${tell.lickT})`);
      for (let i = 0; i < 2; i++) await api.press(0, { action: true }, 1, TAP_GAP);
      const poured = await seat0(page);
      assert(poured.phase === 1 && poured.facing === 1 && poured.churn === 0 && poured.lickT > LICK_WIND + LICK_LOOK,
        `the pail pours mid-tell and the milker turns to the churn, the tell still running (phase ${poured.phase}, facing ${poured.facing}, lickT ${poured.lickT})`);
      await stepTo(api, page, 'lickT', LICK_WIND + LICK_LOOK - 2);
      await api.press(0, { action: true }, 1, 0);
      assert((await seat0(page)).churn === 0, 'the wind-up locks the crank too');
      await stepTo(api, page, 'lickT', PAT_1 + 6);
      const licked = await seat0(page);
      assert(licked.licks === 1 && licked.facing === 1 && licked.phase === 1, `the lick lands on the back of its head, at the churn (licks ${licked.licks}, facing ${licked.facing})`);
      await api.shot('dairy-cowlick-butter');
      await stepTo(api, page, 'lickT', 0);
      await api.press(0, { action: true }, 1, TAP_GAP);
      const cranked = await seat0(page);
      assert(cranked.churn === 1 && cranked.phase === 1 && cranked.count === 0 && cranked.total === 0,
        `after the look the crank turns again, and the joke banked and lost nothing (churn ${cranked.churn}, count ${cranked.count}, total ${cranked.total})`);
    });
  },
  async dairyButter(server) {
    await withPage(server, BOOT_BUTTER, async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'dairy' && s0.top.seats.length === 2, `the dairy is up with two seats (on ${s0.screen}, ${s0.top.seats.length} seats)`);
      const butterLine = (s0.run.needs || []).find((n) => n.startsWith('butter:')) || '';
      assert(butterLine === `butter:0/${s0.top.target}` && s0.top.target > 0, `the visit is for the order's own butter line (${butterLine}, target ${s0.top.target})`);
      const isButter = await page.evaluate(() => window.__game.game.screen.butter === true && window.__game.game.screen.ing === 'butter');
      assert(isButter, 'the screen knows it is a butter visit (the churns stand)');
      await holdTarget(page);

      // --- the pail: twelve taps fill it, and on a butter visit that banks nothing - the seat turns to the churn
      const before = await seat0(page);
      assert(before.phase === 0 && before.facing === -1, `seat 0 starts at the cow (phase ${before.phase}, facing ${before.facing})`);
      for (let i = 0; i < PUMP_PER_PAIL; i++) await api.press(0, { action: true }, 1, 3);
      const poured = await seat0(page);
      assert(poured.phase === 1 && poured.churn === 0 && poured.fill === 0, `a full pail pours into the churn: the seat is cranking with an empty crank (phase ${poured.phase}, churn ${poured.churn}, fill ${poured.fill})`);
      assert(poured.count === before.count && poured.total === before.total, `and nothing is banked yet (count ${poured.count}, total ${poured.total})`);
      assert(poured.facing === 1, `the milker has turned round to the churn (facing ${poured.facing})`);

      // --- the crank: eleven turns are eleven turns, the twelfth is the pat
      for (let i = 0; i < CHURN_PRESSES - 1; i++) {
        await api.press(0, { action: true }, 1, 3);
        if (i === 4) { await api.step(1); await api.shot('dairy-churn'); }
      }
      const almost = await seat0(page);
      assert(almost.phase === 1 && almost.churn === CHURN_PRESSES - 1 && almost.total === before.total, `${CHURN_PRESSES - 1} turns of the crank are ${CHURN_PRESSES - 1} turns (phase ${almost.phase}, churn ${almost.churn}, total ${almost.total})`);
      await api.press(0, { action: true }, 1, 3);
      const patted = await seat0(page);
      assert(patted.count === before.count + 1 && patted.total === before.total + 1, `the ${CHURN_PRESSES}th turn brings the butter (seat 0 ${before.count} -> ${patted.count}, total ${before.total} -> ${patted.total})`);
      assert(patted.phase === 0 && patted.churn === 0 && patted.facing === -1, `and the milker is back at the cow with a fresh pail (phase ${patted.phase}, churn ${patted.churn}, facing ${patted.facing})`);
      assert(patted.licks === 0 && patted.swishes === 0, `held off, no joke played in the butter rules test (licks ${patted.licks}, swishes ${patted.swishes})`);
      const other = (await api.summary()).top.seats[1];
      assert(other.count === 0 && other.phase === 0, `the other seat, with no input, did nothing (count ${other.count}, phase ${other.phase})`);

      // --- the ending: bring the finish line down to the party's total (there is no clock to force), the BUTTER
      // sign, then the map with the butter banked against the order
      const last = await api.summary();
      assert(last.top.total >= 1, `something was churned before the ending (total ${last.top.total})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'dairy' && s2.top.phase === 1 && /^BUTTER: \d+$/.test(s2.top.sign), `the target was reached: the BUTTER sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
      await api.step(HOLD);
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the dairy hands back to the map (on ${s3.screen})`);
      const line = (s3.run.needs || []).find((n) => n.startsWith('butter:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(last.top.total, s0.top.target), `run.gather('butter') banked the party's total (${line}, total ${last.top.total})`);
    });
  },
};
