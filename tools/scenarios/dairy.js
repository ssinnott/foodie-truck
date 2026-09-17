// Playtest scenarios for the dairy work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   dairy - four seats in the byre on the CUSTARD TART order, so the target is the order's own milk line and not
//           the fallback: every cow is parked first (its patience is what the rule test drives by hand) and seat 0
//           is then milked with REAL alternating input through api.press - six presses, one pail, the party's
//           total up by one, and the other seats still on zero. Then the two halves of the ONE RULE:
//             the alternation  - the button that is NOT next moves nothing and only refuses (no loss, no bump);
//             the cow's patience - a press inside the forced kick window spills the pail AND costs a banked milk,
//                                  while sitting still through an identical window costs nothing and the cow settles.
//           A dead chevron, a dead refusal or a cow whose window does not bite fails one of those three asserts.
//           Finally the clock is forced to its last frames: the MILK sign drops, is held, and the screen hands back
//           to the map with the order's milk line updated by the party's total.
//           Shots: tools/screens/dairy-pump.png (mid-squirt: the jet, the ring, the chevron on its next step) and
//           tools/screens/dairy-kick.png (a cow mid-kick with the spill on the straw), plus dairy-sign.png.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** The screen's own numbers, mirrored here so a change to either side shows up as a failing assert. */
const PUMP_PER_PAIL = 6, KICK_FRAMES = 30;
/** ?order=5 is ORDERS[4], CUSTARD TART: milk 3 + egg 2, so `milk` is a real line on the ticket. */
const BOOT = 'skipTo=dairy&critters=0,1,2,3&order=5';
/** The frame of the squirt the pump shot is taken on: the jet is still up and the ring has opened. */
const PUMP_SHOT = 3;

/** Park every cow well past the round so the pump test is only ever measuring the pump. */
function parkCows(page) {
  return page.evaluate(() => { for (const s of window.__game.game.screen.seats) { s.cow.state = 0; s.cow.t = 100000; } });
}
/** Hold the finish line out of reach so a +1 cannot end the round mid-test (run.gather still clamps to the order). */
function holdTarget(page) {
  return page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(sc.target, sc.total + 4); sc.setTotal(sc.total); });
}
/** Seat 0 as the sim holds it. */
function seat0(page) {
  return page.evaluate(() => {
    const sc = window.__game.game.screen, s = sc.seats[0];
    return { next: s.next, fill: s.fill, count: s.count, bumpT: s.bumpT, refuseT: s.refuseT, anim: s.anim, total: sc.total, kicks: sc.kicks, cow: sc.seats[0].cow.state };
  });
}
/** Press whichever button the seat says is next, the way a player reading the chevron would. */
async function pumpOnce(api, page, hold = 1, release = 3) {
  const next = await page.evaluate(() => window.__game.game.screen.seats[0].next);
  await api.press(0, next === 0 ? { action: true } : { alt: true }, hold, release);
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

      // --- real input: six alternating presses fill a pail and bank one milk for the party
      await parkCows(page);
      await holdTarget(page);
      const before = await seat0(page);
      assert(before.next === 0 && before.fill === 0, `seat 0 starts on ACTION with an empty pail (next ${before.next}, fill ${before.fill})`);
      let shot = false;
      for (let i = 0; i < PUMP_PER_PAIL; i++) {
        const n = await page.evaluate(() => window.__game.game.screen.seats[0].next);
        await api.hold(0, n === 0 ? { action: true } : { alt: true });
        await api.step(1);
        await api.release(0);
        if (!shot) { await api.step(PUMP_SHOT); await api.shot('dairy-pump'); shot = true; await api.step(4); }
        else await api.step(7);
        const mid = await seat0(page);
        if (i < PUMP_PER_PAIL - 1) assert(mid.fill === i + 1, `press ${i + 1} is a squirt: the pail is ${i + 1}/${PUMP_PER_PAIL} (fill ${mid.fill})`);
      }
      const filled = await seat0(page);
      assert(filled.count === before.count + 1, `six alternating presses bank a pail (seat 0 ${before.count} -> ${filled.count})`);
      assert(filled.total === before.total + 1, `and the party's total goes up with it (${before.total} -> ${filled.total})`);
      assert(filled.fill === 0 && filled.next === 0, `a fresh pail slides in and the alternation resets (fill ${filled.fill}, next ${filled.next})`);
      const after = await api.summary();
      assert(JSON.stringify(after.top.seats.slice(1).map((s) => s.count)) === others0, 'the other seats, with no input, milked nothing');

      // --- rule 1: the button that is NOT next is refused, and costs nothing
      await parkCows(page);
      await pumpOnce(api, page);                                     // now ALT is next
      const armed = await seat0(page);
      assert(armed.next === 1 && armed.fill === 1, `after an ACTION the next accepted press is ALT (next ${armed.next}, fill ${armed.fill})`);
      await api.press(0, { action: true }, 1, 0);                    // press ACTION again: the wrong one
      const balked = await seat0(page);
      assert(balked.fill === armed.fill, `the wrong button fills nothing (fill ${armed.fill} -> ${balked.fill})`);
      assert(balked.next === armed.next, `and does not advance the alternation (next ${balked.next})`);
      assert(balked.refuseT > 0 && balked.bumpT === 0, `it is refused, not punished (refuseT ${balked.refuseT}, bumpT ${balked.bumpT})`);
      await api.step(12);
      await api.press(0, { alt: true }, 1, 3);
      const resumed = await seat0(page);
      assert(resumed.fill === armed.fill + 1, `the right button still works straight afterwards (fill ${resumed.fill})`);

      // --- rule 2a: a press inside the kick window spills the pail and costs a banked milk
      await page.evaluate((k) => {
        const sc = window.__game.game.screen, s = sc.seats[0];
        for (const q of sc.seats) { q.cow.state = 0; q.cow.t = 100000; }
        s.fill = 4; s.count = Math.max(1, s.count); s.next = 0; s.bumpT = 0;
        sc.setTotal(Math.max(1, sc.total));
        s.cow.state = 2; s.cow.t = k;                                 // the window, wide open
      }, KICK_FRAMES);
      const armedKick = await seat0(page);
      await api.hold(0, { action: true });
      await api.step(1);
      await api.release(0);
      await api.step(3);
      await api.shot('dairy-kick');
      const kicked = await seat0(page);
      assert(kicked.kicks === armedKick.kicks + 1, `a press inside the kick window is a kick (${armedKick.kicks} -> ${kicked.kicks})`);
      assert(kicked.fill === 0, `the pail spills what was in it (fill ${armedKick.fill} -> ${kicked.fill})`);
      assert(kicked.count === armedKick.count - 1, `and one banked milk goes with it (seat 0 ${armedKick.count} -> ${kicked.count})`);
      assert(kicked.total === armedKick.total - 1, `off the party's total too (${armedKick.total} -> ${kicked.total})`);
      assert(kicked.bumpT > 0 && kicked.anim === 'bump', `the seat is locked in the shared bump beat (bumpT ${kicked.bumpT}, anim '${kicked.anim}')`);

      // --- rule 2b: sitting still through an identical window costs nothing and the cow settles
      await api.step(24);
      await page.evaluate((k) => {
        const sc = window.__game.game.screen, s = sc.seats[0];
        s.bumpT = 0; s.fill = 2; s.count = Math.max(1, s.count); sc.setTotal(Math.max(1, sc.total));
        s.cow.state = 2; s.cow.t = k;
      }, KICK_FRAMES);
      const waiting = await seat0(page);
      await api.step(KICK_FRAMES + 2);
      const waited = await seat0(page);
      assert(waited.kicks === waiting.kicks, `sitting still through the window is not a kick (kicks ${waited.kicks})`);
      assert(waited.fill === waiting.fill && waited.count === waiting.count, `nothing is lost by waiting (fill ${waited.fill}, count ${waited.count})`);
      assert(waited.cow === 0, `and the cow settles back to calm (state ${waited.cow})`);

      // --- the ending: force the clock out, expect the sign, then the map with the milk banked
      const last = await api.summary();
      await page.evaluate(() => { window.__game.game.screen.clock.timer = 3; });
      await api.step(4 + SLAM + 20);
      const s2 = await api.summary();
      assert(s2.screen === 'dairy' && s2.top.phase === 1 && /^MILK: \d+$/.test(s2.top.sign), `the clock ran out: the MILK sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
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
};
