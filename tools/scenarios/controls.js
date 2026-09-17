// Playtest scenarios for REBINDING (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   controls - the CONTROLS screen driven the way a player drives it, on REAL key events rather than the virtual
//        masks the other scenarios use. That is the whole point: a rebind is the one thing in the game that reads
//        the keyboard rather than the actions the keyboard is bound to, so a test that pressed ACTION through
//        setInput would never touch the code being tested. The pad column is driven with fake pads, a refusal is
//        provoked on purpose, a column is put back to defaults, and the last beat reloads the page to prove the
//        binding came back from storage.
//
// Every page here boots with `defaults=1` so it starts from stock bindings whatever an earlier beat stored.
import { withPage, assert } from '../playtest.js';

/** Row order is engine/actions.js ACTIONS; these are the two the scenario edits. */
const ROW_ACTION = 4, ROW_ALT = 5;
/** Column order is the CONTROLS table: P1 keys, P2 keys, gamepad. */
const COL_P1 = 0, COL_P2 = 1, COL_PAD = 2;
const RB = 5, RT = 7;

/** Walk the cell cursor to (row, col) from wherever it is, through the screen's own navigation. */
async function goTo(api, row, col) {
  for (let i = 0; i < 16; i++) {
    const at = await api.summary();
    const r = at.top.rowIndex, c = at.top.colIndex;
    if (r === row && c === col) return;
    if (r !== row) await api.press(0, { down: true }, 2, 3);
    else await api.press(0, { right: true }, 2, 3);
  }
  assert(false, `could not walk the cursor to row ${row} column ${col}`);
}

/**
 * Hold a key down across a few fixed steps and let go. A player's press spans dozens of frames; Playwright's own
 * `press` fires down and up between two steps, which a HELD-state mask never sees - fine for a capture, which
 * reads the key events themselves, but invisible to a key being played as an action.
 */
async function holdKey(page, api, code) {
  await page.keyboard.down(code);
  await api.step(3);
  await page.keyboard.up(code);
  await api.step(4);
}

/** Open a capture on the current cell and hold it open for the caller to press something into. */
async function beginRebind(api) {
  await api.press(0, { action: true }, 2, 3);
  assert((await api.summary()).top.listening === true, 'the cell is listening for a key or a button');
}

export const SCENARIOS = {
  async controls(server) {
    await withPage(server, 'skipTo=controls&defaults=1', async (api, page) => {
      await api.step(5);
      assert((await api.screen()) === 'controls', 'the controls screen comes up');
      const s0 = await api.summary();
      assert(s0.top.isDefault === true, 'on stock bindings');
      assert(s0.top.cells[COL_P1][ROW_ACTION] === 'Z / SPACE', `P1 ACTION starts on Z and SPACE (${s0.top.cells[COL_P1][ROW_ACTION]})`);
      assert(s0.top.cells[COL_PAD][ROW_ACTION] === 'A', `the pad starts on A (${s0.top.cells[COL_PAD][ROW_ACTION]})`);
      assert(s0.top.cells[COL_P2][ROW_ACTION] === 'V', `and P2 on V (${s0.top.cells[COL_P2][ROW_ACTION]})`);

      // ---- a real key rebinds P1's ACTION ----
      await goTo(api, ROW_ACTION, COL_P1);
      await beginRebind(api);
      await holdKey(page, api, 'KeyM');
      const s1 = await api.summary();
      assert(s1.top.listening === false, 'the capture closes on the key');
      assert(s1.top.cells[COL_P1][ROW_ACTION] === 'M', `P1 ACTION is now M alone (${s1.top.cells[COL_P1][ROW_ACTION]})`);
      assert(s1.top.isDefault === false, 'and the set is no longer stock');

      // the key that did the binding must not ALSO have been played as a press
      assert((await api.screen()) === 'controls', 'and binding a key did not act on the screen it was bound from');

      // ---- the new key really is ACTION now: it opens a rebind on the next cell ----
      await goTo(api, ROW_ALT, COL_P1);
      await holdKey(page, api, 'KeyM');
      assert((await api.summary()).top.listening === true, 'pressing M now opens a rebind, because M is ACTION');
      await page.keyboard.press('Escape');
      await api.step(4);
      const s2 = await api.summary();
      assert(s2.top.listening === false && /CANCELLED/.test(s2.top.message), `and ESC backs out of one (${s2.top.message})`);
      assert(s2.top.cells[COL_P1][ROW_ALT] === 'X / LSHIFT', 'leaving the cell it was opened on alone');

      // ---- a refusal is shown, not swallowed ----
      await goTo(api, ROW_ACTION, COL_P2);
      await beginRebind(api);
      await page.keyboard.press('KeyM');
      await api.step(4);
      const s3 = await api.summary();
      assert(/P1 ACTION/.test(s3.top.message), `taking P1's only ACTION key is refused, and says why (${s3.top.message})`);
      assert(s3.top.cells[COL_P2][ROW_ACTION] === 'V', 'and P2 keeps the key it had');

      // ---- the pad column wants a button ----
      await goTo(api, ROW_ACTION, COL_PAD);
      await beginRebind(api);
      await page.keyboard.press('KeyQ');
      await api.step(4);
      assert(/WANTS A BUTTON/.test((await api.summary()).top.message), 'a key pressed at the gamepad column says so');
      await beginRebind(api);
      await api.pads([{ down: [RT] }]);
      await api.step(2);
      await api.pads([{ down: [] }]);
      await api.step(4);
      const s4 = await api.summary();
      assert(s4.top.cells[COL_PAD][ROW_ACTION] === 'RT', `the right trigger takes ACTION (${s4.top.cells[COL_PAD][ROW_ACTION]})`);
      assert((await api.screen()) === 'controls', 'and the button that bound it was not also played');

      // a shoulder button, which did nothing at all before this
      await goTo(api, ROW_ALT, COL_PAD);
      await beginRebind(api);
      await api.pads([{ down: [RB] }]);
      await api.step(2);
      await api.pads([{ down: [] }]);
      await api.step(4);
      assert((await api.summary()).top.cells[COL_PAD][ROW_ALT] === 'RB', 'and the right shoulder takes ALT');

      // ---- ALT puts THIS column back, and leaves the others as they are ----
      await api.press(0, { alt: true }, 2, 4);
      const s5 = await api.summary();
      assert(s5.top.cells[COL_PAD][ROW_ACTION] === 'A' && s5.top.cells[COL_PAD][ROW_ALT] === 'X', 'the gamepad column goes back to defaults');
      assert(s5.top.cells[COL_P1][ROW_ACTION] === 'M', "and P1's own rebind is untouched by it");
      await api.shot('controls-rebound');                   // the table mid-edit: P1 on M, the pad back to stock

      // ---- it survives a reload, because leaving the screen wrote it ----
      await api.press(0, { cancel: true }, 2, 6);
      assert((await api.screen()) === 'title', 'CANCEL goes back to the title, which is what writes the bindings out');
      await page.goto(`http://localhost:${server.port}/index.html?autotest=1&skipTo=controls`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
      await api.step(5);
      const s6 = await api.summary();
      assert(s6.screen === 'controls' && s6.top.cells[COL_P1][ROW_ACTION] === 'M', `the rebind came back from storage (${s6.top.cells[COL_P1][ROW_ACTION]})`);
      assert(s6.top.isDefault === false, 'and the reloaded set knows it is not stock');

      // ---- and ?defaults=1 is the way back in for somebody who has bound themselves out ----
      await page.goto(`http://localhost:${server.port}/index.html?autotest=1&skipTo=controls&defaults=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
      await api.step(5);
      const s7 = await api.summary();
      assert(s7.top.isDefault === true && s7.top.cells[COL_P1][ROW_ACTION] === 'Z / SPACE', 'booting on defaults ignores what was stored');
      assert((await page.evaluate(() => window.__game.bindings.saved())) !== null, 'without throwing the stored set away');
    });
  },
};
