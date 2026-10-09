// Playtest scenarios for the hives work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   hive - four seats at Clover Hives on the HONEY LOAF order (?order=4, the one whose needs carry a honey line):
//          the screen is up with four seats and a target read from that line; seat 0 is driven with real held input
//          and actually creeps along the meadow while the unpressed seats stay put. Then the scene's ONE RULE is
//          driven with real input at a skep:
//            - holding `action` within REACH of a full skep for DIP_HOLD frames scores and empties that skep;
//            - letting go early scores nothing, costs nothing, and leaves the skep full for the next hold;
//            - holding at an EMPTY skep does nothing at all.
//          Finally the finish line is brought down to the party's total: the HONEY sign drops, is held, and the screen hands back
//          to the map with run.gather('honey') banked into the order's honey line. Every hold under test holds BOTH
//          jokes off (no skep overfull, no bee due), so a rule here never sees a joke.
//          Screenshots: tools/screens/hive-dip.png (the dipper in a full skep, the strand of honey climbing it and
//          the bar over the knob half full - the shot the skeps' and the dipper's readability are judged from) and
//          hive-sign.png for the ending.
//   hiveBee - the first joke, the curious bee, beat by beat (see the scenario).
//   hiveFlood - the second, the honey flood, on Sorrel and then on Barley, who licks it off (see the scenario).
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** The screen's own numbers, mirrored here so an assert says what it expects rather than what it found. */
const DIP_HOLD = 60;
/** The frame of the hold the picture is taken on: the dipper is up in the doorway and the bar is half full. */
const DIP_SHOT = 30;
/** Held-input leg: 90 frames of `right` is 162 px at the screen's 1.8 px/frame creep. */
const CREEP_FRAMES = 90;
/** The curious bee's beats (screens/hiveGags.ts): it comes BEE_AT frames into the hold, then CIRCLE, TREMBLE, STIFF, FALL, LIE, SPRING. */
const BEE_AT = 20, BEE_CIRCLE = 24, BEE_TREMBLE = 32, BEE_STIFF = 6, BEE_FALL = 12, BEE_LIE = 30, BEE_SPRING = 16;
const BEE_LANDS = BEE_CIRCLE, BEE_RIGID = BEE_LANDS + BEE_TREMBLE, BEE_FLUMP = BEE_RIGID + BEE_STIFF + BEE_FALL, BEE_UP = BEE_FLUMP + BEE_LIE;
const BEE_TOTAL = BEE_UP + BEE_SPRING;
/** The honey flood's (screens/hiveGags.ts): the swell over a hold's last SWELL_FRAMES, then GLOOP, STUCK, POP, DRAIN; Barley's GLOOP, three licks, SMACK. */
const SWELL_FRAMES = 24, GLOOP_FRAMES = 18, STUCK_FRAMES = 60, POP_FRAMES = 14, DRAIN_FRAMES = 28;
const FLOOD_TOTAL = GLOOP_FRAMES + STUCK_FRAMES + POP_FRAMES + DRAIN_FRAMES, SHLUP_AT = GLOOP_FRAMES + STUCK_FRAMES, DRAIN_AT = SHLUP_AT + POP_FRAMES;
const LICKS = 3, LICK_FRAMES = 14, SMACK_FRAMES = 24, LICK_TOTAL = GLOOP_FRAMES + LICKS * LICK_FRAMES + SMACK_FRAMES;
/** The creep, for the stick-works-again checks: 10 frames of it is 18 px. */
const SPEED = 1.8;

/**
 * Park a seat (0 unless given) on a skep's dip spot with every skep full, none of them overfull, its hold and any
 * joke on it cleared, and hold the target out of reach so the dips under test cannot end the round early.
 * run.gather() clamps to the order's own line, so the bank assert at the end still reads the real target (the
 * orchard does the same).
 */
function parkAtSkep(page, x, seat = 0) {
  return page.evaluate(([sx, i]) => {
    const sc = window.__game.game.screen, s = sc.seats[i];
    for (const k of sc.skeps) { k.refill = 0; k.held = 0; k.over = 0; }
    s.x = sx; s.facing = 1; s.moving = false; s.bumpT = 0; s.dipT = 0; s.dipSkep = -1;
    s.beeDue = 0; s.beeT = 0; s.floodT = 0; s.floodSkep = -1;
    sc.target = Math.max(sc.target, sc.total + 4); sc.setTotal(sc.total);
    return { count: s.count, total: sc.total };
  }, [x, seat]);
}

/** A seat as the sim holds it (summary() carries the same numbers, but this reads them without the round's noise). */
function seatOf(page, i = 0) {
  return page.evaluate((k) => {
    const sc = window.__game.game.screen, s = sc.seats[k];
    return {
      count: s.count, dipT: s.dipT, dipSkep: s.dipSkep, bumpT: s.bumpT, anim: s.anim, total: sc.total, beeDue: s.beeDue, beeT: s.beeT, bees: sc.bees,
      floodT: s.floodT, floods: sc.floods, x: s.x, facing: s.facing, rot: s.player.pose.root.rot, critter: s.critter,
    };
  }, i);
}
/** Seat 0, the one the rules test drives. */
function seat0(page) { return seatOf(page, 0); }
/** The bee (screens/hive.ts): whether the hold that just started gets one. The main scenario's holds must not; hiveBee's must. */
function setBee(page, due) { return page.evaluate((d) => { window.__game.game.screen.seats[0].beeDue = d; }, due); }
/** The flood's deal on one skep, set by hand through the field the deal sets (screens/hive.ts Skep.over). */
function setOver(page, skep, over) { return page.evaluate(([i, o]) => { window.__game.game.screen.skeps[i].over = o; }, [skep, over]); }
/** How many word cards are up (game/gags.ts): the same module instance as the game's, since the URL is the same. */
function cardsUp(page) { return page.evaluate(async () => (await import('/src/game/gags.ts')).gagsUp()); }

export const SCENARIOS = {
  /**
   * hiveBee - the first joke, made bigger, on Barley: a hold at a full skep with a bee due (set by hand, as the deal
   *           sets it). BEE_AT frames in the bee COMES (beeT BEE_TOTAL, none landed yet) and the hold pauses with the
   *           stick locked while it circles the head - the tell. BEE_LANDS frames later it is on the nose (bees 1,
   *           the '!' card); the critter trembles, goes rigid, and falls over backwards like a plank, flat on its back
   *           at BEE_FLUMP (the root turned -90, the FLUMP card up); it lies there BEE_LIE frames with the bee on its
   *           nose, springs up, and at BEE_TOTAL the hold runs on from where it was, to the honey. Nothing lost.
   *           Writes hive-bee-circle, hive-bee-nose, hive-bee-fall, hive-bee-flump, hive-bee-lie.
   */
  async hiveBee(server) {
    await withPage(server, 'skipTo=hive&critters=0,1&order=4', async (api, page) => {
      await api.step(2);
      const skepX = (await api.summary()).top.skeps[2][0];
      await parkAtSkep(page, skepX);
      await api.hold(0, { action: true });
      await api.step(1); await setBee(page, 1);
      await api.step(BEE_AT - 1);
      const comes = await seat0(page);
      assert(comes.beeT === BEE_TOTAL && comes.bees === 0 && comes.dipT === BEE_AT && comes.anim === 'beeWatch',
        `${BEE_AT} frames in, the bee comes and circles: the hold pauses (beeT ${comes.beeT}, bees ${comes.bees}, dipT ${comes.dipT}, ${comes.anim})`);
      // the stick is locked for the whole beat: pushing it moves nobody. The picture is half way round the turn,
      // the bee level with the back of the head (CIRCLE_SHOT: its 8-frame dive and half of its 16-frame turn)
      const CIRCLE_SHOT = 16;
      await api.hold(0, { action: true, left: true });
      await api.step(CIRCLE_SHOT);
      await api.shot('hive-bee-circle');
      await api.step(BEE_LANDS - CIRCLE_SHOT);
      const nose = await seat0(page);
      assert(nose.bees === 1 && nose.anim === 'beeNose' && (await cardsUp(page)) >= 1, `${BEE_LANDS} frames on it lands on the nose: '!' (bees ${nose.bees}, ${nose.anim})`);
      assert(nose.x === comes.x && nose.dipT === BEE_AT, `and the stick did nothing while it circled (x ${comes.x} -> ${nose.x}, dipT ${nose.dipT})`);
      await api.step(10);
      await api.shot('hive-bee-nose');
      // two frames before it hits the ground: the fall gathers speed (ease `in`), so this is past halfway over
      const FALL_SHOT = BEE_RIGID + BEE_STIFF + BEE_FALL - 2;
      await api.step(FALL_SHOT - BEE_LANDS - 10);
      const fall = await seat0(page);
      assert(fall.anim === 'plank' && fall.rot < 0 && fall.rot > -90, `cross-eyed, then rigid, then over backwards like a plank (${fall.anim}, root ${fall.rot.toFixed(1)} deg)`);
      await api.shot('hive-bee-fall');
      await api.step(BEE_FLUMP - FALL_SHOT);
      const flump = await seat0(page);
      assert(flump.anim === 'flat' && flump.rot === -90 && (await cardsUp(page)) >= 1, `FLUMP: flat on its back, a card up (${flump.anim}, root ${flump.rot} deg)`);
      await api.step(6);
      await api.shot('hive-bee-flump');
      await api.step(BEE_LIE - 6 - 8);
      await api.shot('hive-bee-lie');
      await api.step(8);
      const up = await seat0(page);
      assert(up.anim === 'spring' && up.beeT === BEE_TOTAL - BEE_UP, `after lying there ${BEE_LIE} frames it springs up (${up.anim}, beeT ${up.beeT})`);
      await api.step(BEE_SPRING);
      const paused = await seat0(page);
      assert(paused.beeT === 0 && paused.dipT === BEE_AT && paused.count === 0 && paused.anim === 'dip' && paused.x === comes.x,
        `back on its feet in the dip: the hold waited for the bee (dipT ${paused.dipT}, beeT ${paused.beeT}, count ${paused.count}, ${paused.anim})`);
      await api.hold(0, { action: true });
      await api.step(DIP_HOLD - BEE_AT + 1);
      await api.release(0);
      const done = await seat0(page);
      assert(done.count === 1 && done.total === 1, `and ran on to the honey once it had gone: one jar, nothing lost (count ${done.count}, total ${done.total})`);
      await api.hold(0, { right: true });
      await api.step(10);
      await api.release(0);
      const free = await seat0(page);
      assert(free.x >= done.x + 10 * SPEED - 1, `and the stick is the player's again (x ${done.x} -> ${free.x})`);
    });
  },

  /**
   * hiveFlood - the new joke, on Sorrel (seat 0) and then Barley (seat 1). An OVERFULL skep, dealt by hand through
   *             the field the deal sets: the tell is flagged (summary skeps[i][2]) and a hold at it rolls no bee. The
   *             hold runs as normal; SWELL_FRAMES from its end the skep swells ('!' up); it lands +1 exactly, the
   *             skep empties and is overfull no more, and the critter is flooded: the GLOOP card, floodT running, the
   *             stick only straining (x never moves, the critter turns to face the push and plays `strain`), SHLUP at
   *             SHLUP_AT, the drain, and at FLOOD_TOTAL a player again. Barley gets the same flood and licks it off
   *             instead (`lick`, never stuck, then `smack` and MMM!), free at LICK_TOTAL, sooner than anyone
   *             struggles out of it. Last, the round's end lands on a bee and a flood at once: finish() clears both
   *             and every jar is kept. Writes hive-flood-tell, hive-flood-swell, hive-flood-gloop, hive-flood-stuck,
   *             hive-flood-shlup, hive-flood-drain, hive-flood-barley, hive-flood-mmm.
   */
  async hiveFlood(server) {
    await withPage(server, 'skipTo=hive&critters=1,0&order=4', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary(), skepX = s0.top.skeps[2][0], lastX = s0.top.skeps[4][0];
      // ---- the tell: an overfull skep, flagged and drawn ----
      const before = await parkAtSkep(page, skepX);
      await setOver(page, 2, 1);
      await api.step(20);
      const tell = (await api.summary()).top.skeps[2];
      assert(tell[1] === 0 && tell[2] === 1, `the skep is full and overfull: it oozes (refill ${tell[1]}, over ${tell[2]})`);
      await api.shot('hive-flood-tell');
      // ---- the wind-up: the hold runs as normal, then the skep swells and groans ----
      await api.hold(0, { action: true });
      await api.step(1);
      const start = await seat0(page);
      assert(start.dipT === 1 && start.beeDue === 0, `a hold at an overfull skep takes it, and rolls no bee (dipT ${start.dipT}, beeDue ${start.beeDue})`);
      await api.step(DIP_HOLD - SWELL_FRAMES - 1);
      const swell = await seat0(page);
      assert(swell.dipT === DIP_HOLD - SWELL_FRAMES && swell.count === before.count && (await cardsUp(page)) >= 1,
        `${SWELL_FRAMES} frames from the end the skep swells: '!' (dipT ${swell.dipT}, cards up)`);
      await api.step(14);
      await api.shot('hive-flood-swell');
      // ---- the bang: the hold lands, +1 as ever, and the skep burps its honey over the dipper ----
      await api.step(SWELL_FRAMES - 14);
      const gloop = await seat0(page);
      const empty = (await api.summary()).top.skeps[2];
      assert(gloop.count === before.count + 1 && gloop.total === before.total + 1, `the flood still scores: +1 exactly (seat ${before.count} -> ${gloop.count}, party ${before.total} -> ${gloop.total})`);
      assert(gloop.floodT === FLOOD_TOTAL && gloop.floods === 1 && gloop.anim === 'gulped' && gloop.dipT === 0, `GLOOP: flooded (floodT ${gloop.floodT}, floods ${gloop.floods}, ${gloop.anim})`);
      assert(empty[1] > 0 && empty[2] === 0 && (await cardsUp(page)) >= 1, `the skep is empty and overfull no more, and the card is up (refill ${empty[1]}, over ${empty[2]})`);
      await api.step(3);
      await api.shot('hive-flood-gloop');
      // ---- the look: stuck. The stick strains toward the push and moves nothing ----
      await api.hold(0, { left: true });
      await api.step(GLOOP_FRAMES - 3 + 30);
      const stuck = await seat0(page);
      assert(stuck.anim === 'strain' && stuck.facing === -1 && stuck.x === gloop.x, `stuck: pushing left only strains it that way (${stuck.anim}, facing ${stuck.facing}, x ${gloop.x} -> ${stuck.x})`);
      await api.shot('hive-flood-stuck');
      await api.release(0);
      await api.step(2);
      const still = await seat0(page);
      assert(still.anim === 'stuck' && still.x === gloop.x, `let go of the stick, it just stands in it (${still.anim})`);
      // ---- SHLUP: it pops free, shakes, and the honey runs off it ----
      await api.step(SHLUP_AT - (GLOOP_FRAMES + 30 + 2));
      const pop = await seat0(page);
      assert(pop.anim === 'pop' && pop.floodT === FLOOD_TOTAL - SHLUP_AT && (await cardsUp(page)) >= 1, `SHLUP: it pops free (${pop.anim}, floodT ${pop.floodT})`);
      await api.step(4);
      await api.shot('hive-flood-shlup');
      await api.step(DRAIN_AT + (DRAIN_FRAMES >> 1) - SHLUP_AT - 4);
      const drain = await seat0(page);
      assert(drain.anim === 'shake', `then shakes it off as the honey runs down it (${drain.anim})`);
      await api.shot('hive-flood-drain');
      await api.step(FLOOD_TOTAL - DRAIN_AT - (DRAIN_FRAMES >> 1));
      const clean = await seat0(page);
      assert(clean.floodT === 0 && clean.anim === 'carry' && clean.count === before.count + 1 && clean.total === before.total + 1,
        `after ${FLOOD_TOTAL} frames it is clean and a player again, and nothing was lost (floodT ${clean.floodT}, count ${clean.count}, total ${clean.total})`);
      await api.hold(0, { right: true });
      await api.step(10);
      await api.release(0);
      const walks = await seat0(page);
      assert(walks.x >= clean.x + 10 * SPEED - 1, `the stick moves it again (x ${clean.x} -> ${walks.x})`);

      // ---- Barley eats the evidence: the same flood on seat 1, licked off and never stuck ----
      const b0 = await parkAtSkep(page, lastX, 1);
      await setOver(page, 4, 1);
      const barley = await seatOf(page, 1);
      assert(barley.critter === 'barley', `seat 1 is Barley (${barley.critter})`);
      await api.hold(1, { action: true });
      await api.step(DIP_HOLD);
      const fed = await seatOf(page, 1);
      assert(fed.floodT === LICK_TOTAL && fed.count === b0.count + 1 && fed.total === b0.total + 1, `Barley's flood scores +1 too, and is a short one (floodT ${fed.floodT}, count ${fed.count})`);
      // he never gets stuck: pushing the stick through the licks makes him no strain, and moves him nowhere
      await api.hold(1, { right: true });
      await api.step(GLOOP_FRAMES + 1);
      const lick = await seatOf(page, 1);
      assert(lick.anim === 'lick', `he licks it off instead of struggling (${lick.anim})`);
      // the picture: after his first lick, the honey a third of the way down him and his tongue at it again
      const LICK_SHOT = LICK_FRAMES + 6;
      await api.step(LICK_SHOT);
      await api.shot('hive-flood-barley');
      const licking = await seatOf(page, 1);
      assert(licking.anim === 'lick' && licking.x === fed.x, `still licking, still where he stood (${licking.anim}, x ${fed.x} -> ${licking.x})`);
      const LICKED = GLOOP_FRAMES + LICKS * LICK_FRAMES;
      await api.step(LICKED + 1 - (GLOOP_FRAMES + 1) - LICK_SHOT);
      const smack = await seatOf(page, 1);
      assert(smack.anim === 'smack' && (await cardsUp(page)) >= 1, `licked clean, a pat of the belly: MMM! (${smack.anim})`);
      await api.step(4);
      await api.shot('hive-flood-mmm');
      await api.step(LICK_TOTAL - LICKED - 1 - 4);
      const licked = await seatOf(page, 1);
      assert(licked.floodT === 0 && LICK_TOTAL < FLOOD_TOTAL, `free in ${LICK_TOTAL} frames, sooner than anyone else's ${FLOOD_TOTAL} (floodT ${licked.floodT})`);
      await api.release(1);
      assert(licked.count === b0.count + 1 && licked.total === b0.total + 1, `and he ate nothing that was scored (count ${licked.count}, total ${licked.total})`);

      // ---- the round can end in the middle of both jokes at once: finish() clears them and nothing is lost ----
      await parkAtSkep(page, skepX, 0);
      await parkAtSkep(page, lastX, 1);
      await setOver(page, 4, 1);
      await api.hold(0, { action: true }); await api.hold(1, { action: true });
      await api.step(1); await setBee(page, 1);
      await api.step(DIP_HOLD - 1 + 6);
      const both = await Promise.all([seatOf(page, 0), seatOf(page, 1)]);
      assert(both[0].beeT > 0 && both[1].floodT > 0, `a bee on Sorrel and a flood on Barley, both running (beeT ${both[0].beeT}, floodT ${both[1].floodT})`);
      const banked = both[1].total;
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = sc.total; sc.setTotal(sc.total); });
      await api.step(2);
      await api.release(0); await api.release(1);
      const ended = await Promise.all([seatOf(page, 0), seatOf(page, 1)]);
      const sign = (await api.summary()).top;
      assert(sign.phase === 1 && ended.every((e) => e.beeT === 0 && e.floodT === 0 && e.anim === 'cheer'),
        `the target reached mid-joke: the sign drops, both jokes are simply over and both seats cheer (phase ${sign.phase}, ${ended.map((e) => e.anim).join('/')})`);
      assert(sign.honey === banked, `and the party keeps every jar (honey ${sign.honey}, ${banked} before)`);
    });
  },
  async hive(server) {
    await withPage(server, 'skipTo=hive&critters=0,1,2,3&order=4', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'hive', `the hives are up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4 && s0.top.target > 0, `four seats and a target from the order (${s0.top.seats.length} seats, target ${s0.top.target})`);
      assert(s0.top.skeps.length === 5, `five skeps along the bench (${s0.top.skeps.length})`);
      assert(typeof s0.top.swarm.x === 'number', `the swarm is drifting over the bench (x ${s0.top.swarm.x})`);
      const x0 = s0.top.seats[0][1], others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => s[1]));

      // real held input: seat 0 creeps, nobody else moves, and the clock counts every frame
      await api.hold(0, { right: true });
      await api.step(CREEP_FRAMES);
      await api.release(0);
      const moved = await api.summary();
      const x1 = moved.top.seats[0][1];
      assert(x1 > x0 && x1 >= 24 && x1 <= 616, `seat 0 crept along the meadow and stayed in the lane (${x0} -> ${x1})`);
      assert(JSON.stringify(moved.top.seats.slice(1).map((s) => s[1])) === others0, 'the other seats, with no input, stayed put');
      // 3 boot/settle frames + CREEP_FRAMES
      assert(moved.top.elapsed === 3 + CREEP_FRAMES, `the clock counted every frame (elapsed ${moved.top.elapsed}, expected ${3 + CREEP_FRAMES})`);

      // ---- the rule, half one: holding at a full skep for DIP_HOLD frames is honey ----
      const skepX = moved.top.skeps[2][0];
      const before = await parkAtSkep(page, skepX);
      await api.hold(0, { action: true });
      await api.step(1); await setBee(page, 0);   // the rule under test, not a joke: no bee (and parkAtSkep dealt no flood)
      await api.step((DIP_SHOT) - 1);
      const mid = await seat0(page);
      assert(mid.dipT === DIP_SHOT && mid.dipSkep === 2 && mid.count === before.count, `${DIP_SHOT} frames in, the hold is running and nothing has landed yet (dipT ${mid.dipT}, skep ${mid.dipSkep})`);
      await api.shot('hive-dip');
      await api.step(DIP_HOLD - DIP_SHOT + 1);
      await api.release(0);
      const dipped = await seat0(page);
      assert(dipped.count === before.count + 1, `a full hold at a full skep is +1 honey (seat 0 ${before.count} -> ${dipped.count})`);
      assert(dipped.total === before.total + 1, `the party's total went up with it (${before.total} -> ${dipped.total})`);
      const empty = (await api.summary()).top.skeps[2][1];
      assert(empty > 0, `and that skep went empty and started refilling (refill ${empty})`);

      // ---- half two: letting go early costs nothing and leaves the skep full ----
      const early = await parkAtSkep(page, skepX);
      await api.hold(0, { action: true });
      await api.step(1); await setBee(page, 0);   // the rule under test, not a joke: no bee (and parkAtSkep dealt no flood)
      await api.step((DIP_HOLD >> 1) - 1);
      await api.release(0);
      await api.step(2);
      const released = await seat0(page);
      assert(released.count === early.count && released.dipT === 0 && released.dipSkep === -1, `letting go early scores nothing and clears the hold (count ${released.count}, dipT ${released.dipT})`);
      assert((await api.summary()).top.skeps[2][1] === 0, 'and the skep is still full for the next hold');

      // ---- half three: holding at an empty skep does nothing ----
      const dry = await parkAtSkep(page, skepX);
      await page.evaluate(() => { window.__game.game.screen.skeps[2].refill = 100; });
      await api.hold(0, { action: true });
      await api.step(1); await setBee(page, 0);   // the rule under test, not a joke: no bee (and parkAtSkep dealt no flood)
      await api.step((DIP_HOLD + 5) - 1);
      await api.release(0);
      const nothing = await seat0(page);
      assert(nothing.count === dry.count && nothing.dipT === 0, `a hold at an empty skep is nothing (count ${nothing.count}, dipT ${nothing.dipT})`);
      assert(nothing.bumpT === 0, `and nothing in this meadow stings (bumpT ${nothing.bumpT})`);
      assert(nothing.bees === 0 && nothing.floods === 0, `and no joke ran on a rule under test (bees ${nothing.bees}, floods ${nothing.floods})`);

      // ---- the ending: there is no clock to force, a round ends only when the total reaches the target ----
      let last = await api.summary();
      assert(last.top.honey >= 1, `something was dipped before the ending (honey ${last.top.honey})`);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'hive' && s2.top.phase === 1 && /^HONEY: \d+$/.test(s2.top.sign), `the target was reached: the HONEY sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
      await api.shot('hive-sign');
      last = s2;
      await api.step(HOLD);
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the hives hand back to the map (on ${s3.screen})`);
      // the target the ORDER asked for, not the screen's (parkAtSkep lifts the screen's so it cannot end early)
      const honey = last.top.honey, target = s0.top.target;
      const line = (s3.run.needs || []).find((n) => n.startsWith('honey:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(honey, target), `run.gather('honey') banked the party's total (${line}, honey ${honey})`);
    });
  },
};
