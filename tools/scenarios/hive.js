// Playtest scenarios for the hives work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   hive - four seats at Clover Hives on the HONEY LOAF order (?order=4, the one whose needs carry a honey line):
//          the screen is up with four seats and a target read from that line; seat 0 is driven with real held input
//          during the opening calm window and actually creeps along the meadow while the unpressed seats stay put;
//          the swarm is then left alone long enough to prove the CALM -> WARY -> ALERT cycle runs on its own.
//          Then the scene's ONE RULE is driven by hand through window.__game.game.screen:
//            - a real `action` press inside REACH of a full skep scores after the dip beat and empties that skep;
//            - a dip that is already running when the swarm turns ALERT still banks (the dip is committed);
//            - moving during ALERT stings: the party's total drops one, the sting counter rises and the seat is
//              locked in its bump beat.
//          A dead dip, a dead swarm or a sting that costs nothing all fail here. Finally the clock is forced to its
//          last frames: the HONEY sign drops, is held, and the screen hands back to the map with run.gather('honey')
//          banked into the order's honey line.
//          Screenshots: tools/screens/hive-dip.png (the reach into a full skep with the swarm calm, the shot the
//          skeps' and the dipper's readability are judged from) and hive-alert.png (the swarm fanned out over the
//          meadow with the band across the top in FREEZE and four critters holding still - the scene's whole idea in
//          one frame). hive-sign.png is the ending.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** The screen's own numbers, mirrored here so an assert says what it expects rather than what it found. */
const ROUND_FRAMES = 2400, OPENING_CALM = 300, DIP_FRAMES = 16;
/** Frames from an `action` press to the honey landing: the press frame plus the beat. */
const DIP_SETTLE = DIP_FRAMES + 4;
/** The frame of the dip the picture is taken on: the dipper is up in the doorway and the skep has just gone dull. */
const DIP_SHOT = 10;
/** Held-input leg: 90 frames of `right` is 162 px at the screen's 1.8 px/frame creep. */
const CREEP_FRAMES = 90;

/** Force the shared swarm into a state for `t` frames, fully morphed into its shape (the test's clock, not the rng's). */
function setSwarm(page, state, t) {
  return page.evaluate(([st, tt]) => {
    const sw = window.__game.game.screen.swarm;
    sw.prev = st; sw.state = st; sw.t = tt; sw.len = tt; sw.mx = 99;
  }, [state, t]);
}

/**
 * Park seat 0 on a skep's dip spot with every skep full and its beats cleared, and hold the target out of reach so
 * the dips under test cannot end the round before the sting half runs. run.gather() clamps to the order's own line,
 * so the bank assert at the end still reads the real target (the orchard does the same).
 */
function parkAtSkep(page, x) {
  return page.evaluate((sx) => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    for (const k of sc.skeps) k.refill = 0;
    s.x = sx; s.facing = 1; s.moving = false; s.bumpT = 0; s.dipT = 0; s.dipSkep = -1; s.safeT = 0;
    sc.target = Math.max(sc.target, sc.total + 4); sc.setTotal(sc.total);
    return { count: s.count, total: sc.total, stings: sc.stings };
  }, x);
}

/** Seat 0 as the sim holds it (summary() carries the same numbers, but this reads them without the round's noise). */
function seat0(page) {
  return page.evaluate(() => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    return { count: s.count, dipT: s.dipT, bumpT: s.bumpT, safeT: s.safeT, anim: s.anim, total: sc.total, stings: sc.stings };
  });
}

export const SCENARIOS = {
  async hive(server) {
    await withPage(server, 'skipTo=hive&critters=0,1,2,3&order=4', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'hive', `the hives are up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4 && s0.top.target > 0, `four seats and a target from the order (${s0.top.seats.length} seats, target ${s0.top.target})`);
      assert(s0.top.skeps.length === 5, `five skeps along the bench (${s0.top.skeps.length})`);
      assert(s0.top.swarm.state === 'calm', `the round opens on a calm window (${s0.top.swarm.state})`);
      const x0 = s0.top.seats[0][1], others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => s[1]));

      // real held input, inside the opening calm window so the creep cannot be interrupted by a sting
      await api.hold(0, { right: true });
      await api.step(CREEP_FRAMES);
      await api.release(0);
      const moved = await api.summary();
      const x1 = moved.top.seats[0][1];
      assert(x1 > x0 && x1 >= 24 && x1 <= 616, `seat 0 crept along the meadow and stayed in the lane (${x0} -> ${x1})`);
      assert(JSON.stringify(moved.top.seats.slice(1).map((s) => s[1])) === others0, 'the other seats, with no input, stayed put');
      assert(moved.top.swarm.state === 'calm', `the opening window is still calm ${CREEP_FRAMES} frames in (${moved.top.swarm.state})`);

      // leave the swarm alone past the opening window: the hazard has to turn on its own, not only when a test pokes it
      await api.step(OPENING_CALM - CREEP_FRAMES + 10);
      const turned = await api.summary();
      assert(turned.top.swarm.state !== 'calm', `the swarm turned on its own after the opening window (${turned.top.swarm.state})`);
      // 3 boot/settle frames + CREEP_FRAMES + the rest of the window + 10
      const spent = 3 + OPENING_CALM + 10;
      assert(turned.top.timer === ROUND_FRAMES - spent, `the clock counted every frame (timer ${turned.top.timer}, expected ${ROUND_FRAMES - spent})`);

      // ---- the rule, half one: a press inside REACH of a full skep is honey ----
      await setSwarm(page, 0, 900);
      const skepX = turned.top.skeps[2][0];
      const before = await parkAtSkep(page, skepX);
      await api.press(0, { action: true }, 1, 0);
      await api.step(DIP_SHOT);
      await api.shot('hive-dip');
      await api.step(DIP_SETTLE - DIP_SHOT);
      const dipped = await seat0(page);
      assert(dipped.count === before.count + 1, `a dip at a full skep is +1 honey (seat 0 ${before.count} -> ${dipped.count})`);
      assert(dipped.total === before.total + 1, `the party's total went up with it (${before.total} -> ${dipped.total})`);
      const empty = (await api.summary()).top.skeps[2][1];
      assert(empty > 0, `and that skep went empty and started refilling (refill ${empty})`);

      // ---- the rule, half two: a dip already running when the swarm turns is COMMITTED ----
      const mid = await parkAtSkep(page, skepX);
      await api.press(0, { action: true }, 1, 0);
      await setSwarm(page, 2, 400);
      await api.step(DIP_SETTLE);
      const committed = await seat0(page);
      assert(committed.count === mid.count + 1, `a dip caught mid-reach by ALERT still banks (seat 0 ${mid.count} -> ${committed.count})`);
      assert(committed.stings === mid.stings, `and the committed press is not itself a sting (${mid.stings} -> ${committed.stings})`);

      // the picture of what this mini-game is: the swarm fanned out over the meadow, FREEZE across the top, nobody moving
      await api.step(20);
      await api.shot('hive-alert');

      // ---- the rule, half three: moving during ALERT stings ----
      await setSwarm(page, 2, 400);
      await page.evaluate(() => { const s = window.__game.game.screen.seats[0]; s.safeT = 0; s.bumpT = 0; s.dipT = 0; });
      const pre = await seat0(page);
      await api.hold(0, { right: true });
      await api.step(2);
      await api.release(0);
      const stung = await seat0(page);
      assert(stung.stings === pre.stings + 1, `moving during ALERT stings the seat (${pre.stings} -> ${stung.stings} stings)`);
      assert(stung.count === pre.count - 1, `and costs one banked honey (seat 0 ${pre.count} -> ${stung.count})`);
      assert(stung.total === pre.total - 1, `the party's total pays for it too (${pre.total} -> ${stung.total})`);
      assert(stung.bumpT > 0 && stung.anim === 'bump', `and the seat is locked in its bump beat (bumpT ${stung.bumpT}, anim '${stung.anim}')`);
      assert(stung.safeT > 0, `with a grace so it cannot be chain-stung (safeT ${stung.safeT})`);

      // standing still through the rest of the alert costs nothing at all
      const held = await seat0(page);
      await api.step(90);
      const stillThere = await seat0(page);
      assert(stillThere.stings === held.stings && stillThere.count === held.count,
        `standing still through ALERT is free (${held.stings} stings, ${held.count} honey, unchanged over 90 frames)`);

      // ---- the ending ----
      let last = await api.summary();
      await page.evaluate(() => { window.__game.game.screen.clock.timer = 3; });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'hive' && s2.top.phase === 1 && /^HONEY: \d+$/.test(s2.top.sign), `the clock ran out: the HONEY sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
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
