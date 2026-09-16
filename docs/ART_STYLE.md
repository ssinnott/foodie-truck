# FOODIE TRUCK — Art & Animation Style Guide (binding)

> **Precedence:** this guide governs every rig, backdrop and panel. It supersedes anything `docs/GDD.md` says about
> drawing. `docs/ARCHITECTURE.md` wins on technical matters. `docs/ART_PRINCIPLES.md` is the *why* behind every rule
> here, with the numbers measured in the sibling game; this file is the *what* for this game.
>
> **Canonical reference rig:** the first finished critter in `src/content/critters/` (named in §1). When in doubt, do
> what it does. `tools/sheet.html` shows it; `npm run art-check` holds the data-tier rules below.

## 0. Readability rules (binding — read before anything else)

Judged at the **2× display scale** the game is played at, sanity-checked at 1× and at the 0.5× map-token squint.
In idle, walk and every action key a viewer must instantly pick out: the head with its species ears, the eyes and
mood, the muzzle, the apron or kit and the player's colour, **both** paws, both feet, the tail, and the held item.

1. **Value ladder between touching parts.** Every pair of adjacent parts differs by ≥ 25 % relative luminance **or** a
   hue-family change (≥ 40°, both saturated). Build the ladder before drawing: fur (mid or light) vs belly/muzzle
   (light) vs apron (mid, a different hue family from the fur) vs shorts (dark) vs feet/pads (dark). The player
   colour must clear whatever it touches by value alone (it is the same four hexes for everyone; see §4).
   Enforced by `palette/*` in `tools/art-check.js`.
2. **One 1 px outline per OBJECT boundary, none inside a material change.** Every part strokes its own outline under
   its fill. A colour change inside one silhouette — the muzzle on the head, the belly on the torso, inner ear,
   fur below a sleeve, tail rings — is a fill clipped inside a path that was already inked, with no line of its
   own (`makeHead`, `makeTorso`, `makeTail` in `content/critters/common.js` do this). The apron, the ears, the
   hat, the basket are separate objects and carry their own line. Test: *would a reader call these two things
   separate objects?*
3. **Draw order is the boundary.** Back accessories (tail, slung basket) → far leg → far arm → torso (+apron) →
   near leg → shorts → head (ears behind the skull, skull+muzzle, markings, face, hat) → near arm (item, then the
   paw over its handle) → front accessories. A paw drawn before the spoon hides behind it.
4. **Far limbs darker and greyer**, from `rig.paletteFar` (0.62 brightness, 25 % toward grey), never from a module
   constant, never darkened twice. Stubby overlapping legs need this more than a human rig did.
5. **Calm bands.** Limbs (r 3.5–4) fall under the flat floor (`FLAT_R` 5) and are one flat tone plus outline; the
   head (r 12–16) and the belly get the single big highlight cap and one shadow band; nothing gets two highlights.
   A rig may ask for calmer via `build.tones: 2` or a softer `build.ramp`, never busier.
6. **Big, simple faces in rows.** Rows for headR 12: ears at −0.8r | brows at −0.42r−4 | eyes −0.42r..−0.05r |
   muzzle +0.0r..+0.8r carrying the nose at its tip and the mouth below it | chin +r. Whites 6×5, pupils 3×3,
   brows 2 px, nose 5×4. Nothing sits on the eye row; hats above the hairline. Expressions are a stepped index
   (`FACE`), one per beat: effort keys `grit`/`shout`, damage `hurt` → `dazed`, success `happy`, blink `closed`.
7. **Open silhouettes at rest.** Idle and walk hold the item low at the side or in front of the belly with the
   off-paw visible; nothing crosses the face. Raised arms go up **forward** (120–150°) so the near paw lands
   beside the muzzle, never on the eyes; the far arm may go up backward. Held items hang `upright()` from the paw.
8. **The 2 px floor and one-of-each.** Nothing under 2 px at 1×: no 1 px whiskers, rivets or stitches. Bands ≥ 3 px
   (inked bands 4 px), one pad per paw, two toes per foot, one seam per apron, one shape per material, zero material
   crossings on a leg and at most one on an arm.
9. **Everything moves.** Idle breathes on 2–4 keys over 50–56 frames; walk is 28 frames with the bob on the down keys
   (on 6 px legs the bob *is* the walk); tails, long ears and hat tips ride secondary-motion chains that never
   settle. A held pose reads as a prop.
10. **Squint test, cast test, sheet before done.** `node tools/sheet-capture.js` (`anims`, `walk`, `closeup`, `cast`,
    `facing=-1`) is looked at before a critter is called finished; the cast sheet must tell every critter apart at
    idle in 100 ms on the orchard floor colour.

## 1. The look

*(Filled from the art direction chosen by the judge panel; see §12 while this reads TBD.)*

## 2. Proportions

Two-and-a-third heads tall, 56 px standing at scale 1 (`CHIBI` in `content/critters/common.js`):
`headR 12, neck 1, torsoW 24, torsoH 18, hip 20, upperArm 8, lowerArm 7, handR 4.5, upperLeg 6, lowerLeg 6, footL 9,
footH 5, armR 3.5, legR 4, bulge 0.15, shoulderX 3, hipX 4`. Height = `upperLeg + lowerLeg + footH − 2 + torsoH − 2 +
neck + 2·headR`. Species vary within: the hungry one headR 14–16 / torsoW 28 (the widest), the chef headR 11–12
(smallest body, tallest hat), ears add 8–18 px above the skull. `art-check` holds height 46..68 and 1.9..2.8 heads.
Paws `handR ≥ 0.33·headR` so they read from across the screen. Draw scales: 1× in mini-games and the kitchen,
0.5× as the map's window busts, 2× on cards and the title, 2.5× on select busts.

## 3. Light, tones, outline

- Outline: 1 device px of warm ink `#2A1F1A` (`INK`), stroked 2×ow under every fill (`outlinePath`); `rig.ow` is
  divided by the draw scale so the line stays one device pixel at 0.5× and 2×. Backdrops use the same ink at 1 px
  on props and 2 px on big blocks.
- Light: top-left, rotated into every part space by `enter()`/`setLight()`. A left-facing critter is lit from the
  top-right (the sprite flips); decided once, accepted.
- Ramp: `tones(rig, hex)` → hi ×1.22 (warm), sh ×0.66 (cool), rim ×1.55; a critter may soften to `build.ramp
  { hi: 1.15, sh: 0.74 }`. Shading gates as shipped in `shading.js`: `THIN_R 6.5`, `FLAT_R 5`, `HI_MIN 10`.
- Far palette: `farPalette(palette, 0.62, 0.25)`; contact shadow off.
- Hit / pickup flash: while `rig.override` is set every hook draws outline + flat fill and returns.

## 4. Palette slots and the player colour

Critter palette keys (`DEFAULT_PALETTE`): `skin` = fur, `hair` = dark fur / markings / brows, `belly` = light fur
(muzzle, belly, inner ear, paw pads), `primary` = apron, `secondary` = shorts, `accent` = trim, `dark` = nose and
boots, `metal` = utensils, `sleeve` = fur (set by `critterBuild`). Per-critter extras are module constants.

**Player colours** are `PLAYER_COLORS` in `constants.js` (P1 `#3F9BFF` sky, P2 `#FF8140` marmalade, P3 `#B08CFF`
lavender, P4 `#FF63B0` raspberry) and are the one colour set for cursors, name plates, ready stamps, basket
ribbons, float caps, station tags and the critter's own player spot. *Where that spot sits on the critter is the art
direction's rule (§1).* Whatever it is, it must clear its neighbours by value alone for all four hexes.

**Scene signal colours** — one saturated colour per scene, bound to one meaning, used only as small emitters and
banned as decor elsewhere: map `#F2C14E` lantern gold (the next destination), orchard `#D9463B` ripe apple, pond
`#5FD3C0` bite ring, coop `#F2C14E` fresh-egg sparkle (shared with the map by exemption: same "the thing you want"),
kitchen `#E23A2E` HOT (also the game-wide reserved heat/danger colour: burner, boil-over, burnt, rooster comb).
Backdrops are built from 6–8 muted constants each (`ENV` in `palettes.js` is the shared base ladder).

## 5. Authoring parts, accessories and items

All hooks receive `(ctx, rig, pose, info)` in a local space set up by `art/rig.js`: head space origin at the head
centre facing +x; torso space origin at the hip centre, y up negative; hand space +x along the forearm from the
wrist; foot space +x toward the toe, y down; limb spaces +Y along the bone. `info` is reused — never retain it;
far-side hooks colour from `info.pal`. Helpers: `celBall/celCapsule/celTaper/celRect/celPoly/celPath`, `band`
(an inked ≥ 4 px band), `flat`, `tones`, `pathRR`.

`critterBuild(spec)` assembles a critter from parameters — `ears: round|point|long|small`, `earTip`, `muzzle`
size, `markings` (e.g. `maskMarking`, `cheekMarking`), `tail: stub|puff|bushy|ring|thin`, `boots`, `apron`,
`accessories` (`chefHat`, `bandana(hex)`, `scarf(hex)`, `cap(hex)`), `parts` overrides. Prefer a parameter over a
per-species hook so a renderer fix reaches the whole cast (ART_PRINCIPLES 49). Held items are `ITEMS.*` in
`content/critters/items.js` and are set at runtime: `rig.weapon = ITEMS.basket; rig.basketFill = 0.5`.

Steam and smoke are the only soft marks (`steamPuff`, the `steam` particle); glow is flat with a 2 px `#FFD27A`
core, pre-rendered into a sprite and alpha-modulated.

## 6. Face

`critterFace` (the default `parts.face`) draws two whites with 3×3 pupils and a catchlight, 2 px brows in
`palette.hair`, and a mouth on the muzzle, from `pose.face`: `neutral | happy (arcs + smile) | hurt (sad brows, frown)
| shout (open) | dazed (x eyes) | closed (blink) | angry/grit (brows down)`. A species may draw markings under the
face (`markings`) or replace the hook; whichever, keep the rows of §0.6 and the 3 px pupil floor.

## 7. Backdrops, props and FX

Paint once, blit per frame (`art/layers.js`): every scene pre-renders its layers with a seeded rng (seed blocks:
map 140–159, orchard 100–109, pond 110–119, coop 120–129, kitchen 130–139) and blits at integer offsets; parallax
`far 0.2 / mid 0.5 / ground 1 / near 1.2` for side views, none in the kitchen, chunks for the map. 16 rows of bleed.
Nothing solid in the near layer at critter height; walk lanes carry no scatter; the plane behind the critters'
torsos is ≥ 25 % darker than the lightest fur or a hue family away; interiors invert (dark room, cast and food the
lightest and warmest things). Every sprite draws `drawShadow` before the y-sorted pass. Props share the rig's ink
and three tones (`boxShaded`, `discShaded`, `polyOutlined`) in the scene's own palette object. Only cheap things
animate: pools (`particles`), glow sprites, `pulse`, index-hashed twinkles, a capped 6-strip shimmer.

## 8. Animation bar

Author with `F(dur, spec, extra)`; `ease` on every key; every key sets both legs; `root` for weight; `face:` on
effort and success keys. The shared table (`makeCritterAnims`) every critter ships:

| state | keys | pattern |
|---|---|---|
| idle | 2–4, 52f | torso 2→4°, head ±2°, root y 0→1; ear flick / tail chain via `rig.tick` |
| walk / carryWalk | 4, 28f | contact / down ×2, root y +1 and squash 1.03 on the down keys |
| run | 4, 20f | lean 16°, root y −2 on the pass keys |
| carry / catch | 2 loop | both paws forward, item `upright` in front of the belly (`weapon: 90`) |
| reach / wave / cheer | 2–3 | near arm up **forward** (130–150°), far arm up back, `happy` |
| eat | 5 | anticipation `in` 8f → paw to muzzle `overshoot` 6f (`shout`) → chew ×2 (`closed`) → return `out` (`happy`) |
| chop | 4 | anticipation `in` 6f (item up, `grit`) → hit `overshoot` 3f with smear → hold 4f squash 1.04 → return `inout` 8f |
| stir | 4 loop | sustained: four `inout` keys tracing a circle with the spoon |
| bump | 3 | snap back 5f (`hurt`, squash 1.08) → recover 10f → neutral 6f (`dazed`) |
| hop | 4 | crouch `in` 5f squash 1.1 → air 14f stretch 1.06 → land 5f squash 1.1 → settle |
| sad / sit | 2 loop | head down / seated, `hurt` / `closed` |

Timing windows (a chop's beat, the bite window) belong to `docs/GDD.md`; the art fits inside them.

## 9. Performance

Zero allocation in draw hooks; count shapes, not maths: a critter stays under ~40 cel shapes and ~100 flat rects
per draw (measured reference: see `node tools/sheet-capture.js … bench`, 0.67 ms/draw headless for the stand-in).
Four critters + a scene's props + 200 particles at 60 fps on a mid laptop.

## 10. Contact-sheet workflow

`node tools/sheet-capture.js <dir> critter=<id> [anims,walk,closeup,cast,bench] ["mode=…>file.png"]` writes
`sheet-anims.png` (every key of every anim), `sheet-walk.png` (8 samples of walk/run/carryWalk), `sheet-closeup.png`
(6×), `sheet-cast.png` (the whole cast in idle/walk/carry/cheer). Query flags: `&facing=-1` mirror test,
`&item=basket|rod|spoon|knife|food`, `&zoom=`, `&bg=#hex`. In game: the CREW gallery. Look at every image before
calling a rig done; read the anims sheet row by row — adjacent non-smear keys differ by a few degrees, a 100°+ jump
is a flail.

## 11. Self-review checklist

Items covered by `npm run art-check` name their rule; *(eye)* means a human still has to look.

- [ ] Registry: id, name, role, species, build, anims — `registry/*`.
- [ ] Ink is `INK`; every palette slot present; sleeve = fur — `palette/outline`, `palette/slots`, `palette/sleeve`.
- [ ] Ladder: apron vs fur, belly vs fur, apron vs shorts, markings vs fur, nose dark — `palette/*`.
- [ ] Player spot clears its neighbours for all four `PLAYER_COLORS` — *(eye, then a rule once three rigs exist)*.
- [ ] Height 46..68, 1.9..2.8 heads, paws ≥ 0.33 headR — `proportions/*`.
- [ ] Every shared animation present, loops loop, cycle lengths in band, idle breathes, walk bobs — `anim/*`.
- [ ] Cast: species unique, furs ≥ 25° hue or ≥ 20 % value apart, aprons apart — `cast/*`.
- [ ] Nothing crosses the face at rest; raised paws land beside the muzzle — *(eye: anims sheet)*.
- [ ] Squint: the cast sheet at 0.5× still tells four critters apart — *(eye)*.
- [ ] Mirror: `facing=-1` sheet shows the tail, ears and item on the right side — *(eye)*.
- [ ] Held items hang upright from the paw; the paw closes over the handle — *(eye: `item=` sheets)*.
- [ ] No `Math.random`, no clock, no per-frame allocation in a hook — *(eye)*; `node tools/check.js` clean.

## 12. Decisions still open

- §1 the look and §4 the player-colour spot: chosen by the judge panel over three proposals (storybook / arcade /
  toybox); recorded here when synthesised.
