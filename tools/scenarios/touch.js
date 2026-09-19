// Playtest scenarios for the ON-SCREEN CONTROLS (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   touch - a phone and nothing else: no key, no pad, no virtual seat anywhere in this scenario. A thumb opens
//        PLAY from the title, walks the critter cursor with the d-pad, stamps READY, and the day board opens -
//        the same walk tools/scenarios/pads.js does on four controllers, because the question the feature has to
//        answer is not "does a mask arrive" but "can somebody holding a phone actually play this". The rest is
//        the three things a thumb can do that a key cannot: press two directions at once, press nothing while
//        resting in the middle of the pad, and hand the screen back to a keyboard that has been picked up.
//
//   touchphone - the same thing on a page that IS a phone: a landscape viewport that matches
//        `(hover: none) and (pointer: coarse)`, real contacts from page.touchscreen, and a canvas at a scale
//        that is not 1:1. Everything above drives the layer through its test hook, which is exactly the half a
//        real device does not use - this one goes in through the DOM listeners and through toInternal, so a
//        button pressed at 1.08 CSS pixels per game pixel is the button under the thumb.
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

/** A landscape phone: what makes the media query match, and what makes page.touchscreen work. */
const PHONE = { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };

/** A game-space point in the page's own client coordinates, through the canvas as it is actually laid out. */
function clientOf(page, gx, gy) {
  return page.evaluate(([x, y]) => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { x: r.left + x * r.width / 640, y: r.top + y * r.height / 360 };
  }, [gx, gy]);
}
/** A contact held at a game-space point: a real PointerEvent through the real listeners, down until it is let up. */
function pointer(page, type, at) {
  return page.evaluate(([t, x, y]) => {
    document.getElementById('game').dispatchEvent(new PointerEvent(t, {
      pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: x, clientY: y,
    }));
  }, [type, at.x, at.y]);
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
      await api.shot('title-touch');                        // the d-pad, GO, ALT, X and MENU over the lineup

      // ---- a thumb opens the game ----
      const layout = await api.touchLayout();
      const go = buttonAt(layout, 'action');
      await tap(api, { x: go.cx, y: go.cy });
      assert((await api.screen()) === 'select', `GO opened PLAY (now on ${await api.screen()})`);
      const seated = await api.inputState();
      assert(seated.device === 'touch', `and seat 1 knows what it is being driven by (${seated.device})`);

      // ---- the d-pad walks the cursor ----
      const pad = layout.pad, reach = pad.half * 0.7;
      const s0 = await api.summary();
      assert(s0.top.seats[0].critter === 'barley', `the lead seat opens on the first card (${s0.top.seats[0].critter})`);
      await tap(api, { x: pad.cx + reach, y: pad.cy });
      const s1 = await api.summary();
      assert(s1.top.seats[0].critter === 'sorrel', `a thumb on the right of the pad moved the cursor (${s1.top.seats[0].critter})`);
      await tap(api, { x: pad.cx - reach, y: pad.cy });
      assert((await api.summary()).top.seats[0].critter === 'barley', 'and the left of it moved back');

      // ---- what a thumb can do that a key cannot ----
      await api.touch([{ x: pad.cx + reach, y: pad.cy - reach }]);
      await api.step(2);
      const diag = (await api.inputState()).mask;
      assert((diag & RIGHT) !== 0 && (diag & UP) !== 0, `one thumb in a corner of the pad is two directions (mask ${diag})`);
      assert((diag & (LEFT | DOWN)) === 0, 'and not the two it is nowhere near');
      await api.touch([{ x: pad.cx, y: pad.cy }]);
      await api.step(2);
      assert((await api.inputState()).mask === 0, 'a thumb parked in the middle of the pad presses nothing');
      await api.touch([{ x: 320, y: 170 }]);                // the middle of the scene: no control there
      await api.step(2);
      assert((await api.inputState()).mask === 0, 'and neither does a tap on the scene itself');
      await api.touch([]);
      await api.step(2);

      // ---- two thumbs at once: a direction held while GO is tapped, which is how every mini-game is played ----
      await api.touch([{ x: pad.cx + reach, y: pad.cy }, { x: go.cx, y: go.cy }]);
      await api.step(2);
      const both = (await api.inputState()).mask;
      assert((both & RIGHT) !== 0 && (both & ACTION) !== 0, `a thumb each side holds a direction AND the button (mask ${both})`);
      await api.touch([]);
      await api.step(4);

      // ---- a stamp, and the day opens ----
      const at = (await api.summary()).top.seats[0].critter;
      await tap(api, { x: go.cx, y: go.cy });
      const s2 = await api.summary();
      assert(s2.top.seats[0].ready === true, 'GO stamps READY on the card');
      assert(s2.top.seats[0].critter === at, 'and stamps the card the cursor was on');
      await api.shot('select-touch');                       // the overlay over the lineup, one card stamped
      await api.step(90);
      const s3 = await api.summary();
      assert(s3.screen === 'stage', `a stamped seat opens the day board (now on ${s3.screen})`);
      assert(s3.run && s3.run.party.length === 1, `with a party of one (${JSON.stringify(s3.run && s3.run.party)})`);

      // ---- ALT is offered where it does something, and nowhere else ----
      const alt = buttonAt(layout, 'alt');
      await api.touch([{ x: alt.cx, y: alt.cy }]);
      await api.step(2);
      assert((await api.inputState()).mask === 0, 'the day board has no use for ALT, so there is nothing there to press');
      await api.touch([]);
      await api.step(2);
      await api.goto('map');
      await api.step(4);
      await api.touch([{ x: alt.cx, y: alt.cy }]);
      await api.step(2);
      assert(((await api.inputState()).mask & ALT) !== 0, 'the road, which honks with it, does offer it');
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
      await api.touch([{ x: pad.cx + reach, y: pad.cy }]);
      await api.step(2);
      const back = await api.inputState();
      assert(back.touchOn === true, 'and the next touch brings it back');
      assert((back.mask & RIGHT) !== 0, 'pressing as it returns');
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
      const layout = await api.touchLayout(), pad = layout.pad, go = buttonAt(layout, 'action');
      await tap(api, { x: pad.cx, y: pad.cy + pad.half * 0.7 });
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

  async touchphone(server) {
    await withPage(server, 'skipTo=title', async (api, page) => {
      await api.step(5);
      const boot = await api.inputState();
      assert(boot.touchOn === true, 'a phone-shaped page has the controls without being told to');
      assert((await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display)) === 'none',
        'and in landscape it is not being asked to turn sideways');
      const scale = await page.evaluate(() => document.getElementById('game').getBoundingClientRect().width / 640);
      assert(scale === 1, `and a phone this size gets a whole CSS pixel per game pixel (${scale})`);
      await api.shot('phone-title');                        // TAP GO, not PRESS START, over the thumb controls

      // ---- a real tap, mapped through the real canvas ----
      const layout = await api.touchLayout();
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
      const pad = layout.pad, reach = pad.half * 0.7;
      await pointer(page, 'pointerdown', await clientOf(page, pad.cx + reach, pad.cy));
      await api.step(2);
      assert(((await api.inputState()).mask & RIGHT) !== 0, 'a thumb held on the right of the pad holds RIGHT');
      await api.step(10);
      assert(((await api.inputState()).mask & RIGHT) !== 0, 'and goes on holding it while it rests there');
      await pointer(page, 'pointermove', await clientOf(page, pad.cx - reach, pad.cy));
      await api.step(2);
      const slid = (await api.inputState()).mask;
      assert((slid & LEFT) !== 0 && (slid & RIGHT) === 0, `sliding it across the pad is LEFT now, and only LEFT (mask ${slid})`);
      await pointer(page, 'pointerup', await clientOf(page, pad.cx - reach, pad.cy));
      await api.step(2);
      assert((await api.inputState()).mask === 0, 'and lifting it lets go');

      // ---- a thumb dragged off the glass altogether ----
      await pointer(page, 'pointerdown', await clientOf(page, pad.cx, pad.cy - reach));
      await api.step(2);
      assert(((await api.inputState()).mask & UP) !== 0, 'a thumb on the top of the pad holds UP');
      await pointer(page, 'pointercancel', await clientOf(page, pad.cx, pad.cy - reach));
      await api.step(2);
      assert((await api.inputState()).mask === 0, 'and a contact the browser takes away does not hold it for ever');

      // ---- a smaller phone, where a game pixel is NOT a whole CSS pixel ----
      // The one part of this that a test hook cannot reach: a contact arrives in client coordinates and has to be
      // divided back into the 640x360 the buttons are laid out in, through a canvas that has just changed size.
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
