// Playtest scenarios for THE FRIENDS WHO RIDE ALONG (docs/GDD.md sections 2 and 6; game/friends.ts and
// game/kitchenFriends.ts; registered in tools/scenarios/index.js). Each export is `async (server) => void` using
// withPage / assert from ../playtest.js.
//
//   friends - the rule, in node: every pick brings two of the cast who are not it, one to take the orders and one
//        to run about; a party brings friends only while the truck has seats (two with two, one with three, none with
//        four); nobody seated ever rides along as a friend; and the same party always brings the same friends.
//   friendsSelect - the select screen says who rides along with the card under the cursor before the stamp goes
//        down, and follows the cursor. Writes tools/screens/select-friends.png.
//   friendsKitchen - in the kitchen the order-taker stands under the hatch with the pad and takes the line's orders a
//        diner at a time, front first, round the line and round again; the runner runs about its patch of floor, dash
//        after dash; and none of it is simulation: the gameplay rng never moves, the screen's checksum fields cannot
//        see a friend, and the same day draws the same runner. Writes tools/screens/kitchen-friends.png.
//   friendsReach - every cast member, as order-taker and as runner, measured off its own drawn pixels through every
//        beat it plays: the order-taker's tallest hat stays under the shelf's counts, the runner never climbs onto
//        the counter, and neither ever leaves its patch of floor.
//   friendsBell - the bell stops the order-taking: the pad goes away, both friends cheer the plates out, and results
//        comes as it always has.
//   friendsTruck - the friends ride in the truck's windows after the crew on the map, the line, results and the
//        night's garage, and cheer with the crew at results - as many as the truck has seats for.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage, assert } from '../playtest.js';
import { cook, oneOrder } from './kitchen.js';
import { friendsOf, FRIENDS_MAX, TRUCK_SEATS } from '../../src/game/friends.ts';
import { CRITTERS } from '../../src/content/critters/index.ts';

/** Where the harness writes its screenshots (tools/playtest.js SHOTS). */
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'screens');
/** game/kitchenFriends.ts's floor: the order-taker's spot and the runner's patch (kept in step with that file). */
const TAKER = [552, 337], PATCH = { x0: 96, x1: 466, y0: 308, y1: 334 };
/** The shelf's counts' bottom row, and the counter's top: what the friends must stay under (art/backgrounds/kitchen.ts). */
const COUNTS_FOOT = 241, COUNTER_TOP = 206;
const IDS = CRITTERS.map((c) => c.id);

/** The friends on the kitchen floor right now, off the top screen. */
const friendsNow = (page) => page.evaluate(() => window.__game.game.screen.friends.summary());

/**
 * Step the kitchen `frames` frames, and on every one measure each friend's silhouette off its own pixels: the rig
 * drawn alone, in the pose it is in, onto a scratch canvas, and its topmost inked row carried back to the floor.
 * Returns per friend: the highest row it reached, and the bounds its feet kept to.
 */
async function measure(page, frames) {
  return page.evaluate(async (n) => {
    const { drawRig } = await import('/src/lib/art/rig.ts');
    const W = 200, FEET = 170, c = document.createElement('canvas'); c.width = W; c.height = W;
    const g = c.getContext('2d', { willReadFrequently: true }), k = window.__game.game.screen;
    const out = k.friends.list.map((f) => ({ critter: f.critter, job: f.job, top: 1e9, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, anims: [] }));
    for (let i = 0; i < n; i++) {
      window.__game.step(1);
      k.friends.list.forEach((f, j) => {
        const o = out[j];
        g.clearRect(0, 0, W, W);
        drawRig(g, f.rig, f.player.pose, { x: W / 2, y: FEET, facing: f.facing, still: true });
        const px = g.getImageData(0, 0, W, W).data;
        let top = -1;
        for (let y = 0; y < W && top < 0; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] > 0) { top = y; break; }
        if (top >= 0) o.top = Math.min(o.top, Math.round(f.y) - (FEET - top));
        o.x0 = Math.min(o.x0, f.x); o.x1 = Math.max(o.x1, f.x); o.y0 = Math.min(o.y0, f.y); o.y1 = Math.max(o.y1, f.y);
        if (o.anims.indexOf(f.anim) < 0) o.anims.push(f.anim);
      });
    }
    return out;
  }, frames);
}

export const SCENARIOS = {
  async friends() {
    for (const id of IDS) {
      const f = friendsOf([{ critter: id }]);
      assert(f.length === FRIENDS_MAX && f.every((x) => x.critter !== id) && f[0].critter !== f[1].critter,
        `picking ${id} brings two friends who are not ${id} (${f.map((x) => x.critter).join(', ')})`);
      assert(f[0].job === 'order' && f[1].job === 'run', `one takes the orders and one runs about (${f.map((x) => `${x.critter}:${x.job}`).join(', ')})`);
      assert(JSON.stringify(friendsOf([{ critter: id }])) === JSON.stringify(f), `the same pick brings the same friends (${id})`);
    }
    const pairs = new Set(IDS.map((id) => friendsOf([{ critter: id }]).map((x) => x.critter).sort().join('+')));
    assert(pairs.size === IDS.length, `every pick brings a pair of its own (${[...pairs].join(' / ')})`);
    assert(friendsOf([{ critter: 'chicory' }])[0].critter === 'rowan', 'the head chef takes the orders when they come along');
    for (let n = 1; n <= TRUCK_SEATS; n++) {
      for (let s = 0; s < IDS.length; s++) {
        const party = []; for (let k = 0; k < n; k++) party.push({ critter: IDS[(s + k) % IDS.length] });
        const f = friendsOf(party), want = Math.min(FRIENDS_MAX, TRUCK_SEATS - n);
        assert(f.length === want && f.every((x) => !party.some((p) => p.critter === x.critter)),
          `a party of ${n} (${party.map((p) => p.critter).join(',')}) brings ${want}, none of them seated (${f.map((x) => x.critter).join(',') || 'nobody'})`);
        if (f.length === 1) assert(f[0].job === 'order', `a lone friend takes the orders (${f[0].critter}:${f[0].job})`);
      }
    }
    assert(friendsOf([]).length === 0, 'an empty party brings nobody');
  },

  async friendsSelect(server) {
    await withPage(server, 'skipTo=select', async (api) => {
      await api.step(4);
      let s = await api.summary();
      const want = (id) => friendsOf([{ critter: id }]).map((f) => `${f.critter}:${f.job}`).sort().join();
      assert(s.top.seats[0].critter === 'barley' && s.top.friends.slice().sort().join() === want('barley'), `the cursor's pick shows who rides along with it (${s.top.friends.join()})`);
      assert(s.top.friendsText === 'SORREL AND CHICORY RIDE ALONG', `and the bio strip names them ('${s.top.friendsText}')`);
      await api.shot('select-friends');
      for (let i = 1; i < IDS.length; i++) {
        await api.press(0, { right: true }, 1, 2);
        s = await api.summary();
        assert(s.top.seats[0].critter === IDS[i] && s.top.friends.slice().sort().join() === want(IDS[i]), `on ${IDS[i]} the friends follow the cursor (${s.top.friends.join()})`);
      }
    });
  },

  async friendsKitchen(server) {
    await withPage(server, 'skipTo=kitchen&critters=0&seed=7', async (api, page) => {
      await api.step(2);
      let s = await api.summary();
      const f = friendsOf([{ critter: 'barley' }]);
      assert(s.top.friends.length === 2 && s.top.friends.map((x) => `${x.critter}:${x.job}`).join() === f.map((x) => `${x.critter}:${x.job}`).join(),
        `the two friends are in the kitchen with the seat (${s.top.friends.map((x) => `${x.critter}:${x.job}`).join()})`);
      const taker = s.top.friends[0], runner = s.top.friends[1];
      assert(taker.x === TAKER[0] && taker.y === TAKER[1] && taker.facing === 1 && taker.pad === 0, `the order-taker stands under the hatch facing the line, a fresh page on the pad (${taker.x},${taker.y} facing ${taker.facing}, pad ${taker.pad})`);
      assert(runner.x >= PATCH.x0 && runner.x <= PATCH.x1 && runner.y >= PATCH.y0 && runner.y <= PATCH.y1, `the runner starts on its patch of floor (${runner.x},${runner.y})`);
      assert(s.top.asking === 0, `the order-taker asks the front of the line first (asking ${s.top.asking})`);

      // the seat does nothing: nothing in the kitchen can draw from the gameplay rng, so if it moves, a friend moved it
      const rng0 = await page.evaluate(() => window.__game.game.rng.state);
      const asked = [], spots = new Set();
      let pads = 0, writes = 0;
      const custs = s.top.custs;
      for (let i = 0; i < 90; i++) {
        await api.step(10);
        const k = await friendsNow(page);
        if (asked[asked.length - 1] !== k.asking) asked.push(k.asking);
        spots.add(k.friends[1].x + ',' + k.friends[1].y);
        if (k.friends[0].pad > pads) pads = k.friends[0].pad;
        if (k.friends[0].anim === 'write') writes++;
      }
      s = await api.summary();
      const rng1 = await page.evaluate(() => window.__game.game.rng.state);
      assert(rng1 === rng0, `900 frames of friends never touch the gameplay rng (${rng0} -> ${rng1})`);
      assert(asked.slice(0, custs + 1).join() === [...Array(custs).keys(), -1].join(), `the orders are taken a diner at a time, front first, then a breather (${asked.join()})`);
      assert(asked.indexOf(0, 1) > 0, `and round the line again from the front (${asked.join()})`);
      assert(s.top.takes >= custs + 1, `every diner's order was written down (${s.top.takes} taken for ${custs} diners)`);
      assert(pads === 3 && writes > 0, `the order-taker writes each order down, three lines to a page (${pads} lines, writing on ${writes} samples)`);
      assert(s.top.dashes >= 6 && spots.size >= 6, `the runner runs about: ${s.top.dashes} dashes, ${spots.size} different spots`);
      assert(s.top.step === 0 && s.top.owners.every((o) => o === -1) && s.top.total === 0, `and neither friend claimed or worked a step (step ${s.top.step}, owners ${s.top.owners.join()})`);
      await api.shot('kitchen-friends');

      // nothing about a friend is in the checksum: move the runner and rewrite the order-taker's round, and the fields do not change
      const same = await page.evaluate(() => {
        const k = window.__game.game.screen, a = k.checksumFields().slice();
        const fr = k.friends.list[1]; fr.x += 40; fr.y -= 7; k.friends.asking = (k.friends.asking + 1) % 3; k.friends.t = 33; k.friends.takes += 5;
        const b = k.checksumFields().slice();
        return a.join() === b.join();
      });
      assert(same, 'the kitchen\'s checksum fields cannot see a friend');

      // the same day draws the same runner: the kitchen opened again on the same run runs the same dashes
      const trace = async () => {
        await page.evaluate(() => window.__game.game.reset('kitchen'));
        const out = [];
        for (let i = 0; i < 30; i++) { await api.step(10); const k = await friendsNow(page); out.push(`${k.friends[1].x},${k.friends[1].y},${k.asking}`); }
        return out.join(' ');
      };
      const t1 = await trace(), t2 = await trace();
      assert(t1 === t2, 'the same day draws the same runner, dash for dash (every peer sees one runner)');
    });
    // a party of four brings nobody, and a party of three brings an order-taker and no runner
    await withPage(server, 'skipTo=kitchen&critters=0,1,2,3', async (api) => {
      await api.step(30);
      const s = await api.summary();
      assert(s.top.friends.length === 0 && s.top.seats.length === 4, `a full truck brings no friends (${s.top.friends.length} friends, ${s.top.seats.length} seats)`);
      assert(s.top.asking === -1, `and with nobody to take the orders, no diner is asked (asking ${s.top.asking})`);
    });
    await withPage(server, 'skipTo=kitchen&critters=0,1,3', async (api) => {
      await api.step(30);
      const s = await api.summary();
      assert(s.top.friends.length === 1 && s.top.friends[0].job === 'order' && s.top.friends[0].critter === 'chicory', `a party of three brings one friend, who takes the orders (${s.top.friends.map((x) => `${x.critter}:${x.job}`).join()})`);
    });
  },

  async friendsReach(server) {
    // every cast member as order-taker and as runner: the solo picks cover all but the hare taking orders, which a
    // party of three that leaves the hare at home does
    const cases = ['0', '1', '2', '3', '4', '0,1,3'];
    const seen = { order: new Set(), run: new Set() };
    for (const critters of cases) {
      await withPage(server, `skipTo=kitchen&critters=${critters}&day=5&seed=11`, async (api, page) => {
        await api.step(2);
        const m = await measure(page, 420);
        for (const o of m) {
          seen[o.job].add(o.critter);
          if (o.job === 'order') {
            assert(o.top > COUNTS_FOOT, `${o.critter} taking orders stays under the shelf's counts through ${o.anims.join('/')} (top row ${o.top}, counts end on ${COUNTS_FOOT})`);
            assert(o.x0 === TAKER[0] && o.x1 === TAKER[0] && o.y0 === TAKER[1] && o.y1 === TAKER[1], `${o.critter} keeps to the spot under the hatch (${o.x0}..${o.x1}, ${o.y0}..${o.y1})`);
          } else {
            assert(o.top > COUNTER_TOP, `${o.critter} running about never climbs onto the counter, hops and all (top row ${o.top} through ${o.anims.join('/')})`);
            assert(o.x0 >= PATCH.x0 && o.x1 <= PATCH.x1 && o.y0 >= PATCH.y0 && o.y1 <= PATCH.y1, `${o.critter} keeps to its patch of floor (${o.x0}..${o.x1}, ${o.y0}..${o.y1})`);
            assert(o.anims.includes('run') && o.anims.length >= 2, `${o.critter} runs, and rests between dashes (${o.anims.join('/')})`);
          }
        }
      });
    }
    assert(IDS.every((id) => seen.order.has(id)), `every cast member was measured taking orders (${[...seen.order].join()})`);
    assert(['chicory', 'cress', 'barley', 'sorrel'].every((id) => seen.run.has(id)), `and every one who ever runs about, running (${[...seen.run].join()})`);
  },

  async friendsBell(server) {
    await withPage(server, 'skipTo=kitchen&critters=2&order=2', async (api, page) => {
      await api.step(2);
      await oneOrder(api, page);
      let s = await cook(api);
      assert(s.top.served === true, `the order is cooked and the bell has rung (served ${s.top.served})`);
      await api.step(14);
      s = await api.summary();
      assert(s.top.bell && s.top.asking === -1, `the bell stops the order-taking (asking ${s.top.asking})`);
      assert(s.top.friends.every((f) => f.anim === 'cheer' && f.pad === -1), `the pad is put away and both friends cheer the plates out (${s.top.friends.map((f) => `${f.critter}:${f.anim}:${f.pad}`).join()})`);
      await api.shot('kitchen-friends-bell');
      for (let i = 0; i < 30 && (await api.screen()) !== 'results'; i++) await api.step(6);
      assert((await api.screen()) === 'results', 'and results comes as it always has');
    });
  },

  async friendsTruck(server) {
    for (const [critters, heads, friends] of [['0', 3, 2], ['0,1', 4, 2], ['0,1,2', 4, 1], ['0,1,2,3', 4, 0]]) {
      await withPage(server, `skipTo=map&critters=${critters}`, async (api) => {
        await api.step(10);
        let s = await api.summary();
        assert(s.top.heads === heads && s.top.friends.length === friends, `a party of ${critters.split(',').length} on the map: ${s.top.heads} heads in the windows, ${s.top.friends.length} of them friends (${s.top.friends.join() || 'none'})`);
        await api.goto('line');
        await api.step(10);
        s = await api.summary();
        assert(s.top.heads === heads && s.top.friends.length === friends, `and at the line (${s.top.heads} heads, friends ${s.top.friends.join() || 'none'})`);
        await api.goto('results');
        await api.step(140);
        s = await api.summary();
        assert(s.top.heads === heads && s.top.friends === friends && s.top.friendsCheered === friends, `and at results, where the friends cheer with the crew (${s.top.heads} heads, ${s.top.friendsCheered} of ${s.top.friends} friends cheered)`);
        await api.goto('garage', { from: 'night' });
        await api.step(10);
        s = await api.summary();
        assert(s.top.crew === critters.split(',').length && s.top.friends === friends, `and home to the garage for the night (${s.top.crew} crew, ${s.top.friends} friends)`);
      });
    }
  },
};
