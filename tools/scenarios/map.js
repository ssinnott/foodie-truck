// Playtest scenarios for the map work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   map - four seats on the map: holding right on seat 0 drives the truck east off home, a honk stamps, the river
//         stops it short of a bridge, the mill's wall stops it outside the tower, a landmark the order does NOT
//         need drops a NOTHING NEEDED HERE sign, and driving to the orchard with apples on the order opens the
//         orchard screen. Every signpost is checked off the driving lane so none of them can drift back onto it.
//         Also writes tools/screens/map-driving.png.
//
//   routing - the data invariant behind the seven mini-games: every ingredient in content/recipes.js names a
//             landmark that exists, that landmark carries a screen, that screen is registered in main.js, and
//             every order is therefore actually completable. This is what stops a mini-game being finished and
//             then left unreachable behind a signpost.
import { withPage, assert } from '../playtest.js';
import { PLACES } from '../../src/content/places.js';
import { INGREDIENTS, ORDERS } from '../../src/content/recipes.js';
import { BRIDGES, RIVER_BLOCK, SIGN_AT, SIGN_CLEAR, riverDist, laneDist, wallBlocked } from '../../src/art/backgrounds/map.js';

const placeOf = (id) => PLACES.find((p) => p.id === id);
const teleport = (page, x, y, heading) => page.evaluate(([px, py, h]) => { const t = window.__game.game.run.truck; t.x = px; t.y = py; t.at = ''; if (h != null) t.heading = h; }, [x, y, heading == null ? null : heading]);

export const SCENARIOS = {
  async map(server) {
    await withPage(server, 'skipTo=map&critters=0,1,2,3', async (api, page) => {
      await api.step(5);
      const s0 = await api.summary();
      assert(s0.screen === 'map', 'the map is up with a run started');
      assert(s0.top.seats === 4 && s0.run.truckAt === 'home', `four seats aboard, parked at home (${s0.top.seats} seats, at '${s0.run.truckAt}')`);
      assert(s0.top.dest === 'orchard', `the first order sends the truck to the orchard (dest ${s0.top.dest})`);
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

      // a landmark the order does not need: order 1 is the apple pie, so the mill has nothing the truck wants and
      // arriving there stays on the map behind a sign. (Every landmark opens a screen now, so the old COMING SOON
      // chalk note has no landmark left to stand on - screens/map.js dropped it.)
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

      // the orchard supplies the missing apples: arriving there opens its screen
      const o = placeOf('orchard');
      await teleport(page, o.x + 70, o.y + 70, 10);
      await api.hold(0, { up: true, left: true }); await api.step(150); await api.release(0);
      const s5 = await api.summary();
      assert(s5.screen === 'orchard', `arriving at the orchard opens the orchard screen (now on ${s5.screen}, truck at '${s5.run.truckAt}')`);

      // every signpost stands off the lane and out of a wall: the truck drives through anything that does not
      for (const p of PLACES) {
        const g = SIGN_AT[p.id], d = laneDist(g.x, g.y);
        assert(d > SIGN_CLEAR, `the ${p.id} signpost clears the driving lane (${d.toFixed(1)} px > ${SIGN_CLEAR})`);
        assert(!wallBlocked(g.x, g.y), `the ${p.id} signpost is not planted inside a building`);
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
          run.order.needs.length = 0;
          run.order.needs.push({ id, amount, have: 0 });
          run.truck.at = '';
        }, [ingId, 2]);
        await teleport(page, p.x, p.y + 60, 12);
        await api.hold(0, { up: true }); await api.step(120); await api.release(0);
        const s = await api.summary();
        assert(s.screen === p.screen, `${ing.place} opens '${p.screen}' when the order needs ${ingId} (landed on '${s.screen}')`);
      }
    });
  },
};
