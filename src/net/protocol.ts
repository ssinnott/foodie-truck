// Wire format for online co-op (docs/MULTIPLAYER.md). Everything is little-endian binary sent over
// an unreliable, unordered RTCDataChannel - small enough that we never need to fragment.
//
// Input is the hot path: engine/input.js packs a player's eight actions into one byte, sent as a uint16
// slot so the layout can grow. Every INPUT packet repeats the last REDUNDANCY frames, which replaces
// retransmission entirely: a lost packet is covered by the next one. Never make the channel
// reliable/ordered - a retransmitted input arrives after its frame has already been simulated.
//
// Two to four players share one match. Every packet that carries simulation data names the SLOT it
// came from rather than relying on which connection it arrived on: with four players the mesh is
// six links, and any link that fails to form is carried by the host instead (MSG.RELAY).

import { ACTIONS } from '../engine/input.ts';

/**
 * Bumped whenever ACTIONS, the message layout or a simulation rule changes. Peers compare this in
 * HELLO and refuse to start on a mismatch: GitHub Pages is CDN-cached, so one player can easily be
 * on yesterday's bundle, and a shifted bit would silently turn their 'action' into someone's 'cancel'.
 */
export const PROTOCOL_VERSION = 1;
if (ACTIONS.length > 16) throw new Error('net/protocol: more than 16 actions no longer fit a uint16 mask');
/** Frames of input repeated in every INPUT packet. */
export const REDUNDANCY = 8;

export const MSG = { HELLO: 1, LOBBY: 2, START: 3, INPUT: 4, CHECKSUM: 5, PING: 6, PONG: 7, BYE: 8, RELAY: 9, DROP: 10 };

const enc = new TextEncoder();
const dec = new TextDecoder();

function buf(n) { const b = new ArrayBuffer(n); return { b, v: new DataView(b) }; }

/** INPUT: `slot`'s input, masks[0] for `baseFrame` and masks[i] for baseFrame + i. */
export function encodeInput(slot, baseFrame, masks) {
  const { b, v } = buf(7 + masks.length * 2);
  v.setUint8(0, MSG.INPUT);
  v.setUint8(1, slot & 0xff);
  v.setUint32(2, baseFrame >>> 0, true);
  v.setUint8(6, masks.length);
  for (let i = 0; i < masks.length; i++) v.setUint16(7 + i * 2, masks[i] & 0xffff, true);
  return new Uint8Array(b);
}

/** CHECKSUM: `slot`'s simulation hash at `frame`. */
export function encodeChecksum(slot, frame, sum) {
  const { b, v } = buf(10);
  v.setUint8(0, MSG.CHECKSUM);
  v.setUint8(1, slot & 0xff);
  v.setUint32(2, frame >>> 0, true);
  v.setUint32(6, sum >>> 0, true);
  return new Uint8Array(b);
}

/**
 * START: the host's authoritative session parameters. Every peer seeds from this and begins at
 * frame 0. `critters` is one cast index per slot and its length IS the party size; `scene` is the
 * screen the match opens on (a map / mini-game / kitchen index, see game/run.js SCENES).
 */
export function encodeStart({ seed, scene, delay, critters }) {
  const n = critters.length;
  const { b, v } = buf(9 + n);
  v.setUint8(0, MSG.START);
  v.setUint32(1, seed >>> 0, true);
  v.setUint8(5, scene & 0xff);
  v.setUint16(6, delay & 0xffff, true);
  v.setUint8(8, n & 0xff);
  for (let i = 0; i < n; i++) v.setUint8(9 + i, critters[i] & 0xff);
  return new Uint8Array(b);
}

/** DROP: the host retiring a slot whose peer has gone, at an agreed FUTURE frame. */
export function encodeDrop(slot, frame) {
  const { b, v } = buf(6);
  v.setUint8(0, MSG.DROP);
  v.setUint8(1, slot & 0xff);
  v.setUint32(2, frame >>> 0, true);
  return new Uint8Array(b);
}

/** RELAY: an inner packet the host passes on to `to`, for a pair of guests whose direct link never formed. */
export function encodeRelay(to, payload) {
  const out = new Uint8Array(2 + payload.length);
  out[0] = MSG.RELAY;
  out[1] = to & 0xff;
  out.set(payload, 2);
  return out;
}

/** PING / PONG carry an opaque id echoed back (RTT needs no clock sync) and the SENDER'S slot. */
export function encodePing(slot, id, type = MSG.PING) {
  const { b, v } = buf(6);
  v.setUint8(0, type);
  v.setUint8(1, slot & 0xff);
  v.setUint32(2, id >>> 0, true);
  return new Uint8Array(b);
}

/** HELLO / LOBBY / BYE carry a small JSON body (roster, critter choices, quit reason). */
export function encodeJson(type, obj) {
  const body = enc.encode(JSON.stringify(obj));
  const out = new Uint8Array(1 + body.length);
  out[0] = type;
  out.set(body, 1);
  return out;
}

/** Decode any message. Returns null for an empty or unknown packet rather than throwing. */
export function decodeMessage(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!u.length) return null;
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const type = u[0];
  switch (type) {
    case MSG.INPUT: {
      if (u.length < 7) return null;
      const slot = v.getUint8(1), baseFrame = v.getUint32(2, true), count = v.getUint8(6);
      if (u.length < 7 + count * 2) return null;
      const masks = new Array(count);
      for (let i = 0; i < count; i++) masks[i] = v.getUint16(7 + i * 2, true);
      return { type, slot, baseFrame, masks };
    }
    case MSG.CHECKSUM:
      return u.length < 10 ? null : { type, slot: v.getUint8(1), frame: v.getUint32(2, true), sum: v.getUint32(6, true) };
    case MSG.START: {
      if (u.length < 9) return null;
      const n = v.getUint8(8);
      if (u.length < 9 + n) return null;
      const critters = new Array(n);
      for (let i = 0; i < n; i++) critters[i] = v.getUint8(9 + i);
      return { type, seed: v.getUint32(1, true), scene: v.getUint8(5), delay: v.getUint16(6, true), critters };
    }
    case MSG.DROP:
      return u.length < 6 ? null : { type, slot: v.getUint8(1), frame: v.getUint32(2, true) };
    case MSG.RELAY:
      return u.length < 3 ? null : { type, to: v.getUint8(1), payload: u.subarray(2) };
    case MSG.PING:
    case MSG.PONG:
      return u.length < 6 ? null : { type, slot: v.getUint8(1), id: v.getUint32(2, true) };
    case MSG.HELLO:
    case MSG.LOBBY:
    case MSG.BYE:
      try { return { type, ...JSON.parse(dec.decode(u.subarray(1)) || '{}') }; } catch { return { type }; }
    default:
      return null;
  }
}
