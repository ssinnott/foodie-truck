// The ROOM half of online co-op (docs/MULTIPLAYER.md): who sits where, which critter each seat holds,
// the mesh of links that carries the party, the rendezvous announcements and the latency measurement -
// everything that happens before and around a match. net/session.js owns the match itself (the START
// boundary, drops, the per-frame pump) and dispatches the room's packets here.
//
// The seat rules are pure functions so they are unit testable in Node (tools/nettest.js):
//
//  * Seats are DENSE. A party of three is slots 0-2, never 0, 2 and 3: the roster is addressed by index
//    everywhere (members[slot]), the lockstep ring is sized by party count, and a screen laying out one
//    critter per seat would otherwise draw a hole for a player who is not there.
//  * Two players may not share a critter, but only while the cast can seat the whole party one each.
//    The cast is compared modulo its length, exactly as game/run.js startRun seats it, so index 0 and
//    index 4 of a four-critter cast are the same pick.
//  * The match boundary hands every seat to the lockstep buffers and forgets every buffered menu press.
//    The READY press that starts the match is still in the input buffer on EVERY machine, in slot 0's
//    buffer (everybody plays on P1's keys whatever seat they hold), and slot 0 is somebody else's seat on
//    everyone but the host. A press that survived into frame 0 would be a desync no input mask ever
//    asked for - and a load-dependent one, since the buffer is only INPUT_BUFFER deep.

import { NET_PLAYERS } from '../constants.js';
import { ACTIONS } from '../engine/input.js';
import { createPeer } from '../lib/net/peer.ts';
import { MSG, PROTOCOL_VERSION, encodeJson, encodePing, encodeRelay } from './protocol.js';

/** How long a link may take to form before it is torn down and tried again from scratch. */
const LINK_FORM_MS = 9000;
/** One latency measurement: pings per remote seat, the gap between them, and the debounce before a round. */
const RTT_PINGS = 5, RTT_PING_GAP_MS = 150, RTT_DEBOUNCE_MS = 200;

// ---- seats (pure) --------------------------------------------------------------------------------

/**
 * @typedef {{ pid: string, slot: number, critter: number, ready: boolean, local: boolean, seq: number,
 *             rtt: number|null, gone: boolean }} Member
 */

/** A fresh roster entry. `seq` echoes the guest's last request so a stale roster cannot rubber-band them. */
export function makeMember(pid, slot, critter = 0, local = false) {
  return { pid, slot, critter: critter | 0, ready: false, local, seq: 0, rtt: local ? 0 : null, gone: false };
}

/** Pack a (possibly sparse) seat list dense and renumber every slot. Returns the packed list. */
export function packSeats(list) {
  const packed = list.filter(Boolean);
  packed.forEach((m, i) => { m.slot = i; });
  return packed;
}

/** The first seat with nobody in it, or -1 when the room is full. */
export function freeSlot(list, max = NET_PLAYERS) {
  for (let s = 0; s < max; s++) if (!list[s]) return s;
  return -1;
}

/**
 * Is the one-critter-each rule in force? Only when the cast can seat the whole party one each: with a
 * single stand-in critter (or three critters and four players) somebody HAS to share, and refusing
 * every pick would deadlock the lobby.
 */
export function uniquePicks(castN, players) { return Math.max(1, castN | 0) >= Math.max(2, players | 0); }

/** The cast index a pick resolves to (game/run.js seats `cast[i % cast.length]`). */
const wrap = (i, n) => (((i | 0) % n) + n) % n;

/** True when a seat other than `exceptSlot` holds critter `i`, so this player may not take it. */
export function critterTaken(list, i, castN, exceptSlot = -1) {
  const n = Math.max(1, castN | 0);
  if (!uniquePicks(n, list.length)) return false;
  const want = wrap(i, n);
  return list.some((m) => m && m.slot !== exceptSlot && wrap(m.critter, n) === want);
}

/** The first critter nobody else holds, for seating a new arrival; 0 when every one is spoken for. */
export function firstFreeCritter(list, castN, exceptSlot = -1) {
  const n = Math.max(1, castN | 0);
  for (let c = 0; c < n; c++) if (!critterTaken(list, c, n, exceptSlot)) return c;
  return 0;
}

/** True when every seated player holds a different critter, or the rule is off for this cast. */
export function picksDistinct(list, castN) {
  const n = Math.max(1, castN | 0);
  if (!uniquePicks(n, list.length)) return true;
  const seen = new Set();
  for (const m of list) { const c = wrap(m.critter, n); if (seen.has(c)) return false; seen.add(c); }
  return true;
}

/**
 * A host's roster as a guest stores it: sorted by seat (the rest of the session addresses members by
 * index) with our own entry marked local.
 * @returns {Member[]}
 */
export function sortRoster(roster, myPid) {
  return (roster || []).slice().sort((a, b) => (a.slot | 0) - (b.slot | 0))
    .map((r) => ({ ...r, critter: r.critter | 0, ready: !!r.ready, seq: r.seq | 0, rtt: r.rtt == null ? null : r.rtt, local: r.pid === myPid, gone: false }));
}

/**
 * The match boundary, input side: every seat of the party exists from frame 0 (drop-in is off), pad
 * claims are a couch-only idea (any unbound pad drives the local player through pollRaw), no seat is
 * virtual yet (beforeStep injects all of them from frame 0), and no menu press is left buffered. The
 * nettest stub input has only some of these methods, so each is guarded.
 */
export function resetSeats(input, players) {
  if (typeof input.resetClaims === 'function') input.resetClaims();
  const n = input.playerCount || Math.max(players | 0, NET_PLAYERS);
  for (let s = 0; s < n; s++) {
    input.clearVirtual(s);
    if (typeof input.consume === 'function') for (const a of ACTIONS) input.consume(s, a);
    if (s > 0 && typeof input.setJoined === 'function') input.setJoined(s, s < players);
  }
}

/**
 * Hand seats back after a match. `keep` is a seat left alone (the survivor of an ended session keeps
 * driving their own seat, see session.js pumpEnded); with `freeze` the other party seats are held at
 * neutral rather than cleared, so the local keyboard - which is P1's block on every machine - does not
 * start driving somebody else's critter the moment the session ends. Every released seat above 0 is
 * un-joined as well as un-driven: a seat left joined with its virtual cleared is one nothing can drive
 * and nothing can clear, and it would ride into the next select screen as a ghost.
 */
export function releaseSeats(input, { players = 0, keep = -1, freeze = false } = {}) {
  const n = input.playerCount || NET_PLAYERS;
  for (let s = 0; s < n; s++) {
    if (s === keep) continue;
    if (freeze && s < players) input.setVirtual(s, 0); else input.clearVirtual(s);
    if (typeof input.consume === 'function') for (const a of ACTIONS) input.consume(s, a);
    if (s > 0 && typeof input.setJoined === 'function') input.setJoined(s, false);
  }
}

// ---- links ---------------------------------------------------------------------------------------

/**
 * The link table: one record per pairing, each wrapping a net/peer.js connection. Both ends of a
 * pairing compute the same answer from ids they both hold, so exactly one of them offers: whichever
 * has the lower peer id. `allowDirect(toHost)` is where ?netrelay=1 refuses guest-to-guest links so the
 * host's relay can be exercised on one machine.
 *
 * @param {{ pid: string, channel: (peerPid: string) => any, allowDirect: (toHost: boolean) => boolean,
 *           onOpen: (link: any) => void, onPacket: (bytes: Uint8Array, link: any) => void,
 *           onClosed: (link: any, reason: string) => void }} o
 */
export function createLinks({ pid, channel, allowDirect, onOpen, onPacket, onClosed }) {
  /** pid -> { pid, isHost, open, peer, since, retiring } */
  const map = new Map();
  return {
    map,
    has: (peerPid) => map.has(peerPid),
    get: (peerPid) => map.get(peerPid) || null,
    /** One link of the mesh. `toHost` marks the link every guest must have: losing it ends the session. */
    linkTo(peerPid, toHost) {
      if (map.has(peerPid) || peerPid === pid || !allowDirect(!!toHost)) return null;
      const link = { pid: peerPid, isHost: !!toHost, open: false, peer: null, since: Date.now(), retiring: false };
      map.set(peerPid, link);
      link.peer = createPeer({
        initiator: pid < peerPid,
        signal: channel(peerPid),
        onOpen: () => { link.open = true; onOpen(link); },
        onMessage: (bytes) => onPacket(bytes, link),
        onClose: (reason) => { map.delete(peerPid); link.open = false; onClosed(link, reason); },
      });
      return link;
    },
    /**
     * Throw away links that are taking too long to form so the next announcement builds fresh ones.
     * WebRTC has no timeout of its own worth the name - a negotiation that lost a message simply sits
     * there - and a player watching CONNECTING forever is the worst way to fail. Only links that have
     * NEVER opened are swept; the caller only sweeps before the match.
     */
    sweep(maxAgeMs = LINK_FORM_MS) {
      const now = Date.now();
      for (const l of [...map.values()]) {
        if (l.open || now - l.since < maxAgeMs) continue;
        l.retiring = true;                     // not a disconnect: it never connected in the first place
        map.delete(l.pid);
        try { l.peer.close(); } catch { /* already gone */ }
      }
    },
    /** Before the roster lands, the only link a guest has IS the host's. */
    hostLink() { for (const l of map.values()) if (l.isHost) return l; return null; },
    /** Send down one open link. False when there is none, so the caller can fall back to the relay. */
    send(peerPid, bytes, reliable = false) {
      const l = map.get(peerPid);
      return !!(l && l.open && l.peer.send(bytes, reliable));
    },
    /** Close one link deliberately (a seat the host retired, or an arrival it refused). */
    drop(peerPid) {
      const l = map.get(peerPid);
      if (!l) return;
      map.delete(peerPid);
      try { l.peer.close(); } catch { /* already gone */ }
    },
    closeAll() {
      for (const l of map.values()) { try { l.peer.close(); } catch { /* ignore */ } }
      map.clear();
    },
  };
}

// ---- the room ------------------------------------------------------------------------------------

/**
 * The room around a session: announcements on the rendezvous, the mesh, the host's roster, everybody's
 * picks and the latency measurement. Installs the lobby API on `net` (remoteSlots, party, critterTaken,
 * setCritter, setReady) and hands the session what it needs to address the party (sendToSlot, broadcast).
 *
 * @param {{ net: any, game: any, setState: (s: string) => void, maybeStart: () => void,
 *           onPacket: (bytes: Uint8Array, link: any) => void, onLinkClosed: (link: any, reason: string) => void }} o
 */
export function createRoom({ net, game, setState, maybeStart, onPacket, onLinkClosed }) {
  const isHost = !!net.isHost;
  const members = () => net.lobby.members;
  const memberByPid = (pid) => members().find((m) => m && m.pid === pid) || null;
  const localMember = () => members().find((m) => m && m.local) || null;
  const castCount = () => Math.max(1, (game.critters || []).length | 0);
  /** Our own critter/ready request counter: the host echoes it back so a stale roster cannot rubber-band us. */
  let seq = 0;
  let pingId = 1, rttTimer = 0, measuring = false;
  const pingSent = new Map();          // ping id -> { slot, at }

  const links = createLinks({
    pid: net.pid,
    channel: (pid) => net.mux.channel(pid),
    // ?netrelay=1 stands in for a pair of players who cannot see each other directly: no guest-guest
    // link is made, so everything between them goes through the host's relay instead (sendToSlot).
    allowDirect: (toHost) => toHost || isHost || !(game.options && game.options.netrelay),
    onOpen: (link) => {
      // Version first: a peer on a cached older bundle must be told, not silently desynced.
      link.peer.send(encodeJson(MSG.HELLO, { v: PROTOCOL_VERSION, pid: net.pid }), true);
      if (isHost) sendRoster();
      scheduleRtt();
    },
    onPacket,
    onClosed: onLinkClosed,
  });
  const hostLink = () => {
    if (isHost) return null;
    const h = members()[0];
    return (h && !h.local && links.get(h.pid)) || links.hostLink();
  };

  // ---- addressing ----

  /**
   * Send to one slot: down the direct link when there is one, and otherwise wrapped up for the host to
   * forward. A guest with no direct link to another guest is the case this exists for.
   */
  function sendToSlot(slot, bytes, reliable = false) {
    const m = members()[slot];
    if (!m || m.local || m.gone) return false;
    if (links.send(m.pid, bytes, reliable)) return true;
    if (isHost) return false;                       // the host IS the relay; there is nowhere else to go
    const h = hostLink();
    return !!(h && h.open && h.peer.send(encodeRelay(slot, bytes), reliable));
  }
  /** Send to everybody else in the party. */
  function broadcast(bytes, reliable = false) {
    for (const m of members()) if (m && !m.local && !m.gone) sendToSlot(m.slot, bytes, reliable);
  }

  // ---- rendezvous ----

  /** "I am here" - and, from the host, whether there is still a seat free. */
  function announce() {
    if (!net.mux || net.state === 'playing' || net.state === 'ended') return;
    net.mux.announce(isHost ? { ann: 1, host: 1, open: members().length < NET_PLAYERS ? 1 : 0 } : { ann: 1 });
  }

  /**
   * Somebody published to the room. A host answers every announcement with a link; a guest only ever
   * opens a link to the host from an announcement - the other guests it learns about from the host's
   * roster instead, which is what stops a fifth player meshing into a full room.
   */
  function onAnnounce(m) {
    if (!m || !m.ann || !m.from || net.state === 'playing' || net.state === 'ended') return;
    if (links.has(m.from)) return;
    if (isHost) {
      if (m.host) return;                                   // two hosts in one room: not ours to talk to
      if (members().length >= NET_PLAYERS) return;          // full: they are told so by our announcement
      links.linkTo(m.from, false);
    } else if (m.host) {
      if (!m.open && net.localSlot < 0) { net.error = 'the room is full'; net.end(net.error); return; }
      links.linkTo(m.from, true);
    }
  }

  // ---- the host's roster ----

  /** Pack seats dense and ask everyone to ready up again: whoever readied did so for a different party. */
  function reseat(list) {
    const packed = packSeats(list);
    net.lobby.members = packed;
    net.players = packed.length;
    for (const m of packed) m.ready = false;
    net.lobby.myReady = false;
    room.lostLinks.clear();    // seats have just been renumbered, so any note against one is meaningless
    const me = localMember();
    if (me) net.localSlot = me.slot;
  }

  /** Host only: publish the roster. It is the single source of truth for every lobby screen. */
  function sendRoster() {
    if (!isHost) return;
    const roster = members().map((m) => ({ pid: m.pid, slot: m.slot, critter: m.critter, ready: m.ready, seq: m.seq }));
    broadcast(encodeJson(MSG.LOBBY, { roster, scene: net.lobby.scene }), true);
    maybeStart();
  }

  /** Guest only: ask the host for a critter / ready state. The roster that comes back is the answer. */
  function sendRequest() {
    if (isHost) return;
    const h = hostLink();
    if (h && h.open) h.peer.send(encodeJson(MSG.LOBBY, { req: { critter: net.lobby.myCritter, ready: net.lobby.myReady, seq: ++seq, rtt: net.rtt } }), true);
  }

  /** Guest only: apply a roster from the host. */
  function takeRoster(m) {
    const list = sortRoster(m.roster, net.pid);
    const mine = list.find((r) => r.local);
    if (!mine) { net.end('the room is full'); return; }
    net.lobby.members = list;
    net.players = list.length;
    net.localSlot = mine.slot;
    // Adopt the host's word for our own pick only once it is answering our LATEST request; without
    // this a roster still carrying the previous critter snaps the cursor back while it is being moved.
    if ((mine.seq | 0) === seq) { net.lobby.myCritter = mine.critter | 0; net.lobby.myReady = !!mine.ready; }
    if (m.scene != null) net.lobby.scene = m.scene | 0;
    // Everyone in the roster is somebody to be in lockstep with, so mesh with them directly.
    for (const r of list) if (!r.local && !links.has(r.pid)) links.linkTo(r.pid, r.slot === 0);
    if (net.state === 'connecting') setState('lobby');
    scheduleRtt();
  }

  /** Host only: take a guest's request, refusing a critter somebody else is holding. */
  function takeRequest(m, link) {
    const who = memberByPid(link.pid);
    if (!who || !m.req) return;
    const c = m.req.critter | 0;
    // A refused pick is simply not applied: the roster the requester gets back still shows the critter
    // they had, so nobody starts a match on one they did not choose.
    if (!critterTaken(members(), c, castCount(), who.slot)) who.critter = c;
    who.ready = !!m.req.ready;
    who.seq = m.req.seq | 0;
    if (m.req.rtt != null) who.rtt = m.req.rtt;
    sendRoster();
  }

  // ---- latency ----

  /**
   * Measure again shortly. Called whenever the party changes, since a new arrival is a new pair to
   * cover; the small debounce collapses the burst of roster traffic a single join causes into one round.
   */
  function scheduleRtt() {
    if (rttTimer) return;
    rttTimer = setTimeout(() => { rttTimer = 0; measureRtt(); }, RTT_DEBOUNCE_MS);
  }

  async function measureRtt() {
    if (measuring || net.localSlot < 0) return;
    const slots = net.remoteSlots();
    if (!slots.length) return;
    measuring = true;
    for (let i = 0; i < RTT_PINGS; i++) {
      for (const s of slots) {
        const id = pingId++;
        pingSent.set(id, { slot: s, at: performance.now() });
        sendToSlot(s, encodePing(net.localSlot, id));
      }
      await new Promise((r) => setTimeout(r, RTT_PING_GAP_MS));
    }
    // A relayed pair is measured end to end by those pings, hops and all. The candidate-pair stat only
    // knows about a direct link, so it is a fallback for when no PONG came back at all.
    if (net.rtt == null) {
      for (const s of slots) {
        const m = members()[s], l = m ? links.get(m.pid) : null;
        const fromStats = l && l.peer ? await l.peer.rtt() : null;
        if (fromStats != null) net.rtt = Math.max(net.rtt || 0, fromStats);
      }
    }
    measuring = false;
    net.rttReady = true;
    const me = localMember();
    if (me) me.rtt = net.rtt;
    if (!isHost) sendRequest();
    maybeStart();                 // everyone may already have readied while we were measuring
  }

  // ---- the lobby API on net ----

  /** Everyone but us, by slot, in seat order. */
  net.remoteSlots = () => members().filter((m) => m && !m.local).map((m) => m.slot);
  /** The seated party, in slot order, for a lobby screen to draw. */
  net.party = () => members().map((m) => ({ slot: m.slot, critter: m.critter | 0, ready: !!m.ready, local: !!m.local, gone: !!m.gone, direct: !!(links.get(m.pid) || {}).open }));
  /** True when another seat holds critter `i` (modulo the cast), so this player may not take it. */
  net.critterTaken = (i) => critterTaken(members(), i, castCount(), net.localSlot);
  /** Pick a critter. A pick that collides with somebody else's is refused; the host arbitrates. */
  net.setCritter = (i) => {
    const c = i | 0;
    if (net.state === 'playing' || net.state === 'ended' || net.critterTaken(c)) return false;
    net.lobby.myCritter = c;
    const me = localMember();
    if (isHost && me) { me.critter = c; sendRoster(); } else sendRequest();
    return true;
  };
  net.setReady = (on) => {
    if (net.state !== 'lobby') return false;
    net.lobby.myReady = !!on;
    const me = localMember();
    if (isHost && me) { me.ready = !!on; sendRoster(); } else sendRequest();
    return true;
  };

  const room = {
    links, hostLink, sendToSlot, broadcast, announce, onAnnounce, memberByPid, localMember, scheduleRtt,
    /** Slots whose link has actually died, as opposed to merely having gone quiet (session.js watchdog). */
    lostLinks: new Set(),
    /** Host: seat itself in slot 0 before anyone else can arrive, so slot 0 is never in doubt. */
    seatHost() { net.lobby.members = [makeMember(net.pid, 0, net.lobby.myCritter, true)]; net.players = 1; },
    /**
     * Host: seat an arrival whose HELLO checked out. This is the moment their version is known good;
     * a full room or a match already under way sends them away instead.
     */
    hello(link) {
      if (!isHost || memberByPid(link.pid)) return;
      const s = net.state === 'lobby' ? freeSlot(members()) : -1;
      if (s < 0) {
        link.peer.send(encodeJson(MSG.BYE, { reason: net.state === 'lobby' ? 'the room is full' : 'that match has already started' }), true);
        link.retiring = true;
        links.drop(link.pid);
        return;
      }
      const list = members();
      list[s] = makeMember(link.pid, s, firstFreeCritter(list, castCount(), s));
      reseat(list);
      sendRoster();
      scheduleRtt();                    // a new arrival is a new pair for the delay to cover
      announce();                       // the room's free-seat count has just changed
    },
    /** A LOBBY packet: the host's roster, or a guest's request. */
    lobby(m, link) {
      if (m.roster && !isHost && link.isHost && (net.state === 'connecting' || net.state === 'lobby')) takeRoster(m);
      else if (m.req && isHost && net.state === 'lobby') takeRequest(m, link);
    },
    /** A PONG: the worst round trip in the party is what the delay has to cover, eased back down slowly. */
    pong(id) {
      const p = pingSent.get(id);
      if (!p) return;
      pingSent.delete(id);
      const r = performance.now() - p.at;
      net.rtt = net.rtt == null ? r : Math.max(r, net.rtt * 0.7 + r * 0.3);
    },
    /** Host: a seat emptied while the room was still filling. */
    vacate(slot) { const list = members(); list[slot] = null; reseat(list); sendRoster(); announce(); },
    /** Forget anyone a match retired, so the lobby the rest come back to is the party actually still here. */
    dropGone() { if (members().some((m) => m && m.gone)) reseat(members().filter((m) => m && !m.gone)); },
    /** Everyone who is seated, ready, reachable, and on a critter of their own. */
    partyReady(min) {
      const list = members();
      if (list.length < min || !list.every((m) => m && m.ready)) return false;
      if (!list.every((m) => m && (m.local || (links.get(m.pid) || {}).open))) return false;
      return picksDistinct(list, castCount());
    },
    /** Every seat holds an open link or is ours: the party can be told to start. */
    reachable() { return members().every((m) => m && (m.local || (links.get(m.pid) || {}).open)); },
    /** After a match: ready flags off, tell the host (or the guests) where we stand, measure afresh. */
    rejoin() { for (const m of members()) if (m) m.ready = false; net.lobby.myReady = false; if (isHost) sendRoster(); else sendRequest(); scheduleRtt(); },
    close() { if (rttTimer) { clearTimeout(rttTimer); rttTimer = 0; } links.closeAll(); },
  };
  return room;
}
