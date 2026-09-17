// Playtest scenarios for the front-of-house screens (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / withPeers / assert from ../playtest.js.
//
//   ui - the three paths a player takes through the menus:
//        title -> PLAY -> select -> READY -> the order board opens with the picked critter seated in the run;
//        title -> ONLINE -> HOST A TABLE on the broadcast transport -> the lobby mints a host key, reaches its
//        'connecting' phase and draws the table ticket without a page error (with the art director's shots of
//        the HOST / JOIN slate and of a stamped recipe card on the way through);
//        the pause overlay opening and closing over the map (and the screenshot the art director looks at);
//        a READY that is called off again before the hold runs out, which must NOT start the run;
//        a full table on the lobby stools (staged roster) showing the GDD's STARTING! beat;
//   uiroom - two real pages driven through the LOBBY SCREEN rather than the net hooks: the host's key is typed
//        into the guest's ticket on a real keyboard, both seats appear on the stools, a pick and a READY round
//        trip, and tools/screens/lobby-room.png is what a filling room actually looks like.
import { withPage, withPeers, assert } from '../playtest.js';

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
      await api.step(8);
      await api.shot('select-ready');                       // the beetroot stamp on the picked recipe card
      await api.step(82);                                   // the stamp holds, then the fade hands over to the map
      const s2 = await api.summary();
      assert(s2.screen === 'stage', `a full crew of readies opens the order board (now on ${s2.screen})`);
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
      await api.shot('lobby-role');                         // HOST / JOIN on the slate, before any session exists
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

  async selectCancel(server) {
    // A seat that changes its mind inside the 30-frame start hold calls the countdown off. The arm used to latch,
    // so a cancel left the run starting on schedule with the seat's pick still in it.
    await withPage(server, 'skipTo=select', async (api) => {
      await api.step(5);
      await api.press(0, { action: true }, 2, 4);
      assert((await api.summary()).top.starting === true, 'READY arms the start hold');
      await api.press(0, { cancel: true }, 2, 4);
      const s0 = await api.summary();
      assert(s0.top.starting === false, 'cancel inside the hold disarms it');
      await api.step(90);
      const s1 = await api.summary();
      assert(s1.screen === 'select', `...and nothing starts (now on ${s1.screen})`);
      assert(s1.top.started === false, 'the run was never handed over behind the cancelled countdown');
      // stamping again still starts, so the disarm did not break the path
      await api.press(0, { action: true }, 2, 4);
      await api.step(90);
      assert((await api.summary()).screen === 'stage', 'a second READY hands over to the board as before');
    });
  },

  async lobbyfull(server) {
    // Four seats need four peers, which no headless run can hold steady, so the ROSTER is staged and the screen's
    // own draw path does the rest: the busts, the READY dockets and the STARTING! banner GDD section 10 asks for.
    await withPage(server, 'skipTo=lobby', async (api, page) => {
      await api.step(5);
      await page.evaluate(() => {
        const sc = window.__game.game.screen;
        const seats = [0, 1, 2, 3].map((i) => ({ slot: i, critter: i, ready: true, local: i === 0 }));
        sc.net = {
          state: 'lobby', room: 'BCDFGH', isHost: true, localSlot: 0, endReason: '', error: '',
          lobby: { myCritter: 0, myReady: true },
          party() { return seats; },
          summary() { return { room: 'BCDFGH', rtt: 42, delay: 3 }; },
          onStateChange() {}, critterTaken() { return false; }, setCritter() {}, setReady() {}, leave() {},
        };
        sc.noteCode();
      });
      await api.step(60);
      const l = await api.summary();
      assert(l.top.party.length === 4, `all four stools are taken (${l.top.party.length})`);
      assert(l.top.banner === 'STARTING!', `a full table of readies shows the STARTING! beat (banner "${l.top.banner}")`);
      await api.shot('lobby-full');
    });
  },

  async uiroom(server) {
    await withPeers(server, ['skipTo=lobby&host=1&transport=broadcast', 'skipTo=lobby&transport=broadcast'], async (pages, apis) => {
      const [host, guest] = pages, [hostApi, guestApi] = apis;
      await hostApi.step(20);
      await guestApi.step(5);
      const code = (await hostApi.summary()).top.code;
      assert(ROOM_CODE.test(code), `the host's ticket carries a six-character host key (${code})`);
      assert((await guestApi.summary()).top.phase === 'role', 'the guest is asked host or join');

      // JOIN A TABLE, then type the key on a REAL keyboard: every code letter is a bound game key, so this is
      // the path that proves the screen reads raw KeyboardEvent.code values rather than actions.
      await guestApi.press(0, { down: true }, 2, 4);
      await guestApi.press(0, { action: true }, 2, 4);
      assert((await guestApi.summary()).top.phase === 'code', `JOIN opens the code ticket (phase ${(await guestApi.summary()).top.phase})`);
      await guest.bringToFront();
      for (const ch of code) await guest.keyboard.press(/[0-9]/.test(ch) ? 'Digit' + ch : 'Key' + ch);
      await guestApi.step(2);
      const typed = (await guestApi.summary()).top.code;
      assert(typed === code, `every glyph typed lands on the ticket (${typed} vs ${code})`);
      await guestApi.shot('lobby-code');                    // the guest's ticket with six typed glyphs on it
      await guest.keyboard.press('Backspace');
      await guestApi.step(2);
      assert((await guestApi.summary()).top.code === code.slice(0, -1), 'backspace rubs one out again');
      await guest.keyboard.press(/[0-9]/.test(code[5]) ? 'Digit' + code[5] : 'Key' + code[5]);
      await guest.keyboard.press('Enter');
      await guestApi.step(2);

      // the room fills over real WebRTC; both screens then show two stools taken
      const seated = (n) => n && n.state === 'lobby' && n.party.length === 2;
      await host.waitForFunction(`(${seated.toString()})(window.__game.netState())`, null, { timeout: 30000 });
      await guest.waitForFunction(`(${seated.toString()})(window.__game.netState())`, null, { timeout: 30000 });
      await hostApi.step(10); await guestApi.step(10);
      const h1 = await hostApi.summary(), g1 = await guestApi.summary();
      assert(h1.top.phase === 'lobby' && g1.top.phase === 'lobby', `both screens reach the lobby phase (${h1.top.phase}, ${g1.top.phase})`);
      assert(h1.top.party.length === 2 && g1.top.party.length === 2, 'two stools are taken on both machines');
      assert(g1.top.slot === 1, `the guest is seated in slot 1 (got ${g1.top.slot})`);

      // a pick and a READY round-trip through the host's roster
      const before = g1.top.party[1].critter;
      await guestApi.press(0, { right: true }, 2, 10);
      await guestApi.step(20); await hostApi.step(20);
      const g2 = await guestApi.summary();
      assert(g2.top.party[1].critter !== before, `right moves the guest onto a free critter (${before} -> ${g2.top.party[1].critter})`);
      await guestApi.press(0, { action: true }, 2, 10);
      await guestApi.step(30); await hostApi.step(30);
      const h3 = await hostApi.summary();
      assert(h3.top.party[1].ready === true, 'the guest READY reaches the host');
      assert(h3.top.party[0].ready === false, '...and the host is still choosing, so nothing starts');
      await hostApi.shot('lobby-room');
      // un-ready peels the stamp off again
      await guestApi.press(0, { cancel: true }, 2, 10);
      await guestApi.step(30); await hostApi.step(30);
      assert((await hostApi.summary()).top.party[1].ready === false, 'cancel un-readies rather than leaving');
    });
  },
};
