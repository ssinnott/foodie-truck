// WebRTC peer connection for online co-op (docs/MULTIPLAYER.md section 3).
//
// TWO channels, because the two kinds of traffic want opposite guarantees:
//
//   'in'  unreliable + unordered, for INPUT and CHECKSUM. A retransmitted input arrives after its
//         frame has already been simulated, so it is worthless, and ordering would let one lost
//         packet head-of-line block everything behind it. protocol.js repeats the last 8 frames in
//         every packet instead, which covers loss without any retransmission.
//   'ctl' reliable + ordered, for HELLO / LOBBY / START / BYE. These are sent once and are
//         unrecoverable if lost: a dropped START leaves the guest in the lobby forever while the
//         host plays a match alone, with no timeout and nothing to resend it.
//
// Signalling is pluggable (net/signal.js). A signal channel is a live rendezvous -
// { send(obj), onMessage(fn), close() } - and only needs to carry a handful of small JSON objects
// before the peers talk directly. In a four-player room it is one pairing's view of the shared
// rendezvous (signal.js createSignalMux), so this module is still only ever about ONE link.
//
// Exactly one end of a link offers. Who that is is not "the host" - two guests form a link with no
// host in it - but whichever end has the lower peer id, a rule both ends work out for themselves
// from ids they already have (net/session.js).

/** Public STUN only. A TURN relay would be a server we operate, which the no-backend rule forbids. */
export const DEFAULT_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

/**
 * @param {{ initiator: boolean, signal: object, iceServers?: object[],
 *           onOpen?: () => void, onMessage?: (bytes: Uint8Array) => void,
 *           onClose?: (reason: string) => void, onState?: (state: string) => void }} o
 */
export function createPeer({ initiator, signal, iceServers = DEFAULT_ICE, onOpen, onMessage, onClose, onState }) {
  const pc = new RTCPeerConnection({ iceServers });
  const chans = { in: null, ctl: null };
  let opened = false;
  let closed = false;
  let offered = false;
  /** ICE candidates that arrived before setRemoteDescription; adding them early throws. */
  const pending = [];

  const state = (s) => { if (onState) onState(s); };

  function wire(c) {
    const label = c.label === 'ctl' ? 'ctl' : 'in';
    chans[label] = c;
    c.binaryType = 'arraybuffer';
    c.onopen = () => {
      // Only report open once BOTH channels are up, or the session could send a START over a
      // control channel that does not exist yet.
      if (opened || !chans.in || !chans.ctl || chans.in.readyState !== 'open' || chans.ctl.readyState !== 'open') return;
      opened = true;
      state('open');
      if (onOpen) onOpen();
    };
    c.onmessage = (e) => { if (onMessage) onMessage(new Uint8Array(e.data)); };
    c.onclose = () => close('channel closed');
    c.onerror = () => close('channel error');
  }

  if (initiator) {
    wire(pc.createDataChannel('in', { ordered: false, maxRetransmits: 0 }));
    wire(pc.createDataChannel('ctl', { ordered: true }));
  } else {
    pc.ondatachannel = (e) => wire(e.channel);   // keyed by label, so the second does not clobber the first
  }

  // Trickle: every candidate goes over the rendezvous as it is found, so the connection forms
  // without waiting for gathering to finish.
  pc.onicecandidate = (e) => { if (e.candidate) signal.send({ cand: e.candidate.toJSON() }); };
  pc.onconnectionstatechange = () => {
    state(pc.connectionState);
    if (pc.connectionState === 'failed') close('connection failed');
    else if (pc.connectionState === 'closed') close('peer closed');
    else if (pc.connectionState === 'disconnected') state('disconnected');
  };

  async function makeOffer() {
    if (!initiator || offered) return;
    offered = true;
    const o = await pc.createOffer();
    await pc.setLocalDescription(o);
    signal.send({ sdp: o });
  }

  signal.onMessage(async (m) => {
    if (closed || !m) return;
    try {
      // The rendezvous has no retention: a message sent before the peer subscribed is simply lost.
      // Both sides therefore announce themselves repeatedly until the SDP exchange has happened,
      // and a hello is answered with the description we have already made rather than with another
      // hello - two peers echoing hellos at each other never stop.
      if (m.hello) {
        if (initiator) { if (offered) resend(); else await makeOffer(); }
        else if (pc.localDescription) resend();                  // our answer, in case it was lost
        return;
      }
      if (m.sdp) {
        // Only the far end's half of the exchange is ever accepted, and never once we are up: a
        // second offer after the link is carrying a match would renegotiate it out from under the
        // session. Before that it is taken: a peer that gave up on this pairing and started again
        // (net/session.js sweepLinks) offers afresh, and refusing it would strand both of us.
        if (m.sdp.type === 'offer' && (initiator || pc.connectionState === 'connected')) return;
        if (m.sdp.type === 'answer' && pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription(m.sdp);
        while (pending.length) await pc.addIceCandidate(pending.shift()).catch(() => {});
        if (m.sdp.type === 'offer') {
          const a = await pc.createAnswer();
          await pc.setLocalDescription(a);
          signal.send({ sdp: a });
        }
      } else if (m.cand) {
        if (pc.remoteDescription) await pc.addIceCandidate(m.cand).catch(() => {});
        else pending.push(m.cand);
      }
    } catch (e) { close('signalling error: ' + (e && e.message ? e.message : e)); }
  });

  /** Re-publish our own description: the rendezvous drops anything sent before the far end subscribed. */
  function resend() { if (pc.localDescription) signal.send({ sdp: pc.localDescription }); }

  // Announce presence until the SDP exchange completes. Without this the peer that arrives second
  // never learns the first one is there, and the connection silently never forms.
  const beat = setInterval(() => {
    if (closed) return;
    if (pc.remoteDescription) { clearInterval(beat); return; }
    signal.send({ hello: true });
  }, 400);
  signal.send({ hello: true });

  function close(reason = 'closed') {
    if (closed) return;
    closed = true;
    if (beat) clearInterval(beat);
    for (const c of [chans.in, chans.ctl]) { try { if (c) c.close(); } catch { /* ignore */ } }
    try { pc.close(); } catch { /* ignore */ }
    try { signal.close(); } catch { /* ignore */ }
    if (onClose) onClose(reason);
  }

  return {
    pc,
    get open() { return opened && !!chans.in && chans.in.readyState === 'open'; },
    get closed() { return closed; },
    /**
     * Send bytes. `reliable` routes to the ordered control channel for messages that cannot be
     * lost; everything else goes on the unreliable one and is covered by redundancy.
     */
    send(bytes, reliable = false) {
      const c = reliable ? chans.ctl : chans.in;
      if (!c || c.readyState !== 'open') return false;
      try { c.send(bytes); return true; } catch { return false; }
    },
    /** Round-trip time in ms from the selected candidate pair, or null before one is chosen. */
    async rtt() {
      try {
        const stats = await pc.getStats();
        let ms = null;
        stats.forEach((s) => { if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.currentRoundTripTime != null) ms = s.currentRoundTripTime * 1000; });
        return ms;
      } catch { return null; }
    },
    close,
  };
}
