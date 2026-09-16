// The cast registry: every playable critter (docs/GDD.md section 2). Order here is the cast index the START
// packet and ?critters= use, so append, never reorder.
// STUB: a generic bear-shaped critter so the rig can be looked at; the real cast lands with the art pass.
import { critterBuild, makeCritterAnims } from './common.js';

const GENERIC = {
  id: 'generic', name: 'STAND-IN', fullName: 'A Stand-In Critter', role: 'PLACEHOLDER', species: 'sheep',
  build: critterBuild({ ears: 'small', tail: 'stub', palette: { skin: '#F1E4C8', hair: '#3F3A48', belly: '#8C7A86', secondary: '#3F3A48', shorts: '#3F3A48', accent: '#E2B44A', dark: '#2E2A33' } }),
  anims: makeCritterAnims(),
};

export const CRITTERS = [GENERIC];
export function getCritter(id) { return CRITTERS.find((c) => c.id === id) || CRITTERS[0]; }
