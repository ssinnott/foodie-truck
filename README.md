# Foodie Truck

[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-support-F2C14E?logo=kofi&logoColor=white&labelColor=2A1F1A)](https://ko-fi.com/seansinnott)

A cozy co-op cooking adventure for one to four players, drawn entirely in code. The crew of a countryside food
truck opens for the day with a menu and a shopping list that adds up everything the day's
customers will order. They drive round the countryside gathering it all — a short mini-game at every landmark —
until the pantry is full, then drive to the queues of villagers lined up at three of those landmarks and cook for
each whole line at once — every order taken together, every dish cooked, everyone served in one go — until the
third line has been served. Then the truck closes for the night.

Sixty-three recipes, forty ingredients, twelve landmarks, and **twelve mini-games** — each with its own verb:
catch, fish, collect, pump, fill, creep, pull, pick, chase, shake, forage, snip. A landmark can supply several things, and every visit
looks like what it is for: the orchard drops pears, peaches and avocados from their own trees; the farm's bed grows
six vegetables besides the carrot, each its own plant; the dairy milks, and churns the milk into butter; the mill
fills rice sacks as well as flour; Bramble Bank's strawberries and blueberries are picked off the bushes; and at
Cockle Cove crabs are chased along the sand, weed raked off the strand, salt scraped from the pans and cockles dug
out of the wet sand where they spit; nuts are shaken down at Hazel Holt, mushrooms brushed out of the leaves in
Tangle Wood, and herbs snipped on Thyme Terrace. Every one of them is played with the same three inputs — move left and right, tap the
action button over and over, or hold it down — with no timing windows and nothing to lose, so a small child can play
the whole game. Every mini-game has a joke in it - the old boot on the line, the hen sat on the egg, the cow's
tail, the flour sneeze, the bee on the nose, the whopper of a carrot, the thorn, the crab that pinches back and
the wave that soaks everyone - and none of them costs more than a moment.

A run is a **week**: five days, each with a shape of its own rather than just a seed of its own. Day one is short
and plain; **market day** keeps its queues but cuts the menu, so the village wants the same things; day four is
always fog or drizzle; and **the fête** is four queues, one of them three deep, on a menu drawn from what this
week has already served — the last customer of the week orders Monday's dish. Thirty-one dishes a week.

The whole week is laid out from the seed before the first day opens, so nothing about it is stored: the **day
board** pins each day's plan up before the truck opens, and when the last queue is served it comes back **closed**
— the day totted up, the week strip under it — and the one press left drives the truck into the garage. A week is two and a half
hours across five sittings, so it is **resumable**: the title's first row turns into `CONTINUE`, and picking it up
needs only the seed, the day and who was sitting down. Finish the fête and the truck shuts for the week.

Every dish tips **coins** — 4, 8 or 12 by its stars — and each night they go into the **garage's** tin. The garage
sells six things for the truck: a new paint (seafoam mint, or ketchup and mustard), a new awning (cherry gingham,
or a salad) and something for the roof (a big apple, or a giant hot dog). Flip through them and the truck tries each
one on; a good week buys about one. The tin and the truck's look carry on from week to week. (Local play only for
now: an online match banks nothing, and everyone sees the stock truck.)

The **recipe book** is what the week fills in. Every dish cooked is inked into it with its own picture, every
diner fed and everything gathered is tallied, and everything not yet cooked sits there in pencil — so the
sixty-three recipes stop being invisible. It records and it never unlocks: nothing in it can reach the game's
simulation, which is what lets a saved file exist at all in a game that runs four browsers in lockstep.

The cast are original anthropomorphic countryside animals — **Barley** the Suffolk sheep (the hungry one), **Sorrel**
the field mouse (the chef), **Chicory** the brown hare (the driver) and **Cress** the pond frog (the forager) — and
the one human who owns the truck and runs them: **Rowan**, the head chef. All five are playable.

The whole game is vanilla JavaScript ES modules and one HTML5 canvas at 640×360, scaled up with nearest-neighbour
filtering. There are no image, audio or font files: every sprite, backdrop, glyph and particle is drawn from code,
and every sound and every tune is synthesized in the browser (WebAudio oscillators and noise, nine looping tracks
and forty-odd effects, all data in `src/engine/audio/`), so the repository stays reviewable in a diff.

## The three parts

| Part | Screen | What happens |
|---|---|---|
| **Day board** | `stage` | The day's plan on paper: the lines (where each waits, who is in it, what they order) and the shopping list they add up to. Confirm opens the truck. After the last line it comes back closed, every customer's stars on it, the week strip under them, and the garage on the way out — or, on the fête, the end of the week. |
| **Garage** | `garage` | Where each night ends: the coin tin, and the truck's paint, awning and roof to change or buy, tried on the truck as you flip through them. OPEN TOMORROW on the way out. Also on the title menu. |
| **Recipe book** | `book` | What this truck has cooked, who it has fed, what it has gathered and where it has been. Six pages of dishes and three of tallies. Reached from the title. |
| **Overland map** | `map` | The truck drives a 1920×1080 countryside between landmarks. A flock of sheep or a duck parade may be across the lane: honk (ALT) and they scatter. While the pantry is short, arriving where a missing ingredient comes from opens its mini-game. Once it is full, arriving at a landmark with a line opens the queue. |
| **Mini-games** | `orchard`, `pond`, `coop`, `dairy`, `mill`, `hive`, `garden`, `bramble`, `beach`, `holt`, `wood`, `terrace` | Catch apples under the trees (mind the wormy ones, and the ones with a fuse), tap to reel in a fish from the millpond, collect eggs from the hens, tap to milk the cows (and crank the churn for butter), hold to fill flour sacks under the mill's chutes, hold to dip honey from the hives, tap to pull carrots out of the farm's bed, pick berries off the bank's bushes, and chase crabs along the cove's beach. Everyone seated plays at once and the party's total counts. |
| **The line** | `line` | The truck pulled up at a queue: everyone in it says what they want at once. Take every order into the kitchen. |
| **Cooking** | `kitchen`, `results` | Walk the order's steps across the truck's stations (tap to pull each ingredient out of the fridge; tap to chop; hold to mix, cook and bake; ring the bell to plate), for every dish in the line at the same time - one fridge run, one pass of each station, one bell. Then serve the whole line at once and watch them all eat, and the truck drives to the next one. |

## Play

```
npm install
npm run dev        # http://localhost:8080
```

**Four players on one couch.** The keyboard seats two, and a gamepad takes the lowest seat nobody is already on
the keys for the moment it is pressed — so four pads fill the truck, or two pads either side of the keyboard pair.
Pick up a controller on the title screen and press A. Every round opens on a HOW TO PLAY card that shows its
controls as animated keys, so nobody has to read the hint line to know what to do.

| Action | P1 keys | P2 keys | Any seat, on a gamepad |
|---|---|---|---|
| Move | Arrows / W A S D | T F G H | D-pad / left stick |
| ACTION (confirm, catch, cast, chop) | Z or Space | V | A |
| ALT (honk, bite, flip) | X | B | X |
| CANCEL (back) | C or Esc | N | B |
| START (pause, ready) | Enter | 5 | Start |

P3 and P4 are gamepad seats — there is no third nine-key block left on a keyboard worth playing on — and a seat on
a pad reads its own buttons in the hint lines.

**Every one of those is a default, not a rule.** `CONTROLS` on the title menu opens the table above as a form you
can write on: pick a cell, press ACTION, then press the key or button you want it to be. Each column (P1's keys,
P2's keys, and the pad table every controller shares) goes back to stock on its own with ALT. Bindings are saved in
the browser and come back next time; `index.html?defaults=1` boots on the stock ones without throwing yours away,
which is the way back in if you ever bind yourself into a corner.

The shoulders and triggers are bindable too — they do nothing by default, so `LB` / `RB` are there if you want the
dairy's two-handed milking on two hands. The left stick is always the four directions and is not bindable.

**Sound** comes on with the first key or tap (the browser's rule, not ours). `M` mutes and unmutes for the session;
it stands down if you have bound M to an action, or while you are typing a host key.

Any screen can be opened directly for a look: `index.html?debug=1&skipTo=orchard&critters=0,1,2,3&seed=7`. Add
`&order=4` to force a recipe onto the day's menu (and into the first customer's paws), `&recipes=0,2` to fix the
whole menu, or `&day=5` to open on that day of the week. The title's CREW row opens the gallery, a contact sheet
of every critter and animation, and its BOOK row opens the recipe book.

## Online co-op with a host key

Two to four players over the internet with no server of our own. The host picks ONLINE, hosts a table and reads
out the six-character host key (or sends the invite link the address bar turns into). Guests type the key. Every
browser runs the same simulation in deterministic lockstep and exchanges only one-byte input masks over WebRTC,
with a public MQTT broker used just to find each other. The host's week rides along as a single byte, because the
week is a pure function of the seed. `docs/MULTIPLAYER.md` explains the flow, the mesh, the input delay and what a
screen has to do to stay in sync.

## Documents

- `docs/ART_PRINCIPLES.md` — the portable lessons from making *Aether & Brass*: the pipeline, characters, backdrops,
  UI, determinism and process. Read this first if you want to reuse the approach elsewhere.
- `docs/ART_STYLE.md` — the binding style guide for this game: the Hedgerow Dusk look, the cast table, palettes,
  outline and shading rules, animation bar, self-review checklist.
- `docs/GDD.md` — the design: the week, loop, map, mini-game rules, kitchen stations, results, controls, rebinding, screen contract, the recipe book, the garage.
- `docs/ARCHITECTURE.md` — the technical contract: modules, coordinate systems, screen API, test hooks, tooling.
- `docs/MULTIPLAYER.md` — the online session.

## Tooling

```
npm run lint         # node --check on every module, then tsc over the JSDoc types
npm run art-check    # data-tier art invariants (palettes, player-colour contrast, cast table)
npm run nettest      # pure-node protocol, lockstep and trig tests
npm run playtest     # headless Playwright: boots every screen, walks the flow, holds a netplay room
npm run playtest playthrough   # one scenario: the whole day from the title screen to the first line served
npm run playtest audio         # every sound and track rendered offline and measured, and the screens' tracks
npm run capture -- tools/screens map "kitchen:critters=0,1,2,3"   # screenshots of any screen at 2x
node tools/sheet-capture.js tools/screens critter=barley          # critter contact sheets
npm run build        # single-file dist/index.html
```

The GitHub Pages workflow runs lint, art-check, nettest, playtest and build on every push and deploys `main`.

## Licence

MIT.
