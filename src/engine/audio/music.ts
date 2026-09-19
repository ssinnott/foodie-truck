// Pattern sequencer (docs/GDD.md section 11). Tracks are data: a key, a chord loop and channels with step patterns,
// and the sequencer turns them into oscillators at a time. The sequencer is the sibling game's
// (aether-and-brass engine/audio/music.ts); the instruments it is missing for a countryside and every TRACK are
// this game's. `scheduleSteps` is pure with respect to the context (works on an OfflineAudioContext), so the
// realtime look-ahead scheduler in engine/audio.ts and the offline self-test share the exact same code path.
import { osc, noise, ring, bus, releaseAt } from './synth.ts';

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
/** 'Bb4' | 'C#3' -> midi. */
export function noteMidi(s: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], dim: [0, 3, 6], maj7: [0, 4, 7, 11], sus: [0, 5, 7] };
/** A parsed chord: pitch classes for the root and the bass, and the tones as semitone offsets from the root. */
export interface Chord {
  root: number;
  bass: number;
  tones: number[];
}
/** 'Gm/F#' -> { root: pc, bass: pc, tones: [semitone offsets] }. */
export function parseChord(s: string): Chord {
  const [main, slash] = s.split('/');
  const m = /^([A-G])([#b]?)(.*)$/.exec(main);
  const root = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const tones = QUAL[m[3]] || QUAL[''];
  let bass = root;
  if (slash) { const b = /^([A-G])([#b]?)$/.exec(slash); bass = PC[b[1]] + (b[2] === '#' ? 1 : b[2] === 'b' ? -1 : 0); }
  return { root: ((root % 12) + 12) % 12, bass: ((bass % 12) + 12) % 12, tones };
}

/**
 * The truck's own motif, the rising sixth every track carries somewhere: 1 - 3 - 5 - 6 of the key (a major
 * pentatonic fragment). `mK` in a pattern is the K-th tone of it in the track's key.
 */
const MOTIF = [0, 4, 7, 9];

/** One step of a channel: which step of the pattern it falls on, how many steps it lasts, and its token. */
interface PatternEvent {
  step: number;
  len: number;
  tok: string;
}

/**
 * Pattern tokens (space separated, `|` ignored): `name:len` (len in 16th steps, default 1), `-`/`.` rest,
 * absolute note `Bb4`, `r` chord bass, `cK` chord tone K, `chord` all chord tones, `mK` motif tone K (in the
 * track key), any of those with `+N`/`-N` semitone offsets. Drum patterns are one char per step:
 * K kick, S snare, H hat, h soft hat, O open hat, C clang, T tick, t soft tick, w woodblock, x shaker, . rest.
 */
function parsePattern(pat: string, drums: boolean): { events: PatternEvent[]; len: number } {
  const events: PatternEvent[] = [];
  let step = 0;
  if (drums) {
    for (const ch of pat.replace(/[\s|]/g, '')) { if (ch !== '.') events.push({ step, len: 1, tok: ch }); step++; }
    return { events, len: step };
  }
  for (const raw of pat.split(/\s+/)) {
    if (!raw || raw === '|') continue;
    const [name, l] = raw.split(':');
    const len = l ? Number(l) : 1;
    if (name !== '-' && name !== '.') events.push({ step, len, tok: name });
    step += len;
  }
  return { events, len: step };
}

/** Resolve a melodic token to midi numbers given the chord of the current bar. */
function resolveTok(tok: string, chord: Chord, key: number, oct: number): number[] {
  const m = /^([A-Za-z]+[#b]?\d?|c\d|m\d)([+-]\d+)?$/.exec(tok);
  if (!m) return [];
  const off = m[2] ? Number(m[2]) : 0;
  const name = m[1];
  const base = 12 * (oct + 1);
  const abs = noteMidi(name);
  if (abs !== null) return [abs + off];
  if (name === 'r') return [base + chord.bass + off];
  if (name === 'chord') return chord.tones.map((t) => base + chord.root + t + off);
  if (name[0] === 'c') { const k = Number(name[1]); const t = chord.tones[k % chord.tones.length] + 12 * Math.floor(k / chord.tones.length); return [base + chord.root + t + off]; }
  if (name[0] === 'm') return [base + key + MOTIF[Number(name[1]) % 4] + off];
  return [];
}

/** One channel of a track, as written. */
export interface Channel {
  /** An INST name, or 'drums' for a one-char-per-step drum pattern. */
  inst: string;
  pat: string;
  /** Octave the relative tokens (`r`, `cK`, `chord`, `mK`) sound in; absolute notes ignore it. */
  oct?: number;
  /** Channel gain, 0..~1.2. */
  vol?: number;
  /** Fraction of a step's length a note sounds for. */
  gate?: number;
  /** Semitones this channel is shifted by. */
  transpose?: number;
  /**
   * The HARMONY channel: mixed through the separate gain engine/audio.ts holds at `M.intensity`, so a track's
   * second voice can be pulled up or down without touching its data. Every track carries exactly one.
   */
  harmony?: boolean;
  /** Semitones the channel climbs per loop of the track (a slow build). */
  rise?: number;
  /** Cents the pad's outer voices are spread by. */
  wide?: number;
}
/** A track, as written: tempo, meter, key, the chord loop and the channels. */
export interface Track {
  name: string;
  bpm: number;
  key: string;
  chords: string[];
  channels: Channel[];
  /** Beats per bar (4). */
  beats?: number;
  /** Bars per loop (8): the chord list is spread evenly over them. */
  bars?: number;
  /** Fraction of a step the off-steps are pushed late (0.08). */
  swing?: number;
  /** compileTrack's cache. */
  _c?: CompiledTrack;
}
/** A compiled channel: the channel plus its parsed pattern. */
interface CompiledChannel extends Channel {
  events: PatternEvent[];
  len: number;
  drums: boolean;
}
/** The derived data compileTrack builds once per track. */
export interface CompiledTrack {
  beats: number;
  bars: number;
  stepsPerBar: number;
  total: number;
  chords: Chord[];
  channels: CompiledChannel[];
  key: number;
  stepDur: number;
  swing: number;
}
/** What an instrument is handed per note. */
interface NoteOpts {
  f: number;
  dur: number;
  vel: number;
  ch: Channel;
}
type Instrument = (c: BaseAudioContext, d: AudioNode, t: number, n: NoteOpts) => void;
type Drum = (c: BaseAudioContext, d: AudioNode, t: number, v: number) => void;

// ---- instruments: (ctx, dest, when, { f, dur, vel, ch }) ----
const INST: Record<string, Instrument> = {
  bass_square: (c, d, t, { f, dur, vel }) => { osc(c, d, t, { type: 'square', f0: f, dur, vol: 0.18 * vel, attack: 0.004, hold: dur * 0.5, lp: 900 }); osc(c, d, t, { type: 'sine', f0: f, dur, vol: 0.12 * vel, attack: 0.004, hold: dur * 0.5 }); },
  bass_tri: (c, d, t, { f, dur, vel }) => osc(c, d, t, { type: 'triangle', f0: f, dur, vol: 0.3 * vel, attack: 0.006, hold: dur * 0.6 }),
  /** An upright's thump: a sine with a felt attack and a short life whatever the note's length. */
  bass_pluck: (c, d, t, { f, dur, vel }) => { const dd = Math.min(dur, 0.4); osc(c, d, t, { type: 'sine', f0: f, dur: dd, vol: 0.32 * vel, attack: 0.008 }); osc(c, d, t, { type: 'triangle', f0: f, dur: dd * 0.5, vol: 0.1 * vel, attack: 0.004, lp: 600 }); },
  lead_saw: (c, d, t, { f, dur, vel }) => osc(c, d, t, { type: 'sawtooth', f0: f, dur, vol: 0.11 * vel, attack: 0.01, hold: dur * 0.55, lp: 1900, q: 2 }),
  lead_pulse: (c, d, t, { f, dur, vel }) => { osc(c, d, t, { type: 'square', f0: f, dur, vol: 0.07 * vel, attack: 0.01, hold: dur * 0.5, lp: 2600, detune: -6 }); osc(c, d, t, { type: 'square', f0: f, dur, vol: 0.05 * vel, attack: 0.01, hold: dur * 0.5, lp: 2600, detune: 6 }); },
  pad: (c, d, t, { f, dur, vel, ch }) => { const w = ch.wide || 8; [-w, 0, w].forEach((dt, i) => osc(c, d, t, { type: 'triangle', f0: f, dur, vol: 0.06 * vel * (i === 1 ? 1 : 0.8), attack: Math.min(0.25, dur * 0.3), sustain: 0.8, release: Math.min(0.3, dur * 0.3), detune: dt })); },
  organ: (c, d, t, { f, dur, vel }) => { [[1, 0.5], [2, 0.25], [3, 0.12]].forEach(([h, a]) => osc(c, d, t, { type: 'square', f0: f * h, dur, vol: 0.09 * a * vel, attack: 0.02, sustain: 0.85, release: 0.05, lp: 2400 })); },
  pluck: (c, d, t, { f, dur, vel }) => { const dd = Math.min(dur, 0.35); osc(c, d, t, { type: 'sine', f0: f, dur: dd, vol: 0.2 * vel, attack: 0.002 }); osc(c, d, t, { type: 'sine', f0: f * 3, dur: dd * 0.5, vol: 0.05 * vel, attack: 0.002 }); },
  harpsi: (c, d, t, { f, dur, vel }) => { const dd = Math.min(dur, 0.3); osc(c, d, t, { type: 'sawtooth', f0: f, dur: dd, vol: 0.09 * vel, attack: 0.002, hp: 500, detune: -5 }); osc(c, d, t, { type: 'square', f0: f, dur: dd, vol: 0.05 * vel, attack: 0.002, hp: 500, detune: 5 }); },
  whistle: (c, d, t, { f, dur, vel }) => osc(c, d, t, { type: 'square', f0: f, dur, vol: 0.05 * vel, attack: 0.02, hold: dur * 0.5, lp: 3200, vib: { rate: 6, depth: 18 } }),
  brass: (c, d, t, { f, dur, vel }) => osc(c, d, t, { type: 'square', f0: f, dur, vol: 0.07 * vel, attack: 0.025, hold: dur * 0.4, lp: 1500, q: 1.5 }),
  drone: (c, d, t, { f, dur, vel }) => osc(c, d, t, { type: 'sine', f0: f, dur, vol: 0.14 * vel, attack: Math.min(1, dur * 0.2), sustain: 0.9, release: Math.min(0.5, dur * 0.2) }),
  /** A squeezebox: two squares a few cents apart with a slow breath of vibrato, rolled off like reeds. */
  accordion: (c, d, t, { f, dur, vel }) => { osc(c, d, t, { type: 'square', f0: f, dur, vol: 0.045 * vel, attack: 0.04, sustain: 0.85, release: Math.min(0.12, dur * 0.3), lp: 1800, detune: -7, vib: { rate: 5, depth: 6 } }); osc(c, d, t, { type: 'square', f0: f, dur, vol: 0.04 * vel, attack: 0.05, sustain: 0.85, release: Math.min(0.12, dur * 0.3), lp: 1800, detune: 7, vib: { rate: 5.4, depth: 6 } }); },
  /** Wooden bars: a sine and its fourth partial, both gone quickly, the partial first. */
  marimba: (c, d, t, { f, dur, vel }) => { const dd = Math.min(dur, 0.3); osc(c, d, t, { type: 'sine', f0: f, dur: dd, vol: 0.22 * vel, attack: 0.002 }); osc(c, d, t, { type: 'sine', f0: f * 4, dur: dd * 0.25, vol: 0.06 * vel, attack: 0.001 }); noise(c, d, t, { dur: 0.01, vol: 0.06 * vel, type: 'bandpass', f0: 2500, q: 2, attack: 0.0005 }); },
  /** A tin whistle that breathes: a soft sine with a late vibrato and a slow start. */
  flute: (c, d, t, { f, dur, vel }) => { osc(c, d, t, { type: 'sine', f0: f, dur, vol: 0.13 * vel, attack: Math.min(0.06, dur * 0.25), hold: dur * 0.4, vib: { rate: 5.5, depth: 12 } }); osc(c, d, t, { type: 'triangle', f0: f, dur, vol: 0.03 * vel, attack: Math.min(0.06, dur * 0.25), hold: dur * 0.4, lp: 2400 }); },
  /** A small bell: a sine with an inharmonic partial and a long tail, the results' own voice. */
  bell: (c, d, t, { f, dur, vel }) => { const dd = Math.max(dur, 0.5); osc(c, d, t, { type: 'sine', f0: f, dur: dd, vol: 0.14 * vel, attack: 0.002 }); osc(c, d, t, { type: 'sine', f0: f * 2.76, dur: dd * 0.4, vol: 0.04 * vel, attack: 0.001 }); },
};
const DRUMS: Record<string, Drum> = {
  K: (c, d, t, v) => osc(c, d, t, { type: 'sine', f0: 120, f1: 50, glide: 0.08, dur: 0.14, vol: 0.5 * v, attack: 0.002 }),
  S: (c, d, t, v) => { noise(c, d, t, { dur: 0.12, vol: 0.28 * v, type: 'bandpass', f0: 1800, q: 0.8, attack: 0.001 }); osc(c, d, t, { type: 'sine', f0: 190, f1: 110, dur: 0.06, vol: 0.25 * v, attack: 0.001 }); },
  H: (c, d, t, v) => noise(c, d, t, { dur: 0.04, vol: 0.12 * v, type: 'highpass', f0: 7000, attack: 0.001 }),
  h: (c, d, t, v) => noise(c, d, t, { dur: 0.025, vol: 0.06 * v, type: 'highpass', f0: 8000, attack: 0.001 }),
  O: (c, d, t, v) => noise(c, d, t, { dur: 0.12, vol: 0.08 * v, type: 'highpass', f0: 6000, attack: 0.001 }),
  C: (c, d, t, v) => { ring(c, d, t, { type: 'square', f0: 330, modF: 1900, dur: 0.2, vol: 0.16 * v, attack: 0.001 }); noise(c, d, t, { dur: 0.03, vol: 0.2 * v, type: 'bandpass', f0: 4000, q: 2, attack: 0.001 }); },
  T: (c, d, t, v) => { osc(c, d, t, { type: 'square', f0: 2000, dur: 0.012, vol: 0.1 * v, attack: 0.001 }); noise(c, d, t, { dur: 0.008, vol: 0.14 * v, type: 'bandpass', f0: 3000, q: 3, attack: 0.0005 }); },
  t: (c, d, t, v) => osc(c, d, t, { type: 'square', f0: 1600, dur: 0.01, vol: 0.05 * v, attack: 0.001 }),
  /** Woodblock: the menu knock, in time. */
  w: (c, d, t, v) => { osc(c, d, t, { type: 'triangle', f0: 880, f1: 700, dur: 0.045, vol: 0.2 * v, attack: 0.001 }); noise(c, d, t, { dur: 0.01, vol: 0.14 * v, type: 'bandpass', f0: 2600, q: 2, attack: 0.0005 }); },
  /** Shaker: a puff of bandpassed noise. */
  x: (c, d, t, v) => noise(c, d, t, { dur: 0.05, vol: 0.09 * v, type: 'bandpass', f0: 5200, q: 1.2, attack: 0.008 }),
};

/** Build the derived data (parsed patterns, chords, step counts) once per track. */
export function compileTrack(def: Track): CompiledTrack {
  if (def._c) return def._c;
  const beats = def.beats || 4, bars = def.bars || 8;
  const stepsPerBar = beats * 4, total = stepsPerBar * bars;
  const chords = def.chords.map(parseChord);
  const channels = def.channels.map((ch) => {
    const drums = ch.inst === 'drums';
    const p = parsePattern(ch.pat, drums);
    if (p.len % stepsPerBar !== 0 && typeof console !== 'undefined') console.warn(`[audio] track ${def.name || '?'} channel ${ch.inst}: ${p.len} steps is not a whole number of bars (${stepsPerBar})`);
    return { ...ch, events: p.events, len: p.len, drums };
  });
  def._c = { beats, bars, stepsPerBar, total, chords, channels, key: PC[def.key[0]] + (def.key[1] === '#' ? 1 : def.key[1] === 'b' ? -1 : 0), stepDur: 60 / def.bpm / 4, swing: def.swing ?? 0.08 };
  return def._c;
}

/** Absolute time of step `i` (0-based, unbounded; wraps within the loop) for a track started at `start`. */
export function stepTime(track: Track, start: number, i: number): number {
  const c = compileTrack(track);
  return start + i * c.stepDur + (i % 2 ? c.swing * c.stepDur : 0);
}

/** Where the harmony channel goes and how far the whole track is shifted. */
export interface ScheduleOpts {
  harmonyDest?: AudioNode;
  transpose?: number;
}
/**
 * Schedule every step in [from, to) of `track` (started at `start`) into `dest`.
 * `harmonyDest` receives the `harmony: true` channel; `transpose` in semitones.
 * Returns the step index after `to`.
 */
export function scheduleSteps(ctx: BaseAudioContext, dest: AudioNode, track: Track, start: number, from: number, to: number, { harmonyDest = dest, transpose = 0 }: ScheduleOpts = {}): number {
  const c = compileTrack(track);
  for (let i = from; i < to; i++) {
    const pos = i % c.total, loop = Math.floor(i / c.total);
    const bar = Math.floor(pos / c.stepsPerBar);
    const chord = c.chords[Math.floor(bar * c.chords.length / c.bars)];
    const t = stepTime(track, start, i);
    for (const ch of c.channels) {
      const lp = pos % ch.len;
      const d = ch.harmony ? harmonyDest : dest;
      for (const ev of ch.events) {
        if (ev.step !== lp) continue;
        const vel = ch.vol ?? 1;
        if (ch.drums) { const fn = DRUMS[ev.tok]; if (fn) fn(ctx, d, t, vel); continue; }
        const dur = ev.len * c.stepDur * (ch.gate || 0.95);
        const notes = resolveTok(ev.tok, chord, c.key, ch.oct ?? 3);
        const rise = (ch.rise || 0) * loop;
        const fn = INST[ch.inst] || INST.lead_saw;
        for (const m of notes) fn(ctx, d, t, { f: midiHz(m + transpose + (ch.transpose || 0) + rise), dur, vel, ch });
      }
    }
  }
  return to;
}

/** Render `seconds` of a track from time 0 into `dest` (for OfflineAudioContext rendering). */
export function renderTrack(ctx: BaseAudioContext, dest: AudioNode, track: Track, seconds: number, { intensity = 0.6, transpose = 0, start = 0 }: { intensity?: number; transpose?: number; start?: number } = {}): void {
  const c = compileTrack(track);
  const harmonyDest = bus(ctx, dest, { gain: intensity });
  const steps = Math.ceil(seconds / c.stepDur) + 1;
  scheduleSteps(ctx, dest, track, start, 0, steps, { harmonyDest, transpose });
}

// ---- track data ----
// Every track is four bars of 4/4 (the pond waltzes in 3), one chord a bar, and every lead below is written out
// to exactly that length: sixteen steps a bar, twelve for the waltz. A pattern that is not a whole number of bars
// warns in compileTrack, and tools/scenarios/audio.js fails the playtest on the warning.
//
// The whole soundtrack is major-key and mid-tempo. The one shape it shares is the MOTIF above, the truck's rising
// sixth, which opens the title lead, ends the drive lead, and is what the results play three times over.

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
