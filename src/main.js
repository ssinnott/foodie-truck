// Boot: create services, Game, screens, loop; install window.__game debug/test hooks (docs/ARCHITECTURE.md section 6).
import { VIEW_W, VIEW_H } from './constants.js';
import { createLoop } from './engine/loop.js';
import { input } from './engine/input.js';
import { rng } from './engine/rng.js';
import { createCanvas } from './engine/canvas.js';
import { Game } from './game/game.js';
import { startRun, SCENES } from './game/run.js';
import { CRITTERS } from './content/critters/index.js';
import { installNetHooks } from './net/session.js';
import { TitleScreen } from './game/screens/title.js';
import { LobbyScreen } from './game/screens/lobby.js';
import { SelectScreen } from './game/screens/select.js';
import { StageScreen } from './game/screens/stage.js';
import { MapScreen } from './game/screens/map.js';
import { OrchardScreen } from './game/screens/orchard.js';
import { PondScreen } from './game/screens/pond.js';
import { CoopScreen } from './game/screens/coop.js';
import { DairyScreen } from './game/screens/dairy.js';
import { MillScreen } from './game/screens/mill.js';
import { HiveScreen } from './game/screens/hive.js';
import { GardenScreen } from './game/screens/garden.js';
import { KitchenScreen } from './game/screens/kitchen.js';
import { ResultsScreen } from './game/screens/results.js';
import { GalleryScreen } from './game/screens/gallery.js';
import { PauseScreen } from './game/screens/pause.js';

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
    // ?skipTo=<screen id> jumps straight to a screen with a run already started (dev / capture / test only)
    skipTo: devOnly ? (q.get('skipTo') || '') : '',
    // ?critters=0,1,2,3 seats that many local players on those cast indices for a skipTo run
    critters: critters.length ? critters : [0],
    // ?place=orchard picks the landmark for a skipTo mini-game; ?order=N picks the order
    place: devOnly ? (q.get('place') || '') : '',
    order: devOnly ? (parseInt(q.get('order') || '0', 10) || 0) : 0,
    // Online co-op invite links: ?room=CODE joins that room, ?host=1 hosts one.
    room: (q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
    host: flag('host'),
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
  input.init(view.canvas);

  const game = new Game({ input, rng, options });
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
  game.registerScreen('kitchen', (g) => new KitchenScreen(g));
  game.registerScreen('results', (g) => new ResultsScreen(g));
  game.registerScreen('gallery', (g) => new GalleryScreen(g));
  game.registerScreen('pause', (g) => new PauseScreen(g));

  const loop = createLoop({
    update() {
      try {
        // Netplay first: beforeStep samples the local devices, records them into lockstep and injects every
        // seat's mask for THIS frame with input.setVirtual, which update() then turns into edges and buffers.
        if (game.net && game.net.beforeStep) game.net.beforeStep();
        input.update();
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
    if (skip !== 'gallery' && skip !== 'lobby') startRun(game, { seed: options.seed, critters: options.critters, order: options.order });
    game.reset(skip, { place: options.place, autoRoom: skip === 'lobby' });
  } else if (options.room || options.host) {
    game.reset('lobby', { autoRoom: true });
  } else {
    game.reset('title');
  }

  Object.assign(hooks, {
    game, input, rng, options, loop,
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
      if (!game.run && id !== 'title' && id !== 'gallery' && id !== 'lobby') startRun(game, { seed: options.seed, critters: options.critters, order: options.order });
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
