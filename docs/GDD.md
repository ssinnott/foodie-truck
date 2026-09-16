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
| **The chef** | CHOP / MIX | Widest timing windows at the stations; smallest basket |
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
title -> select -> map -> (mini-game -> map)* -> map(home) -> kitchen -> results -> map -> ...
```

- **An order** (`content/recipes.js ORDERS`) names a dish, a customer, a phone line, 2 ingredients with amounts, and
  the kitchen steps in order. The prototype ships three orders; `run.serve()` rolls the next one.
- **The map** is where the order is read and the truck is driven. Arriving at a landmark that supplies a *missing*
  ingredient opens its mini-game; arriving home with everything opens the kitchen. Arriving anywhere else does
  nothing but show the sign.
- **A mini-game** lasts up to 40 seconds (2400 frames) or until the order's amount is gathered; it ends by calling
  `run.gather(id, amount)` and returning to the map. Every seated player plays at once; the party's total counts.
- **The kitchen** walks `order.steps` in order across the stations; when the plate is served it opens results.
- **Results** shows the customer eating and a 1–3 star rating; `run.serve(stars)` banks the score and rolls the next
  order; back to the map.

## 4. The world map

- World `1920 x 1080` px (`content/places.js WORLD_W/H`), one flat plane in 3/4 storybook view, y-sorted sprites
  with ground-contact shadows. Camera follows the truck (0.1 lerp, integer snap, clamped to the world).
- **Landmarks** (`PLACES`): home (the truck stop), orchard (apples), pond (fish), coop (eggs), dairy (milk), mill
  (flour), hives (honey), market garden (vegetables). The three with mini-games in the prototype are orchard, pond
  and coop; the rest are scenery with signs and a "COMING SOON" chalk note when driven to.
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

- **Orchard — CATCH.** Move left/right with a basket held in front. Apples spawn above the canopy every 30–60 frames at
  a seeded x and fall at 1.4–2.4 px/frame with a small sway; caught at the basket's top edge. One in eight is a
  wormy apple that costs one. Four seats use four depth lanes 8 px apart so bodies stack instead of fusing.
- **Pond — FISH.** Fixed standing spots on a jetty, one float column per seat. `action` casts; the float bobs; after
  a seeded 90–240 frames a nibble telegraph (two 2 px dips, 30 frames), then the bite: the float drops and an 18-frame
  window opens; `action` inside it lands the fish, too early pops the float, too late loses it.
- **Coop — COLLECT.** Walk in 8 directions across a deep floor band; eggs appear in nests and on the floor every
  90–150 frames; `action` over an egg plucks it (12-frame crouch). Five hens wander on seeded waypoints; touching
  one is a bump that drops the last egg (it cracks into a yolk puddle). One rooster charges every ~600 frames with a
  20-frame telegraph.

## 6. The kitchen

The truck interior, side-on, camera locked. Stations left to right (`content/places.js STATIONS`): CHOP, MIX, STOVE,
OVEN, PLATE. A critter stands at one station at a time and walks between them (left/right). The order's `steps`
are worked in order; the recipe card shows them with checks. Interactions:

| Station | Verb | Rule |
|---|---|---|
| CHOP | tap | five `action` presses on the beat of a sliding bar; off-beat presses do not count |
| MIX | stir | hold `action` for 180 frames while a dial fills; releasing pauses it |
| STOVE | hold | hold `action`; a bar fills and turns hot in its last 20 %; release inside the hot band; over-time burns it |
| OVEN | time | `action` loads the tray; a timer runs 300 frames; `action` inside the last 40 frames is perfect, later burns |
| PLATE | tap | `action` plates the dish and rings the bell; the customer eats |

Each step scores 0–2 (missed / done / perfect); stars = round(total / max × 3), minimum 1 if the dish was served.
The hungry one, when seated, gets a `bite` beat on a seeded 1-in-6 chance each time a step completes: a crumb burst
and a laugh, no score change.

## 7. Results

The customer's bust at the hatch, the plate sliding out, three chews, a stamp (`DELICIOUS` / `TASTY` / `EDIBLE`),
1–3 stars, the tip in coins, then `PRESS Z` (auto-return after 600 frames) → `run.serve(stars)` → map.

## 8. Multiplayer

One to four players. Couch: two on one keyboard (P2 joins by pressing any key of the T F G H / V B N block) or
a gamepad. Online: two to four through a **host key** (a six-character room code) in the lobby, lockstep, one
truck, simultaneous mini-games, one critter per station. Everything a screen simulates is driven only by seat input
and the seeded rng, so all peers agree; see `docs/MULTIPLAYER.md`. Pause is local-only and refused online.

## 9. Controls

| Action | P1 | P2 (couch) | Gamepad |
|---|---|---|---|
| Move | Arrows / W A S D | T F G H | D-pad / left stick |
| ACTION (confirm, catch, cast, chop) | Z or Space | V | A |
| ALT (honk, bite, flip) | X | B | X |
| CANCEL (back) | C or Esc | N | B |
| START (pause, ready) | Enter | 5 | Start |

## 10. Screens — what each must do

- **title**: logo, the parked truck with the cast idling, menu PLAY / ONLINE / CREW (gallery) / SOURCE; `PRESS START`.
- **select**: 140×200 cards, one cursor per joined seat, READY stamps; `next` = map (starts the run).
- **lobby**: HOST / JOIN, the host key large, invite link, four seats with busts, ready stamps, `STARTING!`; drives
  `net/session.js`; hands off to `select`-style picking on the same screen, then the host starts on the map.
- **map**, **orchard**, **pond**, **coop**, **kitchen**, **results**: as above. Every one exposes `summary()` and
  `checksumFields()` and reads input only by seat.
- **pause**: transparent overlay (RESUME / QUIT TO TITLE); refused while `game.net.active`.
- **gallery**: the cast contact sheet in game.
