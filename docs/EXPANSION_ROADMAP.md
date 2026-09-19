# Foodie Truck — Expansion Roadmap

> **Precedence:** this is a plan, not a rule book. `docs/GDD.md` owns the design of anything that ships; when a
> thing on this list is built, its numbers move into the GDD and its row here is struck through.
>
> `docs/CONTENT_ROADMAP.md` is the previous plan and is now entirely built. It made **one day** wider — sixty-three
> recipes, forty ingredients, twelve landmarks, twelve verbs, a joke in every scene, weather on the road. This one
> makes the **game** longer, and it is deliberately not more content.
>
> **Both sections are now built.** Their numbers live in `docs/GDD.md` — section 3 for the week, section 12 for the
> book — and the GDD wins on any disagreement with what is written below. 8 claims in the first draft of this plan
> were wrong about the game as it stood: it counted a day's six orders as six recipes, promised that the existing
> scenarios would be unmoved, and got the weather odds, the save record's own example, the session length and the
> cost of the wire wrong besides. Each is corrected in place and marked **[corrected]**, so what the plan got wrong
> is on the record rather than quietly rewritten. Where the thing BUILT differs from the thing planned - a page
> drawn more plainly, a menu row in another place, a test that turned out not to be needed - the cell says
> **[built as]** and describes what shipped. 8 of the first and 7 of the second.

The game is wide and flat. A run is one day (`run.ts`: "when the third line has been served the day is done — that
is the game's end"), about half an hour, and then the title screen. Three things follow from that:

- **There is no tomorrow.** Nothing survives a run but key bindings (`engine/bindings.ts`). A player who finishes a
  day has seen the shape of the whole game.
- **Every closed board is identical.** `screens/stage.ts:217` prints `LINES SERVED 3 OF 3 / DISHES 6 /
  STARS 18 OF 18 / TAKINGS 1800` on every run ever played, because nothing can burn (`docs/GDD.md` section 6) so
  stars are always 3. The board is a receipt, not a result.
- **Sixty-three recipes is twenty days of dishes shown three at a time.** [corrected] `RECIPES_PER_DAY` is 3, and
  the `LINES_PER_DAY` × `LINE_LENGTH` = 6 orders a day are that three-recipe menu dealt round — so a run shows
  **three distinct dishes**, under a twentieth of the menu, and has no way to say the rest is there. The first
  draft of this line counted orders as recipes and said "six at a time, under a tenth".

The two extensions below are the spine: **A** gives the game a shape, **B** gives it a reason to come back. Neither
touches the rules the whole game stands on:

- **Three inputs.** Move left and right, tap ACTION, hold ACTION. No timing windows, no beats, no wrong buttons.
- **Nothing to lose.** A day cannot be failed, a week cannot be failed, and nothing below adds a way to.
- **Everything from the seed.** A week is planned once, purely, from the run seed. Nothing reads the wall clock or
  `Math.random`, and nothing read from storage ever reaches `update()`.
- **Append only.** Recipes, ingredients, scenes and cast are named by index on the wire and in the dev jumps, so
  new ones go on the end.
- **One signal colour per scene, drawn in code.** No image files. A new thing is a drawing routine.

---

## A. The Week

> **Done.** Built as described, with one correction and one change of approach, both marked below, and the test
> row of its cost table rewritten to what the work actually took. The numbers are in `docs/GDD.md` section 3; the
> day shapes are `game/run.ts DAY_SHAPES` and the save record is `game/week.ts`.

A run becomes **five days** instead of one, resumable between them. `dayComplete()` stops being the end of the
game; `weekComplete()` becomes it. The closed board stops being terminal and becomes the hinge between days.

### The week is planned once, purely

`planWeek(seed) -> DayPlan[]` replaces `planDay(seed)` as the entry point and calls it five times on its own
stream. The whole week is laid out **up front**, before day 1 opens, for two reasons:

1. **Day 5 can look back.** The fête's menu is drawn from the recipes days 1–4 actually served, which is only
   possible if those days are already on the table. A pure function that plans all five can do it; a function that
   plans day N when day N opens cannot, without reading play state.
2. **Resuming is trivial.** `planWeek(seed)[day]` rebuilds any day of any week from two integers. The save record
   below is small precisely because the plan is never saved — it is re-derived.

`planDay` keeps its signature and its dev jumps (`?order=`, `?recipes=`); it gains a shape argument defaulting to
the ordinary day, so calling it with two arguments still lays out exactly today's day.

**[corrected]** The first draft claimed "a bare `?skipTo=` still starts on day 1 of a fresh week, so every existing
scenario is unmoved". That was wrong, and in exactly the way the day shapes make obvious: day 1 is **not** the
shape that shipped, so a bare `?skipTo=stage` now opens a two-queue, two-recipe, twistless board and four
scenarios that asserted the ordinary day's numbers failed. The fix was not to reshape day 1 but to make the
scenarios read the shape they are standing in (`stage`, `stageClosing`, `twists`, `playthrough`), plus a `?day=N`
dev jump so a scenario can open any day of the week — which is what `twists` now uses to find a day that deals
them.

### The days have shapes, not just seeds

One frozen table, `DAY_SHAPES`, in the style of `TWISTS` and `CROSSING_SPOTS`. Each row is a day's *shape*: how
many lines form, how long each is, how many recipes are on the menu, whether twists are dealt, and what the
weather does.

| Day | Name | Lines | Menu | Twists | Weather | Dishes | Why |
|---|---|---|---|---|---|---|---|
| 1 | **OPENING DAY** | 2 × 2 | 2 recipes | off | clear | 4 | The gentle one. A short list, a short drive, no twist to read. A child's first day is the tutorial and is never labelled one. |
| 2 | — | 3 × 2 | 3 recipes | on | rolled | 6 | Today's day, exactly as it ships now. |
| 3 | **MARKET DAY** | 3 × 2 | **2 recipes** | on | rolled | 6 | The village wants the same things: a short shopping list with deep amounts, so the day is two or three long gathers instead of eight short ones. The same six orders feel completely different. |
| 4 | — | 3 × 2 | 3 recipes | on | **drizzle or fog** | 6 | The weather day. Fog makes the compass and the lanterns do the steering; a drizzle day puts the mud patch on the lane. Both already exist and each fires one day in five by chance (so two in five are not clear) — here a wet day is guaranteed once a week. [corrected: the first draft said the pair fired one day in five.] |
| 5 | **THE FÊTE** | 2, 2, 2, **3** | **the week's** | on | clear | 9 | Four lines, one of them three deep, and the menu is drawn from what this week actually cooked. The last customer of the week orders something you made on Monday. |

**Thirty-one dishes a week**, against six today — and **ten different recipes a week against three**, since a
day's orders are its menu dealt round and THE FETE re-cooks what the week already served. [corrected] The first
draft said "two weeks is most of the sixty-three-recipe book", which counted servings as recipes: a fortnight is
under a third of it, and the whole book is six or seven weeks of trading. That is a longer collection curve than
the draft claimed, and a better one — it is what section B is for.

A shape is data, so a sixth day or a different week is a row, not a rewrite. `DAYS_PER_WEEK` is
`DAY_SHAPES.length`.

### The board is the hinge

`screens/stage.ts` already draws the board open and closed, and the closed one already slams a SERVED stamp and
plays `day_done`. Three changes:

| Where | Change |
|---|---|
| **Closed board** | The rows stop lying. `LINES SERVED 3 OF 3 / DISHES 6 / STARS 18 OF 18 / TAKINGS 1800` becomes the day's line, the **week strip** under it — five small day tickets, the ones done stamped with their stars, today's landing as you watch — and the week's running takings. On days 1–4 the one press left is `NEXT DAY`, not `TITLE`. |
| **Open board** | Headed with the day: `DAY 2 OF 5` and its name where it has one (`MARKET DAY`, `THE FÊTE`). Everything else about it is unchanged. |
| **Day 5 closed** | The week's board: five tickets all stamped, the week's stars and takings, and the one press to the title. `closing` plays as it does now. The only new music cue the week needs is nothing — `board` opens each day, `closing` shuts each night. |

### Resuming, and the save record

A week is about two and a half hours of play across five sittings (this document's own half-hour day, five
times), so it has to be resumable — and the elegant part is that at a day boundary the run holds nothing that is
not derivable. The whole record is:

```json
{ "v": 1, "seed": 481920, "day": 2, "critters": [0, 3], "stars": [12, 18], "takings": 3000 }
```

[corrected] The first draft wrote `"stars": [12, 17], "takings": 2900`. Seventeen is unreachable: day 2 is a
six-dish day and nothing can burn, so the only total it can bank is eighteen — and the takings follow from the
stars at a hundred each, so they were wrong by the same hundred.

Written **at the closed board only** — one write, at a screen boundary, off the simulation path, exactly as
`engine/bindings.ts` writes (`docs/MULTIPLAYER.md`: no `localStorage` inside `update()`). Key
`foodie-truck.week`, same fragile-by-design load as the bindings: a private window, a blocked origin or a
half-written record falls back to a fresh week and never throws.

The title's `PLAY` row becomes **`CONTINUE` when a week is in progress** and `PLAY` when it is not; CONTINUE skips
the select screen and reseats the saved party. The record is cleared when day 5 closes — what survives a finished
week is the book, which is section B.

### What carries between days, and what does not

Almost nothing, and that is the design, not a shortcut: the day board's promise is that the paper in front of you
is the whole day, and an inventory carried in from yesterday breaks it.

- **Carries:** the week's stars per day, the week's takings, the party.
- **Does not carry:** the pantry. Every day opens empty. The shopping list on the board is what today needs.
- **Does not exist:** money you can run out of, a day you can fail, a customer who leaves. Nothing to lose is the
  game.

**Not doing: leftovers.** Anything gathered but uncooked carrying into tomorrow as a head start is tempting and
netplay-safe (every peer shares the pantry), but it makes today's board depend on yesterday's play, and the board
is the one thing in the game that is always true at a glance. If it is ever wanted, it wants its own line on the
board — `FROM YESTERDAY` — and not a silent head start.

### Netplay

The week costs **one byte on the wire and a version bump**, and nothing else:

- `net/protocol.ts encodeStart` gains `day` after `scene`; `decodeStart` reads it. `PROTOCOL_VERSION` → **3**, with
  the reason written next to it as version 2's is ("a START packet's day index is a different day's plan on a peer
  that ignores it").
- `net/checksum.ts` hashes `run.day` beside `run.seed` (and the week's banked stars). [corrected] The first draft
  said this catches a peer on the wrong day "rather than when the lines disagree" — but the canary already walks
  the whole plan, so a wrong day would have tripped it anyway. What `run.day` actually buys is that the mismatch
  is *named*: a one-field divergence on the day index instead of an unexplained whole-plan disagreement.
- **Days advance from simulation state.** `NEXT DAY` is a confirm inside `update()` driving `game.replace(...)`,
  which is how every other scene change already works, so peers roll over together on the same frame.
- A host who resumes a week sends `day` in START; guests play the host's week and save nothing. One player owns
  the week, which is the same rule the host key already implies.

### Cost

| Piece | Touches |
|---|---|
| `planWeek`, `DAY_SHAPES`, `run.day`, `weekComplete()` | `game/run.ts`, `game/game.ts` types |
| The week strip, `NEXT DAY`, the day heading | `game/screens/stage.ts` |
| The save record | a new `game/week.ts` (the bindings' shape), `main.ts` hook |
| `CONTINUE` | `game/screens/title.ts` |
| The wire | `net/protocol.ts` (the byte, `PROTOCOL_VERSION` 3), **`net/session.ts`** (`StartParams`, `beginMatch`, `applyStart`, the lobby), `net/checksum.ts`, `tools/nettest.js`, `docs/MULTIPLAYER.md` [corrected: the first draft left `session.ts` out, and it owns the START parameters end to end] |
| Tests | **[built as]** `week`, `weekRollover`, `weekResume`, `weekOnlineGuard` and `weekFresh` scenarios, `netweek` for the wire, `stageWeekEnd` for the last night, plus `stage`, `stageClosing`, `twists`, `playthrough` and the map's `weather` all taught to read the shape of the day they stand in — and screenshots of the strip and the fête board. Not golden frames: `tools/golden.js` fingerprints the art and engine layer, which none of this touches, and it came out identical. |
| Docs | `docs/GDD.md` section 3 rewritten around the week; section 10's `stage` entry |

---

## B. The Recipe Book

> **Done**, but not in every particular: the table below was the plan, and three of its cells describe a page
> richer than the one that shipped. They are corrected in place and marked **[built as]**. `docs/GDD.md` section
> 12 describes what actually exists and wins on any disagreement. The store is `game/book.ts`, the screen is
> `game/screens/book.ts`, and the invariant is enforced by `tools/check.js` and proved from outside by the
> `bookInvariant` playtest scenario. The "no new art" claim held: `art/dishes.ts` has a distinct drawing for all
> sixty-three recipes, checked rather than assumed.

A book that **records and never unlocks**. Sixty-three dishes, forty ingredients, twelve landmarks and three
diners are already in the game and a player has no way to see that they exist. The book is where the day's real
numbers live, and it is the reason to open the game tomorrow.

### The invariant

> **The book is written by the game and read only by the book screen. Nothing the book holds ever reaches
> `planWeek`, `planDay`, `gatherTarget`, or any screen's `update()`.**

This is the whole design, and it is what makes a persistent file safe in a lockstep game. Two peers with different
books must play byte-identical days, and they do, because no code path exists from the book into the simulation. An
unlock — a recipe you have to earn, a landmark that opens — would desync two players the instant their saves
differed, and is the one thing this section must never grow into.

The rule gets a check, in the spirit of `tools/art-check.js` being the executable half of the art style: a rule in
`tools/check.js` that fails if any module but `game/screens/book.ts` imports the book's `read()`. Recording is
exported separately and is importable anywhere; reading is not.

### What it holds

One record under `foodie-truck.book`, banked in a single `recordDay(run)` call at the closed board — the same
write, at the same screen boundary, as the week's.

| Page | Records | Drawn as |
|---|---|---|
| **The dishes** | Per recipe: times cooked, best stars, the day it was first served | A card per recipe in `ORDERS` order, four across and three down. A dish you have cooked is its own `art/dishes.ts` picture **inked in**, named, **[built as]** with its tally and best rating under it and the day it was first served — not its ingredients, which no card draws. One you have not is the same card **in pencil**: the picture faded back to a shape, its name blanked to `- - -`. No new art — every dish drawing already exists. |
| **The diners** | Per `DINERS` id: times fed, the dish they have ordered most | **[built as]** their NAME from `content/critters/customers.ts` with their tally, as text rows on a slate. The plan said a portrait; the built page draws none, and three busts at this size would have been smaller than the name beside them. |
| **The larder** | Per ingredient: times gathered | The forty glyphs from `art/food.ts` in a grid, greyed until gathered once. |
| **The road** | Per landmark: visits | Twelve rows, the map's own names. |
| **The strap** | **[built as]** recipes cooked out of the whole menu | `23 OF 63 COOKED` is the number the closed board has never been able to print. It counts DISTINCT recipes ever cooked, not servings; the record also keeps days of trading and weeks finished, but the screen does not print them. |

The counters saturate rather than overflow, and an unknown recipe id in a stale record is dropped on load rather
than throwing: a book written by a build with sixty-three recipes must load on a build with seventy, and the
reverse.

### The screen

`book` — the `gallery`'s sibling, and the gallery is the model: a screen with no simulation, left/right through
pages, up/down through rows, CANCEL out, `title` music. It is reachable from the title and from nowhere else, so
it can never be open while a run is live.

**The title menu is the one layout problem.** `ROWS` was `PLAY / ONLINE / CONTROLS / CREW / SOURCE` and the box
was sized for five. The week adds `CONTINUE` and the book adds `BOOK`, which is seven. `CONTINUE` replaces `PLAY`
in place — they are the same row in two states — and `BOOK` joins the list, which makes six.

**Built as:** `PLAY`/`CONTINUE`, `ONLINE`, `BOOK`, `CONTROLS`, `CREW`, `SOURCE` — the book sits third, between
ONLINE and CONTROLS, and not beside CREW as the line above first proposed. The A-frame grew from 104 px to 122 and
moved up 14, because six rows at the menu's 14 px pitch do not clear 104 and a row clipped by its own frame is
worse than a slightly taller A-frame. The legs land within 4 px of where they did, and the board still starts
where the crew lineup stops.

### Cost

| Piece | Touches |
|---|---|
| The store, `recordDay`, the load/save | a new `game/book.ts` |
| The one write | `game/screens/stage.ts` (one call, beside the week's) |
| The screen | a new `game/screens/book.ts`, `game/game.ts` screen table, `SCREEN_MUSIC` (`title`) |
| The menu row | `game/screens/title.ts` |
| The invariant | a rule in `tools/check.js` |
| Tests | **[built as]** `book` (the screen, its pages, pencil against ink), `bookRecords` (a day banked, and banked once) and `bookInvariant` (a full book and an empty one lay out the same day), plus screenshots. No golden frame, for the reason above. |
| Docs | a new `docs/GDD.md` section 12, and the invariant restated in `docs/MULTIPLAYER.md` beside the `localStorage` rule |

**Not doing: anything the book gates.** No recipe unlocked by cooking, no landmark opened by visiting, no cast
member earned. See the invariant.

**Not doing: cloud save, or more than one slot.** One week in progress and one book. A second slot is a menu
nobody asked for.

---

## C. Order of work

> **Done.** Every row is built. What follows is the order it was actually done in, which was the order below.

Cheapest and most load-bearing first. Rows 1–3 ship a playable week with no save and no book, which is a complete
change on its own; rows 4–5 make it resumable; rows 6–8 are the book.

| # | Work | Touches | Rough size |
|---|---|---|---|
| 1 | `run.day`, `planWeek`, `DAY_SHAPES`, `weekComplete()` — the spine, no UI | `game/run.ts` | Half a session; the day shapes are data |
| 2 | The closed board's `NEXT DAY` and the week strip; the open board's day heading | `game/screens/stage.ts` | A session, mostly drawing |
| 3 | The week scenarios, and retrofitting the day-blind ones | `tools/scenarios/` | Longer than a short session: five scenarios had to learn which day they stand in |
| 4 | The save record and `CONTINUE` | `game/week.ts`, `game/screens/title.ts`, `main.ts` | A session |
| 5 | The wire: the `day` byte, `PROTOCOL_VERSION` 3, the checksum field | `net/protocol.ts`, `net/session.ts`, `net/checksum.ts`, `tools/nettest.js` | Small, and the nettest covers it |
| 6 | The book's store and `recordDay` | `game/book.ts`, one call in `stage.ts` | A session |
| 7 | The book screen | `game/screens/book.ts`, `title.ts`, the menu layout | The biggest drawing job on the list; the dish pictures exist |
| 8 | The invariant's check rule and the book scenarios | `tools/check.js`, `tools/scenarios/` | A short session |

Every step keeps `npm run check` green: the typecheck, the class-fields and lib checks, the art check, the net
test and the golden fingerprint. **[built as]** the golden did NOT need a new baseline: `tools/golden.js` hashes
the art and engine layer's drawn output, and none of this work touches a rig, a pose or a palette — it came back
`8 subjects identical`, which is the evidence that a week and a book added no behaviour to the shared layer.

Rows 1–3 are worth shipping as one pull request: a week that always starts on Monday is a better game than a
single day, and it is testable without a byte of persistence.
