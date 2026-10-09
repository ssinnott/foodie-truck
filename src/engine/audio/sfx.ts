// Synthesized SFX library (docs/GDD.md section 11). Each entry is `(ctx, dest, when, { v, p }) => endTime`, pure
// with respect to the context so the same code drives the game and the OfflineAudioContext self-test.
//
// The contract (SfxDef) and the primitives are the engine's (src/lib/audio); the LIBRARY is this game's. Where that one has factions,
// this one has three registers, and every name below sits in one of them:
//   * PAPER AND WOOD - the menus, the stamps, the signs and the truck: woodblocks, a rubber stamp's thud, a
//     sign's rope creak. Short, dry, low. Nothing in a menu rings.
//   * THE GATHER - the mini-games: each catch is a soft body (a basket thump, a pail, a plop) followed by ONE
//     pip, a clean sine a fifth or an octave up, so the +1 the eye reads is the +1 the ear hears whatever the
//     ingredient. The pip is the one bright thing in the register; the rest is cloth, straw, water and wood.
//   * THE KITCHEN - the stations: a knife's tak, a spoon on a bowl, a pan's sizzle, and the bell. The bell is the
//     only long ring in the game, because ringing it is the one thing a whole order builds toward.
// `v` scales volume (already ducked for overlapping plays) and `p` scales pitch, including the +/-4% wobble the
// JITTERED names get so a mashed button does not sound like a machine.
import { osc, noise, ring, am, echo, glass } from '../../lib/audio/synth.ts';
import type { SfxOpts, SfxDef } from '../../lib/audio/sfx.ts';

export type { SfxOpts, SfxDef };

const N = (m: number): number => 440 * Math.pow(2, (m - 69) / 12); // midi -> Hz
const C5 = N(72), E5 = N(76);

// ---- parameterized generators (shared by several names) ----

/** A woodblock: a short triangle knock with a bandpassed click on top. The menu's whole vocabulary. */
interface KnockOpts extends SfxOpts {
  f?: number;
  dur?: number;
  vol?: number;
}
function knock(c: BaseAudioContext, d: AudioNode, t: number, { v, p, f = 900, dur = 0.05, vol = 0.22 }: KnockOpts): number {
  osc(c, d, t, { type: 'triangle', f0: f * p, f1: f * 0.8 * p, dur, vol: vol * v, attack: 0.001 });
  noise(c, d, t, { dur: 0.012, vol: 0.18 * v, type: 'bandpass', f0: 2600 * p, q: 2, attack: 0.0005 });
  return t + dur;
}
/** The +1: one clean sine, then its octave a beat later, both short. Every catch in the game ends on this. */
interface PipOpts extends SfxOpts {
  /** The pip's midi note; the second is an octave up. */
  m?: number;
  vol?: number;
  /** Seconds after `t` the pip starts (after the body it follows). */
  after?: number;
}
function pip(c: BaseAudioContext, d: AudioNode, t: number, { v, p, m = 84, vol = 0.16, after = 0.03 }: PipOpts): number {
  const t0 = t + after;
  osc(c, d, t0, { type: 'sine', f0: N(m) * p, dur: 0.12, vol: vol * v, attack: 0.003 });
  osc(c, d, t0 + 0.07, { type: 'sine', f0: N(m + 12) * p, dur: 0.16, vol: vol * 0.7 * v, attack: 0.003 });
  return t0 + 0.23;
}
/** A soft body hit: lowpassed noise thump with a little sine under it (a basket, a sack, a pail on the ground). */
interface ThumpOpts extends SfxOpts {
  f?: number;
  lp?: number;
  dur?: number;
  vol?: number;
}
function thump(c: BaseAudioContext, d: AudioNode, t: number, { v, p, f = 140, lp = 900, dur = 0.09, vol = 0.32 }: ThumpOpts): number {
  noise(c, d, t, { dur, vol: vol * v, type: 'lowpass', f0: lp * p, f1: lp * 0.35 * p, attack: 0.002 });
  osc(c, d, t, { type: 'sine', f0: f * p, f1: f * 0.6 * p, dur: dur * 0.8, vol: vol * 0.7 * v, attack: 0.002 });
  return t + dur;
}
/** Water: a plop is a sine dropping THEN rising (the bubble), with a splash of bandpassed noise round it. */
interface PlopOpts extends SfxOpts {
  f?: number;
  vol?: number;
  splash?: number;
}
function plop(c: BaseAudioContext, d: AudioNode, t: number, { v, p, f = 420, vol = 0.24, splash = 0.16 }: PlopOpts): number {
  osc(c, d, t, { type: 'sine', f0: f * 0.6 * p, f1: f * 1.6 * p, glide: 0.07, dur: 0.11, vol: vol * v, attack: 0.002 });
  if (splash) noise(c, d, t, { dur: 0.14, vol: splash * v, type: 'bandpass', f0: 2400 * p, f1: 900 * p, q: 1, attack: 0.004 });
  return t + 0.14;
}
/** Rising or falling noise whoosh (a cast, a sign on its ropes, a door). */
interface WhooshOpts extends SfxOpts {
  f0?: number;
  f1?: number;
  dur?: number;
  vol?: number;
  q?: number;
}
function whoosh(c: BaseAudioContext, d: AudioNode, t: number, { v, p, f0 = 300, f1 = 2500, dur = 0.25, vol = 0.3, q = 1.5 }: WhooshOpts): number {
  return noise(c, d, t, { dur, vol: vol * v, type: 'bandpass', f0: f0 * p, f1: f1 * p, q, attack: dur * 0.5, curve: 'exp' });
}
/** Music-box arpeggio of midi notes: the jingles. */
interface ArpOpts extends SfxOpts {
  notes: number[];
  gap?: number;
  dur?: number;
  type?: OscillatorType;
  vol?: number;
  /** Length of the final note; defaults to `dur`. */
  last?: number;
}
function arp(c: BaseAudioContext, d: AudioNode, t: number, { v, p, notes, gap = 0.07, dur = 0.16, type = 'sine', vol = 0.16, last = dur }: ArpOpts): number {
  notes.forEach((m, i) => osc(c, d, t + i * gap, { type, f0: N(m) * p, dur: i === notes.length - 1 ? last : dur, vol: vol * v, attack: 0.004 }));
  return t + (notes.length - 1) * gap + last;
}
/** Steam and hiss: filtered noise with a slow attack (a pan, a kettle, a fuse). */
interface HissOpts extends SfxOpts {
  dur?: number;
  f0?: number;
  f1?: number;
  vol?: number;
  type?: BiquadFilterType;
  attack?: number;
  q?: number;
}
function hiss(c: BaseAudioContext, d: AudioNode, t: number, { v, p, dur = 0.4, f0 = 1500, f1 = 3000, vol = 0.18, type = 'highpass', attack = 0.05, q = 1 }: HissOpts): number {
  return noise(c, d, t, { dur, vol: vol * v, type, f0: f0 * p, f1: f1 * p, q, attack, curve: 'exp' });
}
/** A rubber stamp: a felt thud with a squeak of ink on the way off. */
function stamp(c: BaseAudioContext, d: AudioNode, t: number, { v, p }: SfxOpts): number {
  noise(c, d, t, { dur: 0.07, vol: 0.4 * v, type: 'lowpass', f0: 700 * p, f1: 250 * p, attack: 0.001 });
  osc(c, d, t, { type: 'sine', f0: 110 * p, f1: 60 * p, dur: 0.1, vol: 0.4 * v, attack: 0.002 });
  osc(c, d, t + 0.06, { type: 'triangle', f0: 1800 * p, f1: 2600 * p, dur: 0.05, vol: 0.05 * v, attack: 0.01 });
  return t + 0.12;
}
/** The truck's horn: two detuned squares a third apart through a lowpass, a little rise on the attack. */
function horn(c: BaseAudioContext, d: AudioNode, t: number, { v, p }: SfxOpts, dur = 0.28): number {
  osc(c, d, t, { type: 'square', f0: 300 * p, f1: 330 * p, glide: 0.03, dur, vol: 0.12 * v, attack: 0.02, hold: dur * 0.6, lp: 1400 });
  osc(c, d, t, { type: 'square', f0: 380 * p, f1: 415 * p, glide: 0.03, dur, vol: 0.09 * v, attack: 0.02, hold: dur * 0.6, lp: 1400, detune: 5 });
  return t + dur;
}
/** The bell on the pass: two bright partials with a long tail and a slow tremolo, the one long ring in the game. */
function bell(c: BaseAudioContext, d: AudioNode, t: number, { v, p }: SfxOpts, dur = 1.1): number {
  noise(c, d, t, { dur: 0.01, vol: 0.2 * v, type: 'highpass', f0: 5000 * p, attack: 0.0005 });
  glass(c, d, t, { freqs: [1760 * p, 2637 * p, 4400 * p], detune: 4, dur, vol: 0.12 * v, trem: 4, attack: 0.002 });
  return t + dur;
}

// ---- the library ----
export const SFX_DEFS: Record<string, SfxDef> = {
  // ---- paper and wood: menus, stamps, signs, the truck ----
  menu_move: (c, d, t, o) => knock(c, d, t, { v: o.v, p: o.p, f: 900, dur: 0.045, vol: 0.2 }),
  menu_confirm: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 700, dur: 0.05, vol: 0.22 }); return knock(c, d, t + 0.07, { v: o.v, p: o.p, f: 1050, dur: 0.06, vol: 0.22 }); },
  menu_back: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 1050, dur: 0.05, vol: 0.2 }); return knock(c, d, t + 0.07, { v: o.v, p: o.p, f: 620, dur: 0.06, vol: 0.2 }); },
  pause: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 620, dur: 0.06, vol: 0.22 }); return osc(c, d, t + 0.02, { type: 'sine', f0: E5 * o.p, f1: C5 * o.p, glide: 0.12, dur: 0.16, vol: 0.1 * o.v, attack: 0.01 }); },
  unpause: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 620, dur: 0.06, vol: 0.22 }); return osc(c, d, t + 0.02, { type: 'sine', f0: C5 * o.p, f1: E5 * o.p, glide: 0.12, dur: 0.16, vol: 0.1 * o.v, attack: 0.01 }); },
  /** A seat sits down: a stool scrape and a rising third. */
  join: (c, d, t, o) => { whoosh(c, d, t, { v: o.v, p: o.p, f0: 500, f1: 1400, dur: 0.1, vol: 0.14 }); return arp(c, d, t + 0.04, { v: o.v, p: o.p, notes: [72, 76], gap: 0.08, dur: 0.18, vol: 0.14 }); },
  /** READY stamped on a card, SERVED on a line, ORDER UP on the pass, the star stamp on a receipt: one stamp. */
  stamp: (c, d, t, o) => stamp(c, d, t, o),
  /** A binding took: the stamp with a pip on it. Refused: a dry double knock, no pip. */
  rebind_ok: (c, d, t, o) => { stamp(c, d, t, { v: o.v * 0.8, p: o.p }); return pip(c, d, t, { v: o.v, p: o.p, m: 88, vol: 0.12, after: 0.08 }); },
  rebind_refused: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 420, dur: 0.07, vol: 0.24 }); return knock(c, d, t + 0.09, { v: o.v, p: o.p, f: 380, dur: 0.08, vol: 0.24 }); },
  /** A letter of a host key typed. */
  type: (c, d, t, o) => knock(c, d, t, { v: o.v, p: o.p, f: 1300, dur: 0.03, vol: 0.14 }),
  /** OPEN THE TRUCK: the starter turns over, the engine catches, and a honk for the road. */
  truck_start: (c, d, t, o) => {
    am(c, d, t, { type: 'sawtooth', f0: 60 * o.p, f1: 95 * o.p, glide: 0.5, curve: 'lin', rate: 14, rate1: 30, depth: 0.9, dur: 0.6, vol: 0.2 * o.v, attack: 0.03, hold: 0.4, lp: 700 });
    noise(c, d, t + 0.3, { dur: 0.3, vol: 0.1 * o.v, type: 'lowpass', f0: 400 * o.p, attack: 0.05 });
    return horn(c, d, t + 0.62, { v: o.v * 0.9, p: o.p }, 0.34);
  },
  honk: (c, d, t, o) => horn(c, d, t, o),
  /** Pulling up somewhere: a squeak of brake, the handbrake's ratchet, the engine settling. */
  truck_stop: (c, d, t, o) => {
    osc(c, d, t, { type: 'triangle', f0: 1900 * o.p, f1: 1500 * o.p, dur: 0.14, vol: 0.05 * o.v, attack: 0.03, vib: { rate: 20, depth: 30 } });
    for (let i = 0; i < 4; i++) knock(c, d, t + 0.12 + i * 0.035, { v: o.v * 0.7, p: o.p, f: 500 + i * 60, dur: 0.02, vol: 0.14 });
    return osc(c, d, t, { type: 'sawtooth', f0: 80 * o.p, f1: 40 * o.p, dur: 0.35, vol: 0.12 * o.v, attack: 0.01, lp: 400 });
  },
  /** The wooden sign dropping in on its ropes: a creak on the way down and a knock when it lands. */
  sign_drop: (c, d, t, o) => {
    osc(c, d, t, { type: 'sawtooth', f0: 240 * o.p, f1: 180 * o.p, dur: 0.09, vol: 0.06 * o.v, attack: 0.01, lp: 1200, vib: { rate: 30, depth: 40 } });
    thump(c, d, t + 0.1, { v: o.v, p: o.p, f: 120, lp: 1200, dur: 0.1, vol: 0.34 });
    return knock(c, d, t + 0.1, { v: o.v * 0.8, p: o.p, f: 420, dur: 0.05, vol: 0.18 });
  },
  /** The truck's nose in the river: a plop and a spray. */
  splash: (c, d, t, o) => { plop(c, d, t, { v: o.v, p: o.p * 0.8, f: 300, vol: 0.22, splash: 0.2 }); return hiss(c, d, t + 0.03, { v: o.v, p: o.p, dur: 0.25, f0: 3000, f1: 1200, vol: 0.12, type: 'bandpass', attack: 0.01 }); },
  /** A round's end: the sign (above) is the body; this is the little tune over it, played by the mini-game. */
  round_over: (c, d, t, o) => arp(c, d, t, { v: o.v, p: o.p, notes: [72, 76, 79, 84], gap: 0.09, dur: 0.18, last: 0.5, vol: 0.14, type: 'triangle' }),

  // ---- the gather ----
  /** An apple in the basket: the basket's straw thump and the pip. */
  catch: (c, d, t, o) => { thump(c, d, t, { v: o.v, p: o.p, f: 160, lp: 1400, dur: 0.06, vol: 0.26 }); return pip(c, d, t, { v: o.v, p: o.p }); },
  /** The wormy one: a rubbery boing down, no pip. */
  wormy: (c, d, t, o) => { osc(c, d, t, { type: 'square', f0: 520 * o.p, f1: 180 * o.p, glide: 0.18, dur: 0.22, vol: 0.1 * o.v, attack: 0.005, lp: 1600, vib: { rate: 22, depth: 60 } }); return thump(c, d, t, { v: o.v * 0.7, p: o.p, f: 120, lp: 800, dur: 0.06, vol: 0.2 }); },
  /** The fuse lit in a paw: a hiss that is still going when the bang comes. */
  fuse: (c, d, t, o) => { for (let i = 0; i < 5; i++) osc(c, d, t + 0.04 + i * 0.09, { type: 'square', f0: (2200 + (i * 331) % 700) * o.p, dur: 0.012, vol: 0.05 * o.v, attack: 0.001 }); return hiss(c, d, t, { v: o.v, p: o.p, dur: 0.5, f0: 5000, f1: 6000, vol: 0.12, attack: 0.02 }); },
  /** BOOM: a soft toy boom, more puff than blast - it costs a critter a few seconds and nothing else. */
  boom: (c, d, t, o) => {
    noise(c, d, t, { dur: 0.02, vol: 0.3 * o.v, type: 'bandpass', f0: 1500 * o.p, q: 1, attack: 0.0005 });
    osc(c, d, t, { type: 'sine', f0: 90 * o.p, f1: 30 * o.p, dur: 0.35, vol: 0.5 * o.v, attack: 0.003 });
    return noise(c, d, t, { dur: 0.35, vol: 0.4 * o.v, type: 'lowpass', f0: 1200 * o.p, f1: 150 * o.p, attack: 0.002 });
  },
  /** An apple on the grass: a quiet wet thud. Missed, not punished. */
  splat: (c, d, t, o) => thump(c, d, t, { v: o.v * 0.6, p: o.p, f: 110, lp: 600, dur: 0.07, vol: 0.2 }),
  /** The grub pops up out of its bite hole: a high bubble of a plop, no splash. */
  orchard_pop: (c, d, t, o) => plop(c, d, t, { v: o.v, p: o.p * 1.5, f: 520, vol: 0.18, splash: 0 }),
  /** The grub's raspberry: a puff of air on the P, then a wet buzz - a sawtooth flapped thirty times a second. */
  orchard_pfft: (c, d, t, o) => { noise(c, d, t, { dur: 0.05, vol: 0.14 * o.v, type: 'bandpass', f0: 1600 * o.p, q: 0.8, attack: 0.003 }); return am(c, d, t + 0.04, { type: 'sawtooth', f0: 150 * o.p, f1: 120 * o.p, rate: 30, rate1: 24, depth: 1, dur: 0.45, vol: 0.22 * o.v, attack: 0.01, lp: 1300 }); },
  /** The wormy apple flung over a shoulder: a quick whoosh up and away (its landing is the splat). */
  orchard_fling: (c, d, t, o) => whoosh(c, d, t, { v: o.v, p: o.p, f0: 700, f1: 2600, dur: 0.18, vol: 0.2, q: 1.2 }),
  /** A sooty cough: two dry barks of lowpassed noise, a little sine in each, the second lower. */
  orchard_cough: (c, d, t, o) => { thump(c, d, t, { v: o.v, p: o.p, f: 210, lp: 1500, dur: 0.08, vol: 0.2 }); return thump(c, d, t + 0.15, { v: o.v, p: o.p * 0.85, f: 190, lp: 1300, dur: 0.1, vol: 0.18 }); },
  /** The grub out of Barley's mouth: a tiny squeaky hi, two quick chirps going up. */
  orchard_hi: (c, d, t, o) => { osc(c, d, t, { type: 'triangle', f0: 1300 * o.p, f1: 1500 * o.p, glide: 0.05, dur: 0.07, vol: 0.1 * o.v, attack: 0.004 }); return osc(c, d, t + 0.09, { type: 'triangle', f0: 1600 * o.p, f1: 2100 * o.p, glide: 0.06, dur: 0.1, vol: 0.1 * o.v, attack: 0.004, vib: { rate: 28, depth: 40 } }); },
  /** The float goes out: the line's whoosh and the float's plop. */
  cast: (c, d, t, o) => { whoosh(c, d, t, { v: o.v, p: o.p, f0: 400, f1: 2600, dur: 0.22, vol: 0.2 }); return plop(c, d, t + 0.24, { v: o.v, p: o.p, f: 500, vol: 0.2, splash: 0.12 }); },
  /** The float goes under: a low plop and a wobble. */
  bite: (c, d, t, o) => { plop(c, d, t, { v: o.v, p: o.p * 0.7, f: 380, vol: 0.24, splash: 0.1 }); return osc(c, d, t + 0.05, { type: 'sine', f0: 260 * o.p, f1: 200 * o.p, dur: 0.14, vol: 0.08 * o.v, attack: 0.01, vib: { rate: 14, depth: 50 } }); },
  /** One turn of the reel: a ratchet click. */
  reel: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 1500, dur: 0.02, vol: 0.14 }); return noise(c, d, t, { dur: 0.03, vol: 0.12 * o.v, type: 'bandpass', f0: 3200 * o.p, q: 3, attack: 0.0005 }); },
  /** Landed: the splash on the way out and the pip on the way into the bucket. */
  hook: (c, d, t, o) => { plop(c, d, t, { v: o.v, p: o.p * 1.2, f: 600, vol: 0.2, splash: 0.24 }); whoosh(c, d, t + 0.05, { v: o.v, p: o.p, f0: 800, f1: 3000, dur: 0.2, vol: 0.14 }); return pip(c, d, t, { v: o.v, p: o.p, m: 86, after: 0.3 }); },
  /** A trunk shaken: a rustle of leaves, highpassed noise that swells and falls, replayed while the hold runs. */
  shake: (c, d, t, o) => noise(c, d, t, { dur: 0.22, vol: 0.09 * o.v, type: 'highpass', f0: 2600 * o.p, f1: 3400 * o.p, attack: 0.06 }),
  /** A nut into the basket: a small hard knock and the pip. */
  nut: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 700, dur: 0.04, vol: 0.2 }); return pip(c, d, t, { v: o.v, p: o.p, m: 86, after: 0.05 }); },
  /** The squirrel, indignant on a head: a run of quick square chitters going up. */
  chitter: (c, d, t, o) => { for (let i = 0; i < 5; i++) osc(c, d, t + i * 0.05, { type: 'square', f0: (1400 + i * 120) * o.p, dur: 0.025, vol: 0.05 * o.v, attack: 0.002, lp: 4000 }); return t + 0.3; },
  /** An overloaded nut tree creaking under its crop: two slow sawtooth wobbles through a lowpass, a woody complaint. */
  holt_creak: (c, d, t, o) => { osc(c, d, t, { type: 'sawtooth', f0: 210 * o.p, f1: 165 * o.p, dur: 0.2, vol: 0.06 * o.v, attack: 0.03, lp: 1000, vib: { rate: 22, depth: 30 } }); return osc(c, d, t + 0.14, { type: 'sawtooth', f0: 250 * o.p, f1: 205 * o.p, dur: 0.12, vol: 0.05 * o.v, attack: 0.02, lp: 1100, vib: { rate: 28, depth: 35 } }); },
  /** Its branches groaning as the bar nears the top: a long low creak bending down, a second one under it. */
  holt_groan: (c, d, t, o) => { osc(c, d, t, { type: 'sawtooth', f0: 150 * o.p, f1: 100 * o.p, glide: 0.3, dur: 0.36, vol: 0.08 * o.v, attack: 0.05, lp: 800, vib: { rate: 14, depth: 18 } }); return osc(c, d, t + 0.04, { type: 'sawtooth', f0: 112 * o.p, f1: 82 * o.p, glide: 0.3, dur: 0.32, vol: 0.05 * o.v, attack: 0.05, lp: 600, detune: 7 }); },
  /** The whole crop landing on a head: a soft heavy thump, a rumble, and a long rattle of nuts tumbling off nuts. */
  holt_avalanche: (c, d, t, o) => {
    thump(c, d, t, { v: o.v, p: o.p, f: 90, lp: 700, dur: 0.16, vol: 0.4 });
    noise(c, d, t, { dur: 0.5, vol: 0.14 * o.v, type: 'lowpass', f0: 900 * o.p, f1: 200 * o.p, attack: 0.01 });
    const at = [0, 0.05, 0.08, 0.14, 0.19, 0.23, 0.3, 0.36, 0.45, 0.55];
    for (let i = 0; i < at.length; i++) knock(c, d, t + 0.03 + at[i], { v: o.v * (1 - i * 0.07), p: o.p, f: 760 + ((i * 7) % 5) * 90, dur: 0.03, vol: 0.16 });
    return t + 0.7;
  },
  /** Out of the heap: a cork pop rising, and the nuts skittering off it. */
  holt_pop: (c, d, t, o) => { osc(c, d, t, { type: 'sine', f0: 260 * o.p, f1: 760 * o.p, glide: 0.06, dur: 0.1, vol: 0.2 * o.v, attack: 0.002 }); for (let i = 0; i < 4; i++) knock(c, d, t + 0.06 + i * 0.05, { v: o.v * 0.8, p: o.p, f: 1000 + (i & 1) * 160, dur: 0.025, vol: 0.13 }); return t + 0.3; },
  /** The squirrel scolding from a head: a fast, uneven run of square chitters that climbs and drops back. */
  holt_chatter: (c, d, t, o) => { for (let i = 0; i < 9; i++) osc(c, d, t + i * 0.04 + (i > 4 ? 0.05 : 0), { type: 'square', f0: (1500 + ((i * 3) % 5) * 180) * o.p, dur: 0.022, vol: 0.055 * o.v, attack: 0.002, lp: 4200 }); return t + 0.45; },
  /** A nut brought down on a head: a hollow wooden bonk and a little boing falling away after it. */
  holt_bonk: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 520, dur: 0.06, vol: 0.3 }); return osc(c, d, t + 0.02, { type: 'triangle', f0: 720 * o.p, f1: 260 * o.p, glide: 0.14, dur: 0.22, vol: 0.1 * o.v, attack: 0.004, vib: { rate: 18, depth: 40 } }); },
  /** The pot lid rattling: a run of tinny knocks on an enamel lid, uneven. */
  rattle: (c, d, t, o) => { const at = [0, 0.07, 0.12, 0.2, 0.25, 0.34, 0.42]; for (const a of at) knock(c, d, t + a, { v: o.v, p: o.p, f: 1300, dur: 0.03, vol: 0.14 }); return t + 0.5; },
  /** The oven's flour cloud: a soft puff of lowpassed noise. */
  poof: (c, d, t, o) => noise(c, d, t, { dur: 0.3, vol: 0.16 * o.v, type: 'lowpass', f0: 1200 * o.p, f1: 400 * o.p, attack: 0.01 }),
  /** The shears: two quick high knocks, the blades closing. */
  snip: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 2200, dur: 0.02, vol: 0.18 }); return knock(c, d, t + 0.04, { v: o.v, p: o.p, f: 2600, dur: 0.02, vol: 0.18 }); },
  /** The hedgehog woken: three snuffles of lowpassed noise, and a tiny sneeze on the end. */
  snuffle: (c, d, t, o) => { for (let i = 0; i < 3; i++) noise(c, d, t + i * 0.09, { dur: 0.06, vol: 0.09 * o.v, type: 'lowpass', f0: 900 * o.p, f1: 500 * o.p, attack: 0.01 }); return osc(c, d, t + 0.3, { type: 'square', f0: 1200 * o.p, f1: 600 * o.p, glide: 0.06, dur: 0.07, vol: 0.05 * o.v, attack: 0.002, lp: 3000 }); },
  /** The shears running away with a critter: a volley of four snips, snip-snap, in a rustle of leaves; replayed through the frenzy. */
  terrace_frenzy: (c, d, t, o) => { for (let i = 0; i < 4; i++) knock(c, d, t + i * 0.04, { v: o.v, p: o.p * (1 + (i & 1) * 0.15), f: 2300, dur: 0.018, vol: 0.15 }); return noise(c, d, t, { dur: 0.17, vol: 0.1 * o.v, type: 'bandpass', f0: 2600 * o.p, f1: 1500 * o.p, q: 0.8, attack: 0.02 }); },
  /** TA-DA: the leaves settle on a hedge statue - two notes up, the second held, with a little sparkle on it. */
  terrace_tada: (c, d, t, o) => { arp(c, d, t, { v: o.v, p: o.p, notes: [72, 79], gap: 0.12, dur: 0.12, last: 0.5, vol: 0.15, type: 'triangle' }); return glass(c, d, t + 0.14, { freqs: [2093 * o.p, 3136 * o.p], detune: 6, dur: 0.45, vol: 0.05 * o.v, trem: 7, attack: 0.01 }); },
  /** The hedgehog, curled into a ball, bouncing off a shin: a rubbery boing up, and a soft bump under it. */
  terrace_boing: (c, d, t, o) => { osc(c, d, t, { type: 'square', f0: 220 * o.p, f1: 520 * o.p, glide: 0.06, dur: 0.24, vol: 0.09 * o.v, attack: 0.004, lp: 1800, vib: { rate: 26, depth: 70 } }); return thump(c, d, t, { v: o.v * 0.6, p: o.p, f: 160, lp: 900, dur: 0.05, vol: 0.2 }); },
  /** EEK: a squeak shooting up as the critter leaps with its fur on end. */
  terrace_eek: (c, d, t, o) => osc(c, d, t, { type: 'sine', f0: 900 * o.p, f1: 2200 * o.p, glide: 0.08, dur: 0.2, vol: 0.11 * o.v, attack: 0.004, vib: { rate: 30, depth: 60 } }),
  /** HMPH: the hedgehog's grunt as it glares - a short nasal puff, falling. */
  terrace_hmph: (c, d, t, o) => { noise(c, d, t, { dur: 0.08, vol: 0.08 * o.v, type: 'lowpass', f0: 700 * o.p, f1: 300 * o.p, attack: 0.01 }); return osc(c, d, t + 0.02, { type: 'sawtooth', f0: 210 * o.p, f1: 150 * o.p, glide: 0.1, dur: 0.16, vol: 0.07 * o.v, attack: 0.01, lp: 900 }); },
  /** Leaves brushed aside: a short, low rustle. */
  brush: (c, d, t, o) => noise(c, d, t, { dur: 0.16, vol: 0.12 * o.v, type: 'bandpass', f0: 1800 * o.p, f1: 900 * o.p, q: 0.8, attack: 0.02 }),
  /** The toadstool: a wrinkled-nose 'pooh', a sine sliding down with a wobble on it. */
  pooh: (c, d, t, o) => osc(c, d, t, { type: 'sine', f0: 520 * o.p, f1: 220 * o.p, glide: 0.25, dur: 0.3, vol: 0.1 * o.v, attack: 0.01, vib: { rate: 12, depth: 20 } }),
  /** Two sniffs at the toadstool: short breaths in through the nose on the crouch's two sniffs, the second longer. */
  wood_sniff: (c, d, t, o) => { noise(c, d, t + 0.05, { dur: 0.06, vol: 0.08 * o.v, type: 'highpass', f0: 1800 * o.p, f1: 3000 * o.p, attack: 0.03 }); return noise(c, d, t + 0.17, { dur: 0.1, vol: 0.09 * o.v, type: 'highpass', f0: 2000 * o.p, f1: 3400 * o.p, attack: 0.05 }); },
  /** PEE-YOO: the stink cloud's soft puff, then a nasal 'pee' and a 'yoo' sliding down with a wobble on it. */
  wood_peeyoo: (c, d, t, o) => {
    noise(c, d, t, { dur: 0.3, vol: 0.14 * o.v, type: 'lowpass', f0: 900 * o.p, f1: 250 * o.p, attack: 0.02 });
    osc(c, d, t + 0.08, { type: 'square', f0: 1050 * o.p, f1: 1150 * o.p, dur: 0.1, vol: 0.05 * o.v, attack: 0.01, lp: 2500 });
    return osc(c, d, t + 0.2, { type: 'square', f0: 820 * o.p, f1: 300 * o.p, glide: 0.3, dur: 0.36, vol: 0.06 * o.v, attack: 0.02, lp: 1800, vib: { rate: 9, depth: 35 } });
  },
  /** The vine round an ankle: a slither of leaves and a creak of green wood under it. */
  wood_creep: (c, d, t, o) => { noise(c, d, t, { dur: 0.35, vol: 0.08 * o.v, type: 'bandpass', f0: 900 * o.p, f1: 2200 * o.p, q: 1.2, attack: 0.15 }); return osc(c, d, t + 0.05, { type: 'sawtooth', f0: 180 * o.p, f1: 240 * o.p, dur: 0.3, vol: 0.05 * o.v, attack: 0.08, lp: 900, vib: { rate: 26, depth: 40 } }); },
  /** WHOOP: hauled up the vine - a rising whoosh with a slide whistle going up inside it. */
  wood_whoop: (c, d, t, o) => { whoosh(c, d, t, { v: o.v, p: o.p, f0: 300, f1: 3200, dur: 0.22, vol: 0.22 }); return osc(c, d, t, { type: 'sine', f0: 330 * o.p, f1: 1100 * o.p, glide: 0.2, dur: 0.26, vol: 0.12 * o.v, attack: 0.01 }); },
  /** FLUMP: down into the leaves - a soft thump and a crunch of dry litter over it. */
  wood_flump: (c, d, t, o) => { thump(c, d, t, { v: o.v, p: o.p, f: 100, lp: 700, dur: 0.12, vol: 0.32 }); return noise(c, d, t + 0.01, { dur: 0.28, vol: 0.16 * o.v, type: 'bandpass', f0: 2400 * o.p, f1: 700 * o.p, q: 0.7, attack: 0.005 }); },
  /** The leaves shaken off: three quick rustles, each a little lower. */
  wood_shake: (c, d, t, o) => { for (let i = 0; i < 3; i++) noise(c, d, t + i * 0.08, { dur: 0.07, vol: 0.09 * o.v, type: 'bandpass', f0: (2600 - i * 300) * o.p, q: 0.9, attack: 0.01 }); return t + 0.24; },
  /** The flock across the lane: a bleat, a wobbly square wave that dips and comes back up. */
  baa: (c, d, t, o) => osc(c, d, t, { type: 'square', f0: 330 * o.p, f1: 290 * o.p, glide: 0.2, dur: 0.32, vol: 0.08 * o.v, attack: 0.02, lp: 1500, vib: { rate: 14, depth: 25 } }),
  /** The duck parade: two quacks, a nasal sawtooth each, the second a step lower. */
  quack: (c, d, t, o) => { osc(c, d, t, { type: 'sawtooth', f0: 420 * o.p, f1: 300 * o.p, glide: 0.08, dur: 0.1, vol: 0.07 * o.v, attack: 0.005, lp: 1800 }); return osc(c, d, t + 0.14, { type: 'sawtooth', f0: 380 * o.p, f1: 270 * o.p, glide: 0.08, dur: 0.1, vol: 0.07 * o.v, attack: 0.005, lp: 1800 }); },
  /** A crab's claw on the paw: a hard click and a squawk going down. */
  pinch: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 1900, dur: 0.03, vol: 0.24 }); return osc(c, d, t + 0.04, { type: 'square', f0: 900 * o.p, f1: 380 * o.p, glide: 0.14, dur: 0.18, vol: 0.07 * o.v, attack: 0.004, lp: 2200 }); },
  /** The seventh wave up the sand: a long swell of lowpassed noise that rises, breaks and hisses back. */
  wave: (c, d, t, o) => { noise(c, d, t, { dur: 0.7, vol: 0.2 * o.v, type: 'lowpass', f0: 500 * o.p, f1: 2200 * o.p, attack: 0.35 }); return noise(c, d, t + 0.5, { dur: 0.6, vol: 0.12 * o.v, type: 'highpass', f0: 1800 * o.p, f1: 3500 * o.p, attack: 0.05 }); },
  /** A thorn in the paw: one tiny high tick, and a squeak sliding up after it. */
  prick: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 2600, dur: 0.02, vol: 0.18 }); return osc(c, d, t + 0.04, { type: 'sine', f0: 700 * o.p, f1: 1300 * o.p, glide: 0.1, dur: 0.14, vol: 0.09 * o.v, attack: 0.004 }); },
  /** OW! as the leap goes up: a yelp, a soft square sliding up an octave and tumbling back down. */
  bramble_ow: (c, d, t, o) => { osc(c, d, t, { type: 'square', f0: 480 * o.p, f1: 980 * o.p, glide: 0.07, dur: 0.1, vol: 0.08 * o.v, attack: 0.004, lp: 2400 }); return osc(c, d, t + 0.09, { type: 'square', f0: 980 * o.p, f1: 420 * o.p, glide: 0.2, dur: 0.24, vol: 0.08 * o.v, attack: 0.004, lp: 2000, vib: { rate: 16, depth: 40 } }); },
  /** The pricked bush shaking its leaves out: two swells of highpassed rustle, the second smaller. */
  bramble_rustle: (c, d, t, o) => { noise(c, d, t, { dur: 0.22, vol: 0.12 * o.v, type: 'highpass', f0: 2400 * o.p, f1: 3600 * o.p, attack: 0.03 }); return noise(c, d, t + 0.18, { dur: 0.2, vol: 0.07 * o.v, type: 'highpass', f0: 3000 * o.p, f1: 2400 * o.p, attack: 0.04 }); },
  /** Blowing on the paw: a soft 'fff' of bandpassed breath, swelling in and out. */
  bramble_blow: (c, d, t, o) => noise(c, d, t, { dur: 0.26, vol: 0.09 * o.v, type: 'bandpass', f0: 1300 * o.p, f1: 1000 * o.p, q: 0.7, attack: 0.1 }),
  /** The swollen berry wobbling in the paw: a rubbery tone whose wobble speeds up as it swells. */
  bramble_wobble: (c, d, t, o) => am(c, d, t, { type: 'triangle', f0: 240 * o.p, f1: 330 * o.p, glide: 0.45, curve: 'lin', rate: 7, rate1: 18, depth: 0.85, dur: 0.5, vol: 0.12 * o.v, attack: 0.02, lp: 1600 }),
  /** SPLUT: a soft wet burst - a low squelching plop, a slap of lowpassed noise and a spray falling away. */
  bramble_splut: (c, d, t, o) => {
    plop(c, d, t, { v: o.v, p: o.p * 0.6, f: 300, vol: 0.26, splash: 0 });
    thump(c, d, t, { v: o.v, p: o.p, f: 110, lp: 1500, dur: 0.1, vol: 0.3 });
    return hiss(c, d, t + 0.02, { v: o.v, p: o.p, dur: 0.3, f0: 2600, f1: 700, vol: 0.14, type: 'bandpass', attack: 0.006, q: 0.9 });
  },
  /** MMM: a lick - a wet flick of noise rising - and a contented hum under it. */
  bramble_slurp: (c, d, t, o) => { noise(c, d, t, { dur: 0.1, vol: 0.12 * o.v, type: 'bandpass', f0: 700 * o.p, f1: 2400 * o.p, q: 1.2, attack: 0.01 }); return osc(c, d, t + 0.08, { type: 'triangle', f0: 210 * o.p, f1: 250 * o.p, dur: 0.32, vol: 0.09 * o.v, attack: 0.04, lp: 1200, vib: { rate: 6, depth: 25 } }); },
  /** The juice shaken off like a wet dog: six quick flaps of noise, alternating in pitch. */
  bramble_shake: (c, d, t, o) => { for (let i = 0; i < 6; i++) noise(c, d, t + i * 0.045, { dur: 0.04, vol: (0.1 - i * 0.008) * o.v, type: 'bandpass', f0: (i & 1 ? 2400 : 1500) * o.p, q: 1.2, attack: 0.004 }); return t + 0.3; },
  /** ACHOO: a rising breath of noise, a bark of square wave, and a puff of lowpassed dust after it. */
  sneeze: (c, d, t, o) => { noise(c, d, t, { dur: 0.1, vol: 0.08 * o.v, type: 'highpass', f0: 1200 * o.p, f1: 2400 * o.p, attack: 0.08 }); osc(c, d, t + 0.1, { type: 'square', f0: 520 * o.p, f1: 180 * o.p, glide: 0.1, dur: 0.14, vol: 0.09 * o.v, attack: 0.003, lp: 1800 }); return noise(c, d, t + 0.12, { dur: 0.22, vol: 0.14 * o.v, type: 'lowpass', f0: 1400 * o.p, f1: 300 * o.p, attack: 0.005 }); },
  /** One bee, close: a sawtooth drone with a wobble, swelling in and fading, right at the nose. */
  buzz: (c, d, t, o) => osc(c, d, t, { type: 'sawtooth', f0: 210 * o.p, f1: 240 * o.p, glide: 0.5, dur: 0.6, vol: 0.07 * o.v, attack: 0.12, lp: 1400, vib: { rate: 18, depth: 12 } }),
  /** The curious bee coming round the head: the buzz louder, swooping, swelling and fading as it circles. */
  hive_zoom: (c, d, t, o) => { am(c, d, t, { type: 'sawtooth', f0: 190 * o.p, f1: 250 * o.p, glide: 0.3, curve: 'lin', rate: 6, rate1: 9, depth: 0.7, dur: 0.42, vol: 0.13 * o.v, attack: 0.08, lp: 1700 }); return osc(c, d, t, { type: 'sawtooth', f0: 205 * o.p, f1: 245 * o.p, glide: 0.42, dur: 0.42, vol: 0.05 * o.v, attack: 0.1, lp: 2400, vib: { rate: 22, depth: 18 } }); },
  /** Stiff as a board onto its back: a soft heavy thump with a dull wooden knock in it. */
  hive_flump: (c, d, t, o) => { thump(c, d, t, { v: o.v, p: o.p, f: 95, lp: 650, dur: 0.16, vol: 0.4 }); return knock(c, d, t + 0.01, { v: o.v * 0.8, p: o.p, f: 300, dur: 0.08, vol: 0.2 }); },
  /** Springing back up off the grass: a quick rising boing. */
  hive_boing: (c, d, t, o) => osc(c, d, t, { type: 'triangle', f0: 240 * o.p, f1: 780 * o.p, glide: 0.14, dur: 0.24, vol: 0.12 * o.v, attack: 0.005, vib: { rate: 24, depth: 60 } }),
  /** An overfull skep swelling: a low creaking groan of straw, rising, with a creak on top. */
  hive_groan: (c, d, t, o) => { osc(c, d, t, { type: 'sawtooth', f0: 68 * o.p, f1: 92 * o.p, glide: 0.4, dur: 0.42, vol: 0.13 * o.v, attack: 0.16, lp: 520, vib: { rate: 8, depth: 45 } }); return osc(c, d, t + 0.1, { type: 'sawtooth', f0: 230 * o.p, f1: 200 * o.p, dur: 0.18, vol: 0.04 * o.v, attack: 0.03, lp: 1300, vib: { rate: 30, depth: 50 } }); },
  /** GLOOP: the skep burps its honey - a slow, thick plop with a wet slosh round it. */
  hive_gloop: (c, d, t, o) => { osc(c, d, t, { type: 'sine', f0: 150 * o.p, f1: 70 * o.p, glide: 0.12, dur: 0.16, vol: 0.3 * o.v, attack: 0.004 }); plop(c, d, t + 0.1, { v: o.v, p: o.p * 0.55, f: 300, vol: 0.28, splash: 0.06 }); return noise(c, d, t + 0.02, { dur: 0.34, vol: 0.14 * o.v, type: 'lowpass', f0: 800 * o.p, f1: 180 * o.p, attack: 0.02 }); },
  /** A stuck foot hauling at the honey: a short creak of stretching toffee, replayed while the stick strains. */
  hive_stretch: (c, d, t, o) => osc(c, d, t, { type: 'sawtooth', f0: 150 * o.p, f1: 230 * o.p, glide: 0.16, dur: 0.18, vol: 0.06 * o.v, attack: 0.03, lp: 1100, vib: { rate: 36, depth: 35 } }),
  /** SHLUP: the feet come out of the honey - a sucking pull and a pop. */
  hive_shlup: (c, d, t, o) => { noise(c, d, t, { dur: 0.12, vol: 0.16 * o.v, type: 'bandpass', f0: 500 * o.p, f1: 2200 * o.p, q: 2, attack: 0.05 }); return osc(c, d, t + 0.1, { type: 'sine', f0: 320 * o.p, f1: 980 * o.p, glide: 0.05, dur: 0.09, vol: 0.2 * o.v, attack: 0.002 }); },
  /** The cow's tail across the face: one quick whoosh of air, falling. */
  swish: (c, d, t, o) => whoosh(c, d, t, { v: o.v, p: o.p, f0: 1800, f1: 400, dur: 0.16, vol: 0.2 }),
  /** The broody hen's peck: one hard high knock, dry, and a short squawk after it. */
  peck: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 1500, dur: 0.035, vol: 0.26 }); return osc(c, d, t + 0.05, { type: 'square', f0: 900 * o.p, f1: 1300 * o.p, glide: 0.05, dur: 0.09, vol: 0.06 * o.v, attack: 0.004, lp: 2400 }); },
  /** The hen hops off the nest: two clucks, a wobble of pitch on each, and a flap of noise. */
  cluck: (c, d, t, o) => { osc(c, d, t, { type: 'square', f0: 700 * o.p, f1: 520 * o.p, glide: 0.06, dur: 0.08, vol: 0.06 * o.v, attack: 0.004, lp: 2000, vib: { rate: 30, depth: 40 } }); osc(c, d, t + 0.11, { type: 'square', f0: 760 * o.p, f1: 560 * o.p, glide: 0.06, dur: 0.09, vol: 0.06 * o.v, attack: 0.004, lp: 2000, vib: { rate: 30, depth: 40 } }); return noise(c, d, t + 0.02, { dur: 0.16, vol: 0.06 * o.v, type: 'bandpass', f0: 1800 * o.p, f1: 900 * o.p, q: 0.7, attack: 0.01 }); },
  /** The surprise egg cracking in the paw: one dry tick of shell and a short crackle running after it. */
  coop_crack: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 2400, dur: 0.018, vol: 0.2 }); return noise(c, d, t + 0.01, { dur: 0.07, vol: 0.1 * o.v, type: 'bandpass', f0: 4200 * o.p, f1: 2400 * o.p, q: 2, attack: 0.002 }); },
  /** It hatches: a pop as the top flies off, a crackle of shell, then the chick's first cheep. */
  coop_hatch: (c, d, t, o) => {
    plop(c, d, t, { v: o.v, p: o.p * 1.5, f: 520, vol: 0.24, splash: 0 });
    noise(c, d, t, { dur: 0.09, vol: 0.12 * o.v, type: 'bandpass', f0: 3800 * o.p, f1: 1800 * o.p, q: 1.5, attack: 0.001 });
    osc(c, d, t + 0.16, { type: 'sine', f0: 2500 * o.p, f1: 3300 * o.p, glide: 0.05, dur: 0.07, vol: 0.09 * o.v, attack: 0.004 });
    return osc(c, d, t + 0.26, { type: 'sine', f0: 2700 * o.p, f1: 3600 * o.p, glide: 0.05, dur: 0.09, vol: 0.09 * o.v, attack: 0.004 });
  },
  /** The chick on a head (or hopping off it): two tiny chirps sliding up. */
  coop_cheep: (c, d, t, o) => { osc(c, d, t, { type: 'sine', f0: 2600 * o.p, f1: 3400 * o.p, glide: 0.04, dur: 0.06, vol: 0.08 * o.v, attack: 0.003 }); return osc(c, d, t + 0.09, { type: 'sine', f0: 2800 * o.p, f1: 3700 * o.p, glide: 0.04, dur: 0.07, vol: 0.08 * o.v, attack: 0.003 }); },
  /** The broody hen puffs up: a ruffle of feathers swelling, and a low indignant growl under it. */
  coop_puff: (c, d, t, o) => { noise(c, d, t, { dur: 0.26, vol: 0.12 * o.v, type: 'bandpass', f0: 900 * o.p, f1: 2600 * o.p, q: 0.7, attack: 0.16 }); return osc(c, d, t + 0.06, { type: 'square', f0: 250 * o.p, f1: 210 * o.p, glide: 0.25, dur: 0.32, vol: 0.05 * o.v, attack: 0.03, lp: 900, vib: { rate: 26, depth: 30 } }); },
  /** The flurry: seven hard pecks, uneven, a squawk over them and a flap of feathers. */
  coop_flurry: (c, d, t, o) => {
    const at = [0, 0.04, 0.07, 0.11, 0.15, 0.18, 0.22];
    for (let i = 0; i < at.length; i++) knock(c, d, t + at[i], { v: o.v, p: o.p, f: 1500 + (i % 3) * 180, dur: 0.025, vol: 0.2 });
    osc(c, d, t + 0.03, { type: 'square', f0: 820 * o.p, f1: 1250 * o.p, glide: 0.08, dur: 0.2, vol: 0.06 * o.v, attack: 0.004, lp: 2400, vib: { rate: 34, depth: 60 } });
    return noise(c, d, t, { dur: 0.3, vol: 0.08 * o.v, type: 'bandpass', f0: 1600 * o.p, f1: 800 * o.p, q: 0.7, attack: 0.02 });
  },
  /** The old boot comes up on the line: a hollow rubber thunk with a slosh of water out of it, and no pip at all. */
  boot: (c, d, t, o) => { thump(c, d, t, { v: o.v, p: o.p, f: 90, lp: 500, dur: 0.12, vol: 0.26 }); return noise(c, d, t + 0.1, { dur: 0.28, vol: 0.1 * o.v, type: 'bandpass', f0: 1400 * o.p, f1: 500 * o.p, q: 0.8, attack: 0.03 }); },
  /** The boot turned over pours, and pours: a long gurgling rush with glugs in it, far longer than any boot. */
  pond_gush: (c, d, t, o) => { for (let i = 0; i < 5; i++) plop(c, d, t + 0.05 + i * 0.14, { v: o.v * 0.5, p: o.p * (0.6 + (i % 2) * 0.15), f: 260, vol: 0.14, splash: 0 }); return hiss(c, d, t, { v: o.v, p: o.p, dur: 0.75, f0: 1400, f1: 900, vol: 0.13, type: 'bandpass', attack: 0.04, q: 0.7 }); },
  /** The tiny fish out of the boot: two small wet slaps on the planks and a plip back into the pond. */
  pond_flop: (c, d, t, o) => { knock(c, d, t, { v: o.v * 0.6, p: o.p, f: 900, dur: 0.03, vol: 0.12 }); knock(c, d, t + 0.09, { v: o.v * 0.6, p: o.p, f: 1000, dur: 0.03, vol: 0.12 }); return plop(c, d, t + 0.22, { v: o.v * 0.6, p: o.p * 1.4, f: 500, vol: 0.14, splash: 0.08 }); },
  /** The big one takes the float: the line zings out, a whistle wobbling up over a hiss of line off the reel. */
  pond_zing: (c, d, t, o) => { osc(c, d, t, { type: 'sine', f0: 700 * o.p, f1: 1300 * o.p, glide: 0.3, dur: 0.42, vol: 0.07 * o.v, attack: 0.01, vib: { rate: 16, depth: 70 } }); return noise(c, d, t, { dur: 0.32, vol: 0.06 * o.v, type: 'bandpass', f0: 2800 * o.p, f1: 4200 * o.p, q: 3, attack: 0.02 }); },
  /** Heels skidding on the planks as the big one drags its critter along: a short dry scrape and a knock of wood. */
  pond_skid: (c, d, t, o) => { noise(c, d, t, { dur: 0.09, vol: 0.12 * o.v, type: 'bandpass', f0: 900 * o.p, f1: 600 * o.p, q: 1.5, attack: 0.005 }); return knock(c, d, t + 0.02, { v: o.v * 0.6, p: o.p, f: 380, dur: 0.04, vol: 0.14 }); },
  /** YANKED: the line twangs taut and the critter goes up off the planks with a whoosh. */
  pond_yank: (c, d, t, o) => { osc(c, d, t, { type: 'triangle', f0: 180 * o.p, f1: 90 * o.p, glide: 0.18, dur: 0.22, vol: 0.14 * o.v, attack: 0.002, vib: { rate: 28, depth: 90 } }); return whoosh(c, d, t + 0.04, { v: o.v, p: o.p, f0: 500, f1: 2600, dur: 0.26, vol: 0.22 }); },
  /** SPLOOSH: a whole critter into the pond - a deep plop, a soft thump under it and a long fall of spray. */
  pond_sploosh: (c, d, t, o) => { plop(c, d, t, { v: o.v, p: o.p * 0.5, f: 300, vol: 0.3, splash: 0.24 }); thump(c, d, t, { v: o.v, p: o.p, f: 80, lp: 700, dur: 0.16, vol: 0.32 }); return hiss(c, d, t + 0.05, { v: o.v, p: o.p, dur: 0.55, f0: 3200, f1: 900, vol: 0.16, type: 'bandpass', attack: 0.02 }); },
  /** Under the water: three bubbles coming up, each a little plop higher than the last. */
  pond_blub: (c, d, t, o) => { plop(c, d, t, { v: o.v * 0.7, p: o.p * 0.7, f: 300, vol: 0.18, splash: 0 }); plop(c, d, t + 0.13, { v: o.v * 0.7, p: o.p * 0.85, f: 300, vol: 0.16, splash: 0 }); return plop(c, d, t + 0.24, { v: o.v * 0.7, p: o.p, f: 300, vol: 0.14, splash: 0 }); },
  /** The very small frog on the head: a two-note croak, a buzzy square going down and then up. */
  pond_ribbit: (c, d, t, o) => { osc(c, d, t, { type: 'square', f0: 340 * o.p, f1: 260 * o.p, glide: 0.07, dur: 0.08, vol: 0.07 * o.v, attack: 0.004, lp: 1500, vib: { rate: 40, depth: 60 } }); return osc(c, d, t + 0.12, { type: 'square', f0: 280 * o.p, f1: 360 * o.p, glide: 0.08, dur: 0.1, vol: 0.07 * o.v, attack: 0.004, lp: 1500, vib: { rate: 40, depth: 60 } }); },
  /** The big one into the bucket: a heavy wet thud in the tin and the pip, because it counts. */
  pond_plonk: (c, d, t, o) => { ring(c, d, t, { type: 'triangle', f0: 240 * o.p, modF: 700 * o.p, dur: 0.14, vol: 0.14 * o.v, attack: 0.001 }); thump(c, d, t, { v: o.v, p: o.p, f: 110, lp: 900, dur: 0.12, vol: 0.32 }); return pip(c, d, t, { v: o.v, p: o.p, m: 86, after: 0.08 }); },
  /** Shaking the pond off: a quick run of wet flaps getting smaller, a wet dog's shake. */
  pond_shake: (c, d, t, o) => { for (let i = 0; i < 5; i++) noise(c, d, t + i * 0.06, { dur: 0.05, vol: (0.1 - i * 0.012) * o.v, type: 'bandpass', f0: 1600 * o.p, f1: 1000 * o.p, q: 1, attack: 0.004 }); return t + 0.29; },
  /** The trout drops into the bucket: a tin thump. */
  bucket: (c, d, t, o) => { ring(c, d, t, { type: 'triangle', f0: 320 * o.p, modF: 900 * o.p, dur: 0.1, vol: 0.14 * o.v, attack: 0.001 }); return thump(c, d, t, { v: o.v, p: o.p, f: 150, lp: 1600, dur: 0.07, vol: 0.24 }); },
  /** An egg into the basket: a soft click of shell on straw and the pip. */
  egg: (c, d, t, o) => { knock(c, d, t, { v: o.v * 0.7, p: o.p, f: 1400, dur: 0.02, vol: 0.14 }); thump(c, d, t, { v: o.v, p: o.p, f: 170, lp: 1200, dur: 0.05, vol: 0.18 }); return pip(c, d, t, { v: o.v, p: o.p }); },
  /** One squirt into the pail: a short hiss with a tin ring under it. */
  squirt: (c, d, t, o) => { hiss(c, d, t, { v: o.v, p: o.p, dur: 0.09, f0: 2500, f1: 1200, vol: 0.14, type: 'bandpass', attack: 0.004, q: 1.5 }); return osc(c, d, t + 0.02, { type: 'triangle', f0: 700 * o.p, f1: 640 * o.p, dur: 0.06, vol: 0.05 * o.v, attack: 0.005 }); },
  /** A full pail banked on the rack: the pail's clang and the pip. */
  pail: (c, d, t, o) => { ring(c, d, t, { type: 'square', f0: 260 * o.p, modF: 1450 * o.p, dur: 0.14, vol: 0.14 * o.v, attack: 0.001 }); noise(c, d, t, { dur: 0.015, vol: 0.2 * o.v, type: 'bandpass', f0: 3000 * o.p, q: 2, attack: 0.0005 }); return pip(c, d, t, { v: o.v, p: o.p, after: 0.08 }); },
  /** Flour running into the sack: a granular hush, replayed every few frames while the chute pours. */
  pour: (c, d, t, o) => hiss(c, d, t, { v: o.v, p: o.p, dur: 0.2, f0: 900, f1: 1300, vol: 0.09, type: 'bandpass', attack: 0.06, q: 0.8 }),
  /** A sack tied off: the cloth, the string's snap and the pip. */
  tie: (c, d, t, o) => { thump(c, d, t, { v: o.v, p: o.p, f: 100, lp: 700, dur: 0.08, vol: 0.28 }); knock(c, d, t + 0.09, { v: o.v, p: o.p, f: 1700, dur: 0.02, vol: 0.16 }); return pip(c, d, t, { v: o.v, p: o.p, after: 0.12 }); },
  /** The dipper going in: a slow, sticky draw. */
  dip: (c, d, t, o) => hiss(c, d, t, { v: o.v, p: o.p, dur: 0.3, f0: 700, f1: 400, vol: 0.1, type: 'lowpass', attack: 0.1 }),
  /** Honey landed in a jar: the jar's glassy note and the pip. */
  jar: (c, d, t, o) => { glass(c, d, t, { freqs: [1320 * o.p, 1980 * o.p], detune: 5, dur: 0.35, vol: 0.08 * o.v, trem: 6, attack: 0.004 }); return pip(c, d, t, { v: o.v, p: o.p, m: 86, after: 0.06 }); },
  /** Paws on a carrot top: a rustle of leaves. */
  grip: (c, d, t, o) => hiss(c, d, t, { v: o.v, p: o.p, dur: 0.1, f0: 3500, f1: 2500, vol: 0.12, type: 'bandpass', attack: 0.005, q: 1 }),
  /** One heave on it: a creak of root in earth. */
  heave: (c, d, t, o) => osc(c, d, t, { type: 'sawtooth', f0: 140 * o.p, f1: 200 * o.p, dur: 0.07, vol: 0.06 * o.v, attack: 0.005, lp: 900, vib: { rate: 40, depth: 30 } }),
  /** It comes out: a pop of earth and the pip. */
  root: (c, d, t, o) => { plop(c, d, t, { v: o.v, p: o.p * 0.9, f: 330, vol: 0.2, splash: 0 }); noise(c, d, t, { dur: 0.08, vol: 0.14 * o.v, type: 'lowpass', f0: 1500 * o.p, f1: 400 * o.p, attack: 0.002 }); return pip(c, d, t, { v: o.v, p: o.p, after: 0.1 }); },
  /** The rocket root fires out of the ground: a cork's pop, a bubble of pitch flying up after it, and the rush of air. */
  garden_pop: (c, d, t, o) => { noise(c, d, t, { dur: 0.015, vol: 0.3 * o.v, type: 'bandpass', f0: 2200 * o.p, q: 1.5, attack: 0.0005 }); osc(c, d, t, { type: 'sine', f0: 360 * o.p, f1: 1500 * o.p, glide: 0.09, dur: 0.12, vol: 0.24 * o.v, attack: 0.002 }); return whoosh(c, d, t + 0.03, { v: o.v, p: o.p, f0: 600, f1: 3200, dur: 0.3, vol: 0.14 }); },
  /** ...and coming back down: a slide whistle falling the whole way to the head, with a wobble on it. */
  garden_whistle: (c, d, t, o) => osc(c, d, t, { type: 'sine', f0: 2100 * o.p, f1: 480 * o.p, glide: 0.66, dur: 0.68, vol: 0.09 * o.v, attack: 0.05, hold: 0.5, vib: { rate: 7, depth: 18 } }),
  /** It lands on a head: a hollow wooden bonk with a rubbery boing under it. */
  garden_bonk: (c, d, t, o) => { knock(c, d, t, { v: o.v, p: o.p, f: 520, dur: 0.08, vol: 0.3 }); osc(c, d, t + 0.01, { type: 'triangle', f0: 440 * o.p, f1: 160 * o.p, glide: 0.22, dur: 0.26, vol: 0.14 * o.v, attack: 0.003, vib: { rate: 18, depth: 40 } }); return thump(c, d, t, { v: o.v * 0.6, p: o.p, f: 130, lp: 900, dur: 0.07, vol: 0.2 }); },
  /** The whopper tears out of the bed: a deep pop of earth with the soil coming up after it. */
  garden_uproot: (c, d, t, o) => { plop(c, d, t, { v: o.v, p: o.p * 0.55, f: 300, vol: 0.28, splash: 0 }); osc(c, d, t, { type: 'sine', f0: 120 * o.p, f1: 55 * o.p, dur: 0.25, vol: 0.3 * o.v, attack: 0.004 }); return noise(c, d, t + 0.02, { dur: 0.32, vol: 0.16 * o.v, type: 'lowpass', f0: 1400 * o.p, f1: 300 * o.p, attack: 0.01 }); },
  /** Flat on its back with the whopper on top: one heavy, soft flump. */
  garden_flump: (c, d, t, o) => { thump(c, d, t, { v: o.v, p: o.p, f: 90, lp: 600, dur: 0.18, vol: 0.4 }); return noise(c, d, t + 0.03, { dur: 0.22, vol: 0.12 * o.v, type: 'lowpass', f0: 900 * o.p, f1: 250 * o.p, attack: 0.01 }); },

  // ---- the kitchen ----
  /** The fridge: the door's seal, an item lifted out (a knock on the shelf) and a pip when it lands on the tray. */
  fridge: (c, d, t, o) => { whoosh(c, d, t, { v: o.v, p: o.p, f0: 300, f1: 900, dur: 0.1, vol: 0.14 }); knock(c, d, t + 0.05, { v: o.v, p: o.p, f: 800, dur: 0.04, vol: 0.16 }); return pip(c, d, t, { v: o.v, p: o.p, m: 79, vol: 0.1, after: 0.14 }); },
  /** The knife on the block. */
  chop: (c, d, t, o) => { noise(c, d, t, { dur: 0.012, vol: 0.4 * o.v, type: 'highpass', f0: 2500 * o.p, attack: 0.0005 }); return knock(c, d, t + 0.004, { v: o.v, p: o.p, f: 560, dur: 0.06, vol: 0.28 }); },
  /** The spoon round the bowl, replayed while MIX is held: a scrape with a wooden knock at its end. */
  stir: (c, d, t, o) => { hiss(c, d, t, { v: o.v, p: o.p, dur: 0.14, f0: 1200, f1: 2400, vol: 0.08, type: 'bandpass', attack: 0.04, q: 1.2 }); return knock(c, d, t + 0.13, { v: o.v * 0.6, p: o.p, f: 1100, dur: 0.03, vol: 0.12 }); },
  /** The pan, replayed while STOVE is held: fat spitting. */
  sizzle: (c, d, t, o) => { for (let i = 0; i < 4; i++) noise(c, d, t + 0.01 + i * 0.05, { dur: 0.02, vol: (0.08 + (i % 2) * 0.04) * o.v, type: 'bandpass', f0: (5000 + (i * 733) % 2000) * o.p, q: 2, attack: 0.001 }); return hiss(c, d, t, { v: o.v, p: o.p, dur: 0.24, f0: 4000, f1: 5000, vol: 0.06, attack: 0.02 }); },
  /** The oven, replayed while OVEN is held: a low hum with a tick of hot metal. */
  bake: (c, d, t, o) => { osc(c, d, t, { type: 'sine', f0: 100 * o.p, f1: 104 * o.p, dur: 0.3, vol: 0.09 * o.v, attack: 0.08, hold: 0.1 }); return knock(c, d, t + 0.16, { v: o.v * 0.5, p: o.p, f: 2200, dur: 0.015, vol: 0.1 }); },
  /** A step done: two pips up. PERFECT is the same with a sparkle on top. */
  done: (c, d, t, o) => arp(c, d, t, { v: o.v, p: o.p, notes: [79, 84], gap: 0.07, dur: 0.14, vol: 0.12 }),
  perfect: (c, d, t, o) => { arp(c, d, t, { v: o.v, p: o.p, notes: [79, 84, 88], gap: 0.06, dur: 0.14, last: 0.3, vol: 0.13 }); return glass(c, d, t + 0.12, { freqs: [2637 * o.p, 3951 * o.p], detune: 6, dur: 0.3, vol: 0.05 * o.v, trem: 7, attack: 0.01 }); },
  /** The bell on the pass. */
  bell: (c, d, t, o) => bell(c, d, t, o),
  /** Barley's bite. */
  nom: (c, d, t, o) => { noise(c, d, t, { dur: 0.05, vol: 0.2 * o.v, type: 'bandpass', f0: 1800 * o.p, f1: 600 * o.p, q: 1, attack: 0.002 }); return osc(c, d, t + 0.02, { type: 'triangle', f0: 300 * o.p, f1: 220 * o.p, dur: 0.1, vol: 0.08 * o.v, attack: 0.01 }); },
  /** A chew at the results: a slow one. */
  chew: (c, d, t, o) => { noise(c, d, t, { dur: 0.06, vol: 0.14 * o.v, type: 'lowpass', f0: 1200 * o.p, f1: 500 * o.p, attack: 0.01 }); return osc(c, d, t, { type: 'triangle', f0: 240 * o.p, f1: 200 * o.p, dur: 0.12, vol: 0.06 * o.v, attack: 0.02 }); },
  /** The tip on the counter: coins. */
  coin: (c, d, t, o) => { [0, 0.06, 0.13].forEach((dt, i) => { ring(c, d, t + dt, { type: 'sine', f0: (2200 + i * 300) * o.p, modF: 60 * o.p, dur: 0.16, vol: 0.09 * o.v, attack: 0.001 }); knock(c, d, t + dt, { v: o.v * 0.5, p: o.p, f: 3000 + i * 400, dur: 0.015, vol: 0.1 }); }); return t + 0.3; },
  /** The crew's cheer: a little rising fanfare. */
  cheer: (c, d, t, o) => arp(c, d, t, { v: o.v, p: o.p, notes: [67, 72, 76, 79], gap: 0.08, dur: 0.16, last: 0.45, vol: 0.12, type: 'triangle' }),
  /** A diner in the line waves as they order. */
  hello: (c, d, t, o) => { osc(c, d, t, { type: 'triangle', f0: 520 * o.p, f1: 700 * o.p, glide: 0.06, dur: 0.12, vol: 0.09 * o.v, attack: 0.01, vib: { rate: 24, depth: 30 } }); return osc(c, d, t + 0.13, { type: 'triangle', f0: 640 * o.p, f1: 560 * o.p, glide: 0.08, dur: 0.14, vol: 0.08 * o.v, attack: 0.01, vib: { rate: 24, depth: 30 } }); },
  /** The day's stars, at CLOSING TIME: a slow bell arpeggio with a tail. */
  day_done: (c, d, t, o) => { const e = echo(c, d, { time: 0.14, wet: 0.3, lowpass: 3000, when: t, life: 1.6 }); return arp(c, e, t, { v: o.v, p: o.p, notes: [67, 71, 74, 79, 83], gap: 0.13, dur: 0.4, last: 1.0, vol: 0.1 }); },
};

/** Every name above, in library order; the self-test renders each and fails on a silent or a throwing one. */
export const CANONICAL_SFX: readonly string[] = Object.freeze(Object.keys(SFX_DEFS));

/** Names that get +/-4% random pitch per play, so a mashed button and a run of catches do not sound like a machine. */
export const JITTERED = new Set([
  'catch', 'wormy', 'splat', 'reel', 'egg', 'squirt', 'pour', 'heave', 'chop', 'stir', 'sizzle', 'chew', 'type', 'bite', 'grip', 'nut', 'shake',
]);
