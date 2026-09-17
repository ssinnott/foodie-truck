// The cast registry: every playable critter (docs/GDD.md section 2). Order here is the cast index the START
// packet and ?critters= use, so append, never reorder: 0 Barley, 1 Sorrel, 2 Chicory, 3 Cress.
import barley from './barley.ts';
import sorrel from './sorrel.ts';
import chicory from './chicory.ts';
import cress from './cress.ts';

export const CRITTERS = [barley, sorrel, chicory, cress];
/** A cast member by id; an unknown id gets the first (a run built from a stale START packet still draws). */
export function getCritter(id) { return CRITTERS.find((c) => c.id === id) || CRITTERS[0]; }
