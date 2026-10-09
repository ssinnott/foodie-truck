// Playtest scenarios for the ON-SCREEN CONTROLS (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   touch - a phone and nothing else: no key, no pad, no virtual seat anywhere in this scenario. A thumb opens
//        PLAY from the title, walks the critter cursor with the stick, stamps READY, and the day board opens - the
//        same walk tools/scenarios/pads.js does on a controller, because the question the feature has to answer is
//        not "does a mask arrive" but "can somebody holding a phone actually play this". The middle of it is what
//        the floating stick changed: it is wherever the thumb lands, a thumb resting where it landed presses
//        nothing, a thumb that wanders as far as it likes keeps pressing (the fixed d-pad let go at its edge),
//        turning round is one ring's width of travel, a button stays held while the thumb on it rolls, and GO
//        owns its whole corner. Then: ALT only where it is read, and a keyboard taking the screen back.
//
//   touchphone - the same thing on a page that IS a phone: a landscape viewport that matches
//        `(hover: none) and (pointer: coarse)`, real contacts from page.touchscreen and real PointerEvents, and a
//        canvas at a scale that is not 1:1. Everything above drives the layer through its test hook; this one goes
//        in through the DOM listeners and through toInternal, including the two dark bands either side of the
//        canvas, which is where a phone's thumbs rest and which the old controls could not hear at all.
//
//   touchupright - a phone held UPRIGHT. There used to be a notice telling it to turn sideways, which a phone with
//        its rotation lock on could never get past; now the game itself is drawn on its side, filling the phone's
//        width, and everything a thumb does is measured through the turn: GO where it is drawn, the stick steering
//        RIGHT when dragged toward the player's right (down the upright screen), the bands above and below the
//        turned canvas standing in for the ones beside it. Then the phone turns with its rotation unlocked, the page
//        goes landscape, and the same game is the right way up under the same thumbs.
//
//   touchlaptop - a page with a fine pointer gets no controls until a finger actually touches it, and then does.
//
//   touchlinks - the two listeners that now share the page. engine/links.ts opens a tab when a drawn address is
//        clicked, and a tap synthesizes a click, so the thumb controls have to be able to say "that one was mine":
//        BACK opening a browser tab mid-game is not something a player can undo from a phone. The repository
//        address lies on the stick's side of the glass, so it is checked from both ends: a tap on it still opens
//        it, and a thumb that steered from on top of it does not.
//
//   touchtyping - the room code, which is the one thing on a phone that needs letters. Driven through the real
//        lobby, because the question is not whether a code arrives but whether somebody holding a phone can JOIN
//        A TABLE at all: a thumb walks the menu, the off-screen field engine/touch.js raises is fed the way a
//        soft keyboard feeds one (an input event, no keydown at all), and the code spells itself on the ticket.
//        The last beat is the way out: a soft keyboard has no ESC, so the X button has to be one.
import { withPage, assert } from '../playtest.js';

/** Bit i of a mask is ACTIONS[i] (engine/actions.js). */
const LEFT = 1, RIGHT = 2, UP = 4, DOWN = 8, ACTION = 16, ALT = 32, CANCEL = 64;

/** The centre of a named button, from the layout the game itself hit-tests against. */
function buttonAt(layout, action) { return layout.buttons.find((b) => b.action === action); }

/** Press a point, hold it for `hold` steps, let go, and let the release settle. */
async function tap(api, point, hold = 2, release = 4) {
  await api.touch([point]);
  await api.step(hold);
  await api.touch([]);
  await api.step(release);
}
/** A thumb landing at `from`, dragged by (dx, dy), held for `hold` steps, then lifted: one flick of the stick. */
async function flick(api, from, dx, dy, hold = 2, release = 4) {
  await api.touch([from]);
  await api.step(1);
  await api.touch([{ x: from.x + dx, y: from.y + dy }]);
  await api.step(hold);
  await api.touch([]);
  await api.step(release);
}
/** The mask seat 0 holds right now. */
async function maskNow(api) { return (await api.inputState()).mask; }

/** A landscape phone: what makes the media query match, and what makes page.touchscreen work. */
const PHONE = { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };
/** The same phone held upright, the way most of them are picked up. */
const UPRIGHT = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };

/** A game-space point in the page's own client coordinates, through the canvas as it is actually laid out. */
function clientOf(page, gx, gy) {
  return page.evaluate(([x, y]) => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { x: r.left + x * r.width / 640, y: r.top + y * r.height / 360 };
  }, [gx, gy]);
}
/** clientOf, for the canvas drawn on its side: the game's x runs DOWN the screen and its y runs right to left. */
function clientOfTurned(page, gx, gy) {
  return page.evaluate(([x, y]) => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { x: r.right - y * r.width / 360, y: r.top + x * r.height / 640 };
  }, [gx, gy]);
}
/**
 * A contact at a client point: a real PointerEvent through the real listeners. `on` is what it lands on - the
 * canvas, or 'body' for the bare page either side of it - and `id` lets two fingers be down at once.
 */
function pointer(page, type, at, { id = 1, primary = true, on = 'game' } = {}) {
  return page.evaluate(([t, x, y, pid, prim, target]) => {
    const el = target === 'body' ? document.body : document.getElementById('game');
    el.dispatchEvent(new PointerEvent(t, {
      pointerId: pid, pointerType: 'touch', isPrimary: prim, bubbles: true, clientX: x, clientY: y,
    }));
  }, [type, at.x, at.y, id, primary, on]);
}

export const SCENARIOS = {
  async touch(server) {
    await withPage(server, 'skipTo=title', async (api, page) => {
      await api.step(5);
      assert((await api.screen()) === 'title', 'the title comes up');

      // ---- a phone with nothing held ----
      const before = await api.inputState();
      assert(before.touchOn === false, 'a desktop page has no on-screen controls');
      await api.touch([]);                                  // a touch device, resting: the overlay is up, nothing is pressed
      await api.step(2);
      const idle = await api.inputState();
      assert(idle.touchOn === true, 'a touch device gets the overlay');
      assert(idle.mask === 0, `and a hand resting off the glass presses nothing (mask ${idle.mask})`);
      assert((await api.screen()) === 'title', 'so the title is still waiting');
      await api.shot('title-touch');                        // the stick at rest, GO, X and MENU over the lineup

      // ---- a thumb opens the game ----
      const layout = await api.touchLayout(), stick = layout.stick;
      const go = buttonAt(layout, 'action');
      await tap(api, { x: go.cx, y: go.cy });
      assert((await api.screen()) === 'select', `GO opened PLAY (now on ${await api.screen()})`);
      const seated = await api.inputState();
      assert(seated.device === 'touch', `and seat 1 knows what it is being driven by (${seated.device})`);

      // ---- the stick is wherever the thumb lands ----
      const push = stick.dead * 2.5;
      const s0 = await api.summary();
      assert(s0.top.seats[0].critter === 'barley', `the seat opens on the first card (${s0.top.seats[0].critter})`);
      await flick(api, { x: 150, y: 240 }, push, 0);
      assert((await api.summary()).top.seats[0].critter === 'sorrel', 'a thumb landing on the left and pushed right moved the cursor');
      await flick(api, { x: 30, y: 60 }, -push, 0);
      assert((await api.summary()).top.seats[0].critter === 'barley', 'and one landing somewhere else entirely, pushed left, moved it back');

      // ---- what a thumb on a stick does ----
      const home = { x: 160, y: 250 };
      await api.touch([home]);
      await api.step(2);
      assert((await maskNow(api)) === 0, 'a thumb resting where it landed presses nothing');
      await api.touch([{ x: home.x + stick.dead - 2, y: home.y }]);
      await api.step(2);
      assert((await maskNow(api)) === 0, 'nor one that has only shifted inside the still middle');
      await api.touch([{ x: home.x + push, y: home.y - push }]);
      await api.step(2);
      const diag = await maskNow(api);
      assert((diag & RIGHT) !== 0 && (diag & UP) !== 0, `pushed up and right it is two directions (mask ${diag})`);
      assert((diag & (LEFT | DOWN)) === 0, 'and not the two it is nowhere near');
      // the edge the fixed d-pad had: a thumb that wanders as far as it likes is still pressing
      await api.touch([{ x: home.x + 260, y: home.y + 20 }]);
      await api.step(2);
      assert((await maskNow(api)) === RIGHT, `a thumb dragged 260 px right is still holding RIGHT (mask ${await maskNow(api)})`);
      // ...and turning round is one ring's width, not all the way back past where it landed
      await api.touch([{ x: home.x + 260 - stick.radius - push, y: home.y + 20 }]);
      await api.step(2);
      assert((await maskNow(api)) === LEFT, `coming back a ring's width from out there is LEFT already (mask ${await maskNow(api)})`);
      await api.touch([]);
      await api.step(2);
      assert((await maskNow(api)) === 0, 'and lifting it lets go');
      await api.touch([{ x: 420, y: 170 }]);                // the buttons' side, but on none of them
      await api.step(2);
      assert((await maskNow(api)) === 0, 'a tap on the scene on the buttons\' side presses nothing');
      await api.touch([]);
      await api.step(2);
      assert((await summaryOf(api)).ready === false, 'none of which stamped anything while the cursor was being walked');

      // ---- a stamp, and the day opens ----
      const at = (await api.summary()).top.seats[0].critter;
      await tap(api, { x: go.cx, y: go.cy });
      const s2 = await api.summary();
      assert(s2.top.seats[0].ready === true, 'GO stamps READY on the card');
      assert(s2.top.seats[0].critter === at, 'and stamps the card the cursor was on');
      await api.shot('select-touch');                       // the overlay over the lineup, the card stamped
      await api.step(90);
      const s3 = await api.summary();
      assert(s3.screen === 'stage', `a stamped seat opens the day board (now on ${s3.screen})`);
      assert(s3.run && s3.run.party.length === 1, `with a party of one (${JSON.stringify(s3.run && s3.run.party)})`);

      // ---- ALT is offered where it does something, and nowhere else ----
      const alt = buttonAt(layout, 'alt');
      await api.touch([{ x: alt.cx, y: alt.cy }]);
      await api.step(2);
      assert((await maskNow(api)) === 0, 'the day board has no use for ALT, so there is nothing there to press');
      await api.touch([]);
      await api.step(2);
      await api.goto('map');
      await api.step(4);
      await api.touch([{ x: alt.cx, y: alt.cy }]);
      await api.step(2);
      assert(((await maskNow(api)) & ALT) !== 0, 'the road, which honks with it, does offer it');
      await api.touch([]);
      await api.step(2);
      const hint = await page.evaluate(() => window.__game.game.screen.hint);
      assert(/HONK: ALT/.test(hint), `and its hint names the button the horn is on - not X, which is BACK here (${hint})`);

      // ---- two thumbs at once: a direction held while GO is pressed, which is how every mini-game is played ----
      // (on the road, which reads no GO: here a held GO is a mask to look at and nothing else)
      await api.touch([home, { x: go.cx, y: go.cy }]);
      await api.step(1);
      await api.touch([{ x: home.x + push, y: home.y }, { x: go.cx, y: go.cy }]);
      await api.step(2);
      const both = await maskNow(api);
      assert((both & RIGHT) !== 0 && (both & ACTION) !== 0, `a thumb each side holds a direction AND the button (mask ${both})`);
      // a button is held by the thumb that pressed it, wherever that thumb rolls: HOLD GO must not let go mid-hold
      await api.touch([{ x: home.x + push, y: home.y }, { x: go.cx - go.hit - 30, y: go.cy - 50 }]);
      await api.step(2);
      assert(((await maskNow(api)) & ACTION) !== 0, 'GO stays held when the thumb on it slides right off it');
      await api.touch([]);
      await api.step(4);
      assert((await maskNow(api)) === 0, 'until that thumb lifts');

      // ---- GO is the whole corner, and its circle is wider than its face ----
      await api.touch([{ x: go.cx + go.r + 6, y: go.cy }]);
      await api.step(2);
      assert(((await maskNow(api)) & ACTION) !== 0, 'a thumb just past the edge of GO\'s face still presses GO');
      await api.touch([]);
      await api.step(2);
      await api.touch([{ x: 638, y: 358 }]);
      await api.step(2);
      assert(((await maskNow(api)) & ACTION) !== 0, 'and so does one down in the very corner, far outside its circle');
      await api.touch([]);
      await api.step(4);

      await api.touch([{ x: 120, y: 200 }]);
      await api.step(1);
      await api.touch([{ x: 120 + push, y: 200 - push }]);
      await api.step(6);
      await api.shot('map-touch');                          // the stick steering north-east, ALT over GO
      await api.touch([]);
      await api.step(2);

      // ---- a keyboard takes the screen back, and the next touch takes it again ----
      await page.keyboard.down('KeyZ');
      await api.step(2);
      await page.keyboard.up('KeyZ');
      await api.step(2);
      const keyed = await api.inputState();
      assert(keyed.touchOn === false, 'a key press stands the overlay down');
      assert(keyed.device === 'keyboard', `and the seat is on the keyboard now (${keyed.device})`);
      await api.touch([{ x: go.cx, y: go.cy }]);
      await api.step(2);
      const back = await api.inputState();
      assert(back.touchOn === true, 'and the next touch brings it back');
      assert((back.mask & ACTION) !== 0, 'pressing as it returns');
      await api.touch(null);
      await api.step(2);
      assert((await api.inputState()).touchOn === false, 'letting go of the glass leaves a desktop page as it was');
    });
  },

  async touchtyping(server) {
    await withPage(server, 'skipTo=title', async (api, page) => {
      await api.step(5);
      await api.touch([]);
      await api.step(2);
      await api.goto('lobby');                              // the room flow, not opened for us: a thumb has to walk in
      await api.step(4);
      assert((await api.summary()).top.phase === 'role', 'the lobby opens on HOST or JOIN');

      // ---- a thumb walks to JOIN A TABLE and opens it ----
      const layout = await api.touchLayout(), go = buttonAt(layout, 'action');
      await flick(api, { x: 120, y: 200 }, 0, layout.stick.dead * 2.5);
      await tap(api, { x: go.cx, y: go.cy });
      const asking = await api.summary();
      assert(asking.top.phase === 'code', `GO on JOIN A TABLE asks for a code (phase ${asking.top.phase})`);
      assert(asking.top.typing === true, 'and says so, which is what raises the keyboard');
      const up = await page.evaluate(() => {
        const el = document.getElementById('softkeys');
        return { there: !!el, focused: el === document.activeElement, value: el ? el.value : null };
      });
      assert(up.there, 'a screen that is reading text raises a field a phone can type into');
      assert(up.focused, 'and focuses it, which is what opens the keyboard');
      await api.shot('lobby-touch-typing');                 // the code ticket, and the strip that says to tap
      const hint = await page.evaluate(() => window.__game.game.screen.codeHintTouch);
      assert(/RETURN: JOIN/.test(hint) && /X: BACK/.test(hint), `and the hint names the keys a phone HAS (${hint})`);

      // ---- what a soft keyboard sends: an input event, and on most phones no keydown at all ----
      await page.evaluate(() => {
        const el = document.getElementById('softkeys');
        el.value = 'QZ';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await api.step(1);
      const typed = (await api.inputState()).typed;
      assert(typed.join() === 'KeyQ,KeyZ', `what was typed arrives as the codes the lobby reads (${typed.join()})`);
      assert((await api.summary()).top.code === 'QZ', 'and spells itself on the ticket');
      await api.step(1);
      assert((await api.inputState()).typed.length === 0, 'the codes are handed over once, not every step after');

      await page.evaluate(() => {
        const el = document.getElementById('softkeys');
        el.value = 'Q';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await api.step(1);
      assert((await api.summary()).top.code === 'Q', 'a character taken back off the field is a BACKSPACE on the ticket');

      // ---- the way out: a soft keyboard has no ESC, so X is one ----
      const x = buttonAt(layout, 'cancel');
      await api.touch([{ x: x.cx, y: x.cy }]);
      await api.step(1);
      const esc = await api.inputState();
      assert(esc.typed.join() === 'Escape', `X spells ESCAPE while a screen is typing (${esc.typed.join()})`);
      assert((esc.mask & CANCEL) === 0, 'and does not also press CANCEL on the screen underneath');
      await api.touch([]);
      await api.step(2);
      const out = await api.summary();
      assert(out.top.phase === 'role' && out.top.typing === false, `which backs out to HOST or JOIN (phase ${out.top.phase})`);
      const down = await page.evaluate(() => {
        const el = document.getElementById('softkeys');
        return { focused: el === document.activeElement, value: el.value };
      });
      assert(!down.focused && down.value === '', 'and the keyboard goes away with the screen that asked for it');
      await api.touch(null);
    });
  },

  async touchlinks(server) {
    await withPage(server, 'skipTo=title', async (api, page) => {
      await api.step(5);
      const layout = await api.touchLayout();
      assert((await api.inputState()).touchOn === true, 'a phone has the controls up over the title');
      // Every tab this page would open, caught rather than taken: window.open returning null is a blocked popup
      // as far as engine/links.ts is concerned, which is a case it already handles.
      await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
      const opened = () => page.evaluate(() => window.__opened.slice());
      const tapAt = async (gx, gy) => {
        const at = await clientOf(page, gx, gy);
        await page.touchscreen.tap(at.x, at.y);
        await api.step(2);
      };
      // The addresses claim their rects in the title's enter(); this is the same line ui.hintSpans lays out.
      const zones = await page.evaluate(async () => {
        const ui = await import('/src/game/ui.ts');
        const c = await import('/src/constants.ts');
        return ui.hintSpans([c.REPO_LABEL, c.KOFI_LABEL], 346);
      });
      const [repo, kofi] = zones;

      // ---- the guard does not block what it is not for ----
      await tapAt(kofi.x + kofi.w / 2, kofi.y + kofi.h / 2);
      assert((await opened()).length === 1, `a tap on the Ko-fi address opens it with the controls up (${JSON.stringify(await opened())})`);
      assert(repo.x < layout.stick.zoneX, 'the repository address starts on the stick\'s side of the glass');
      await tapAt(repo.x + 20, repo.y + repo.h / 2);
      assert((await opened()).length === 2, 'and a tap on it there still opens it: a thumb that only rested pressed nothing');

      // ---- and a tap that lands on a control is a press, not a click on the page under it ----
      // The title is re-entered before each one because some of these buttons are a confirm: they open PLAY, and
      // the screen that leaves takes its addresses with it (title.ts exit -> clearZones).
      const before = (await opened()).length;
      for (const b of layout.buttons) {
        if (b.action === 'alt') continue;                   // not on offer on the title: nothing there to press
        await api.goto('title');
        await api.step(4);
        await tapAt(b.cx, b.cy);
      }
      await api.goto('title');
      await api.step(4);
      await tapAt(layout.stick.restX, layout.stick.restY);  // the stick at rest: a tap there presses nothing, and opens nothing
      // A thumb that STEERED from on top of the repository address, and a browser that makes a click of the short
      // drag anyway: the click belongs to the stick, and no tab opens.
      const from = await clientOf(page, repo.x + 20, repo.y + repo.h / 2);
      await pointer(page, 'pointerdown', from);
      await pointer(page, 'pointermove', { x: from.x, y: from.y - 3 * layout.stick.dead });
      await api.step(2);
      assert(((await maskNow(api)) & UP) !== 0, 'a thumb landing on the address and pushed up is steering');
      await pointer(page, 'pointerup', { x: from.x, y: from.y - 3 * layout.stick.dead });
      await page.evaluate(([x, y]) => {
        document.getElementById('game').dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, clientX: x, clientY: y }));
      }, [from.x, from.y]);
      await api.step(2);
      assert((await opened()).length === before, `no thumb control opens a tab, the stick included (${JSON.stringify((await opened()).slice(before))})`);

      // What keeps X and the address beside it apart is a few pixels of screen, which is why the check above exists.
      const x = buttonAt(layout, 'cancel');
      assert(x.cx - x.hit > kofi.x + kofi.w, `X's hit circle clears the end of the address it sits beside (${x.cx - x.hit} vs ${kofi.x + kofi.w})`);

      // ---- the address still opens after all that ----
      await api.goto('title');
      await api.step(4);
      await tapAt(kofi.x + kofi.w / 2, kofi.y + kofi.h / 2);
      assert((await opened()).length === before + 1, 'and the address beside them still opens');
    }, PHONE);
  },

  async touchupright(server) {
    await withPage(server, 'skipTo=title', async (api, page) => {
      await api.step(5);

      // ---- no notice: the game itself, on its side ----
      assert(await page.evaluate(() => !document.getElementById('rotate')), 'there is no "turn your device" notice left in the page');
      const look = await page.evaluate(() => {
        const el = document.getElementById('game'), r = el.getBoundingClientRect();
        return { t: getComputedStyle(el).transform, left: r.left, top: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
      });
      const m = /^matrix\(([^)]*)\)$/.exec(look.t);
      const [a, b, c, d] = m ? m[1].split(',').map(Number) : [1, 0, 0, 1];
      assert(!!m && Math.abs(a) < 1e-6 && b === 1 && c === -1 && Math.abs(d) < 1e-6, `held upright, the game is drawn on its side: a quarter turn clockwise (${look.t})`);
      assert(Math.abs(look.h / look.w - 16 / 9) < 0.01, `with its long side down the screen (${look.w.toFixed(0)} x ${look.h.toFixed(0)})`);
      assert(Math.abs(look.w - look.vw) < 1 && look.top >= 0 && look.top + look.h <= look.vh + 0.5,
        `as wide as the phone, and all of it on the screen (${look.w.toFixed(0)} x ${look.h.toFixed(0)} at ${look.top.toFixed(0)}, in ${look.vw} x ${look.vh})`);
      assert((await api.inputState()).touchOn === true, 'with the thumb controls up');
      await api.shot('upright-title');                      // the title on its side, TAP GO and all

      // ---- a real tap where GO is drawn on the turned game ----
      const layout = await api.touchLayout(), go = buttonAt(layout, 'action'), x = buttonAt(layout, 'cancel');
      const goAt = await clientOfTurned(page, go.cx, go.cy);
      await page.touchscreen.tap(goAt.x, goAt.y);
      await api.step(2);
      assert((await api.screen()) === 'select', `a tap on GO, where the turned game draws it, opens PLAY (now on ${await api.screen()})`);

      // ---- the stick turns with the game ----
      const push = layout.stick.dead * 3, home = await clientOfTurned(page, 150, 250);
      await pointer(page, 'pointerdown', home);
      await pointer(page, 'pointermove', { x: home.x, y: home.y + push });
      await api.step(2);
      assert((await maskNow(api)) === RIGHT, `dragged down the upright screen - the player's right - the stick holds RIGHT and only RIGHT (mask ${await maskNow(api)})`);
      await pointer(page, 'pointerup', { x: home.x, y: home.y + push });
      await api.step(4);
      assert((await summaryOf(api)).critter === 'sorrel', 'and the cursor went right with it');

      // ---- the bands above and below the turned canvas are its left and right ----
      const band = await clientOfTurned(page, -30, 250);
      assert(band.y > 0 && band.y < look.top, `a point left of the game lies in the band above the turned canvas (${band.y.toFixed(0)})`);
      await pointer(page, 'pointerdown', band, { on: 'body' });
      await pointer(page, 'pointermove', { x: band.x, y: band.y + push }, { on: 'body' });
      await api.step(2);
      assert(((await maskNow(api)) & RIGHT) !== 0, 'and a thumb there is the stick, and steers');
      await pointer(page, 'pointerup', { x: band.x, y: band.y + push }, { on: 'body' });
      await api.step(4);
      const corner = await clientOfTurned(page, 690, 330);
      assert(corner.y > look.top + look.h && corner.y < look.vh, `a point past the game's right edge lies in the band below it (${corner.y.toFixed(0)})`);
      await page.touchscreen.tap(corner.x, corner.y);
      await api.step(2);
      assert((await summaryOf(api)).ready === true, 'and a tap there, in GO\'s corner, is GO: the card is stamped');

      // ---- turned, with the phone's rotation unlocked: the page goes landscape and the game the right way up ----
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForFunction(() => {
        const el = document.getElementById('game');
        return getComputedStyle(el).transform === 'none' && el.style.width === '640px';
      }, null, { timeout: 5000 });
      await api.step(1);
      const xAt = await clientOf(page, x.cx, x.cy);
      await page.touchscreen.tap(xAt.x, xAt.y);
      await api.step(2);
      const s = await api.summary();
      assert(s.screen === 'select' && s.top.seats[0].ready === false, `landscape, nothing is turned and X is under the thumb again: the stamp comes off (${s.screen}, ready ${s.top.seats[0].ready})`);
    }, UPRIGHT);
  },

  async touchlaptop(server) {
    await withPage(server, 'skipTo=title', async (api, page) => {
      await api.step(5);
      assert((await api.inputState()).touchOn === false, 'a page with a mouse for its pointer has no thumb controls');
      // A finger on a touchscreen laptop: the media query said "mouse", the hand says otherwise.
      const at = await clientOf(page, 120, 200);
      await pointer(page, 'pointerdown', at);
      await api.step(2);
      assert((await api.inputState()).touchOn === true, 'the first real touch brings them up');
      await pointer(page, 'pointerup', at);
      await api.step(2);
      assert((await api.inputState()).mask === 0 && (await api.screen()) === 'title', 'and that touch pressed nothing on the way');
    });
  },

  async touchphone(server) {
    await withPage(server, 'skipTo=title', async (api, page) => {
      await api.step(5);
      const boot = await api.inputState();
      assert(boot.touchOn === true, 'a phone-shaped page has the controls without being told to');
      assert((await page.evaluate(() => getComputedStyle(document.getElementById('game')).transform)) === 'none',
        'and in landscape the game is the right way up, not turned on its side');
      const scale = await page.evaluate(() => document.getElementById('game').getBoundingClientRect().width / 640);
      assert(scale === 1, `and a phone this size gets a whole CSS pixel per game pixel (${scale})`);
      const band = await page.evaluate(() => document.getElementById('game').getBoundingClientRect().left);
      assert(band >= 100, `which leaves a dark band ${band} px wide either side of the canvas, where thumbs rest`);
      await api.shot('phone-title');                        // TAP GO, not PRESS START, over the thumb controls

      // ---- a real tap, mapped through the real canvas ----
      const layout = await api.touchLayout(), stick = layout.stick;
      const go = buttonAt(layout, 'action');
      await page.touchscreen.tap((await clientOf(page, go.cx, go.cy)).x, (await clientOf(page, go.cx, go.cy)).y);
      await api.step(2);
      assert((await api.screen()) === 'select', `a tap on GO opened PLAY (now on ${await api.screen()})`);
      const seated = await api.inputState();
      assert(seated.device === 'touch', `on a seat that knows it is being thumbed (${seated.device})`);
      // A tap is down and up inside one browser task, with no fixed step between them: it is played because the
      // press is held for the step that follows it, which is the whole reason engine/touch.js keeps `pending`.
      await api.step(4);
      assert((await api.inputState()).mask === 0, 'and a tap that has been let go of is not still held');

      // ---- a contact held, and dragged from one direction to the other ----
      const push = stick.dead * 3, home = await clientOf(page, 150, 250);
      await pointer(page, 'pointerdown', home);
      await api.step(2);
      assert((await maskNow(api)) === 0, 'a thumb landing on the stick\'s side presses nothing yet');
      await pointer(page, 'pointermove', { x: home.x + push, y: home.y });
      await api.step(2);
      assert(((await maskNow(api)) & RIGHT) !== 0, 'pushed right, it holds RIGHT');
      await api.step(10);
      assert(((await maskNow(api)) & RIGHT) !== 0, 'and goes on holding it while it rests there');
      await pointer(page, 'pointermove', { x: home.x - push, y: home.y });
      await api.step(2);
      const slid = await maskNow(api);
      assert((slid & LEFT) !== 0 && (slid & RIGHT) === 0, `sliding it back across is LEFT now, and only LEFT (mask ${slid})`);
      await pointer(page, 'pointerup', { x: home.x - push, y: home.y });
      await api.step(2);
      assert((await maskNow(api)) === 0, 'and lifting it lets go');

      // ---- a thumb dragged off the glass altogether ----
      await pointer(page, 'pointerdown', home);
      await pointer(page, 'pointermove', { x: home.x, y: home.y - push });
      await api.step(2);
      assert(((await maskNow(api)) & UP) !== 0, 'pushed up it holds UP');
      await pointer(page, 'pointercancel', { x: home.x, y: home.y - push });
      await api.step(2);
      assert((await maskNow(api)) === 0, 'and a contact the browser takes away does not hold it for ever');
      // ...and one whose lift the browser never reported at all: the next first finger down retires it
      await pointer(page, 'pointerdown', home, { id: 7 });
      await pointer(page, 'pointermove', { x: home.x, y: home.y + push }, { id: 7 });
      await api.step(2);
      assert(((await maskNow(api)) & DOWN) !== 0, 'a thumb holds DOWN');
      const goAt = await clientOf(page, go.cx, go.cy);
      await pointer(page, 'pointerdown', goAt, { id: 8, primary: true });
      await api.step(2);
      const fresh = await maskNow(api);
      assert((fresh & DOWN) === 0 && (fresh & ACTION) !== 0, `a new first finger means every old one has gone: DOWN is let go of (mask ${fresh})`);
      await pointer(page, 'pointerup', goAt, { id: 8 });
      await api.step(4);

      // ---- the dark bands either side of the canvas are the controls' too ----
      const left = await clientOf(page, -60, 250);
      assert(left.x > 0 && left.x < band, `a point 60 game px left of the canvas is out in the band (${left.x})`);
      await pointer(page, 'pointerdown', left, { on: 'body' });
      await pointer(page, 'pointermove', { x: left.x + push, y: left.y }, { on: 'body' });
      await api.step(2);
      assert(((await maskNow(api)) & RIGHT) !== 0, 'a thumb in the left-hand band is the stick, and steers');
      await pointer(page, 'pointerup', { x: left.x + push, y: left.y }, { on: 'body' });
      await api.step(2);
      const corner = await clientOf(page, 700, 330);
      await page.touchscreen.tap(corner.x, corner.y);
      await api.step(2);
      assert((await api.summary()).top.seats[0].ready === true, 'and a tap in the right-hand band, by GO, is GO');
      await pointer(page, 'pointerdown', goAt, { id: 9 });
      await api.step(1);
      await pointer(page, 'pointerup', goAt, { id: 9 });

      // ---- a smaller phone, where a game pixel is NOT a whole CSS pixel ----
      // The one part of this that a test hook cannot reach: a contact arrives in client coordinates and has to be
      // divided back into the 640x360 the buttons are laid out in, through a canvas that has just changed size.
      await api.goto('select');
      await api.step(4);
      await page.setViewportSize({ width: 568, height: 320 });
      // The resize reaches the page on its own schedule, and the canvas re-lays itself out from the event: wait
      // for THAT rather than for a step, or the tap below is aimed through a rect the page has not caught up to.
      await page.waitForFunction(() => document.getElementById('game').style.width !== '640px', null, { timeout: 5000 });
      await api.step(2);
      const small = await page.evaluate(() => document.getElementById('game').getBoundingClientRect().width / 640);
      assert(small < 1 && small % 1 !== 0, `a smaller phone scales the canvas down to a fraction (${small.toFixed(3)})`);
      const at = await clientOf(page, go.cx, go.cy);
      await page.touchscreen.tap(at.x, at.y);
      await api.step(2);
      assert((await api.summary()).top.seats[0].ready === true, 'and GO is still under the thumb that aims at it');

      // ---- a mouse is not a thumb ----
      await page.mouse.click((await clientOf(page, go.cx, go.cy)).x, (await clientOf(page, go.cx, go.cy)).y);
      await api.step(4);
      assert((await api.inputState()).mask === 0, 'a mouse click on the overlay presses nothing: only touch and pen do');
      await api.shot('phone-select');
    }, PHONE);
  },
};

/** The select screen's one seat, for the assertions that only want it. */
async function summaryOf(api) { return (await api.summary()).top.seats[0]; }
