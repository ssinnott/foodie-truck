// Playtest scenarios for the coop work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   coop       - four seats in the coop: seat 0 is driven along its lane to the nearest egg (polling summary() for its
//                reach x and holding the stick toward it), presses action and has one egg in its basket; up and down
//                move nobody (the lanes are the whole depth a seat gets); the five hens potter at the back and touch
//                nothing; then the finish line is brought down to the party's total: the EGGS sign drops, is held,
//                and the screen returns to the map with the order's egg line updated by the party's total. The
//                jokes are held off (every egg's deal is cleared before each press: a hatching egg or a hen in the
//                rules test would read as a lost egg), and the round ends with no peck and no hatch. Also writes
//                tools/screens/coop-pluck.png and coop-sign.png.
//   coopBroody - the old joke, bigger: a nest egg with a hen sat on it. The reach gets her puffed up and glaring
//                ('!'), then the flurry (OW!, feathers), then a hop round on one foot; the stick is locked the whole
//                PECK_TOTAL frames and nothing is lost; she flounces off after her one temper however long she was
//                set to sit, and the same reach then plucks the egg. Writes coop-broody-glare, coop-broody-flurry and
//                coop-broody-hop.
//   coopChick  - the new joke: a surprise egg (wobbling, cracked) on the floor. Plucked, it is held up and hatches
//                ('?', the cracks, POP, CHEEP!) and scores nothing; the chick rides its critter's head once the seat
//                lets go, cheeps at the next real egg (+1, exactly), then hops down and scurries off to the hens. Then
//                a second surprise egg is caught mid-hold by the end of the round, which has to be safe. Writes
//                coop-chick-tell, coop-chick-hold, coop-chick-pop, coop-chick-ride and coop-chick-hens.
import { withPage, assert } from '../playtest.js';

const SLAM = 6, HOLD = 60;
/** The jokes' own numbers (screens/coopGags.ts), mirrored here so a change to either side shows up as a failing assert. */
const HATCH_TOTAL = 70, HATCH_IN = 10, POP_AT = 26, RIDE_FRAMES = 360, DOWN_FRAMES = 14;
const PECK_TOTAL = 90, FLURRY_AT = 75, HOP_AT = 60, HOP_TURN = 12, HEN_FURY = 40, SMUG = 30;
/** The chick's cosmetic states, and the back of the floor the hens keep to (screens/coop.ts HEN_Y_MAX). */
const CH_RIDE = 1, CH_DOWN = 2, CH_RUN = 3, HEN_Y_MAX = 290;
/** Frames given a chick to run from its critter's feet to a hen at the back: 1.5 px/frame covers 300 px in that. */
const RUN_WAIT = 200;
/** The surprise egg's wobble (coopGags.ts WOBBLE_EVERY / WOBBLE_FRAMES, hashed on the egg's pool index). */
const WOBBLE_EVERY = 52, WOBBLE_FRAMES = 12;

/** Nearest [x, fy, nest] of `list` to x along the lane, or null. */
function nearest(list, x) {
  let best = null, bd = 1e9;
  for (const p of list) { const d = Math.abs(p[0] - x); if (d < bd) { bd = d; best = p; } }
  return best;
}

/** Hold both jokes off: every egg's deal cleared (no chick, no hen on it), so the press that follows is a plain pluck. */
function noJokes(page) {
  return page.evaluate(() => { for (const e of window.__game.game.screen.eggs) { e.chick = 0; e.broody = 0; e.fury = 0; } });
}

/** Seat `i` as the sim holds it, with the bits the summary leaves out. */
function seatOf(page, i = 0) {
  return page.evaluate((k) => {
    const sc = window.__game.game.screen, s = sc.seats[k];
    return { x: s.x, facing: s.facing, count: s.count, anim: s.anim, hatchT: s.hatchT, peckT: s.peckT, basket: s.rig.weapon ? 1 : 0, crown: s.crown, baseCrown: s.baseCrown, total: sc.total, pecks: sc.pecks, hatches: sc.hatches };
  }, i);
}

/** The cards up right now (game/gags.ts), from the same module instance as the game's. */
function cards(page) { return page.evaluate(async () => (await import('/src/game/gags.ts')).gagsUp()); }

/** Step until seat `i`'s countdown `field` reads `at` (it only ever counts down). */
async function stepTo(api, page, field, at, i = 0) {
  const s = await seatOf(page, i);
  if (s[field] > at) await api.step(s[field] - at);
  return seatOf(page, i);
}

/** Walk seat 0 for `n` frames with the stick held one way, and back; returns how far the first leg moved it. */
async function canWalk(api, page, n = 4) {
  const x0 = (await seatOf(page)).x;
  await api.hold(0, { right: true }); await api.step(n); await api.release(0);
  const x1 = (await seatOf(page)).x;
  await api.hold(0, { left: true }); await api.step(n); await api.release(0);
  return x1 - x0;
}

export const SCENARIOS = {
  async coopBroody(server) {
    await withPage(server, 'skipTo=coop&critters=0,1', async (api, page) => {
      await api.step(2);
      // lay the egg by hand: nest 2 (x 268), a hen sat on it for a long while yet, no spawns to get in the way, and
      // seat 0 stood on its floor spot. However long her countdown, one temper is all she has in her.
      await page.evaluate(() => {
        const sc = window.__game.game.screen, e = sc.eggs[0];
        sc.nextSpawn = 100000;
        e.active = true; e.nest = 2; e.x = 268; e.y = 158; e.fy = 316; e.broody = 400; e.fury = 0; e.chick = 0; sc.nestFull[2] = 1;
        sc.seats[0].x = 268;
      });
      await api.step(1);
      await api.press(0, { action: true }, 1, 0);
      const p = await api.summary(), s = await seatOf(page), egg = p.top.eggs.find((e) => e[2] === 2);
      assert(p.top.pecks === 1 && s.count === 0 && p.top.count === 0, `the reach gets the hen and no egg (pecks ${p.top.pecks}, count ${s.count})`);
      assert(s.peckT === PECK_TOTAL && s.anim === 'glared', `the seat freezes under her for the whole beat (peckT ${s.peckT} of ${PECK_TOTAL}, anim '${s.anim}')`);
      assert(egg && egg[5] === HEN_FURY - 1 && egg[3] === HEN_FURY + SMUG - 1, `she is in a temper, and will see it through and sit on a moment before she goes (fury ${egg && egg[5]}, broody ${egg && egg[3]})`);
      assert((await cards(page)) >= 1, 'a "!" goes up over the critter');
      // the stick does nothing through the beat
      await api.hold(0, { right: true }); await api.step(4); await api.release(0);
      assert((await seatOf(page)).x === 268, 'the seat cannot walk off while the hen glares');
      await stepTo(api, page, 'peckT', PECK_TOTAL - 9);
      await api.shot('coop-broody-glare');

      // the flurry: OW!, the paw yanked back, the hen pecking with feathers coming out of the box
      const fl = await stepTo(api, page, 'peckT', FLURRY_AT - 5);
      const fury = (await api.summary()).top.eggs.find((e) => e[2] === 2)[5];
      assert(fl.anim === 'yanked' && (await cards(page)) >= 1, `the flurry lands: OW! and the paw yanked back (anim '${fl.anim}')`);
      assert(fury > 0 && fury < HEN_FURY, `the hen is pecking (fury ${fury})`);
      await api.shot('coop-broody-flurry');

      // the hop round: on one foot, turning at every landing, and facing the way it started when it is done
      const h0 = await stepTo(api, page, 'peckT', HOP_AT - 4);
      assert(h0.anim === 'hopRound', `then a hop round on one foot (anim '${h0.anim}')`);
      await api.shot('coop-broody-hop');
      const h1 = await stepTo(api, page, 'peckT', HOP_AT - HOP_TURN - 4);
      assert(h1.facing === -h0.facing, `it turns round as it hops (facing ${h0.facing} -> ${h1.facing})`);
      const done = await stepTo(api, page, 'peckT', 0);
      assert(done.facing === fl.facing && done.anim === 'carry', `and lands facing the nest again, a player again (facing ${done.facing}, anim '${done.anim}')`);
      assert(done.count === 0 && done.total === 0, `nothing was lost and nothing gained (count ${done.count}, total ${done.total})`);
      assert((await canWalk(api, page)) > 0, 'the stick works again');

      // she flounced off before the critter had finished hopping: the egg is free, and the same reach now plucks it
      const off = await api.summary();
      assert(off.top.eggs.some((e) => e[2] === 2 && e[3] === 0 && e[5] === 0), `the hen has hopped off and the egg is still there (${JSON.stringify(off.top.eggs)})`);
      await api.press(0, { action: true }, 1, 0);
      const got = await seatOf(page);
      assert(got.count === 1 && got.total === 1, `and the same reach now plucks the egg (count ${got.count})`);
    });
  },

  async coopChick(server) {
    await withPage(server, 'skipTo=coop&critters=0,1', async (api, page) => {
      await api.step(2);
      // a surprise egg on the floor behind seat 0, inside its reach and clear of its feet and basket (pool slot 0,
      // x 172 to the seat's 200), seat 1 sent off to the far end, and nothing else laid
      await page.evaluate(() => {
        const sc = window.__game.game.screen, e = sc.eggs[0];
        sc.nextSpawn = 100000;
        sc.target = Math.max(sc.target, 5); sc.setTotal(sc.total);
        e.active = true; e.nest = -1; e.x = 172; e.fy = 318; e.y = 313; e.broody = 0; e.fury = 0; e.chick = 1;
        sc.seats[0].x = 200; sc.seats[0].facing = 1; sc.seats[1].x = 520;
      });
      // the TELL: shot mid-wobble (the rock is hashed on the frame and the egg's slot)
      for (let i = 0; i < WOBBLE_EVERY; i++) { const f = await page.evaluate(() => window.__game.game.screen.frame); if ((f + 1) % WOBBLE_EVERY >= 3 && (f + 1) % WOBBLE_EVERY < WOBBLE_FRAMES) break; await api.step(1); }
      await api.step(1);
      const t0 = await api.summary();
      assert(t0.top.eggs.length === 1 && t0.top.eggs[0][4] === 1, `the surprise egg is laid, dealt as one (${JSON.stringify(t0.top.eggs)})`);
      await api.shot('coop-chick-tell');

      // the pluck: into the paw, the basket down, the stick locked, and no +1
      await api.press(0, { action: true }, 1, 0);
      const p = await seatOf(page), after = await api.summary();
      assert(p.hatchT === HATCH_TOTAL && p.anim === 'liftEgg' && p.basket === 0, `the egg goes up into the paw, the basket down (hatchT ${p.hatchT}, anim '${p.anim}', basket ${p.basket})`);
      assert(p.facing === -1, `turned round to the egg behind it (facing ${p.facing})`);
      assert(p.count === 0 && p.total === 0 && after.top.eggs.length === 0, `it scores nothing and leaves the floor (count ${p.count}, eggs ${after.top.eggs.length})`);
      assert((await cards(page)) >= 1, 'a "?" goes up over the critter');
      await api.hold(0, { right: true }); await api.step(4); await api.release(0);
      assert((await seatOf(page)).x === 200, 'the seat cannot walk off with the egg');

      // the WIND-UP: held up and wobbling harder, both cracks in
      const h = await stepTo(api, page, 'hatchT', POP_AT + 4);
      assert(h.anim === 'holdEgg' && h.hatches === 0, `held up to the face (anim '${h.anim}', hatches ${h.hatches})`);
      await api.shot('coop-chick-hold');

      // the BANG: POP, CHEEP!, the shell's top in flight, and still no +1
      const b = await stepTo(api, page, 'hatchT', POP_AT - 3);
      const bits = await page.evaluate(() => window.__game.game.screen.bits.filter((x) => x.t < 80).length);
      assert(b.hatches === 1 && b.anim === 'hatched' && (await cards(page)) >= 1, `it hatches: CHEEP! (hatches ${b.hatches}, anim '${b.anim}')`);
      assert(bits === 1 && b.count === 0 && b.total === 0, `the top of the shell flies off and the count stays put (bits ${bits}, total ${b.total})`);
      await api.shot('coop-chick-pop');

      // the LOOK: the seat lets go with the chick on its head, the basket back, the name plate lifted over the chick
      const r = await stepTo(api, page, 'hatchT', 0);
      const rider = (await api.summary()).top.chicks;
      assert(r.anim === 'carry' && r.basket === 1, `a player again, basket in the paw (anim '${r.anim}', basket ${r.basket})`);
      assert(rider.length === 1 && rider[0][0] === CH_RIDE && rider[0][1] === 0, `the chick rides seat 0's head (${JSON.stringify(rider)})`);
      assert(r.crown > r.baseCrown, `the plate climbs over the chick (crown ${r.baseCrown} -> ${r.crown})`);
      assert((await canWalk(api, page, 20)) > 0, 'and walks, chick and all');
      await api.hold(0, { right: true }); await api.step(10); await api.release(0); await api.step(2);
      await api.shot('coop-chick-ride');

      // a real egg at its feet: +1 exactly, and the chick cheeps
      await page.evaluate(() => {
        const sc = window.__game.game.screen, e = sc.eggs[1];
        e.active = true; e.nest = -1; e.x = sc.seats[0].x; e.fy = 318; e.y = 313; e.broody = 0; e.fury = 0; e.chick = 0;
      });
      await api.press(0, { action: true }, 1, 0);
      const g = await seatOf(page), cheep = await page.evaluate(() => window.__game.game.screen.chicks.find((c) => c.state === 1).cheep);
      assert(g.count === 1 && g.total === 1, `the next egg is +1, exactly (count ${g.count}, total ${g.total})`);
      assert(cheep > 0 && (await cards(page)) >= 1, `and the chick on the head cheeps at it (cheep ${cheep})`);

      // the ride runs out: it hops down, the plate comes back, and off it goes to the hens
      const left = await page.evaluate(() => window.__game.game.screen.chicks.find((c) => c.state === 1).t);
      await api.step(RIDE_FRAMES - left + 2);
      const down = (await api.summary()).top.chicks, s2 = await seatOf(page);
      assert(down[0][0] === CH_DOWN && s2.crown === s2.baseCrown, `after its ride it hops down (state ${down[0][0]}, crown ${s2.crown})`);
      await api.step(DOWN_FRAMES + RUN_WAIT);
      const ran = (await api.summary()).top.chicks;
      assert(ran[0][0] === CH_RUN && ran[0][3] <= HEN_Y_MAX + 2, `and scurries off to the hens at the back (${JSON.stringify(ran)})`);
      await api.shot('coop-chick-hens');
      const end = await seatOf(page);
      assert(end.count === 1 && end.total === 1, `nothing lost: the hatched egg never counted, the real one did (total ${end.total})`);

      // safe mid-joke: a second surprise egg is mid-hold when the round ends - the sign drops, the basket is back
      await page.evaluate(() => {
        const sc = window.__game.game.screen, e = sc.eggs[2];
        e.active = true; e.nest = -1; e.x = sc.seats[0].x; e.fy = 318; e.y = 313; e.broody = 0; e.fury = 0; e.chick = 1;
      });
      await api.press(0, { action: true }, 1, 0);
      await api.step(HATCH_IN + 4);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
      await api.step(4 + SLAM);
      const fin = await seatOf(page), sum = await api.summary();
      assert(sum.top.phase === 1 && fin.hatchT === 0 && fin.basket === 1, `the round can end mid-hatch: sign up, beat cleared, basket back (phase ${sum.top.phase}, hatchT ${fin.hatchT}, basket ${fin.basket})`);
      await api.step(HOLD + 4);
      assert((await api.screen()) === 'map', `and the coop hands back to the map (on ${await api.screen()})`);
    });
  },

  async coop(server) {
    await withPage(server, 'skipTo=coop&critters=0,1,2,3&order=1', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'coop', `the coop is up with a run started (on ${s0.screen})`);
      assert(s0.top.seats.length === 4 && s0.top.target > 0, `four seats and a target from the order (${s0.top.seats.length} seats, target ${s0.top.target})`);
      assert(s0.top.hens.length === 5, `five hens on the floor (${s0.top.hens.length})`);
      const lanes = s0.top.seats.map((s) => s[2]);
      assert(lanes.every((y, i) => i === 0 || y === lanes[i - 1] - 8), `the seats stand on four lanes 8 px apart (${lanes.join()})`);
      const others0 = JSON.stringify(s0.top.seats.slice(1).map((s) => [s[1], s[2]]));

      // up and down are not directions in this coop: 30 frames of `up` leaves seat 0 exactly where it was
      await api.hold(0, { up: true });
      await api.step(30);
      await api.release(0);
      const up = await api.summary();
      assert(up.top.seats[0][1] === s0.top.seats[0][1] && up.top.seats[0][2] === s0.top.seats[0][2], `up moves nobody (${s0.top.seats[0][1]},${s0.top.seats[0][2]} -> ${up.top.seats[0][1]},${up.top.seats[0][2]})`);

      // wait for an egg, then drive seat 0 along the lane to its reach x and pluck it (the jokes held off: see noJokes)
      let plucked = false, last = up;
      for (let attempt = 0; attempt < 4 && !plucked; attempt++) {
        let egg = null;
        for (let i = 0; i < 60 && !egg; i++) { await api.step(4); last = await api.summary(); egg = nearest(last.top.eggs, last.top.seats[0][1]); }
        if (!egg) break;
        for (let i = 0; i < 150; i++) {
          const dx = egg[0] - last.top.seats[0][1];
          if (Math.abs(dx) <= 3) break;
          await api.hold(0, dx > 0 ? { right: true } : { left: true });
          await api.step(4);
          last = await api.summary();
          if (!last.top.eggs.some((e) => e[0] === egg[0] && e[1] === egg[1])) break;
        }
        await api.release(0);
        await api.step(2);
        const before = (await api.summary()).top.seats[0][3];
        await noJokes(page);
        await api.press(0, { action: true }, 1, 0);
        const after = await api.summary();
        await api.step(5);
        if (after.top.seats[0][3] === before + 1) { plucked = true; await api.shot('coop-pluck'); }
      }
      assert(plucked, 'seat 0 walked to an egg, pressed action and has it in the basket (count 1)');
      const p = await api.summary();
      assert(p.top.count >= 1 && p.top.seats[0][3] >= 1, `the party total counts the egg (total ${p.top.count}, seat 0 ${p.top.seats[0][3]})`);
      assert(p.top.seats.slice(1).every((s) => s[3] === 0), 'the other seats, with no input, plucked nothing');
      assert(JSON.stringify(p.top.seats.slice(1).map((s) => [s[1], s[2]])) === others0, 'the other seats stayed put: no hen shoves anyone');
      assert(p.top.hens.every((h) => h[1] <= HEN_Y_MAX), `the hens keep to the back of the floor (${p.top.hens.map((h) => h[1]).join()})`);
      assert(p.top.pecks === 0 && p.top.hatches === 0, `and no joke played in the rules test (pecks ${p.top.pecks}, hatches ${p.top.hatches})`);

      // bring the finish line down to the party's total (or watch the early ending) and expect the sign, then the map:
      // there is no clock to force, a round ends only when the total reaches the target
      let s2 = await api.summary();
      if (s2.screen === 'coop' && s2.top.phase === 0) {
        assert(s2.top.count >= 1, `something was collected before the ending (count ${s2.top.count})`);
        await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = Math.max(1, sc.total); sc.setTotal(sc.total); });
        await api.step(4 + SLAM + 20);
        s2 = await api.summary();
        assert(s2.screen === 'coop' && s2.top.phase === 1 && /^EGGS: \d+$/.test(s2.top.sign), `the target was reached: the EGGS sign is up (phase ${s2.top.phase}, '${s2.top.sign}')`);
        await api.shot('coop-sign');
        await api.step(HOLD);
      } else if (s2.screen === 'coop') await api.step(SLAM + HOLD);
      const lastCoop = s2.screen === 'coop' ? s2 : p;
      const s3 = await api.summary();
      assert(s3.screen === 'map', `after the sign's hold the coop hands back to the map (on ${s3.screen})`);
      const count = lastCoop.top.count, target = lastCoop.top.target;
      const line = (s3.run.needs || []).find((n) => n.startsWith('egg:')) || '';
      const have = parseInt(line.split(':')[1], 10);
      assert(line && have === Math.min(count, target), `run.gather('egg') banked the party's total (${line}, count ${count})`);
    });
  },
};
