// Signalling strategies: the small out-of-band channel two browsers use to exchange WebRTC
// descriptions before they can talk directly (docs/MULTIPLAYER.md). Ported from the sibling game.
//
// A strategy is { send(obj), onMessage(fn), close() }: a live rendezvous every peer can publish to
// before they talk directly. Room codes (the HOST KEY the lobby shows) over a public MQTT broker are
// the one the game offers; BroadcastChannel reaches several tabs of a single origin and exists for the
// end-to-end test.
//
// A room holds up to four players, so one rendezvous carries the traffic of up to six pairings. Each
// peer publishes under its own short id and addresses a message to one other peer with `to`;
// createSignalMux() below splits that single channel back into a private channel per pairing, which
// is what net/peer.js expects. A message with no `to` is an announcement meant for the whole room.
//
// The page is served over HTTPS, so every socket here MUST be wss:// - a ws:// URL is blocked as
// mixed content with no visible error.

import { createParser, encodeConnect, encodeSubscribe, encodePublish, encodePingReq, PKT } from '../lib/net/mqtt-codec.ts';

/** Room codes: no vowels (so no accidental words) and no 0/O/1/I/L ambiguity when read aloud. */
export const ALPHABET = '23456789BCDFGHJKMNPQRSTVWXYZ';
/** Rendezvous namespace: keeps this game's rooms apart from any other game on the same public brokers. */
export const APP_ID = 'foodie-truck';

/** A short, unambiguous, unguessable room code (the HOST KEY). */
export function makeRoomCode(len = 6) {
  const out = [];
  const buf = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < len; i++) buf[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < len; i++) out.push(ALPHABET[buf[i] % ALPHABET.length]);
  return out.join('');
}

/** Two tabs of the same origin. Zero infrastructure and always available: the end-to-end playtest's transport. */
export function broadcastSignal(room, id) {
  const bc = new BroadcastChannel(APP_ID + '-net:' + room);
  let handler = null;
  bc.onmessage = (e) => { const m = e.data; if (m && m.from !== id && handler) handler(m); };
  return {
    send(obj) { try { bc.postMessage({ from: id, ...obj }); } catch { /* channel closed */ } },
    onMessage(fn) { handler = fn; },
    close() { try { bc.close(); } catch { /* already closed */ } },
  };
}

/** Public MQTT brokers over WSS. Tried in order; the first that connects wins. */
export const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

/**
 * Rendezvous through a public MQTT broker. Every peer in the room subscribes to the one room topic
 * and publishes there; QoS 0 means a message sent before another peer subscribed is simply lost,
 * which is why the session repeats its announcement until the exchange happens.
 * @returns {Promise<object>} a signal channel, once CONNACK has arrived
 */
export function mqttSignal(room, id, brokers = MQTT_BROKERS) {
  const topic = `${APP_ID}/${room}`;
  return new Promise((resolve, reject) => {
    let i = 0;
    let lastError = '';
    const tryNext = () => {
      if (i >= brokers.length) { reject(new Error(lastError || 'no MQTT broker reachable')); return; }
      const url = brokers[i++];
      let ws;
      try { ws = new WebSocket(url, 'mqtt'); } catch { tryNext(); return; }
      ws.binaryType = 'arraybuffer';
      const parser = createParser();
      let handler = null, ping = 0, settled = false;
      const fail = () => { if (settled) return; settled = true; clearInterval(ping); try { ws.close(); } catch { /* ignore */ } tryNext(); };
      const timer = setTimeout(fail, 8000);

      ws.onerror = fail;
      ws.onclose = fail;
      ws.onopen = () => ws.send(encodeConnect(`ft-${id}-${makeRoomCode(4)}`));
      ws.onmessage = (e) => {
        for (const p of parser.push(new Uint8Array(e.data))) {
          if (p.type === PKT.CONNACK) {
            // Return code 0 is "accepted". A rate-limiting broker answers with a non-zero code and then
            // closes; treating that as success would disarm the fallback to the next broker.
            const rc = p.body && p.body.length > 1 ? p.body[1] : 0;
            if (rc !== 0) { lastError = `rendezvous refused the connection (0x${rc.toString(16)})`; fail(); return; }
            ws.send(encodeSubscribe(1, topic));
            clearTimeout(timer);
            settled = true;
            ping = setInterval(() => { try { ws.send(encodePingReq()); } catch { /* ignore */ } }, 30000);
            const chan = {
              send(obj) { try { ws.send(encodePublish(topic, JSON.stringify({ from: id, ...obj }))); } catch { /* ignore */ } },
              onMessage(fn) { handler = fn; },
              close() { clearInterval(ping); try { ws.close(); } catch { /* ignore */ } },
              /** Set by the caller to hear about the rendezvous dying (a broker drop is invisible otherwise). */
              onDown: null,
              url,
            };
            ws.onclose = () => { clearInterval(ping); if (chan.onDown) chan.onDown('rendezvous disconnected'); };
            resolve(chan);
          } else if (p.type === PKT.PUBLISH && p.topic === topic && handler) {
            let m = null;
            try { m = JSON.parse(p.payload); } catch { /* not ours */ }
            if (m && m.from !== id) handler(m);   // the broker echoes our own publishes back
          }
        }
      };
    };
    tryNext();
  });
}

/**
 * Split one room rendezvous into a private channel per pairing.
 *
 * net/peer.js was written against a channel that carries exactly one pairing's offer, answer and
 * candidates, and that is still what it gets: `channel(peerId)` hands it a view of the shared
 * rendezvous that tags everything it sends with `to` and only delivers what that peer addressed
 * back. Closing such a view unsubscribes the pairing and leaves the rendezvous up for the others.
 * Anything with no `to` is an announcement (who is here, whether the room is open) and goes to onAnnounce.
 *
 * @param {{ send: (o: object) => void, onMessage: (fn: (m: object) => void) => void, close: () => void }} signal
 * @param {string} myId this peer's id, which is what `to` is checked against
 */
export function createSignalMux(signal, myId) {
  const chans = new Map();
  let onAnnounce = null;
  signal.onMessage((m) => {
    if (!m || !m.from) return;
    if (!m.to) { if (onAnnounce) onAnnounce(m); return; }
    // Addressed to somebody else: every peer sees every pairing's offers, and answering another
    // pair's negotiation with our own connection wrecks both of them.
    if (m.to !== myId) return;
    const c = chans.get(m.from);
    if (c && c.handler) c.handler(m);
  });
  return {
    onAnnounce(fn) { onAnnounce = fn; },
    announce(obj) { signal.send(obj); },
    has(peerId) { return chans.has(peerId); },
    channel(peerId) {
      const c = {
        handler: null,
        send(obj) { signal.send({ to: peerId, ...obj }); },
        onMessage(fn) { c.handler = fn; },
        close() { chans.delete(peerId); },
      };
      chans.set(peerId, c);
      return c;
    },
    close() { chans.clear(); try { signal.close(); } catch { /* already closed */ } },
  };
}
