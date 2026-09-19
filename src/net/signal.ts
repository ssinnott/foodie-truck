// Signalling for online co-op (docs/MULTIPLAYER.md): the library's two strategies (src/lib/net/signal.ts) bound to
// this game's rendezvous namespace. The HOST KEY the lobby shows is a room code; the MQTT topic and the test
// channel's name are derived from APP_ID, which keeps this game's rooms apart from any other game on the same
// public brokers.
import { createSignalling } from '../lib/net/signal.ts';

/** Rendezvous namespace: the MQTT topic prefix (`foodie-truck/<ROOM>`) and the test channel's name. */
export const APP_ID = 'foodie-truck';

export { ROOM_ALPHABET as ALPHABET, ROOM_ALPHABET, MQTT_BROKERS, makeRoomCode, createSignalMux } from '../lib/net/signal.ts';
export type { Rendezvous, SignalEnvelope, SignalMux, MuxChannel } from '../lib/net/signal.ts';

/** The two strategies: `?transport=broadcast` for the end-to-end playtest, room codes over MQTT for players. */
export const { broadcastSignal, mqttSignal } = createSignalling({ appId: APP_ID, clientPrefix: 'ft' });
