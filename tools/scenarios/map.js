// Playtest scenarios for the map work (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   map - four seats on the map: holding right on seat 0 drives the truck east off home, a honk stamps, the river
//         stops it short of a bridge, a scenery landmark drops a COMING SOON sign, and driving to the orchard with
//         apples on the order opens the orchard screen. Also writes tools/screens/map-driving.png.
import { withPage, assert } from '../playtest.js';
import { PLACES } from '../../src/content/places.js';
import { BRIDGES, RIVER_BLOCK, riverDist } from '../../src/art/backgrounds/map.js';

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

      // a scenery landmark: the mill drops a COMING SOON sign and stays on the map
      const mill = placeOf('mill');
      await teleport(page, mill.x, mill.y + 70, 12);
      await api.hold(0, { up: true }); await api.step(60); await api.release(0);
      const s4 = await api.summary();
      assert(s4.screen === 'map' && s4.run.truckAt === 'mill', `arriving at the mill stays on the map (screen ${s4.screen}, at '${s4.run.truckAt}')`);
      assert(s4.top.sign === 'COMING SOON', `...with a COMING SOON sign (got '${s4.top.sign}')`);

      // the orchard supplies the missing apples: arriving there opens its screen
      const o = placeOf('orchard');
      await teleport(page, o.x + 70, o.y + 70, 10);
      await api.hold(0, { up: true, left: true }); await api.step(150); await api.release(0);
      const s5 = await api.summary();
      assert(s5.screen === 'orchard', `arriving at the orchard opens the orchard screen (now on ${s5.screen}, truck at '${s5.run.truckAt}')`);
    });
  },
};
