// Pattern sequencer. Tracks are data: a key, a chord loop and channels with step patterns, and the sequencer
// turns them into oscillators at a time. `scheduleSteps` is pure with respect to the context (it works on an
// OfflineAudioContext), so the realtime look-ahead scheduler in ./facade.ts and the offline self-test share the
// exact same code path.
//
// The instruments and drums are the union of what the two games wrote; both sets are pure synth code with no
// art direction in them, so they ship here and a game reaches for whichever it wants by name. A game that needs
// a voice this table does not have adds it with `registerInstrument` / `registerDrum` at import time. The
// TRACKS themselves are a game's own: this module has no track data in it.
import { osc, noise, ring, bus, releaseAt } from './synth.ts';

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
/** 'Bb4' | 'C#3' -> midi. */
export function noteMidi(s: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const QUAL: Record<string, number[]> = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], dim: [0, 3, 6], maj7: [0, 4, 7, 11], sus: [0, 5, 7] };
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
  if (!m) throw new Error(`sequencer: bad chord '${s}'`);
  const root = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const tones = QUAL[m[3]] || QUAL[''];
  let bass = root;
  if (slash) { const b = /^([A-G])([#b]?)$/.exec(slash); if (b) bass = PC[b[1]] + (b[2] === '#' ? 1 : b[2] === 'b' ? -1 : 0); }
  return { root: ((root % 12) + 12) % 12, bass: ((bass % 12) + 12) % 12, tones };
}

/** One step of a channel: which step of the pattern it falls on, how many steps it lasts, and its token. */
interface PatternEvent {
  step: number;
  len: number;
  tok: string;
}

/**
 * Pattern tokens (space separated, `|` ignored): `name:len` (len in 16th steps, default 1), `-`/`.` rest,
 * absolute note `Bb4`, `r` chord bass, `cK` chord tone K, `chord` all chord tones, `mK` motif tone K (in the
 * track key, from the track's `motif`), any of those with `+N`/`-N` semitone offsets. Drum patterns are one
 * char per step: K kick, S snare, H hat, h soft hat, O open hat, C clang, T tick, t soft tick, w woodblock,
 * x shaker, . rest.
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
function resolveTok(tok: string, chord: Chord, key: number, oct: number, motif: readonly number[]): number[] {
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
  if (name[0] === 'm') return motif.length ? [base + key + motif[Number(name[1]) % motif.length] + off] : [];
  return [];
}

/** One channel of a track, as written. */
export interface Channel {
  /** An instrument name, or 'drums' for a one-char-per-step drum pattern. */
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
   * The HARMONY channel: mixed through the separate gain the facade holds at its `intensity`, so a track's
   * second voice can be pulled up or down without touching its data.
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
  /** Semitone offsets the `mK` tokens index, in the track's key. A track without one resolves `mK` to silence. */
  motif?: number[];
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
export interface NoteOpts {
  f: number;
  dur: number;
  vel: number;
  ch: Channel;
}
export type Instrument = (c: BaseAudioContext, d: AudioNode, t: number, n: NoteOpts) => void;
export type Drum = (c: BaseAudioContext, d: AudioNode, t: number, v: number) => void;

// tanh soft clip for bass_dist, built once: the curve is context-independent and a WaveShaper copies what it is given
const DIST_CURVE = Float32Array.from({ length: 256 }, (_, i) => Math.tanh(((i / 127.5) - 1) * 3));

// ---- instruments: (ctx, dest, when, { f, dur, vel, ch }) ----
export const INST: Record<string, Instrument> = {
  bass_square: (c, d, t, { f, dur, vel }) => { osc(c, d, t, { type: 'square', f0: f, dur, vol: 0.18 * vel, attack: 0.004, hold: dur * 0.5, lp: 900 }); osc(c, d, t, { type: 'sine', f0: f, dur, vol: 0.12 * vel, attack: 0.004, hold: dur * 0.5 }); },
  bass_tri: (c, d, t, { f, dur, vel }) => osc(c, d, t, { type: 'triangle', f0: f, dur, vol: 0.3 * vel, attack: 0.006, hold: dur * 0.6 }),
  /** "Distorted": saw + square through a resonant lowpass, clipped by a waveshaper. */
  bass_dist: (c, d, t, { f, dur, vel }) => {
    const sh = c.createWaveShaper(); sh.curve = DIST_CURVE;
    const g = c.createGain(); g.gain.value = 0.26 * vel; sh.connect(g).connect(d);
    osc(c, sh, t, { type: 'sawtooth', f0: f, dur, vol: 0.8, attack: 0.003, hold: dur * 0.5, lp: 700, q: 3 });
    osc(c, sh, t, { type: 'square', f0: f / 2, dur, vol: 0.5, attack: 0.003, hold: dur * 0.5, lp: 400 });
    // the shaper is shared by both oscillators, so neither one's `ended` can own it: it needs its own release, or
    // a track that uses this bass piles up a node pair per sixteenth for as long as it plays
    releaseAt(c, [sh, g], t, dur + 0.05);
  },
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
  /** A small bell: a sine with an inharmonic partial and a long tail. */
  bell: (c, d, t, { f, dur, vel }) => { const dd = Math.max(dur, 0.5); osc(c, d, t, { type: 'sine', f0: f, dur: dd, vol: 0.14 * vel, attack: 0.002 }); osc(c, d, t, { type: 'sine', f0: f * 2.76, dur: dd * 0.4, vol: 0.04 * vel, attack: 0.001 }); },
};
export const DRUMS: Record<string, Drum> = {
  K: (c, d, t, v) => osc(c, d, t, { type: 'sine', f0: 120, f1: 50, glide: 0.08, dur: 0.14, vol: 0.5 * v, attack: 0.002 }),
  S: (c, d, t, v) => { noise(c, d, t, { dur: 0.12, vol: 0.28 * v, type: 'bandpass', f0: 1800, q: 0.8, attack: 0.001 }); osc(c, d, t, { type: 'sine', f0: 190, f1: 110, dur: 0.06, vol: 0.25 * v, attack: 0.001 }); },
  H: (c, d, t, v) => noise(c, d, t, { dur: 0.04, vol: 0.12 * v, type: 'highpass', f0: 7000, attack: 0.001 }),
  h: (c, d, t, v) => noise(c, d, t, { dur: 0.025, vol: 0.06 * v, type: 'highpass', f0: 8000, attack: 0.001 }),
  O: (c, d, t, v) => noise(c, d, t, { dur: 0.12, vol: 0.08 * v, type: 'highpass', f0: 6000, attack: 0.001 }),
  C: (c, d, t, v) => { ring(c, d, t, { type: 'square', f0: 330, modF: 1900, dur: 0.2, vol: 0.16 * v, attack: 0.001 }); noise(c, d, t, { dur: 0.03, vol: 0.2 * v, type: 'bandpass', f0: 4000, q: 2, attack: 0.001 }); },
  T: (c, d, t, v) => { osc(c, d, t, { type: 'square', f0: 2000, dur: 0.012, vol: 0.1 * v, attack: 0.001 }); noise(c, d, t, { dur: 0.008, vol: 0.14 * v, type: 'bandpass', f0: 3000, q: 3, attack: 0.0005 }); },
  t: (c, d, t, v) => osc(c, d, t, { type: 'square', f0: 1600, dur: 0.01, vol: 0.05 * v, attack: 0.001 }),
  /** Woodblock: a knock, in time. */
  w: (c, d, t, v) => { osc(c, d, t, { type: 'triangle', f0: 880, f1: 700, dur: 0.045, vol: 0.2 * v, attack: 0.001 }); noise(c, d, t, { dur: 0.01, vol: 0.14 * v, type: 'bandpass', f0: 2600, q: 2, attack: 0.0005 }); },
  /** Shaker: a puff of bandpassed noise. */
  x: (c, d, t, v) => noise(c, d, t, { dur: 0.05, vol: 0.09 * v, type: 'bandpass', f0: 5200, q: 1.2, attack: 0.008 }),
};

/** Add (or replace) an instrument a game's tracks name. Call at import time, before any track is scheduled. */
export function registerInstrument(name: string, fn: Instrument): void { INST[name] = fn; }
/** Add (or replace) a one-character drum a game's patterns use. */
export function registerDrum(ch: string, fn: Drum): void {
  if (ch.length !== 1 || ch === '.') throw new Error(`sequencer: a drum is one pattern character, not '${ch}'`);
  DRUMS[ch] = fn;
}

/** Build the derived data (parsed patterns, chords, step counts) once per track. */
export function compileTrack(def: Track): CompiledTrack {
  if (def._c) return def._c;
  const beats = def.beats || 4, bars = def.bars || 8;
  const stepsPerBar = beats * 4, total = stepsPerBar * bars;
  const chords = def.chords.map(parseChord);
  const channels = def.channels.map((ch): CompiledChannel => {
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
 * `harmonyDest` receives the `harmony: true` channels; `transpose` in semitones.
 * Returns the step index after `to`.
 */
export function scheduleSteps(ctx: BaseAudioContext, dest: AudioNode, track: Track, start: number, from: number, to: number, { harmonyDest = dest, transpose = 0 }: ScheduleOpts = {}): number {
  const c = compileTrack(track);
  const motif = track.motif || [];
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
        const notes = resolveTok(ev.tok, chord, c.key, ch.oct ?? 3, motif);
        const rise = (ch.rise || 0) * loop;
        const fn = INST[ch.inst] || INST.lead_saw;
        for (const m of notes) fn(ctx, d, t, { f: midiHz(m + transpose + (ch.transpose || 0) + rise), dur, vel, ch });
      }
    }
  }
  return to;
}

/** What `renderTrack` takes: the harmony gain, a shift in semitones and where in the context's time to start. */
export interface RenderOpts {
  intensity?: number;
  transpose?: number;
  start?: number;
}
/** Render `seconds` of a track from time 0 into `dest` (for OfflineAudioContext rendering). */
export function renderTrack(ctx: BaseAudioContext, dest: AudioNode, track: Track, seconds: number, { intensity = 0.6, transpose = 0, start = 0 }: RenderOpts = {}): void {
  const c = compileTrack(track);
  const harmonyDest = bus(ctx, dest, { gain: intensity });
  const steps = Math.ceil(seconds / c.stepDur) + 1;
  scheduleSteps(ctx, dest, track, start, 0, steps, { harmonyDest, transpose });
}
