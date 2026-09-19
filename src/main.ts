// Boot: create services, Game, screens, loop; install window.__game debug/test hooks (docs/ARCHITECTURE.md section 6).
import { VIEW_W, VIEW_H } from './constants.ts';
import { createLoop } from './lib/engine/loop.ts';
import { input } from './engine/input.ts';
import { audio } from './engine/audio.ts';
import { rng } from './lib/engine/rng.ts';
import { createCanvas } from './lib/engine/canvas.ts';
import { Game } from './game/game.ts';
import { startRun, SCENES } from './game/run.ts';
import { CRITTERS } from './content/critters/index.ts';
import { installNetHooks } from './net/session.ts';
import { TitleScreen } from './game/screens/title.ts';
import { LobbyScreen } from './game/screens/lobby.ts';
import { SelectScreen } from './game/screens/select.ts';
import { StageScreen } from './game/screens/stage.ts';
import { MapScreen } from './game/screens/map.ts';
import { OrchardScreen } from './game/screens/orchard.ts';
import { PondScreen } from './game/screens/pond.ts';
import { CoopScreen } from './game/screens/coop.ts';
import { DairyScreen } from './game/screens/dairy.ts';
import { MillScreen } from './game/screens/mill.ts';
import { HiveScreen } from './game/screens/hive.ts';
import { GardenScreen } from './game/screens/garden.ts';
import { BrambleScreen } from './game/screens/bramble.ts';
import { HoltScreen } from './game/screens/holt.ts';
import { WoodScreen } from './game/screens/wood.ts';
import { TerraceScreen } from './game/screens/terrace.ts';
import { BeachScreen } from './game/screens/beach.ts';
import { KitchenScreen } from './game/screens/kitchen.ts';
import { ResultsScreen } from './game/screens/results.ts';
import { LineScreen } from './game/screens/line.ts';
import { GalleryScreen } from './game/screens/gallery.ts';
import { ControlsScreen } from './game/screens/controls.ts';
import * as bindings from './engine/bindings.ts';
import { PauseScreen } from './game/screens/pause.ts';

/** Parse URL params into game options. */
export function parseOptions(search = window.location.search) {
  const q = new URLSearchParams(search);
  const flag = (k) => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false';
  const autotest = flag('autotest'), debug = flag('debug');
  const devOnly = autotest || debug;
  const critters = (q.get('critters') || '').split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n >= 0);
  return {
    autotest, debug,
    seed: q.has('seed') ? Number(q.get('seed')) || 1 : (autotest ? 1 : (Date.now() & 0x7fffffff)),
    // a pinned seed (?seed=N, or test mode) holds for every run on the page; otherwise each local run draws its own
    seedFixed: q.has('seed') || autotest,
    // ?skipTo=<screen id> jumps straight to a screen with a run already started (dev / capture / test only)
    skipTo: devOnly ? (q.get('skipTo') || '') : '',
    // ?critters=0,1,2,3 seats that many local players on those cast indices for a skipTo run
    critters: critters.length ? critters : [0],
    // ?place=orchard picks the landmark for a skipTo mini-game; ?order=N picks the order
    place: devOnly ? (q.get('place') || '') : '',
    order: devOnly ? (parseInt(q.get('order') || '0', 10) || 0) : 0,
    // ?recipes=0,2 fixes the day's menu to those ORDERS indices (a scenario keeps a day to the landmarks it can play)
    recipes: devOnly ? (q.get('recipes') || '').split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n >= 0) : [],
    // Online co-op invite links: ?room=CODE joins that room, ?host=1 hosts one.
    room: (q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
    host: flag('host'),
    // ?defaults=1 boots on stock key and button bindings without clearing the saved ones: the way back in for a
    // player who has bound themselves into a corner, and the clean slate every playtest starts from.
    defaults: flag('defaults'),
    // ?transport=broadcast is the same-machine end-to-end test hook; room codes over MQTT are what the UI offers.
    transport: q.get('transport') === 'broadcast' ? 'broadcast' : 'mqtt',
    netrelay: devOnly && flag('netrelay'),
  };
}

const hooks = window.__game || (window.__game = { ready: false, errors: [] });
if (!Array.isArray(hooks.errors)) hooks.errors = [];
let lastErrorMsg = '';
function recordError(e) {
  const msg = e && e.stack ? String(e.stack).split('\n').slice(0, 2).join(' ') : String(e && e.message ? e.message : e);
  if (msg === lastErrorMsg) return; // the same error thrown every frame is recorded once
  lastErrorMsg = msg;
  if (hooks._record) hooks._record(msg);
  else { hooks.errors.push(msg); console.warn(msg); }
}
window.addEventListener('error', (e) => { if (!hooks._record) hooks.errors.push(String(e.message || e.error)); });
window.addEventListener('unhandledrejection', (e) => { if (!hooks._record) hooks.errors.push('unhandled rejection: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)); });

function boot() {
  const options = parseOptions();
  rng.seed(options.seed);
  const view = createCanvas(document.getElementById('game') || document.body);
  const ctx = view.ctx;
  // Saved key and button bindings come back BEFORE the first listener is attached, so the very first keypress is
  // read through the player's own bindings rather than the defaults (engine/bindings.js). `?defaults=1` boots on
  // stock bindings without touching what is stored - a way back in for a player who has bound themselves out.
  if (!options.defaults) bindings.load();
  input.init(view.canvas);
  // Sound comes on with the first key or tap (the browser's autoplay rule); in autotest no context is ever made.
  audio.testMode = options.autotest;
  audio.init();

  const game = new Game({ input, audio, rng, options });
  game.critters = CRITTERS;
  game.registerScreen('title', (g) => new TitleScreen(g));
  game.registerScreen('lobby', (g) => new LobbyScreen(g));
  game.registerScreen('select', (g) => new SelectScreen(g));
  game.registerScreen('stage', (g) => new StageScreen(g));
  game.registerScreen('map', (g) => new MapScreen(g));
  game.registerScreen('orchard', (g) => new OrchardScreen(g));
  game.registerScreen('pond', (g) => new PondScreen(g));
  game.registerScreen('coop', (g) => new CoopScreen(g));
  game.registerScreen('dairy', (g) => new DairyScreen(g));
  game.registerScreen('mill', (g) => new MillScreen(g));
  game.registerScreen('hive', (g) => new HiveScreen(g));
  game.registerScreen('garden', (g) => new GardenScreen(g));
  game.registerScreen('bramble', (g) => new BrambleScreen(g));
  game.registerScreen('holt', (g) => new HoltScreen(g));
  game.registerScreen('wood', (g) => new WoodScreen(g));
  game.registerScreen('terrace', (g) => new TerraceScreen(g));
  game.registerScreen('beach', (g) => new BeachScreen(g));
  game.registerScreen('kitchen', (g) => new KitchenScreen(g));
  game.registerScreen('results', (g) => new ResultsScreen(g));
  game.registerScreen('line', (g) => new LineScreen(g));
  game.registerScreen('gallery', (g) => new GalleryScreen(g));
  game.registerScreen('controls', (g) => new ControlsScreen(g));
  game.registerScreen('pause', (g) => new PauseScreen(g));

  const loop = createLoop({
    update() {
      try {
        // Netplay first: beforeStep samples the local devices, records them into lockstep and injects every
        // seat's mask for THIS frame with input.setVirtual, which update() then turns into edges and buffers.
        if (game.net && game.net.beforeStep) game.net.beforeStep();
        input.update();
        // M mutes, unless a seat has bound M to an action, a rebind is listening for it, or the lobby is spelling a
        // host key with it. Local only: mute is not simulation state, so a peer never hears about it.
        if (!input.capturing() && !bindings.isKeyBound('KeyM') && !(game.screen && game.screen.typing) && input.typedCodes().indexOf('KeyM') >= 0) audio.toggleMute();
        game.update();
        if (game.net && game.net.afterStep) game.net.afterStep();
      } catch (e) { recordError(e); }
    },
    render() {
      try { game.draw(ctx); view.present(); } catch (e) { recordError(e); }
    },
    testMode: options.autotest,
    canUpdate: () => !(game.net && game.net.active && game.net.canStep && !game.net.canStep()),
  });

  // Opening screen: a dev/test jump lands on any screen with a run already started (game/run.js).
  const skip = options.skipTo;
  if (skip && game.factories[skip] && skip !== 'title') {
    if (skip !== 'gallery' && skip !== 'lobby' && skip !== 'controls') startRun(game, { seed: options.seed, critters: options.critters, order: options.order, recipes: options.recipes });
    game.reset(skip, { place: options.place, autoRoom: skip === 'lobby' });
  } else if (options.room || options.host) {
    game.reset('lobby', { autoRoom: true });
  } else {
    game.reset('title');
  }

  Object.assign(hooks, {
    game, input, audio, rng, options, loop,
    scenes: SCENES,
    step(n = 1) { loop.step(n); },
    screen() { return game.screenId(); },
    /** Which screens exist, so a test can visit every one. */
    screenIds() { return game.screenIds; },
    summary() {
      const top = game.screen;
      return { screen: game.screenId(), frame: game.frame, run: game.run ? game.run.summary() : null, net: game.net ? game.net.summary() : null, top: top ? top.summary() : {}, errors: hooks.errors.slice() };
    },
    /** Jump to a screen with a run started (tests, captures). */
    goto(id, params = {}) {
      if (!game.factories[id]) throw new Error('no screen ' + id);
      if (!game.run && id !== 'title' && id !== 'gallery' && id !== 'lobby') startRun(game, { seed: options.seed, critters: options.critters, order: options.order, recipes: options.recipes });
      game.reset(id, params);
    },
    setInput(p, actions) { input.setVirtual(p, actions); },
    clearInput(p) { input.clearVirtual(p); },
    /**
     * Test hook: stand fake gamepads in for navigator.getGamepads(). `specs` is one compact entry per pad -
     * `{ down: [0, 14], axes: [x, y] }`, or null for an empty port - and null clears the whole lot again.
     */
    setPads(specs) {
      if (!specs) { input.setPadVirtual(null); return; }
      input.setPadVirtual(specs.map((g) => (g ? {
        buttons: Array.from({ length: 17 }, (_, i) => { const on = !!(g.down && g.down.indexOf(i) >= 0); return { pressed: on, value: on ? 1 : 0 }; }),
        axes: g.axes || [0, 0],
      } : null)));
    },
    padOf(p) { return input.padOf(p); },
    /** Bindings, for the tests that drive the CONTROLS screen: read them, set them, put them back to stock. */
    bindings: {
      get() { return bindings.serialize(); },
      set(data) { return bindings.deserialize(data); },
      reset() { bindings.resetAll(); bindings.save(); },
      saved() { try { return localStorage.getItem('foodie-truck.bindings'); } catch { return null; } },
    },
    critterList() { return CRITTERS.map((c) => ({ id: c.id, name: c.name })); },
    errors: hooks.errors,
    ready: true,
  });
  installNetHooks(hooks, game, input);
  if (!options.autotest) loop.start();
  else loop.step(1);
}

try { boot(); } catch (e) { recordError(e); }
export { VIEW_W, VIEW_H };
