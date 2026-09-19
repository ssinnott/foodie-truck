// Wire format for lockstep co-op. Everything is little-endian binary sent over an unreliable, unordered
// RTCDataChannel, small enough that it never needs to fragment.
//
// Input is the hot path: a player's actions pack into one uint16 mask, so a frame of input for one player is 2
// bytes. Every INPUT packet repeats the last REDUNDANCY frames, which replaces retransmission entirely: a lost
// packet is covered by the next one. Never make the channel reliable/ordered, a retransmitted input arrives after
// its frame has already been simulated.
//
// Two to four players share one match. Every packet that carries simulation data names the SLOT it came from
// rather than relying on which connection it arrived on: with four players the mesh is six links, and any link
// that fails to form is carried by the host instead (MSG.RELAY), so a packet's sender and its courier are not
// always the same peer.
//
// What is a game's own: its PROTOCOL_VERSION (compared in HELLO, so two builds that would desync refuse to
// start instead), how its action list packs into the mask, and the START packet, whose payload is the host's
// authoritative match parameters and differs per game. A game writes `encodeStart` with `packet()` and hands
// `decodeMessage` its `decodeStart`; every other message is framed here.

/** Frames of input repeated in every INPUT packet. */
export const REDUNDANCY = 8;

export const MSG = { HELLO: 1, LOBBY: 2, START: 3, INPUT: 4, CHECKSUM: 5, PING: 6, PONG: 7, BYE: 8, RELAY: 9, DROP: 10 } as const;

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A fresh packet of `n` bytes and the view to write it through. `packet(n).b` is what goes on the wire. */
export function packet(n: number): { b: ArrayBuffer; v: DataView } { const b = new ArrayBuffer(n); return { b, v: new DataView(b) }; }

/** INPUT: `slot`'s input, masks[0] for `baseFrame` and masks[i] for baseFrame + i. */
export function encodeInput(slot: number, baseFrame: number, masks: readonly number[]): Uint8Array {
  const { b, v } = packet(7 + masks.length * 2);
  v.setUint8(0, MSG.INPUT);
  v.setUint8(1, slot & 0xff);
  v.setUint32(2, baseFrame >>> 0, true);
  v.setUint8(6, masks.length);
  for (let i = 0; i < masks.length; i++) v.setUint16(7 + i * 2, masks[i] & 0xffff, true);
  return new Uint8Array(b);
}

/** CHECKSUM: `slot`'s simulation hash at `frame`. */
export function encodeChecksum(slot: number, frame: number, sum: number): Uint8Array {
  const { b, v } = packet(10);
  v.setUint8(0, MSG.CHECKSUM);
  v.setUint8(1, slot & 0xff);
  v.setUint32(2, frame >>> 0, true);
  v.setUint32(6, sum >>> 0, true);
  return new Uint8Array(b);
}

/**
 * DROP: the host retiring a slot whose peer has gone, at an agreed FUTURE frame. Every peer retires that slot on
 * exactly that frame, so the parting is part of the simulation rather than three machines each noticing a
 * silence at a different moment.
 */
export function encodeDrop(slot: number, frame: number): Uint8Array {
  const { b, v } = packet(6);
  v.setUint8(0, MSG.DROP);
  v.setUint8(1, slot & 0xff);
  v.setUint32(2, frame >>> 0, true);
  return new Uint8Array(b);
}

/**
 * RELAY: an inner packet the host passes on to `to`, for the pair of guests whose direct link never formed. The
 * payload is an ordinary packet carrying its own sender slot, so the far end handles it exactly as if it had
 * arrived down a direct channel.
 */
export function encodeRelay(to: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + payload.length);
  out[0] = MSG.RELAY;
  out[1] = to & 0xff;
  out.set(payload, 2);
  return out;
}

/**
 * PING / PONG carry an opaque id echoed back, so RTT needs no clock sync, and the SENDER'S slot so the answer can
 * be addressed. A ping that came the long way round (via the host's relay) arrives down the host's channel, and
 * replying to the channel it arrived on would answer the wrong player.
 */
export function encodePing(slot: number, id: number, type: number = MSG.PING): Uint8Array {
  const { b, v } = packet(6);
  v.setUint8(0, type);
  v.setUint8(1, slot & 0xff);
  v.setUint32(2, id >>> 0, true);
  return new Uint8Array(b);
}

/** HELLO / LOBBY / BYE carry a small JSON body (roster, character choices, quit reason). */
export function encodeJson(type: number, obj: unknown): Uint8Array {
  const body = enc.encode(JSON.stringify(obj));
  const out = new Uint8Array(1 + body.length);
  out[0] = type;
  out.set(body, 1);
  return out;
}

/**
 * A decoded packet: its `type` and whatever fields that message carries. Loose on purpose: the JSON messages
 * carry a game's own roster shape, and START carries a game's own parameters.
 */
export type Decoded = { type: number } & Record<string, any>;

/**
 * A game's START decoder: given the whole packet (`u[0]` is MSG.START) and a view over it, return the parameters,
 * or null when the packet is short. Must never throw on a truncated packet.
 */
export type StartDecoder = (u: Uint8Array, v: DataView) => Record<string, unknown> | null;

/**
 * Decode any message. Returns null for an empty, truncated or unknown packet rather than throwing. START is
 * decoded by the game's `decodeStart`; without one it comes back as `{ type, payload }` with the bytes after the
 * type byte.
 */
export function decodeMessage(bytes: Uint8Array | ArrayBuffer, decodeStart?: StartDecoder): Decoded | null {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!u.length) return null;
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const type = u[0];
  switch (type) {
    case MSG.INPUT: {
      if (u.length < 7) return null;
      const slot = v.getUint8(1), baseFrame = v.getUint32(2, true), count = v.getUint8(6);
      if (u.length < 7 + count * 2) return null;
      const masks = new Array<number>(count);
      for (let i = 0; i < count; i++) masks[i] = v.getUint16(7 + i * 2, true);
      return { type, slot, baseFrame, masks };
    }
    case MSG.CHECKSUM:
      return u.length < 10 ? null : { type, slot: v.getUint8(1), frame: v.getUint32(2, true), sum: v.getUint32(6, true) };
    case MSG.START: {
      if (!decodeStart) return { type, payload: u.subarray(1) };
      const params = decodeStart(u, v);
      return params ? { type, ...params } : null;
    }
    case MSG.DROP:
      return u.length < 6 ? null : { type, slot: v.getUint8(1), frame: v.getUint32(2, true) };
    case MSG.RELAY:
      // The payload is handed on as a view, never copied: relaying is on the per-frame path.
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
