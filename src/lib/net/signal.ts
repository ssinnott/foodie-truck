// Signalling strategies: the small out-of-band channel two browsers use to exchange WebRTC descriptions before
// they can talk directly.
//
// A strategy is { send(obj), onMessage(fn), close() }: a live rendezvous every peer can publish to before they
// talk directly. Room codes over a public MQTT broker are the one a game offers; BroadcastChannel reaches
// several tabs of a single origin and exists for the end-to-end test.
//
// A room holds up to four players, so one rendezvous carries the traffic of up to six pairings. Each peer
// publishes under its own short id and addresses a message to one other peer with `to`; createSignalMux() below
// splits that single channel back into a private channel per pairing, which is what peer.ts expects. A message
// with no `to` is an announcement meant for the whole room.
//
// Both avoid a server anyone operates. A game's page is served over HTTPS, so every socket here MUST be wss://,
// a ws:// URL is blocked as mixed content with no visible error.
//
// What is a game's own: its APP_ID, the namespace that keeps its rooms apart from every other game on the same
// public brokers. `createSignalling({ appId })` binds the two strategies to it.

import { createParser, encodeConnect, encodeSubscribe, encodePublish, encodePingReq, PKT } from './mqtt-codec.ts';

/**
 * Room codes: no vowels (so no accidental words) and no 0/O/1/I/L ambiguity when read aloud. Every code is drawn
 * from this set, so it is also the set a lobby's on-screen picker offers a player with no keyboard.
 */
export const ROOM_ALPHABET = '23456789BCDFGHJKMNPQRSTVWXYZ';

/** A short, unambiguous, unguessable room code. */
export function makeRoomCode(len = 6): string {
  const out: string[] = [];
  const buf = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < len; i++) buf[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < len; i++) out.push(ROOM_ALPHABET[buf[i] % ROOM_ALPHABET.length]);
  return out.join('');
}

/**
 * What travels over a rendezvous: `from` is stamped on by the strategy, `to` addresses one pairing, and the rest
 * is whatever the pairing (peer.ts's SignalMessage) or the room (a game's announcements) put in it. Wire JSON, so
 * the rest is `any`: that is also what lets a mux channel stand in for peer.ts's SignalChannel.
 */
export interface SignalEnvelope {
  from?: string;
  to?: string;
  [key: string]: any;
}

/**
 * A live rendezvous, as the strategies hand it over. `onDown` is installed by the caller rather than offered by
 * the strategy: a broker that drops the socket has no other way to say so, and publishing into a closed one
 * throws nothing.
 */
export interface Rendezvous {
  send(obj: SignalEnvelope): void;
  onMessage(fn: (m: SignalEnvelope | null) => void): void;
  close(): void;
  onDown?: ((why?: string) => void) | null;
  /** The broker that answered (MQTT only). */
  url?: string;
}

/** Public MQTT brokers over WSS. Tried in order; the first that connects wins. */
export const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

/** What binds the strategies to one game. */
export interface SignallingOptions {
  /** Rendezvous namespace: the MQTT topic prefix and the BroadcastChannel name. */
  appId: string;
  /** Prefix of the MQTT client id (a broker wants them unique, not meaningful). Default: the first two letters of `appId`. */
  clientPrefix?: string;
}

/** The two strategies, bound to a game's namespace. */
export interface Signalling {
  /**
   * Two tabs of the same origin. Zero infrastructure and always available, so it is the transport the end-to-end
   * playtest uses (`?transport=broadcast`); the game's UI only offers room codes.
   */
  broadcastSignal(room: string, id: string): Rendezvous;
  /**
   * Rendezvous through a public MQTT broker. Every peer in the room subscribes to the one room topic and publishes
   * there; QoS 0 means a message sent before another peer subscribed is simply lost, which is why a session
   * repeats its announcement until the exchange happens. Resolves once CONNACK has arrived.
   */
  mqttSignal(room: string, id: string, brokers?: readonly string[]): Promise<Rendezvous>;
}

export function createSignalling({ appId, clientPrefix = appId.slice(0, 2) }: SignallingOptions): Signalling {
  return {
    broadcastSignal(room, id) {
      const bc = new BroadcastChannel(`${appId}-net:${room}`);
      let handler: ((m: SignalEnvelope) => void) | null = null;
      bc.onmessage = (e) => { const m = e.data as SignalEnvelope; if (m && m.from !== id && handler) handler(m); };
      return {
        send(obj) { try { bc.postMessage({ from: id, ...obj }); } catch { /* channel closed */ } },
        onMessage(fn) { handler = fn; },
        close() { try { bc.close(); } catch { /* already closed */ } },
      };
    },

    mqttSignal(room, id, brokers = MQTT_BROKERS) {
      const topic = `${appId}/${room}`;
      return new Promise((resolve, reject) => {
        let i = 0;
        let lastError = '';
        const tryNext = () => {
          if (i >= brokers.length) { reject(new Error(lastError || 'no MQTT broker reachable')); return; }
          const url = brokers[i++];
          let ws: WebSocket;
          try { ws = new WebSocket(url, 'mqtt'); } catch { tryNext(); return; }
          ws.binaryType = 'arraybuffer';
          const parser = createParser();
          let handler: ((m: SignalEnvelope) => void) | null = null, ping = 0, settled = false;
          const fail = () => { if (settled) return; settled = true; clearInterval(ping); try { ws.close(); } catch { /* ignore */ } tryNext(); };
          const timer = setTimeout(fail, 8000);

          ws.onerror = fail;
          ws.onclose = fail;
          ws.onopen = () => ws.send(encodeConnect(`${clientPrefix}-${id}-${makeRoomCode(4)}`));
          ws.onmessage = (e) => {
            for (const p of parser.push(new Uint8Array(e.data as ArrayBuffer))) {
              if (p.type === PKT.CONNACK) {
                // Return code 0 is "accepted". A public broker that is rate-limiting answers with a non-zero code
                // and then closes; treating that as success gives a channel whose every publish is silently
                // swallowed, and disarms the fallback to the next broker.
                const rc = p.body && p.body.length > 1 ? p.body[1] : 0;
                if (rc !== 0) { lastError = `rendezvous refused the connection (0x${rc.toString(16)})`; fail(); return; }
                ws.send(encodeSubscribe(1, topic));
                clearTimeout(timer);
                settled = true;
                ping = window.setInterval(() => { try { ws.send(encodePingReq()); } catch { /* ignore */ } }, 30000);
                const chan: Rendezvous = {
                  send(obj) { try { ws.send(encodePublish(topic, JSON.stringify({ from: id, ...obj }))); } catch { /* ignore */ } },
                  onMessage(fn) { handler = fn; },
                  close() { clearInterval(ping); try { ws.close(); } catch { /* ignore */ } },
                  onDown: null,
                  url,
                };
                ws.onclose = () => { clearInterval(ping); if (chan.onDown) chan.onDown('rendezvous disconnected'); };
                resolve(chan);
              } else if (p.type === PKT.PUBLISH && p.topic === topic && handler) {
                let m: SignalEnvelope | null = null;
                try { m = JSON.parse(String(p.payload)); } catch { /* not ours */ }
                if (m && m.from !== id) handler(m);   // the broker echoes our own publishes back
              }
            }
          };
        };
        tryNext();
      });
    },
  };
}

/**
 * A pairing's private view of the rendezvous: what peer.ts is handed as its signal channel. It dispatches and does
 * not read, so what a message contains is the pairing's business (peer.ts's SignalMessage), not typed here.
 */
export interface MuxChannel {
  handler: ((m: any) => void) | null;
  send(obj: object): void;
  onMessage(fn: (m: any) => void): void;
  close(): void;
}

/** The demultiplexer `createSignalMux` returns. */
export interface SignalMux {
  /** Hear the room's announcements: { from, ...payload } from a peer we may not know yet. */
  onAnnounce(fn: (m: SignalEnvelope) => void): void;
  /** Publish to the whole room (no `to`), for those announcements. */
  announce(obj: SignalEnvelope): void;
  /** True once a channel for this peer exists, so an announcement does not open a second one. */
  has(peerId: string): boolean;
  /** A peer.ts-shaped signal channel private to one pairing. */
  channel(peerId: string): MuxChannel;
  /** Tear down the rendezvous itself, once the room no longer needs it. */
  close(): void;
}

/**
 * Split one room rendezvous into a private channel per pairing.
 *
 * peer.ts was written against a channel that carries exactly one pairing's offer, answer and candidates, and
 * that is still what it gets: `channel(peerId)` hands it a view of the shared rendezvous that tags everything it
 * sends with `to` and only delivers what that peer addressed back. Closing such a view unsubscribes the pairing
 * and leaves the rendezvous up for the others: a peer connection failing must never take the room's signalling
 * down with it.
 *
 * Anything with no `to` is an announcement (who is here, and whether the room is still open) and goes to
 * onAnnounce instead; those are how a peer learns an id to open a channel for at all.
 */
export function createSignalMux(signal: Pick<Rendezvous, 'send' | 'onMessage' | 'close'>, myId: string): SignalMux {
  const chans = new Map<string, MuxChannel>();
  let onAnnounce: ((m: SignalEnvelope) => void) | null = null;
  signal.onMessage((m) => {
    if (!m || !m.from) return;
    if (!m.to) { if (onAnnounce) onAnnounce(m); return; }
    // Addressed, and not to us: a room's rendezvous is one broadcast channel, so every peer sees every pairing's
    // offers and candidates. Handing another pair's offer to our own peer object answers a negotiation that was
    // never ours and wrecks both of them.
    if (m.to !== myId) return;
    const c = chans.get(m.from);
    if (c && c.handler) c.handler(m);
  });
  return {
    onAnnounce(fn) { onAnnounce = fn; },
    announce(obj) { signal.send(obj); },
    has(peerId) { return chans.has(peerId); },
    channel(peerId) {
      const c: MuxChannel = {
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
