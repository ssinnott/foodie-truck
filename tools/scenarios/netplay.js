// Online co-op scenarios for tools/playtest.js (docs/MULTIPLAYER.md): real headless pages in ONE browser
// context (BroadcastChannel signalling needs it), real WebRTC data channels over loopback, one lockstep match.
// The room is driven through the window.__game net hooks (net/session.js installNetHooks) rather than through
// the lobby screen, so these scenarios test the session itself and survive any redraw of that screen.
// The match opens on the ORCHARD, not the map: the map has one shared truck, so it cannot show that a key held
// on one machine is attributed to the seat that held it and to no other. The orchard gives every seat its own x.
//
//   netplay - two pages: host key -> join -> picks -> ready -> a match, 120+ frames with no desync,
//             a key held on the GUEST moving seat 1 identically on both machines, and the host's session
//             ending cleanly when the guest's page closes.
//   netquad - four pages, every guest refusing direct guest-guest links (?netrelay=1) so their traffic rides
//             the host's relay; the same checks, then guests leaving one by one: the survivors retire each
//             seat on ONE agreed frame and stay identical, and the last player left is handed the end.
//   netboard - the room's OPENING scene: a two-peer match starts on the day board (net/session.js START_SCENE),
//             both machines lay the same day out from the seed, and the guest's confirm opens the truck on
//             both. A shared menu is the one screen where one seat's press must move something on everybody's
//             machine.
//   netscenes - a two-peer room opened on EVERY mini-game in turn, both seats holding keys, and the desync
//             canary watched throughout. The canary hashes game.run plus the top screen's checksumFields()
//             every 30 frames (net/session.js afterStep), so this is the only test that can catch a screen
//             whose checksumFields() misses a field its update() moves - a reader cannot prove that, and the
//             room is where it bites. The first six mini-games shipped without it.
import { withPeers, assert } from '../playtest.js';
import { SCENES } from '../../src/game/run.ts';

const ROOM_CODE = /^[23456789BCDFGHJKMNPQRSTVWXYZ]{6}$/;
const TIMEOUT = 30000;

const netState = (p) => p.evaluate(() => window.__game.netState());
/** Per-seat [slot, x, count] off the top screen: the orchard's own summary (see the match scene below). */
const dotsOf = (p) => p.evaluate(() => ((window.__game.summary().top || {}).seats || []).filter((s) => Array.isArray(s)));
const dot = (dots, slot) => (dots.find((d) => d[0] === slot) || [slot, null, null]);
const open = (pages) => pages.filter((p) => !p.isClosed());
/** Wait for every open page to satisfy a predicate on its netState. */
const waitAll = (pages, fn, arg = null) => Promise.all(open(pages).map((p) => p.waitForFunction(`(${fn.toString()})(window.__game.netState(), ${JSON.stringify(arg)})`, null, { timeout: TIMEOUT })));
/** Wait until every open page's lockstep frame is past `f`. */
const waitFrames = (pages, f) => waitAll(pages, (n, want) => !!n && n.frame > want, f);

/**
 * Run one wait, and if it times out say WHICH one and what every page thought was happening: a room has a
 * lot of ways to be stuck and a bare "waitForFunction timed out" names none of them.
 */
async function step(label, pages, fn) {
  try { return await fn(); } catch (e) {
    const seen = await Promise.all(open(pages).map((p) => p.evaluate(() => {
      const s = window.__game.netState(), n = window.__game.net();
      return s && {
        state: s.state, slot: s.slot, seated: s.party.length, frame: s.frame, waiting: s.waiting, missing: s.missing,
        dropped: s.dropped, reason: s.reason || s.error, ready: s.party.map((m) => m.ready), rttReady: s.rttReady,
        links: n ? [...n.links.values()].map((l) => `${l.isHost ? 'host' : 'peer'}:${l.open ? 'open' : 'forming'}:${l.peer && l.peer.pc ? l.peer.pc.connectionState : '?'}`) : [],
        errors: window.__game.errors.slice(0, 2),
      };
    }).catch(() => null)));
    throw new Error(`${label}: ${String(e.message).split('\n')[0]} | pages: ${JSON.stringify(seen)}`);
  }
}

/** Host on pages[0], join from the rest, and wait until everyone is seated in the lobby. Returns the code. */
async function fillRoom(pages) {
  const code = await pages[0].evaluate(() => window.__game.netHost({ transport: 'broadcast' }));
  assert(ROOM_CODE.test(code), `hosting mints a six-character host key (${code})`);
  for (const p of pages.slice(1)) await p.evaluate((c) => window.__game.netJoin(c, { transport: 'broadcast' }), code);
  await step(`${pages.length} peers seated in the lobby`, pages, () => waitAll(pages, (n, want) => !!n && n.state === 'lobby' && n.party.length === want, pages.length));
  return code;
}

/**
 * Everybody picks a critter and readies up; the host auto-starts once the latency measurement is in. `scene` is
 * the index into game/run.js SCENES the START packet carries, and `screenId` is what that index must open.
 */
async function readyAll(pages, seats, scene = 1, screenId = 'orchard', dots = seats) {
  // The host's opening scene travels in the START packet; SCENES[1] is the orchard, where each seat walks its
  // own x, so pressRight below can prove a key is attributed to one seat and not shared out.
  await pages[0].evaluate((i) => { window.__game.net().lobby.scene = i; }, scene);
  const cast = await pages[0].evaluate(() => window.__game.critterList().length);
  // Ask for the critter that matches each peer's OWN SEAT, not its page index: guests race for the room, so
  // the host may seat page 2 in slot 1, and a pick keyed to the page index would ask for a critter its
  // neighbour already holds and be refused for the right reason at the wrong moment.
  const picks = await Promise.all(pages.map((p) => p.evaluate((c) => {
    const slot = window.__game.netState().slot;
    return window.__game.netSetCritter(c > 1 ? slot % c : 0);
  }, cast)));
  assert(picks.every(Boolean), `every peer's critter pick is accepted (cast of ${cast})`);
  if (cast > 1) {
    const clash = await pages[0].evaluate((c) => window.__game.netSetCritter(c), 1 % cast);
    assert(clash === false, 'a critter another seat holds is refused');
  } else {
    assert(picks[1] === true, 'with a cast smaller than the party, seats may share a critter');
  }
  const ok = await Promise.all(pages.map((p) => p.evaluate(() => window.__game.netReady(true))));
  assert(ok.every(Boolean), 'every peer registered its ready flag');
  await step('everyone reaches the match', pages, () => waitAll(pages, (n) => !!n && n.state === 'playing'));
  const states = await Promise.all(pages.map((p) => p.evaluate(() => ({ screen: window.__game.screen(), party: (window.__game.summary().run || { party: [] }).party.length, dots: ((window.__game.summary().top || {}).seats || []).length }))));
  assert(states.every((s) => s.screen === screenId), `the START opens the same scene on every machine (wanted ${screenId}, got ${states.map((s) => s.screen).join()})`);
  // `dots` is how many seats the OPENING SCREEN reports in its summary - the party, for a scene that stands one
  // critter per seat, and 0 for a shared menu like the day board, which has no cast on it.
  assert(states.every((s) => s.party === seats && s.dots === dots), `every machine built a run with ${seats} seats (${states.map((s) => s.party).join()}, ${states.map((s) => s.dots).join()} on screen)`);
}

/** Start the real gated loop everywhere and let the match run past `frames`; check the lockstep invariants. */
async function runMatch(pages, frames) {
  for (const p of pages) await p.evaluate(() => window.__game.loop.start(true));
  await step(`${frames} lockstep frames`, pages, () => waitFrames(pages, frames));
  return checkLockstep(pages, `after ${frames} frames`);
}

async function checkLockstep(pages, when) {
  const states = await Promise.all(open(pages).map(netState));
  assert(states.every((s) => !s.desync), `no checksum desync ${when} (${JSON.stringify(states.map((s) => s.desync))})`);
  const frames = states.map((s) => s.frame);
  const spread = Math.max(...frames) - Math.min(...frames);
  assert(spread <= states[0].delay + 2, `peers stay in lockstep ${when} (frames ${frames.join()}, delay ${states[0].delay})`);
  assert(states[0].delay >= 2, `a sane input delay was negotiated (${states[0].delay} frames)`);
  return states;
}

/**
 * Hold ArrowRight on `page` (whose seat is `slot`) for ~40 lockstep frames. Everyone plays on P1's keys, so
 * that press is that seat's input on EVERY machine; the seat's dot must move right by the same amount on all.
 */
async function pressRight(pages, page, slot, label) {
  const before = await Promise.all(pages.map(dotsOf));
  const f0 = (await netState(pages[0])).frame;
  await page.bringToFront();
  await page.keyboard.down('ArrowRight');
  await step('40 frames with the key held', pages, () => waitFrames([pages[0]], f0 + 40));
  await page.keyboard.up('ArrowRight');
  // The release reaches every machine `delay` frames later; wait it out so the dots are at rest again.
  const f1 = (await netState(pages[0])).frame;
  await step('the release lands everywhere', pages, () => waitFrames(pages, f1 + 12));
  const after = await Promise.all(pages.map(dotsOf));
  const moved = after.map((d, i) => dot(d, slot)[1] - dot(before[i], slot)[1]);
  assert(moved.every((m) => m >= 40), `${label}: the held key moved seat ${slot}'s dot right on every machine (${moved.join()} px)`);
  assert(new Set(moved).size === 1, `${label}: ...by the SAME amount everywhere (${moved.join()})`);
  // position only: a seat standing still can now catch an apple that lands on it (the whole body is the catch box),
  // so its count may tick without anybody touching its keys
  const still = after.every((d, i) => d.filter((x) => x[0] !== slot).every((x) => dot(before[i], x[0])[1] === x[1]));
  assert(still, `${label}: nobody else's dot moved`);
}

/**
 * The mini-games a room is held on, by their game/run.js SCENES index. The orchard is netplay's own scene and is
 * covered there; these are the six that never had a room run on them.
 */
const ROOM_SCENES = Object.freeze([[2, 'pond'], [3, 'coop'], [5, 'dairy'], [6, 'mill'], [7, 'hive'], [8, 'garden']]);
/** Frames a room runs on each scene. 200 is past six checksum exchanges (one every 30 frames) and past the
 *  telegraph-and-hazard cycle of every scene in the list, so a field left out of a checksum has fired by then. */
const SCENE_FRAMES = 200;

export const SCENARIOS = {
  /**
   * Hold a two-peer room on every mini-game in turn with both seats pushing, and watch the desync canary. A screen
   * whose checksumFields() misses a field that update() moves passes every single-page test there is and only
   * fails here, which is why this exists.
   */
  async netscenes(server) {
    for (const [scene, id] of ROOM_SCENES) {
      const params = ['transport=broadcast&skipTo=title', 'transport=broadcast&skipTo=title'];
      await withPeers(server, params, async (pages) => {
        await fillRoom(pages);
        await readyAll(pages, 2, scene, id);
        await runMatch(pages, 60);
        // both seats push at once: every scene in the list either walks on the stick or acts on the buttons, and
        // a room where nobody presses anything is a room where nothing can diverge
        for (const p of pages) { await p.bringToFront(); await p.keyboard.down('ArrowRight'); await p.keyboard.down('KeyZ'); }
        const f0 = (await netState(pages[0])).frame;
        await step(`${SCENE_FRAMES} frames of ${id} with both seats pushing`, pages, () => waitFrames(pages, f0 + SCENE_FRAMES));
        for (const p of pages) { await p.bringToFront(); await p.keyboard.up('KeyZ'); await p.keyboard.up('ArrowRight'); }
        const f1 = (await netState(pages[0])).frame;
        await step('the releases land everywhere', pages, () => waitFrames(pages, f1 + 12));
        await checkLockstep(pages, `after ${SCENE_FRAMES} frames of ${id}`);
        // the canary only compares a hash; compare the SIM itself too, so a scene whose checksum is too thin is
        // caught by the thing the checksum is standing in for
        const tops = await Promise.all(pages.map((p) => p.evaluate(() => JSON.stringify(window.__game.game.screen.checksumFields()))));
        assert(tops[0] === tops[1], `${id}: both machines hold identical checksum fields after the push`);
        const errs = await Promise.all(pages.map((p) => p.evaluate(() => window.__game.errors.length)));
        assert(errs.every((e) => e === 0), `${id}: no runtime errors in the room (${errs.join()})`);
      });
    }
  },

  /**
   * The day board, online: the scene an online match actually opens on. Both machines lay the same day out from
   * the START packet's seed, and the GUEST's confirm opens the truck on both of them.
   */
  async netboard(server) {
    const params = ['transport=broadcast&skipTo=title', 'transport=broadcast&skipTo=title'];
    await withPeers(server, params, async (pages, apis) => {
      await fillRoom(pages);
      await readyAll(pages, 2, SCENES.indexOf('stage'), 'stage', 0);
      await runMatch(pages, 60);
      const plan = (p) => p.evaluate(() => { const r = window.__game.summary().run; return JSON.stringify([r.recipes, r.lines, r.needs]); });
      const plans = await Promise.all(pages.map(plan));
      assert(plans.every((x) => x === plans[0]), 'both machines lay out the same day from the seed (menu, lines and shopping list)');
      await apis[0].shot('32-netplay-board');
      // the GUEST opens the truck: one press, seen by both
      const guest = pages[1];
      const f1 = (await netState(pages[0])).frame;
      await guest.bringToFront();
      await guest.keyboard.down('KeyZ');
      await step('the confirm lands everywhere', pages, () => waitFrames(pages, f1 + 20));
      await guest.keyboard.up('KeyZ');
      const f2 = (await netState(pages[0])).frame;
      await step('the fade hands the board over', pages, () => waitFrames(pages, f2 + 60));
      const took = await Promise.all(pages.map((p) => p.evaluate(() => ({ screen: window.__game.screen(), dest: window.__game.summary().top.dest }))));
      assert(took.every((t) => t.screen === 'map'), `the board hands both machines to the map (${took.map((t) => t.screen).join()})`);
      assert(took.every((t) => t.dest === took[0].dest), `...pointed at the same first landmark (${took.map((t) => t.dest).join()})`);
      await checkLockstep(pages, 'after the board handed over');
    });
  },

  async netplay(server) {
    const params = ['transport=broadcast&skipTo=title', 'transport=broadcast&skipTo=title'];
    await withPeers(server, params, async (pages, apis) => {
      const [host, guest] = pages;
      const code = await fillRoom(pages);
      const [hs, gs] = await Promise.all(pages.map(netState));
      assert(hs.slot === 0 && gs.slot === 1, `the host owns seat 0 and the guest seat 1 (got ${hs.slot}/${gs.slot})`);
      assert(hs.room === code && gs.room === code, 'both peers agree on the host key');
      assert(hs.party[1].direct && gs.party[0].direct, 'the pair holds a direct link');
      assert(hs.party.every((m) => !m.ready), 'nobody is ready yet');
      await readyAll(pages, 2);
      await runMatch(pages, 120);
      await pressRight(pages, guest, 1, 'netplay');
      await apis[0].shot('30-netplay-host');
      await apis[1].shot('31-netplay-guest');

      // Closing the guest must end the host's session cleanly: two players is nobody left to stay in step with.
      const f = (await netState(host)).frame;
      await guest.close();
      await step('the host notices the guest has gone', pages, () => waitAll([host], (n) => !!n && n.state === 'ended'));
      const end = await netState(host);
      assert(end.state === 'ended' && end.players === 2, `the host's session ended cleanly with 2 players (${end.reason})`);
      assert(f > 120, `the match had run ${f} lockstep frames before the disconnect`);
      // ...and the loop comes off the gate: the survivor keeps playing on their own keys.
      const g0 = await host.evaluate(() => window.__game.game.frame);
      await host.waitForFunction((g) => window.__game.game.frame > g + 10, g0, { timeout: TIMEOUT });
      const solo = await host.evaluate(() => ({ screen: window.__game.screen(), errs: window.__game.errors.length }));
      assert(solo.screen === 'orchard' && solo.errs === 0, `the host keeps playing on their own with no errors (${solo.screen})`);
    });
  },

  async netquad(server) {
    const guest = 'transport=broadcast&skipTo=title&netrelay=1';
    await withPeers(server, ['transport=broadcast&skipTo=title', guest, guest, guest], async (pages, apis) => {
      await fillRoom(pages);
      const seated = await Promise.all(pages.map(netState));
      // Three guests race for the room, so seats go in the order the host hears them. Index by seat from here on.
      assert(seated.map((s) => s.slot).slice().sort().join() === '0,1,2,3', `the four peers take one seat each (${seated.map((s) => s.slot).join()})`);
      assert(seated[0].slot === 0 && seated.every((s) => s.players === 4), 'the host keeps seat 0 and everyone knows the party is four strong');
      const roster = JSON.stringify(seated[0].party.map((m) => [m.slot, m.critter]));
      assert(seated.every((s) => JSON.stringify(s.party.map((m) => [m.slot, m.critter])) === roster), 'all four peers hold the same roster');
      // ?netrelay=1: every guest links to the host and to nobody else, so guest-guest traffic has to be relayed.
      assert(seated.slice(1).every((s) => s.party[0].direct), 'every guest holds a direct link to the host');
      assert(seated.slice(1).every((s) => s.party.filter((m) => !m.local && m.slot !== 0).every((m) => !m.direct)), '...and none to the other guests');
      assert(seated[0].party.slice(1).every((m) => m.direct), 'the host holds a direct link to every guest');

      await readyAll(pages, 4);
      await runMatch(pages, 120);
      const last = seated.map((s, i) => [s.slot, i]).sort((a, b) => b[0] - a[0])[0][1];   // the highest seat: a relayed guest
      await pressRight(pages, pages[last], seated[last].slot, 'netquad');
      await apis[0].shot('32-netquad-host');

      // One guest leaves: the host names a frame, everybody retires that seat on it, and the other three play on.
      const gone = seated[last].slot;
      await pages[last].close();
      const rest = open(pages);
      await step('the survivors retire the seat that left', rest, () => waitAll(rest, (n, s) => !!n && n.dropped.includes(s), gone));
      const after = await Promise.all(rest.map(netState));
      assert(after.every((s) => s.state === 'playing'), `losing one of four does NOT end the match (${after.map((s) => s.state).join()})`);
      const dropFrames = await Promise.all(rest.map((p) => p.evaluate((s) => window.__game.net().dropFrameOf(s), gone)));
      assert(new Set(dropFrames).size === 1 && dropFrames[0] > 0, `every survivor retires the seat on the SAME frame (${dropFrames.join()})`);
      const f0 = Math.max(...after.map((s) => s.frame));
      await step('120 more frames with three left', rest, () => waitFrames(rest, f0 + 120));
      await checkLockstep(rest, 'after the drop');
      const dots = await Promise.all(rest.map(dotsOf));
      assert(dots.every((d) => JSON.stringify(d) === JSON.stringify(dots[0])), `the three that remain hold identical dots (${JSON.stringify(dots[0])})`);
      await pressRight(rest, rest[1], (await netState(rest[1])).slot, 'netquad after the drop');

      // Down to two, then to one: the last player left is handed the end of the session.
      const next = rest[rest.length - 1], nextSlot = (await netState(next)).slot;
      await next.close();
      const pair = open(pages);
      await step('the pair retires the second seat that left', pair, () => waitAll(pair, (n, s) => !!n && n.dropped.includes(s), nextSlot));
      assert((await netState(pair[0])).state === 'playing', 'a party of four down to two is still a match');
      await pair[1].close();
      await step('the last player left ends the session', [pages[0]], () => waitAll([pages[0]], (n) => !!n && n.state === 'ended'));
      const alone = await netState(pages[0]);
      const errs = await pages[0].evaluate(() => window.__game.errors.length);
      assert(alone.state === 'ended' && alone.players === 4 && errs === 0, `the last player left is handed the end (${alone.reason}), with no errors`);
    });
  },
};

/**
 * netweek - the WEEK on the wire. The host is mid-week, with a record on disk and three days already banked; the
 *        guest has never played. One byte of START carries which DAY the party opens on, and the week's RECORD
 *        deliberately does not travel: `weekStars` is hashed by the canary, so a host who walked in through
 *        CONTINUE carrying days no guest can know about would desync the room on frame one. `startRun` beginning
 *        it empty on every peer is what stops that, and this is the test that would catch it coming back.
 */
SCENARIOS.netweek = async (server) => {
  const { DAYS_PER_WEEK, SCENES } = await import('../../src/game/run.ts');
  const day = DAYS_PER_WEEK - 2, stage = SCENES.indexOf('stage');
  await withPeers(server, ['transport=broadcast&skipTo=title', 'transport=broadcast&skipTo=title'], async (pages) => {
    // the host is mid-week: a saved record, and days already banked that no guest can know about
    await pages[0].evaluate((d) => localStorage.setItem('foodie-truck.week', JSON.stringify({
      v: 1, seed: 481920, day: d, critters: [0, 1], stars: [12, 18, 14], takings: [1200, 1800, 1400],
    })), day);
    await fillRoom(pages);
    await pages[0].evaluate((d) => { window.__game.net().lobby.day = d; }, day);
    await readyAll(pages, 2, stage, 'stage', 0);   // the day board draws no seat dots: nobody stands on it
    await runMatch(pages, 60);
    const runs = await Promise.all(pages.map((p) => p.evaluate(() => {
      const r = window.__game.game.run;
      return { day: r.day, stars: r.weekStars.slice(), takings: r.weekTakings.slice(), score: r.score, recipes: r.recipes.slice(), lines: r.lines.length };
    })));
    assert(runs[0].day === day && runs[1].day === day, `the host's day crosses in START (${runs.map((r) => r.day).join()}, wanted ${day})`);
    assert(runs.every((r) => r.stars.length === 0 && r.takings.length === 0), `and the week's RECORD does not: every peer starts it empty (${JSON.stringify(runs.map((r) => r.stars))})`);
    assert(JSON.stringify(runs[0]) === JSON.stringify(runs[1]), `both machines lay the same day out (${JSON.stringify(runs)})`);
    await checkLockstep(pages, `on the host's day ${day + 1} with a week saved on the host alone`);
    // (that a GUEST writes no week of its own is `weekOnlineGuard` in tools/scenarios/week.js, not here: both
    // peers of a broadcast room are pages of one browser on one origin, so they share a localStorage and this
    // file cannot tell whose record it is looking at.)
  });
};

