// The end-to-end playthrough (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   playthrough - ONE page, one uninterrupted run, no ?skipTo and no __game.goto: the title screen through PLAY and
//        the critter select into a run, the truck driven along the real lane network to each landmark the order
//        names, both mini-games PLAYED (apples chased under the basket and caught, eggs walked to and plucked) until
//        their lines fill, then home, the four kitchen stations cooked, and the customer's stars banked on results.
//        Every other scenario starts its screen with ?skipTo and pokes the run where it needs it; this one only ever
//        sends input, so it is the test that fails when two screens that each work on their own cannot hand over.
//        Writes tools/screens/playthrough-served.png.
//
//   playthroughSecondOrder - the run does not end with one dish: the ticket rolls to a second order, re-points at a
//        landmark the truck has not visited on this run, and its screen opens. What stops `serve()` from handing back
//        a run that cannot be driven any further.
import { withPage, assert } from '../playtest.js';
import { PLACES } from '../../src/content/places.ts';
import { LANES } from '../../src/art/backgrounds/map.ts';
import { walkTo, chopOnce } from './kitchen.js';

// ---------------------------------------------------------------- driving

/**
 * The lane network as a graph: every vertex of every polyline in art/backgrounds/map.js LANES is a node, and every
 * landmark door is one of those vertices. Driving by "hold the stick at the destination" walks the truck into the
 * river; driving waypoint to waypoint along the lanes it was drawn with takes the bridges for free, and keeps the
 * truck on the 2.2 px/frame lane speed instead of the 1.0 it crawls at in the fields.
 */
const GRAPH = (() => {
  const nodes = new Map(), key = (x, y) => x + ',' + y;
  const node = (x, y) => { const k = key(x, y); let n = nodes.get(k); if (!n) nodes.set(k, n = { x, y, to: [] }); return n; };
  for (const lane of LANES) {
    for (let i = 0; i + 3 < lane.length; i += 2) {
      const a = node(lane[i], lane[i + 1]), b = node(lane[i + 2], lane[i + 3]);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      a.to.push({ n: b, d }); b.to.push({ n: a, d });
    }
  }
  return nodes;
})();

/** Shortest lane route from a point to a landmark's door, as [x, y] waypoints (Dijkstra over GRAPH). */
function routeTo(from, placeId) {
  const p = PLACES.find((x) => x.id === placeId);
  const goal = GRAPH.get(p.x + ',' + p.y);
  let start = null, bd = Infinity;
  for (const n of GRAPH.values()) { const d = Math.hypot(n.x - from.x, n.y - from.y); if (d < bd) { bd = d; start = n; } }
  const dist = new Map([[start, 0]]), prev = new Map(), done = new Set();
  for (;;) {
    let cur = null, cd = Infinity;
    for (const [n, d] of dist) if (!done.has(n) && d < cd) { cd = d; cur = n; }
    if (!cur || cur === goal) break;
    done.add(cur);
    for (const e of cur.to) { const nd = cd + e.d; if (nd < (dist.has(e.n) ? dist.get(e.n) : Infinity)) { dist.set(e.n, nd); prev.set(e.n, cur); } }
  }
  const path = [];
  for (let n = goal; n; n = prev.get(n)) path.unshift([n.x, n.y]);
  return path;
}

/** The eight-way stick that points at (dx, dy). */
function toward(dx, dy) {
  const k = {};
  if (dx > 5) k.right = true; else if (dx < -5) k.left = true;
  if (dy > 5) k.down = true; else if (dy < -5) k.up = true;
  return k;
}

/**
 * How far along the leg the truck steers for, and how far off the lane it may be before it stops looking ahead at
 * all. Aiming at a point half a second ahead keeps the truck rolling down the centreline; carrying that lookahead
 * while it is off the line instead points it almost straight down the lane, so a corner overshot on the turn is
 * never steered back - and 15 px of that at the wrong y is a bridge missed and a truck parked against the bank.
 */
const LOOKAHEAD = 50, OFF_LANE = 6, ARRIVED = 16;

/** The point further along the leg a-b the truck should steer for, from its own projection onto that leg. */
function aimPoint(a, b, t) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const u = Math.max(0, Math.min(len, ((t.x - a[0]) * dx + (t.y - a[1]) * dy) / len));
  const px = a[0] + (dx / len) * u, py = a[1] + (dy / len) * u;
  const at = Math.min(len, u + (Math.hypot(t.x - px, t.y - py) > OFF_LANE ? OFF_LANE : LOOKAHEAD));
  return [a[0] + (dx / len) * at, a[1] + (dy / len) * at];
}

/**
 * Drive seat 0 to a landmark along the lanes and stop when a screen opens (arriving within 40 px of a door is what
 * opens it, so the truck never reaches the last waypoint on a landmark the order needs). Returns the summary it ends
 * on, which is the mini-game's when the drive worked.
 * @returns {Promise<object>}
 */
async function driveTo(api, placeId, budget = 3000) {
  let s = await api.summary();
  const path = routeTo(s.top.truck, placeId);
  let prev = [s.top.truck.x, s.top.truck.y];
  let frames = 0, stuck = 0, backing = 0, lastX = s.top.truck.x, lastY = s.top.truck.y;
  while (path.length && frames < budget) {
    const t = s.top.truck;
    if (Math.hypot(path[0][0] - t.x, path[0][1] - t.y) <= ARRIVED) { prev = path.shift(); continue; }
    const aim = aimPoint(prev, path[0], t);
    let dx = aim[0] - t.x, dy = aim[1] - t.y;
    // a bank or a wall the lane route did not expect: reverse out of it for a few polls rather than pressing into
    // it for the whole budget (the truck has no brake, so the only way off a bank is back the way it came)
    if (Math.abs(t.x - lastX) < 2 && Math.abs(t.y - lastY) < 2) stuck++; else stuck = 0;
    lastX = t.x; lastY = t.y;
    if (stuck >= 4) { backing = 5; stuck = 0; }
    if (backing > 0) { backing--; dx = -dx; dy = -dy; }
    await api.hold(0, toward(dx, dy));
    await api.step(6);
    frames += 6;
    s = await api.summary();
    if (process.env.KEEP) console.log('   [drive]', placeId, JSON.stringify(s.top.truck), 'for', path[0], s.top.blocked ? 'BLOCKED' : '');
    if (s.screen !== 'map') break;
  }
  await api.release(0);
  // the arrival fades out over the map: step until the screen behind it is up
  for (let i = 0; i < 20 && s.screen === 'map'; i++) { await api.step(6); s = await api.summary(); }
  return s;
}

/** Step out the end sign's slam and its hold (game/minigame.js), and come back with the map's summary. */
async function handBack(api, from) {
  for (let i = 0; i < 40 && (await api.screen()) === from; i++) await api.step(6);
  return api.summary();
}

// ---------------------------------------------------------------- the orchard, played

/** Orchard geometry the chase has to agree with (game/screens/orchard.js): the apple's size, the run speed, the lane. */
const APPLE_S = 5, RUN_SPEED = 2.2, LANE_MIN = 24, LANE_MAX = 616;

/** Everything the chase reads out of the live orchard: seat 0, its catch boxes, and the fruit in the air. */
function orchardState(page) {
  return page.evaluate(() => {
    const sc = window.__game.game.screen;
    if (!sc || sc.id !== 'orchard') return null;
    const s = sc.seats[0];
    return {
      x: s.x, y: s.y, facing: s.facing, phase: sc.clock.phase,
      boxCatchX: s.boxCatchX, boxCatchY: s.boxCatchY,
      apples: sc.apples.filter((a) => a.active).map((a) => [a.x, a.y, a.vy, a.hang]),
    };
  });
}

/**
 * Where seat 0 must STAND for a stopped basket to be under an apple. The rim hangs boxCatchX in front of the seat,
 * so which side of the apple to stand on depends on which way the seat ends up facing - and it ends up facing
 * whichever way it last walked. Only the spot the seat can walk to without turning away from the apple is valid.
 * @returns {number|null}
 */
function standFor(st, appleX) {
  for (const f of [1, -1]) {
    const want = appleX - f * st.boxCatchX;
    if (want < LANE_MIN || want > LANE_MAX) continue;
    if (f > 0 ? want >= st.x - 1 : want <= st.x + 1) return want;
  }
  return null;
}

/**
 * Play one round in the orchard: chase the apples and leave when the round hands back to the map (the target
 * reached, or the 40-second clock out). Input only - nothing here touches the sim.
 */
async function pickApples(api, page) {
  for (let poll = 0; poll < 700; poll++) {
    const st = await orchardState(page);
    if (!st || st.phase !== 0) break;
    const boxY = st.y + st.boxCatchY;
    // fall time (frames) until an apple's bottom reaches the rim's row
    const fall = (a) => (boxY - (a[1] + APPLE_S)) / a[2];
    let want = null, soonest = Infinity;
    for (const a of st.apples) {
      if (a[3] > 0) continue;                                  // still hanging on its branch
      const t = fall(a);
      if (t < 2) continue;                                     // past the rim: nothing to do about this one
      const spot = standFor(st, a[0]);
      if (spot == null) continue;
      if (Math.abs(spot - st.x) / RUN_SPEED + 6 > t) continue; // cannot be under it in time
      if (t < soonest) { soonest = t; want = spot; }
    }
    if (want == null || Math.abs(want - st.x) <= 2) await api.release(0);
    else await api.hold(0, want > st.x ? { right: true } : { left: true });
    await api.step(4);
  }
  await api.release(0);
  return handBack(api, 'orchard');
}

// ---------------------------------------------------------------- the coop, played

/** Plucking reach along the lane (game/screens/coop.js PLUCK_R). */
const PLUCK_R = 18;
function nearest(list, x) {
  let best = null, bd = 1e9;
  for (const p of list) { const d = Math.abs(p[0] - x); if (d < bd) { bd = d; best = p; } }
  return best;
}

/** Play one round in the coop: walk seat 0 along its lane to the nearest egg's x and press, until the round is over. */
async function pluckEggs(api) {
  let s = await api.summary();
  for (let poll = 0; poll < 700 && s.screen === 'coop' && s.top.phase === 0; poll++) {
    const me = s.top.seats[0], egg = nearest(s.top.eggs, me[1]);
    if (!egg) { await api.release(0); await api.step(6); s = await api.summary(); continue; }
    const dx = egg[0] - me[1];
    if (Math.abs(dx) <= PLUCK_R - 4) {
      await api.release(0);
      await api.press(0, { action: true }, 1, 2);
    } else {
      await api.hold(0, dx > 0 ? { right: true } : { left: true });
      await api.step(4);
    }
    s = await api.summary();
  }
  await api.release(0);
  return handBack(api, 'coop');
}

// ---------------------------------------------------------------- the kitchen, cooked

/** Station index per step name (game/screens/kitchen.js STATION_IDX). */
const STATION = { chop: 0, mix: 1, stove: 2, oven: 3, plate: 4 };

/**
 * Cook whatever steps the order carries, each with the input its station asks for: ten taps on the board, a hold
 * on the bowl, a hold on the stove, a hold on the oven, and the bell. Every hold is kept down until the step
 * advances, which is what a player does. Leaves the kitchen on the hand-over to results.
 */
async function cook(api) {
  let s = await api.summary();
  const steps = s.top.steps.map((n) => n.toLowerCase());
  for (let k = 0; k < steps.length; k++) {
    const name = steps[k];
    s = await walkTo(api, STATION[name]);
    if (name === 'chop') { for (let i = 0; i < 10; i++) s = await chopOnce(api); }
    else if (name === 'plate') await api.press(0, { action: true }, 1, 0);
    else {
      await api.hold(0, { action: true });
      for (let i = 0; i < 80 && (await api.summary()).top.step === k; i++) await api.step(4);
      await api.release(0);
      await api.step(2);
    }
    s = await api.summary();
  }
  return s;
}

/** Drive to the landmark the ticket names, play whatever screen opens, and come back with the map's summary. */
async function gatherNextStop(api, page) {
  const before = await api.summary();
  const dest = before.top.dest;
  const arrived = await driveTo(api, dest);
  assert(arrived.screen !== 'map', `the truck drove to the ${dest} and its screen opened (on ${arrived.screen})`);
  if (arrived.screen === 'orchard') await pickApples(api, page);
  else if (arrived.screen === 'coop') await pluckEggs(api);
  return api.summary();
}

export const SCENARIOS = {
  async playthrough(server) {
    await withPage(server, 'skipTo=title', async (api, page) => {
      // ---- the title and the select: the only way into a run a player actually has ----
      await api.step(5);
      assert((await api.screen()) === 'title', `the page opens on the title (on ${await api.screen()})`);
      await api.press(0, { action: true }, 2, 4);
      assert((await api.screen()) === 'select', `PLAY opens the critter select (on ${await api.screen()})`);
      await api.press(0, { action: true }, 2, 4);
      assert((await api.summary()).top.seats[0].ready === true, 'P1 stamps READY on a card');
      await api.step(90);
      let s = await api.summary();
      assert(s.screen === 'stage', `the stamped card opens the order board (on ${s.screen})`);
      assert(s.top.stages === 7 && s.top.cleared === 0, `seven stages are pinned up, none of them served (${s.top.stages}, ${s.top.cleared})`);

      // ---- the order board: the customer and the dish, taken off the board ----
      await api.press(0, { action: true }, 2, 4);
      await api.step(60);
      s = await api.summary();
      assert(s.screen === 'map', `taking the order starts the run on the map (on ${s.screen})`);
      assert(s.run.dish === 'APPLE PIE' && s.run.needs.join() === 'apple:0/4,egg:0/2',
        `the phone call is the apple pie, nothing gathered (${s.run.dish}, ${s.run.needs.join()})`);
      assert(s.run.truckAt === 'home', `the truck starts parked at home (at '${s.run.truckAt}')`);

      // ---- the order, gathered: one stop per line, each mini-game PLAYED until its line fills ----
      const seen = [];
      for (let stop = 0; stop < 6 && !s.run.complete; stop++) {
        seen.push(s.top.dest);
        s = await gatherNextStop(api, page);
        assert(s.screen === 'map', `the round handed back to the map (on ${s.screen})`);
      }
      assert(s.run.complete === true, `both lines are aboard (${s.run.needs.join()})`);
      assert(seen.includes('orchard') && seen.includes('coop'), `the ticket sent the truck to both landmarks (${seen.join(' -> ')})`);
      assert(s.top.dest === 'home', `...and now points home (dest ${s.top.dest})`);

      // ---- home, and the kitchen ----
      s = await driveTo(api, 'home');
      assert(s.screen === 'kitchen', `driving home with a full order opens the kitchen (on ${s.screen})`);
      assert(s.top.steps.join() === 'CHOP,MIX,OVEN,PLATE', `the pie's stations are up (${s.top.steps.join()})`);
      s = await cook(api);
      assert(s.top.served === true && s.top.stars >= 1, `the bell serves the dish (total ${s.top.total}/8 -> ${s.top.stars} stars)`);
      const stars = s.top.stars;

      // ---- results, and back to the map with the order banked ----
      for (let i = 0; i < 40 && (await api.screen()) !== 'results'; i++) await api.step(6);
      s = await api.summary();
      assert(s.screen === 'results' && s.top.stars === stars, `the kitchen hands the stars to results (on ${s.screen}, ${s.top.stars})`);
      await api.step(140);
      await api.shot('playthrough-served');
      await api.press(0, { action: true }, 1, 2);
      s = await api.summary();
      assert(s.screen === 'stage' && s.run.served === 1, `confirm banks the order and hands the board back (on ${s.screen}, served ${s.run.served})`);
      assert(s.run.stars[0] === stars, `the stage is stamped at the stars the customer gave it (${s.run.stars.join()})`);
      assert(s.run.score === stars * 100, `the run scores what the customer gave it (${s.run.score} for ${stars} stars)`);
      assert(s.run.truckAt === 'home', `the truck is home for the next call (at '${s.run.truckAt}')`);
      assert(s.run.dayComplete === false && s.top.closed === false, 'six stages are still on the board, so the day is not over');
      await api.shot('playthrough-board');
    });
  },

  /** The second order: a served stage hands the board back, the next one is taken off it and can be driven. */
  async playthroughSecondOrder(server) {
    await withPage(server, 'skipTo=results&critters=0', async (api) => {
      await api.step(150);
      await api.press(0, { action: true }, 1, 2);
      let s = await api.summary();
      assert(s.screen === 'stage' && s.run.served === 1, `results banks the first order on the board (on ${s.screen}, served ${s.run.served})`);
      assert(s.run.stars[0] > 0 && s.run.cleared === 1, `that stage carries stars now (${s.run.stars.join()})`);
      assert(s.top.sel !== 0, `the cursor stands on a stage still to be cooked (sel ${s.top.sel})`);
      await api.press(0, { action: true }, 2, 4);
      await api.step(60);
      s = await api.summary();
      assert(s.screen === 'map' && s.run.stage !== 0, `the next stage off the board opens the map (on ${s.screen}, stage ${s.run.stage})`);
      assert(s.run.dish !== 'APPLE PIE' && s.run.needs.every((n) => n.endsWith(':0/' + n.split('/')[1])),
        `a fresh order is on the ticket with nothing gathered (${s.run.dish}, ${s.run.needs.join()})`);
      assert(s.top.dest !== 'home', `the ticket points at a landmark, not home (dest ${s.top.dest})`);
      const arrived = await driveTo(api, s.top.dest);
      assert(arrived.screen !== 'map', `the second order's first stop opens its screen (on ${arrived.screen})`);
    });
  },
};
