// Desync canary for lockstep netcode (docs/MULTIPLAYER.md). Ported from the sibling game's checksum.js;
// the hashing helpers are verbatim, the body is this game's simulation.
//
// Peers exchange this hash every N frames (net/lockstep.js checksumEvery). It must have ZERO false
// positives: two correctly synchronised peers must never disagree, or the session ends for no reason.
//
// Two traps, both handled below:
//   -0 and 0 are numerically equal but have different bit patterns, and -0 arises easily from
//     multiplying a speed by zero (a truck coasting to a halt). Hashing raw bits would report a
//     desync that is not one.
//   NaN has many bit patterns. Any NaN is normalised to one sentinel.
//
// What is hashed is exactly the simulation: the rng stream, the frame counter, every field of game.run
// (the only cross-screen state, game/run.js) and whatever the top screen says can diverge through its
// checksumFields(). Nothing visual is ever hashed: a backdrop layer, a particle or a camera may differ
// between peers and must not trip the canary.

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/** FNV-1a over a uint32. */
export function mix(h, v) {
  h ^= v & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 8) & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 16) & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 24) & 0xff; h = Math.imul(h, 16777619);
  return h >>> 0;
}

/** Hash a number by its exact bits, with -0 and NaN normalised so equal values always hash equally. */
export function mixNum(h, n) {
  if (Number.isNaN(n)) return mix(h, 0x7ff80000);
  f64[0] = n === 0 ? 0 : n;                  // n === 0 is true for both 0 and -0
  return mix(mix(h, u32[0]), u32[1]);
}

/** Hash a string, length-prefixed so 'AB','C' cannot collide with 'A','BC'. */
export function mixStr(h, s) {
  h = mix(h, s.length);
  for (let i = 0; i < s.length; i++) h = mix(h, s.charCodeAt(i));
  return h;
}

/**
 * Hash any simulation field. Several of this game's fields are STRINGS (run.truck.at is a place id,
 * party critters are cast ids), so a number-only path would silently hash a constant and make them
 * invisible to the canary. Each type is tagged so 0, '', false and null cannot collide.
 */
export function mixAny(h, v) {
  if (v === undefined || v === null) return mix(h, 0);
  if (typeof v === 'number') return mixNum(h, v);
  if (typeof v === 'string') return mixStr(mix(h, 1), v);
  if (typeof v === 'boolean') return mix(h, v ? 2 : 3);
  return mix(h, 4);
}

/**
 * Hash the simulation state of the game: rng stream, frame counter, the run, and the top screen.
 * @param {any} game the Game shell ({ rng, frame, run, screen, fade })
 * @returns {number} uint32
 */
export function runChecksum(game) {
  let h = 2166136261 >>> 0;
  // rng.state is the highest-signal field. mulberry32 advances by a fixed constant per draw
  // (engine/rng.js), so it is effectively a call counter: if two peers ever take a different branch
  // that consumes randomness, this diverges immediately, one frame before positions do.
  h = mix(h, (game.rng ? game.rng.state : 0) >>> 0);
  h = mix(h, (game.frame | 0) >>> 0);
  // game.fade is deliberately NOT hashed: a fade the lobby started on one peer (the host's fade into
  // the match) may still be fading back in over that peer's first lockstep frames, which is visual
  // only. session.js applyStart cancels any fade-OUT instead, since that one blocks the update.
  const run = game.run;
  if (run) {
    h = mix(h, 1);
    h = mixNum(h, run.seed); h = mix(h, run.stage | 0); h = mix(h, run.served | 0);
    // the day's card: which stages have been served and at how many stars, so a peer that banked a different
    // rating - or a board that picked a different stage - is caught on the frame it happens
    const stages = run.stages || [];
    h = mix(h, stages.length);
    for (const st of stages) h = mix(h, st.stars | 0);
    h = mixNum(h, run.score); h = mix(h, run.frame | 0);
    const order = run.order || { needs: [] };
    h = mixAny(h, order.id);
    h = mix(h, order.needs.length);
    for (const n of order.needs) { h = mixAny(h, n.id); h = mixNum(h, n.amount); h = mixNum(h, n.have); }
    const t = run.truck || {};
    h = mixNum(h, t.x); h = mixNum(h, t.y); h = mixNum(h, t.heading); h = mixAny(h, t.at);
    const party = run.party || [];
    h = mix(h, party.length);
    for (const p of party) { h = mix(h, p.slot | 0); h = mixAny(h, p.critter); h = mixNum(h, p.score); }
  } else h = mix(h, 0);
  // The screen id catches the coarsest split of all - one peer on the orchard while another is still
  // driving - and its checksumFields() the state inside it (docs/ARCHITECTURE.md section 5).
  const top = game.screen;
  h = mixAny(h, top ? top.id : null);
  if (top && typeof top.checksumFields === 'function') {
    const fields = top.checksumFields() || [];
    h = mix(h, fields.length);
    for (let i = 0; i < fields.length; i++) h = mixAny(h, fields[i]);
  }
  return h >>> 0;
}
