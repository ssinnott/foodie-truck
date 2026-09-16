// The cast registry: every playable critter (docs/GDD.md section 2). Order here is the cast index the START
// packet and ?critters= use, so append, never reorder.
// STUB: a generic bear-shaped critter so the rig can be looked at; the real cast lands with the art pass.
import { critterBuild, makeCritterAnims } from './common.js';

const GENERIC = {
  id: 'generic', name: 'CRITTER', fullName: 'A Generic Critter', role: 'STAND-IN', species: 'bear',
  build: critterBuild({ ears: 'round', tail: 'stub', palette: {} }),
  anims: makeCritterAnims(),
};

export const CRITTERS = [GENERIC];
export function getCritter(id) { return CRITTERS.find((c) => c.id === id) || CRITTERS[0]; }
