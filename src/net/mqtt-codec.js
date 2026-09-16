// Minimal MQTT 3.1.1 packet codec — the subset needed to use a public broker as a WebRTC
// signalling rendezvous: CONNECT, SUBSCRIBE, PUBLISH (QoS 0), PINGREQ, DISCONNECT.
//
// This is pure encode/decode with no I/O so it can be unit tested in Node (tools/nettest.js).
// The socket wiring lives in net/signal-mqtt.js.
//
// A WebSocket message does NOT align with an MQTT packet: one frame may carry several packets,
// or half of one. `createParser()` handles that; never parse a frame in isolation.

export const PKT = { CONNECT: 1, CONNACK: 2, PUBLISH: 3, SUBSCRIBE: 8, SUBACK: 9, PINGREQ: 12, PINGRESP: 13, DISCONNECT: 14 };

const enc = new TextEncoder();
const dec = new TextDecoder();

/** MQTT "remaining length": 7 bits per byte, high bit = continuation. Max 4 bytes. */
export function encodeLength(n) {
  const out = [];
  do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 0x80; out.push(b); } while (n > 0 && out.length < 4);
  return out;
}

/** Decode a remaining length at `i`. Returns null when more bytes are needed. */
export function decodeLength(buf, i) {
  let mult = 1, value = 0, bytes = 0, b;
  do {
    if (i + bytes >= buf.length) return null;      // incomplete — wait for more data
    if (bytes >= 4) throw new Error('mqtt: malformed remaining length');
    b = buf[i + bytes];
    value += (b & 0x7f) * mult;
    mult *= 128;
    bytes++;
  } while (b & 0x80);
  return { value, bytes };
}

function str(s) { const b = enc.encode(s); return [b.length >> 8, b.length & 0xff, ...b]; }

function packet(type, flags, body) {
  return new Uint8Array([(type << 4) | flags, ...encodeLength(body.length), ...body]);
}

/** CONNECT with a clean session and no credentials (public brokers accept anonymous clients). */
export function encodeConnect(clientId, keepaliveSec = 45) {
  return packet(PKT.CONNECT, 0, [...str('MQTT'), 0x04, 0x02, keepaliveSec >> 8, keepaliveSec & 0xff, ...str(clientId)]);
}

/** SUBSCRIBE at QoS 0. The 0x02 fixed-header flag is required by the spec. */
export function encodeSubscribe(packetId, topic) {
  return packet(PKT.SUBSCRIBE, 0x02, [packetId >> 8, packetId & 0xff, ...str(topic), 0x00]);
}

/** PUBLISH at QoS 0 (fire and forget — there is no packet id and no acknowledgement). */
export function encodePublish(topic, payload) {
  const body = typeof payload === 'string' ? enc.encode(payload) : payload;
  return packet(PKT.PUBLISH, 0, [...str(topic), ...body]);
}

export function encodePingReq() { return packet(PKT.PINGREQ, 0, []); }
export function encodeDisconnect() { return packet(PKT.DISCONNECT, 0, []); }

/**
 * Streaming packet parser. Feed it every WebSocket frame; it emits whole packets only.
 * @returns {{ push(bytes: Uint8Array): Array<{type: number, flags: number, body: Uint8Array,
 *   topic?: string, payload?: string}> }}
 */
export function createParser() {
  let buf = new Uint8Array(0);
  return {
    push(bytes) {
      const merged = new Uint8Array(buf.length + bytes.length);
      merged.set(buf); merged.set(bytes, buf.length);
      buf = merged;
      const out = [];
      for (;;) {
        if (buf.length < 2) break;
        const len = decodeLength(buf, 1);
        if (!len) break;                                   // remaining-length not fully arrived
        const start = 1 + len.bytes, total = start + len.value;
        if (buf.length < total) break;                     // body not fully arrived
        const type = buf[0] >> 4, flags = buf[0] & 0x0f;
        const body = buf.subarray(start, total);
        const msg = { type, flags, body };   // CONNACK's return code lives in body[1]
        if (type === PKT.PUBLISH) {
          const tl = (body[0] << 8) | body[1];
          msg.topic = dec.decode(body.subarray(2, 2 + tl));
          msg.payload = dec.decode(body.subarray(2 + tl));  // QoS 0 only: no packet id
        }
        out.push(msg);
        buf = buf.subarray(total);
      }
      return out;
    },
  };
}
