# Foodie Truck

A cozy co-op cooking adventure for one to four players, drawn entirely in code. A customer phones in an order, the
crew of a countryside food truck is missing an ingredient, so they drive out to where it comes from, gather it in a
short mini-game, drive home and cook the dish step by step. The customer eats. The phone rings again.

Seven orders, seven ingredients, seven landmarks, and **a different mini-game at every one of them** — each with its
own verb: catch, fish, collect, pump, fill, creep, pull.

The seven orders are the game's **stages**, pinned up on an order board: pick a customer and their recipe, serve it,
and it comes back stamped with its stars. Serve all seven and the truck closes for the night — the day ends, the
takings are totted up, and that is the end of the game.

The cast are original anthropomorphic countryside animals: **Barley** the Suffolk sheep (the hungry one), **Sorrel**
the field mouse (the chef), **Chicory** the brown hare (the driver) and **Cress** the pond frog (the forager).

The whole game is vanilla JavaScript ES modules and one HTML5 canvas at 640×360, scaled up with nearest-neighbour
filtering. There are no image, audio or font files: every sprite, backdrop, glyph and particle is drawn from code
so the repository stays reviewable in a diff.

## The three parts

| Part | Screen | What happens |
|---|---|---|
| **Order board** | `stage` | The day's seven stages on paper: a customer, their dish and what it needs. Take one off the board to start it; it comes back stamped SERVED with its stars. The last one closes the day. |
| **Overland map** | `map` | The truck drives a 1920×1080 countryside between landmarks. Arriving where a missing ingredient comes from opens its mini-game. Arriving home with everything opens the kitchen. |
| **Mini-games** | `orchard`, `pond`, `coop`, `dairy`, `mill`, `hive`, `garden` | Catch apples under the trees, fish the millpond, collect eggs from the hens, milk the cows on a two-handed rhythm, fill flour sacks under the mill's chutes, creep to the hives and freeze when the bees turn, and pull carrots out of the market garden without grabbing a thistle. Everyone seated plays at once and the party's total counts. |
| **Cooking** | `kitchen`, `results` | Walk the order's steps across the truck's stations (chop, mix, stove, oven, plate), serve, and watch the customer eat for a star rating. |

## Play

```
npm install
npm run dev        # http://localhost:8080
```

**Four players on one couch.** The keyboard seats two, and a gamepad takes the lowest seat nobody is already on
the keys for the moment it is pressed — so four pads fill the truck, or two pads either side of the keyboard pair.
Pick up a controller on the title screen and press A.

| Action | P1 keys | P2 keys | Any seat, on a gamepad |
|---|---|---|---|
| Move | Arrows / W A S D | T F G H | D-pad / left stick |
| ACTION (confirm, catch, cast, chop) | Z or Space | V | A |
| ALT (honk, bite, flip) | X | B | X |
| CANCEL (back) | C or Esc | N | B |
| START (pause, ready) | Enter | 5 | Start |

P3 and P4 are gamepad seats — there is no third nine-key block left on a keyboard worth playing on — and a seat on
a pad reads its own buttons in the hint lines.

Any screen can be opened directly for a look: `index.html?debug=1&skipTo=orchard&critters=0,1,2,3&seed=7`. The title's
CREW row opens the gallery, a contact sheet of every critter and animation.

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
- `docs/GDD.md` — the design: loop, map, mini-game rules, kitchen stations, results, controls, screen contract.
- `docs/ARCHITECTURE.md` — the technical contract: modules, coordinate systems, screen API, test hooks, tooling.
- `docs/MULTIPLAYER.md` — the online session.

## Tooling

```
npm run lint         # node --check on every module, then tsc over the JSDoc types
npm run art-check    # data-tier art invariants (palettes, player-colour contrast, cast table)
npm run nettest      # pure-node protocol, lockstep and trig tests
npm run playtest     # headless Playwright: boots every screen, walks the flow, holds a netplay room
npm run playtest playthrough   # one scenario: the whole run from the title screen to a served dish
npm run capture -- tools/screens map "kitchen:critters=0,1,2,3"   # screenshots of any screen at 2x
node tools/sheet-capture.js tools/screens critter=barley          # critter contact sheets
npm run build        # single-file dist/index.html
```

The GitHub Pages workflow runs lint, art-check, nettest, playtest and build on every push and deploys `main`.

## Licence

MIT.
