// Playtest scenarios for the map work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   map - four seats on the map: holding right on seat 0 drives the truck east off home, a honk stamps, the river
//         stops it short of a bridge, the mill's wall stops it outside the tower, a landmark the order does NOT
//         need drops a NOTHING NEEDED HERE sign, the millpond and the cove's sea stop it on their banks, and
//         driving to the orchard with apples on the order opens the orchard screen. Every signpost is checked off
//         the driving lane so none of them can drift back onto it, and every door and signpost is checked out of
//         the water. Also writes tools/screens/map-driving.png.
//
//   routing - the data invariant behind the seven mini-games: every ingredient in content/recipes.js names a
//             landmark that exists, that landmark carries a screen, that screen is registered in main.js, and
//             every order is therefore actually completable. This is what stops a mini-game being finished and
//             then left unreachable behind a signpost.
//
//   wholeDay - the day's two phases driven end to end on a shopping list cut down to flour and honey: the HUD
//              sends the truck to the mill, the mill screen opens, the flour is banked, the compass re-points at
//              the hives, the hive screen opens, the honey is banked - and only then do the lines open: the
//              compass swings to the nearest queue, driving there opens the line screen, and the order taken
//              there opens the kitchen. The one test that proves the loop's two halves hand over.
import { withPage, assert } from '../playtest.js';
import { PLACES } from '../../src/content/places.ts';
import { planWeek, WEATHER_DRIZZLE, WEATHER_FOG } from '../../src/game/run.ts';
import { INGREDIENTS, ORDERS } from '../../src/content/recipes.ts';
import { BRIDGES, RIVER_BLOCK, SIGN_AT, SIGN_CLEAR, SPOTS, CROSSING_SPOTS, riverDist, laneDist, wallBlocked, waterBlocked, pondBlocked, seaBlocked, shoreX } from '../../src/art/backgrounds/map.ts';

const placeOf = (id) => PLACES.find((p) => p.id === id);
/** The road's crossings (screens/map.ts): take every herd off the road, for the scenarios that drive the lanes for other reasons. */
const noCrossings = (page) => page.evaluate(() => { for (const c of window.__game.game.run.crossings) { c.state = 3; c.t = 0; } });
const BLOCK_R = 40, CLEAR_FRAMES = 60, AUTO_DUCKS = 90;
const teleport = (page, x, y, heading) => page.evaluate(([px, py, h]) => { const t = window.__game.game.run.truck; t.x = px; t.y = py; t.at = ''; if (h != null) t.heading = h; }, [x, y, heading == null ? null : heading]);

export const SCENARIOS = {
  /**
   * crossing - the road: the day's first crossing is out on its lane. The truck is set on the lane short of it
   *            and driven at it: held a half-token short with a SHEEP! (or DUCKS!) sign and its own clock started;
   *            ALT honks and the herd scatters over CLEAR_FRAMES, the crossing is done, the next comes out, and the
   *            truck rolls on through. Then the second crossing, left alone, clears on its own. Writes map-crossing.
   */
  async crossing(server) {
    await withPage(server, 'skipTo=map&critters=0,1,2,3', async (api, page) => {
      await api.step(5);
      const s0 = await api.summary();
      const cs = s0.top.crossings;
      assert(cs.length === 3 && cs[0].state === 1 && cs[1].state === 0 && cs[2].state === 0, `three crossings a day, the first out on its lane (${cs.map((c) => c.state).join()})`);
      assert(cs.every((c) => (c.kind === 1 && c.herd === 7) || (c.kind === 0 && c.herd >= 5 && c.herd <= 9)), `a flock of five to nine, or a mother and six ducklings (${cs.map((c) => c.kind + ':' + c.herd).join()})`);
      // walk the run's own crossing data: the spot, and the lane's direction there
      const c0 = await page.evaluate(() => { const c = window.__game.game.run.crossings[0]; return { x: c.x, y: c.y, dx: c.dx, dy: c.dy, kind: c.kind }; });
      // stand 70 px back along the lane (a spot is 140 px clear of every door, so this is outside every arrival
      // radius), facing the crossing, and drive at it with the stick along the lane
      const heading = Math.round(((Math.atan2(c0.dy, c0.dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 8)) % 16;
      const stick = { right: c0.dx > 0.3, left: c0.dx < -0.3, down: c0.dy > 0.3, up: c0.dy < -0.3 };
      await teleport(page, c0.x - c0.dx * 70, c0.y - c0.dy * 70, heading);
      await api.hold(0, stick); await api.step(90);
      const held = await api.summary();
      const d = Math.hypot(held.top.truck.x - c0.x, held.top.truck.y - c0.y);
      assert(held.top.blocked === true && d >= BLOCK_R - 3 && d <= BLOCK_R + 12, `the herd holds the truck a half-token short (blocked ${held.top.blocked}, ${d.toFixed(1)} px off the spot)`);
      assert(held.top.sign === (c0.kind === 0 ? 'SHEEP!' : 'DUCKS!'), `...with the sign up (got '${held.top.sign}')`);
      assert(held.top.crossings[0].t > 0, `...and the crossing's own clock running (t ${held.top.crossings[0].t})`);
      assert(c0.kind !== 0 || held.top.crossings[0].waved === 1, `Barley, aboard, waved at the flock (waved ${held.top.crossings[0].waved})`);
      await api.shot('map-crossing');
      // ALT: the honk scatters them
      await api.press(0, { alt: true }, 2, 2);
      const honked = await api.summary();
      assert(honked.top.crossings[0].state === 2, `the honk scatters the herd (state ${honked.top.crossings[0].state})`);
      await api.step(CLEAR_FRAMES + 2);
      const cleared = await api.summary();
      assert(cleared.top.crossings[0].state === 3 && cleared.top.crossings[1].state === 1, `it is done and the next one is out (${cleared.top.crossings.map((c) => c.state).join()})`);
      await api.hold(0, stick); await api.step(60); await api.release(0);
      const through = await api.summary();
      const d2 = Math.hypot(through.top.truck.x - c0.x, through.top.truck.y - c0.y);
      assert(through.top.blocked === false && (through.top.truck.x - c0.x) * c0.dx + (through.top.truck.y - c0.y) * c0.dy > 20, `and the truck drives on through (${d2.toFixed(1)} px past the spot, blocked ${through.top.blocked})`);
      // left alone, the second crossing clears on its own once the truck has run up against it: set its clock to a frame short
      await page.evaluate(() => { const c = window.__game.game.run.crossings[1]; c.t = c.kind === 0 ? 599 : 89; });
      await api.step(2);
      const auto = await api.summary();
      assert(auto.top.crossings[1].state === 2, `a herd nobody honks at clears on its own (state ${auto.top.crossings[1].state})`);
      await api.step(CLEAR_FRAMES + 2);
      const last = await api.summary();
      assert(last.top.crossings[1].state === 3 && last.top.crossings[2].state === 1, `and the third comes out (${last.top.crossings.map((c) => c.state).join()})`);
      assert((await api.errors()).length === 0, 'no errors on the road');
    });
  },
  /**
   * cart - the tipped cart: on its lane spot with the first short ingredient spilled. The truck is driven over the
   *        spill: that ingredient's line goes up by one, the cart is taken (righted), the pip plays, and driving over
   *        it again gives nothing. If that filled the line, the compass points at the next short one.
   */
  async cart(server) {
    await withPage(server, 'skipTo=map&critters=0,1,2,3', async (api, page) => {
      await api.step(5);
      await noCrossings(page);
      const s0 = await api.summary();
      assert(s0.top.cart && s0.top.cart.taken === 0, `the day has a tipped cart on the road (${JSON.stringify(s0.top.cart)})`);
      const first = s0.run.needs.find((n) => !n.endsWith('/' + n.split(':')[1].split('/')[0]));
      const id = first.split(':')[0], have = parseInt(first.split(':')[1], 10);
      const c = s0.top.cart;
      await teleport(page, c.x - 60, c.y, 0);
      await api.step(10);
      await api.shot('map-cart');
      await api.hold(0, { right: true }); await api.step(50); await api.release(0);
      const s1 = await api.summary();
      assert(s1.top.cart.taken === 1, `driving over the spill takes the cart (taken ${s1.top.cart.taken})`);
      const line = s1.run.needs.find((n) => n.startsWith(id + ':'));
      assert(parseInt(line.split(':')[1], 10) === have + 1, `and the first short line went up by one (${first} -> ${line})`);
      const miss = s1.run.needs.find((n) => !n.endsWith('/' + n.split(':')[1].split('/')[0]));
      assert(!miss || s1.top.dest === INGREDIENTS[miss.split(':')[0]].place, `the compass points at what is still short (${miss} -> dest ${s1.top.dest})`);
      await teleport(page, c.x - 60, c.y, 0);
      await api.hold(0, { right: true }); await api.step(50); await api.release(0);
      const s2 = await api.summary();
      assert(JSON.stringify(s2.run.needs) === JSON.stringify(s1.run.needs), 'a second pass over it gives nothing');
    });
  },
  /**
   * weather - a drizzle day (seed 2): rain over the view, a mud patch on a lane spot; the truck is driven into it,
   *           slows to field speed, and comes out muddy for the day. Then a fog day (seed 5): the view fades to milk
   *           round the truck and nothing slows. Writes map-drizzle and map-fog.
   */
  async weather(server) {
    // The seeds come from the plan itself: the menu's length moves the plan's rng, so a pinned seed would go
    // stale. The search walks the WEEK rather than one day, because a day's shape decides what weather it may
    // have at all - the opening day is always clear - and the page is then opened on the day it found with ?day=.
    const seedFor = (w) => {
      for (let seed = 1; seed < 500; seed++) {
        const week = planWeek(seed);
        for (let d = 0; d < week.length; d++) if (week[d].weather === w) return { seed, day: d };
      }
      return null;
    };
    const drizzle = seedFor(WEATHER_DRIZZLE), fog = seedFor(WEATHER_FOG);
    assert(drizzle && fog, `the plan rolls a drizzle day and a fog day inside five hundred seeds (${JSON.stringify(drizzle)}, ${JSON.stringify(fog)})`);
    await withPage(server, `skipTo=map&critters=0,1,2,3&seed=${drizzle.seed}&day=${drizzle.day + 1}`, async (api, page) => {
      await api.step(5);
      await noCrossings(page);
      const s0 = await api.summary();
      assert(s0.top.weather === 1 && s0.top.mud && s0.top.muddy === 0, `seed ${drizzle.seed} day ${drizzle.day + 1} is a drizzle day with a mud patch (weather ${s0.top.weather}, mud ${JSON.stringify(s0.top.mud)})`);
      const spot = CROSSING_SPOTS.find((p) => p.x === s0.top.mud.x && p.y === s0.top.mud.y);
      assert(!!spot, 'the mud patch stands on a lane spot');
      const heading = Math.round(((Math.atan2(spot.dy, spot.dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 8)) % 16;
      const stick = { right: spot.dx > 0.3, left: spot.dx < -0.3, down: spot.dy > 0.3, up: spot.dy < -0.3 };
      await teleport(page, spot.x - spot.dx * 90, spot.y - spot.dy * 90, heading);
      await api.hold(0, stick); await api.step(40);
      await api.shot('map-drizzle');
      const inMud = await api.summary();
      assert(inMud.top.inMud === true && inMud.top.speed < 1.3 && inMud.top.muddy === 1, `in the mud the truck slows to field speed and is muddy (inMud ${inMud.top.inMud}, speed ${inMud.top.speed}, muddy ${inMud.top.muddy})`);
      await api.step(80); await api.release(0);
      const out = await api.summary();
      assert(out.top.inMud === false && out.top.muddy === 1, `and wears the mud out the other side (inMud ${out.top.inMud}, muddy ${out.top.muddy})`);
    });
    await withPage(server, `skipTo=map&critters=0,1,2,3&seed=${fog.seed}&day=${fog.day + 1}`, async (api, page) => {
      await api.step(5);
      const s0 = await api.summary();
      assert(s0.top.weather === 2 && !s0.top.mud, `seed ${fog.seed} day ${fog.day + 1} is a fog day (weather ${s0.top.weather})`);
      await api.hold(0, { right: true }); await api.step(120); await api.release(0);
      await api.shot('map-fog');
      const s1 = await api.summary();
      assert(s1.top.truck.x > s0.top.truck.x + 80, `nothing slows in the fog (${s0.top.truck.x} -> ${s1.top.truck.x})`);
    });
  },
  async map(server) {
    await withPage(server, 'skipTo=map&critters=0,1,2,3', async (api, page) => {
      await api.step(5);
      await noCrossings(page);   // the road's herds have a scenario of their own (crossing); this one drives the lanes for other rules
      const s0 = await api.summary();
      assert(s0.screen === 'map', 'the map is up with a run started');
      assert(s0.top.seats === 4 && s0.run.truckAt === 'home', `four seats aboard, parked at home (${s0.top.seats} seats, at '${s0.run.truckAt}')`);
      const firstMissing = s0.run.needs.find((n) => !n.endsWith('/' + n.split(':')[1].split('/')[0]));
      assert(s0.top.dest === INGREDIENTS[firstMissing.split(':')[0]].place, `the shopping list sends the truck to its first line's landmark (${firstMissing} -> dest ${s0.top.dest})`);
      assert(s0.top.serving === false, 'the day opens in its gathering phase');
      const x0 = s0.top.truck.x;
      await api.hold(0, { right: true }); await api.step(120); await api.release(0);
      const s1 = await api.summary();
      // the bay is off the lane, so this is field speed (1.0 px/frame) less the run-up
      assert(s1.top.truck.x > x0 + 80, `holding right for 120 frames drives the truck east (${x0} -> ${s1.top.truck.x})`);
      assert(s1.top.truck.heading === 0 && s1.run.truckAt === '', `heading east and no longer at home (heading ${s1.top.truck.heading}, at '${s1.run.truckAt}')`);
      await api.step(20);
      await api.shot('map-driving');
      await api.press(0, { alt: true }, 2, 2);
      assert((await api.summary()).top.honk === true, 'ALT honks: the HONK! stamp is up');

      // the north junction: the only place the camera clamps high enough to show the dusk-peach horizon strip and the
      // plum tree-line that close the top of the world (docs/ART_STYLE.md section 1 "Map"). Written out so the art
      // pass can read the far edge of the plane, not just the meadow around home.
      await teleport(page, 760, 140, 0);
      await api.step(90);
      await api.shot('map-horizon');

      // From here the shopping list is cut to apples alone: the bridge below is a door's width from Furrow Farm, and
      // a day that needs a vegetable would open the garden the moment the truck crossed (forty recipes now, so the
      // seeded menu reaches the farm more days than not); the mill test further down wants a landmark the list does
      // not need, and the orchard test at the end wants the one it does.
      await page.evaluate(() => { const run = window.__game.game.run; run.needs.length = 0; run.needs.push({ id: 'apple', amount: 4, have: 0, used: 0 }); });

      // the river is not drivable: drive at it beside a bridge and stay on the west bank
      const b = BRIDGES[1];
      await teleport(page, b.x - 60, b.y + 40, 0);
      await api.hold(0, { right: true }); await api.step(80); await api.release(0);
      const s2 = await api.summary();
      const dry = riverDist(s2.top.truck.x, s2.top.truck.y);
      assert(s2.top.truck.x < b.x && dry >= RIVER_BLOCK - 1, `the river stops the truck on the bank (x ${s2.top.truck.x}, ${dry.toFixed(1)} px from the centreline)`);
      // ...but the bridge is
      await teleport(page, b.x - 60, b.y, 0);
      await api.hold(0, { right: true }); await api.step(80); await api.release(0);
      const s3 = await api.summary();
      assert(s3.top.truck.x > b.x + 30, `the bridge carries it across (x ${s3.top.truck.x} vs ${b.x})`);

      // a landmark the list does not need: the list is apples alone (above), so the mill has nothing the truck wants
      // and arriving there stays on the map behind a sign. (Every landmark opens a screen now, so the old COMING
      // SOON chalk note has no landmark left to stand on - screens/map.js dropped it.)
      const mill = placeOf('mill');
      await teleport(page, mill.x, mill.y + 70, 12);
      await api.hold(0, { up: true }); await api.step(60); await api.release(0);
      const s4 = await api.summary();
      assert(s4.screen === 'map' && s4.run.truckAt === 'mill', `arriving at the mill stays on the map (screen ${s4.screen}, at '${s4.run.truckAt}')`);
      assert(s4.top.sign === 'NOTHING NEEDED HERE', `...with a NOTHING NEEDED HERE sign (got '${s4.top.sign}')`);

      // the mill tower is painted into the ground chunk and never y-sorts against the truck, so a wall test has to
      // keep the token out of it: drive north into the tower and stop at its base
      await teleport(page, mill.x, mill.y + 60, 12);
      await api.hold(0, { up: true }); await api.step(150); await api.release(0);
      const sw = await api.summary();
      assert(sw.top.truck.y > mill.y - 82 && sw.top.truck.y < mill.y, `the mill's wall stops the truck outside the tower (y ${sw.top.truck.y}, tower ${mill.y - 82}..${mill.y - 6})`);

      // the millpond is not drivable either: drive north at it from its door (the list needs nothing there, so the
      // door only drops a sign) and stop on the bank, the token's centre a half-token short of the water
      const pond = placeOf('pond'), P = SPOTS.pond;
      await teleport(page, pond.x, pond.y + 60, 12);
      await api.hold(0, { up: true }); await api.step(150);
      const sp = await api.summary(); await api.release(0);
      assert(sp.screen === 'map' && sp.top.blocked === true, `driving into the millpond holds the truck (on ${sp.screen}, blocked ${sp.top.blocked})`);
      assert(sp.top.truck.x === pond.x && sp.top.truck.y > P.y + P.ry && sp.top.truck.y < pond.y - 5, `...on the bank below the water (y ${sp.top.truck.y}, water to ${P.y + P.ry}, door ${pond.y})`);
      assert(!pondBlocked(sp.top.truck.x, sp.top.truck.y + 1) && pondBlocked(sp.top.truck.x, sp.top.truck.y - 2), `...right against the pond's block (y ${sp.top.truck.y})`);
      // ...nor the cove's sea: drive east off the cove's door, over the sand, and stop short of the waterline
      const shore = placeOf('shore');
      await teleport(page, shore.x, shore.y, 0);
      await api.hold(0, { right: true }); await api.step(150);
      const ss = await api.summary(); await api.release(0);
      assert(ss.screen === 'map' && ss.top.blocked === true, `driving into the sea holds the truck (on ${ss.screen}, blocked ${ss.top.blocked})`);
      assert(ss.top.truck.y === shore.y && ss.top.truck.x > SPOTS.cove.x - 36 && ss.top.truck.x < shoreX(ss.top.truck.y) - 8, `...on the sand short of the waterline (x ${ss.top.truck.x}, sand from ${SPOTS.cove.x - 36}, waterline ${shoreX(ss.top.truck.y).toFixed(1)})`);
      assert(!seaBlocked(ss.top.truck.x - 1, ss.top.truck.y) && seaBlocked(ss.top.truck.x + 2, ss.top.truck.y), `...right against the sea's block (x ${ss.top.truck.x})`);

      // the orchard supplies the missing apples: arriving there opens its screen
      const o = placeOf('orchard');
      await teleport(page, o.x + 70, o.y + 70, 10);
      await api.hold(0, { up: true, left: true }); await api.step(150); await api.release(0);
      const s5 = await api.summary();
      assert(s5.screen === 'orchard', `arriving at the orchard opens the orchard screen (now on ${s5.screen}, truck at '${s5.run.truckAt}')`);

      // every signpost stands off the lane and out of a wall: the truck drives through anything that does not.
      // Every door and signpost is on dry land too, or the water block would put a landmark out of reach
      for (const p of PLACES) {
        const g = SIGN_AT[p.id], d = laneDist(g.x, g.y);
        assert(d > SIGN_CLEAR, `the ${p.id} signpost clears the driving lane (${d.toFixed(1)} px > ${SIGN_CLEAR})`);
        assert(!wallBlocked(g.x, g.y), `the ${p.id} signpost is not planted inside a building`);
        assert(!waterBlocked(g.x, g.y), `the ${p.id} signpost is not planted in the water`);
        assert(!waterBlocked(p.x, p.y), `the ${p.id} door is on dry land`);
      }
    });
  },

  /**
   * Every order is completable: each ingredient names a real landmark, that landmark opens a real registered
   * screen, and driving to it with that ingredient missing actually opens it. A finished mini-game that no order
   * asks for is dead code, and an order whose ingredient has no mini-game is a run that can never be served.
   */
  async routing(server) {
    await withPage(server, 'skipTo=map&critters=0,1', async (api, page) => {
      await api.step(2);
      const ids = await page.evaluate(() => window.__game.screenIds());
      for (const [ingId, ing] of Object.entries(INGREDIENTS)) {
        const p = placeOf(ing.place);
        assert(!!p, `${ingId} comes from a landmark that exists ('${ing.place}')`);
        assert(!!(p && p.screen), `...and ${ing.place} opens a mini-game (screen '${p && p.screen}')`);
        assert(ids.includes(p && p.screen), `...which main.js registers (screenIds has '${p && p.screen}')`);
      }
      for (const o of ORDERS) for (const n of o.needs) {
        assert(!!INGREDIENTS[n.id], `${o.id} asks for a known ingredient ('${n.id}')`);
      }
      // ...and every ingredient is asked for by at least one order, or its mini-game can never open in play
      for (const ingId of Object.keys(INGREDIENTS)) {
        assert(ORDERS.some((o) => o.needs.some((n) => n.id === ingId)), `some order asks for ${ingId}, so its mini-game is reachable`);
      }

      // the drive itself, once per landmark that supplies something: put that ingredient on the order, park the
      // truck on the door, and the landmark's own screen comes up
      for (const [ingId, ing] of Object.entries(INGREDIENTS)) {
        const p = placeOf(ing.place);
        if (!p || !p.screen) continue;
        await api.goto('map', {});
        await page.evaluate(([id, amount]) => {
          const run = window.__game.game.run;
          run.needs.length = 0;
          run.needs.push({ id, amount, have: 0, used: 0 });
          run.truck.at = '';
        }, [ingId, 2]);
        await teleport(page, p.x, p.y + 60, 12);
        await api.hold(0, { up: true }); await api.step(120); await api.release(0);
        const s = await api.summary();
        assert(s.screen === p.screen, `${ing.place} opens '${p.screen}' when the order needs ${ingId} (landed on '${s.screen}')`);
      }
    });
  },

  /**
   * The whole day, from the shopping list to the first order taken, on a list cut down to the two newly finished
   * landmarks (flour from the mill, honey from the hives). Each stop is driven to for real and its screen is
   * asserted; the gathering itself is banked straight through run.gather so this scenario tests the FLOW and not
   * the mini-games' own rules - those have a scenario each.
   */
  async wholeDay(server) {
    // (the herds are taken off the road below, once the run is up: this scenario drives door to door)
    await withPage(server, 'skipTo=map&critters=0,1,2,3', async (api, page) => {
      await page.evaluate(() => {
        const run = window.__game.game.run;
        run.needs.length = 0;
        run.needs.push({ id: 'flour', amount: 3, have: 0, used: 0 }, { id: 'honey', amount: 2, have: 0, used: 0 });
        for (const c of run.crossings) { c.state = 3; c.t = 0; }
        window.__game.game.reset('map');
      });
      await api.step(5);
      const s0 = await api.summary();
      assert(s0.top.dest === 'mill' && s0.top.serving === false, `the list sends the truck to the mill first (dest ${s0.top.dest})`);

      for (const [place, ing, screen] of [['mill', 'flour', 'mill'], ['hive', 'honey', 'hive']]) {
        const p = placeOf(place);
        await teleport(page, p.x, p.y + 60, 12);
        await api.hold(0, { up: true }); await api.step(120); await api.release(0);
        const s = await api.summary();
        assert(s.screen === screen, `the ${place} opens '${screen}' (landed on '${s.screen}')`);
        // bank the line and come back out the way a finished round does
        await page.evaluate((id) => {
          const run = window.__game.game.run, n = run.need(id);
          run.gather(id, n.amount);
          window.__game.game.reset('map');
        }, ing);
        await api.step(5);
        const back = await api.summary();
        const line = (back.run.needs || []).find((n) => n.startsWith(ing + ':')) || '';
        const [have, amount] = (line.split(':')[1] || '').split('/');
        assert(have && have === amount, `the ${ing} line is full (${line})`);
      }

      const done = await api.summary();
      assert(done.run.complete === true && done.run.phase === 'serve', `the list is aboard, so the lines open (${done.run.phase})`);
      assert(done.top.serving === true && done.top.destLine >= 0, `...and the compass swings to a queue (dest ${done.top.dest}, line ${done.top.destLine})`);
      const lineAt = done.run.lines[done.top.destLine].place;
      assert(done.top.dest === lineAt, `the compass points at that line's landmark (${done.top.dest} vs ${lineAt})`);
      // a landmark with no queue stays on the map behind a sign
      const idle = PLACES.find((p) => p.id !== 'home' && !done.run.lines.some((l) => l.place === p.id));
      await teleport(page, idle.x, idle.y + 60, 12);
      await api.hold(0, { up: true }); await api.step(60); await api.release(0);
      const s1 = await api.summary();
      assert(s1.screen === 'map' && s1.top.sign === 'NO LINE HERE', `${idle.id} has no queue: the truck stays on the map behind a NO LINE HERE sign (on ${s1.screen}, '${s1.top.sign}')`);
      // the queue itself opens the line screen with its first customer at the hatch
      const q = placeOf(lineAt);
      await teleport(page, q.x, q.y + 60, 12);
      await api.hold(0, { up: true }); await api.step(150); await api.release(0);
      const s2 = await api.summary();
      assert(s2.screen === 'line', `driving to the queue opens the line screen (now on ${s2.screen})`);
      assert(s2.run.line === done.top.destLine && s2.run.customer === 0 && s2.top.waiting === 2, `the run stands on that line with its first customer at the hatch (line ${s2.run.line}, customer ${s2.run.customer}, ${s2.top.waiting} waiting)`);
      await api.step(40);
      const s3 = await api.summary();
      assert(s3.top.bubble.length > 0 && s3.top.dish === s3.run.dish, `the customer says their order (${s3.top.bubble})`);
      await api.shot('line-queue');
      await api.press(0, { action: true }, 2, 4);
      await api.step(60);
      assert((await api.screen()) === 'kitchen', `taking the order opens the kitchen (now on ${await api.screen()})`);
    });
  },
};
