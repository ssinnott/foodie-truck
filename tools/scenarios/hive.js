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
//          Finally the clock is forced to its last frames: the HONEY sign drops, is held, and the screen hands back
//          to the map with run.gather('honey') banked into the order's honey line.
//          Screenshots: tools/screens/hive-dip.png (the dipper in a full skep, the strand of honey climbing it and
//          the bar over the knob half full - the shot the skeps' and the dipper's readability are judged from) and
//          hive-sign.png for the ending.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** The screen's own numbers, mirrored here so an assert says what it expects rather than what it found. */
const ROUND_FRAMES = 2400, DIP_HOLD = 60;
/** The frame of the hold the picture is taken on: the dipper is up in the doorway and the bar is half full. */
const DIP_SHOT = 30;
/** Held-input leg: 90 frames of `right` is 162 px at the screen's 1.8 px/frame creep. */
const CREEP_FRAMES = 90;

/**
 * Park seat 0 on a skep's dip spot with every skep full and its hold cleared, and hold the target out of reach so
 * the dips under test cannot end the round early. run.gather() clamps to the order's own line, so the bank assert
 * at the end still reads the real target (the orchard does the same).
 */
function parkAtSkep(page, x) {
  return page.evaluate((sx) => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    for (const k of sc.skeps) { k.refill = 0; k.held = 0; }
    s.x = sx; s.facing = 1; s.moving = false; s.bumpT = 0; s.dipT = 0; s.dipSkep = -1;
    sc.target = Math.max(sc.target, sc.total + 4); sc.setTotal(sc.total);
    return { count: s.count, total: sc.total };
  }, x);
}

/** Seat 0 as the sim holds it (summary() carries the same numbers, but this reads them without the round's noise). */
function seat0(page) {
  return page.evaluate(() => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    return { count: s.count, dipT: s.dipT, dipSkep: s.dipSkep, bumpT: s.bumpT, anim: s.anim, total: sc.total };
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
      assert(moved.top.timer === ROUND_FRAMES - 3 - CREEP_FRAMES, `the clock counted every frame (timer ${moved.top.timer}, expected ${ROUND_FRAMES - 3 - CREEP_FRAMES})`);

      // ---- the rule, half one: holding at a full skep for DIP_HOLD frames is honey ----
      const skepX = moved.top.skeps[2][0];
      const before = await parkAtSkep(page, skepX);
      await api.hold(0, { action: true });
      await api.step(DIP_SHOT);
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
      await api.step(DIP_HOLD >> 1);
      await api.release(0);
      await api.step(2);
      const released = await seat0(page);
      assert(released.count === early.count && released.dipT === 0 && released.dipSkep === -1, `letting go early scores nothing and clears the hold (count ${released.count}, dipT ${released.dipT})`);
      assert((await api.summary()).top.skeps[2][1] === 0, 'and the skep is still full for the next hold');

      // ---- half three: holding at an empty skep does nothing ----
      const dry = await parkAtSkep(page, skepX);
      await page.evaluate(() => { window.__game.game.screen.skeps[2].refill = 100; });
      await api.hold(0, { action: true });
      await api.step(DIP_HOLD + 5);
      await api.release(0);
      const nothing = await seat0(page);
      assert(nothing.count === dry.count && nothing.dipT === 0, `a hold at an empty skep is nothing (count ${nothing.count}, dipT ${nothing.dipT})`);
      assert(nothing.bumpT === 0, `and nothing in this meadow stings (bumpT ${nothing.bumpT})`);

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
