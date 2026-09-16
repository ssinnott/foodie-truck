# What we learned making Aether & Brass — portable art principles

Aether & Brass drew four heroes, thirty-one enemies, eight bosses and sixteen backdrops with nothing but canvas
primitives, and spent most of its 210 commits on one complaint: *"muddled, hard to pick out arms, legs, items and
the face."* This document is the distilled answer, written so a **new** procedural-art game — Foodie Truck — starts
where that one finished. Every principle names where it came from. Where a number is quoted, it is the number the
shipped code uses, not the one the docs claimed (the two drifted, which is itself lesson 52).

Sections: A pipeline · B characters · C backdrops · D user interface · E multiplayer and determinism ·
F process and tooling · G what to do differently this time.

---

## A. The pipeline (decide these once, on day one)

1. **One canvas at the art's resolution; let the compositor scale it.** 640×360 bitmap, CSS `image-rendering:
   pixelated`, the largest whole number of CSS pixels per game pixel that fills most of the window. A second
   full-window canvas that re-blitted every frame was the single most expensive thing the game did (30 → 20 ms per
   frame in a 4K window when it was removed). *(engine/canvas.js)*
2. **Zero binary assets, and mean it.** No image, font or audio files — even the app icons are rendered in Node with
   a hand-written PNG encoder. The payoff is not purity: it is that every piece of art is a function that can be
   re-drawn at any scale, re-coloured per player, hashed for tests, and diffed between two git refs.
3. **A fixed 60 Hz step, render per animation frame, seeded randomness only.** `update()` and `render()` never share
   a clock, every gameplay random goes through one seedable mulberry32, and `Math.sin/cos/atan2/pow/hypot` never
   touch simulation state (they are implementation-defined across browsers). This is what made online co-op a
   600-line addition instead of a rewrite. *(engine/loop.js, rng.js, trig.js; docs/MULTIPLAYER.md §1, §5)*
4. **Snap to the device pixel grid, not the object's local grid.** Joints are rounded through
   `round(v × pxScale) / pxScale` where `pxScale` is the rig's *draw* scale, and the outline stroke width is divided
   by that scale so exactly one device pixel shows. Local-integer joints on a 0.85-scale rig landed on device x 3.4
   and smeared the outline across two pixels. *(art/rig.js computeJoints, drawRig)*
5. **No allocation in a draw call.** No object/array literals, template strings or closures inside a part hook or a
   backdrop's per-frame draw; tone ramps are cached per rig per colour; one reusable `info` object is handed to
   every hook. Twelve rigs plus particles at 60 Hz with GC pauses is jank. *(docs/ART_STYLE.md §9)*
6. **Pre-render, then blit.** Backdrops paint once into offscreen canvases with a seeded rng and blit per frame at
   integer offsets; gradients are allowed only in the pre-render. A frame of the busiest stage is five `drawImage`
   calls, sixty 1×8 rain rects and one glow sprite per visible lamp. *(art/backgrounds/common.js)*

## B. Characters

7. **One 1 px near-black outline on every object boundary, including internal ones.** Every part strokes its own
   outline under its fill (stroke width 2×, so 1 px shows outside). Draw order then gives internal boundaries for
   free, and the eye can count the objects. *(ART_STYLE §0.2)*
8. **…but never inside one object.** A colour change within a silhouette — the sleeve ending mid-arm, hair on a
   skull, the muzzle on an animal's head — is a fill *clipped inside a path that has already been inked*, with no
   line of its own. Inking the sleeve transition is exactly what made an arm read as a bicep object stacked on a
   forearm object. The test: *would a reader call these two things separate objects?* Apron over fur: yes, two
   outlines. Muzzle on head: no, one outline. *(ART_STYLE §0.2; rigParts.js drawLimbSegs, drawSkull)*
9. **A limb is one shape.** Both segments appended into one path, stroked once, filled once, one shadow band down
   the whole limb, roots pushed *into* the body so the limb reads attached rather than bolted on. It used to be
   five outlined objects per arm plus a radius mismatch that inked a collar into every elbow.
10. **Draw order is part of the boundary.** An appendage draws after the mass it grips and before the mass that
    overlaps it: the hand after the tool (so it closes around the grip — a fist drawn first lost 692 px of hand
    under its own weapon), the near leg *under* the hip block (so it emerges from the pelvis instead of being
    painted onto the front of the body), the ear as a bump in the skull's contour rather than a triangle inked on a
    cheek. Fixed body order: back accessories → far leg → far arm → torso → near leg → hips → head → near arm →
    front accessories. *(rig.js drawBody)*
11. **Three tones, hard bands, top-left light, and the light rotates into every part space.** Highlight ×1.22 drifting
    warm, shadow ×0.66 drifting cool, shadow covering ~36 % of a part from its far side, a thin highlight cap on the
    lit edge; the light vector is rotated into each limb's local space so a raised arm shades correctly with no
    hand-coded shadow side. Max three tones per material. Never stack highlights. *(art/shading.js)*
12. **Fewer tones on smaller parts — a band is a dividing line.** Parts narrower than ~13 px get base + shadow only;
    below a 5 px radius a part is one flat tone plus outline; clipped shapes get a highlight cap only above a 10 px
    half-extent. A 5 px limb carrying both bands is three stripes across five pixels: noise, not form. (For the
    chibi cast this means flat limbs and one big highlight on the head — which is the cozy look anyway.)
13. **Build the value ladder before drawing.** Every pair of touching parts differs by ≥ 25 % relative luminance
    *or* a hue-family change (≥ 40° apart, both saturated). In practice value alone failed even the reference hero
    (skin vs sleeve measured 5 %) and the hue clause carried it; the single biggest de-blobbing win was giving the
    upper arms their own palette slot so the arms read against the torso. Fur vs shirt: change hue family. Apron
    vs shirt: keep ≥ 18 % value. *(ART_STYLE §0.1; rules/palette.js)*
14. **Far limbs darker and greyer, from a derived palette, never darkened twice.** 0.62 brightness, 25 % toward
    grey, a touch of blue. Far-side hooks must colour from the palette they are handed, not the module constant —
    the first pass hard-coded the near skin and drew the far fist as bright as the near one. Stubby overlapping
    chibi legs need this more, not less.
15. **The 2 px floor and one-of-each.** Anything under 2 px at 1× is noise: no 1 px rivets, notches, needles or
    stripes. Bands ≥ 3 px, buckles ≥ 3×3, one buckle per boot, one seam per garment, one shape per material, at most
    one material crossing per limb segment and only at a joint. A limb wearing three bands reads as a stack of parts.
16. **Faces: big features in rows, features that scale with the head.** Whites 6×5, pupils never under 3 px (the
    floor eats them), brows 2 px (3 px becomes a lid), nothing on the eye row, hats above the hairline. Lay the head
    out in rows before adding headgear. Expressions are a stepped index on the pose (never blended) and each beat
    reserves one: effort keys shout, damage hurt → dazed, success happy. *(rigParts.js drawFace)*
17. **Open silhouettes at rest.** Idle and walk keep the tool low at the side or on the shoulder with its head
    lifted clear of the hip, the off-hand swinging back so its fist shows behind the hip, and nothing crossing the
    torso or the face. Two-handed grips are for effort keys only. On a two-head chibi "hands below the chin" is
    impossible, so the rule becomes "hands never over the eye row, tool beside the face, never across it".
18. **Everything moves.** Idle breathes on four eased keys over ~54 frames (torso 1→4°, head ±2°, root y 0→1);
    walk is eight keys / 32 frames with the bob on the down keys (squash 1.03) and the free arm biased back; run is
    24 frames with a lean and both feet off the floor on the pass keys. Secondary-motion chains (beard, ponytail,
    scarf, tail, ears) lag the anchor joint's screen motion. A held pose reads as a prop.
19. **Every action has four beats: anticipation → overshoot hit (with smear) → hold → follow-through.** Anticipation
    eases *in* with the tool wound the other way; the hit key eases with overshoot and carries the smear arc; the
    hold sits a few degrees on; the follow-through eases in-out and carries the cancel window. Adjacent non-smear
    keys differ by a few degrees; a 100°+ jump is a flail. Squash and stretch pivot at the feet and are the
    cheapest weight cue there is (land 1.16, jump crouch 1.1). *(ART_STYLE §8)*
20. **Author facing one way; mirror by negative x scale.** Near/far limbs are named by side, not by screen, so one
    pose set covers both directions; the mirrored sprite is lit from the top-right by construction — decide once
    whether you accept that (every flipped sprite in games does) and move on.
21. **One reserved colour that means one thing.** Aether cyan appeared only on Concordat machinery, boss tells and
    meter pickups; heroes never wore it, and the lens turning red was always the attack tell. Reserve one colour
    per game for "interact / ready / hot" and forbid it elsewhere.
22. **Count shapes, not maths.** Rasterisation dominates: each cel shape is a stroke, a fill and one or two bands;
    each clip costs about three fills in software. Prefer capsules and balls (offset sub-shapes, no clip) over
    clipped paths; put detail in 1 px rects, which are nearly free. Cap a rig at ~45 cel shapes + ~140 rects.

## C. Backdrops and props

23. **Four planes, one contract.** Far 0.2, mid 0.5, floor 1.0, near 1.2; 16 rows of bleed above and below so a
    camera shake never shows the clear colour; world-anchored layers padded one screen on each side so edge columns
    never run out of art. Every scene exposes `{ update, drawBack, drawFront }` and a registry falls back to a
    placeholder so one broken scene never breaks the game.
24. **One saturated signal colour per scene; everything else in six to eight muted constants.** The signal colour is
    used only as small emitters (lamp glass, a lit window, a ripe fruit, a laid egg) and is semantically bound; the
    previous scene's signal colour is banned from the next. A polychrome backdrop claims the colour cells the cast
    needs. *(works1.js, glean1.js headers)*
25. **Put the cast's plane on the opposite hue and a clear value step away, and measure it.** The ground is ≥ 25°
    of hue from the cast's chroma-weighted mean (a road moved from hue 79° to 120° recovered 31 % of a faction's
    lost pixels without touching value); pale casts stand on cool mid-dark ground; interiors invert the ladder so
    the room is darker than the people in it. A tool differenced three renders of one frame and reported
    Oklab ΔE, lost %, hue gap and colour-cell overlap — the palette arguments were numbers, not taste.
26. **Nothing solid in the near layer at actor height.** Open shapes (a rim and spokes, never a filled disc) or mass
    pinned to the top or bottom edge; the lanes actors walk on carry no scatter. A filled near mass is "an opaque
    hole in the arena at exactly the height a fighter's chest is". Feet are read against the floor, so the floor
    under the feet stays clean.
27. **Only cheap things animate, deterministically.** Typed-array pools of 1–3 px marks, two to four drifting
    silhouettes, alpha-modulated pre-rendered glow sprites, frame-based pulses and per-index positions (never a
    re-rolled random field, which reads as television noise). Weather sits in `drawFront`, over the actors, below
    the HUD.
28. **Props are the rigs' cousins.** Same 1 px ink, same three tones from one hex, flat details, same flash gate;
    drawn in their scene's own palette object so they sit in the backdrop, with the signal colour only on a seal.
    A prop in the wrong scene's palette reads as an actor.
29. **Ground contact is a drop shadow and a y-sort, never baked into the floor.** Every entity draws an ellipse
    (w×0.5 by w×0.22, alpha 0.4, shrinking with height) before the sorted entity pass. On a 3/4 map with no floor
    band this and the sort are what make a sprite stand on the path instead of floating.

## D. User interface

30. **One 5×7 pixel font, integer sizes, glyphs cached as tiny canvases.** Body text carries a one-cell drop
    shadow; titles get an eight-direction outline; the size ladder is fixed (1 body, 2 headings, 3 stamps, 4 room
    code, 5 logo) and list rows sit on 11/14/16 px pitches. Text on light panels turns the shadow off.
31. **One plate recipe, restyled per motif.** Outer fill and stroke, an inset inner line, two decorative bands, an
    outlined size-2 title, rows at a fixed pitch, one animated marker beside the selected row. Every panel in the
    game was a variant of that one helper, which is why they read as one kit.
32. **Portraits come from the rig.** HUD heads, select busts and cut-ins are the same rig drawn scaled and clipped,
    anchored on the head joint, so they can never drift from the sprite or miss a palette swap.
33. **Everything per player is keyed by input slot with one colour per slot** — cursors, name plates, stamps,
    status columns, HUD entries. The one place the game used a second colour set (white/cyan cursors vs blue/orange
    HUD) was a lasting inconsistency. Corner-mounted cursor rings let four cursors share one 140×200 card.
34. **One confirm / back scheme, hint strings cached in `enter()`.** Confirm is action-or-start, back is cancel,
    every plate opens with its cursor on the row that closes it, and legends are rebuilt only when bindings change.
35. **Stamps are the only hard motion.** A six-frame slam and a six-frame shake for READY / rank / ORDER UP;
    everything else bobs by one or two pixels. Transients slide in from an edge, hold, leave, and queue one at a
    time.

## E. Multiplayer and determinism ("host key")

36. **A six-character room code over public infrastructure, no server of our own.** Codes use an alphabet with no
    vowels and no 0/O/1/I/L; the rendezvous is any of three public MQTT brokers over WSS (plain WS is blocked as
    mixed content and fails silently), with one topic per room and a per-pairing mux; BroadcastChannel is the
    same-machine transport for the end-to-end tests. `?room=CODE` invite links are the better UX.
37. **Send inputs, not state.** Deterministic lockstep with a delay derived from the measured round trip (2–10
    frames), one uint16 of input per player per frame, the last eight frames repeated in every packet on an
    unreliable, unordered data channel (redundancy replaces retransmission; a retransmitted input is worthless).
    Control messages ride a second, reliable channel.
38. **Make silent failure loud.** A checksum over `rng.state` plus every simulation field every 30 frames, with −0 and
    NaN normalised so there are zero false positives; a mismatch ends the session rather than letting two players
    play different games.
39. **The host is the courier of last resort and the clock of departures.** A full mesh where links form, the host
    relaying packets for pairs behind symmetric NAT, and a vanished player retired on one host-declared frame that
    the whole party has already halted on — three peers noticing a silence at three moments would be three
    simulations.
40. **Missing input never becomes neutral input.** Zero-filling manufactures release and re-press edges; stall
    instead, and keep re-sending while stalled or two peers waiting on each other deadlock forever.

## F. Process and tooling

41. **A binding style guide with a canonical reference rig.** ART_STYLE.md governs every rig; "when in doubt, do
    what Brunhild does"; a reconciliation document decides where design and technical docs disagree.
42. **Contact sheets before anything is called done.** Every keyframe of every animation, evenly spaced samples of
    the loops, close-ups at 6×, the whole cast side by side in the same four poses, and the same sheets mirrored.
    Every cell is rendered by the real renderer at 1× and then nearest-neighbour zoomed, so the sheet shows the
    outline and snapping the player sees.
43. **Make the guide executable, calibrated on reference content.** Rules live in a suite where the reference cast
    must pass with zero errors and a known-bad control must be flagged; every threshold is derived by measuring
    the cast and carries its measured range in a comment; exemptions are a visible per-case ledger with reasons,
    never a loosened number; a rule is not finished until a mutation test proves it can fire; whatever cannot be
    measured is tagged *(eye)* in the checklist so a green run is never read as "the art is good".
44. **Headless everything.** The page installs `window.__game = { ready, errors }` before the module graph loads so
    a broken import is caught; `?autotest=1&seed=1&skipTo=…` plus `step(n)` gives reproducible frames; a
    zero-dependency dev server that every tool embeds on port 0; Playwright resolved through one loader that fails
    loudly. Before/after is a picture of two git refs side by side, not an argument.
45. **Single-file build, deploy from main only.** esbuild bundles everything into one HTML file that opens from
    disk; CI builds on every PR and deploys only the default branch; the PWA files are generated from the built
    page and checked before upload.
46. **Keep files under ~700 lines and split by concern**, keep content as data plus small draw hooks, never hardcode
    a number twice, and put every shared number in one constants module.
47. **Open every document with its place in the precedence chain.** Line one says who wins a disagreement: the design
    doc owns names and numbers, the architecture doc owns technical matters, a reconciliation table wins on numbers
    where the two disagree, and the style guide supersedes the design doc's renderer line. Write the banner before
    the content.
48. **Finish one canonical reference rig first, then calibrate everything on it.** Every rule in the guide quotes the
    reference's actual numbers; the suite's thresholds are measured from it and can never set a bar above what the
    reference draws, so the reference is built to the standard before any rule exists.
49. **Prefer parameterised default parts over per-species hooks.** A renderer fix reaches only the rigs on the default
    path; the sibling game had to count, per faction, which rigs a fix actually reached and then run a content pass
    on the rest. Give the shared head, limb and body renderers parameters (ear shape, muzzle size, tail, paw) and
    keep custom hooks for the rare prop, so one fix lands on the whole cast.
50. **Art commits freeze gameplay data and prove it.** An art pass changes pose values only; the commit says every
    timing window, hit field and animation name is unchanged and backs it with a dump-and-diff. Severity is a
    policy: errors are cheap to get right and silent on the reference, warnings are the work list, info prints the
    measured table, and a tier that did not run is listed as SKIPPED, never silently green.

## G. What to do differently this time

51. **Write the tooling on day one, not after the art.** Server, sheet, capture, build and playtest arrived together
    in the sibling game's first tooling commit and the readability pass could not have happened without them; the
    invariant suite followed the same day. Foodie Truck starts with all of them in place.
52. **Keep the docs honest against the code.** The shipped shading gates, the contact-shadow default, the face pixel
    sizes and the outline width all drifted from the prose; the suite records the drift in a `DOC_BUGS` list. Quote
    the code, and when a number changes, change it in one place.
53. **One player palette, one ink, one set of UI tokens.** Route every colour through the constants module from the
    first screen; the sibling game had ~30 hex literals bypassing its UI table by the end.
54. **Design for the small rig.** Feature sizes that are fixed pixels (pupils, brows, bands) do not shrink with a
    chibi head; arm poses that clear a 36 px human face cover a 24 px animal face; chain gains need raising because
    a smaller anchor moves fewer pixels. Measure the first reference critter, then set the budgets.
55. **Decide the light flip, the reserved colour and the scene signal colours before authoring**, and write each
    scene's palette note (6–8 muted hexes, one signal colour, the hue gap to the cast) at the top of its module.
