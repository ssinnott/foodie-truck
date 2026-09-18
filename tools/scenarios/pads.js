// Playtest scenarios for COUCH GAMEPADS (registered in tools/scenarios/index.js). Each export is
// `async (server) => void` using withPage / assert from ../playtest.js.
//
//   pads - four controllers and nothing else: no keyboard press anywhere in this scenario. A pad opens PLAY from
//        the title, three more sit down on the critter select, each picks a different card and stamps it, and the
//        day board opens with a party of four in seat order. This is the whole point of the feature, so it is
//        walked through the real screens rather than poked at through the input module (tools/nettest.js does
//        that). The last beat is the one that used to be impossible: a fifth pad has no seat to take.
import { withPage, assert } from '../playtest.js';

/** Four ports, all resting; `press(i, ...buttons)` is that list with one pad holding something. */
const IDLE = [null, null, null, null];
const A = 0, B = 1, RIGHT = 15;
function press(i, ...buttons) {
  const list = IDLE.slice();
  list[i] = { down: buttons };
  return list;
}

export const SCENARIOS = {
  async pads(server) {
    await withPage(server, 'skipTo=title', async (api) => {
      await api.step(5);
      assert((await api.screen()) === 'title', 'the title comes up');

      // ---- a pad opens the game ----
      await api.pads(IDLE);
      await api.step(2);
      assert((await api.padOf(0)) === -1, 'a resting pad takes no seat');
      await api.pads(press(0, A));
      await api.step(2);
      await api.pads(IDLE);
      await api.step(4);
      assert((await api.padOf(0)) === 0, 'the pad that pressed A is in seat 1');
      assert((await api.screen()) === 'select', `and its A opened PLAY (now on ${await api.screen()})`);

      // ---- three more sit down, one at a time, without stamping anything ----
      const s0 = await api.summary();
      assert(s0.top.seats.length === 1 && s0.top.seats[0].ready === false, `only P1 is seated, unstamped (${JSON.stringify(s0.top.seats)})`);
      for (const pad of [1, 2, 3]) {
        await api.pads(press(pad, A));
        await api.step(2);
        await api.pads(IDLE);
        await api.step(4);
        assert((await api.padOf(pad)) === pad, `pad ${pad + 1} took seat ${pad + 1}`);
      }
      const s1 = await api.summary();
      assert(s1.top.seats.length === 4, `four pads fill the couch (${s1.top.seats.length} seated)`);
      assert(s1.top.seats.every((s) => !s.ready), 'the button that sat each of them down did NOT also stamp their card');
      assert(s1.top.seats.map((s) => s.slot).join() === '0,1,2,3', `and the seats are dense, in slot order (${s1.top.seats.map((s) => s.slot).join()})`);
      assert(s1.top.seats[1].critter === 'sorrel' && s1.top.seats[3].critter === 'cress', `each seat opens on its own card (${s1.top.seats.map((s) => s.critter).join()})`);

      // ---- a pad's d-pad moves only its own cursor ----
      await api.pads(press(3, RIGHT));
      await api.step(2);
      await api.pads(IDLE);
      await api.step(4);
      const s2 = await api.summary();
      assert(s2.top.seats[3].critter === 'rowan', `seat 4's d-pad moved its own cursor onto the fifth card (${s2.top.seats[3].critter})`);
      assert(s2.top.seats[0].critter === 'barley' && s2.top.seats[1].critter === 'sorrel' && s2.top.seats[2].critter === 'chicory', 'and left every other cursor where it was');

      // walk seat 4 the rest of the way round the cast (five cards, so four more steps from the fifth), back onto
      // its own card: four distinct critters again
      for (let k = 0; k < 4; k++) {
        await api.pads(press(3, RIGHT));
        await api.step(2);
        await api.pads(IDLE);
        await api.step(4);
      }
      assert((await api.summary()).top.seats[3].critter === 'cress', 'and a lap of the cast (wrapping past the fifth card) brings it home');

      // ---- B un-stamps, and a run only starts when every seat has stamped ----
      for (const pad of [0, 1, 2, 3]) {
        await api.pads(press(pad, A));
        await api.step(2);
        await api.pads(IDLE);
        await api.step(4);
      }
      const s3 = await api.summary();
      assert(s3.top.seats.every((s) => s.ready), 'a second A stamps READY on all four cards');
      await api.pads(press(2, B));
      await api.step(2);
      await api.pads(IDLE);
      await api.step(4);
      const s4 = await api.summary();
      assert(s4.top.seats[2].ready === false && s4.top.starting === false, "seat 3's B lifts its stamp and calls the countdown off");
      await api.shot('select-four-pads');                  // four jam-jar cursors, three stamps and a change of mind
      await api.pads(press(2, A));
      await api.step(2);
      await api.pads(IDLE);
      await api.step(4);

      // ---- the run opens with a party of four ----
      await api.step(90);                                  // the stamps hold, then the fade hands over to the board
      const s5 = await api.summary();
      assert(s5.screen === 'stage', `a full couch of readies opens the day board (now on ${s5.screen})`);
      assert(s5.run && s5.run.party.length === 4, `the run is seated with four critters (${JSON.stringify(s5.run && s5.run.party)})`);
      assert(s5.run.party.join() === 'barley,sorrel,chicory,cress', `one per pad, in seat order (${s5.run.party.join()})`);

      // ---- a fifth controller has nowhere to sit ----
      await api.pads([null, null, null, null, { down: [A] }]);
      await api.step(4);
      await api.pads(null);
      assert((await api.errors()).length === 0, 'and a fifth pad pressing against a full couch breaks nothing');
    });
  },
};
