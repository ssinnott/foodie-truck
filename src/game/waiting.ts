// THE LINE, WAITING (docs/GDD.md sections 6, 7 and 10): what each diner in a line does with themselves, and when. A
// screen hands it the line's diners, front first, and FREES each one to it once that diner has nothing else to do -
// on the lane once they have waved their order in, at the hatch while their plate is still cooking, on the lane again
// once the plate is empty and the cheer is done - and from then on it deals each of them a beat of their own
// (content/critters/dinerAnims.ts) after a rest of their own: a sniff at the cooking, a rub of a hungry tummy, up on
// the toes to see, a bounce, a look back down the line, a yawn... - their FAVOURITE three times as often as anything
// else. A CHAT takes two: the diner it is dealt to turns to a neighbour in the same row of the line who is resting
// too (whichever of the two stands on the left turns round to face the other), and they take turns, one talking
// while the other agrees, until the chat is over. Nobody to talk to, and they do something else on their own.
//
// NOTHING HERE IS SIMULATION, as with the friends in the kitchen (kitchenFriends.ts): the chances come off a stream
// of its own (makeRng, salted from the run's seed, day and line and from the screen), never the gameplay rng, and are
// drawn on the fixed step in update(), so every peer deals the same line the same beats; none of it reaches
// checksumFields. A beat the screen plays something else over - the order-taker asking for the diner's order, their
// plate coming through the hatch - is simply over: the diner turns back the way they face and rests again. Everything
// is built in enter(); update() allocates nothing of its own.
import { makeRng } from '../lib/engine/rng.ts';
import type { RngInstance } from '../lib/engine/rng.ts';
import type { AnimPlayer } from '../lib/art/animation.ts';
import { FAVOURITE } from '../content/critters/dinerAnims.ts';
import type { Beat } from '../content/critters/dinerAnims.ts';
import type { Run } from './game.ts';

/** What the beats need of a diner: the player their animations play on, and which way the screen draws them (a beat
 *  that turns them round turns this, and puts it back). */
export interface BeatDiner {
  player: AnimPlayer;
  facing: number;
}

/** What a line on the lane deals (screens/line.ts): every beat. */
export const LINE_BEATS: readonly Beat[] = Object.freeze(['sniff', 'tummy', 'tiptoe', 'bounce', 'look', 'chat', 'dance', 'tap', 'yawn'] as Beat[]);
/** What the line at the hatch deals (screens/kitchen.ts): a bust is the top half of a diner crowded in among the rest,
 *  so nothing that is all feet (the dance, the foot tap) and no chat - and the cooking to sniff at. */
export const HATCH_BEATS: readonly Beat[] = Object.freeze(['sniff', 'tummy', 'tiptoe', 'bounce', 'look', 'yawn'] as Beat[]);
/** What a fed line deals (screens/results.ts): nothing hungry and nothing impatient - a full tummy instead. */
export const FED_BEATS: readonly Beat[] = Object.freeze(['full', 'dance', 'bounce', 'look', 'chat', 'yawn'] as Beat[]);

/** The rest before a diner's first beat once they are freed, and between one beat and the next, in frames. */
const FIRST_MIN = 10, FIRST_MAX = 90, REST_MIN = 60, REST_MAX = 200;
/** A diner whose beat is due while the screen has them doing something else is asked again this much later. */
const RETRY = 20;
/** A chat is TURNS_MIN..TURNS_MAX turns of CHAT_TURN frames, whoever was dealt it first: it keeps two diners busy,
 *  so it is kept short. A turn is two whole loops of `talk` and of `agree` (dinerAnims.ts, 24 frames each, both
 *  opening on the breath's arms), so the two swap on matching keys: tools/art-check.js holds that. */
export const CHAT_TURN = 48;
const TURNS_MIN = 2, TURNS_MAX = 3;
/** The favourite counts this many times over in the deal. */
const FAVOURITE_WEIGHT = 3;
/** The frame event a beat turns the diner round on (dinerAnims.ts `look`), and the way every line faces when nothing
 *  has turned a diner round: left, to the truck's hatch on the lane and into the kitchen at the hatch. */
const TURN_EVENT = 'turn', HOME = -1;
/** Salts for each screen's stream, so the lane, the hatch and the fed line never deal alike off one seed. */
export const LINE_SALT = 0x7a11, HATCH_SALT = 0x4a7c, FED_SALT = 0x3e2d;

/** The stream a screen's beats come off: the run's seed, day and line, and the screen's own salt. */
export function beatSeed(run: Run, salt: number): number {
  return ((((run.seed | 0) ^ salt) + Math.imul(run.day | 0, 7919) + Math.imul(run.line | 0, 104729)) >>> 0) || 1;
}

/** One diner's place in the deal. */
interface Slot {
  /** Their favourite beat ('' when they have none). */
  fav: string;
  /** -1 until the screen frees them; then the frame their next beat is due. */
  due: number;
  /** Beats they have been dealt (a chat counts for both). */
  n: number;
  /** The beat they are in ('' at rest), and the animation it has them playing (a chat's `talk` or `agree`). */
  beat: string;
  anim: string;
  /** In a chat: who with (-1 otherwise), and whether this one runs it - the turns left and the frames into this one. */
  partner: number;
  lead: boolean;
  turns: number;
  turnT: number;
}

/**
 * A line's waiting beats: `enter()` deals for its diners, `free()` hands one over, `update()` once a fixed step after
 * the screen has ticked their players. Anything the screen plays on a diner wins: the beats only ever start on a
 * diner standing at `idle`.
 */
export class WaitingBeats {
  // `declare` for the reason game.ts gives: the fields are the constructor's and enter()'s own assignments.
  /** One slot per diner, front first. */
  declare list: Slot[];
  /** The beats this screen deals. */
  declare set: readonly Beat[];
  /** The row of the line each diner stands in and their feet's x, for who stands next to whom in a chat; null where
   *  nobody chats. */
  declare rows: readonly number[] | null;
  declare xs: readonly number[] | null;
  /** The beat everybody is dealt first, whatever their favourite ('' for none): after the meal, a full tummy. */
  declare first: Beat | '';
  /** This screen's own stream of chances (never the gameplay singleton). */
  declare r: RngInstance;
  /** Beats dealt so far, chats among them, and how many of each: the summary's. */
  declare dealt: number;
  declare chats: number;
  declare counts: Record<string, number>;

  constructor() { this.list = []; this.set = LINE_BEATS; this.rows = null; this.xs = null; this.first = ''; this.r = makeRng(1); this.dealt = 0; this.chats = 0; this.counts = {}; }

  /**
   * Deal for a line: `ids` are the diners' customer ids, front first (their favourites); `rows` and `xs` say who
   * stands next to whom, for the chats (null for none); `first` is everybody's first beat ('' for none). Nobody is
   * free until the screen says so.
   */
  enter(seed: number, ids: readonly string[], set: readonly Beat[], rows: readonly number[] | null = null, xs: readonly number[] | null = null, first: Beat | '' = ''): void {
    this.r = makeRng(seed >>> 0 || 1);
    this.set = set; this.rows = rows; this.xs = xs; this.first = first;
    this.dealt = 0; this.chats = 0; this.counts = {};
    for (let k = 0; k < set.length; k++) this.counts[set[k]] = 0;
    if (first) this.counts[first] = 0;
    this.list = ids.map((id): Slot => ({ fav: FAVOURITE[id] || '', due: -1, n: 0, beat: '', anim: '', partner: -1, lead: false, turns: 0, turnT: 0 }));
  }

  /** Hand diner `i` over at frame `f`: their first beat after a short rest. Once only; later calls do nothing. */
  free(i: number, f: number): void {
    const s = this.list[i];
    if (s && s.due < 0 && !s.beat) s.due = f + this.r.int(FIRST_MIN, FIRST_MAX);
  }

  /** Put off diner `i`'s next beat to frame `f` at the soonest (the hatch, while their order is being taken). */
  delay(i: number, f: number): void {
    const s = this.list[i];
    if (s && s.due >= 0 && s.due < f) s.due = f;
  }

  /** One fixed step at frame `f`, after the screen has ticked the diners' players and played whatever it plays. */
  update(f: number, diners: readonly BeatDiner[]): void {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const s = list[i], d = diners[i];
      if (!d) continue;
      this.turns(s, d);
      if (s.beat) {
        if (s.lead) this.talk(i, f, diners);
        else if (s.partner < 0) this.watch(i, f, d);
        continue;
      }
      if (s.due < 0 || f < s.due) continue;
      // the screen has them doing something of its own (waving their order, carrying their plate): ask again shortly
      if (d.player.name !== 'idle') { s.due = f + RETRY; continue; }
      this.deal(i, f, diners);
    }
  }

  /** Apply the frame events since the last step: a `turn` turns a diner in a beat of their own round. */
  turns(s: Slot, d: BeatDiner): void {
    const ev = d.player.events;
    for (let k = 0; k < ev.length; k++) if (ev[k].name === TURN_EVENT && s.beat && s.partner < 0) d.facing = -d.facing;
    ev.length = 0;
  }

  /** A beat on their own: over when it finishes, or when the screen has played something else over it. */
  watch(i: number, f: number, d: BeatDiner): void {
    const s = this.list[i];
    if (d.player.name !== s.anim) { this.rest(i, f, d); return; }
    if (d.player.done) { d.player.play('idle', { restart: true }); this.rest(i, f, d); }
  }

  /** Back to the breath: facing the way they face, and the next beat after a rest. */
  rest(i: number, f: number, d: BeatDiner): void {
    const s = this.list[i];
    d.facing = HOME;
    s.beat = ''; s.anim = ''; s.partner = -1; s.lead = false; s.turns = 0; s.turnT = 0;
    s.due = f + this.r.int(REST_MIN, REST_MAX);
  }

  /** Deal diner `i` a beat: the screen's first beat if this is their first, otherwise their favourite three times as
   *  likely as anything else; a chat needs a neighbour at rest to turn to. */
  deal(i: number, f: number, diners: readonly BeatDiner[]): void {
    const s = this.list[i];
    let beat: Beat = !s.n && this.first ? this.first : this.pick(s.fav, '');
    if (beat === 'chat') {
      const j = this.neighbour(i, diners);
      if (j >= 0) { this.chat(i, j, diners); return; }
      beat = this.pick(s.fav, 'chat');   // nobody free to talk to: something on their own instead
    }
    const d = diners[i];
    s.beat = beat; s.anim = beat; s.n++;
    d.player.play(beat, { restart: true });
    this.turns(s, d);   // the beat's first key may turn them round
    this.dealt++; this.counts[beat]++;
  }

  /** One of the screen's beats, the favourite weighted, `skip` left out. */
  pick(fav: string, skip: string): Beat {
    const set = this.set;
    let total = 0;
    for (let k = 0; k < set.length; k++) if (set[k] !== skip) total += set[k] === fav ? FAVOURITE_WEIGHT : 1;
    let n = this.r.int(0, Math.max(0, total - 1));
    for (let k = 0; k < set.length; k++) {
      if (set[k] === skip) continue;
      n -= set[k] === fav ? FAVOURITE_WEIGHT : 1;
      if (n < 0) return set[k];
    }
    return set[0];
  }

  /** A neighbour of diner `i` in the same row of the line who is at rest, or -1: either side, the stream's choice. */
  neighbour(i: number, diners: readonly BeatDiner[]): number {
    const rows = this.rows;
    if (!rows || !this.xs) return -1;
    const a = i > 0 && rows[i - 1] === rows[i] && this.resting(i - 1, diners) ? i - 1 : -1;
    const b = i + 1 < this.list.length && rows[i + 1] === rows[i] && this.resting(i + 1, diners) ? i + 1 : -1;
    if (a >= 0 && b >= 0) return this.r.chance(0.5) ? a : b;
    return a >= 0 ? a : b;
  }

  /** Free, in no beat, standing at idle - and, where everybody has a first beat, past it (nobody is talked into a
   *  chat before they have patted their full tummy). */
  resting(j: number, diners: readonly BeatDiner[]): boolean {
    const t = this.list[j], d = diners[j];
    return !!d && t.due >= 0 && !t.beat && d.player.name === 'idle' && (t.n > 0 || !this.first);
  }

  /** Start a chat: `i` was dealt it and talks first, `j` agrees; whoever stands on the left turns to face the other. */
  chat(i: number, j: number, diners: readonly BeatDiner[]): void {
    const s = this.list[i], t = this.list[j], xs = this.xs as readonly number[];
    s.beat = t.beat = 'chat'; s.partner = j; t.partner = i; s.lead = true; t.lead = false; s.n++; t.n++;
    s.turns = this.r.int(TURNS_MIN, TURNS_MAX); s.turnT = 0;
    const left = xs[i] < xs[j] ? i : j, right = left === i ? j : i;
    diners[left].facing = 1; diners[right].facing = -1;
    this.say(i, j, diners);
    this.dealt++; this.chats++; this.counts.chat++;
  }

  /** `talker` talks, `listener` agrees. */
  say(talker: number, listener: number, diners: readonly BeatDiner[]): void {
    this.list[talker].anim = 'talk'; diners[talker].player.play('talk', { restart: true });
    this.list[listener].anim = 'agree'; diners[listener].player.play('agree', { restart: true });
  }

  /** A chat's step, run by whoever was dealt it: the turns go by, swapping who talks, until it is over or the screen
   *  plays something else over either of them. */
  talk(i: number, f: number, diners: readonly BeatDiner[]): void {
    const s = this.list[i], j = s.partner, t = this.list[j];
    const cut = diners[i].player.name !== s.anim || diners[j].player.name !== t.anim;
    if (!cut && ++s.turnT < CHAT_TURN) return;
    if (!cut && --s.turns > 0) { s.turnT = 0; if (s.anim === 'talk') this.say(j, i, diners); else this.say(i, j, diners); return; }
    // over: whoever is still talking or agreeing goes back to the breath, and both rest facing the way they face
    this.hush(diners[i]); this.hush(diners[j]);
    this.rest(i, f, diners[i]); this.rest(j, f, diners[j]);
  }

  /** A diner still in the chat's talk or agree goes back to idle (one the screen has given something else keeps it). */
  hush(d: BeatDiner): void {
    if (d.player.name === 'talk' || d.player.name === 'agree') d.player.play('idle', { restart: true });
  }

  /** For the tests: what each diner is doing ('' at rest; a chat's `talk` or `agree`), and how many beats and chats
   *  have been dealt, and of which kinds. */
  summary() {
    return { beats: this.list.map((s) => (s.beat ? s.anim : '')), dealt: this.dealt, chats: this.chats, kinds: Object.keys(this.counts).filter((k) => this.counts[k] > 0).sort() };
  }
}
