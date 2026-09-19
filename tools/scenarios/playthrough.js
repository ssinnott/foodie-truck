// The end-to-end playthrough (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   playthrough - ONE page, one uninterrupted day, no ?skipTo and no __game.goto: the title screen through PLAY and
//        the critter select onto the day board, the truck opened, then driven along the real lane network to each
//        landmark the shopping list names, both mini-games PLAYED (apples chased under the basket and caught, eggs
//        walked to and plucked) round after round until the whole list is aboard, then to the nearest queue: the
//        first customer's order taken at the hatch, cooked across the stations and eaten on results, the second
//        called up and served the same way, and the truck back on the map with one line served and two to go.
//        Every other scenario starts its screen with ?skipTo and pokes the run where it needs it; this one only
//        ever sends input, so it is the test that fails when two screens that each work on their own cannot hand
//        over. The menu is fixed to the pie and the omelette (?recipes=0,2, a dev option) so the list only ever
//        names the two landmarks this file can play. Writes tools/screens/playthrough-served.png.
//
//   playthroughLastLine - the day does not end with one line: the last customer of the LAST line hands results
//        to the day board, which opens closed. What stops `serve()` from handing back a run with nowhere to go.
import { withPage, assert } from '../playtest.js';
import { PLACES } from '../../src/content/places.ts';
import { LANES } from '../../src/art/backgrounds/map.ts';
import { walkTo, chopOnce, pullAll } from './kitchen.js';
import { DAY_SHAPES } from '../../src/game/run.ts';

/** A real PLAY always starts a fresh week, so an uninterrupted playthrough is always DAY 1: the opening day. */
const DAY1 = DAY_SHAPES[0];

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
const APPLE_S = 7, RUN_SPEED = 2.2, LANE_MIN = 24, LANE_MAX = 616;
/** A wormy or a bomb apple this close to where seat 0 is standing, and this near to landing, is stepped away from. */
const BAD_X = 16, BAD_T = 45, DODGE = 44;

/** Everything the chase reads out of the live orchard: seat 0, its catch boxes, and the fruit in the air. */
function orchardState(page) {
  return page.evaluate(() => {
    const sc = window.__game.game.screen;
    if (!sc || sc.id !== 'orchard') return null;
    const s = sc.seats[0];
    return {
      x: s.x, y: s.y, facing: s.facing, phase: sc.clock.phase,
      boxCatchX: s.boxCatchX, boxCatchY: s.boxCatchY,
      apples: sc.apples.filter((a) => a.active).map((a) => [a.x, a.y, a.vy, a.kind, a.hang]),
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
 * Play one round in the orchard: chase the ripe apples, step out from under the wormy ones and the bombs, and leave
 * when the round hands back to the map (the target reached - a round has no clock). Input only - nothing here
 * touches the sim.
 */
async function pickApples(api, page) {
  for (let poll = 0; poll < 700; poll++) {
    const st = await orchardState(page);
    if (!st || st.phase !== 0) break;
    const boxY = st.y + st.boxCatchY, boxX = st.x + st.facing * st.boxCatchX;
    // fall time (frames) until an apple's bottom reaches the rim's row
    const fall = (a) => (boxY - (a[1] + APPLE_S)) / a[2];
    let want = null, soonest = Infinity, bad = null;
    for (const a of st.apples) {
      if (a[4] > 0) continue;                                  // still hanging on its branch
      const t = fall(a);
      if (t < 2) continue;                                     // past the rim: nothing to do about this one
      if (a[3] !== 0) { if (t < BAD_T && Math.abs(a[0] - boxX) < BAD_X) bad = a; continue; }
      const spot = standFor(st, a[0]);
      if (spot == null) continue;
      if (Math.abs(spot - st.x) / RUN_SPEED + 6 > t) continue; // cannot be under it in time
      if (t < soonest) { soonest = t; want = spot; }
    }
    // a bad one aimed at where we stand is a flinch or a two-second joke: step out from under it
    if (bad && (want == null || Math.abs(want - st.x) < 4)) {
      want = bad[0] > st.x ? st.x - DODGE : st.x + DODGE;
      want = Math.max(LANE_MIN, Math.min(LANE_MAX, want));
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
const PLUCK_R = 34;
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
const STATION = { fridge: 0, chop: 1, mix: 2, stove: 3, oven: 4, plate: 5 };

/**
 * Cook whatever steps the order carries, each with the input its station asks for: a tap per item at the fridge,
 * ten taps on the board, a hold on the bowl, a hold on the stove, a hold on the oven, and the bell. Every hold is
 * kept down until the step advances, which is what a player does. Leaves the kitchen on the hand-over to results.
 */
async function cook(api) {
  let s = await api.summary();
  const steps = s.top.steps.map((n) => n.toLowerCase());
  for (let k = 0; k < steps.length; k++) {
    const name = steps[k];
    if (name === 'fridge') { s = await pullAll(api); continue; }
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
    await withPage(server, 'skipTo=title&recipes=0,2', async (api, page) => {
      // ---- the title and the select: the only way into a run a player actually has ----
      await api.step(5);
      assert((await api.screen()) === 'title', `the page opens on the title (on ${await api.screen()})`);
      await api.press(0, { action: true }, 2, 4);
      assert((await api.screen()) === 'select', `PLAY opens the critter select (on ${await api.screen()})`);
      await api.press(0, { action: true }, 2, 4);
      assert((await api.summary()).top.seats[0].ready === true, 'P1 stamps READY on a card');
      await api.step(90);
      let s = await api.summary();
      assert(s.screen === 'stage', `the stamped card opens the day board (on ${s.screen})`);
      assert(s.top.lines === DAY1.lines.length && s.top.closed === false, `the opening day's ${DAY1.lines.length} lines are pinned up and the truck is not yet open (${s.top.lines})`);
      assert(s.run.recipes.join() === 'applePie,omelette', `the menu is the pie and the omelette (${s.run.recipes.join()})`);

      // ---- the day board: the truck opened ----
      await api.press(0, { action: true }, 2, 4);
      await api.step(60);
      s = await api.summary();
      assert(s.screen === 'map', `opening the truck starts the day on the map (on ${s.screen})`);
      assert(s.run.needs.map((n) => n.split(':')[0]).join() === 'apple,egg' && s.run.needs.every((n) => n.split(':')[1].startsWith('0/')),
        `the shopping list is apples and eggs, nothing gathered (${s.run.needs.join()})`);
      assert(s.run.truckAt === 'home' && s.run.phase === 'gather', `the truck starts parked at home, gathering (at '${s.run.truckAt}', ${s.run.phase})`);

      // ---- the list, gathered: a stop per line still short, each mini-game PLAYED until the list fills ----
      const seen = [];
      for (let stop = 0; stop < 10 && !s.run.complete; stop++) {
        seen.push(s.top.dest);
        s = await gatherNextStop(api, page);
        assert(s.screen === 'map', `the round handed back to the map (on ${s.screen})`);
      }
      assert(s.run.complete === true, `the whole list is aboard (${s.run.needs.join()})`);
      assert(seen.includes('orchard') && seen.includes('coop'), `the list sent the truck to both landmarks (${seen.join(' -> ')})`);
      assert(s.run.phase === 'serve' && s.top.serving === true && s.top.destLine >= 0, `...and now the lines are open, the compass on a queue (${s.run.phase}, dest ${s.top.dest})`);

      // ---- the queue, and the first order ----
      const lineIdx = s.top.destLine, place = s.top.dest;
      s = await driveTo(api, place);
      assert(s.screen === 'line', `driving to the queue opens the line screen (on ${s.screen})`);
      assert(s.run.line === lineIdx && s.top.waiting === 2, `the run stands on that line with two waiting (line ${s.run.line}, ${s.top.waiting})`);
      let servedStars = 0;
      for (let k = 0; k < 2; k++) {
        await api.step(40);
        s = await api.summary();
        assert(s.top.bubble.length > 0, `customer ${k + 1} says their order (${s.top.bubble})`);
        await api.press(0, { action: true }, 2, 4);
        for (let i = 0; i < 20 && (await api.screen()) !== 'kitchen'; i++) await api.step(6);
        s = await api.summary();
        assert(s.screen === 'kitchen' && s.run.customer === k, `taking the order opens the kitchen on customer ${k + 1} (on ${s.screen}, customer ${s.run.customer})`);
        s = await cook(api);
        assert(s.top.served === true && s.top.stars >= 1, `the bell serves the dish (total ${s.top.total} -> ${s.top.stars} stars)`);
        const stars = s.top.stars;
        servedStars += stars;
        for (let i = 0; i < 40 && (await api.screen()) !== 'results'; i++) await api.step(6);
        s = await api.summary();
        assert(s.screen === 'results' && s.top.stars === stars, `the kitchen hands the stars to results (on ${s.screen}, ${s.top.stars})`);
        await api.step(140);
        if (k === 0) await api.shot('playthrough-served');
        await api.press(0, { action: true }, 1, 2);
        s = await api.summary();
        assert(s.run.served === k + 1 && s.run.lines[lineIdx].customers[k].endsWith(':' + stars), `confirm banks customer ${k + 1} at their stars (served ${s.run.served}, ${s.run.lines[lineIdx].customers.join()})`);
        if (k === 0) assert(s.screen === 'line' && s.top.waiting === 1, `...and calls the next in line (on ${s.screen}, ${s.top.waiting} waiting)`);
      }
      // ---- the line served: back to the map with two to go ----
      assert(s.screen === 'map' && s.run.linesServed === 1 && s.run.dayComplete === false, `the last customer served sends the truck back to the map, one line down (on ${s.screen}, ${s.run.linesServed} served)`);
      assert(s.run.score === servedStars * 100 && s.run.stars === servedStars, `the run scores what the customers gave it (${s.run.score} for ${servedStars} stars)`);
      assert(s.top.sign === `LINE SERVED!  ${DAY1.lines.length - 1} TO GO`, `the map says so (sign '${s.top.sign}')`);
      assert(s.top.dest !== place && s.run.lines[s.top.destLine].served === false, `...and the compass has moved on to a line still waiting (dest ${s.top.dest})`);
      await api.step(30);
      await api.shot('playthrough-line-served');
    });
  },

  /** The last line: its last customer hands results to the board, which closes the day. */
  async playthroughLastLine(server) {
    await withPage(server, 'skipTo=results&critters=0', async (api, page) => {
      await page.evaluate(() => {
        const run = window.__game.game.run;
        for (const n of run.needs) n.have = n.amount;
        for (let i = 1; i < run.lines.length; i++) { run.lines[i].served = true; for (const c of run.lines[i].customers) c.stars = 2; }
        run.startLine(0);
        run.customer = run.lines[0].customers.length - 1;
        run.lines[0].customers[0].stars = 3;
        window.__game.game.reset('results');
      });
      await api.step(150);
      await api.press(0, { action: true }, 1, 2);
      const s = await api.summary();
      assert(s.screen === 'stage' && s.top.closed === true, `the last customer of the last line hands results to the closed board (on ${s.screen}, closed ${s.top.closed})`);
      assert(s.run.dayComplete === true && s.run.linesServed === s.run.lines.length && s.run.phase === 'closed', `the day is complete (${s.run.linesServed} of ${s.run.lines.length}, ${s.run.phase})`);
      assert(s.run.lines[0].served === true && s.run.lines[0].customers.every((c) => !c.endsWith(':0')), `every customer in it carries stars (${s.run.lines[0].customers.join()})`);
    });
  },
};
