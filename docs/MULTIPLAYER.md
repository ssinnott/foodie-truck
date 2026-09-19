# Online Co-op — the host key

Status: **implemented** (the session and its tests; the lobby screen that will drive it is still a placeholder).
Ported from the sibling game *Aether & Brass* (MIT, same author), whose `docs/MULTIPLAYER.md` holds the full
reasoning behind every choice. This file is what shipped here, in this game's terms.

Constraint: **no backend we own or operate.** The game stays a static page; players find each other through
public MQTT brokers and then talk directly over WebRTC.

## What shipped

Two to four players, every browser running the same simulation at 60Hz, exchanging only one-byte input masks.

| Piece | Module | Notes |
|---|---|---|
| Wire format | `src/net/protocol.js` (framing in `lib/net/protocol.ts`) | 8 actions in a uint16; a slot-tagged INPUT packet with 8 frames of redundancy is 23 bytes; START carries `{ seed, scene, delay, day, critters[] }` |
| Frame scheduler | `src/net/lockstep.js` | One ring per seat; delay applied at record time; `resend()` and `tailOf()` while stalled; DROP frames |
| Desync canary | `src/net/checksum.js` (kernel in `lib/net/checksum.ts`) | `runChecksum(game)`: FNV-1a over `rng.state`, `game.frame`, every field of `game.run`, the top screen's id and `checksumFields()` |
| Peer link | `src/net/peer.js` | One link of the mesh: an unreliable channel for INPUT/CHECKSUM, a reliable one for everything else |
| Signalling | `src/net/signal.js` (strategies in `lib/net/signal.ts`, bound to `APP_ID`) | Room codes over MQTT/WSS, split into a channel per pairing by `createSignalMux`; BroadcastChannel for the tests |
| The room | `src/net/roster.js` | Seats, picks, the mesh of links, announcements, latency measurement |
| The session | `src/net/session.js` | The state machine, the START boundary, drops, the per-frame pump, `installNetHooks` |
| Tests | `tools/nettest.js`, `tools/scenarios/netplay.js` | Pure-Node suites; two-page and four-page real-WebRTC matches |

## The host key flow

```
idle -> signalling -> lobby (host)                -> playing -> ended
idle -> signalling -> connecting -> lobby (guest) -> playing -> ended
```

1. The host calls `createNetSession({ game, input, isHost: true, transport })` and `start()`. It mints a
   six-character **host key** (`net.room`, alphabet without vowels or ambiguous glyphs), reaches the rendezvous,
   seats itself in slot 0 and announces `{ ann, host, open }` every 800 ms while a seat is free.
2. A guest starts with `{ isHost: false, room: KEY }`, announces itself, and on hearing the host opens a link to it.
   Whichever end has the lower peer id offers; the other answers. Once both channels are up, each end sends
   `HELLO { v: PROTOCOL_VERSION }`; a mismatch ends the session with "different game version".
3. The host seats the arrival in the first free slot with a critter nobody else holds and broadcasts the roster
   (`LOBBY`). Every peer opens links to everyone in the roster it does not have yet: the mesh. A guest only ever
   links to peers the host has seated, which is what stops a fifth player meshing into a full room.
4. Picks and ready flags: a guest asks (`LOBBY { req }` with a sequence number); the host applies what it can and
   the roster it broadcasts back is the answer. `setCritter(i)` refuses a critter another seat holds (compared
   modulo the cast, as `startRun` seats it) — unless the cast is smaller than the party, when seats may share.
   **Every arrival or departure clears everybody's ready flag**: readying for two and being dropped into a
   four-player match is a different game.
5. Latency: each peer pings every other (through the relay where that is the path), keeps the worst round trip,
   and guests report theirs to the host. `delayForRtt` turns the worst in the room into an input delay of 2-10
   frames that exceeds the one-way latency. The match never auto-starts before the measurement is in.
6. When every seated player is ready and reachable, the host sends `START { seed, scene, delay, day, critters }`
   and applies it itself. `beginMatch(scene, day)` is the same thing called by hand (a lobby's START ANYWAY, the
   tests). `day` is which day of the HOST'S WEEK the party opens on (`game/run.js DAY_SHAPES`): the week itself is
   a pure function of the seed, so that one byte is the entire cost of the week on the wire, and a host who is
   resuming a week takes the party into the day they are actually standing in.
   `scene` defaults to `game/run.js START_SCENE`, the DAY BOARD: an online party reads the day's plan together on
   the first shared screen of the match, and the truck is opened by whoever presses.

## Topology: a mesh, with the host as the courier of last resort

Every player holds a direct link to every other where one can form (four players are six links) and sends only
its **own** input, to everyone, once per frame. Without a TURN relay some pairs cannot see each other (symmetric
NAT at both ends), so any packet with no direct link to travel down is wrapped in `RELAY` and handed to the host,
who unwraps and forwards it — decided per packet, never negotiated, and never for a packet that is itself a
`RELAY`. Every packet carrying simulation data therefore names the seat it came *from*, and `PING`/`PONG` name the
sender's seat so a relayed ping is answered to the player, not the courier. `?netrelay=1` (dev only) makes a guest
refuse direct guest-guest links so this path runs on one machine. The host is the one peer everybody must reach;
if they leave, the session ends for everyone. Host migration is not implemented.

## The match boundary

`applyStart` runs on every peer with byte-identical parameters, and each of these steps exists because skipping
it desyncs peers that are otherwise identical:

- `rng.seed(seed)` — the boot seed is `Date.now()`-derived.
- `startRun(game, { seed, critters, day })` — the run is the only cross-screen state and is rebuilt from the packet.
- `game.frame = 0` — it is hashed, and it counted every update since boot.
- a fade-out in flight is turned into a fade-in — `Game.update()` skips the top screen while fading out, and one
  peer may be mid-fade when START lands.
- `input.resetClaims()`, every seat's virtual cleared, every buffered press consumed, seats 1..n-1 joined —
  the READY press that started the match is still in slot 0's buffer on every machine, and slot 0 is somebody
  else's seat on everyone but the host.
- then `game.reset(SCENES[scene])`: the same scene opens everywhere. The state goes to `playing` and the
  disconnect watchdog starts on a 250 ms timer (never off rAF: a backgrounded tab has no rAF).

From here `main.js` runs the pump every fixed step: `net.beforeStep()` samples `input.pollRaw(0)` (everyone
plays on P1's keys whatever seat they hold), records it into lockstep, sends `INPUT` to every peer, and — only if
every seat's input for this frame is present — injects **every** seat's mask with `input.setVirtual(slot, mask)`
and advances. If a mask is missing it injects nothing and `canStep()` returns false, so the loop waits rather
than guesses: a zero-filled frame would manufacture release and press edges no player made. `afterStep()` hashes
the state every 30 frames and exchanges it; a disagreement ends the session (`net.desync`). A `stepped` flag pairs
the two calls so a match begun from inside `game.update()` never advances a frame nobody fed. Stalled peers
resend their input window every third gated tick and forward the tail of whatever they last heard from the
missing seat. Timeouts are wall-clock milliseconds, never tick counts.

## Losing a player

With two players a lost link simply ends the session. With three or four the rest play on, which is only sound
if every remaining machine retires the seat **on the same frame**. The host names it (`DROP { slot, frame }`),
and the frame it names is the one the party has come to a halt on — after two seconds of stall when the link is
known dead, eight when the player has merely gone quiet. The forwarded tails are what bring everyone to that
same frame first. From it on the seat reads as neutral; there is no bot. When the last other player goes, the
session ends. After an end mid-run the other seats freeze on neutral and the survivor keeps their own seat on
their own keyboard (`beforeStep` keeps feeding it from `pollRaw(0)`); `leave()` releases everything.

## What a screen must do to be net-safe

- Read player intent only through `engine/input.js`, **by seat**: `run.party[i].slot` is the slot to poll for
  party member i. Online, every seat's mask arrives through `setVirtual`, so `held/pressed/buffered/axisX` are
  identical on every machine by construction. Never read `device()`, `idleFrames()`, gamepads or the DOM in
  `update()`. Rebound keys and buttons (`engine/bindings.js`) are safe and need no thought: a binding decides which
  key makes a mask BIT, and what crosses the wire is the bit. Two players on different bindings produce the same
  byte, and a screen never learns which key it came from.
- Inside `update()`: no clock, no `Math.random`, no `Math.sin/cos/pow/hypot/atan2` on anything that reaches state
  (`engine/trig.js`), no `localStorage`, no window size. The gameplay `rng` is consumed in `update()` only, never
  in `draw()` (render runs per rAF, update at 60Hz, so a draw-time draw diverges by refresh rate).
- **The two saved files obey that rule from opposite ends.** The WEEK in progress (`game/week.js`) is read in a
  screen's `enter()` and written at the closed day board, and an online peer does not write it at all: a guest
  plays the host's week, which arrived in START, and one player owns a week the way one player owns the host key.
  The RECIPE BOOK (`game/book.js`) is stronger still - it is **written by the game and read only by the book
  screen**, and nothing it holds ever reaches `planWeek`, `planDay`, `gatherTarget` or any `update()`. That is
  what makes a saved file safe here at all: two peers with different books play byte-identical days because no
  code path exists from the book into the simulation. An unlock would desync them the instant their saves
  differed. `tools/check.js` fails the build if any module but `game/screens/book.js` imports the book's
  `readBook`, and the `bookInvariant` playtest scenario proves the same thing from outside the code.
- Scene changes are driven by simulation state (`game.replace(...)` from inside `update()`), so they happen on the
  same frame everywhere. `fadeTo` from inside `update()` is fine for the same reason.
- Expose `checksumFields()` returning every number or string that can diverge, and `summary()` for the tests.
- Never `loop.step(n)` during a live match: it bypasses the gate on purpose, and the simulation would run a frame
  lockstep did not count.
- Pause is refused while `game.net.active` (a paused peer stalls the room).

## Test hooks and what the tests prove

Until the lobby screen exists, `installNetHooks` puts these on `window.__game`: `netHost({ transport }) -> key`,
`netJoin(key, { transport })`, `net()`, `netState()` (= `net.summary()`), `netSetCritter(i)`, `netReady(on)`,
`netBegin(scene)`. `node tools/playtest.js netplay netquad` drives two and four real headless pages over
BroadcastChannel signalling and loopback WebRTC: the host key fills a room, picks and ready flags round-trip, the
START opens the same scene with one seat per player everywhere, 120+ frames pass with no desync and every peer within
`delay + 2` frames, ArrowRight held on a guest moves that seat's dot by the same amount on every machine (in the
four-player room, from a guest whose traffic is relayed), one guest closing retires its seat on one agreed frame
while the other three stay identical, and the last player left is handed a clean end. `node tools/playtest.js
netboard` holds a two-peer room on the DAY BOARD, the scene a match opens on: both machines lay the same day out
from the START packet's seed, and the guest's confirm opens the truck on both of them. `node tools/nettest.js`
covers the wire format, lockstep under 50% loss, the canary's `-0`/NaN normalisation and every hashed field,
`delayForRtt`'s bounds, dense seating, the modulo-the-cast pick rule and the match-boundary input reset.

## Deferred, deliberately

- **The lobby screen**, the waiting overlay and the end banner: `screens/lobby.js` is a placeholder. The session is
  driven by the hooks above until it lands; it must read the room code raw (every code letter is a bound key).
- **Rollback** (zero input delay), **state-transfer resync** after a desync, **host migration**, more than four.
- **Pause online**: no pause folding into the input stream; the overlay is refused instead.
- **A rematch flow**: `matchOver()` exists (back to the lobby with seats and picks intact) but nothing calls it —
  a run carries on across screens until somebody leaves.
- **Live MQTT** is untested from this environment; BroadcastChannel is the verified path. Two tabs on one machine
  connect over loopback candidates, so local success proves nothing about NAT — test across two real networks.
