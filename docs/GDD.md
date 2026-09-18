# Foodie Truck — Game Design Document

> **Precedence:** this document owns *design* — names, numbers, rules, what each screen must do. `docs/ARCHITECTURE.md`
> owns technical matters and wins on them. `docs/ART_STYLE.md` owns how things look and supersedes anything here
> about drawing. `docs/MULTIPLAYER.md` owns the online session. Where a number here and a number in code disagree,
> the code is a bug or this document is stale; fix one in the same commit.

## 1. Premise and tone

A cozy co-op cooking adventure for one to four players. A customer phones in an order. The crew of a countryside food
truck is missing an ingredient, so they drive out to where it comes from, gather it in a short mini-game, drive home
and cook the dish step by step. The customer eats. The phone rings again.

The *structure* is borrowed from the Sesame Street "Foodie Truck" segments (order → missing ingredient → go to the
source → cook). Everything else is original: the cast are anthropomorphic countryside animals with their own names,
silhouettes and colours, and nothing in the game may resemble a Sesame Street character, name or design. Tone:
warm, silly, unhurried; the joke that never gets old is the big hungry one eating the ingredients.

## 2. The cast

Four playable critters, one per seat; a seat may pick any critter, and online two seats may not pick the same one.
Roles are flavour and small stat differences, never gates: any critter can do any job.

| Role | Verb | What the role changes |
|---|---|---|
| **The hungry one** | EAT / CARRY | Biggest basket; slowest; in the kitchen a random `bite` beat now and then that costs nothing but makes everyone laugh |
| **The chef** | CHOP / MIX | Smallest basket; the one who plates with a flourish |
| **The driver** | DRIVE / HONK | 1.5× steering weight on the map; honks |
| **The forager** | GATHER / CAST | Fastest in the mini-games; longest fishing cast |

| Cast index | Name | Species | Role |
|---|---|---|---|
| 0 | **Barley** | Suffolk sheep | the hungry one |
| 1 | **Sorrel** | field mouse | the chef |
| 2 | **Chicory** | brown hare | the driver |
| 3 | **Cress** | pond frog | the forager |

Palettes, proportions and signature accessories are the art direction's (`docs/ART_STYLE.md` §1) and live in
`src/content/critters/`. Customers are NPC critters built with the same rig (an owl, an otter, a goat) in
`content/critters/customers.js`. Every critter wears an apron in their seat's player colour.

## 3. The loop

```
title -> select -> stage -> map -> (mini-game -> map)* -> map(home) -> kitchen -> results -> stage -> ...
                     ^                                                                         |
                     +-------------------------------------------------------------------------+
                        seven stages on the board; when the last one is served, the day closes
```

- **A stage** is one of the seven orders, and the *stage select* (the **order board**) is where the party picks
  which customer and which recipe the truck works on next. A day is the seven stages; each one is taken off the
  board, driven, cooked and served, and comes back to the board stamped SERVED with the stars it earned. When every
  stage carries stars the day is over and the board closes the truck for the night — **that is the end of the game**,
  and the only way back from it is the title screen.
- **An order** (`content/recipes.js ORDERS`) names a dish, a customer, a phone line, 2 ingredients with amounts, and
  the kitchen steps in order. Seven orders ship — apple pie, fish cakes, apple omelette, honey loaf, custard tart,
  carrot soup, griddle cakes — between them asking for all seven ingredients, so every landmark on the map is
  somewhere the truck is actually sent, and every one of them is a stage on the board. `run.setStage(i)` takes one
  off the board with an empty ticket; `run.serve(stars)` banks its stars against that stage and hands the board back.
- **The map** is where the order is read and the truck is driven. Arriving at a landmark that supplies a *missing*
  ingredient opens its mini-game; arriving home with everything opens the kitchen. Arriving anywhere else does
  nothing but show the sign.
- **A mini-game** lasts up to 40 seconds (2400 frames) or until the order's amount is gathered; it ends by calling
  `run.gather(id, amount)` and returning to the map. Every seated player plays at once; the party's total counts.
- **The kitchen** walks `order.steps` in order across the stations; when the plate is served it opens results.
- **Results** shows the customer eating and a 1–3 star rating; `run.serve(stars)` banks the score against the stage;
  back to the order board, where that stage is stamped and the next one is picked — or, if it was the last one, the
  day's card is totted up and the truck closes.

## 4. The world map

- World `1920 x 1080` px (`content/places.js WORLD_W/H`), one flat plane in 3/4 storybook view, y-sorted sprites
  with ground-contact shadows. Camera follows the truck (0.1 lerp, integer snap, clamped to the world).
- **Landmarks** (`PLACES`): home (the truck stop), orchard (apples), pond (fish), coop (eggs), dairy (milk), mill
  (flour), hives (honey), market garden (carrots). **All seven supply landmarks open a mini-game**; arriving at one
  the order does not need shows a `NOTHING NEEDED HERE` sign instead.
- **The truck** is one shared vehicle. Every seated player's stick is a vector; they are summed (the driver's ×1.5),
  quantised to 16 headings with `dcos/dsin` tables, and the truck moves at 2.2 px/frame on a road and 1.0 off it,
  turning at most 1 heading step per 4 frames. Roads are the fast path; fields are drivable but slow and dusty;
  the river is not drivable (bridges are). Arrival = within 40 px of a landmark's door point.
- **HUD**: the order ticket (customer, dish, `NEED: X` rows with checks), the steering-wheel widget with one tick per
  seat that lights while that seat pushes, the crew's heads in the truck's windows, an off-screen destination arrow on
  an ink plate, one hint line. `alt` honks: a `HONK!` stamp and a truck squash. The telephone at home rings when a
  new order arrives.

## 5. The mini-games

Common rules: side view, feet on a scene-specific floor line, one critter per seat, name plates above heads,
`+1` float text and a ring on every success, the `bump` beat (4/10/6 frames) on every failure, a 40-second clock
drawn as a paper timer, the target count from the order; the scene ends with a sign dropping in (`APPLES: 12`)
and a 60-frame hold, then `run.gather` and back to the map. All randomness through `rng` inside `update()`.

The whole game is built on **three inputs and nothing else**: move left and right, tap ACTION over and over, and
hold ACTION down. There are no timing windows, no beats to hit and no wrong buttons — a young player can never lose
what they have gathered, and the 40-second clock is a backstop rather than an opponent.

- **Orchard — CATCH** (*move*). Move left/right with a basket held in front. Apples spawn above the canopy every
  30–60 frames at a seeded x and fall at 1.4–2.4 px/frame with a small sway; caught at the basket's top edge. A
  missed apple splats on the grass and costs nothing. Four seats use four depth lanes 8 px apart so bodies stack
  instead of fusing.
- **Pond — FISH** (*tap*). Fixed standing spots on a jetty, one float column per seat. `action` casts; the float
  bobs; after a seeded 60–150 frames the fish bites (the float drops, a mint ring) and stays on. Tapping `action`
  twelve times reels it in: every press is one turn of the reel, drawn as a bar over the float. A press during the wait
  does nothing.
- **Coop — COLLECT** (*move + tap*). Walk left/right along a depth lane; eggs appear in nests and on the floor in
  front of the lanes every 90–150 frames; `action` within 18 px along the lane plucks one (a 12-frame reach up into
  a nest from the gold ring on the floor under it, a 12-frame crouch to a floor egg). Five hens potter about the
  back of the floor and touch nobody.
- **Dairy — PUMP** (*tap*). A stool and a cow per seat, nobody moves. Every `action` press is a squirt; twelve fill a
  pail — +1 milk, the pail hops to the churn rack, a fresh one slides under the cow. Any rhythm works, and the cows
  never kick.
- **Mill — FILL** (*move + hold*). Four chutes along the back wall wake on a seeded 70–130 frame timer, at most two
  at once: 24 frames of telegraph, then 110 frames of pouring. Seats walk left and right on their own depth lanes;
  standing within 18 px of a pouring chute with `action` **held** fills the sack at 1/90 per frame (1.5 s from
  empty). The moment it reaches the brim it ties itself off (+1 flour, an 18-frame tie beat, a fresh sack);
  letting go early **keeps** the part sack to top up at the next chute. Nothing bursts.
- **Hives — CREEP** (*move + hold*). Five straw skeps on a bench; **holding** `action` within 16 px of a full one
  for 60 frames dips it — a strand of honey climbs the dipper and a bar fills over the skep — then +1 honey, and
  that skep is empty for 150 frames, so the party is pushed along the bench. Letting go early costs nothing. The
  bees drone over the bench and never turn.
- **Market garden — PULL** (*move + tap*). Leafy tops stand in the bed (seven at the start, more every 70–120
  frames up to eight, never closer than 42 px); every one is a carrot. `action` within 16 px grips a top and opens
  a pull gauge above that seat; each further `action` press fills it a twelfth, and the twelfth brings the root out
  (+1 carrot, a 14-frame pull). 150 frames without a press lets go at no cost.

## 6. The kitchen

The truck interior, side-on, camera locked. Stations left to right (`content/places.js STATIONS`): CHOP, MIX, STOVE,
OVEN, PLATE. A critter stands at one station at a time and walks between them (left/right). The order's `steps`
are worked in order; the recipe card shows them with checks. Interactions:

| Station | Verb | Rule |
|---|---|---|
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
1–3 stars, the tip in coins, then `PRESS Z` (auto-return after 600 frames) → `run.serve(stars)` → the order board.

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
- **select**: 140×200 cards, one cursor per joined seat, READY stamps; `next` = stage (starts the run).
- **stage** (the order board): the day's seven orders pinned up as 140×124 paper tickets, four across the top row and
  three under them — each one a customer's portrait and name, the stars it has been served at, the dish across the
  middle and its two `NEED` rows. ONE shared cursor any joined seat may drive (the menu scheme of `game/menuinput.js`),
  the selected ticket lifted and headed in the truck's beetroot, and a pad under the board carrying the selected
  customer's phone line, their role and the landmarks that order sends the truck to. CONFIRM takes the order off the
  board (`run.setStage`) and fades to the map; a served stage is washed back, gives its `NEED` rows up to a SERVED
  stamp (slammed on arrival for the one just cooked) and keeps its stars. **When every stage has been served the
  board opens closed**: a CLOSING TIME slate over the stamped board with the orders served, the day's stars out of
  21 and the takings, and the one press left goes back to the title. BACK leaves for the title, and is refused
  online (a peer walking out of a live room stalls the rest, as with the pause overlay).
- **lobby**: HOST / JOIN, the host key large, invite link, four seats with busts, ready stamps, `STARTING!`; drives
  `net/session.js`; hands off to `select`-style picking on the same screen, then the host starts the match on the
  order board, so an online party picks the customer and the dish together.
- **map**, **orchard**, **pond**, **coop**, **dairy**, **mill**, **hive**, **garden**, **kitchen**, **results**:
  as above. Every one exposes `summary()` and `checksumFields()` and reads input only by seat.
- **pause**: transparent overlay (RESUME / QUIT TO TITLE); refused while `game.net.active`.
- **gallery**: the cast contact sheet in game.
