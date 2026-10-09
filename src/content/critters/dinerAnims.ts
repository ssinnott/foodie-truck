// THE DINERS' WAITING BEATS (docs/GDD.md sections 6, 7 and 10; docs/ART_STYLE.md section 8): what a village diner
// does with themselves while a line waits. The cast's own table (common.ts makeCritterAnims) gives a diner a breath
// and a wave, and a line of eighteen breathing in time reads as a picture rather than a queue. These are the rest of
// a queue: a SNIFF at whatever is cooking, a rub of a hungry TUMMY, up on the TIPTOEs to see over the line, an
// excited BOUNCE, a LOOK back down the line, a word with the neighbour (one TALKs while the other AGREEs), a little
// DANCE, a foot TAPped with a paw on the hip, a YAWN, and after the meal a pat of a FULL tummy.
//
// Every diner ships them: villagers.ts and customers.ts build their tables with makeDinerAnims, so the contact sheet
// draws them (tools/sheet.html ?critter=fox&anims=sniff,tummy) and the screens play them by name, while game/
// waiting.ts decides who does which, and when. Each beat that is dealt eases out of the cast's own REST at idle's
// first key (SETTLE) and settles back onto it, so it neither snaps in nor pops out, and none of them crosses the face
// (ART_STYLE section 0.7): a paw that comes up stays out in front of the chest, under the muzzle, and the tummy and
// the hip are as close to the body as a paw comes. A beat that turns the diner round carries a `turn` event on the
// key it turns on, and the screen flips them there. Every key authored here sets its own `ease` (ART_STYLE section 8);
// hello and hooray reuse the cast's wave and cheer keys as they are.
import { F, REST, makeCritterAnims } from './common.ts';
import type { AnimSet } from '../../lib/art/animation.ts';

/** The beats game/waiting.ts can deal a diner. A chat is two animations: whoever is talking plays `talk`, and whoever
 *  is listening `agree`. */
export type Beat = 'sniff' | 'tummy' | 'tiptoe' | 'bounce' | 'look' | 'chat' | 'dance' | 'tap' | 'yawn' | 'full';

/** Idle's first breath (common.ts makeCritterAnims): where every beat ends, so the idle it hands back to does not pop. */
const SETTLE = { ...REST, torso: 2, root: [0, 0], face: 'happy' as const };
/** The near paw on the tummy: the elbow back at the body's middle and the forearm coming forward ONTO the belly, so
 *  the paw sits over the egg's front rim rather than out in front of it (where it read as a paw held out); the rub's
 *  two ends three pixels above and below it. */
const RUB = [-40, 124], RUB_UP = [-42, 138], RUB_DOWN = [-34, 103];
/** The paws on a bounce: down by the hips on the crouch and swinging out a little in the air, below the chest. The
 *  hop is the beat: paws balled up in front of the chest read as a shove at the diner ahead, and arms up as the
 *  cheer (which jumps too). */
const PAWS_DOWN = { armR: [4, 18], armL: [-22, 12] }, PAWS_OUT = { armR: [26, 36], armL: [-44, 28] };
/** A knee bend that keeps the feet on the ground under a crouch two pixels deep (the thigh forward, the shin back
 *  under it), and the feet tucked up off it in the air. */
const CROUCH = { legR: [28, -56], legL: [22, -46] }, TUCK = { legR: [10, -26], legL: [-4, -18] };
/** Up on the toes: the feet tip toe-down and the body rises the two pixels the toe of a round paw foot (common.ts
 *  pawFoot) dips by doing it, so the toes stay planted; the rest of the rise is a stretch up from the feet. */
const TOES = { armR: [6, 14], armL: [-28, 12], footR: -38, footL: -38 }, TOE_LIFT = -2;
/** A paw on the hip for the foot tap: the elbow back, the paw at the front of the hip block. The tap lifts the whole
 *  near foot on a knee bend (a round paw foot turned on its ankle hardly changes shape), toe up, and stamps it. */
const HIP = { armR: [-30, 76], armL: [-18, 8] }, FOOT_UP = { legR: [44, -76], footR: 16 }, FOOT_DOWN = { legR: [0, 0], footR: 0 };
/** The talker's paw out in front of the chest, palm up, rising and falling with the words. */
const SAY_UP = [48, 62], SAY_DOWN = [40, 32];
/** The cast's own wave and cheer keys (common.ts), which loop: HELLO and HOORAY play them twice and come down; HOORAY
 *  follows the last bite, so it starts on the eat's last key. */
const CAST = makeCritterAnims(), WAVE = CAST.wave.frames, CHEER = CAST.cheer.frames, EAT_END = CAST.eat.frames[CAST.eat.frames.length - 1].pose;
/** Every beat that is dealt starts on SETTLE and eases out of it over `dur` frames into its first move: a diner is only
 *  ever dealt one standing at idle, and a first key played cold would snap the paw to the tummy in a frame. */
const EASE_IN = (dur: number) => F(dur, SETTLE, { ease: 'inout' });

const BEATS: AnimSet = {
  // HELLO: the line's wave as each diner orders (screens/line.ts) - the paw up from the breath, the cast's own wave
  // twice over, and the paw back down to the breath - so it ends, where the cast's wave loops on until whoever
  // started it stops it. HOORAY: the same for the cheer at an empty plate (screens/results.ts). The screens play
  // these two themselves; game/waiting.ts deals the rest.
  hello: { loop: false, frames: [F(6, SETTLE, { ease: 'out' }), ...WAVE, ...WAVE, F(10, SETTLE, { ease: 'inout' })] },
  hooray: { loop: false, frames: [{ dur: 4, pose: EAT_END, ease: 'out' }, ...CHEER, ...CHEER, F(10, SETTLE, { ease: 'inout' })] },
  // SNIFF: something smells good. Lean toward the hatch with the nose up and the eyes shut, three sniffs - each one a
  // little stretch up the nose - then the "mmm", a smile as the shoulders drop, and back.
  sniff: { loop: false, frames: [
    EASE_IN(5),
    F(10, { armR: [8, 12], armL: [-22, 8], torso: 6, head: -10, root: [1, 0], face: 'neutral' }, { ease: 'out' }),
    F(5, { armR: [8, 12], armL: [-24, 8], torso: 9, head: -16, root: [2, 0], stretch: 1.02, face: 'closed' }, { ease: 'inout' }),
    F(5, { armR: [8, 12], armL: [-24, 8], torso: 8, head: -12, root: [2, 0], face: 'closed' }, { ease: 'inout' }),
    F(5, { armR: [8, 12], armL: [-24, 8], torso: 9, head: -17, root: [2, 0], stretch: 1.02, face: 'closed' }, { ease: 'inout' }),
    F(5, { armR: [8, 12], armL: [-24, 8], torso: 8, head: -12, root: [2, 0], face: 'closed' }, { ease: 'inout' }),
    F(6, { armR: [8, 12], armL: [-24, 8], torso: 10, head: -19, root: [2, 0], stretch: 1.03, face: 'closed' }, { ease: 'out' }),
    F(16, { armR: [16, 14], armL: [-16, 10], torso: 2, head: -6, root: [1, 1], squash: 1.02, face: 'happy' }, { ease: 'inout' }),
    F(10, SETTLE, { ease: 'inout' }),
  ] },
  // TUMMY: so hungry. The near paw goes to the tummy and rubs it while the head hangs to look at it with the sad brows
  // of a long wait, then looks up at the hatch, hopeful, with the paw still on it.
  tummy: { loop: false, frames: [
    EASE_IN(6),
    F(8, { armR: RUB, armL: [-20, 10], torso: 4, head: 7, root: [0, 1], face: 'hurt' }, { ease: 'out' }),
    F(7, { armR: RUB_UP, armL: [-20, 10], torso: 5, head: 9, root: [0, 1], face: 'hurt' }, { ease: 'inout' }),
    F(7, { armR: RUB_DOWN, armL: [-20, 10], torso: 4, head: 7, root: [0, 1], squash: 1.02, face: 'hurt' }, { ease: 'inout' }),
    F(7, { armR: RUB_UP, armL: [-20, 10], torso: 5, head: 9, root: [0, 1], face: 'hurt' }, { ease: 'inout' }),
    F(7, { armR: RUB_DOWN, armL: [-20, 10], torso: 4, head: 7, root: [0, 1], squash: 1.02, face: 'hurt' }, { ease: 'inout' }),
    F(16, { armR: RUB, armL: [-18, 8], torso: -2, head: -8, root: [0, 0], face: 'happy' }, { ease: 'out' }),
    F(10, SETTLE, { ease: 'inout' }),
  ] },
  // TIPTOE: is it my turn yet? A dip, then up onto the toes, craning to see over the line ahead, a blink up there,
  // and down onto the heels with a bump.
  tiptoe: { loop: false, frames: [
    EASE_IN(4),
    F(7, { ...REST, ...CROUCH, torso: 3, root: [0, 2], squash: 1.03, face: 'neutral' }, { ease: 'in' }),
    F(10, { ...TOES, torso: -4, head: -12, root: [0, TOE_LIFT], stretch: 1.05, face: 'neutral' }, { ease: 'out' }),
    F(14, { ...TOES, torso: -5, head: -15, root: [1, TOE_LIFT], stretch: 1.06, face: 'neutral' }, { ease: 'inout' }),
    F(5, { ...TOES, torso: -5, head: -15, root: [1, TOE_LIFT], stretch: 1.06, face: 'closed' }, { ease: 'inout' }),
    F(9, { ...TOES, torso: -4, head: -11, root: [0, TOE_LIFT], stretch: 1.05, face: 'neutral' }, { ease: 'in' }),
    F(6, { ...REST, ...CROUCH, torso: 3, root: [0, 2], squash: 1.04, face: 'neutral' }, { ease: 'out' }),
    F(10, SETTLE, { ease: 'inout' }),
  ] },
  // BOUNCE: nearly time! Two quick little hops on the spot, smiling, the paws swinging out as they go up.
  bounce: { loop: false, frames: [
    EASE_IN(4),
    F(5, { ...PAWS_DOWN, ...CROUCH, torso: 6, root: [0, 2], squash: 1.05, face: 'happy' }, { ease: 'in' }),
    F(8, { ...PAWS_OUT, ...TUCK, torso: 0, head: -4, root: [0, -7], stretch: 1.05, face: 'happy' }, { ease: 'out' }),
    F(5, { ...PAWS_DOWN, ...CROUCH, torso: 6, root: [0, 2], squash: 1.05, face: 'happy' }, { ease: 'in' }),
    F(8, { ...PAWS_OUT, ...TUCK, torso: 0, head: -4, root: [0, -6], stretch: 1.05, face: 'happy' }, { ease: 'out' }),
    F(5, { ...PAWS_DOWN, ...CROUCH, torso: 6, root: [0, 2], squash: 1.05, face: 'happy' }, { ease: 'in' }),
    F(10, SETTLE, { ease: 'out' }),
  ] },
  // LOOK: how long is this line? Turn round - the `turn` event, on a bump as they go - to look back down the line,
  // head up; a blink, a glance down, and turn back round to the hatch on another bump.
  look: { loop: false, frames: [
    EASE_IN(4),
    F(5, { ...REST, torso: 2, root: [0, 1], squash: 1.05, face: 'neutral' }, { ease: 'out', event: 'turn' }),
    F(18, { armR: [16, 12], armL: [-18, 8], torso: -2, head: -6, root: [0, 0], face: 'neutral' }, { ease: 'inout' }),
    F(5, { armR: [16, 12], armL: [-18, 8], torso: -2, head: -6, root: [0, 0], face: 'closed' }, { ease: 'inout' }),
    F(16, { armR: [14, 12], armL: [-16, 8], torso: 1, head: 3, root: [0, 0], face: 'neutral' }, { ease: 'inout' }),
    F(5, { ...REST, torso: 2, root: [0, 1], squash: 1.05, face: 'neutral' }, { ease: 'out', event: 'turn' }),
    F(8, SETTLE, { ease: 'inout' }),
  ] },
  // THE CHAT, as two neighbours turned to each other. TALK: the mouth open on one key and a smile on the next, the
  // near paw coming up from the breath out in front of the chest, palm up, rising and falling with the words. AGREE: a
  // nod and a smile. Both loop on 24 frames and both open on the breath's own arms, torso and root: game/waiting.ts
  // swaps who is talking every CHAT_TURN frames, a whole number of loops, so the two always swap on matching keys, and
  // the chat ends on them too.
  talk: { loop: true, frames: [
    F(6, { ...REST, torso: 2, head: -2, face: 'shout' }, { ease: 'inout' }),
    F(6, { armR: SAY_UP, armL: [-20, 10], torso: 3, head: 2, root: [0, 1], face: 'happy' }, { ease: 'inout' }),
    F(6, { armR: [52, 66], armL: [-20, 10], torso: 2, head: -4, face: 'shout' }, { ease: 'inout' }),
    F(6, { armR: SAY_DOWN, armL: [-18, 8], torso: 3, head: 2, root: [0, 1], face: 'happy' }, { ease: 'inout' }),
  ] },
  agree: { loop: true, frames: [
    F(10, { ...REST, torso: 2, head: -2, root: [0, 0], face: 'happy' }, { ease: 'inout' }),
    F(6, { ...REST, torso: 3, head: 10, root: [0, 1], face: 'happy' }, { ease: 'in' }),
    F(8, { ...REST, torso: 2, head: -4, root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
  // DANCE: a little jig on the spot for two bars - rock back with the near knee up and the near paw up in front, down
  // on the beat, rock forward with the far knee up and the far paw up behind, down on the beat. The rock pivots on
  // the feet (root rot); the near paw comes up to the chest and no higher, the far one may go up behind the head.
  dance: { loop: false, frames: [
    EASE_IN(6),
    F(7, { armR: [60, 50], armL: [-60, 30], legR: [46, -66], torso: -4, head: -6, root: [1, -1, -5], face: 'happy' }, { ease: 'out' }),
    F(5, { armR: [24, 36], armL: [-40, 24], torso: 2, head: 2, root: [0, 1, 0], squash: 1.04, face: 'happy' }, { ease: 'in' }),
    F(7, { armR: [4, 30], armL: [-130, -10], legL: [46, -66], torso: 5, head: 4, root: [-1, -1, 5], face: 'happy' }, { ease: 'out' }),
    F(5, { armR: [24, 36], armL: [-40, 24], torso: 2, head: 2, root: [0, 1, 0], squash: 1.04, face: 'happy' }, { ease: 'in' }),
    F(7, { armR: [60, 50], armL: [-60, 30], legR: [46, -66], torso: -4, head: -6, root: [1, -1, -5], face: 'happy' }, { ease: 'out' }),
    F(5, { armR: [24, 36], armL: [-40, 24], torso: 2, head: 2, root: [0, 1, 0], squash: 1.04, face: 'happy' }, { ease: 'in' }),
    F(7, { armR: [4, 30], armL: [-130, -10], legL: [46, -66], torso: 5, head: 4, root: [-1, -1, 5], face: 'happy' }, { ease: 'out' }),
    F(5, { armR: [24, 36], armL: [-40, 24], torso: 2, head: 2, root: [0, 1, 0], squash: 1.04, face: 'happy' }, { ease: 'in' }),
    F(8, SETTLE, { ease: 'out' }),
  ] },
  // TAP: come ON. A paw on the hip and the near foot tapping, toe up and down four times, the head tipped and a straight
  // face; then back to a smile.
  tap: { loop: false, frames: [
    EASE_IN(6),
    F(8, { ...HIP, torso: 0, head: 5, root: [0, 0], face: 'neutral' }, { ease: 'out' }),
    F(5, { ...HIP, ...FOOT_UP, torso: -1, head: 5, face: 'neutral' }, { ease: 'out' }),
    F(5, { ...HIP, ...FOOT_DOWN, torso: 1, head: 7, face: 'neutral' }, { ease: 'in' }),
    F(5, { ...HIP, ...FOOT_UP, torso: -1, head: 5, face: 'neutral' }, { ease: 'out' }),
    F(5, { ...HIP, ...FOOT_DOWN, torso: 1, head: 7, face: 'neutral' }, { ease: 'in' }),
    F(5, { ...HIP, ...FOOT_UP, torso: -1, head: 5, face: 'neutral' }, { ease: 'out' }),
    F(5, { ...HIP, ...FOOT_DOWN, torso: 1, head: 7, face: 'neutral' }, { ease: 'in' }),
    F(5, { ...HIP, ...FOOT_UP, torso: -1, head: 5, face: 'neutral' }, { ease: 'out' }),
    F(6, { ...HIP, ...FOOT_DOWN, torso: 1, head: 7, face: 'neutral' }, { ease: 'in' }),
    F(10, SETTLE, { ease: 'inout' }),
  ] },
  // YAWN: it has been a long line. A breath in with the arms going back, then the yawn - head back, mouth wide, chest
  // out and both arms stretched back and down, nothing like the cheer's arms up, and no further back than the diner
  // behind stands - a droop with the eyes shut, a start, and awake again.
  yawn: { loop: false, frames: [
    EASE_IN(5),
    F(10, { armR: [-10, 8], armL: [-26, 6], torso: -4, head: -6, root: [0, 0], stretch: 1.01, face: 'closed' }, { ease: 'in' }),
    F(20, { armR: [-22, 6], armL: [-38, 4], torso: -10, head: -16, root: [-1, 0], stretch: 1.05, face: 'shout' }, { ease: 'out' }),
    F(12, { armR: [-18, 8], armL: [-34, 6], torso: -8, head: -12, root: [-1, 0], stretch: 1.04, face: 'shout' }, { ease: 'inout' }),
    F(12, { ...REST, torso: 5, head: 8, root: [0, 1], squash: 1.03, face: 'closed' }, { ease: 'inout' }),
    F(10, { ...REST, torso: 4, head: 6, root: [0, 1], squash: 1.02, face: 'closed' }, { ease: 'inout' }),
    F(4, { ...REST, torso: 0, head: -4, root: [0, -1], face: 'neutral' }, { ease: 'overshoot' }),
    F(10, SETTLE, { ease: 'out' }),
  ] },
  // FULL: that was good (results, the plate empty). Leaning back, the eyes shut, patting a full tummy with the TUMMY's
  // own paw, then a contented breath out.
  full: { loop: false, frames: [
    EASE_IN(6),
    F(8, { armR: RUB, armL: [-22, 8], torso: -3, head: -4, root: [0, 0], face: 'happy' }, { ease: 'out' }),
    F(7, { armR: RUB_UP, armL: [-22, 8], torso: -4, head: -6, root: [0, 0], face: 'closed' }, { ease: 'inout' }),
    F(7, { armR: RUB_DOWN, armL: [-22, 8], torso: -3, head: -4, root: [0, 1], squash: 1.02, face: 'closed' }, { ease: 'inout' }),
    F(7, { armR: RUB_UP, armL: [-22, 8], torso: -4, head: -6, root: [0, 0], face: 'closed' }, { ease: 'inout' }),
    F(7, { armR: RUB_DOWN, armL: [-22, 8], torso: -3, head: -4, root: [0, 1], squash: 1.02, face: 'closed' }, { ease: 'inout' }),
    F(16, { armR: RUB, armL: [-20, 8], torso: -5, head: -8, root: [0, 0], stretch: 1.02, face: 'happy' }, { ease: 'out' }),
    F(10, SETTLE, { ease: 'inout' }),
  ] },
};

/** Every animation this file adds to a diner's table (the chat's two, and the line's hello and hooray, included),
 *  for the art check and the contact sheet. */
export const BEAT_ANIMS: readonly string[] = Object.freeze(Object.keys(BEATS));

/**
 * Each diner's FAVOURITE beat, from the temperament its role gives it (villagers.ts, customers.ts): game/waiting.ts
 * deals it three times as often as any other. Every id on the roll (diners.ts) has one, and only a beat that can be
 * dealt in the line (`full` is for after the meal): tools/art-check.js holds both.
 */
export const FAVOURITE: Readonly<Record<string, Beat>> = Object.freeze({
  owl: 'yawn',          // THE REGULAR: an owl, out in the daytime
  otter: 'tummy',       // THE HUNGRY REGULAR
  goat: 'sniff',        // THE PICKY ONE: smells it first
  fox: 'chat',          // THE CHARMER
  badger: 'tap',        // THE GRUMBLER
  hedgehog: 'look',     // THE SHY ONE: keeps looking round
  pig: 'sniff',         // THE FOODIE
  cow: 'chat',          // THE DAIRY MAID
  squirrel: 'bounce',   // THE FIDGET
  deer: 'tiptoe',       // THE GRACEFUL ONE
  bear: 'tummy',        // THE BIG APPETITE
  raccoon: 'tiptoe',    // THE SNEAKY ONE: having a peek
  cat: 'yawn',          // THE COOL CUSTOMER: bored, frankly
  dog: 'bounce',        // THE EAGER ONE
  hen: 'chat',          // THE GOSSIP
  duck: 'look',         // THE DAWDLER
  mole: 'tiptoe',       // THE SQUINTER: trying to see
  tortoise: 'look',     // THE PATIENT ONE
  beaver: 'tap',        // THE BUILDER: places to be
  horse: 'dance',       // THE SHOW PONY
  goose: 'tap',         // THE BOSSY ONE
  robin: 'bounce',      // THE EARLY BIRD
  bat: 'yawn',          // THE NIGHT SHIFT
  boar: 'tap',          // THE TOUGH NUT
  kingfisher: 'bounce', // THE QUICK ONE
  seal: 'chat',         // THE OLD SALT
  puffin: 'chat',       // THE CHATTERBOX
});

/** A diner's whole table: the cast's own (common.ts) with the waiting beats added. */
export function makeDinerAnims(): AnimSet { return makeCritterAnims(BEATS); }
