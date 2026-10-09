// Playtest scenarios for GAMEPADS (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   pads - controllers and nothing else: no keyboard press anywhere in this scenario. A pad opens PLAY from the
//        title, walks the critter cursor, stamps READY, and the day board opens with a party of one. Four pads
//        are plugged in throughout, and that is the rule the scenario is really about: since local co-op went, a
//        pad sits nobody else down - every controller is the one player's, whichever they pick up - so the select
//        screen never grows a second cursor, any pad moves the one there is, and a second player is somebody on
//        another machine, online. tools/nettest.js pokes at the same rule through the input module; this walks it
//        through the real screens.
import { withPage, assert } from '../playtest.js';

/** Four ports, all resting; `press(i, ...buttons)` is that list with one pad holding something. */
const IDLE = [null, null, null, null].map(() => ({ down: [] }));
const A = 0, B = 1, RIGHT = 15;
function press(i, ...buttons) {
  const list = IDLE.slice();
  list[i] = { down: buttons };
  return list;
}
/** One pad presses and lets go, and the press settles. */
async function tapPad(api, i, ...buttons) {
  await api.pads(press(i, ...buttons));
  await api.step(2);
  await api.pads(IDLE);
  await api.step(4);
}

export const SCENARIOS = {
  async pads(server) {
    await withPage(server, 'skipTo=title', async (api) => {
      await api.step(5);
      assert((await api.screen()) === 'title', 'the title comes up');

      // ---- a pad opens the game ----
      await api.pads(IDLE);
      await api.step(2);
      assert((await api.screen()) === 'title' && (await api.inputState()).mask === 0, 'four resting pads press nothing');
      await tapPad(api, 0, A);
      assert((await api.screen()) === 'select', `the first pad's A opened PLAY (now on ${await api.screen()})`);
      assert((await api.inputState()).device === 'gamepad', 'and the seat knows a pad is driving it');

      // ---- every pad is the same player ----
      const s0 = await api.summary();
      assert(s0.top.seats.length === 1 && s0.top.seats[0].critter === 'barley' && !s0.top.seats[0].ready, `one cursor, on the first card, unstamped (${JSON.stringify(s0.top.seats)})`);
      await tapPad(api, 2, RIGHT);
      assert((await api.summary()).top.seats[0].critter === 'sorrel', 'the third pad moves that one cursor');
      await tapPad(api, 3, A);
      const s1 = await api.summary();
      assert(s1.top.seats.length === 1, `a fourth pad pressing A sits nobody else down (${s1.top.seats.length} seated)`);
      assert(s1.top.seats[0].ready && s1.top.seats[0].critter === 'sorrel', 'it stamps the one card instead, the card the cursor is on');
      await tapPad(api, 1, B);
      const s2 = await api.summary();
      assert(!s2.top.seats[0].ready && s2.top.starting === false && (await api.screen()) === 'select', "the second pad's B lifts the stamp and calls the countdown off");
      await tapPad(api, 1, RIGHT);
      await tapPad(api, 0, A);
      await api.shot('select-pad');                         // one jam-jar cursor, stamped, however many pads there are

      // ---- the run opens with a party of one ----
      await api.step(90);                                   // the stamp holds, then the fade hands over to the board
      const s3 = await api.summary();
      assert(s3.screen === 'stage', `the stamp opens the day board (now on ${s3.screen})`);
      assert(s3.run && s3.run.party.join() === 'chicory', `with the one critter that was picked (${JSON.stringify(s3.run && s3.run.party)})`);
      await tapPad(api, 3, A);
      await api.step(60);
      assert((await api.screen()) === 'map', `and any pad opens the truck from the board (now on ${await api.screen()})`);
      await api.pads(null);
      assert((await api.errors()).length === 0, 'four pads at once break nothing');
    });
  },
};
