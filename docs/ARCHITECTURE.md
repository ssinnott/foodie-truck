# Foodie Truck — Technical Architecture Contract

This document is the binding technical contract. Every module, agent and reviewer codes against it. Where it and a
design document disagree on a *technical* matter, this file wins; on a *design* matter (names, numbers, looks) the
design document wins — `docs/GDD.md` for the game, `docs/ART_STYLE.md` for the art.

The engine, art core, net transport and tooling are ported from the sibling game *Aether & Brass* (MIT, same
author). Where a module says "ported", its behaviour is that game's, and `docs/ART_PRINCIPLES.md` says why.

## 0. Stack & non-negotiables

- **Runtime:** browser, HTML5 Canvas 2D, vanilla JavaScript **ES modules**. No framework, no TypeScript *sources*,
  no bundler required to *play* (`npm run dev` serves the repo; open `index.html`). `npm run build` produces a
  single-file `dist/index.html` (esbuild) for sharing and for GitHub Pages, but `src/` must always run un-bundled.
- **Types are checked, never compiled.** `npm run typecheck` runs `tsc --noEmit` over the JSDoc in `engine/` and
  `net/` (`tsconfig.json`), widening one directory at a time as each is clean.
- **Zero binary assets.** All art is drawn with canvas primitives at runtime. No image, font or audio file is ever
  fetched or committed. Icons and screenshots produced by the tools live outside the game (`tools/screens/`, ignored).
- **Internal resolution:** `640 x 360` (`VIEW_W`, `VIEW_H`). That is the ONE canvas's bitmap size; CSS scales it to
  the largest whole number of CSS pixels per game pixel that fills most of the window (`engine/canvas.js`,
  `image-rendering: pixelated`). Snap sprite positions to integers when drawing.
- **Fixed timestep:** logic at exactly **60 Hz** (`DT = 1/60`), render per requestAnimationFrame with the latest
  state, at most 5 steps per frame. Every gameplay number is per frame at 60 fps (px/frame, frames).
- **Determinism:** all gameplay randomness goes through `engine/rng.js` (seedable mulberry32). Never `Math.random()`
  in simulation code (UI sparkle is fine). Never `Math.sin/cos/atan2/pow/hypot` on values that reach simulation
  state — use `engine/trig.js` (`dsin`, `dcos`, `dhypot`); they are free to use in `draw()`. Never read the wall clock,
  the window size or the device in the simulation. This is what lets four browsers run the same game in lockstep.
- **File size:** keep every file under ~600 lines; split rather than grow.
- **No globals** except `window.__game` (debug/test hooks, section 6).
- Browser support target: current Chrome/Firefox/Safari. No experimental APIs.

## 1. Repository layout

```
index.html               the page: one canvas, the error box, the module entry
src/constants.js         every shared number and UI colour (never hardcode these elsewhere)
src/main.js              boot: services, Game, screens, loop, window.__game
src/engine/    loop, canvas, input (8-action masks), rng, math, trig, text (5x7 pixel font)
src/art/       shading (cel bands), shapes, rig + rigParts + poses + secondary (the paper-doll), layers (offscreen
               backdrop helpers), palettes, portraits, food (ingredient glyphs)
src/game/      game (screen stack), run (the order + party, the only cross-screen state), animation, menuinput,
               screens/ (one file per screen)
src/content/   critters/ (the cast: common rig hooks + one file per critter + items), recipes, places
src/net/       signal (room codes over MQTT / BroadcastChannel), mqtt-codec, peer (WebRTC), lockstep, protocol,
               checksum, session
tools/         server, build, check, capture (screenshots of any screen), sheet (critter contact sheets),
               playtest (headless scenarios), nettest (pure node), browser (Playwright lookup)
docs/          this file, GDD, ART_STYLE, ART_PRINCIPLES, MULTIPLAYER
```

Every module imports only from `engine/`, `art/`, `game/`, `content/`, `net/` — never from `tools/`.
`content/` is **data plus small draw hooks**: no gameplay logic. `constants.js` imports nothing.

## 2. Coordinate systems

- **Screen:** 640x360, origin top-left, y down. Everything in `draw()` is screen space unless a screen says otherwise.
- **World map** (`screens/map.js`): a `WORLD_W x WORLD_H` px plane (`content/places.js`, 1920x1080), y down, a camera
  `{ x, y }` at the top-left of the visible 640x360 window, clamped to the world. Landmarks are `PLACES[i].x/y`.
- **Side-view scenes** (mini-games, kitchen): screen space with a floor line per scene; critters stand with their
  feet on that line. Depth, where a scene wants it, is a simple y-sort.
- **Rig local space** (`art/rig.js`): authored facing right, origin at the feet centre, y negative up, angles in
  degrees (limb 0 = hanging down, positive = forward). `drawRig(ctx, rig, pose, { x, y, facing, scale })` places it.

## 3. Engine modules — required exports

### `engine/loop.js` (ported)
`createLoop({ update, render, testMode, canUpdate })` → `{ start, stop, step(n), fps, frame, gated }`. In
`testMode` the loop never self-runs; `step(n)` drives n updates + 1 render. `canUpdate` gates the fixed step without
gating render — lockstep returns false while waiting for a peer's input.

### `engine/input.js`
`ACTIONS = ['left','right','up','down','action','alt','cancel','start']`, bit i of a mask. Four seats (`MAX_PLAYERS`),
couch play fills two (`LOCAL_PLAYERS`): P1 arrows/WASD + Z X C Enter, P2 T F G H + V B N 5; a gamepad claims the
lowest free couch seat on its first press. API: `update()` once per step; `held(p,a)`, `pressed(p,a)`,
`buffered(p,a,window)`, `consume(p,a)`, `axisX(p)`, `axisY(p)`, `mask(p)`, `anyPressed(a)` → slot or −1,
`typedCodes()` (text entry), `setVirtual(p, mask|actions)` / `clearVirtual(p)` (netplay + tests), `pollRaw(p)` (the local
devices as a mask, no edge state — netplay samples this to send), `joined(p)`, `joinPressed(p)`, `setJoined`,
`resetClaims`, `keyText(p,a)`. `packMask` / `unpackMask` own the bit layout; `net/protocol.js` sends the mask as is.

### `engine/canvas.js`, `engine/rng.js`, `engine/math.js`, `engine/trig.js`, `engine/text.js` (ported)
`createCanvas(el)`; `rng.seed/next/range/int/pick/chance/state` + `makeRng(seed)` for cosmetic streams;
`clamp/lerp/approach/rad/deg/...`; `dsin/dcos/dhypot`; `drawText(ctx, text, x, y, { size, color, align, shadow })`,
`drawTextOutlined(...)`, `measureText`, `lineHeight`. Text is upper-cased 5x7 pixels; never use system fonts.

## 4. Art modules

### `art/shading.js`, `art/shapes.js`, `art/rig.js`, `art/rigParts.js`, `art/poses.js`, `art/secondary.js` (ported)
The cel-shaded paper-doll. `buildRig(build)` → rig; `drawRig(ctx, rig, pose, o)`; `computeJoints`; `jointScreen`.
Part hooks `(ctx, rig, pose, info)` in local spaces (see `docs/ART_STYLE.md` section 5). Poses: `DEFAULT_POSE`,
`makePose`, `lerpPose`, `P()` shorthand, `FACE` expression indices. Chains: `getChain(rig, name, n, opts)`.

### `content/critters/common.js` — the critter rig
`critterBuild(spec)` assembles a build with animal hooks (head with muzzle + ears, critter face, belly + apron,
shorts, paws, tail); `makeCritterAnims(over)` gives the shared table: `idle walk run carry carryWalk reach catch cheer
sad eat chop stir bump hop wave sit`. `content/critters/items.js` `ITEMS.<name>` are held items: `rig.weapon =
ITEMS.basket` (`rig.basketFill`, `rig.heldIcon`). Every cast file exports `{ id, name, fullName, role, species, build,
anims, colour }` and is listed in `content/critters/index.js` `CRITTERS` (order = cast index).

### `art/layers.js`
Offscreen pre-render: `makeLayer(w, h, paint(g, w, h, rnd), seed)`, `blitTiled`, `blitAt`, `blitWorld(ctx, L, camX,
camY)`, `vGradient`, `radialGlow`, `makeGlowSprite`, `boxOutlined`, `boxShaded`, `discShaded`, `polyOutlined`,
`makePool`, `pulse`, `PARALLAX`, `INK`. Backdrops paint ONCE with a seeded rng and blit per frame at integer offsets.

### `art/portraits.js`, `art/food.js`
`drawHeadPortrait(ctx, rig, pose, x, y, size)`, `drawBust(...)`, `idlePoseOf(def)`; `drawFood(ctx, icon, cx, cy, s, hex)`
and `FOOD.<icon>` for `apple egg fish milk sack jar carrot`.

## 5. Game

### `game/game.js` (ported)
`Screen { game, id, transparent, frame, enter(params), exit(), update(), draw(ctx), summary() }` and
`Game { input, rng, options, critters, net, run, registerScreen, push/replace/reset/pop, fadeTo(fn), update, draw }`.
`Game.update()` ticks only the TOP screen; overlays set `transparent = true` so the screen below still draws.

### `game/run.js` — the run
`startRun(game, { seed, critters, order })` creates `game.run`, plain data: `party[{ slot, critter, score }]`,
`order { dish, customer, line, steps, needs[{ id, amount, have }] }`, `truck { x, y, heading, at }`, `served`, `score`.
Mutators: `gather(id, n)`, `complete()`, `missing()`, `placeFor(id)`, `screenForPlace(placeId)`, `serve(stars)`,
`summary()`. `SCENES = ['map','orchard','pond','coop','kitchen']` are the START-packet scene indices.
The run is the ONLY state shared between screens; it is rebuilt identically on every peer from seed + party.

### Flow
```
title -> select -> map -> <orchard|pond|coop> -> map -> ... -> map(home) -> kitchen -> results -> map
title -> lobby (host key) -> select (shared) -> map ...   (online: the host's START opens the same scene everywhere)
```
- `screens/map.js`: the truck drives (`run.truck`), arriving at a landmark with a missing ingredient pushes that
  mini-game via `game.replace(run.screenForPlace(id), { place: id })`; arriving home with everything opens the kitchen.
- Mini-games end with `run.gather(id, amount)` and `game.replace('map')`. Multiplayer: every seat plays at once.
- `screens/kitchen.js`: one critter per seat, stations from `content/places.js STATIONS`, steps from `run.order.steps`;
  finishes with `game.replace('results')`. `screens/results.js` calls `run.serve(stars)` then `game.replace('map')`.
- Screens read input by SEAT: `run.party[i].slot` is the input slot to poll for party member i. Online, every
  seat's mask arrives through `input.setVirtual` from the lockstep buffers, so a screen that only uses `input.*`
  is net-safe by construction. Screens must not read the clock, `Math.random`, or anything outside `run`, `rng` and
  `input` inside `update()`.
- Every screen exposes `summary()` (for tests) and, if it holds simulation state, `checksumFields()` → number list
  (for the desync canary).

### Overlays
`screens/pause.js` is a transparent overlay pushed by `start` in a scene; `cancel` pops it. Online, pause is not
implemented (a paused peer would stall the room) — the pause overlay is refused while `game.net.active`.

## 6. Debug & test hooks (`src/main.js`)

URL params: `?autotest=1` (test mode: no rAF loop, seeded rng, `window.__game` populated), `?debug=1`, `?seed=N`,
`?skipTo=<screen>` (straight into a screen with a run started), `?critters=0,1,2,3` (party for skipTo), `?place=coop`,
`?order=N`, `?room=CODE` / `?host=1` (online), `?transport=broadcast` (same-machine netplay for tests), `?netrelay=1`.

```js
window.__game = {
  ready, game, input, rng, options, loop, scenes,
  step(n), screen(), screenIds(), summary(), goto(id, params),
  setInput(slot, actions|mask), clearInput(slot), critterList(), errors: [],
  // online co-op (net/session.js installNetHooks): drive a room without the lobby screen
  netHost({ transport }) -> room code, netJoin(code, { transport }), net(), netState(), netSetCritter(i), netReady(on), netBegin(scene)
}
```
Every uncaught error is pushed to `__game.errors` (and shown in the red box); tests fail on any error.

## 7. Multiplayer (see docs/MULTIPLAYER.md)

Host key = a six-character room code rendezvoused over public MQTT brokers (WSS) or BroadcastChannel (tests); WebRTC
data channels in a mesh with the host as the relay of last resort; deterministic lockstep with an input delay; a
checksum every 30 frames; the host retires a vanished seat on an agreed frame. `net/session.js` owns the state
machine and the per-frame pump: `beforeStep()` samples `input.pollRaw(0)`, records it, sends INPUT, and injects every
seat's mask with `input.setVirtual`; `afterStep()` hashes `game.run` + the top screen's `checksumFields()`;
`canStep()` gates the loop. The match starts from a START packet carrying seed, scene and one critter per seat; every
peer calls `startRun` with it and `game.reset(SCENES[scene])`.

## 8. Performance rules

- Zero allocation in per-frame draw: no object/array literals, template strings or closures inside a draw or a part
  hook; tone ramps come from `tones(rig, hex)` (cached); point lists are module constants or typed arrays.
- Backdrops are pre-rendered layers; per-frame animation is a handful of `drawImage`/`fillRect` calls.
- Budget: 60 fps with four critters, a scene's props, and 200 particles on a mid laptop. A rig must stay under
  ~45 cel shapes + ~140 flat rects per draw (docs/ART_STYLE.md section 9).

## 9. Tooling & tests

- `npm run dev` — `tools/server.js` on :8080. `npm run build` — `tools/build.js` → `dist/index.html`.
- `npm run lint` — `node --check` every module + `tsc`. `npm run nettest` — pure-node protocol/lockstep/trig tests.
- `npm run playtest` — headless Playwright: boots every screen, walks the flow, holds a netplay room.
- `npm run capture -- <dir> [screen[:params]...]` — screenshots of any screen at 2x (`tools/capture.js`).
- `node tools/sheet-capture.js <dir> critter=<id> [anims,walk,closeup,cast,bench]` — critter contact sheets.
- `.github/workflows/pages.yml` — lint, nettest, build on every push/PR; deploys `main` to GitHub Pages.

## 10. Code conventions

ES2022, `const`/`let`, named exports, 2-space indent, semicolons, single quotes, JSDoc on public functions. Never
hardcode a number twice: put it in the def or `constants.js`. All angles in degrees in content data.
