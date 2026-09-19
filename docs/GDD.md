# Foodie Truck — Game Design Document

> **Precedence:** this document owns *design* — names, numbers, rules, what each screen must do. `docs/ARCHITECTURE.md`
> owns technical matters and wins on them. `docs/ART_STYLE.md` owns how things look and supersedes anything here
> about drawing. `docs/MULTIPLAYER.md` owns the online session. Where a number here and a number in code disagree,
> the code is a bug or this document is stale; fix one in the same commit.

## 1. Premise and tone

A cozy co-op cooking adventure for one to four players. The crew of a countryside food truck opens for the day
with a menu and a shopping list, drive out to where every ingredient comes from and gather it in a short mini-game
at each landmark, and then, with the pantry full, drive to the queues of villagers waiting at three of those
landmarks and cook for them one order at a time. When the third line has been served the truck closes.

The *structure* is borrowed from the Sesame Street "Foodie Truck" segments (an order → its ingredient → go to the
source → cook). Everything else is original: the cast are anthropomorphic countryside animals with their own names,
silhouettes and colours, and nothing in the game may resemble a Sesame Street character, name or design. Tone:
warm, silly, unhurried; the joke that never gets old is the big hungry one eating the ingredients.

## 2. The cast

Five playable cast members — four critters and the human head chef who owns the truck and runs them — one per
seat; a seat may pick any of them, and online two seats may not pick the same one. Roles are flavour and small stat
differences, never gates: anyone can do any job.

| Role | Verb | What the role changes |
|---|---|---|
| **The hungry one** | EAT / CARRY | Biggest basket; slowest; in the kitchen a random `bite` beat now and then that costs nothing but makes everyone laugh |
| **The chef** | CHOP / MIX | Smallest basket; the one who plates with a flourish |
| **The driver** | DRIVE / HONK | 1.5× steering weight on the map; honks |
| **The forager** | GATHER / CAST | Fastest in the mini-games; longest fishing cast |
| **The head chef** | TASTE / ORDER | Owns the truck and runs the crew; steady everywhere, best at the pass; tastes from the spoon |

| Cast index | Name | Species | Role |
|---|---|---|---|
| 0 | **Barley** | Suffolk sheep | the hungry one |
| 1 | **Sorrel** | field mouse | the chef |
| 2 | **Chicory** | brown hare | the driver |
| 3 | **Cress** | pond frog | the forager |
| 4 | **Rowan** | human | the head chef |

The cast index is what the START packet and `?critters=` carry, so new members are appended, never filed in
between. Palettes, proportions and signature accessories are the art direction's (`docs/ART_STYLE.md` §1) and
live in `src/content/critters/`. Customers are NPC critters built with the same rig (an owl, an otter, a goat) in
`content/critters/customers.js`. Every cast member wears an apron in their seat's player colour.

## 3. The loop

```
title -> select -> stage -> map -> (mini-game -> map)* ... pantry full ... -> map -> line -> kitchen -> results -> line -> kitchen -> results -> map -> line ...
                                                                                                                                                              |
   the day: three recipes, three lines of two customers, one shopping list; when the third line is served -> stage (CLOSED) -> title
```

- **A day** is planned from the run's seed (`game/run.js planDay`): `RECIPES_PER_DAY` (3) recipes drawn from
  `content/recipes.js ORDERS`, and `LINES_PER_DAY` (3) **lines** of `LINE_LENGTH` (2) customers, each line waiting at
  a different supply landmark (never home) and each customer ordering one of the day's recipes — the menu is dealt
  round so every recipe is ordered at least once. The plan is drawn from its own seeded stream, so every online
  peer lays the same day out from the START packet, and it never touches the gameplay rng.
- **Order twists** (`run.ts TWISTS`). One customer in four wants their dish a little different, and the twist is on
  the board, in the bubble at the hatch and in the kitchen: **EXTRA CRUNCHY** (the CHOP step takes 15 taps instead
  of 10; only a dish that chops), **A BIG ONE** (one more of every ingredient, on the order and so on the shopping
  list), or **WITH MINT / CHIVES / ROSEMARY ON TOP** (one sprig of that herb added to the order, which is what sends
  the truck to Thyme Terrace on a day nobody ordered a herb dish). The board prints the twist after the dish
  (`COLESLAW, CRUNCHY`, `STRAWBERRY TART +MINT`). A dev-jump day (`?order=`, `?recipes=`) never carries a twist:
  those promise a known dish and a known list.
- **The day board** (`stage`) pins the plan up before the truck opens: the three lines and the **shopping list**
  — every ingredient of every order in every line, summed. Confirm opens the truck.
- **A recipe** (`ORDERS`) names a dish, a phone line, 2–3 ingredients with amounts, and the kitchen steps in order.
  Forty ship. The first seven — apple pie, fish cakes, apple omelette, honey loaf, custard tart, carrot soup,
  griddle cakes — ask for the first seven ingredients (apples, trout, eggs, milk, flour, honey, carrots); the
  fifteen after them each carry one of the sixteen newer ones — pears, peaches, avocados, butter, rice, potatoes,
  onions, leeks, beetroot, pumpkins, cabbages, crabs, seaweed, sea salt, strawberries, blueberries — so every
  ingredient is somewhere a day can send the truck; and the eighteen after those (honey cakes, trout pie, fish and
  chips, carrot cake, strawberry milkshake, coleslaw, baked apples, pears in honey, crab chowder, pumpkin pie, leek
  and potato soup, egg fried rice, blueberry pancakes, avocado and crab salad, seaweed crisps, onion tart, beetroot
  brownies, honey toffee) give every ingredient a second dish, so no landmark is a rare visit; and the eleven after
  those (cherry pie, cherry clafoutis, plum crumble, cheese toastie, mac and cheese, porridge, flapjacks, tomato
  soup, pea soup, raspberry jam tarts, cockle stew) are what the third pass's eight ingredients - cherries, plums,
  cheese, oats, tomatoes, peas, raspberries, cockles - are for; and the twelve after those are what the three new
  landmarks send the truck for (hazelnut brownies, walnut loaf, roast chestnuts, nut roast; mushroom soup,
  mushrooms on toast, wild garlic butter, blackberry and apple pie; mint sauce, chive omelette, rosemary potatoes,
  pea and mint soup). Sixty-three in all. Three of them never
  touch the stove or the oven and baked apples is two steps long: the kitchen's variety is which stations a recipe
  skips. Recipes are only ever appended, because `?order=N` and the scenarios name them by index.
- **An ingredient** (`INGREDIENTS`) names the landmark that supplies it. A landmark can supply several: the
  orchard drops pears, peaches, avocados, cherries and plums as well as apples; the farm pulls six vegetables
  besides the carrot and grows tomatoes and peas up stakes; the dairy's pails go on through the churn to butter
  and through the press to cheese; the mill's chutes fill rice and oat sacks; the bank has raspberries beside its
  strawberries and blueberries; the cove has cockles in its wet sand; Hazel Holt shakes down hazelnuts, walnuts
  and chestnuts; Tangle Wood hides mushrooms, wild garlic and blackberries; Thyme Terrace grows mint, chives and
  rosemary. Forty ingredients ship. A mini-game gathers whichever of
  its landmark's ingredients the list is still short of (`run.js gatherTarget`: the first short one in
  `INGREDIENTS` order, else the first the list asks for, else the landmark's first — so a bare dev jump still
  catches apples), and draws that ingredient's glyph and colour on the tally ticket, in the basket and on the end sign.
- **Gathering.** The map is where the shopping list is read and the truck is driven. Arriving at a landmark that
  supplies an ingredient the list is still *short of* opens its mini-game; the round's target is that line's
  remainder, and the round runs until the party has gathered all of it — there is no clock, so nobody is sent back
  to the map short. Arriving
  anywhere else does nothing but show a sign. `run.gather(id, n)` banks a round; `run.complete()` is the pantry
  full.
- **Serving.** The moment the pantry is full the lines open: the HUD swaps the list for the lines, a tag over each
  waiting queue's signpost says how many are in it, and arriving at one opens the **line** screen — the customer at
  its front steps up and says what they want. Confirm takes the order into the kitchen (`run.startLine(i)` on
  arrival; `run.order` is the customer at the hatch). A landmark with no line, or one already served, shows a sign.
- **The kitchen** walks `order.steps` in order across the stations; when the plate is served it opens results.
- **Results** shows the customer eating and a 1–3 star rating; `run.serve(stars)` banks the stars against that
  customer and takes the dish's ingredients back out of the pantry. While the line still has someone in it, back to
  the line screen and the next one steps up; when it is empty, back to the map for the next line (the map says
  `LINE SERVED! 2 TO GO`); when that was the last line, to the day board, which opens **closed** — the day's stars
  and takings totted up — and the only way on is the title screen. **That is the end of the game.**

## 4. The world map

- World `1920 x 1080` px (`content/places.js WORLD_W/H`), one flat plane in 3/4 storybook view, y-sorted sprites
  with ground-contact shadows. Camera follows the truck (0.1 lerp, integer snap, clamped to the world).
- **Landmarks** (`PLACES`): home (the truck stop), orchard (apples, pears, peaches, avocados), pond (trout), coop
  (eggs), dairy (milk, butter), mill (flour, rice), hives (honey), Furrow Farm (carrots, potatoes, onions, leeks,
  beetroot, pumpkins, cabbages), Cockle Cove on the east edge (crabs, seaweed, sea salt) and Bramble Bank on the
  south lane (strawberries, blueberries) and Hazel Holt in the north-west corner (hazelnuts, walnuts, chestnuts,
  shaken down) and Tangle Wood in the north-east (mushrooms, wild garlic, blackberries, foraged out of the leaf
  litter) and Thyme Terrace between home and the orchard (mint, chives, rosemary, snipped off their clumps).
  **All twelve supply landmarks open a mini-game** while the list is short
  of what they supply — the cove its beach (crabs chased along the sand), the bank its bushes — and **any
  of them can hold a line** once it is full; arriving where there is nothing to do shows a sign instead
  (`NOTHING NEEDED HERE`, `FILL THE PANTRY FIRST` at home, `NO LINE HERE`, `THIS LINE IS SERVED`,
  `THE LINES ARE WAITING` at home).
- **The truck** is one shared vehicle. Every seated player's stick is a vector; they are summed (the driver's ×1.5),
  quantised to 16 headings with `dcos/dsin` tables, and the truck moves at 2.2 px/frame on a road and 1.0 off it,
  turning at most 1 heading step per 4 frames. Roads are the fast path; fields are drivable but slow and dusty;
  water is not drivable — the river (its bridges are), the millpond and the cove's sea: the truck stops a
  half-token short of the edge with a splash. Arrival = within 40 px of a landmark's door point.
- **The road's crossings** (`run.crossings`, `screens/map.ts`). Three a day, laid out by `planDay` from its own
  stream on distinct lane spots (`art/backgrounds/map.ts CROSSING_SPOTS`: the midpoint of every lane segment
  that is neither a bridge nor within 140 px of a door), out one at a time in plan order. A crossing is a **flock of
  sheep** (five to nine, a ragged line across the lane) or, about a third of the time, a **duck parade** (a mother
  and six ducklings in a file). One that is on its lane blocks the truck exactly as water does, a half-token short
  of its spot (40 px), with a `SHEEP!` or `DUCKS!` sign and a bleat or a quack. **ALT honks**, and a honk within
  150 px scatters the herd off the lane over 60 frames, which is the one thing the honk is for. Left alone, a
  flock clears on its own 600 frames after the truck first ran up against it and ducks finish crossing in 90, so
  nobody is ever stuck; the moment a crossing is done the next comes out. The scattered herd stands in the field
  beside the lane for the rest of the day. Nothing is lost by a crossing but the moment, and the whole thing is
  two integers per crossing (state, timer) on the wire.
- **The tipped cart** (`run.cart`). One more lane spot a day, never one a crossing stands on: a hand cart on its
  side with its load spilled across the lane, the load drawn as the first ingredient the list is still short of.
  While the pantry is short, driving within 36 px of it is +1 of that ingredient (the float in the ingredient's
  colour, the ring, the catch's pip, a THANKS!), the cart is righted and empty, and the compass is re-pointed in
  case that filled a line. Once the pantry is full the cart is only a cart. One integer (taken) on the wire.
- **The weather** (`run.weather`, from the plan: three days in five clear, one **drizzle**, one **fog**). A drizzle
  day draws rain across the view, splashes the wheels on the lanes, and puts a **mud patch** (`run.mud`) on one
  more lane spot: within 44 px of it the truck slows to field speed and throws mud, and it comes out wearing the
  splatter for the rest of the day (`run.muddy`). A fog day fades the world to milk beyond 120 px of the truck
  (full at 280) and lights every landmark's lantern over the fog, so the lamps and the compass arrow are what you
  steer by; nothing slows or blocks. And **Barley waves** at every flock the truck is held by, once per crossing,
  BAAA! from the cab.
- **HUD**: the shopping list (one row per ingredient, `have/amount`, a tick when full, the gold arrow on the first
  short one) while gathering, then the lines (`sign  N IN LINE`, washed back once served, the arrow on the one the
  compass points at); the steering-wheel widget with one tick per seat that lights while that seat pushes; the
  crew's heads in the truck's windows; an off-screen destination arrow (the first short line's landmark, then the
  nearest waiting queue); a paper tag over each waiting queue's signpost; one hint line. `alt` honks: a `HONK!`
  stamp and a truck squash. The telephone at home rings once as the truck opens.

## 5. The mini-games

Common rules: side view, feet on a scene-specific floor line, one critter per seat, name plates above heads,
`+1` float text and a ring on every success, the `bump` beat (4/10/6 frames) on every failure, a paper tally ticket
whose bar fills as the party gathers, the target count from the shopping list (that ingredient's remainder). **A
round has no time limit**: it ends only when the party's total reaches the target, so one visit always fills that
line of the list; the scene ends with a sign dropping in (`APPLES: 12`) and a 60-frame hold, then `run.gather` and
back to the map. All randomness through `rng` inside `update()`.

A screen whose landmark supplies more than one thing (the orchard, the dairy, the mill, the farm, the bank, the
cove) asks `run.js gatherTarget` which ingredient this visit is for, and draws that one: its glyph on the tally
ticket and in the basket, its name on the end sign, and the landmark's own name on the ticket. The mechanic's SHAPE
never changes — a pear is caught like an apple — but the visit looks like its ingredient (the orchard's trees, the
farm's plants, the mill's grain) and where the ingredient is a different kind of thing it plays as one: butter is
milk and then the churn, salt is a pan that has to crust before it can be scraped.

**Every mini-game has one joke** (the orchard has two), built the same way as the orchard's bomb: a seeded chance
on the thing you were going to gather anyway, a short held beat on that seat with the stick locked, a sound, and
then carry on. A joke costs a moment and never a point, and each one is drawn from `rng` inside `update()`, so
four peers in lockstep see the same hen.

| Landmark | The joke | The deal | What plays |
|---|---|---|---|
| Orchard | The wormy apple; the bomb | 1 in 10 each | The bump beat; the fuse, the bang, the soot (above) |
| Pond | The old boot | 1 bite in 8, never two in a row | The same twelve taps; the boot comes up the line to the paw, the rod is set down, it is held out and tipped (drips off the toe) for 30 frames, then lobbed back with a splash. No +1 |
| Coop | The broody hen | 1 nest egg in 8, sat on for 90 frames | The reach gets a peck: the paw is yanked back, a hop on one foot for 24 frames, OW!; the hen clucks and hops off when her time is up and the egg is there for the next reach. No floor cue under a sat-on nest |
| Dairy | The tail | Every 20..40 squirts per stall, never on a pail's twelfth | The tail comes across the face: rocked back on the stool and dazed for 20 frames, the pail keeps its count |
| Mill | The sneeze | 1 sack tied in 6 | As the tie beat ends, 24 frames of wind-up (head back, eyes shut) then ACHOO: the body snaps forward and a cloud of the visit's own dust (chaff on a rice visit) goes up; 36 frames locked, the fresh sack untouched |
| Hives | The curious bee | 1 dip in 6, 20 frames into the hold | One bee leaves the swarm and lands on the nose: cross-eyed and frozen for 40 frames with the hold paused where it was (the bar keeps its fill, as letting go does), then the bee goes and the hold runs on |
| Farm | The whopper | 1 top in 8; nothing above ground gives it away | The twelfth press brings out a root nearly three times the size, still +1, and the puller goes over backwards with it for 30 frames, WHOA! |
| Bramble Bank | The thorn | 1 berry in 8 ripens with a bramble drawn across it | The first reach gets the prick: the paw whipped to the mouth for 24 frames, OW!; the thorn is gone with it and the berry is picked on the next reach. The ring is cream, never `SIGNAL.hot`: nothing on the bank is a danger |
| Cockle Cove | The pinch | Always, for a crab grabbed while it is still RUNNING (the sparkle says pounce on one that has stopped) | The crab hangs off the paw while the critter runs a circle on the spot for 40 frames, OW!, then drops to the sand beside them, tired, which makes it the easy grab next |
| Cockle Cove | The seventh wave | Every 600..900 frames | One wave rolls up over the strand line: everyone on the sand hops and drips for 40 frames with the stick locked, and a clump of weed lands on one head |

Every joke has a scenario of its own in `tools/scenarios/` (`pondBoot`, `coopBroody`, `dairySwish`, `millSneeze`,
`hiveBee`, `gardenWhopper`, `brambleThorn`, `beachPinch`, `beachWave`), and the rules' own scenarios hold the
jokes off (a boot in the reel test would read as a lost fish).

**Reach is the whole body.** Wherever a scene asks a seat to be "at" something (a chute, a hive, a top, an egg, a
kitchen station), the test is a strip about a critter wide either side of the object's centre (34–40 px): if any
part of the critter overlaps the thing, the seat can use it. Nobody has to find an exact spot.

**Every round opens on a HOW TO PLAY card** (`game/controlcard.ts`): a paper ticket under the tally ticket for 210
frames, then it slides away, showing the round's controls as animated keycaps rather than words — two arrow keys
pressed by turns (MOVE), the action key pressed once (TAP), pressed over and over with motion marks (TAP TAP TAP)
or held down with a bar filling under it (HOLD). The key is labelled with the seat's own binding.

The whole game is built on **three inputs and nothing else**: move left and right, tap ACTION over and over, and
hold ACTION down. There are no timing windows, no beats to hit and no wrong buttons — a young player can never lose
what they have gathered, and there is no clock to race: a round lasts as long as it takes. The only hazards left are
jokes (the orchard's wormy apple and its bomb), and they cost nothing but a moment.

- **Orchard — CATCH** (*move*). Move left/right with a basket held in front. Apples (14 px, so they read from
  across a room) spawn above the canopy every 30–60 frames at a seeded x and fall at 1.4–2.4 px/frame with a small
  sway; caught the moment it overlaps the critter's body (the ring and the +1 are drawn at the basket's rim). A missed
  apple splats on the grass and costs nothing. One in ten is a
  **wormy** apple: catching it is the bump beat and nothing more. One in ten is a **bomb** — a ripe apple with a
  burning fuse — and catching it is the scene's joke: the critter holds it up and watches the fuse burn for 40
  frames, it goes off in smoke and embers, and the critter stands blackened and dazed for 90 frames before shaking
  it off. Nothing is lost but the time. Four seats use four depth lanes 8 px apart so bodies stack instead of
  fusing. A visit for pears, peaches or avocados is the same catch under **that fruit's own trees**: the backdrop's
  canopies are painted per fruit (a pear tree taller and narrower, a peach tree rounder with a pink-tinged leaf,
  an avocado tree one big dark glossy canopy), the fruit hangs on its branch in that canopy in its own colour before
  it lets go, and the fall has the fruit's own feel from a per-fruit table (a pear sways less, a peach drifts
  wider, an avocado drops heavier and straighter, a cherry is light and drifts, a plum drops like an avocado) — every
  speed still inside the basket's catch window, every number still drawn from `rng`. Cherries fall **two on one
  stem** (the glyph is the pair): catching one is +2 while the list still wants two or more, and +1 for the last,
  so a catch never counts past the target. The wormy one and the bomb play on every visit: a wormy pear is a bruised pear with
  the same grub, and a pear with a fuse goes off exactly as an apple does.
- **Pond — FISH** (*tap*). Fixed standing spots on a jetty, one float column per seat. `action` casts; the float
  bobs; after a seeded 60–150 frames the fish bites (the float drops, a mint ring) and stays on. Tapping `action`
  twelve times reels it in: every press is one turn of the reel, drawn as a bar over the float. A press during the wait
  does nothing.
- **Coop — COLLECT** (*move + tap*). Walk left/right along a depth lane; eggs appear in nests and on the floor in
  front of the lanes every 90–150 frames; `action` with the egg anywhere under the critter (34 px either side) plucks one (a 12-frame reach up into
  a nest from the gold ring on the floor under it, a 12-frame crouch to a floor egg). Five hens potter about the
  back of the floor and touch nobody.
- **Dairy — PUMP** (*tap*). A stool and a cow per seat, nobody moves. Every `action` press is a squirt; twelve fill a
  pail — +1 milk, the pail hops to the churn rack, a fresh one slides under the cow. Any rhythm works, and the cows
  never kick. A **butter** visit adds the churn: a barrel churn stands beside every stall, the full pail pours into
  it instead of banking, the milker turns round on the stool and every `action` press is a turn of the crank;
  twelve turns bring a pat of butter (+1 butter, the pat hops to the rack) and the milker turns back to the cow.
  Butter is milk plus the churn, so a pat is exactly two dozen taps.
- **Mill — FILL** (*move + hold*). Four chutes along the back wall wake on a seeded 70–130 frame timer, at most two
  at once: 24 frames of telegraph, then 330 frames of pouring (long enough to cross the whole floor and still fill a
  sack). Seats walk left and right on their own depth lanes;
  standing anywhere under a pouring chute (36 px either side) with `action` **held** fills the sack at 1/90 per frame (1.5 s from
  empty). The moment it reaches the brim it ties itself off (+1 flour, an 18-frame tie beat, a fresh sack);
  letting go early **keeps** the part sack to top up at the next chute. Nothing bursts. A **rice** visit is the
  same round in the same room dressed for rice, so the ingredient is read off the scene and not only off the clock:
  the chutes pour loose grain instead of dust, a waking spout dribbles grain from its lip, the sacks wear a
  stencilled band and pile on the cart as rice sacks, and the mill's own stock in the corner is straw sheaves and a
  hulling bin (`art/backgrounds/mill.js millLayers('rice')`, cached beside the flour room the way the cove is kept
  beside the pond). Not a number changes between the two.
- **Hives — CREEP** (*move + hold*). Five straw skeps on a bench; **holding** `action` anywhere over a full one (36 px either side)
  for 60 frames dips it — a strand of honey climbs the dipper and a bar fills over the skep — then +1 honey, and
  that skep is empty for 150 frames, so the party is pushed along the bench. Letting go early costs nothing. The
  bees drone over the bench and never turn.
- **Farm — PULL** (*move + tap*). Leafy tops stand in the bed (seven at the start, more every 70–120
  frames up to eight, never closer than 42 px); every one is whatever the visit gathers (a carrot by default), and
  is drawn as that plant (`art/gardenProps.js PLANTS`: a carrot's fern, a potato's flowering haulm, an onion's
  tubes, a leek's blades over its shank, a beetroot's crimson-stemmed rosette, a pumpkin under its vine, a hearted
  cabbage, a strawberry plant with its berries on, a blueberry bush), so a row of leeks never looks like a row of
  carrots. `action` with a top anywhere under the critter (34 px either side) grips it and opens
  a pull gauge above that seat; each further `action` press fills it a twelfth, and the twelfth brings the root out
  (+1 carrot, a 14-frame pull). 150 frames without a press lets go at no cost.

- **Bramble Bank — PICK** (*move + tap*). Six berry bushes stand along the foot of the bank, three berry spots
  each; six berries are ripe when the truck pulls up and one more ripens every 70–120 frames on a bush with a green
  spot left (the pea turns into the visit's own berry with the gold sparkle over it). `action` with a bush anywhere
  under the critter (34 px either side) picks its ripe berry (a 12-frame reach up into the bush, the berry hops
  into the basket, +1); a bush with nothing ripe on it does nothing. The bank used to borrow the farm's bed, and a
  strawberry pulled out of the ground by its top was the visit that said it should not.

- **Hazel Holt — SHAKE** (*move + hold*). A nut grove in the north-west corner: four nut trees stand at fixed x
  (160 px apart) on the leaf litter, the crew walks the trodden band in front of them, and **holding** `action`
  anywhere at a trunk (36 px either side) that still has nuts in it shakes it. The shake belongs to the TREE: its
  canopy sways harder as a bar over it fills over 60 held frames, letting go early keeps the bar for the next hold
  (and a second seat can carry on where the first left off), and at the top a shower of 5..8 nuts comes down into
  the shaker's basket one every 5 frames, each one +1 and never past the target; that tree is bare for 150 frames,
  so the party is pushed along the grove. A visit is for hazelnuts, walnuts or chestnuts (`gatherTarget`), and the
  nuts in the canopy, in the shower and in the crate wear that nut's glyph. **The joke:** one shake in six brings
  the squirrel down with the nuts; it lands on the shaker's head, sits there indignant for 40 frames with the stick
  locked (the nuts still falling), then runs off. Nothing is lost.

- **Tangle Wood — FORAGE** (*move + tap*). A dark wood in the north-east corner, on the coop's side of the river:
  things hide in the leaf litter along the band. A **bump** lifts in the leaves every 70..120 frames at a free x
  (four are already showing when the truck pulls up), takes 20 frames to rise, and then SHOWS with the gold
  sparkle over it; `action` with a showing bump anywhere under the critter (34 px either side) brushes the leaves
  off it (a 12-frame crouch), the thing hops into the basket, +1. A showing bump nobody wants sinks back after 900
  frames. A visit is for mushrooms, wild garlic or blackberries. **The joke:** one bump in eight lifts as a
  toadstool, red with white spots; brushing it is a step back with the nose wrinkled, POOH!, 20 frames, and it
  sinks back. Nothing is lost.

- **Thyme Terrace — SNIP** (*move + tap*). A walled herb bed between home and the orchard: six clumps of the visit's
  herb stand along the bed at fixed x (100 px apart), the crew works the gravel walk in front, and `action` with a
  clump anywhere under the critter (34 px either side) that still has a snip on it is one snip of the shears (a
  10-frame crouch): the sprig hops into the basket, +1, and the clump is a stage shorter. A clump gives three snips
  and then stands as stubble, and grows a stage back every 50 frames, each stage drawn (stubble, shoots, half, full),
  so the party is pushed along the bed and back. A visit is for mint (a round bushy mass), chives (tubes with purple
  heads) or rosemary (woody sprigs). **The joke:** the hedgehog is asleep under one clump in eight when the truck
  pulls up, curled at its foot where a sharp eye can spot it; the snip there wakes it - the critter jumps back,
  EEK!, 20 frames, no sprig - and it trundles off over 40 frames to sleep under another clump. The clump keeps its
  snips for the next reach.

- **Cockle Cove — CHASE** (*move + tap*). The crew runs along the dry sand with the sea behind it and the strand
  line in front. Crabs come up out of burrows (three at the start, another every 50–100 frames, five at most) and
  scuttle along the strand at 1.2 px/frame, stopping now and then with their claws up; a crab that sees a critter
  within 46 px darts away at 2.8 for 14 frames, then stops, tired, for 36 (the mint sparkle) and will not dart again
  for 110. `action` with a crab anywhere under the critter (34 px either side) grabs it: a 12-frame pounce, the crab
  hops into the basket, +1. A crab nobody catches goes back down after 720 frames. Seaweed visits wash clumps up
  that drift at 0.3 px/frame and are raked with the same grab; salt visits fill four fixed rock pans that crust
  over 90 frames and are scraped once white. A grab at empty sand does nothing.

## 6. The kitchen

The truck interior, side-on, camera locked. Stations left to right (`content/places.js STATIONS`): FRIDGE, CHOP,
MIX, STOVE, OVEN, PLATE. A critter stands at one station at a time (within 40 px of its spot, so any overlap
counts) and walks between them (left/right). The HOW TO PLAY card is raised again for every new step with that
station's verb. The order's `steps` are worked in order - **every recipe opens at the FRIDGE**, so a dish is never
cooked out of thin air - and the recipe card shows them with checks. Interactions:

| Station | Verb | Rule |
|---|---|---|
| FRIDGE | tap | one `action` press per item the order wants (four apples and two eggs is six taps), any rhythm; each tap swings the door open and the next ingredient, in the order's own order, flies along the counter into the station that uses it next (onto the board for a recipe that chops, else into the bowl). Nothing to choose: the fridge holds exactly the order |
| CHOP | tap | ten `action` presses, any rhythm (fifteen on an EXTRA CRUNCHY order, `order.chops`); the pips on the card light one per chop |
| MIX | hold | hold `action` for 240 frames while a dial fills; releasing pauses it, holding again resumes it |
| STOVE | hold | hold `action` for 240 frames while a bar fills; releasing pauses it the same way |
| OVEN | hold | hold `action` for 240 frames while the bake runs; releasing pauses it the same way |
| PLATE | tap | `action` plates the dish and rings the bell; the customer eats |

**The food moves down the line.** The order's items are one batch that is always at exactly one station. The
fridge sends them to the first cooking step, and the frame a step completes, everything at its station - the pile
and the item on the board, what is in the bowl, in the pot, on the oven's tray - takes off one item every four
frames and arcs into the next step's prop: the tenth chop clears the board and the dice fly into the bowl, the
finished stir empties the bowl into the pot or the oven, and the bake drops the dish onto the plate at the hatch,
where it is stacked before the bell is rung - and the moment the last item lands, the stack becomes **the finished
dish**: every recipe has a picture of its own (`art/dishes.ts`: the pie under its lattice, the soup in its bowl, the
stack of griddle cakes with the butter on top), so what sits at the hatch is what the customer asked for, and it is
that picture they are seen eating on results, a bite out of it per chew. A prop only draws itself loaded while the
batch is in it (lumps in the bowl, the ingredient's colour over the pot's rim, the tray in the oven window). This is a graphic: no step waits
for a landing, and nothing about it is simulated (`kitchen.ts` flights are cosmetic).

Nothing can burn or be missed: every completed step scores its full 2, so stars = round(total / max × 3) is always
3 for a served dish (minimum 1 by the formula).
The hungry one, when seated, gets a `bite` beat on a seeded 1-in-6 chance each time a step completes: a crumb burst
and a laugh, no score change. The room has two beats of its own on the same odds, for the crew who are not Barley:
when a STOVE step completes the pot lid may rattle and lift on its own for 40 frames with steam getting out under
it, and when an OVEN step completes a cloud of flour may puff out of the door, POOF!. Neither scores; the roll is
made either way so every peer draws the same day.

## 7. Results

The customer's bust at the hatch, the plate sliding out, three chews, a stamp (`DELICIOUS` / `TASTY` / `EDIBLE`),
1–3 stars, the tip in coins, then `PRESS Z` (auto-return after 600 frames) → `run.serve(stars)` → the line screen
(someone still in the queue), the map (the line is served) or the closed day board (that was the last line).

## 8. Multiplayer

One to four players. Couch: **all four seats are local**. The keyboard reaches two of them (P2 joins by pressing
any key of the T F G H / V B N block) and a gamepad claims the lowest seat no keyboard is already driving, on its
first button press — so four pads fill the truck, as do two pads either side of the keyboard pair. Seats fill from
the bottom and stay dense, because a run's party is indexed by input slot. Online: two to four through a **host
key** (a six-character room code) in the lobby, lockstep, one
truck, simultaneous mini-games, one critter per station. Everything a screen simulates is driven only by seat input
and the seeded rng, so all peers agree; see `docs/MULTIPLAYER.md`. Pause is local-only and refused online.

## 9. Controls

| Action | P1 keys | P2 keys | Any seat, on a gamepad |
|---|---|---|---|
| Move | Arrows / W A S D | T F G H | D-pad / left stick |
| ACTION (confirm, catch, cast, chop) | Z or Space | V | A |
| ALT (honk, bite, flip) | X | B | X |
| CANCEL (back) | C or Esc | N | B |
| START (pause, ready) | Enter | 5 | Start |

P3 and P4 are gamepad seats: there is no third nine-key block left on a keyboard worth playing on. A seat on a pad
is told its own buttons in the hint lines (`A: READY`, not `Z: READY`). The press that sits a player down never
also stamps their card — they arrive on a cursor, not on a pick.

**Everything in that table is a default.** The `controls` screen is the table as a form: eight action rows by three
columns (P1's keys, P2's keys, and the one pad table every controller shares), ACTION on a cell listens for the
next key or button, ALT puts that column back to stock, CANCEL leaves. A rebind sets the action to exactly one
input — the alternates above are what ships, not what survives a rebind — and is refused, out loud, when it would
leave another action with nothing on it at all. Bindings persist in `localStorage`; `?defaults=1` boots on the
stock set without clearing what is stored.

Bindable on a pad: all sixteen standard buttons, the shoulders and triggers included (`LB` `RB` `LT` `RT` do
nothing by default). NOT bindable: the left stick, which is always the four directions — a stick that could be
mapped onto CANCEL is a player leaving a mini-game by leaning.

Outside the table: **M mutes** for the session (not saved — a game that comes back silent is a game that looks
broken). It is not an action, so it is not on the wire and not on the CONTROLS form, and it stands down when a
player has bound M to something, while a rebind is listening, and while a host key is being typed.

## 10. Screens — what each must do

- **title**: logo, the parked truck with the cast idling, menu PLAY / ONLINE / CONTROLS / CREW (gallery) / SOURCE; `PRESS START`.
- **controls**: the binding table as an order pad; rebinds through an input capture; writes to storage on the way out.
- **select**: five 116×200 cards (the kit's 140 fitted four across), one cursor per joined seat, READY stamps;
  `next` = stage (starts the run).
- **stage** (the day board): the day's three lines pinned up as 140×124 paper tickets across the top — each one
  headed `LINE 01`, the landmark it waits at, and one block per customer (portrait, name, the dish they will order)
  — with the SHOPPING LIST on one wide ticket under them (every ingredient with the day's total, in columns) and a
  pad carrying the menu and `FILL THE PANTRY, THEN SERVE THE LINES`. No cursor: any joined seat's CONFIRM opens the
  truck and fades to the map. **When every line has been served the board opens closed**: each line washed back
  under a SERVED stamp (slammed on arrival for the one just finished) with its customers' stars in place of their
  dishes, and a CLOSING TIME slate over it with the lines and dishes served, the day's stars out of 18 and the
  takings; the one press left goes back to the title. BACK (open board only) leaves for the title, and is refused
  online (a peer walking out of a live room stalls the rest, as with the pause overlay).
- **line**: the truck pulled up at a queue on the dusk lane, turned so its hatch faces the diners still waiting (one
  rig each, front first, the crew's heads in the windows); the front diner waves, a paper bubble over their head
  carries their name and their order, and CONFIRM (or 600 frames) fades to the kitchen. The sign over the scene says
  `LINE 1 OF 3 - WINDLE MILL`.
- **lobby**: HOST / JOIN, the host key large, invite link, four seats with busts, ready stamps, `STARTING!`; drives
  `net/session.js`; hands off to `select`-style picking on the same screen, then the host starts the match on the
  day board, so an online party reads the day's plan together and opens the truck.
- **map**, **orchard**, **pond**, **coop**, **dairy**, **mill**, **hive**, **garden**, **bramble**, **beach**, **holt**,
  **wood**, **terrace**, **kitchen**, **results**:
  as above. Every one exposes `summary()` and `checksumFields()` and reads input only by seat.
- **pause**: transparent overlay (RESUME / QUIT TO TITLE); refused while `game.net.active`.
- **gallery**: the cast contact sheet in game.

## 11. Sound and music

Everything is synthesized in the browser at play time (docs/ARCHITECTURE.md section 3): no audio file, ever. Sound
comes on with the first key or tap, because browsers will not start audio before one.

**Three registers of SFX**, and every sound sits in one of them:

- **Paper and wood** — the menus, the stamps, the signs and the truck. Woodblock knocks for the cursor
  (`menu_move`, `menu_confirm` up a third, `menu_back` down one), a felt `stamp` for READY / SERVED / ORDER UP and
  the star stamp, a rope creak and a knock for every wooden sign (`sign_drop`: the map's and the mini-games'), the
  truck's own voice (`truck_start` on OPEN THE TRUCK — the starter, the engine catching, a honk for the road —
  `honk` on ALT, `truck_stop` on pulling up, `splash` for a nose in the river), `pause` / `unpause`, `join` for a
  seat sitting down, `type` for a letter of a host key, `rebind_ok` / `rebind_refused`. Short, dry, low. Nothing in
  a menu rings.
- **The gather** — the mini-games. Each catch is a soft BODY followed by ONE PIP (a clean sine and its octave), so
  the +1 the eye reads is the +1 the ear hears whatever the ingredient: the orchard's basket (`catch`), the coop's
  shell on straw (`egg`), the dairy's tin `pail` on the rack, the mill's sack tied off (`tie`), the hive's glass
  `jar`, the garden's `root` popping out, the pond's `hook`. Around the pips, each game's own texture: `wormy`
  (a rubber boing, no pip), `fuse` and a soft `boom`, `splat` for an apple on the grass; `cast`, `bite`, the reel's
  ratchet (`reel`), the trout in the `bucket`; `squirt` per press; `pour` while the chute runs; `dip`; `grip` and
  `heave`. The round ends on the sign's knock and a four-note `round_over`.
- **The kitchen** — the stations. `fridge` per item out, the knife's `chop`, and the three holds each with a noise
  that replays while the button is down (`stir`, `sizzle`, `bake`); `done` for a step, `perfect` with a sparkle on
  it; `nom` for the hungry one; and the `bell`, the one long ring in the game, because ringing it is the one thing a
  whole order builds toward. At the results: `chew` per bite, `stamp`, `coin` as the tip lands, `cheer` from the
  crew; `hello` when a diner steps up to the hatch; `day_done` over the closed board.

Sounds played on the same frame duck each other (four seats catching at once is one catch's loudness), and the
percussive names get a few percent of pitch wobble so a mashed button does not sound like a machine.

**Nine tracks**, one per place the day goes, every one four bars, major-key and mid-tempo, and every one carrying
the truck's own motif — the rising sixth 1-3-5-6 — somewhere. Which screen plays which is one table
(`game/game.ts SCREEN_MUSIC`), started the moment the screen is pushed and crossfaded over half a second:

| Track | Where | What it is |
|---|---|---|
| `title` | title, select, lobby, controls, gallery | The parked truck at dusk: a music box over a squeezebox, unhurried. G, 96. |
| `board` | stage (open) | The day's plan on paper: a whistle reading it out over an organ. C, 84. |
| `drive` | map | The lane: an oompah squeezebox under a whistle, the wheels in the shaker. D, 128. |
| `gather` | orchard, coop, dairy, mill, hive, garden, bramble, holt, wood, terrace | Marimba over a plucked bass, a woodblock keeping time. F, 120. |
| `pond` | pond, beach | Water waltzes: a flute over a pad, in 3. A, 88. |
| `line` | line | The queue at dusk: the title's squeezebox with a plucked tune over it, swung. G, 92. |
| `kitchen` | kitchen | The order on the pass: a harpsichord running over organ stabs, the clock in the drums. C, 140. |
| `results` | results | The customer eats: bells over brass, the motif three times and a bow. D, 112. |
| `closing` | stage (closed) | The truck shut for the night: the title tune slowed to a lullaby over a drone. G, 72. |

The pause overlay leaves its scene's track playing. Adding a track is adding data to `engine/audio/music.ts` and a
row to the table; the audio playtest renders every track it finds and fails on a silent one or a ragged bar.
