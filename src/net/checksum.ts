// Desync canary for lockstep netcode (docs/MULTIPLAYER.md). The hashing kernel (FNV-1a, the -0 and NaN rules,
// the type tags) is the library's, src/lib/net/checksum.ts; the walk over the run below is this game's.
//
// Peers exchange this hash every N frames (net/lockstep.js checksumEvery). It must have ZERO false
// positives: two correctly synchronised peers must never disagree, or the session ends for no reason.
//
// What is hashed is exactly the simulation: the rng stream, the frame counter, every field of game.run
// (the only cross-screen state, game/run.js) and whatever the top screen says can diverge through its
// checksumFields(). Nothing visual is ever hashed: a backdrop layer, a particle or a camera may differ
// between peers and must not trip the canary.

import { FNV_OFFSET, mix, mixNum, mixAny } from '../lib/net/checksum.ts';

/**
 * Hash the simulation state of the game: rng stream, frame counter, the run, and the top screen.
 * @param {any} game the Game shell ({ rng, frame, run, screen, fade })
 * @returns {number} uint32
 */
export function runChecksum(game) {
  let h = FNV_OFFSET;
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
    h = mixNum(h, run.seed); h = mix(h, run.line | 0); h = mix(h, run.customer | 0); h = mix(h, run.served | 0);
    // the DAY of the week, beside the seed: two peers on different days are cooking different menus off the same
    // seed, and this catches it on the frame the board rolls over rather than when the queues disagree
    h = mix(h, run.day | 0);
    const ws = run.weekStars || [];
    h = mix(h, ws.length);
    for (const v of ws) h = mix(h, v | 0);
    // the day's plan and how far it has got: the menu, every line's place and every customer's stars, so a peer
    // that banked a different rating - or pulled up at a different line - is caught on the frame it happens
    const recipes = run.recipes || [];
    h = mix(h, recipes.length);
    for (const id of recipes) h = mixAny(h, id);
    const lines = run.lines || [];
    h = mix(h, lines.length);
    for (const ln of lines) {
      h = mixAny(h, ln.place); h = mix(h, ln.served ? 1 : 0); h = mix(h, ln.customers.length);
      for (const c of ln.customers) { h = mixAny(h, c.customer); h = mixAny(h, c.recipe); h = mix(h, c.stars | 0); }
    }
    // the shopping list: what has been gathered and what the kitchen has cooked out of it
    const needs = run.needs || [];
    h = mix(h, needs.length);
    for (const n of needs) { h = mixAny(h, n.id); h = mixNum(h, n.amount); h = mixNum(h, n.have); h = mixNum(h, n.used | 0); }
    h = mixNum(h, run.score); h = mix(h, run.frame | 0);
    const order = run.order || { needs: [] };
    h = mixAny(h, order.id); h = mixAny(h, order.customer);
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
