// Online co-op session: signalling -> peers -> lobby -> synchronised match (docs/MULTIPLAYER.md).
// Ported from the sibling game's net/session.js against this game's run contract (game/run.js). The
// room around the match (announcements, mesh, roster, picks, latency) is net/roster.js; this file is
// the state machine, the match boundary and the per-frame lockstep pump for a party of TWO TO FOUR.
//
// The rules that keep every peer identical live here, and each exists because breaking it desyncs
// the match:
//
//  * The local device is always read through keyboard block 0 (input.pollRaw(0)), whichever seat this
//    peer holds. Everyone sits alone at their own keyboard on P1's keys, so there is nothing for a seat
//    assignment to switch out from under them.
//  * Missing remote input NEVER becomes a neutral mask. Zero-filling manufactures a release edge and a
//    re-press edge that no player made. We stall instead: canStep() gates the loop, and beforeStep()
//    refuses to inject or advance without every seat's input even when loop.step(n) skips the gate.
//  * A player who vanishes mid-match is retired by the HOST on an announced frame (DROP), so every
//    remaining machine reads that seat as neutral from the same frame. Three peers each noticing a
//    silence at their own moment would be three different simulations.
//  * The RNG, the run, the frame counter and every seat's input are reset at the match boundary, so
//    every peer starts level whatever it was doing before the START packet arrived.
//
// TOPOLOGY. Every player holds a direct WebRTC link to every other where one can be formed - four
// players are six links - and each peer sends only its OWN input, to everyone, once per frame. A full
// mesh keeps the delay honest: routing a guest's input through the host would put two network hops
// between two players on fast connections. Without a TURN relay some pairs cannot see each other at all
// (symmetric NAT at both ends), so any link that fails to form falls back to the host, who forwards
// those packets on (MSG.RELAY). The host is the one peer everybody must reach: they are also the
// authority for the roster and the START parameters, and the session ends for everyone if they leave.

import { rng, freshSeed } from '../lib/engine/rng.ts';
import { NET_PLAYERS, NET_MIN_PLAYERS } from '../constants.ts';
import { startRun, SCENES, START_SCENE } from '../game/run.ts';
import { createLockstep } from '../lib/net/lockstep.ts';
import { runChecksum } from './checksum.ts';
import { broadcastSignal, mqttSignal, makeRoomCode, createSignalMux } from './signal.ts';
import { MSG, PROTOCOL_VERSION, encodeInput, encodeChecksum, encodeStart, encodeJson, encodePing, encodeDrop, decodeMessage } from './protocol.ts';
import { createRoom, resetSeats, releaseSeats } from './roster.ts';
import type { Desync, Lockstep } from '../lib/net/lockstep.ts';
import type { Peer } from '../lib/net/peer.ts';
import type { Game, Input, Run } from '../game/game.ts';

/**
 * Wall-clock milliseconds without remote input before a silent player is given up on. Counted in real
 * time, NOT in ticks: canStep() runs once per rAF, so a 144Hz display would reach a tick count three
 * times sooner than a 60Hz one and kill sessions over a survivable blip.
 */
const STALL_TIMEOUT_MS = 8000;
/** The same, for a player whose connection has actually gone: there is nothing left to wait for
 *  except the party converging on the last frame they played. */
const DEAD_LINK_STALL_MS = 2000;
/** A guest waits this much longer than the host's own timeout before giving up on the whole match:
 *  the host is the one who declares a drop, and this is the margin for that word to arrive. */
const HOST_DECISION_MS = 4000;
/** Milliseconds of stall before the "waiting" overlay appears, and the minimum it stays up. */
const WAIT_SHOW_MS = 220, WAIT_HOLD_MS = 500;
/** How often a stalled peer retransmits its window, in gated rAF ticks. */
const RESEND_EVERY = 3;
/** How often a peer publishes "I am here" on the rendezvous while the room is still filling. */
const ANNOUNCE_MS = 800;
/** How long the host waits for a guest's latency report before starting without it. */
const RTT_REPORT_GRACE_MS = 3000;
/** The disconnect watchdog's period. On a timer, never off rAF (see applyStart). */
const WATCHDOG_MS = 250;

/** Turn a measured round-trip time into an input delay in frames, clamped to something playable. */
export function delayForRtt(rttMs: number | null): number {
  if (rttMs == null) return 3;
  const oneWay = rttMs / 2 / (1000 / 60);        // one-way latency in frames
  return Math.max(2, Math.min(10, Math.ceil(oneWay) + 1));   // must exceed one-way latency (tools/nettest.js)
}

// ---- the session's shape -------------------------------------------------------------------------

/**
 * Where a session is in its life, in the order `setState` moves it through. 'playing' is the one with
 * a meaning beyond the lobby's status line: it is the state in which the simulation is under lockstep
 * control, and `net.active` is exactly this test.
 */
export type NetState = 'idle' | 'signalling' | 'connecting' | 'lobby' | 'playing' | 'ended';

/** What createNetSession is opened with: the lobby screen's `open()`, or the hooks at the foot of this file. */
export interface NetSessionOptions {
  /** The shell. The session seeds its rng, rebuilds its run and resets its screens through this. */
  game: Game;
  /** The input service: read through keyboard block 0, written one virtual seat per player. */
  input: Input;
  /** True on the peer that mints the room code, owns the roster and declares the drops. */
  isHost: boolean;
  /** The HOST KEY. A guest brings one; the host mints one when this is empty. */
  room?: string;
  /**
   * 'mqtt' (room codes over a public broker) or 'broadcast' (the same-machine end-to-end test hook).
   * A string rather than that union because it arrives from the URL through game.ts's GameOptions.
   */
  transport?: string;
  /** Called on every state change, for a screen to redraw on; re-pointed later by `onStateChange`. */
  onState?: ((s: NetState) => void) | null;
}

/**
 * One seat of the host's roster: what net/roster.ts's makeMember builds, sortRoster copies and every
 * peer stores indexed by slot. roster.ts owns this shape (it states the same fields in a @typedef);
 * this file reads it for the party, the picks, the latency report and the seat a drop retires.
 */
export interface RosterMember {
  /** That peer's id on the rendezvous, which is also its key in the link table. */
  pid: string;
  /** Seat 0..3. Seats are dense and the host is always 0 (roster.ts). */
  slot: number;
  /** Cast INDEX, not a cast id: compared modulo the cast length, exactly as game/run.ts seats it. */
  critter: number;
  ready: boolean;
  /** True for this machine's own seat. */
  local: boolean;
  /** The guest's request counter, echoed back by the host so a stale roster cannot rubber-band them. */
  seq: number;
  /** The worst round trip that peer reported, or null until it has measured one. */
  rtt: number | null;
  /** True once a match has retired the seat. */
  gone: boolean;
}

/** The lobby half of a session: this peer's own pick and stamp, the host's opening scene, the roster. */
export interface NetLobby {
  /** This peer's cast index. */
  myCritter: number;
  myReady: boolean;
  /** The host's opening scene: an index into game/run.ts SCENES. */
  scene: number;
  /** The host's roster, indexed by slot. */
  members: RosterMember[];
}

/**
 * One seat as `net.party()` hands it over (net/roster.ts): plain data in slot order, rebuilt on every
 * read. A lobby screen draws from these and never from the roster itself.
 */
export interface NetPartySeat {
  slot: number;
  /** Cast index, as RosterMember.critter. */
  critter: number;
  ready: boolean;
  /** True for this machine's own seat. */
  local: boolean;
  /** True once a match has retired the seat. */
  gone: boolean;
  /** True while a direct link to that player is open, rather than the host's relay. */
  direct: boolean;
}

/** The last seat a match retired: the slot and the wall clock it happened at, for a status line. */
export interface NetDrop {
  slot: number;
  /** performance.now() at the moment the simulation reached the drop frame. Display only. */
  at: number;
}

/**
 * The host's START parameters: the one packet every peer must read identically (net/protocol.ts
 * encodeStart, decodeMessage). Everything after applying it is lockstep.
 */
export interface StartParams {
  /** The run's seed, chosen once by the host before any simulation. */
  seed: number;
  /** The screen the match opens on: an index into game/run.ts SCENES. */
  scene: number;
  /** Frames between recording input and simulating it. */
  delay: number;
  /** One cast index per seat, in slot order; its length IS the party size. */
  critters: number[];
}

/**
 * One link of the mesh, keyed by peer id: what net/roster.ts's createLinks builds around a
 * lib/net/peer.ts connection. roster.ts owns the shape (it describes these fields in a comment over
 * the table); this file is handed them by onPacket / onLinkClosed and holds the table on `net.links`.
 */
export interface NetLink {
  /** The peer at the far end. */
  pid: string;
  /** True for the link to the host: the one link every guest must have, and losing it ends the session. */
  isHost: boolean;
  /** True once both data channels are carrying traffic. */
  open: boolean;
  /** The WebRTC connection under it. */
  peer: Peer;
  /** Date.now() when the link was created, for the formation sweep. */
  since: number;
  /** True while it is being torn down deliberately, so its closing is not read as a disconnect. */
  retiring: boolean;
}

/** Everything a test or a status line wants to know about a session, as plain data (`net.summary()`). */
export interface NetSummary {
  state: NetState;
  /** The HOST KEY. */
  room: string;
  pid: string;
  /** Our seat, or -1 before the host has seated us. */
  slot: number;
  players: number;
  delay: number;
  rtt: number | null;
  rttReady: boolean;
  waiting: boolean;
  /** Slots the current frame is waiting for. */
  missing: number[];
  /** Frames simulated so far, or -1 when no match is on. */
  frame: number;
  desync: Desync | null;
  /** `endReason`. */
  reason: string;
  error: string;
  /** The host's opening scene (an index into game/run.ts SCENES). */
  scene: number;
  myCritter: number;
  myReady: boolean;
  party: NetPartySeat[];
  /** The slots a match has retired, in slot order. */
  dropped: number[];
  lastDrop: NetDrop | null;
}

/**
 * The session object: the state the literal in createNetSession starts with, the methods that function
 * assigns under it, and the lobby API net/roster.ts installs onto it (remoteSlots, party, critterTaken,
 * setCritter, setReady). Nothing here is optional - all of it is in place by the time createNetSession
 * returns - and the split below is only about where each member is written.
 */
export interface NetSession {
  // ---- state, from the literal ----
  /** True on the peer that mints the room code, owns the roster and declares the drops. */
  isHost: boolean;
  /** The HOST KEY: minted by the host, typed in (or taken from ?room=) by a guest. */
  room: string;
  /** 'mqtt' or 'broadcast', as NetSessionOptions describes them. */
  transport: string;
  /** This peer's id on the rendezvous. Unique per page load, and nothing but an address. */
  pid: string;
  state: NetState;
  /** Why a session could not be opened, for the lobby's error line. */
  error: string;
  /** The reason `end()` was given, for the same line. */
  endReason: string;
  /** Our seat in the party. The host is always 0; a guest has -1 until the host seats them. */
  localSlot: number;
  /** Party size, which is simply how many people are in the room until the match starts. */
  players: number;
  /** Frames between recording input and simulating it, fixed for the match by the START packet. */
  delay: number;
  /** Worst round-trip time to anyone in the party, which is what the delay has to cover. */
  rtt: number | null;
  /** True once a ping measurement exists; the match will not auto-start before this. */
  rttReady: boolean;
  /** Set when a peer reports a different protocol version. */
  versionMismatch: boolean;
  lobby: NetLobby;
  /** The frame bookkeeping, for as long as a match is on, and null at every other moment. */
  ls: Lockstep | null;
  /** pid -> link record, one per pairing (roster.ts createLinks). */
  links: Map<string, NetLink> | null;
  /** The room's rendezvous. `any`: net/signal.ts is not typed yet, and its two strategies (broadcastSignal, mqttSignal) return different shapes. */
  signal: any;
  /** That rendezvous split into one channel per pairing (signal.ts createSignalMux). `any` for the reason `signal` is. */
  mux: any;
  /** True while the simulation is under lockstep control. */
  readonly active: boolean;
  /** True while waiting on somebody (a gameplay screen draws an overlay on this). */
  waiting: boolean;
  /** Slots the current frame is waiting for, for that overlay. */
  missing: number[];
  /** The last seat retired mid-match (wall clock, display only). */
  lastDrop: NetDrop | null;
  /** The checksum disagreement that ended the match, if one did. */
  desync: Desync | null;
  /** The frame a seat was retired on, or -1 while they are still playing. */
  dropFrameOf(slot: number): number;
  /** Re-point the state callback: a session outlives the screen that opened it. */
  onStateChange(fn: ((s: NetState) => void) | null): void;

  // ---- the session's own API, assigned under the literal ----
  /** Begin connecting. Resolves once signalling is up; the other players arrive asynchronously. */
  start(): Promise<boolean>;
  /** Host only: fix the session parameters and tell the party. False when the party is not startable. */
  beginMatch(scene?: number): boolean;
  /** Come off lockstep and put the party back in the lobby, keeping every link and every pick. */
  matchOver(): boolean;
  /** Gate for createLoop's canUpdate: false while somebody's input for this frame has not arrived. */
  canStep(): boolean;
  /** Sample, share and inject this frame's input. False - injecting nothing - when the frame cannot be simulated. */
  beforeStep(): boolean;
  /** Exchange a checksum periodically, for a frame beforeStep actually prepared. */
  afterStep(): void;
  /** Tear the session down, with the reason the lobby shows. */
  end(reason?: string): void;
  /** Leave the room for good: end the session and hand every seat back to the real devices. */
  leave(): void;
  summary(): NetSummary;

  // ---- the lobby API, installed by net/roster.ts createRoom ----
  /** Everyone but us, by slot, in seat order. */
  remoteSlots(): number[];
  /** The seated party, in slot order, for a lobby screen to draw. */
  party(): NetPartySeat[];
  /** True when another seat holds critter `i` (modulo the cast), so this player may not take it. */
  critterTaken(i: number): boolean;
  /** Pick a critter. A pick that collides with somebody else's is refused; the host arbitrates. */
  setCritter(i: number): boolean;
  /** Stamp (or un-stamp) this peer's seat READY. */
  setReady(on: boolean): boolean;
}

/**
 * @param {{ game: any, input: any, isHost: boolean, room?: string, transport?: 'mqtt'|'broadcast',
 *           onState?: ((s: string) => void) | null }} o
 */
export function createNetSession({ game, input, isHost, room: roomCode = '', transport = 'mqtt', onState = null }: NetSessionOptions): NetSession {
  // The literal is the session's STATE. Its methods are assigned under it and the room installs the
  // lobby API onto the same object, so it is ASSERTED to the full interface rather than annotated with
  // it: an annotation alone would demand members that do not exist for another few hundred lines.
  const net: NetSession = {
    isHost,
    /** The HOST KEY: minted by the host, typed in (or taken from ?room=) by a guest. */
    room: roomCode || (isHost ? makeRoomCode() : ''),
    transport,
    /** This peer's id on the rendezvous. Unique per page load, and nothing but an address. */
    pid: makeRoomCode(8),
    /** 'idle' | 'signalling' | 'connecting' | 'lobby' | 'playing' | 'ended' */
    state: 'idle',
    error: '',
    endReason: '',
    /** Our seat in the party. The host is always 0; a guest has -1 until the host seats them. */
    localSlot: isHost ? 0 : -1,
    /** Party size, which is simply how many people are in the room until the match starts. */
    players: 1,
    delay: 3,
    /** Worst round-trip time to anyone in the party, which is what the delay has to cover. */
    rtt: null,
    /** True once a ping measurement exists; the match will not auto-start before this. */
    rttReady: false,
    /** Set when a peer reports a different protocol version. */
    versionMismatch: false,
    /** Lobby state. `members` is the host's roster, indexed by slot; `scene` the host's opening scene (game/run.js
     *  SCENES), which is the DAY BOARD by default so an online party reads the day's plan together and opens the truck. */
    lobby: { myCritter: 0, myReady: false, scene: START_SCENE, members: [] },
    ls: null,
    /** pid -> link record, one per pairing (roster.js createLinks). */
    links: null,
    signal: null,
    mux: null,
    /** True while the simulation is under lockstep control. */
    get active() { return net.state === 'playing'; },
    /** True while waiting on somebody (a gameplay screen draws an overlay on this). */
    waiting: false,
    /** Slots the current frame is waiting for, for that overlay. */
    missing: [],
    /** The last seat retired mid-match: { slot, at } (wall clock, display only). */
    lastDrop: null,
    /** The checksum disagreement that ended the match, if one did: { frame, slot, mine, theirs }. */
    desync: null,
    /** The frame a seat was retired on, or -1 while they are still playing. */
    dropFrameOf(slot) { return net.ls ? net.ls.dropFrameOf(slot) : -1; },
    /** Re-point the state callback: a session outlives the screen that opened it. */
    onStateChange(fn) { onState = typeof fn === 'function' ? fn : null; },
  } as NetSession;

  const setState = (s: NetState) => { if (net.state !== s) { net.state = s; if (onState) onState(s); } };
  const stateIs = (s: NetState) => net.state === s;        // through a call, so TypeScript does not narrow across awaits
  let resendTick = 0;
  let stallStart = 0, waitShownAt = 0, watchdog = 0, announcer = 0, allReadyAt = 0;
  /** Slots whose DROP frame the simulation has already reached, so each is noted once. */
  const dropped = new Set<number>();
  /** Set by beforeStep, cleared by afterStep: the two must always pair on the same frame. */
  let stepped = false;
  /** After the session ends mid-run, keep the survivor's own seat on their own keyboard (see pumpEnded). */
  let endedPump = false;
  let ourRun: Run | null = null;

  const room = createRoom({ net, game, setState, maybeStart, onPacket, onLinkClosed });
  const { links, sendToSlot, broadcast, lostLinks } = room;   // the room also installs net.remoteSlots/party/critterTaken/setCritter/setReady
  net.links = links.map;

  // ---- transport -------------------------------------------------------------------------------

  /** Begin connecting. Resolves once signalling is up; the other players arrive asynchronously. */
  net.start = async function start() {
    if (!stateIs('idle')) return false;
    setState('signalling');
    try {
      // Room codes are the only way in from the UI. BroadcastChannel reaches the tabs of one origin
      // and nothing else, so it stays as `?transport=broadcast` for the end-to-end test to drive.
      net.signal = transport === 'broadcast' ? broadcastSignal(net.room, net.pid) : await mqttSignal(net.room, net.pid);
    } catch (e) {
      net.error = 'could not reach a signalling server';
      net.end(net.error);
      return false;
    }
    if (stateIs('ended')) return false;                      // left while the broker was being reached
    // A broker dropping before anyone has arrived is a room nobody can join; once a match is on, the
    // rendezvous has nothing left to do and its fate is irrelevant.
    if ('onDown' in net.signal) net.signal.onDown = (why) => { if (stateIs('signalling') || stateIs('connecting')) net.end(why || 'rendezvous disconnected'); };
    net.mux = createSignalMux(net.signal, net.pid);
    net.mux.onAnnounce(room.onAnnounce);
    if (isHost) { room.seatHost(); setState('lobby'); } else setState('connecting');
    startAnnouncer();
    return true;
  };

  /** Keep announcing, sweeping stuck links and checking readiness while the room is filling. */
  function startAnnouncer() {
    room.announce();
    if (announcer) return;
    announcer = setInterval(() => {
      if (net.active || stateIs('ended')) return;
      room.announce(); links.sweep(); maybeStart();
    }, ANNOUNCE_MS);
  }

  function onLinkClosed(link: NetLink, reason: string) {
    if (stateIs('ended') || link.retiring) return;
    const m = room.memberByPid(link.pid);
    if (link.isHost && !isHost) { net.end(reason || 'the host left'); return; }
    // A guest-to-guest link dying only moves that traffic onto the host's relay; the guest says nothing
    // about it, because the host is the one who decides whether a player has really gone. A seat that
    // has ALREADY been retired is not news: applyDrop closes its link itself.
    if (m && net.active && net.ls && net.ls.dropFrameOf(m.slot) < 0) {
      lostLinks.add(m.slot);
      // Losing the only other player leaves nobody to stay in step with: the session simply ends.
      // Losing one of three is not that: the rest play on, and the host retires the seat on an agreed frame.
      if (!net.ls.livingRemotes().some((s) => s !== m.slot)) { net.end(reason || 'the other player left'); return; }
    }
    if (isHost && m && !net.active) room.vacate(m.slot);
  }

  // ---- starting --------------------------------------------------------------------------------

  /** Host only: once the whole party is ready and measured, start. */
  function maybeStart() {
    if (!isHost || !stateIs('lobby') || !room.partyReady(NET_MIN_PLAYERS)) { allReadyAt = 0; return; }
    // The delay must exceed the one-way latency (tools/nettest.js), so never start on the default
    // guess: measuring takes ~800ms and players in a voice call can ready up faster than that.
    if (!net.rttReady) return;
    if (!allReadyAt) allReadyAt = performance.now();
    // Every guest reports its own worst round trip, which is how the host hears about a slow pair it
    // is not part of. Missing reports are waited for briefly and then started without.
    const missing = net.lobby.members.some((m) => m && !m.local && m.rtt == null);
    if (missing && performance.now() - allReadyAt < RTT_REPORT_GRACE_MS) return;
    net.beginMatch(net.lobby.scene);
  }

  /**
   * Host only: fix the session parameters and tell the party. maybeStart calls this once everyone is
   * ready; a lobby screen (or the test hooks) may call it directly to start a party that is seated and
   * reachable, with whatever latency has been measured so far.
   * @param {number} scene index into game/run.js SCENES
   */
  net.beginMatch = function beginMatch(scene = net.lobby.scene) {
    const list = net.lobby.members;
    if (!isHost || !stateIs('lobby') || list.length < NET_MIN_PLAYERS || !room.reachable()) return false;
    const worst = list.reduce((w, m) => Math.max(w, m && m.rtt != null ? m.rtt : 0), net.rtt || 0);
    if (net.rttReady) net.rtt = worst;
    const seed = game.options && game.options.autotest ? (game.options.seed | 0) >>> 0 || 1
      : freshSeed();   // chosen once, before any simulation
    const params = {
      seed,
      scene: Math.max(0, Math.min(SCENES.length - 1, scene | 0)),
      delay: delayForRtt(net.rttReady ? worst : null),
      critters: list.map((m) => m.critter | 0),
    };
    broadcast(encodeStart(params), true);
    applyStart(params);
    return true;
  };

  /** Every peer runs this with byte-identical parameters. Everything after it is lockstep. */
  function applyStart({ seed, scene, delay, critters }: StartParams) {
    const players = Math.max(NET_MIN_PLAYERS, Math.min(NET_PLAYERS, critters.length));
    net.players = players;
    net.delay = Math.max(1, delay | 0);
    net.ls = createLockstep({ localSlot: net.localSlot, players, delay: net.delay });
    dropped.clear(); lostLinks.clear();
    net.lastDrop = null; net.desync = null;
    stallStart = 0; waitShownAt = 0; net.waiting = false; net.missing = [];
    // The match boundary. Each of these exists because skipping it desyncs peers that are otherwise
    // identical: the boot seed is Date.now()-derived; the run is rebuilt from seed + party on every
    // peer; game.frame is hashed by the canary and counted every update since boot; the fade-out
    // blocks the top screen's update (game/game.js) and one peer may be mid-fade when START lands;
    // and every seat must be joined, un-claimed, un-driven and free of buffered menu presses.
    (game.rng || rng).seed(seed);
    ourRun = startRun(game, { seed, critters: critters.slice(0, players) });
    game.frame = 0;
    if (game.fade && game.fade.dir === 1) { game.fade.dir = -1; game.fade.then = null; }
    resetSeats(input, players);
    // No more arrivals: the party is fixed at the START packet.
    if (announcer) { clearInterval(announcer); announcer = 0; }
    // The disconnect watchdog runs on a timer, NOT off canStep(): the gated loop only calls that from
    // requestAnimationFrame, which Chromium throttles or suspends for a backgrounded page - exactly
    // the situation where a peer has gone away and the session must be dealt with.
    if (watchdog) clearInterval(watchdog);
    watchdog = setInterval(tickWatchdog, WATCHDOG_MS);
    setState('playing');
    game.reset(SCENES[scene] || SCENES[0], {});
  }

  /**
   * The match is over but the room is NOT: come off lockstep, keep every link and every pick, and put
   * the party back in the lobby. Nothing in this game's flow calls it yet - a run carries on across
   * screens until somebody leaves - but a screen that wants the party back in the lobby calls this
   * rather than end(). Ready flags are cleared BEFORE the state goes back to 'lobby' (a stale ready
   * could start the next match while somebody was still reading their results), and every seat's
   * input goes back to the real devices.
   * @returns {boolean} true when a live match was handed back to the lobby
   */
  net.matchOver = function matchOver() {
    if (!net.active) return false;
    if (watchdog) { clearInterval(watchdog); watchdog = 0; }
    net.ls = null;
    stepped = false; stallStart = 0; waitShownAt = 0; allReadyAt = 0;
    net.waiting = false; net.missing = []; net.lastDrop = null;
    dropped.clear(); lostLinks.clear();
    releaseSeats(input, { players: net.players });
    room.dropGone();            // a seat the match retired is a player who has gone
    for (const m of net.lobby.members) if (m) m.ready = false;
    net.lobby.myReady = false;
    setState('lobby');
    startAnnouncer();           // the rendezvous has something to do again: a seat may have opened up
    room.rejoin();
    return true;
  };

  // ---- losing a player -------------------------------------------------------------------------

  /**
   * Host only: retire a slot, on the frame the whole party has come to a halt on. That frame is the
   * only safe choice, and only once the party really has halted: it cannot be in anyone's past (nobody
   * can simulate a frame they have no input for) and it is reachable by everyone, because every frame
   * before it is one the party has already played. Callers only reach this after a stall on this very
   * slot, by which time the tails peers forward for each other (resendWindow) have brought everyone
   * to the same frame.
   */
  function declareDrop(slot: number) {
    if (!isHost || !net.active || !net.ls) return;
    if (slot === net.localSlot || net.ls.dropFrameOf(slot) >= 0) return;
    const at = net.ls.frame;
    applyDrop(slot, at);
    broadcast(encodeDrop(slot, at), true);
  }

  /** Retire a slot at `frame` on this machine: it reads as neutral from there on (lockstep.js). */
  function applyDrop(slot: number, frame: number) {
    if (!net.ls || !net.ls.dropSlot(slot, frame)) return;
    const m = net.lobby.members[slot];
    if (m) { m.gone = true; links.drop(m.pid); }
  }

  /** Note each retired slot on the exact frame the whole party agreed on; end when nobody is left. */
  function retireReachedSlots() {
    if (!net.ls) return;
    for (const s of net.ls.remoteSlots) {
      if (dropped.has(s) || !net.ls.isGone(s)) continue;
      dropped.add(s);
      net.lastDrop = { slot: s, at: performance.now() };
    }
    if (net.ls.livingRemotes().length === 0) net.end('everyone else left');
  }

  /** The disconnect watchdog, on a timer rather than on the frame loop. */
  function tickWatchdog() {
    if (!net.active || !net.ls) return;
    if (net.ls.desync) { failDesync(); return; }
    if (net.ls.canAdvance()) { stallStart = 0; return; }
    if (!stallStart) stallStart = performance.now();
    resendWindow();                    // a backgrounded tab has no rAF to resend from
    const stalledFor = performance.now() - stallStart;
    const late = net.ls.missing().filter((s) => s !== net.localSlot);
    if (isHost) {
      // Whoever the frame is waiting on has had their time: a couple of seconds when their connection
      // is known to be gone, the full eight when they have merely fallen quiet.
      const ready = late.filter((s) => stalledFor > (lostLinks.has(s) ? DEAD_LINK_STALL_MS : STALL_TIMEOUT_MS));
      if (!ready.length) return;
      for (const s of ready) declareDrop(s);
      stallStart = 0;
      return;
    }
    if (stalledFor <= STALL_TIMEOUT_MS) return;
    // A guest waits for the host's word, so that everyone retires the same slot on the same frame -
    // but not forever, and not at all once the host itself is unreachable.
    const h = room.hostLink();
    if (!h || !h.open || stalledFor > STALL_TIMEOUT_MS + HOST_DECISION_MS) net.end('connection lost');
  }

  // ---- packets ---------------------------------------------------------------------------------

  function onPacket(bytes: Uint8Array, link: NetLink) {
    const m = decodeMessage(bytes);
    if (!m) return;
    switch (m.type) {
      case MSG.HELLO:
        if (m.v !== PROTOCOL_VERSION) { net.versionMismatch = true; net.end('different game version - both reload the page'); break; }
        room.hello(link);
        break;
      case MSG.LOBBY: room.lobby(m, link); break;
      case MSG.START:
        if (!isHost && link.isHost && stateIs('lobby') && net.localSlot >= 0) applyStart(m);
        break;
      case MSG.DROP:
        if (!isHost && link.isHost && net.ls) applyDrop(m.slot, m.frame);
        break;
      case MSG.RELAY: {
        // Only the host forwards, and only ever a packet that is not itself a relay: two peers
        // bouncing a relay off each other would be a loop with no hop count to stop it.
        if (!isHost || !m.payload.length || m.payload[0] === MSG.RELAY) break;
        const inner = m.payload[0];
        sendToSlot(m.to, m.payload, inner !== MSG.INPUT && inner !== MSG.CHECKSUM);
        break;
      }
      case MSG.INPUT: if (net.ls) net.ls.receiveInput(m.slot, m.baseFrame, m.masks); break;
      case MSG.CHECKSUM: if (net.ls) net.ls.receiveChecksum(m.slot, m.frame, m.sum); break;
      case MSG.PING:
        // Addressed by slot, not answered down the channel it came in on: a relayed ping arrives from
        // the host and its answer belongs to the player who sent it.
        sendToSlot(m.slot, encodePing(net.localSlot, m.id, MSG.PONG));
        break;
      case MSG.PONG: room.pong(m.id); break;
      case MSG.BYE:
        // Only the host leaving is the end of the room. Anyone else leaving is one seat emptying, which
        // is the same path as their link simply dying (the far end closes it; that notice finds no seat).
        if (link.isHost && !isHost) net.end(m.reason || 'the host left');
        else onLinkClosed(link, m.reason || 'a player left');
        break;
      default: break;
    }
  }

  // ---- the per-frame pump ----------------------------------------------------------------------

  /** A checksum disagreement ends the match: v1 has no state-transfer resync. */
  function failDesync() {
    const d = net.ls && net.ls.desync;
    if (!d) return;
    net.desync = d;
    net.end(`desync at frame ${d.frame}`);
  }

  /**
   * Retransmit our window and pass on what we last heard from whoever the frame is waiting for. A
   * stalled peer must keep transmitting: if two peers stall on the same frame and neither does, the
   * match deadlocks permanently (tools/nettest.js). And a packet only its sender can produce is lost
   * with its sender, so forwarding tails is how the party converges on the last frame a departing
   * player actually played - and how a peer that can hear a third player covers for one that cannot.
   */
  function resendWindow() {
    if (!net.ls) return;
    const p = net.ls.resend();
    broadcast(encodeInput(net.localSlot, p.baseFrame, p.masks));
    for (const s of net.ls.missing()) {
      if (s === net.localSlot) continue;
      const t = net.ls.tailOf(s);
      if (t) broadcast(encodeInput(s, t.baseFrame, t.masks));
    }
  }

  /**
   * Gate for createLoop's canUpdate. False means somebody's input for this frame has not arrived, so
   * the simulation must wait rather than guess. Runs once per rAF while stalled, which is also where
   * the redundancy resends come from.
   */
  net.canStep = function canStep() {
    if (!net.active || !net.ls) return true;
    if (net.ls.desync) { failDesync(); return true; }
    const ready = net.ls.canAdvance();
    const now = performance.now();
    if (ready) {
      stallStart = 0;
      // Hold the overlay briefly once shown: at 3% loss canAdvance flips false for a single rAF about
      // once a second, and a banner that flashes for 16ms reads as a rendering fault.
      if (net.waiting && now - waitShownAt > WAIT_HOLD_MS) { net.waiting = false; net.missing = []; }
    } else {
      net.ls.stall();
      if (!stallStart) stallStart = now;
      if (!net.waiting && now - stallStart > WAIT_SHOW_MS) { net.waiting = true; waitShownAt = now; }
      if (net.waiting) net.missing = net.ls.missing();
      if (++resendTick % RESEND_EVERY === 0) resendWindow();
    }
    return ready;
  };

  /**
   * Before each simulated frame: sample the local devices, share them, inject every seat's mask for
   * THIS frame, and consume the frame. Returns false - injecting nothing - whenever the frame cannot
   * be simulated: loop.step(n) deliberately ignores canUpdate, so a caller can reach here without
   * everyone's input, and the answer is never a neutral mask.
   */
  net.beforeStep = function beforeStep() {
    if (endedPump) { pumpEnded(); return false; }
    if (!net.active || !net.ls) return false;
    if (net.ls.desync) { failDesync(); return false; }
    if (!net.ls.canAdvance()) return false;
    retireReachedSlots();
    if (!net.active || !net.ls) return false;    // the last of the party left on this very frame
    const p = net.ls.recordLocal(input.pollRaw(0));
    broadcast(encodeInput(net.localSlot, p.baseFrame, p.masks));
    const masks = net.ls.inputs();
    for (let s = 0; s < masks.length; s++) input.setVirtual(s, masks[s]);
    net.ls.advance();
    stepped = true;
    return true;
  };

  /**
   * After each simulated frame: exchange a checksum periodically. Only for a frame beforeStep actually
   * prepared: the two are guarded independently in main.js, and a match begun from inside
   * game.update() (a lobby screen calling setReady) would otherwise hash a frame nobody fed.
   */
  net.afterStep = function afterStep() {
    if (!stepped || !net.active || !net.ls) { stepped = false; return; }
    stepped = false;
    const f = net.ls.frame;             // frames simulated so far: the state every peer has at this point
    if (net.ls.isChecksumFrame(f)) {
      const sum = runChecksum(game);
      net.ls.noteLocalChecksum(f, sum);
      broadcast(encodeChecksum(net.localSlot, f, sum));
    }
    if (net.ls.desync) failDesync();
  };

  /**
   * After a session ends mid-run the survivor keeps their own seat on their own keyboard: that seat is
   * still virtual, so keep feeding it from the real devices rather than clearing it, which would move a
   * guest onto P2's keys. Stops (releasing every seat) once the run it was protecting is gone.
   */
  function pumpEnded() {
    if (net.localSlot < 0 || game.run !== ourRun) { endedPump = false; releaseSeats(input); return; }
    input.setVirtual(net.localSlot, input.pollRaw(0));
  }

  /**
   * Tear the session down. Mid-run, the other seats freeze on neutral and the local player carries on
   * alone (docs/MULTIPLAYER.md); v1 has no state-transfer resync, so a desync ends the session too.
   */
  net.end = function end(reason = 'session ended') {
    if (stateIs('ended')) return;
    const live = net.active;
    if (watchdog) { clearInterval(watchdog); watchdog = 0; }
    if (announcer) { clearInterval(announcer); announcer = 0; }
    net.endReason = reason;
    try { broadcast(encodeJson(MSG.BYE, { reason }), true); } catch { /* channels already gone */ }
    setState('ended');
    net.waiting = false;
    net.missing = [];
    stepped = false;
    if (live) { releaseSeats(input, { players: net.players, keep: net.localSlot, freeze: true }); endedPump = true; }
    else releaseSeats(input);
    room.close();
    try { if (net.mux) net.mux.close(); } catch { /* ignore */ }
    net.ls = null;
  };

  /** Leave the room for good: end the session and hand every seat back to the real devices. */
  net.leave = function leave() {
    net.end(net.active ? 'you left the match' : 'you left the room');
    endedPump = false;
    releaseSeats(input);
  };

  /** Everything a test or a status line wants to know, as plain data. */
  net.summary = function summary() {
    return {
      state: net.state, room: net.room, pid: net.pid, slot: net.localSlot, players: net.players, delay: net.delay,
      rtt: net.rtt, rttReady: net.rttReady, waiting: net.waiting, missing: net.missing.slice(),
      frame: net.ls ? net.ls.frame : -1, desync: net.desync, reason: net.endReason, error: net.error,
      scene: net.lobby.scene, myCritter: net.lobby.myCritter, myReady: net.lobby.myReady,
      party: net.party(),
      dropped: net.ls ? net.lobby.members.filter((m) => m && net.ls.dropFrameOf(m.slot) >= 0).map((m) => m.slot) : [],
      lastDrop: net.lastDrop,
    };
  };

  return net;
}

/**
 * Debug/test hooks on window.__game (docs/ARCHITECTURE.md section 6): how tests drive a room until the
 * lobby screen exists. Hosting or joining replaces any live session; the new session is stored in
 * game.net and started at once.
 *
 * `hooks` is `any` because it IS window.__game, which types/globals.d.ts already declares `any`: an open bag
 * the boot path and the tools (playtest.js, tools/scenarios/*) both write into, keyed by whatever a test needs
 * that day. This function only ever `Object.assign`s onto it, so there is no shape here to describe.
 */
export function installNetHooks(hooks: any, game: Game, input: Input): void {
  const open = (o: { isHost: boolean, room?: string, transport?: string }) => {
    if (game.net && game.net.state !== 'ended') game.net.leave();
    const s = createNetSession({ game, input, ...o });
    game.net = s;
    s.start();
    return s.room;
  };
  Object.assign(hooks, {
    /** The live session, or null. */
    net: () => game.net,
    /** The session's summary(), or null: what the playtest polls. */
    netState: () => (game.net ? game.net.summary() : null),
    /** Host a room; returns its code. */
    netHost: ({ transport = game.options.transport } = {}) => open({ isHost: true, transport }),
    /** Join a room by code. */
    netJoin: (code: string, { transport = game.options.transport } = {}) => open({ isHost: false, room: String(code || '').toUpperCase(), transport }),
    netSetCritter: (i) => !!(game.net && game.net.setCritter(i)),
    netReady: (on = true) => !!(game.net && game.net.setReady(on)),
    netBegin: (scene = 0) => !!(game.net && game.net.beginMatch(scene)),
  });
}
