// THE WEEK IN PROGRESS (docs/GDD.md section 3): the one record that survives a session, so a five-day week can
// be played across five sittings instead of one two-hour one.
//
// At a DAY BOUNDARY a run holds nothing that is not derivable. The week is a pure function of the seed
// (game/run.ts planWeek), so resuming needs only WHICH SEED, WHICH DAY, WHO WAS SITTING DOWN, and what the days
// already closed were worth. That is the whole record - about sixty bytes of JSON - and it is why nothing in here
// stores a plan, a shopping list or a pantry. `planWeek(seed)[day]` rebuilds the rest.
//
// Persistence is localStorage and it is deliberately fragile, exactly as engine/bindings.ts is: a private window,
// a blocked origin, junk in the entry or a record from a build with a different week all mean "no week in
// progress", never a thrown error on boot.
//
// TWO RULES, both of them about keeping the simulation out of here:
//   * Read and written from screen enter() / exit() ONLY, never from an update() (docs/MULTIPLAYER.md: no
//     localStorage on the simulation path).
//   * ONLINE PEERS DO NOT SAVE. A guest plays the host's week, which arrives in the START packet
//     (net/protocol.ts); one player owns a week, the way one player owns the host key. `saveWeek` refuses while
//     a match is live, so a guest's own Tuesday is never overwritten by the host's Thursday.
import { DAYS_PER_WEEK } from './run.ts';

/** Where a week in progress lives, and the shape version that invalidates it. */
const STORE_KEY = 'foodie-truck.week';
const STORE_VERSION = 1;

/** A week part-played: enough to rebuild the run, and nothing that could be re-derived from the seed. */
export interface WeekRecord {
  /** The run's seed: the whole week's plan comes back out of it. */
  seed: number;
  /** The day the truck is about to open, 0-based (game/run.ts DAY_SHAPES). Never the last day plus one. */
  day: number;
  /** One cast index per seat, in slot order - what `startRun` takes and the select screen stamped. */
  critters: number[];
  /** Stars per day closed so far, in day order. */
  stars: number[];
  /** Takings per day closed so far, in day order. */
  takings: number[];
}

/** Storage, if this browser has one we are allowed to touch. */
function store(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** An array of whole numbers, clamped and capped at a week's length; anything else comes back empty. */
function numbers(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, DAYS_PER_WEEK).map((n) => (Number.isFinite(n) ? Math.max(0, n | 0) : 0));
}

/**
 * A stored record, checked hard enough that a build with a different week length cannot resume into a day that
 * no longer exists. Returns null for anything it does not like, which always means "start a fresh week".
 */
function validate(raw: unknown): WeekRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== STORE_VERSION) return null;
  const seed = Number(r.seed) | 0, day = Number(r.day) | 0;
  if (!seed || !Number.isFinite(Number(r.seed))) return null;
  if (!(day >= 0 && day < DAYS_PER_WEEK)) return null;            // a finished or out-of-range week is not resumable
  const critters = Array.isArray(r.critters) ? r.critters.slice(0, 4).map((n) => Math.max(0, Number(n) | 0)) : [];
  if (!critters.length) return null;                               // a week nobody is sitting in
  return { seed, day, critters, stars: numbers(r.stars), takings: numbers(r.takings) };
}

/** The week in progress, or null when there is none. Never throws. Call from enter(), never from update(). */
export function readWeek(): WeekRecord | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(STORE_KEY);
    return raw ? validate(JSON.parse(raw)) : null;
  } catch { return null; }
}

/**
 * Write the week in progress. Never throws, and returns false when nothing was written.
 *
 * `online` is the guest guard: a peer in a live match is playing the host's week and must not save it as their
 * own. The caller passes `!!(game.net && game.net.active)`.
 */
export function saveWeek(rec: WeekRecord, online = false): boolean {
  if (online) return false;
  const s = store();
  if (!s) return false;
  if (!(rec.day >= 0 && rec.day < DAYS_PER_WEEK)) return clearWeek();   // the week is over: nothing left to resume
  try {
    s.setItem(STORE_KEY, JSON.stringify({ v: STORE_VERSION, seed: rec.seed | 0, day: rec.day | 0, critters: rec.critters.slice(0, 4), stars: numbers(rec.stars), takings: numbers(rec.takings) }));
    return true;
  } catch { return false; }
}

/** Forget the week in progress - the last day has closed, or a fresh one is being started over it. Never throws. */
export function clearWeek(): boolean {
  const s = store();
  if (!s) return false;
  try { s.removeItem(STORE_KEY); return true; } catch { return false; }
}
