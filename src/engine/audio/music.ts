// This game's soundtrack (docs/GDD.md section 11): nine tracks as data, a key, a chord loop and channels with step
// patterns, played by the library's pattern sequencer (src/lib/audio/sequencer.ts) through engine/audio.ts. The
// instruments the countryside needed that the sibling game's did not (accordion, marimba, flute, bell, the
// plucked bass, the woodblock and shaker drums) are in the sequencer now, by name.
import type { Track } from '../../lib/audio/sequencer.ts';

// The sequencer itself, for a tool that walks the tracks without a browser.
export { compileTrack, stepTime, scheduleSteps, renderTrack } from '../../lib/audio/sequencer.ts';
export type { Track, Channel } from '../../lib/audio/sequencer.ts';

// ---- track data ----
// Every track is four bars of 4/4 (the pond waltzes in 3), one chord a bar, and every lead below is written out
// to exactly that length: sixteen steps a bar, twelve for the waltz. A pattern that is not a whole number of bars
// warns in compileTrack, and tools/scenarios/audio.js fails the playtest on the warning.
//
// The whole soundtrack is major-key and mid-tempo. The one shape it shares is the truck's rising sixth (1 - 3 - 5 - 6
// of the key), written out in the leads: it opens the title lead, ends the drive lead, and is what the results play
// three times over.

/** TITLE: the parked truck at dusk. A music box over a squeezebox, unhurried. */
const TITLE_LEAD = `G4:2 B4:2 D5:2 E5:4 D5:2 B4:2 G4:2 | E4:2 G4:2 A4:2 C5:4 A4:2 G4:2 E4:2 |
  E4:2 G4:2 B4:2 E5:4 D5:2 B4:2 G4:2 | A4:2 B4:2 C5:2 D5:4 F#5:2 A5:2 -:2`;
/** BOARD: the day's plan on paper. Slow, a whistle reading it out over an organ. */
const BOARD_LEAD = `E5:4 D5:2 C5:2 D5:8 | F5:4 E5:2 D5:2 C5:8 | C5:2 E5:2 A5:4 G5:4 E5:4 | D5:4 E5:2 D5:2 B4:8`;
/** DRIVE: the lane between landmarks. An oompah squeezebox under a whistle, the wheels in the shaker. */
const DRIVE_LEAD = `D5:2 F#5:2 A5:2 F#5:2 D5:2 E5:2 F#5:4 | G5:2 B5:2 D6:2 B5:2 G5:2 A5:2 B5:4 |
  B4:2 D5:2 F#5:2 D5:2 B4:2 C#5:2 D5:4 | E5:2 F#5:2 G5:2 A5:2 C#6:2 A5:2 E5:4`;
/** GATHER: the land mini-games. Marimba over a plucked bass, a woodblock keeping the forty seconds. */
const GATHER_LEAD = `F5:1 A5:1 C6:2 A5:2 F5:2 G5:2 A5:2 G5:2 F5:2 | D5:1 F5:1 Bb5:2 F5:2 D5:2 F5:2 G5:2 F5:2 D5:2 |
  E5:1 G5:1 C6:2 G5:2 E5:2 G5:2 A5:2 G5:2 E5:2 | F5:2 G5:2 A5:2 C6:2 A5:4 F5:4`;
/** POND: the millpond. A waltz in 3, a flute over a pad, water in the shaker. */
const POND_LEAD = `C#5:3 E5:3 A5:6 | F#5:3 E5:3 D5:6 | A4:3 C#5:3 F#5:6 | G#5:3 F#5:3 E5:6`;
/** LINE: the queue at dusk. The title's squeezebox with a plucked tune over it, swung. */
const LINE_LEAD = `B4:2 D5:2 G5:4 F#5:2 E5:2 D5:4 | E5:2 G5:2 B5:4 A5:2 G5:2 E5:4 |
  C5:2 E5:2 G5:4 A5:2 G5:2 E5:4 | D5:2 F#5:2 A5:4 C6:2 A5:2 F#5:4`;
/** KITCHEN: the order on the pass. Quick, a harpsichord running over organ stabs, the clock ticking in the drums. */
const KITCHEN_LEAD = `E5:1 G5:1 C6:2 B5:1 A5:1 G5:2 E5:1 G5:1 A5:2 G5:2 E5:2 | C5:1 E5:1 A5:2 G5:1 E5:1 C5:2 E5:1 G5:1 A5:2 B5:2 C6:2 |
  F5:1 A5:1 C6:2 A5:1 F5:1 A5:2 C6:1 D6:1 C6:2 A5:2 F5:2 | G5:1 B5:1 D6:2 B5:1 G5:1 D6:2 F6:2 E6:2 D6:2 B5:2`;
/** RESULTS: the customer eats. Bells over brass, the motif three times and a bow. */
const RESULTS_LEAD = `D5:2 F#5:2 A5:2 B5:6 A5:2 F#5:2 | G5:2 B5:2 D6:2 E6:6 D6:2 B5:2 |
  A5:2 C#6:2 E6:2 F#6:4 E6:2 C#6:2 A5:2 | D6:4 A5:4 F#5:4 D5:4`;
/** CLOSING: the truck shut for the night. The title tune slowed to a lullaby over a drone. */
const CLOSING_LEAD = `D5:4 B4:4 G4:8 | E5:4 C5:4 G4:8 | D5:4 B4:4 G4:4 A4:4 | B4:12 -:4`;

const OOMPAH = '. chord . chord . chord . chord . chord . chord . chord . chord';
const STABS = 'chord . . chord . . chord . . chord . . chord . . .';

export const TRACKS: Record<string, Track> = {
  title: { name: 'title', bpm: 96, bars: 4, key: 'G', chords: ['G', 'C', 'Em', 'D'], swing: 0.1, channels: [
    { inst: 'accordion', oct: 3, vol: 1, pat: 'chord:16', gate: 0.98 },
    { inst: 'pluck', oct: 5, vol: 1, pat: TITLE_LEAD },
    { inst: 'marimba', oct: 5, vol: 0.5, harmony: true, pat: TITLE_LEAD, transpose: 12 },
    { inst: 'bass_pluck', oct: 2, vol: 0.9, pat: 'r:4 r+7:4 r:4 r+7:4' },
    { inst: 'drums', vol: 0.5, pat: 'x.x.x.x.x.x.x.x.' },
  ] },
  board: { name: 'board', bpm: 84, bars: 4, key: 'C', chords: ['C', 'F', 'Am', 'G'], swing: 0, channels: [
    { inst: 'organ', oct: 3, vol: 0.7, pat: 'chord:16' },
    { inst: 'whistle', oct: 5, vol: 1.1, pat: BOARD_LEAD },
    { inst: 'pluck', oct: 5, vol: 0.7, harmony: true, pat: BOARD_LEAD, transpose: -12 },
    { inst: 'bass_pluck', oct: 2, vol: 0.9, pat: 'r:8 r+7:8' },
    { inst: 'drums', vol: 0.5, pat: 'w.......w.......' },
    { inst: 'drums', vol: 0.4, pat: '....x.......x...' },
  ] },
  drive: { name: 'drive', bpm: 128, bars: 4, key: 'D', chords: ['D', 'G', 'Bm', 'A'], channels: [
    { inst: 'bass_square', oct: 2, vol: 1, pat: 'r . r+12 . r . r+7 . r . r+12 . r . r+7 .' },
    { inst: 'accordion', oct: 4, vol: 0.9, pat: OOMPAH, gate: 0.6 },
    { inst: 'whistle', oct: 5, vol: 1.1, pat: DRIVE_LEAD },
    { inst: 'pluck', oct: 4, vol: 0.8, harmony: true, pat: DRIVE_LEAD, transpose: -5 },
    { inst: 'drums', vol: 0.8, pat: 'K.x.S.x.K.x.S.xx' },
  ] },
  gather: { name: 'gather', bpm: 120, bars: 4, key: 'F', chords: ['F', 'Bb', 'C', 'F'], channels: [
    { inst: 'bass_pluck', oct: 2, vol: 1, pat: 'r:2 . . r+7:2 . . r:2 . . r+7:2 . .' },
    { inst: 'marimba', oct: 5, vol: 1, pat: GATHER_LEAD },
    { inst: 'pluck', oct: 5, vol: 0.7, harmony: true, pat: GATHER_LEAD, transpose: -5 },
    { inst: 'accordion', oct: 3, vol: 0.5, pat: 'chord:16' },
    { inst: 'drums', vol: 0.7, pat: 'w.x.w.x.w.x.w.xx' },
    { inst: 'drums', vol: 0.7, pat: 'K.......K.......' },
  ] },
  pond: { name: 'pond', bpm: 88, bars: 4, beats: 3, key: 'A', chords: ['A', 'D', 'F#m', 'E'], swing: 0, channels: [
    { inst: 'pad', oct: 3, vol: 1, pat: 'chord:12', wide: 10 },
    { inst: 'flute', oct: 5, vol: 1, pat: POND_LEAD },
    { inst: 'bell', oct: 5, vol: 0.5, harmony: true, pat: POND_LEAD, transpose: 12 },
    { inst: 'bass_pluck', oct: 2, vol: 0.8, pat: 'r:6 r+7:6' },
    { inst: 'drums', vol: 0.5, pat: 'w..x..x.....' },
  ] },
  line: { name: 'line', bpm: 92, bars: 4, key: 'G', chords: ['G', 'Em', 'C', 'D7'], swing: 0.12, channels: [
    { inst: 'accordion', oct: 3, vol: 0.9, pat: 'chord:16' },
    { inst: 'pluck', oct: 5, vol: 1, pat: LINE_LEAD },
    { inst: 'flute', oct: 5, vol: 0.6, harmony: true, pat: LINE_LEAD, transpose: -12 },
    { inst: 'bass_pluck', oct: 2, vol: 0.9, pat: 'r:4 -:4 r+7:4 -:4' },
    { inst: 'drums', vol: 0.5, pat: 'x...x...x...x...' },
  ] },
  kitchen: { name: 'kitchen', bpm: 140, bars: 4, key: 'C', chords: ['C', 'Am', 'F', 'G'], channels: [
    { inst: 'bass_square', oct: 2, vol: 1, pat: 'r . r . r+7 . r . r . r+12 . r+7 . r .' },
    { inst: 'harpsi', oct: 5, vol: 1, pat: KITCHEN_LEAD },
    { inst: 'marimba', oct: 5, vol: 0.7, harmony: true, pat: KITCHEN_LEAD, transpose: -5 },
    { inst: 'organ', oct: 4, vol: 0.5, pat: STABS, gate: 0.7 },
    { inst: 'drums', vol: 0.9, pat: 'K.h.S.h.K.h.S.hh' },
    { inst: 'drums', vol: 0.4, pat: 'T...T...T...T...' },
  ] },
  results: { name: 'results', bpm: 112, bars: 4, key: 'D', chords: ['D', 'G', 'A', 'D'], channels: [
    { inst: 'brass', oct: 3, vol: 1, pat: 'chord:2 . . chord:2 . . chord:2 . . chord:2 . .' },
    { inst: 'bell', oct: 5, vol: 1.1, pat: RESULTS_LEAD },
    { inst: 'pluck', oct: 5, vol: 0.7, harmony: true, pat: RESULTS_LEAD, transpose: -5 },
    { inst: 'bass_tri', oct: 2, vol: 1, pat: 'r:2 . r+7:1 r:2 . r+12:1 r+7:2 . r:1 r+7:2 . r+12:1' },
    { inst: 'drums', vol: 0.9, pat: 'K.h.S.h.K.h.S.hh' },
  ] },
  closing: { name: 'closing', bpm: 72, bars: 4, key: 'G', chords: ['G', 'C', 'G', 'D'], swing: 0, channels: [
    { inst: 'pad', oct: 3, vol: 1, pat: 'chord:16', wide: 12 },
    { inst: 'pluck', oct: 5, vol: 1, pat: CLOSING_LEAD },
    { inst: 'bell', oct: 5, vol: 0.45, harmony: true, pat: CLOSING_LEAD, transpose: 12 },
    { inst: 'drone', oct: 2, vol: 0.8, pat: 'G2:64' },
    { inst: 'drums', vol: 0.6, pat: 'K...............' },
  ] },
};

/** Every track, in the order the game reaches them; the self-test renders each. */
export const CANONICAL_TRACKS: readonly string[] = Object.freeze(['title', 'board', 'drive', 'gather', 'pond', 'line', 'kitchen', 'results', 'closing']);
