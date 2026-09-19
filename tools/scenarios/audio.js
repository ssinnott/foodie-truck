// Playtest scenarios for SOUND (registered in tools/scenarios/index.js). Each export is `async (server) => void`
// using withPage / assert from ../playtest.js.
//
//   audio - every SFX and every track renders AUDIBLY through an OfflineAudioContext (engine/audio.ts selfTest),
//        which needs neither a speaker nor a user gesture, so a headless browser can prove the whole library
//        makes a sound and throws nothing. Then the wiring: in autotest mode the facade makes no context and
//        play() is a no-op, but `music.current` is still set, so the second beat walks the screens and reads
//        which track each one asked for - the table in game/game.ts, and the day board's override when the
//        truck is closed. The mute key is pressed as a REAL key event, because it is read off the typed codes
//        rather than the actions.
import { withPage, assert } from '../playtest.js';

/** Tracks the screens must ask for (game/game.ts SCREEN_MUSIC), by the screen a skipTo lands on. */
const WANT = { title: 'title', select: 'title', controls: 'title', gallery: 'title', lobby: 'title', stage: 'board', map: 'drive', orchard: 'gather', pond: 'pond', coop: 'gather', dairy: 'gather', mill: 'gather', hive: 'gather', garden: 'gather', line: 'line', kitchen: 'kitchen', results: 'results' };

export const SCENARIOS = {
  async audio(server) {
    // 1. the library, rendered offline: the page is NOT in autotest mode, so the facade is live, but nothing is
    //    played - selfTest renders into buffers and measures them
    await withPage(server, 'skipTo=title', async (api, page) => {
      const report = await page.evaluate(() => window.__game.audio.selfTest());
      assert(report && Array.isArray(report.sfx) && Array.isArray(report.music), 'audio.selfTest() returns { sfx: [...], music: [...] }');
      const failed = report.sfx.filter((r) => r.error);
      const silent = report.sfx.filter((r) => !r.error && !(r.rms > 0.0005));
      assert(failed.length === 0, `no SFX throws (${failed.map((r) => r.name + ': ' + r.error).slice(0, 5).join('; ')})`);
      assert(silent.length === 0, `every SFX is audible (silent: ${silent.map((r) => r.name).join(', ')})`);
      assert(report.sfx.length >= 40, `the SFX library is implemented (${report.sfx.length} rendered)`);
      const quiet = report.music.filter((r) => r.error || !(r.rms > 0.002));
      assert(report.music.length >= 9, `every track renders (${report.music.length})`);
      assert(quiet.length === 0, `every track is audible and throws nothing (${quiet.map((r) => r.name + (r.error ? ':' + r.error : '')).join(', ')})`);
      // no track's pattern is a ragged bar: compileTrack warns on one, and warnings are not page errors, so ask
      const ragged = await page.evaluate(() => {
        const a = window.__game.audio, out = [];
        for (const name of Object.keys(a.TRACKS)) { const t = a.TRACKS[name], c = t._c; for (const ch of c.channels) if (ch.len % c.stepsPerBar !== 0) out.push(name + '/' + ch.inst); }
        return out;
      });
      assert(ragged.length === 0, `every pattern is a whole number of bars (${ragged.join(', ')})`);
    });
    // 2. the wiring: each screen asks for its track the moment it is pushed
    for (const id of Object.keys(WANT)) {
      await withPage(server, `skipTo=${id}&critters=0,1`, async (api, page) => {
        const cur = await page.evaluate(() => window.__game.audio.music.current);
        assert(cur === WANT[id], `${id} asks for the '${WANT[id]}' track (got '${cur}')`);
        const test = await page.evaluate(() => window.__game.audio.testMode && !window.__game.audio.unlocked);
        assert(test, `${id}: autotest never opens an AudioContext`);
      });
    }
    // 3. the pause overlay keeps the scene's track; the closed day board plays its own; M mutes, once
    await withPage(server, 'skipTo=map&critters=0', async (api, page) => {
      await api.press(0, { start: true });
      assert((await api.screen()) === 'pause', 'START opens the pause overlay over the map');
      assert((await page.evaluate(() => window.__game.audio.music.current)) === 'drive', 'the pause overlay leaves the drive track playing');
      await api.press(0, { cancel: true });
      assert((await api.screen()) === 'map', 'CANCEL closes it again');
      const before = await page.evaluate(() => window.__game.audio.muted);
      await page.keyboard.down('KeyM'); await api.step(2); await page.keyboard.up('KeyM'); await api.step(2);
      const after = await page.evaluate(() => window.__game.audio.muted);
      assert(before === false && after === true, `M mutes (was ${before}, now ${after})`);
      await page.keyboard.down('KeyM'); await api.step(2); await page.keyboard.up('KeyM'); await api.step(2);
      assert((await page.evaluate(() => window.__game.audio.muted)) === false, 'M again unmutes');
    });
    await withPage(server, 'skipTo=stage&critters=0', async (api, page) => {
      // serve every line, then land on the board the way results does, and it is closed
      await page.evaluate(() => { const run = window.__game.game.run; while (!run.dayComplete()) { run.startLine(run.lines.findIndex((l) => !l.served)); while (!run.lineDone()) run.serve(3); } });
      await api.goto('stage');
      const s = await api.summary();
      assert(s.top.closed === true, 'the day board opens closed once every line is served');
      assert((await page.evaluate(() => window.__game.audio.music.current)) === 'closing', 'the closed board plays the closing track');
    });
  },
};
