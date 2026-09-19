// This game's wire format for online co-op (docs/MULTIPLAYER.md). The framing, the message ids and every packet
// but START are the library's (src/lib/net/protocol.ts); this file owns what is this game's: PROTOCOL_VERSION and
// the START packet with the host's match parameters. engine/input.ts packs a player's eight actions into one
// byte, sent as a uint16 slot so the layout can grow.
//
// Every INPUT packet repeats the last REDUNDANCY frames, which replaces retransmission entirely: a lost packet is
// covered by the next one. Never make the channel reliable/ordered - a retransmitted input arrives after its
// frame has already been simulated.

import { ACTIONS } from '../engine/input.ts';
import { MSG, packet, decodeMessage as decodeFramed } from '../lib/net/protocol.ts';
import type { StartDecoder } from '../lib/net/protocol.ts';

export { MSG, REDUNDANCY, encodeInput, encodeChecksum, encodeDrop, encodeRelay, encodePing, encodeJson } from '../lib/net/protocol.ts';
export type { Decoded } from '../lib/net/protocol.ts';

/**
 * Bumped whenever ACTIONS, the message layout, the cast or a simulation rule changes. Peers compare this in
 * HELLO and refuse to start on a mismatch: GitHub Pages is CDN-cached, so one player can easily be
 * on yesterday's bundle, and a shifted bit would silently turn their 'action' into someone's 'cancel'.
 * 2: the cast grew to five (content/critters/index.ts). A START packet's cast index 4 is the head chef on this
 * build and wraps to Barley on the last one - whose kitchen gag then fires on one machine only.
 * 3: START carries the host's DAY of the week (game/run.ts DAY_SHAPES). A peer that ignores the byte plans day 0
 * while the host plans day 3 - a different menu, a different shopping list and a different number of queues, so
 * the two would disagree about the whole day from frame 0 rather than drift into it.
 */
export const PROTOCOL_VERSION = 3;
if (ACTIONS.length > 16) throw new Error('net/protocol: more than 16 actions no longer fit a uint16 mask');
/**
 * START: the host's authoritative session parameters. Every peer seeds from this and begins at
 * frame 0. `critters` is one cast index per slot and its length IS the party size; `scene` is the
 * screen the match opens on (a map / mini-game / kitchen index, see game/run.js SCENES); `day` is which day of
 * the host's week the match opens on (game/run.js DAY_SHAPES), so a host resuming a week takes the party into
 * the day they are actually on. The whole week is a pure function of the seed, so that one byte is the entire
 * cost of the week on the wire.
 */
export function encodeStart({ seed, scene, delay, critters, day = 0 }) {
  const n = critters.length;
  const { b, v } = packet(10 + n);
  v.setUint8(0, MSG.START);
  v.setUint32(1, seed >>> 0, true);
  v.setUint8(5, scene & 0xff);
  v.setUint16(6, delay & 0xffff, true);
  v.setUint8(8, day & 0xff);
  v.setUint8(9, n & 0xff);
  for (let i = 0; i < n; i++) v.setUint8(10 + i, critters[i] & 0xff);
  return new Uint8Array(b);
}

/** The START half of `decodeMessage`: the library frames everything else. */
const decodeStart: StartDecoder = (u, v) => {
  if (u.length < 10) return null;
  const n = v.getUint8(9);
  if (u.length < 10 + n) return null;
  const critters = new Array<number>(n);
  for (let i = 0; i < n; i++) critters[i] = v.getUint8(10 + i);
  return { seed: v.getUint32(1, true), scene: v.getUint8(5), delay: v.getUint16(6, true), day: v.getUint8(8), critters };
};

/**
 * Decode any message. Returns null for an empty or unknown packet rather than throwing. `any`, as it always was
 * here: net/session.ts and net/roster.ts read each message's fields by its `type`.
 */
export function decodeMessage(bytes: Uint8Array | ArrayBuffer): any { return decodeFramed(bytes, decodeStart); }
