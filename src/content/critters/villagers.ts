// THE REST OF THE VILLAGE (docs/GDD.md section 2): sixteen more diners to stand in the line with the owl, the otter
// and the goat of customers.ts, so a day's queue is a crowd of different animals and not the same three on repeat.
// Every one is the same chibi rig as the cast, built by critterBuild from a compact spec: a species is a silhouette
// (ears, tail, head and body proportions), a fur palette, one marking on the face and at most one piece of
// headgear or back-piece (villagerParts.ts), so each reads on its own at a squint (docs/ART_STYLE.md section 0).
//
// They are muted village palettes that clear the hatch's plum wall (#4A3038, L .22) by value, they wear the
// off-duty apron (critterRig(def, -1): no seat, no player colour), and they play the cast's own animation table.
//
// Each carries a `map` look as well: the handful of colours and the one cue (ears, a comb, antlers, a shell...) the
// town map's 10 px queue sprites are drawn from (art/backgrounds/map.ts drawDiner), so the figure on the pavement is
// the same animal that reaches the hatch.
//
// ORDER IS DATA: diners.ts lists the ids in the order the day plan deals them. This file only defines them.
import { critterBuild, makeCritterAnims, scarf, cap, bandana, maskMarking, cheekMarking } from './common.ts';
import type { CritterSpec } from './common.ts';
import {
  blazeMarking, patchMarking, tabbyMarking, snoutMarking, bigNose, billMarking, beakAndWattle, buckTeeth,
  sideHorns, antlers, beanie, acornCap, comb, quillCrown, quillBack, shell, paddleTail, bellCollar,
} from './villagerParts.ts';

/** The cues a map sprite can carry on top of its colours (art/backgrounds/map.ts drawDiner reads them). */
export type MapCue = 'none' | 'comb' | 'antlers' | 'quills' | 'bill' | 'shell' | 'snout' | 'horns' | 'mask' | 'tail' | 'beanie' | 'cap' | 'blaze' | 'teeth';
/** The ear a map sprite wears. */
export type MapEars = 'round' | 'point' | 'long' | 'droop' | 'none';

/** A diner's town-map sprite: its fur, dark fur, light fur and cloth, its ears, and one extra cue in `cueHex`. */
export interface MapLook {
  fur: string;
  dark: string;
  cream: string;
  cloth: string;
  ears: MapEars;
  cue: MapCue;
  cueHex: string;
}

const ANIMS = makeCritterAnims();

/** A village diner: a cast entry without the `bio` only the playable critters carry, plus its map sprite. */
function villager(id: string, name: string, fullName: string, role: string, species: string, spec: CritterSpec, map: Partial<MapLook> & { cloth: string }) {
  const pal = spec.palette || {};
  const fur = pal.skin || '#B07A4A';
  const look: MapLook = { fur, dark: pal.hair || '#5A4030', cream: pal.belly || '#F3E5CF', ears: 'round', cue: 'none', cueHex: pal.accent || '#E2B44A', ...map };
  return { id, name, fullName, role, species, colour: fur, build: critterBuild(spec), anims: ANIMS, map: look };
}

const DARK = '#2A1F1A';

// ---------------------------------------------------------------- the fox: a bushy white-tipped tail, white cheeks
export const fox = villager('fox', 'RUSSET', 'Russet Brindle', 'THE CHARMER', 'fox', {
  palette: { skin: '#E8823A', hair: '#3B2418', belly: '#F2E2C6', secondary: '#E8823A', shorts: '#4F6B5A', accent: '#F2E2C6', dark: DARK },
  proportions: { headR: 13, torsoW: 23, torsoH: 17, hip: 18, handR: 4.5, footL: 9 },
  ears: 'point', earTip: true, earPos: { near: { x: 0.34, y: -0.9 }, far: { x: -0.4, y: -0.86 } },
  muzzle: 1.12, markings: cheekMarking, tail: 'bushy',
}, { cloth: '#4F6B5A', ears: 'point', cue: 'tail', cueHex: '#F2E2C6' });

// ---------------------------------------------------------------- the badger: a white blaze down a dark face, a tweed cap
export const badger = villager('badger', 'MR BRACKEN', 'Bracken Underhill', 'THE GRUMBLER', 'badger', {
  palette: { skin: '#75717B', hair: '#2E2B33', belly: '#EDE8DC', secondary: '#75717B', shorts: '#8A4B3A', accent: '#6C7A58', dark: DARK },
  proportions: { headR: 13, torsoW: 26, torsoH: 17, hip: 22, handR: 4.5, footL: 9 },
  ears: 'small', earSlot: 'hair', earPos: { near: { x: 0.5, y: -0.74 }, far: { x: -0.46, y: -0.72 } },
  muzzle: 1.05, markings: blazeMarking, tail: 'stub',
  accessories: [cap('#6C7A58')],
}, { cloth: '#8A4B3A', ears: 'round', cue: 'cap', cueHex: '#6C7A58' });

// ---------------------------------------------------------------- the hedgehog: a crown and a back of dark quills
export const hedgehog = villager('hedgehog', 'PRICKLE', 'Hettie Prickle', 'THE SHY ONE', 'hedgehog', {
  palette: { skin: '#A8909A', hair: '#4F3B2C', belly: '#F0DFC0', secondary: '#A8909A', shorts: '#5E7F6A', accent: '#4F3B2C', dark: DARK },
  proportions: { headR: 11, torsoW: 22, torsoH: 16, hip: 18, handR: 4.2, footL: 8 },
  ears: 'round', earR: 0.3, earPos: { near: { x: 0.45, y: -0.6 }, far: { x: -0.5, y: -0.55 } },
  muzzle: 1.12, tail: 'none',
  accessories: [quillBack('#4F3B2C'), quillCrown('#4F3B2C')],
}, { cloth: '#5E7F6A', ears: 'none', cue: 'quills', cueHex: '#4F3B2C' });

// ---------------------------------------------------------------- the pig: a round pink body and a big flat snout
export const pig = villager('pig', 'TRUFFLE', 'Truffle Hamwell', 'THE FOODIE', 'pig', {
  palette: { skin: '#DE8A84', hair: '#7A3E3C', belly: '#F2C6BE', secondary: '#DE8A84', shorts: '#6B8E5A', accent: '#C77872', dark: '#5A2E2C' },
  proportions: { headR: 13, torsoW: 28, torsoH: 17, hip: 24, handR: 4.6, footL: 9 },
  ears: 'droop', earPos: { near: { x: 0.3, y: -0.66 }, far: { x: -0.36, y: -0.62 } },
  muzzle: 1.18, nose: false, markings: snoutMarking('#C77872'), tail: 'puff',
}, { cloth: '#6B8E5A', ears: 'droop', cue: 'snout', cueHex: '#C77872' });

// ---------------------------------------------------------------- the cow: a pink nose, short horns, a dark patch
export const cow = villager('cow', 'BUTTERCUP', 'Buttercup Meadows', 'THE DAIRY MAID', 'cow', {
  palette: { skin: '#F4EEE2', hair: '#4A3020', belly: '#D8C8A8', secondary: '#F4EEE2', shorts: '#4F6F8A', accent: '#EAD9B4', dark: DARK },
  proportions: { headR: 13, torsoW: 27, torsoH: 17, hip: 22, handR: 4.6, footL: 9 },
  ears: 'round', earR: 0.32, earPos: { near: { x: 0.74, y: -0.4 }, far: { x: -0.78, y: -0.36 } },
  muzzle: 1.15, muzzleHex: '#E8B0A4', markings: patchMarking, tail: 'thin', tailHex: '#4A3020',
  accessories: [sideHorns('#EAD9B4')],
}, { cloth: '#4F6F8A', ears: 'round', cue: 'horns', cueHex: '#EAD9B4' });

// ---------------------------------------------------------------- the squirrel: an enormous tail and an acorn-cup cap
export const squirrel = villager('squirrel', 'NUTKIN', 'Nutkin Hazelwood', 'THE FIDGET', 'squirrel', {
  palette: { skin: '#B8532E', hair: '#3A2216', belly: '#EBD6B4', secondary: '#B8532E', shorts: '#587A8C', accent: '#B98B52', dark: DARK },
  proportions: { headR: 12, torsoW: 21, torsoH: 16, hip: 17, handR: 4.4, footL: 9 },
  ears: 'point', earTip: true, earPos: { near: { x: 0.3, y: -0.92 }, far: { x: -0.34, y: -0.9 } },
  muzzle: 0.95, tail: 'bushy',
  accessories: [acornCap('#B98B52', '#6A4A2C')],
}, { cloth: '#587A8C', ears: 'point', cue: 'tail', cueHex: '#EBD6B4' });

// ---------------------------------------------------------------- the deer: wide ears and branching antlers
export const deer = villager('deer', 'DAPPLE', 'Dapple Glenfield', 'THE GRACEFUL ONE', 'deer', {
  palette: { skin: '#C99B6D', hair: '#6A4A30', belly: '#F4E8D2', secondary: '#C99B6D', shorts: '#3F6B5A', accent: '#8A6A48', dark: DARK },
  proportions: { headR: 12, torsoW: 22, torsoH: 18, hip: 18, handR: 4.4, footL: 9, upperLeg: 7, lowerLeg: 6 },
  ears: 'point', earPos: { near: { x: 0.62, y: -0.58 }, far: { x: -0.72, y: -0.52 } },
  muzzle: 0.98, tail: 'stub', tailHex: '#F4E8D2',
  accessories: [antlers('#9A7A52')],
}, { cloth: '#3F6B5A', ears: 'point', cue: 'antlers', cueHex: '#9A7A52' });

// ---------------------------------------------------------------- the bear: the biggest body in the village, a knitted hat
export const bear = villager('bear', 'BRUIN', 'Bruin Honeywell', 'THE BIG APPETITE', 'bear', {
  palette: { skin: '#4F4A52', hair: '#1F1B22', belly: '#C8A47C', secondary: '#4F4A52', shorts: '#8A3F3A', accent: '#B4483E', dark: DARK },
  proportions: { headR: 14, torsoW: 30, torsoH: 18, hip: 26, handR: 5.2, footL: 10, upperArm: 8, lowerArm: 7 },
  ears: 'round', earR: 0.34, earPos: { near: { x: 0.64, y: -0.78 }, far: { x: -0.62, y: -0.74 } },
  muzzle: 1.1, tail: 'stub',
  accessories: [beanie('#B4483E', '#E8D8B8', '#E8D8B8')],
}, { cloth: '#8A3F3A', ears: 'round', cue: 'beanie', cueHex: '#B4483E' });

// ---------------------------------------------------------------- the raccoon: a bandit's mask and a ringed tail
export const raccoon = villager('raccoon', 'BANDIT', 'Bandit Nightwick', 'THE SNEAKY ONE', 'raccoon', {
  palette: { skin: '#8D8A92', hair: '#2F2C34', belly: '#E8E4DC', secondary: '#8D8A92', shorts: '#5A7A4F', accent: '#2F2C34', dark: DARK },
  proportions: { headR: 13, torsoW: 24, torsoH: 17, hip: 20, handR: 4.6, footL: 9 },
  ears: 'round', earR: 0.36, earPos: { near: { x: 0.5, y: -0.84 }, far: { x: -0.48, y: -0.8 } },
  muzzle: 1.0, markings: maskMarking, tail: 'ring',
}, { cloth: '#5A7A4F', ears: 'round', cue: 'mask', cueHex: '#2F2C34' });

// ---------------------------------------------------------------- the cat: a grey tabby with cheek stripes and a bell
export const cat = villager('cat', 'KIPPER', 'Kipper Whiskerton', 'THE COOL CUSTOMER', 'cat', {
  palette: { skin: '#9AA3AE', hair: '#4A5260', belly: '#EEF0EE', secondary: '#9AA3AE', shorts: '#B0584A', accent: '#E8C04A', dark: DARK },
  proportions: { headR: 12, torsoW: 22, torsoH: 17, hip: 18, handR: 4.4, footL: 9 },
  ears: 'point', earPos: { near: { x: 0.5, y: -0.88 }, far: { x: -0.44, y: -0.84 } },
  muzzle: 0.88, markings: tabbyMarking, tail: 'thin',
  accessories: [bellCollar('#C0443C', '#E8C04A')],
}, { cloth: '#B0584A', ears: 'point', cue: 'tail', cueHex: '#9AA3AE' });

// ---------------------------------------------------------------- the dog: long dark ears and a blue neckerchief
export const dog = villager('dog', 'BISCUIT', 'Biscuit Barkley', 'THE EAGER ONE', 'dog', {
  palette: { skin: '#CC7A4A', hair: '#5A3A22', belly: '#F6ECD8', secondary: '#CC7A4A', shorts: '#4F7FA8', accent: '#4F7FA8', dark: DARK },
  proportions: { headR: 13, torsoW: 24, torsoH: 17, hip: 20, handR: 4.6, footL: 10 },
  ears: 'droop', earSlot: 'hair', earPos: { near: { x: 0.28, y: -0.6 }, far: { x: -0.4, y: -0.55 } },
  muzzle: 1.12, tail: 'stub',
  accessories: [scarf('#4F7FA8')],
}, { cloth: '#4F7FA8', ears: 'droop', cue: 'none' });

// ---------------------------------------------------------------- the hen: a red comb, a beak and a wattle
export const hen = villager('hen', 'MRS CLUCK', 'Henrietta Cluck', 'THE GOSSIP', 'hen', {
  palette: { skin: '#7C8FA6', hair: '#2F3A4A', belly: '#EDE2C8', secondary: '#7C8FA6', shorts: '#6B6F8F', accent: '#C8423C', dark: DARK },
  proportions: { headR: 12, torsoW: 24, torsoH: 17, hip: 20, handR: 4.4, footL: 9 },
  ears: 'none', muzzle: 0.9, nose: false, markings: beakAndWattle('#E2B44A', '#C8423C'), tail: 'puff',
  accessories: [comb('#C8423C')],
}, { cloth: '#6B6F8F', ears: 'none', cue: 'comb', cueHex: '#C8423C' });

// ---------------------------------------------------------------- the duck: a teal body and a wide orange bill
export const duck = villager('duck', 'PUDDLE', 'Puddle Quackerby', 'THE DAWDLER', 'duck', {
  palette: { skin: '#5F8F8A', hair: '#2A3A3A', belly: '#EFE6CF', secondary: '#5F8F8A', shorts: '#A8564A', accent: '#E2A33A', dark: DARK },
  proportions: { headR: 12, torsoW: 24, torsoH: 16, hip: 20, handR: 4.4, footL: 10 },
  ears: 'none', muzzle: 1.0, nose: false, markings: billMarking('#E2A33A'), tail: 'puff',
  accessories: [bandana('#C8554A')],
}, { cloth: '#A8564A', ears: 'none', cue: 'bill', cueHex: '#E2A33A' });

// ---------------------------------------------------------------- the mole: a big pink nose under a yellow hard hat
export const mole = villager('mole', 'VELVET', 'Velvet Burrows', 'THE SQUINTER', 'mole', {
  palette: { skin: '#5B5563', hair: '#2E2A33', belly: '#A39AA8', secondary: '#5B5563', shorts: '#C0883A', accent: '#D9B13E', dark: DARK },
  proportions: { headR: 12, torsoW: 24, torsoH: 16, hip: 20, handR: 5, footL: 9 },
  ears: 'none', muzzle: 1.05, nose: false, markings: bigNose('#E8A0A0'), tail: 'stub',
  accessories: [cap('#D9B13E')],
}, { cloth: '#C0883A', ears: 'none', cue: 'cap', cueHex: '#D9B13E' });

// ---------------------------------------------------------------- the tortoise: a domed shell on the back
export const tortoise = villager('tortoise', 'OLD PEBBLE', 'Pebble Slowcombe', 'THE PATIENT ONE', 'tortoise', {
  palette: { skin: '#8A9A5C', hair: '#4B5A32', belly: '#DCD3A6', secondary: '#8A9A5C', shorts: '#7A5A3A', accent: '#8B6B40', dark: DARK },
  proportions: { headR: 11, torsoW: 26, torsoH: 16, hip: 22, handR: 4.4, footL: 10 },
  ears: 'none', muzzle: 0.92, tail: 'stub',
  accessories: [shell('#8B6B40', '#5A4328')],
}, { cloth: '#7A5A3A', ears: 'none', cue: 'shell', cueHex: '#8B6B40' });

// ---------------------------------------------------------------- the beaver: buck teeth and a flat paddle tail
export const beaver = villager('beaver', 'TIMBER', 'Timber Dammerton', 'THE BUILDER', 'beaver', {
  palette: { skin: '#6B4630', hair: '#4A3220', belly: '#DDC296', secondary: '#6B4630', shorts: '#6E8F4F', accent: '#5A4030', dark: DARK },
  proportions: { headR: 13, torsoW: 24, torsoH: 17, hip: 20, handR: 4.6, footL: 9 },
  ears: 'round', earR: 0.3, earPos: { near: { x: 0.5, y: -0.8 }, far: { x: -0.5, y: -0.76 } },
  muzzle: 1.0, markings: buckTeeth('#F6F0E2'), tail: 'none',
  accessories: [paddleTail('#5A4030', '#2E2016')],
}, { cloth: '#6E8F4F', ears: 'round', cue: 'teeth', cueHex: '#F6F0E2' });

/** Every village diner this file defines, by id (customers.ts merges them with the original three). */
export const VILLAGERS = Object.freeze({ fox, badger, hedgehog, pig, cow, squirrel, deer, bear, raccoon, cat, dog, hen, duck, mole, tortoise, beaver });
