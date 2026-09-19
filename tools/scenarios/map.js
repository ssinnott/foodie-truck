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
import { INGREDIENTS, ORDERS } from '../../src/content/recipes.ts';
import { BRIDGES, RIVER_BLOCK, SIGN_AT, SIGN_CLEAR, SPOTS, riverDist, laneDist, wallBlocked, waterBlocked, pondBlocked, seaBlocked, shoreX } from '../../src/art/backgrounds/map.ts';

const placeOf = (id) => PLACES.find((p) => p.id === id);
const teleport = (page, x, y, heading) => page.evaluate(([px, py, h]) => { const t = window.__game.game.run.truck; t.x = px; t.y = py; t.at = ''; if (h != null) t.heading = h; }, [x, y, heading == null ? null : heading]);

export const SCENARIOS = {
  async map(server) {
    await withPage(server, 'skipTo=map&critters=0,1,2,3', async (api, page) => {
      await api.step(5);
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
    await withPage(server, 'skipTo=map&critters=0,1,2,3', async (api, page) => {
      await page.evaluate(() => {
        const run = window.__game.game.run;
        run.needs.length = 0;
        run.needs.push({ id: 'flour', amount: 3, have: 0, used: 0 }, { id: 'honey', amount: 2, have: 0, used: 0 });
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
