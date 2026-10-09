# Foodie Truck — Technical Architecture Contract

This document is the binding technical contract. Every module, agent and reviewer codes against it. Where it and a
design document disagree on a *technical* matter, this file wins; on a *design* matter (names, numbers, looks) the
design document wins — `docs/GDD.md` for the game, `docs/ART_STYLE.md` for the art.

The engine, art core, net transport and tooling are ported from the sibling game *Aether & Brass* (MIT, same
author). Where a module says "ported", its behaviour is that game's, and `docs/ART_PRINCIPLES.md` says why.

## 0. Stack & non-negotiables

- **Runtime:** browser, HTML5 Canvas 2D, **TypeScript ES modules**. No framework, and nothing is compiled to disk
  during development. `npm run build` produces a single-file `dist/index.html` (esbuild) for sharing and for GitHub
  Pages, and that file is still the whole game with no external references.
- **A transform, but no build step.** `src/` is TypeScript, which a browser cannot parse, so `npm run dev`
  transforms each module through esbuild ON REQUEST and serves it as JavaScript. There is no watcher and no output
  directory: edit a file, reload the page. The transform leaves import specifiers alone, so the JS handed back still
  says `from './game/run.ts'`, the browser asks for that, and it is transformed too — the served graph closes on
  itself. What this costs, stated plainly: `src/` no longer runs from an arbitrary static server, and `index.html`
  no longer opens from disk. `dist/index.html` still does both. The rule this replaces ("no bundler required to
  play") was given up deliberately, in exchange for `game/` — the largest and busiest layer — being typechecked at
  all rather than sitting outside `include` indefinitely.
- **Import specifiers name the real `.ts` file** (`from './game.ts'`), which is the reverse of the usual TypeScript
  convention. Node 22 resolves specifiers literally and does no extension remapping, so a `.js` specifier pointing
  at a `.ts` file fails; writing `.ts` is what lets every tool in `tools/` import `src/` directly with no `tsx` and
  no precompile.
- **Types are checked, never compiled.** `npm run typecheck` runs `tsc --noEmit`; esbuild does all emitting.
  `allowImportingTsExtensions` is legal only under `noEmit`, so the two are one decision. `include` now covers all
  of `src/` — there is no directory left to opt out, which was the point. `strict` is still off; raising it is a
  separate, measured step (see the game-engine repo's `docs/TS_MIGRATION.md`).
- **Class fields are declared with `declare`.** `target: es2022` implies `useDefineForClassFields`, so a bare
  `x: T` is not a type annotation: it emits a define that sets the property to `undefined` after `super()`, which
  would silently clobber a base constructor's assignment. `npm run class-fields` fails on any instance field that
  is neither `declare` nor initialised.
- **The shared half lives in `src/lib/`**, vendored from the `game-engine` repository with `git subtree`. Do not
  edit it here: fix it there and `git subtree pull`. `npm run lib-check` (part of `npm run check`) fails on any
  difference between `src/lib/` and the engine commit it was pulled from, committed or not, so an edit made here
  cannot reach main. `art/palettes.ts` and `engine/text.ts` are deliberate local shims — each re-exports the library and adds this game's own art direction (the palette tables, the ink).
- **Zero binary assets.** All art is drawn with canvas primitives at runtime; all audio is synthesized with WebAudio
  (`engine/audio.ts`, section 3). No image, font or audio file is ever fetched or committed. Icons and screenshots
  produced by the tools live outside the game (`tools/screens/`, ignored).
- **Internal resolution:** `640 x 360` (`VIEW_W`, `VIEW_H`). That is the ONE canvas's bitmap size; CSS scales it to
  the largest whole number of CSS pixels per game pixel that fills most of the window (`lib/engine/canvas.ts`,
  `image-rendering: pixelated`). Snap sprite positions to integers when drawing.
- **Fixed timestep:** logic at exactly **60 Hz** (`DT = 1/60`), render per requestAnimationFrame with the latest
  state, at most 5 steps per frame. Every gameplay number is per frame at 60 fps (px/frame, frames).
- **Determinism:** all gameplay randomness goes through `lib/engine/rng.ts` (seedable mulberry32). Never `Math.random()`
  in simulation code (UI sparkle is fine). Never `Math.sin/cos/atan2/pow/hypot` on values that reach simulation
  state — use `lib/engine/trig.ts` (`dsin`, `dcos`, `dhypot`); they are free to use in `draw()`. Never read the wall clock,
  the window size or the device in the simulation. This is what lets four browsers run the same game in lockstep.
- **File size:** keep every file under ~600 lines; split rather than grow.
- **No globals** except `window.__game` (debug/test hooks, section 6).
- Browser support target: current Chrome/Firefox/Safari. No experimental APIs.

## 1. Repository layout

```
index.html               the page: one canvas, the error box, the module entry
src/constants.js         every shared number and UI colour (never hardcode these elsewhere)
src/main.js              boot: services, Game, screens, loop, window.__game
src/engine/    loop, canvas, actions (the eight, frozen), bindings (which key/button each one is on), input
               (8-action masks), touch (the on-screen controls a phone presses, and the field it types into),
               sideways (a phone held upright gets the game on its side, and touches measured through the turn),
               links (the only module that navigates anywhere), rng, math, trig, text (5x7 pixel font),
               audio (the WebAudio facade) +
               audio/ (this game's SFX library and its tracks; the primitives and the sequencer are lib/audio/)
src/art/       shading (cel bands), shapes, rig + rigParts + poses + secondary (the paper-doll), layers (offscreen
               backdrop helpers), palettes, portraits, food (ingredient glyphs), fx, truck (the milk-float),
               fishing + hens + kitchenProps + dairyProps + millProps + hiveProps + gardenProps (per-scene props),
               logo, backgrounds/ (one pre-rendered scene each)
src/game/      game (screen stack), run (the week's plan + the day + party + shopping list, the only cross-screen state),
               week (the week in progress, saved between sittings), book (the recipe book: written by the game,
               read only by screens/book), friends (who rides along with the party) + kitchenFriends (what they do
               in the kitchen: cosmetic), animation, menuinput,
               ui (the paper/chalk/wood kit), minigame (shared mini-game furniture), maphud, touchpad (the
               on-screen controls, drawn), screens/ (one per screen)
src/content/   critters/ (the cast: common rig hooks + one file per critter + items + customers), recipes, places
src/net/       signal (room codes over MQTT / BroadcastChannel), mqtt-codec, peer (WebRTC), lockstep, protocol,
               checksum, session
tools/         server, build, check, capture (screenshots of any screen), sheet (critter contact sheets),
               playtest + scenarios/ (headless scenarios, one module per feature owner), nettest (pure node),
               art-check (data-tier art invariants), browser (Playwright lookup)
docs/          this file, GDD, ART_STYLE, ART_PRINCIPLES, MULTIPLAYER, CONTENT_ROADMAP, EXPANSION_ROADMAP
```

Every module imports only from `engine/`, `art/`, `game/`, `content/`, `net/` — never from `tools/`.
`content/` is **data plus small draw hooks**: no gameplay logic. `constants.js` imports nothing.

## 2. Coordinate systems

- **Screen:** 640x360, origin top-left, y down. Everything in `draw()` is screen space unless a screen says otherwise.
- **World map** (`screens/map.js`): a `WORLD_W x WORLD_H` px plane (`content/places.js`, 2560x1440), y down, a camera
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
`ACTIONS = ['left','right','up','down','action','alt','cancel','start']`, bit i of a mask. Three device sources —
keyboard, gamepad, touch — folded into one mask, so nothing downstream can tell which of them a press came from.
**One player per machine**: seat 0 is whoever is at it, and every device they have reaches it — the keys
(arrows/WASD + Z X C Enter), EVERY gamepad (whichever is picked up; a pad sits in no seat of its own) and the
on-screen controls. Standard pad mapping: A/B/X → action/cancel/alt, Start, d-pad 12–15, left stick on axes 0/1
past a 0.45 dead zone. There is no couch co-op: the second keyboard block and the pads that claimed seats of their
own went, and two to four players now means an online room. Four seats remain (`MAX_PLAYERS`) because a room
seats four; seats 1–3 hold only what `net/session.js` injects through `setVirtual`, and nothing at all otherwise.

API: `update()` once per step; `held(p,a)`, `pressed(p,a)`, `buffered(p,a,window)`, `consume(p,a)`, `axisX(p)`,
`axisY(p)`, `mask(p)`, `anyPressed(a)` → slot or −1 (joined seats only: every shared menu's CONFIRM),
`typedCodes()` (text entry), `setVirtual(p, mask|actions)` / `clearVirtual(p)` (netplay + tests), `pollRaw(p)`
(this machine's devices as a mask, no edge state — netplay samples this to send, whichever seat it holds),
`joined(p)`, `setJoined(p,on)`, `resetJoins()` (every seat but 0 out of the room — the title's `enter()`),
`device(p)` (`'keyboard' | 'gamepad' | 'touch' | 'virtual' | 'none'`), `touchOn()` / `touchMask()` (are the
on-screen controls up, and what is held on them), `keyText(p,a)`, `padText(a)` (the button an action sits on, for
the hint line a player on a pad reads — a screen builds both lines in `enter()` and picks one in `draw()` by
`device(p)`; never read the device in `update()`, see docs/MULTIPLAYER.md), `setPadVirtual(list)` (tests).
`packMask` / `unpackMask` own the bit layout; `net/protocol.js` sends the mask as is.

REBINDING goes through a CAPTURE, because a screen otherwise only ever hears "the player pressed ACTION", never
"the player pressed C": `capture()` holds every seat at neutral and reports the first key or button down through
`capturedKey()` / `capturedButton()`, and `endCapture()` forgets it as held so the press that picked a binding is
not then played as what it now means. `game/screens/controls.js` is the only caller.

### `engine/touch.js`
A phone reaches SEAT 0 — the only seat a machine has. The layout is the sibling game *Aether & Brass*'s, because it
plays well on glass and the fixed d-pad it replaced did not: `TOUCH_STICK` is a FLOATING stick — a contact that
lands anywhere left of `zoneX` is the stick, centred where it landed, a direction (one of eight) once dragged past
`dead`, and a thumb dragged past `radius` pulls the centre after it so turning round is one ring's width — and
`TOUCH_BUTTONS` are round buttons on the right, each hit by a circle (`hit`) wider than its face (`r`), with GO
also owning its whole corner out to the edge of the glass. A contact is decided where it lands and never changes:
a button stays held until its thumb lifts, wherever it rolls (half the mini-games are HOLD GO), and the stick stays
the stick however far it wanders. `TOUCH_LABELS` names each action as the hint lines say it to a thumb. There is
nothing for `bindings.js` to own here, because the layout IS the binding, and `game/touchpad.js` draws that same
exported table (the ring at the live contact's centre, or at rest), so a control is never seen in one place and hit
in another. `touchMask()` is what `input.js` folds into seat 0 and `pollRaw()` puts on the wire; `touchStick()` is
the live stick contact, for drawing; `attachTouch(view)` takes the canvas api (not the element) because a contact
is mapped through `toInternal` into the 640x360 the layout is written in.

The listeners are on the DOCUMENT, not the canvas. A phone held sideways is wider than 16:9, so the canvas sits
between two dark bands (about 100 px each on a common phone) and that is where thumbs rest; a contact there maps to
an x below 0 or past 640 and lands on the stick or GO like any other. A contact on something laid over the game
(the error box) is not one. `index.html` gives the whole page `touch-action: none`, no text selection and no
long-press callout, and the listeners refuse a context menu while a finger is down and iOS's `gesturestart` — a
long press is HOLD GO here, and two thumbs moving apart are not a pinch. A first finger down (`isPrimary`) retires
any contact whose lift the browser never reported. Nothing preventDefaults a `touchstart`: a tap must still become
a click, because the title's Ko-fi address is reached by a click and nothing else.

The overlay is offered from the first frame on `(hover: none) and (pointer: coarse)` — a phone or a tablet — and
anywhere else from the first real touch, so a
laptop with a touchscreen is not handed thumb controls until a finger asks for them. ALT is offered more narrowly
still: only on a screen that declares `touchAlt` (the road's horn, the crew gallery's turn, the CONTROLS column
reset), because a thumb control that does nothing on the screen it is drawn over is worse than no control.
`setTouchAlt(on)` is how `main.js` says so each step, off the top screen's flag, and `tools/check.js` holds a screen
that reads `alt` to declaring it. A keyboard or pad mask stands the overlay down (`suppressTouch`), the next touch
brings it back, and `keyText` names the button on the glass while it is up, so the hint lines screens build in
`enter()` read as instructions rather than as a keyboard nobody in the room has.

`touchHitAt(x, y)` answers whether a click at a point belongs to the overlay — a button on offer there, or a contact
that just lifted having pressed something — which is what `engine/links.js` asks before it treats a tap as a click
on an address underneath: the controls lie along the bottom of the screen where the addresses are drawn, and BACK
opening a browser tab mid-game is not something a player can undo from a phone. A thumb that only rested on the
stick's side pressed nothing, so its tap still opens the repository address it landed on; one that steered does not.

The mask is sampled from the live contacts ONCE a step, not on the DOM event, so a seat's input is stable for the
whole of a fixed step; a press — and a direction the stick was pushed in — is held until the step after it so a tap
or a flick shorter than 16 ms is still played (`endTouchStep()` is what forgets it). Text is the one thing a thumb cannot spell: `setTouchTyping(on)` — which
`main.js` drives off the top screen's `typing` flag — raises an off-screen field, and what a soft keyboard puts in
it comes back out as the `KeyboardEvent.code` stream `screens/lobby.js` already reads. While that field is up the
X button spells ESCAPE, which a soft keyboard has not got and a player backing out of a room code needs.

### `engine/sideways.js`
A phone is always landscape. Held upright — `(hover: none) and (orientation: portrait)` — `index.html` draws the
canvas a quarter turn clockwise, sized so the game's long side runs down the screen (`!important` over the canvas
library's inline size, `flex: none` so the body's flex row cannot squeeze it, `dvh` where it is understood), and the
player turns the phone anticlockwise to play. It replaces a TURN YOUR DEVICE notice that a phone with its rotation
lock on could never get past. `turnSideways(view)` (called by `main.js` straight after `createCanvas`) is the input
half: it wraps `view.toInternal` so a contact on the turned canvas maps through the turn — x down the screen, y right
to left — and every caller (`engine/touch.js`, `engine/links.js`) keeps asking the view. Whether the canvas is turned
is read off its computed transform, cached with its rect until a resize, so the mapping follows what the stylesheet
actually did. The bands above and below a turned canvas come back as x below 0 or past 640, as the side bands do.

### `engine/actions.js`, `engine/bindings.js`
`actions.js` is `ACTIONS` (frozen — bit i of a mask, and `net/protocol.js` puts that byte on the wire), `BIT` and
`ACTION_LABELS`. Its own module so `bindings.js` and `input.js` can both have it without importing each other.

`bindings.js` owns WHICH key and button each action sits on, and is the only place that answer changes: one
keyboard map and one pad map shared by every controller. `keyboardMap()`, `padMap()`, `bindKey(action, code)` /
`bindPad(action, button)` → `{ ok, reason }`, `resetKeyboard()` / `resetPad()` / `resetAll()`, `isDefault()`,
`keyLabel(code)` / `padLabel(button)`, `serialize()` / `deserialize()` (the stored `keys` is still a list — of one
now — so a set saved with a couch P2 block loads its first block and ignores the second),
`load()` / `save()` (localStorage, never throws — a private window just means defaults), `bindingRevision()` and
`onBindingsChanged(fn)`, which is how `input.js` knows to drop its cached set of bound codes.

Two rules, enforced here rather than in the screen: a rebind sets the action to exactly ONE input, and it is
refused when the input would have to be taken off an action that has no other — an action with no key is one a
player can neither press nor see to fix. `RESERVED_CODES` (ESC, TAB, the reload keys) are never bound; ESC is what
cancels a capture. All 16 standard pad buttons are bindable, shoulders and triggers included; the left stick is
wired to the four directions and is not.

### `engine/canvas.js`, `engine/rng.js`, `engine/math.js`, `engine/trig.js`, `engine/text.js` (ported)
`createCanvas(el)`; `rng.seed/next/range/int/pick/chance/state` + `makeRng(seed)` for cosmetic streams;
`clamp/lerp/approach/rad/deg/...`; `dsin/dcos/dhypot`; `drawText(ctx, text, x, y, { size, color, align, shadow })`,
`drawTextOutlined(...)`, `measureText`, `lineHeight`. Text is upper-cased 5x7 pixels; never use system fonts.

### `engine/audio.js`, `engine/audio/*.js`
The model is the sibling game's audio stack, ported whole where it is generic and rewritten where it is that game's.
```js
export const audio = {
  init(),                    // installs the one-time gesture listeners that create/resume the AudioContext
  unlock(),                  // create/resume it now (from a user gesture)
  play(name, { volume=1, pitch=1, delay=0 } = {}),   // named synthesized SFX (the list is GDD section 11)
  music: { play(track), stop(), setVolume(v), current },   // looping tracks, equal-power crossfade between them
  setMuted(m), toggleMute(), muted, setVolume(v), setSfxVolume(v), unlocked, musicPlaying,
  testMode,                  // set true before init(): no AudioContext is ever made and every call is a no-op
  render(name, seconds, { music }), selfTest(),   // OfflineAudioContext: the same code, measured, for the playtest
};
```
The facade itself is the engine's: `engine/audio.ts` is `createAudio(...)` from `lib/audio/facade.ts` over this
game's SFX table and tracks. `lib/audio/synth.ts` is the primitives (`osc`, `noise`, `ring`, `am`, `echo`, `bus`,
`glass`), every one pure with respect to the context — `(ctx, dest, when, opts)` on any BaseAudioContext — which is
what lets `selfTest()` render the whole library into buffers and measure them with no speaker and no gesture.
`engine/audio/sfx.ts` is this game's library, one `(ctx, dest, when, { v, p }) => endTime` per name.
`lib/audio/sequencer.ts` is a step sequencer over TRACK DATA (`engine/audio/music.ts`): a key, a chord loop, channels
with instruments and sixteenth-note patterns (`'r:4 r+7:4'`, `'chord:16'`, absolute notes, `K.h.S.h.` drums),
compiled once and scheduled 200 ms ahead by a look-ahead timer. Every track is four bars, one chord a bar, and every
pattern is a whole number of bars (`compileTrack` warns otherwise and the audio playtest fails on it).

WIRING. `Game.push` starts the screen's track from its `SCREEN_MUSIC` table BEFORE `enter()` runs, so a screen
can override it for one visit (the closed day board plays `closing`); a screen missing from the table leaves the
music alone (the pause overlay). Screens call `this.game.audio.play(name)` from their `update()` — that is allowed
on the simulation path because nothing here is state: no rng is read (the pitch wobble is `Math.random`, and a peer
that hears a different wobble is on the same frame), nothing is hashed, and in `?autotest=1` no context exists.
Sounds that must land on a later frame (a stamp's slam, the end sign's knock) take `delay` in seconds and are
scheduled on the audio clock, never on a timer. M mutes (`main.ts`, off `typedCodes()`), and stands down while a
rebind is capturing, while the lobby is typing a host key (`screen.typing`), or when M is bound to an action
(`bindings.isKeyBound`). Mute is session-only; a persisted mute is a silent-game trap.

## 4. Art modules

### `art/shading.js`, `art/shapes.js`, `art/rig.js`, `art/rigParts.js`, `art/poses.js`, `art/secondary.js` (ported)
The cel-shaded paper-doll. `buildRig(build)` → rig; `drawRig(ctx, rig, pose, o)`; `computeJoints`; `jointScreen`.
Part hooks `(ctx, rig, pose, info)` in local spaces (see `docs/ART_STYLE.md` section 5). Poses: `DEFAULT_POSE`,
`makePose`, `lerpPose`, `P()` shorthand, `FACE` expression indices. Chains: `getChain(rig, name, n, opts)`.

### `content/critters/common.js` — the critter rig
`critterBuild(spec)` assembles a build with animal hooks (head with muzzle + ears, critter face, belly + apron,
shorts, paws, tail); `critterRig(def, slot)` builds it with the seat's player colour as the apron;
`makeCritterAnims(over)` gives the shared table: `idle walk run carry carryWalk reach catch cheer sad eat chop stir
bump hop wave sit` (signature keys one member authors on top: `sneak`, `honk`, `cast`, `taste`). Ear kinds:
`round point small long droop dome none`; tails `stub puff bushy ring thin none`.
Accessories are part factories: `toque(bandHex)` (`chefHat` = `toque(null)`), `bandana(hex)`, `scarf(hex)`,
`scarfTail(hex)`, `cap(hex)`; helpers `hatY(rig)`, `muzzleGeom(r, size)`, `DOME`, `PLUM_STRAP` place things on the
skull; `eggPath` and `drawApron` are the shared body and player spot a `parts.torso` override draws with (the
human head chef, `rowan.ts`, whose head, face, torso and hand are its own hooks on the same rig). `content/critters/items.js` `ITEMS.<name>` are held items — `basket` (`rig.basketFill`, `rig.basketIcon`),
`rod`, `spoon`, `knife`, `food` (`rig.heldIcon`, `rig.heldHex`), `plate`, `horn`, `pad` (the order-taker's clipboard,
`rig.padLines`) — set as `rig.weapon`. Every cast
file exports `{ id, name, fullName, role, species, colour, bio, build, anims }` and is listed in
`content/critters/index.js` `CRITTERS` (order = cast index: append, never reorder — the index crosses the wire in
the START packet, which is why `PROTOCOL_VERSION` moved when the cast grew); `content/critters/customers.js`
holds the NPC diners.

### `art/layers.js`
Offscreen pre-render: `makeLayer(w, h, paint(g, w, h, rnd), seed)`, `blitTiled`, `blitAt`, `blitWorld(ctx, L, camX,
camY)`, `vGradient`, `radialGlow`, `makeGlowSprite`, `boxOutlined`, `boxShaded`, `discShaded`, `polyOutlined`,
`makePool`, `pulse`, `PARALLAX`, `INK`. Backdrops paint ONCE with a seeded rng and blit per frame at integer offsets.

### `engine/links.js` (ported)
The only module in the build that leaves the page, for the two addresses on one paper strip along the bottom of
the title: the repository this build came from, and the Ko-fi address beside it.
`links.setZones([{ x, y, w, h, url, onOpen }, ...])` claims their rects (internal 640x360 px, measured by
`ui.ts hintSpans` so the paper drawn and the rect clicked are one rectangle); the title claims them in `enter()`
and releases them with `clearZones()` in `exit()`, one screen's worth at a time. A click lands through a real
user gesture, so it always opens - and that is the Ko-fi address's ONLY road: it gets no menu row and no key,
because the eight actions are the game's. `links.open(url)` is the other road, for the SOURCE row: called from
the fixed step it is a rAF callback rather than a gesture, so a browser may refuse the tab, and it returns
whether one ACTUALLY opened rather than leaving the row looking broken. `links.hotUrl` is the address the mouse
rests on, which is what lights that one address up. Either way both stay drawn, so a player whose browser
refuses the tab can read one off the screen. Nothing here is simulation: no screen's `checksumFields` sees a
link, and a peer never hears about one (docs/MULTIPLAYER.md).

### `engine/arcade.ts`
The [arcade](https://github.com/ssinnott/arcade) frames this page on a shelf beside other games. `arcade.init()`
(main.ts, before the first screen) recognises it by two things only it arranges together: a frame named
`arcade:<its link to this game, host key left off>` and a parent on this page's own origin (reading another
origin's location throws, so a page elsewhere that frames the game is not the arcade, whatever it names the frame).
Found, `arcade.active` is true and three things change: the title's menu gains a last row, BACK TO ARCADE, and the
slate grows one pitch upward to hold it; a table's invite link is `arcade.inviteUrl(room)`, which opens the arcade
at this game; and a host's key goes up to the arcade (`arcade.showRoom`) so its address bar carries that link.
Talking back is `postMessage` to the parent on this origin only: `arcade:hello` at boot, `arcade:exit` from the
row, `arcade:room` with the key. Not found - this game's own site, a file, a test, any other page that frames it -
every member is a no-op and the game is exactly the game. `tools/scenarios/arcade.js` covers both halves, with
`tools/arcade-host.html` standing in for the arcade. Nothing here is simulation either.

### `engine/particles.js`, `art/fx.js` (ported)
One 600-slot pool, visual only (its own rng stream): `particles.spawn(kind, x, y, opts)`, `burst(kind, x, y, n, opts)`,
`update()`, `draw(ctx, cam, layer)` with kinds `sparkle dust smoke steam ember crumb leaf drop text ring`; world coords
minus `cam`, or `opts.screen`. Helpers: `drawShadow(ctx, sx, sy, w, alpha, height)` (the ground-contact ellipse every
sprite draws before the y-sorted pass), `drawRing`, `steamPuff(ctx, x, y, phase)`, `burstDust/Steam/Crumbs/Sparkle/Drops`,
`floatText`, `ringAt`. A scene calls `particles.update()` in its update and `particles.draw(ctx, cam, 'back'|'front')`
around its sprites; `particles.clear()` on enter.

### `art/portraits.js`, `art/food.js`
`drawHeadPortrait(ctx, rig, pose, x, y, size)`, `drawBust(...)`, `idlePoseOf(def)`; `drawFood(ctx, icon, cx, cy, s, hex)`
and `FOOD.<icon>` for `apple egg fish milk sack jar carrot`.

## 5. Game

### `game/game.js` (ported)
`Screen { game, id, transparent, frame, enter(params), exit(), update(), draw(ctx), summary() }` and
`Game { input, rng, options, critters, net, run, registerScreen, push/replace/reset/pop, fadeTo(fn), update, draw }`.
`Game.update()` ticks only the TOP screen; overlays set `transparent = true` so the screen below still draws.

### `game/run.js` — the run
`planWeek(seed, { order?, recipes?, day? })` lays the WHOLE WEEK out from a seed on ONE `makeRng` stream (never the
gameplay singleton, whose call count the canary hashes), in day order, before day 0 opens: `DAYS_PER_WEEK` day
plans, each shaped by its `DAY_SHAPES` row (how many queues and how deep, how big the menu, whether twists are
dealt, what the weather may do). All of them up front because THE FETE draws its menu from what the earlier days
serve, and because resuming is then `planWeek(seed)[day]` — two integers rebuild any day, which is why the save
record holds no plan. `planDay(seed, { order?, recipes? }, shape?)` is the single-day door the scenarios and
captures use and defaults to the ordinary day's shape. `order` (1-based, `?order=`) forces a recipe onto the menu
and into the first customer's paws; `recipes` (0-based ORDERS indices, `?recipes=`) fixes the menu; both apply to
the day `day` names (`?day=`, 1-based) and to no other.
`startRun(game, { seed, critters, order, recipes, day })` creates `game.run`, plain data: `party[{ slot, critter, score }]`,
`day` / `week[]` / `weekStars[]` / `weekTakings[]` (which day of the week, the whole plan, and what the closed days were worth),
`recipes[]`, `lines[{ place, served, customers[{ customer, recipe, stars }] }]`, `needs[{ id, amount, have, used }]`
(the shopping list: every order summed; `have` gathered, `used` cooked), `line` / `customer` (who is at the hatch),
`order { id, dish, customer, line, steps, needs }` (that customer's, rebuilt by `startLine` and `serve`),
`truck { x, y, heading, at }`, `served`, `lastServed` (the line finished last), `score`.
Mutators: `need(id)`, `have(id)`, `stock(id)`, `gather(id, n)`, `complete()`, `missing()`, `placeFor(id)`,
`lineAt(placeId)`, `screenForPlace(placeId)`, `startLine(i)`, `lineOrders()` (the whole line as one giant order),
`serve(stars)`, `serveAll(stars)` (the whole line at once), `lineDone()`, `linesServed()`,
`stars()`, `dayComplete()`, `shape()`, `closeDay()`, `weekStarsTotal()`, `weekComplete()`, `nextDay()`, `summary()`.
`SCENES = ['map','orchard','pond','coop','kitchen','dairy','mill','hive','garden','stage','line','bramble','beach','holt','wood','terrace']` are the
START-packet scene indices; scenes finished after the first pass are **appended**, never filed next to their
neighbours, because the index is what crosses the wire. `START_SCENE` is the index an online match opens on (the
day board), which is what `net/session.js` seeds `lobby.scene` with.
The run is the ONLY state shared between screens; it is rebuilt identically on every peer from seed + party.
A run is FINITE: the week is fixed at `startRun`, `serve()` banks stars against the customer at the hatch rather
than rolling a fresh order, and once `dayComplete()` is true the day board closes the day out — `nextDay()` rolls
the run into tomorrow (a new menu, a new list, an empty pantry, the truck re-parked), and once `weekComplete()` is
true the only way on is the title screen.

### `game/week.js`, `game/book.js` and `game/garage.ts` — the saved files
`week.js` is the WEEK IN PROGRESS: `{ seed, day, critters, stars, takings }` under `foodie-truck.week`, written at
the closed day board and read by the title's `enter()` to turn PLAY into CONTINUE. It stores nothing derivable —
`planWeek(seed)[day]` rebuilds the rest. Online peers do NOT write it (`saveWeek(rec, online)` refuses): a guest
plays the host's week, which arrives in START.
`book.js` is the RECIPE BOOK under `foodie-truck.book`, and it carries **the invariant**: written by the game
(`recordDay`, importable anywhere) and read only by `screens/book.js` (`readBook`). Nothing it holds may reach
`planWeek`, `planDay`, `gatherTarget` or any `update()`, because two peers with different books must play
byte-identical days. `tools/check.js` fails the build on any other module importing the read side, and the
`bookInvariant` playtest scenario proves the same thing from outside. Both obey `engine/bindings.js`'s storage
rules: fragile on purpose, and touched from screen `enter()` / `exit()` only.
`garage.ts` is THE GARAGE under `foodie-truck.garage` (docs/GDD.md section 13): the coin tin, the truck pieces
bought and what is worn. `bankDay` pays each closed night's coins in once (keyed on seed and day); the garage
screen buys into its own copy and saves it in `exit()`; `truckStyleFor(game)` is what the truck-drawing screens
read in `enter()` - the stock truck in a live match. Like the book it never reaches the simulation, and online it
banks nothing.

### `game/friends.ts` and `game/kitchenFriends.ts` — the friends who ride along
`friendsOf(party)` → up to two `{ critter, job }` (docs/GDD.md section 2): a PURE function of the party, so every
peer seats the same friends from START and a resumed week needs nothing saved for them. `ridersFor(party, after)`
builds each a rig in the off-duty apron and an idling player (in `enter()`), and `pushRiderHeads` adds their heads to
a truck's `heads` after the crew's: the map, the line, results and the night's garage all ride them at the hatch,
never in the cab, and never past the four heads the windows hold. `KitchenFriends` is the kitchen's order-taker and
runner (`enter(run)`, `update(custs, served)`, `draw(ctx, custs)`, `summary()`): cosmetic by construction — no
input, no step, its own `makeRng` stream rather than the gameplay singleton, nothing in `checksumFields` — the same
contract as the kitchen's flights. The `friends*` playtest scenarios hold all of that from outside.

### Flow
```
title -> select -> stage -> map -> <orchard|pond|coop|dairy|mill|hive|garden> -> map -> ... (run.complete())
      -> map -> line -> kitchen -> results -> stage (closed)          (one giant order: one trip to the hatch a day)
      -> garage -> stage (tomorrow) ...  (online: stage (closed) -> stage (tomorrow), no garage)
title -> lobby (host key; the party picks critters there) -> stage ...  (online: the host's START opens the same scene everywhere)
```
- `screens/map.js`: the truck drives (`run.truck`); arriving at a landmark pushes whatever `run.screenForPlace(id)`
  names via `game.replace(screen, { place: id })` - its mini-game while the shopping list is short of what it
  supplies, the `line` screen (after `run.startLine(run.lineAt(id))`) once the pantry is full and a queue waits
  there - else it drops a sign. A queue at the landmark the truck already stands on when the map is entered
  (the pantry filled right there) re-fires the arrival by itself after 45 frames; a mini-game never does.
- Mini-games end with `run.gather(id, amount)` and `game.replace('map')`. Multiplayer: every seat plays at once.
- `screens/stage.js` (the day board): `run.lines` as paper tickets over the shopping list; no cursor, any joined
  seat's confirm (`game/menuinput.js`) fades to the map. Entered with `run.dayComplete()` it draws the closing
  card instead and its confirm leaves the room (if any) for the title.
- `screens/line.js`: the queue at `run.lines[run.line]` from `run.customer` on, every diner ordering at once (one
  bubble per dish, `run.ts dishGroups`); confirm (or 600 frames) fades to the kitchen.
- `screens/kitchen.js`: one critter per seat, stations from `content/places.js STATIONS` (fridge, chop, mix, stove, oven,
  plate), steps from `run.order.steps` (every recipe's first is the fridge). It cooks the whole line as one giant
  order (`run.lineOrders()`) at the same time, their steps merged into one run of the counter (`mergeSteps`), the
  order read by dish (`dishGroups`) on its ticket and hatch shelf, the whole line at the hatch window; the bell hands
  a plate per order out through the hatch to its diner (timed off `serveT`, so a peer draws the same serving), and
  once the last is taken it finishes with `game.replace('results', { stars: [...] })`. `screens/results.js` has the
  whole line eating the plates they were handed, banks it with `run.serveAll(stars)` then replaces itself with
  `stage` (`run.dayComplete()`), or `map` on a day of several lines.
- Screens read input by SEAT: `run.party[i].slot` is the input slot to poll for party member i. Online, every
  seat's mask arrives through `input.setVirtual` from the lockstep buffers, so a screen that only uses `input.*`
  is net-safe by construction. Screens must not read the clock, `Math.random`, or anything outside `run`, `rng` and
  `input` inside `update()`.
- Every screen exposes `summary()` (for tests) and, if it holds simulation state, `checksumFields()` → number list
  (for the desync canary).

### `game/minigame.js` — the shared mini-game furniture (the contract)

All nine mini-games stand on this module, so it is **frozen**: a screen that wants different numbers keeps them in
its own file (the orchard keeps its catch boxes there, the coop its pluck anims). It owns, and is the only place
that may define:

- `SIGN_SLAM` 6, `SIGN_HOLD` 60. There is no round length: a round has no time limit (GDD section 5).
- `makeSeats(game, floorY)` → one seat per party member (rig in the seat's apron colour, `AnimPlayer`, the ribbon
  basket, `count`, `bumpT`, the reused draw-options object); `seatAnim(seat, name, restart?)`.
- `makeClock()` / `tickClock(clock)` / `endRound(clock, text)` / `roundOver(clock)` — the round's whole lifecycle.
  The clock only counts (`elapsed` frames, for the checksum and the tests); nothing in it ends a round.
- `drawClock(ctx, countStr, progress, drawIcon, title)`, `drawEndSign(ctx, clock, frame)`, `drawSeatPlate(ctx, seat,
  stack?)` with `PLATES` / `resetPlates()` for the stacking pass.

A mini-game screen is therefore: `enter()` builds its cached layers, its seats, its fixed sim pools and its target
(**the remainder** of the order line, `max(1, amount - have)`, never the whole line — the map may have banked some
already); `update()` simulates only while `clock.phase === 0`, calls `finish()` when the party's total reaches the
target — the only way a round ends — and once `roundOver()` calls `run.gather(<ingredient>, total)` and
`game.replace('map')`; `draw()` blits, sorts, plates, then draws the tally ticket (its bar is `total / target`),
the hint and the end sign. Changing a number in this module changes seven
screens at once and needs all seven re-measured.

### Overlays
`screens/pause.js` is a transparent overlay pushed by `start` in a scene; `cancel` pops it. Online, pause is not
implemented (a paused peer would stall the room) — the pause overlay is refused while `game.net.active`.

## 6. Debug & test hooks (`src/main.js`)

URL params: `?autotest=1` (test mode: no rAF loop, seeded rng, `window.__game` populated), `?debug=1`, `?seed=N`
(pins the seed for every run on the page; without it each run the select screen starts draws its own, `rng.freshSeed`),
`?skipTo=<screen>` (straight into a screen with a run started), `?critters=0,1,2,3` (party for skipTo), `?place=coop`,
`?order=N` (force recipe N onto the day's menu and into the first customer's paws), `?recipes=0,2` (fix the menu to
those ORDERS indices), `?day=N` (open on day N of the week, 1-based, game/run.js DAY_SHAPES), `?room=CODE` / `?host=1` (online), `?transport=broadcast` (same-machine netplay for tests),
`?netrelay=1`, `?defaults=1` (boot on stock key/button bindings without clearing the saved ones).

```js
window.__game = {
  ready, game, input, audio, rng, options, loop, scenes,
  step(n), screen(), screenIds(), summary(), goto(id, params),
  setInput(slot, actions|mask), clearInput(slot), critterList(), errors: [],
  // bindings: get() / set(data) / reset() / saved() — what the CONTROLS scenario drives
  // gamepads: stand fake pads in for navigator.getGamepads(), one { down: [buttonIndex], axes: [x, y] }
  // per port (null for an empty one), null to clear them all again - every one of them drives seat 0
  setPads(specs),
  // a phone: pretend fingers in GAME space, entry i being finger i from call to call (a new entry lands, one that
  // was there moves - which is how a test drags the stick - and a missing one lifts; null lets go), the layout
  // read back rather than copied ({ stick, buttons }), and a seat's mask / device / typed codes
  touch(points), touchLayout(), inputState(slot),
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
- `npm run playtest` — headless Playwright: boots every screen, walks the flow, holds a netplay room. The
  `playthrough` scenario is the one that never jumps: title → select → day board → drive → mini-games until the list
  is full → the line → kitchen (the whole order at once) → results (the whole line served at once) → the closed
  board, on input alone (the menu
  fixed with `?recipes=` to the two landmarks it can play), so it fails when two screens that each pass on their
  own cannot hand over. The `audio` scenario renders every SFX and every track through an OfflineAudioContext and
  fails on a silent or a throwing one, then walks the screens and reads which track each asked for, presses M for
  real and reads the mute, and opens the closed board for its own track.
  The `touch` scenario plays the same walk `pads` does — title to day board — on nothing but thumbs, and then the
  stick's own rules (wherever the thumb lands, no edge to fall off, a ring's width to turn round) and the buttons'
  (held while the thumb rolls, GO's corner); `touchphone` does it through real DOM contacts on a phone-shaped page,
  the dark bands beside the canvas included; `touchupright` holds that phone upright, where the game is drawn on its
  side, and plays it through the turn before turning the phone back; `touchlinks` presses every control over the title's addresses and
  checks no tab opens — a thumb that steered from on top of one included — while a plain tap on either address
  still does; and the
  `touchtyping` one feeds the off-screen field the way a soft keyboard feeds one (an input event and no keydown at
  all) to check what comes out is the code stream the lobby reads.
- `npm run capture -- <dir> [screen[:params]...]` — screenshots of any screen at 2x (`tools/capture.js`).
- `node tools/sheet-capture.js <dir> critter=<id> [anims,walk,closeup,cast,bench]` — critter contact sheets.
- `.github/workflows/pages.yml` — lint, art-check, nettest, playtest, build on every push/PR; deploys `main`
  to GitHub Pages (the workflow installs Chromium for playtest with `playwright-core install`).

## 10. Code conventions

ES2022, `const`/`let`, named exports, 2-space indent, semicolons, single quotes, JSDoc on public functions. Never
hardcode a number twice: put it in the def or `constants.js`. All angles in degrees in content data.
