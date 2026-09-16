// Playtest scenarios for the front-of-house screens (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   ui - the three paths a player takes through the menus:
//        title -> PLAY -> select -> READY -> the run starts on the map with the picked critter aboard;
//        title -> ONLINE -> HOST A TABLE on the broadcast transport -> the lobby mints a host key, reaches its
//        'connecting' phase and draws the table ticket without a page error;
//        the pause overlay opening and closing over the map (and the screenshot the art director looks at).
import { withPage, assert } from '../playtest.js';

const ROOM_CODE = /^[23456789BCDFGHJKMNPQRSTVWXYZ]{6}$/;

export const SCENARIOS = {
  async ui(server) {
    // ---- title -> select -> map ----
    await withPage(server, 'skipTo=title', async (api) => {
      await api.step(5);
      assert((await api.screen()) === 'title', 'the title comes up');
      const t0 = await api.summary();
      assert(t0.top.row === 'PLAY' && t0.top.crew === 4, `the menu opens on PLAY with the crew idling (${t0.top.row}, ${t0.top.crew} critters)`);
      await api.press(0, { action: true }, 2, 4);
      assert((await api.screen()) === 'select', `PLAY opens the critter select (now on ${await api.screen()})`);
      const s0 = await api.summary();
      assert(s0.top.seats.length === 1 && s0.top.seats[0].critter === 'barley', `P1 starts on their own card (${JSON.stringify(s0.top.seats)})`);
      await api.press(0, { right: true }, 2, 4);
      const s1 = await api.summary();
      assert(s1.top.seats[0].critter === 'sorrel', `right moves the cursor to the next card (${s1.top.seats[0].critter})`);
      await api.press(0, { action: true }, 2, 4);
      assert((await api.summary()).top.seats[0].ready === true, 'action stamps READY on the card');
      await api.step(90);                                   // the stamp holds, then the fade hands over to the map
      const s2 = await api.summary();
      assert(s2.screen === 'map', `a full crew of readies starts the run on the map (now on ${s2.screen})`);
      assert(s2.run && s2.run.party.length === 1 && s2.run.party[0] === 'sorrel', `the run is seated with the picked critter (${JSON.stringify(s2.run && s2.run.party)})`);
    });

    // ---- title -> ONLINE -> hosting a table ----
    await withPage(server, 'skipTo=title&transport=broadcast', async (api) => {
      await api.step(5);
      await api.press(0, { down: true }, 2, 4);
      assert((await api.summary()).top.row === 'ONLINE', 'down moves the title menu to ONLINE');
      await api.press(0, { action: true }, 2, 4);
      assert((await api.screen()) === 'lobby', `ONLINE opens the lobby (now on ${await api.screen()})`);
      const l0 = await api.summary();
      assert(l0.top.phase === 'role', `the lobby asks host or join first (phase ${l0.top.phase})`);
      await api.press(0, { action: true }, 2, 4);
      await api.step(30);
      const l1 = await api.summary();
      assert(l1.top.phase === 'connecting', `hosting waits for a second player (phase ${l1.top.phase})`);
      assert(ROOM_CODE.test(l1.top.code), `...on a six-character host key (${l1.top.code})`);
      assert(l1.top.party.length === 1 && l1.top.party[0].local === true, `...with the host in seat 0 (${JSON.stringify(l1.top.party)})`);
      assert(/\?ROOM=/.test(l1.top.link), `...and an invite link on the ticket (${l1.top.link})`);
      await api.step(60);
      await api.shot('lobby-hosting');
      // backing out of the room hands every seat back and returns to the title
      await api.press(0, { cancel: true }, 2, 6);
      assert((await api.screen()) === 'title', `leaving the table goes back to the title (now on ${await api.screen()})`);
    });

    // ---- pause over the map ----
    await withPage(server, 'skipTo=map&critters=0,1', async (api) => {
      await api.step(5);
      await api.press(0, { start: true }, 2, 4);
      assert((await api.screen()) === 'pause', `start opens the pause overlay (now on ${await api.screen()})`);
      const p0 = await api.summary();
      assert(p0.top.row === 'RESUME', `...on the RESUME row (${p0.top.row})`);
      await api.step(10);
      await api.shot('pause');
      await api.press(0, { cancel: true }, 2, 4);
      assert((await api.screen()) === 'map', `cancel closes it again (now on ${await api.screen()})`);
      assert((await api.summary()).run != null, 'the run underneath survived the overlay');
      // ...and QUIT TO TITLE tears the whole stack down
      await api.press(0, { start: true }, 2, 4);
      await api.press(0, { down: true }, 2, 4);
      await api.press(0, { action: true }, 2, 6);
      assert((await api.screen()) === 'title', `QUIT TO TITLE resets to the title (now on ${await api.screen()})`);
    });
  },
};
