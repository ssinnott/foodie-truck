# Foodie Truck

A cozy co-op cooking adventure for one to four players, drawn entirely in code. The crew of a countryside food
truck opens for the day with a menu of three recipes and a shopping list that adds up everything the day's
customers will order. They drive round the countryside gathering it all — a short mini-game at every landmark —
until the pantry is full, then drive to the queues of villagers lined up at three of those landmarks and cook for
them one at a time, order by order, until the third line has been served. Then the truck closes for the night.

Fifty-one recipes, thirty-one ingredients, nine landmarks, and **nine mini-games** — each with its own verb:
catch, fish, collect, pump, fill, creep, pull, pick, chase. A landmark can supply several things, and every visit
looks like what it is for: the orchard drops pears, peaches and avocados from their own trees; the farm's bed grows
six vegetables besides the carrot, each its own plant; the dairy milks, and churns the milk into butter; the mill
fills rice sacks as well as flour; Bramble Bank's strawberries and blueberries are picked off the bushes; and at
Cockle Cove crabs are chased along the sand, weed raked off the strand and salt scraped from the pans. Every one of them is played with the same three inputs — move left and right, tap the
action button over and over, or hold it down — with no timing windows and nothing to lose, so a small child can play
the whole game. Every mini-game has a joke in it - the old boot on the line, the hen sat on the egg, the cow's
tail, the flour sneeze, the bee on the nose, the whopper of a carrot, the thorn, the crab that pinches back and
the wave that soaks everyone - and none of them costs more than a moment.

Every day is laid out from a seed: which three recipes are on the menu, which three landmarks the lines form at,
who is in each line and what they order. The **day board** pins the whole plan up before the truck opens; the
**shopping list** on it is what the truck gathers first, and the **lines** are what it serves afterwards. Serve
all three and the day ends, the takings are totted up, and that is the end of the game.

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
| **Day board** | `stage` | The day's plan on paper: the three lines (where each waits, who is in it, what they order) and the shopping list they add up to. Confirm opens the truck. After the last line it comes back closed, every customer's stars on it. |
| **Overland map** | `map` | The truck drives a 1920×1080 countryside between landmarks. A flock of sheep or a duck parade may be across the lane: honk (ALT) and they scatter. While the pantry is short, arriving where a missing ingredient comes from opens its mini-game. Once it is full, arriving at a landmark with a line opens the queue. |
| **Mini-games** | `orchard`, `pond`, `coop`, `dairy`, `mill`, `hive`, `garden`, `bramble`, `beach` | Catch apples under the trees (mind the wormy ones, and the ones with a fuse), tap to reel in a fish from the millpond, collect eggs from the hens, tap to milk the cows (and crank the churn for butter), hold to fill flour sacks under the mill's chutes, hold to dip honey from the hives, tap to pull carrots out of the farm's bed, pick berries off the bank's bushes, and chase crabs along the cove's beach. Everyone seated plays at once and the party's total counts. |
| **The line** | `line` | The truck pulled up at a queue: the customer at its front steps up and says what they want. Take the order into the kitchen. |
| **Cooking** | `kitchen`, `results` | Walk the order's steps across the truck's stations (tap to pull each ingredient out of the fridge; tap to chop; hold to mix, cook and bake; ring the bell to plate), serve, and watch the customer eat. The next in line steps up; when the line is empty, the truck drives to the next one. |

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
`&order=4` to force a recipe onto the day's menu (and into the first customer's paws), or `&recipes=0,2` to fix the
whole menu. The title's CREW row opens the gallery, a contact sheet of every critter and animation.

## Online co-op with a host key

Two to four players over the internet with no server of our own. The host picks ONLINE, hosts a table and reads
out the six-character host key (or sends the invite link the address bar turns into). Guests type the key. Every
browser runs the same simulation in deterministic lockstep and exchanges only one-byte input masks over WebRTC,
with a public MQTT broker used just to find each other. `docs/MULTIPLAYER.md` explains the flow, the mesh, the
input delay and what a screen has to do to stay in sync.

## Documents

- `docs/ART_PRINCIPLES.md` — the portable lessons from making *Aether & Brass*: the pipeline, characters, backdrops,
  UI, determinism and process. Read this first if you want to reuse the approach elsewhere.
- `docs/ART_STYLE.md` — the binding style guide for this game: the Hedgerow Dusk look, the cast table, palettes,
  outline and shading rules, animation bar, self-review checklist.
- `docs/GDD.md` — the design: loop, map, mini-game rules, kitchen stations, results, controls, rebinding, screen contract.
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
