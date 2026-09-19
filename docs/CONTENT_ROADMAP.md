# Foodie Truck — Content Roadmap

> **Precedence:** this is a plan, not a rule book. `docs/GDD.md` owns the design of anything that ships; when a
> thing on this list is built, its numbers move into the GDD and its row here is struck through. Nothing below is
> in the game yet.

The game's content is wide at the landmarks (nine mini-games, twenty-three ingredients) and thin everywhere else:
every day is the same shape, the road between landmarks is quiet, and only the orchard has a joke. The four
extensions below were chosen to make a day feel different from the last one **without touching the rules the
whole game stands on**:

- **Three inputs.** Move left and right, tap ACTION, hold ACTION. No timing windows, no beats, no wrong buttons.
- **Nothing to lose.** A joke costs a moment and never a point. A round has no clock.
- **Everything from the seed.** Every event and hazard is drawn from `rng` inside `update()`, so four peers in
  lockstep see the same sheep. Nothing reads the wall clock or `Math.random`.
- **Append only.** Recipes, ingredients and scenes are named by index on the wire and in the dev jumps
  (`?order=`, `?recipes=`, the START packet's scene), so new ones go on the end.
- **One signal colour per scene, drawn in code.** No image files. A new thing is a drawing routine.

---

## A. A joke for every mini-game

> **Done.** Every row below shipped (`docs/GDD.md` section 5 has the table as built). Two things changed on the
> way: the cove's pinch is for a crab grabbed while it is still *running* - the sparkle already says pounce on a
> stopped one, so the joke is the greedy grab - and the dairy's tail is a count of squirts across pails, not
> inside one. The kitchen's two extra beats at the foot of this section are not built.

The orchard's wormy apple and its bomb (`screens/orchard.ts`, `boomT` on the seat) are the pattern: a seeded
chance on the thing you were going to catch anyway, a short held animation on that seat, a sound, and then carry
on. Each joke below follows it exactly. **Cost per joke:** one seat timer in the screen's `update()`, one pose or
two in the screen's pose table, one prop drawing, one SFX in the gather register, a `summary()` field so the
playtest can assert it fired.

| Landmark | The joke | Trigger | What plays | Cost to the player |
|---|---|---|---|---|
| **Pond** | **The old boot.** The reel brings up a boot instead of a trout. | 1 bite in 8 | The same twelve taps; the boot comes up dripping, the critter holds it at arm's length and tips the water out (30 frames), lobs it back with a `splash`. | No +1 for that cast. The next bite is always a fish. |
| **Coop** | **The broody hen.** A hen has sat down on the egg you reach for. | 1 nest egg in 8 is sat on | The reach gets a `peck`; the critter yanks the paw back and hops on one foot (24 frames). The hen clucks and hops off after 90 frames, and the egg is there as before. | Nothing. |
| **Dairy** | **The tail.** The cow flicks her tail across the milker's face. | A seeded squirt count, 20–40 into a pail | A `swish`, the milker's face goes `dazed` and its ears blow sideways for 20 frames. The pail keeps its count. | Nothing. |
| **Mill** | **The sneeze.** Flour up the nose. | 1 sack tied in 6 | 24 frames of wind-up (face scrunched, head back), an `achoo` with a dust cloud that blows the neighbour's ears flat, then carry on. A rice visit sneezes chaff. | Nothing. |
| **Hives** | **The curious bee.** One bee leaves the drone and lands on a dipping critter's nose. | 1 dip in 6 | The critter goes cross-eyed and freezes (40 frames), the bee grooms itself, then flies off. The dip's bar pauses the way letting go does. | Nothing. |
| **Farm** | **The whopper.** One top has a ridiculous root under it. | 1 top in 8 | The twelfth press pulls out a root three times the size, the critter goes over backwards with it (30 frames), `WHOA!` floats up. | Nothing: the whopper is a +1 like any other. |
| **Bramble Bank** | **The thorn.** A bramble across the berry. | 1 ripe berry in 8 | The reach gets a prick: the critter sucks its paw (24 frames), the thorn drops off, the berry is picked on the next reach. | Nothing. |
| **Cockle Cove** | **The pinch.** A crab grabbed with its claws up grabs back. | Grab during the claws-up pause | The crab hangs off the paw and the critter runs a circle (40 frames), shakes it off, and the crab drops back to the strand tired (so it is the easy grab next). | Nothing. |
| **Cockle Cove** | **The seventh wave.** Every so often one wave rolls up over the strand line. | Every 600–900 frames | Everyone on the sand jumps, drips for 40 frames, seaweed lands on somebody's head. | Nothing. |

The whole party shares a joke when two happen at once (the mill's sneeze knocks a neighbour's ears, the wave soaks
everyone), so a four-seat round has more of them than a solo one, which is the right way round for a couch game.

**The kitchen** already has the hungry one's bite. Two more, both on the same seeded 1-in-6 as the bite, for the
crew who are not Barley: the pot lid that rattles and lifts on its own when a stove step completes, and the flour
cloud when a bake step opens the oven door.

---

## B. Road events on the map

> **Done.** The crossing system with both skins (sheep, ducks), the honk that scatters them, the tipped cart,
> the weather with its mud patch, and Barley's wave to the flock (`docs/GDD.md` section 4).

The map (`screens/map.ts`) drives one truck, blocks it at water with a splash, and drops a sign on arrival. It has a
honk that does nothing. Road events give the honk a job and put something between the landmarks. All of them are
laid out by the day's plan (`run.ts planDay`, its own seeded stream) so the day board could in principle warn of
them, and all of them resolve with move and ALT only.

| Event | Where it appears | What happens | Resolves |
|---|---|---|---|
| **Sheep crossing** | One lane segment per day, drawn from the plan; a new one once the first is cleared, at most three a day | Five to nine sheep dawdle on the lane. The truck is blocked the way it is at water, a half-token short, and the sign says `SHEEP!`. | **ALT honks** and the flock scatters off the lane over 60 frames. Barley, if seated, waves out of the window and the flock waves back. Without a honk they clear on their own after 600 frames, so nobody is stuck. |
| **Duck parade** | The pond lane and the river bridges, once a day | A mother duck and six ducklings cross in single file. Blocked like the sheep. | They cross on their own in 90 frames; a honk makes them hurry (and Cress waves). |
| **The tipped cart** | On the lane between home and the first short landmark, once a day | A hand cart on the verge with its load spilled across the lane. | Driving over the spill gathers **+1 of an ingredient the list is short of** (the float, the ring and the pip), and the cart's owner, a village diner, waves thanks. |
| **Mud** | One lane segment after a drizzle day (below) | The truck slows to field speed on the patch, throws mud, and wears splatter for the rest of the day. | Nothing to do: it is a look and a sound. |
| **Weather** | Per day from the plan: 3 clear, 1 drizzle, 1 fog in 5 | **Drizzle:** rain streaks, the lanes glint wet, puddles splash under the wheels, the mud patch appears. **Fog:** the view fades to milk 200 px out from the truck and every landmark's lantern glows brighter (the map's one signal colour), so the destination arrow does the work. | Nothing slows or blocks. Weather is the day's mood. |

A crossing is one system with two skins (sheep, ducks): a lane segment, a herd of walkers, a `blocked` flag the
truck reads exactly like `waterBlocked`, and a clear timer that the honk shortens. That keeps the map's determinism
promise: every peer's honk is on the wire already as `alt`.

**Not doing:** a hitch-hiker who rides to their line. It would need a passenger state on the run and a receipt
change, and the tipped cart gives the same "something good on the road" feeling for a tenth of the work.

---

## C. More recipes on the ingredients we have

> **Done.** All eighteen shipped, with a dish drawing each; the menu is forty.

Sixteen of the twenty-three ingredients appear in exactly one recipe, and honey, trout and carrots, three of the
first seven, are among them. A recipe costs one row in `content/recipes.ts` and one dish drawing in `art/dishes.ts`;
nothing else in the game needs to know. Proposed, in the order they would be appended (indices 22 onward):

| Dish | Needs | Steps | Why |
|---|---|---|---|
| HONEY CAKES | honey 2, flour 2, egg 1 | fridge, mix, oven, plate | Honey's second recipe. |
| TROUT PIE | fish 2, potato 2, milk 1 | fridge, chop, mix, oven, plate | Trout's second; the pond gets more visits. |
| FISH AND CHIPS | fish 2, potato 3 | fridge, chop, stove, plate | The big one; the otter's favourite. |
| CARROT CAKE | carrot 3, flour 2, egg 1 | fridge, chop, mix, oven, plate | Carrots' second. |
| STRAWBERRY MILKSHAKE | strawberry 3, milk 2 | fridge, chop, mix, plate | **No cooking step.** The first recipe that skips the stove and oven, so the kitchen is not always the same walk. |
| COLESLAW | cabbage 2, carrot 1 | fridge, chop, mix, plate | No cooking step either. |
| BAKED APPLES | apple 3, honey 1 | fridge, oven, plate | The shortest recipe in the game. |
| PEARS IN HONEY | pear 3, honey 1 | fridge, chop, stove, plate | |
| CRAB CHOWDER | crab 2, potato 2, milk 1 | fridge, chop, stove, plate | |
| PUMPKIN PIE | pumpkin 2, egg 2, flour 1 | fridge, chop, mix, oven, plate | |
| LEEK AND POTATO SOUP | leek 2, potato 2, butter 1 | fridge, chop, stove, plate | |
| EGG FRIED RICE | rice 3, egg 2, leek 1 | fridge, stove, chop, plate | |
| BLUEBERRY PANCAKES | blueberry 2, flour 2, milk 1 | fridge, mix, stove, plate | |
| AVOCADO AND CRAB SALAD | avocado 2, crab 1, salt 1 | fridge, chop, mix, plate | No cooking step. |
| SEAWEED CRISPS | seaweed 3, salt 1 | fridge, chop, oven, plate | |
| ONION TART | onion 3, flour 1, egg 1 | fridge, chop, mix, oven, plate | |
| BEETROOT BROWNIES | beetroot 2, flour 2, egg 1 | fridge, chop, mix, oven, plate | The one that makes a child say "what?" |
| HONEY TOFFEE | butter 2, honey 2, salt 1 | fridge, mix, stove, plate | |

Eighteen recipes takes the menu to forty. Every amount stays in the 2–4 a party gathers in one round and no dish
asks for more than three things, so the shopping list and the fridge run stay the length they are now. The three
no-cook dishes and the two-step BAKED APPLES are deliberate: the kitchen's variety comes from *which* stations a
recipe skips.

Each customer line and a new customer assignment are needed per row; the three diners are dealt round as now.

---

## D. New ingredients at the landmarks we have

> **Done.** All eight shipped with eleven recipes between them (`docs/GDD.md` section 3). Cheese rides the
> butter's own milk-then-churn code with the hint reading PRESS; a cockle never moves and the spit of water off
> its bump is what gives it away; cherries are one catch, one +1 (the two-on-a-stem catch was not worth a second
> catch rule).

A new ingredient at an existing landmark costs a glyph in `art/food.ts`, a visit look at that landmark (a plant in
`gardenProps.ts PLANTS`, a canopy in the orchard's backdrop, a bush on the bank, a sack band at the mill), and at
least one recipe to send the truck for it. No screen logic changes: `gatherTarget` already routes any ingredient
to its landmark's screen.

| Ingredient | Landmark | Visit look | Recipes it unlocks |
|---|---|---|---|
| **Cherries** | Orchard | A small round canopy dotted red; cherries fall in pairs on one stem (one catch, one +1) | CHERRY PIE, CHERRY CLAFOUTIS |
| **Plums** | Orchard | A purple-leafed tree; a plum falls heavy like an avocado | PLUM CRUMBLE |
| **Cheese** | Dairy | Milk, then a **press**: the full pail pours into a mould and twelve presses of ACTION bring out a wheel, exactly as butter is milk then the churn | CHEESE TOASTIE (cheese 2, flour 2), MAC AND CHEESE (cheese 2, flour 2, milk 1) |
| **Oats** | Mill | The third sack: a plain jute band, the chutes pour flakes, the corner stock is oat sheaves | PORRIDGE (oats 3, milk 2, honey 1), FLAPJACKS (oats 3, butter 1, honey 1) |
| **Tomatoes** | Farm | A staked vine with red fruit; pulled as a whole plant like the others | TOMATO SOUP (tomato 3, onion 1), and a modifier for CRAB CAKES |
| **Peas** | Farm | A pea row up a wigwam of sticks | PEA SOUP (pea 3, potato 1, milk 1) |
| **Raspberries** | Bramble Bank | The same bush shape, pink berries in clusters | RASPBERRY JAM TARTS (raspberry 3, flour 2, butter 1) |
| **Cockles** | Cockle Cove | At last. Raked off the wet sand like seaweed but they hide: a bump in the sand with a spit of water gives one away every 40–80 frames | COCKLE STEW (cockle 3, potato 1, milk 1) |

Cherries and cheese first: cherries because a two-on-a-stem catch is a fresh feel under the same verb, and cheese
because the dairy's milk-then-churn structure already exists and cheese opens the most recipes.

---

## E. New landmarks

A landmark is the expensive unit: a `PLACES` row, a lane on the map (`art/backgrounds/map.ts LANES`) and a spot
kept clear of the tree scatter, a screen, a backdrop and a props file, a HOW TO PLAY card, three or four SFX, a
playtest scenario, a golden frame, and a section in the GDD. Each below brings a **verb the game does not have**
and two or three ingredients, so it pays for itself in recipes. Proposed positions are on empty ground as far as
the wheat, river and lane tables go; the map's tree scatter (`nearLandmark`) will clear round them automatically.

### Hazel Holt — SHAKE (*move + hold*)

> **Built** (`docs/GDD.md` section 5). The chestnut visit drops chestnuts like the others (no spiky cases).

- **Where:** the north-west corner, about (180, 150), on a new lane from the orchard.
- **Gathers:** hazelnuts, walnuts, chestnuts.
- **How it plays:** four nut trees along the back. Standing at a trunk (36 px either side) and **holding** ACTION
  shakes it: the canopy sways harder as a bar fills over 60 frames, and at the top a shower of five to eight nuts
  drops straight into the basket (one +1 per nut, the catch pip for each, four frames apart). That tree is bare for
  150 frames, so the party moves along like the hives. Letting go early keeps the bar. A chestnut visit drops
  spiky cases that pop open on the ground before they count.
- **The joke:** the **squirrel**. One shake in six brings down a squirrel with the nuts; it lands on the critter's
  head, sits there indignant for 40 frames, then runs back up the trunk. Nothing lost.
- **Recipes:** HAZELNUT BROWNIES, WALNUT LOAF, ROAST CHESTNUTS (the two-step one), NUT ROAST.

### Tangle Wood — FORAGE (*move + tap*)

- **Where:** the north-east corner, about (1760, 180), on a lane east from the coop; on the coop's side of the
  river so no new bridge is needed.
- **Gathers:** mushrooms, wild garlic, and (in place of a fourth orchard tree) blackberries on the wood's edge.
- **How it plays:** a leaf-littered floor under dark trees. Things hide: a mushroom is a bump in the leaves that
  lifts every 70–120 frames, drawn with a gold sparkle when it shows; ACTION anywhere over a showing bump (34 px
  either side) brushes the leaves off (a 12-frame crouch) and it hops into the basket. Wild garlic shows as a
  white flower over the leaves; blackberries hang on a bramble at the wood's edge like the bank's berries.
- **The joke:** the **toadstool**. One bump in eight lifts red with white spots; brushing it off is the bump
  beat, a wrinkled nose and a `pooh!` float, and it sinks back. Nothing lost.
- **Recipes:** MUSHROOM SOUP, MUSHROOMS ON TOAST, GARLIC BUTTER (wild garlic + butter), BLACKBERRY AND APPLE PIE.

### Thyme Terrace — SNIP (*move + tap*)

- **Where:** between home and the orchard, about (680, 440), on a spur off the orchard lane.
- **Gathers:** mint, chives, rosemary.
- **How it plays:** a walled herb bed in raised terraces with a potting shed. Herb clumps stand in a row and are
  snipped: ACTION with a clump under the critter (34 px either side) is one snip of the shears (a 10-frame crouch)
  and the sprig hops into the basket; a clump gives three snips and then grows back over 150 frames, each stage
  drawn (stubble, shoots, full). Mint is the bushy one, chives the tubes with purple heads, rosemary the woody one.
- **The joke:** the **hedgehog**. It is asleep under one clump in eight; the snip wakes it, it uncurls, sneezes,
  and trundles off to a different clump (40 frames). Nothing lost.
- **Recipes:** MINT SAUCE and a modifier on PEA SOUP, CHIVE OMELETTE, ROSEMARY POTATOES; herbs are also the
  natural "extra" for order twists later.

**Not doing first:** Sugar Wood (maple syrup), the Smokehouse (smoked trout) and the Weir (watercress). Good verbs,
but each brings only one ingredient. The three above bring nine between them.

---

## F. Order of work

Roughly cheapest and most visible first. Each row is a pull request on its own; none depends on the one before it
except where marked.

| # | Work | Touches | Rough size |
|---|---|---|---|
| 1 | The eighteen recipes in section C | `content/recipes.ts`, `art/dishes.ts` (18 drawings), GDD section 3 | Small code, a day of drawing |
| 2 | One joke per mini-game (section A), one screen per commit, pond first | Each `screens/*.ts`, its props file, `engine/audio/sfx.ts`, playtest scenarios | A short session per screen |
| 3 | Sheep crossing and the honk (section B), then the tipped cart, then weather and mud | `screens/map.ts`, `art/backgrounds/map.ts`, `game/run.ts planDay`, `maphud.ts` | The crossing system is the big piece; the rest reuse it or are paint |
| 4 | Cherries and cheese (section D), then oats, tomatoes, peas, raspberries, cockles | `content/recipes.ts`, `art/food.ts`, the landmark's props and backdrop | Two ingredients per session |
| 5 | Hazel Holt (section E), then Tangle Wood, then Thyme Terrace | A new screen, backdrop, props, SFX, scenario, golden frame, GDD section, `SCENES` append | One landmark per week of sessions |

Every step keeps `npm run check` green: the typecheck, the class-fields and lib checks, the art check, the net test
and the golden frames (a new screen or a new dish is a new golden baseline, deliberately).
