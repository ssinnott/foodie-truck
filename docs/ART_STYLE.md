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

## 1. The look — HEDGEROW DUSK

A children's picture book of an English hedgerow lane, drawn as clean 1 px-inked cel art on warm paper. Every shape
is a rounded blob; every colour is a paper-warm mid-chroma tone (nothing above ~0.65 saturation except the four
player colours and each scene's one signal colour); the light is a low warm afternoon from the top-left with
**plum-brown shadows** (`#4A3038`, `#2F2338`) instead of black ones; the ink is warm near-black `#2A1F1A` so the
page reads as printed. Warm on the sky and roofs, cool on the ground the cast stands on. The world is six ground
tones and plum silhouettes; signs are hand-lettered wooden boards on 2 px rope; orders are paper tickets with
perforated tops; menus are a chalk slate. Cheap on purpose: backdrops are painted once, and the only per-frame
marks are steam, cloud shadows, water glints, leaves and the critters. Daylight in the orchard and the coop, golden
hour on the pond and the map's horizon, a dark warm kitchen; no day/night cycle in the prototype.

Chosen by a three-judge panel over an arcade and a toybox proposal (unanimous), with grafts from both recorded
in §12. **Canonical reference rig: Barley** (`content/critters/barley.js`).

### The cast

| | species | role | h / headR | silhouette cue | fur `skin` (L) | markings `hair` | light `belly` | legs `secondary` | `shorts` | signature |
|---|---|---|---|---|---|---|---|---|---|---|
| **Barley** | Suffolk sheep | the hungry one — EAT / CARRY | 64 / 15 | widest body, scalloped wool cap, dark face, drooping ears, brass bell | `#F1E4C8` (.90) | face `#3F3A48` | muzzle `#8C7A86` | `#3F3A48` | `#3F3A48` | bell on a plum strap; eye whites always on (dark face) |
| **Sorrel** | field mouse | the chef — CHOP / MIX | 48 / 11 | smallest body under a puffed toque, big round ears, thin rose tail | `#E2DDEA` (.88) | `#7A6A8C` | `#D9A2AE` (rose) | `#E2DDEA` | `#4A3F6B` | white toque with a 4 px blackberry band; paring knife |
| **Chicory** | brown hare | the driver — DRIVE / HONK | 56 / 13 | 16 px upright ears with dark tips, flat cap + goggles, cream scarf | `#6B5241` (.34) | `#3A2B22` | `#EBD9B4` | `#6B5241` | `#8C6E48` | goggles slide onto the eyes on `hurt`; bulb horn |
| **Cress** | pond frog | the forager — GATHER / CAST | 57 / 13 | wide head with two eye domes on top, long legs and big feet, straw sunhat | `#3F7D3B` (.39) | `#2A5A2A` | `#CFE3A6` | `#3F7D3B` | `#2F5F7A` | straw hat with a plum band; dark-willow basket on the hip |
| **Rowan** | human | the head chef — TASTE / ORDER | 76 / 14 | the tallest toque in the cast, straight-sided and pleated, on a round skull with no muzzle, no animal ears and no tail; chef's whites under the apron | skin `#603A28` (.26) | hair `#BFB7AA` (silver) | jacket `#F4F0E6` | `#515A68` | `#515A68` | beetroot neckerchief and hat band (the truck's own body colour: the owner wears the livery); a wooden spoon |

Heights are the shipped rig's (`tools/art-check.js` holds the critters to a 46–68 px band; the human alone may
stand to 78, an adult among the animals at a quarter over Barley): the two small critters
grew a couple of pixels in the torso so the apron — the player's own colour — is not swallowed by the head.
Two light furs and two dark ones, so the four aprons (the player colour, L .54–.64) clear every fur by value: wool
.29+, mouse .27+, hare .37+, frog .28+. Sheep and mouse are both pale and are told apart by silhouette (wool
scallops + dark face vs toque + ears + tail); the cast sheet at 0.5× is the check. Aprons: `primary` is set **per
seat** to `PLAYER_COLORS[slot]` (`critterRig(def, slot)`); an unseated critter wears the off-duty apron
`#D8C093`. Straps and the pocket seam are drawn in the apron colour so nothing pale sits on pale fur. Baskets
are dark willow `#6B4E3A` with cream highlights (wicker collided with P2's marmalade). Feet: Barley hooves and
Chicory paws are dark, so every floor they stand on is ≥ L .30.

**The human** keeps every slot's meaning but one: `skin` is skin, `hair` is hair (and the brows, which is why it
is light — dark brows vanish on dark skin), `belly` is the jacket, the plane the apron actually sits on, and that is
what `palette/player-spot` measures for a human (whites .32+ against all four). The upper arm is the jacket's
sleeve (`critterBuild`'s `sleeveHex`) and the forearm is skin, the one material crossing an arm may carry (§0.8).
The skin is deep on purpose: every mid skin tone lands within a few percent of a player colour by value (the
hands hang beside the apron), and a pale one collides with Barley's wool by both hue and value (`cast/fur`); L .26
clears all four aprons by .5+ and the nearest fur, Chicory's peat, by .23. The head is then the darkest thing on
the body and the whites the lightest, with the apron between them — the ladder reads at the 0.5× squint as dark
head / white hat and coat / mid apron / dark trousers, a silhouette none of the furs can make. Sorrel and Rowan
both wear a toque: Sorrel's is the low puffed one with two balls, Rowan's the tall straight pleated one, so the
two chefs never read as one silhouette on the cast sheet.

### The truck

A rounded 1950s milk-float: beetroot-plum body `#7E3A56` (shadow `#5A2A40`, cap `#9A5470`), cream roof and
wheel rims `#F1E4C8`, a mustard/cream striped awning (`#E2B44A` / `#F1E4C8`, stripes as a clipped fill) over the
side hatch, a chalk board hooked on the hatch, brass headlamp `#E2B44A` with a `#FFD27A` core, ink tyres, a wooden
FOODIE TRUCK roof sign. One inked body path with the cab bump appended. Sizes: map token 40×24 (master 80×48 at
0.5×), title/results 160×96 (2×), lobby 320×192. On the map the crew's 12 px heads ride in the windows (driver in
the cab, the rest at the hatch) and inherit the bob; a `HONK!` stamp slams above the cab with a 1.1 squash.

### Scenes in one line each

- **Map**: 3/4 storybook plane, meadow `#8FA05A` / shade `#728A4C`, wheat `#D9B15E`, lanes `#C9AE78` (L .62, no
  scatter) with a `#B99A6A` edge, river `#6F9FB0` over `#4E7A8C`, hedges `#4F6B3A`, cottage walls `#F1E4C8`, roofs
  `#A65A48`, plum tree-line `#4A3038`, a dusk-peach horizon strip `#F4C9A0`; signal: lantern gold on the next sign.
- **Orchard**: daytime warm sky `#FBE3C4`→`#F4C9A0`, canopy `#4F6B3A` with `#6E8A48` caps, grass `#5E7A3E` (L .42),
  four depth lanes 8 px apart; signal: ripe apple red `#D9463B`; HOT on a bomb apple's fuse spark.
- **Pond**: golden-hour sky, a plum tree-line `#4A3038` behind the torsos, bank turf `#6E7A5A`, water `#4E7A8C` with a
  `#6F9FB0` surface band, jetty `#9A6234`; signal: bite ring mint `#5FD3C0`; floats white with a slot-colour cap and an
  8×5 slot tag above.
- **Coop**: grey-green boards `#55665A`, nest straw `#C9A05C` (darker than the eggs), packed-earth floor `#48526A`
  (cool, L .32), hens rust `#A8623A` and speckled grey; signal: fresh-egg gold sparkle `#F2C14E`.
- **Dairy**: a dim stone byre, slate eave `#453F4C`, lime-washed stone `#806A4B`, oak beams `#5C3E22`, byre floor
  `#5E4C33` under straw `#A07C42`, one bright hay hatch of `#FBE3C4` sky; cows `#A8724A` with cream patches, four
  stalls on a 126 px pitch; signal: mint `#5FD3C0` on the pump chevron and the full pail.
- **Mill**: a dark timber tower, boarded wall `#4A3A2C` (the plane the whole cast reads against), oak frame
  `#6B543A`, plank floor `#7A6144` (L .40, so dark hooves keep their contact), hessian `#8A7350`; the flour and the
  sacks are the lightest things in the room; signal: gold `#F2C14E` at a pouring chute's mouth.
- **Hives**: late-afternoon clover meadow, sky `#F9DDB8`→`#F2C39A`, downs `#B3AE7E`, clipped hedge `#3F5A34` (darker
  than the orchard's canopy so the two green scenes never twin), meadow cooler and lighter than the orchard's grass,
  five straw skeps on a bench; signal: gold on a skep with honey left in it.
- **Farm**: a walled kitchen garden, straw sky `#E9DCBE`→`#F4C9A0`, lime-washed wall `#8A8478`
  (deliberately near-colourless: brick sat 19° from P2's marmalade apron across 70 rows of frame), tilled beds
  `#4A3C32` (L .25), crop green `#7FA850` with the other crops' foliage a step off it (potato haulm `#6C9448`,
  onion and leek blades `#6FA07E`, beetroot leaves `#5E7F3E`) so each vegetable is its own plant in the row; a
  crop that grows in view (pumpkin, cabbage, an onion's or a beetroot's shoulder, the berries) wears its
  ingredient hex on the vegetable itself and nowhere else; signal: gold on a ripe root's
  sparkle — and no HOT anywhere, because nothing on a farm's vegetable row can hurt you.
- **Kitchen**: plum wall `#4A3038`, slate counter top `#4F5A62` (rows 200–206), steel counter front `#3E4A55`
  (rows 206–246), floor checker `#4E4450` / `#5A4E5C` (rows 246–340), feet line y 252 so torsos read on the counter
  front and heads on the wall; a floor-standing oven that breaks the counter line; copper pot `#B87333`; paper and
  brass are the warm things; signal: HOT `#E23A2E` on the burner; a slot-colour tag above each owned station.

## 2. Proportions

Two-and-a-third heads tall, 56 px standing at scale 1 (`CHIBI` in `content/critters/common.js`):
`headR 12, neck 1, torsoW 24, torsoH 18, hip 20, upperArm 8, lowerArm 7, handR 4.5, upperLeg 6, lowerLeg 6, footL 9,
footH 5, armR 3.5, legR 4, bulge 0.15, shoulderX 6, hipX 4` (per-critter shoulderX 7–9). The shoulders sit
out at about a quarter of the torso width, not the humanoid rig's 2 px, so both arms hang down the torso's outer
edges and neither crosses the apron — the apron is the player's identity and nothing may lie across it.
Height = `upperLeg + lowerLeg + footH − 2 + torsoH − 2 + neck + 2·headR`. Species vary within: the hungry one
headR 14–16 / torsoW 28 (the widest), the chef headR 11–12
(smallest body, tallest hat), ears add 8–18 px above the skull. `art-check` holds height 46..68 and 1.9..2.8 heads
(the human head chef stands 76 on a 14 px head, 2.7 heads: longer legs, torso and arms, not a bigger sprite).
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

Critter palette keys (`DEFAULT_PALETTE`): `skin` = fur (head, arms, paws), `hair` = dark fur / markings / brows,
`belly` = light fur (muzzle, belly, inner ear, paw pads), `primary` = apron (**set per seat**), `secondary` = legs
(fur or leggings), `shorts` = the hip block, `accent` = trim, `dark` = nose and boots, `metal` = utensils, `sleeve`
= fur (set by `critterBuild`). Per-critter extras are module constants.

**Player colours** are `PLAYER_COLORS` in `constants.js` (P1 `#3F9BFF` sky, P2 `#FF8140` marmalade, P3 `#B08CFF`
lavender, P4 `#FF63B0` raspberry) and are the one colour set for cursors, name plates, ready stamps, basket
ribbons, float caps, station tags and the critter's own player spot: **the whole apron** (`primary`), straps and
pocket included, set by `critterRig(def, slot)`. Every fur must clear all four hexes by value alone
(`palette/player-spot` in art-check: relDiff ≥ 0.25 for each), and the shorts must clear them by value or hue.

**Scene signal colours** (`SIGNAL` in `constants.js`) — one saturated colour per scene, bound to one meaning, used
only as small emitters and banned as decor elsewhere: map `#F2C14E` lantern gold (the next destination), orchard
`#D9463B` ripe apple (= `UI.red`, the stamp ink too), pond `#5FD3C0` bite ring, coop `#F2C14E` fresh-egg sparkle
(shared with the map by exemption: both mean "the thing you want"), kitchen `#E23A2E` HOT (also the game-wide
reserved heat/danger colour: the burner). "Nearly there" on paper UI is
`UI.green` with an ink outline, never gold on paper (0.17) and never lime.

The four mini-games finished last **reuse those hexes instead of inventing four more**, and the reason is the
player colours: P1 owns blue, P2 marmalade, P3 lavender and P4 raspberry, which between them close off every
saturated family except red, gold, mint and green — so a fifth and sixth invented signal would collide with an
apron *inside the very scene it marks*. What the table actually holds is three **meanings**, and each new scene
picks the one it needs:

| meaning | hex | where |
|---|---|---|
| **the thing you want / go here** | `#F2C14E` gold | map's next sign, coop's fresh egg, **mill**'s pouring chute, **hive**'s full skep, **garden**'s ripe root |
| **keep tapping** | `#5FD3C0` mint | pond's bite ring and reel bar, **dairy**'s pump chevron and full pail |
| **heat** | `#E23A2E` HOT | the burner, and the spark on the orchard's bomb apple: the one warning left in the game, and it is a joke |

One scene still shows one signal: its *own* signal for the thing the player is after. Backdrops are built from 6–8 muted
constants each, exported by the scene's backdrop module; `ENV` in `palettes.js` is the shared base ladder.

## 5. Authoring parts, accessories and items

All hooks receive `(ctx, rig, pose, info)` in a local space set up by `art/rig.js`: head space origin at the head
centre facing +x; torso space origin at the hip centre, y up negative; hand space +x along the forearm from the
wrist; foot space +x toward the toe, y down; limb spaces +Y along the bone. `info` is reused — never retain it;
far-side hooks colour from `info.pal`. Helpers: `celBall/celCapsule/celTaper/celRect/celPoly/celPath`, `band`
(an inked ≥ 4 px band), `flat`, `tones`, `pathRR`.

`critterBuild(spec)` assembles a critter from parameters — `ears: round|point|long|small`, `earTip`, `muzzle`
size, `markings` (e.g. `maskMarking`, `cheekMarking`), `tail: stub|puff|bushy|ring|thin`, `boots`, `apron`,
`sleeveHex`, `accessories` (`chefHat`, `bandana(hex)`, `scarf(hex)`, `cap(hex)`), `parts` overrides. Prefer a
parameter over a per-species hook so a renderer fix reaches the whole cast (ART_PRINCIPLES 49). The human
(`content/critters/rowan.ts`) is the one cast member built mostly from `parts` overrides — head, face, torso, hand
— because what it replaces is the animal itself; it still draws its apron through the shared `drawApron` and its
torso from the shared `eggPath`, so the player spot and the body are the cast's. Held items are `ITEMS.*` in
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
map 140–159, orchard 100–109, pond 110–119, coop 120–129, kitchen 130–139,
title/select/lobby 160–169, dairy 170–179, mill 180–189, hive 190–199, farm 200–209) and blits at integer
offsets; parallax
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
| carry / catch | 2 loop | near paw forward with the item `upright` (`weapon: 90`) and the off paw down at the far side, so the basket hangs BESIDE the hip and the apron stays visible |
| reach / wave / cheer | 2–3 | near arm up **forward** (130–150°), far arm up back, `happy` |
| eat | 5 | anticipation `in` 8f → paw to muzzle `overshoot` 6f (`shout`) → chew ×2 (`closed`) → return `out` (`happy`) |
| chop | 4 | anticipation `in` 6f (item up, `grit`) → hit `overshoot` 3f with smear → hold 4f squash 1.04 → return `inout` 8f |
| stir | 4 loop | sustained: four `inout` keys tracing a circle with the spoon |
| bump | 3 | snap back 5f (`hurt`, squash 1.08) → recover 10f → neutral 6f (`dazed`) |
| hop | 4 | crouch `in` 5f squash 1.1 → air 14f stretch 1.06 → land 5f squash 1.1 → settle |
| sad / sit | 2 loop | head down / seated, `hurt` / `closed` |

The lengths of the holds and the tap counts belong to `docs/GDD.md`; the art fits inside them.

## 9. Performance

Zero allocation in draw hooks; count shapes, not maths: a critter stays under ~40 cel shapes and ~100 flat rects
per draw. Measured with `node tools/sheet-capture.js <dir> critter=<id> bench` on the shipped cast, headless:
Sorrel 0.72 ms, Cress 0.79, Barley 0.87, Chicory 0.90 per `drawRig`. A critter that costs more than ~1 ms is
carrying a hook it does not need. Four critters + a scene's props + 200 particles at 60 fps on a mid laptop.

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
- [ ] Ladder: belly vs fur, markings vs fur, shorts vs legs, nose dark — `palette/*`.
- [ ] Player spot: fur clears all four `PLAYER_COLORS` by value, shorts by value or hue — `palette/player-spot`, `palette/apron-vs-shorts`.
- [ ] Height 46..68, 1.9..2.8 heads, paws ≥ 0.33 headR — `proportions/*`.
- [ ] Every shared animation present, loops loop, cycle lengths in band, idle breathes, walk bobs — `anim/*`.
- [ ] Cast: species unique, furs ≥ 25° hue or ≥ 20 % value apart, aprons apart — `cast/*`.
- [ ] Nothing crosses the face at rest; raised paws land beside the muzzle — *(eye: anims sheet)*.
- [ ] Squint: the cast sheet at 0.5× still tells five cast members apart — *(eye)*.
- [ ] Mirror: `facing=-1` sheet shows the tail, ears and item on the right side — *(eye)*.
- [ ] Held items hang upright from the paw; the paw closes over the handle — *(eye: `item=` sheets)*.
- [ ] No `Math.random`, no clock, no per-frame allocation in a hook — *(eye)*; `node tools/check.js` clean.

## 12. Decisions and grafts from the judge panel

Winner: the storybook proposal, 27/25/26 of 30 across a readability, a player and an engineer judge. Grafted from
the runners-up: the 28×28 **steering-wheel HUD widget** whose slot-colour ticks light straight from each seat's
input mask (the map's only four-player mechanic made visible); **crew busts in the truck windows**; the **HONK!**
stamp with a truck squash; a **paper progress tag per station** in the owner's colour and a floor-standing oven;
an 8×5 **slot tag above each pond float**; the **telephone ringing** at home base when an order arrives; Chicory's
**goggles sliding onto the eye row** on `hurt` (the one allowed eye-row intrusion); the room-code glyphs **flipping
in one by one**; a 2 px mid-brown **fishing line** (the 1 px line broke the floor); 4 px minimum on every inked
band; name-plate y from the tallest head part; a deterministic **repaint-on-demand** path for evicted map chunks.
Concerns fixed in the spec: the apple is red, not lime; furs polarised to two light / two dark (the hedgehog became
a frog); lanes darkened to L .62 so cream cottages and the gold glow read; kitchen feet at y 252 with the floor
lifted to L ≥ .30 for dark hooves; nest straw darker than eggs; wicker replaced by dark willow; the sheep's coop
floor nudged to `#48526A`.
