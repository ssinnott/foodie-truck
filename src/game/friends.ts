// THE FRIENDS WHO RIDE ALONG (docs/GDD.md section 2). A player picks one of the cast at the select screen, and two
// more of the cast come along for the day: they ride at the truck's hatch window on the road, and in the kitchen one
// TAKES THE ORDERS at the hatch while the other RUNS ABOUT the floor (game/kitchenFriends.ts). They are nobody's
// seat: no input reaches them, they never touch a station, score nothing and draw nothing from the gameplay rng,
// so the simulation cannot tell they are there.
//
// WHO comes is a pure function of the party - the next of the cast along the roll from the first seat's pick,
// round its end and past anyone seated - so every online peer seats the same friends from the START packet,
// CONTINUE brings the same ones back from the saved party alone (game/week.ts stores no friends), and the select
// screen can show who is coming before the stamp goes down. Never more than the truck seats: its windows hold four
// heads (art/truck.ts: the driver in the cab and three at the hatch), so a party of three brings one friend and a
// party of four none. A friend never takes the wheel either: the driver's stick is the weighted one (docs/GDD.md
// section 4), so the cab is always a seat's.
import { CRITTERS, getCritter } from '../content/critters/index.ts';
import { critterRig } from '../content/critters/common.ts';
import { AnimPlayer } from '../lib/art/animation.ts';
import type { Rig } from '../lib/art/rig.ts';
import type { Pose } from '../lib/art/poses.ts';

/** What a friend does in the kitchen: take the line's orders at the hatch, or run about the floor. */
export type FriendJob = 'order' | 'run';
/** One friend riding along: who, and their job. */
export interface Friend { critter: string; job: FriendJob }
/** The most friends who come along, and the heads the truck's windows hold (art/truck.ts drawTruck). */
export const FRIENDS_MAX = 2, TRUCK_SEATS = 4;
/**
 * Of two friends, the one further up this list takes the orders and the other runs about: the head chef first
 * (TASTE / ORDER - it is the job), then the hungry one (nobody listens harder to a food order), the frog, the mouse,
 * and last the hare, who cannot stand still. An id missing from it ranks after all of them.
 */
export const ORDER_TAKERS: readonly string[] = Object.freeze(['rowan', 'barley', 'cress', 'sorrel', 'chicory']);

function orderRank(id: string): number { const k = ORDER_TAKERS.indexOf(id); return k < 0 ? ORDER_TAKERS.length : k; }

/**
 * The friends a party brings along: up to FRIENDS_MAX of the cast nobody is seated as, the next along the roll
 * from the first seat's pick (wrapping round), while the truck has a seat for them. The first takes the orders -
 * of two, whichever ORDER_TAKERS ranks higher - and the other runs about. Pure: the same party, the same friends.
 */
export function friendsOf(party: readonly { critter: string }[], cast: readonly { id: string }[] = CRITTERS): Friend[] {
  const room = Math.min(FRIENDS_MAX, TRUCK_SEATS - party.length);
  if (!party.length || room <= 0) return [];
  // an id the roll does not know starts the walk from the top of it
  const found = cast.findIndex((c) => c.id === party[0].critter), at = found < 0 ? cast.length - 1 : found;
  const ids: string[] = [];
  for (let k = 1; k <= cast.length && ids.length < room; k++) {
    const id = cast[(at + k) % cast.length].id;
    if (ids.indexOf(id) < 0 && !party.some((p) => p.critter === id)) ids.push(id);
  }
  if (ids.length === 2 && orderRank(ids[1]) < orderRank(ids[0])) ids.reverse();
  return ids.map((critter, i): Friend => ({ critter, job: i === 0 ? 'order' : 'run' }));
}

/** A friend as a screen holds one: the rig in the off-duty apron (they are nobody's seat) and the player idling it. */
export interface Rider extends Friend {
  rig: Rig;
  player: AnimPlayer;
}

/**
 * Build the friends a party brings, each with a rig and an idling player: in enter(), never in draw(). `lag` ticks
 * each one's idle on by its place in the truck (lag frames per head, counting from `after`), so a friend never
 * breathes in step with the crew member beside them - the screens give their own crew the same stagger.
 */
export function ridersFor(party: readonly { critter: string }[], after = 0, lag = 9): Rider[] {
  return friendsOf(party).map((f, i): Rider => {
    const def = getCritter(f.critter), player = new AnimPlayer(def.anims);
    player.play('idle');
    for (let k = 0; k < (after + i) * lag; k++) player.tick();
    return { critter: f.critter, job: f.job, rig: critterRig(def, -1), player };
  });
}

/** A head riding in one of the truck's windows (art/truck.ts drawTruck `heads`): the rig, and its live pose. */
export interface WindowHead { rig: Rig; pose: Pose }

/** The friends' heads for the truck's hatch window, after the crew's: their players rewrite each pose in place. */
export function pushRiderHeads(heads: WindowHead[], riders: readonly Rider[]): void {
  for (const r of riders) if (heads.length < TRUCK_SEATS) heads.push({ rig: r.rig, pose: r.player.pose as Pose });
}
