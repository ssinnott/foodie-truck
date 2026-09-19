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
- **The day board** (`stage`) pins the plan up before the truck opens: the three lines and the **shopping list**
  — every ingredient of every order in every line, summed. Confirm opens the truck.
- **A recipe** (`ORDERS`) names a dish, a phone line, 2–3 ingredients with amounts, and the kitchen steps in order.
  Twenty-two ship. The first seven — apple pie, fish cakes, apple omelette, honey loaf, custard tart, carrot soup,
  griddle cakes — ask for the first seven ingredients (apples, trout, eggs, milk, flour, honey, carrots); the
  fifteen after them each carry one of the sixteen newer ones — pears, peaches, avocados, butter, rice, potatoes,
  onions, leeks, beetroot, pumpkins, cabbages, crabs, seaweed, sea salt, strawberries, blueberries — so every
  ingredient is somewhere a day can send the truck. Recipes are only ever appended, because `?order=N` and the
  scenarios name them by index.
- **An ingredient** (`INGREDIENTS`) names the landmark that supplies it. A landmark can supply several: the
  orchard drops pears, peaches and avocados as well as apples; the market garden pulls six vegetables besides the
  carrot; the dairy's pails go on to butter; the mill's chutes fill rice sacks. A mini-game gathers whichever of
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
  (eggs), dairy (milk, butter), mill (flour, rice), hives (honey), market garden (carrots, potatoes, onions, leeks,
  beetroot, pumpkins, cabbages), Cockle Cove on the east edge (crabs, seaweed, sea salt) and Bramble Bank on the
  south lane (strawberries, blueberries). **All nine supply landmarks open a mini-game** while the list is short
  of what they supply — the cove opens the pond's (crab lines off the jetty) and the bank opens the market's
  (berries pulled from the beds), each screen reading the landmark it stands at off its `place` param — and **any
  of them can hold a line** once it is full; arriving where there is nothing to do shows a sign instead
  (`NOTHING NEEDED HERE`, `FILL THE PANTRY FIRST` at home, `NO LINE HERE`, `THIS LINE IS SERVED`,
  `THE LINES ARE WAITING` at home).
- **The truck** is one shared vehicle. Every seated player's stick is a vector; they are summed (the driver's ×1.5),
  quantised to 16 headings with `dcos/dsin` tables, and the truck moves at 2.2 px/frame on a road and 1.0 off it,
  turning at most 1 heading step per 4 frames. Roads are the fast path; fields are drivable but slow and dusty;
  water is not drivable — the river (its bridges are), the millpond and the cove's sea: the truck stops a
  half-token short of the edge with a splash. Arrival = within 40 px of a landmark's door point.
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

A screen whose landmark supplies more than one thing (the orchard, the dairy, the mill, the market garden) and a
screen two landmarks share (the pond's jetty is the cove's, the market's bed is the bank's) asks `run.js
gatherTarget` which ingredient this visit is for, and draws that one: its glyph on the tally ticket and in the
basket, its name on the end sign, and the landmark's own name on the ticket. The mechanic never changes — a pear is
caught like an apple, a crab reeled in like a trout. The cove repaints the pond's layers in a seaside palette
(`art/backgrounds/pond.js COVE`: open sea to the horizon, dunes for the tree-line, sand and marram for the turf,
foam under the deck, no lily pads); the bank keeps the market's backdrop.

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
  fusing.
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
  never kick.
- **Mill — FILL** (*move + hold*). Four chutes along the back wall wake on a seeded 70–130 frame timer, at most two
  at once: 24 frames of telegraph, then 110 frames of pouring. Seats walk left and right on their own depth lanes;
  standing anywhere under a pouring chute (36 px either side) with `action` **held** fills the sack at 1/90 per frame (1.5 s from
  empty). The moment it reaches the brim it ties itself off (+1 flour, an 18-frame tie beat, a fresh sack);
  letting go early **keeps** the part sack to top up at the next chute. Nothing bursts.
- **Hives — CREEP** (*move + hold*). Five straw skeps on a bench; **holding** `action` anywhere over a full one (36 px either side)
  for 60 frames dips it — a strand of honey climbs the dipper and a bar fills over the skep — then +1 honey, and
  that skep is empty for 150 frames, so the party is pushed along the bench. Letting go early costs nothing. The
  bees drone over the bench and never turn.
- **Market garden — PULL** (*move + tap*). Leafy tops stand in the bed (seven at the start, more every 70–120
  frames up to eight, never closer than 42 px); every one is whatever the visit gathers (a carrot by default). `action` with a top anywhere under the critter (34 px either side) grips it and opens
  a pull gauge above that seat; each further `action` press fills it a twelfth, and the twelfth brings the root out
  (+1 carrot, a 14-frame pull). 150 frames without a press lets go at no cost.

## 6. The kitchen

The truck interior, side-on, camera locked. Stations left to right (`content/places.js STATIONS`): FRIDGE, CHOP,
MIX, STOVE, OVEN, PLATE. A critter stands at one station at a time (within 40 px of its spot, so any overlap
counts) and walks between them (left/right). The HOW TO PLAY card is raised again for every new step with that
station's verb. The order's `steps` are worked in order - **every recipe opens at the FRIDGE**, so a dish is never
cooked out of thin air - and the recipe card shows them with checks. Interactions:

| Station | Verb | Rule |
|---|---|---|
| FRIDGE | tap | one `action` press per item the order wants (four apples and two eggs is six taps), any rhythm; each tap swings the door open and the next ingredient, in the order's own order, flies along the counter to the station that uses it next (the board for a recipe that chops, else the bowl) and piles up there until that step is done. Nothing to choose: the fridge holds exactly the order |
| CHOP | tap | ten `action` presses, any rhythm; the pips on the card light one per chop |
| MIX | hold | hold `action` for 240 frames while a dial fills; releasing pauses it, holding again resumes it |
| STOVE | hold | hold `action` for 240 frames while a bar fills; releasing pauses it the same way |
| OVEN | hold | hold `action` for 240 frames while the bake runs; releasing pauses it the same way |
| PLATE | tap | `action` plates the dish and rings the bell; the customer eats |

Nothing can burn or be missed: every completed step scores its full 2, so stars = round(total / max × 3) is always
3 for a served dish (minimum 1 by the formula).
The hungry one, when seated, gets a `bite` beat on a seeded 1-in-6 chance each time a step completes: a crumb burst
and a laugh, no score change.

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
- **map**, **orchard**, **pond**, **coop**, **dairy**, **mill**, **hive**, **garden**, **kitchen**, **results**:
  as above. Every one exposes `summary()` and `checksumFields()` and reads input only by seat.
- **pause**: transparent overlay (RESUME / QUIT TO TITLE); refused while `game.net.active`.
- **gallery**: the cast contact sheet in game.
