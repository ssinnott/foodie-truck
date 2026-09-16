// Fixed-timestep game loop (ARCHITECTURE.md section 3). Logic at exactly 60 Hz, render per rAF.
import { DT, MAX_STEPS_PER_FRAME } from '../constants.js';

/**
 * Create the main loop.
 * @param {{ update: () => void, render: () => void, testMode?: boolean, canUpdate?: (() => boolean) | null }} o
 *   In testMode the loop never self-runs; `step(n)` drives it (n fixed updates + 1 render).
 *   `canUpdate` gates the fixed step without gating rendering: lockstep netcode returns false while
 *   waiting for the peer's input, so the game keeps drawing (and can show "waiting for peer")
 *   without advancing the simulation. `step(n)` ignores the gate so tests stay in control.
 * @returns {{ start(): void, stop(): void, step(n?: number): void, fps: number, running: boolean, frame: number, testMode: boolean }}
 */
export function createLoop({ update, render, testMode = false, canUpdate = null }) {
  let running = false;
  let rafId = 0;
  let last = 0;
  let acc = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsTime = 0;
  let frame = 0;
  let lastGated = false;

  function tick(now) {
    if (!running) return;
    const dtSec = Math.min((now - last) / 1000, 0.25);
    last = now;
    acc += dtSec;
    let steps = 0;
    let gated = false;
    while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      if (canUpdate && !canUpdate()) { gated = true; break; }
      update();
      frame++;
      acc -= DT;
      steps++;
    }
    lastGated = gated;
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;      // drop backlog rather than spiral
    // A gated break leaves steps < MAX, so the guard above never fires and `acc` keeps growing for
    // the whole stall. A 300 ms wait would then replay ~18 queued steps in bursts of 5 the instant
    // the peer's input arrives, fast-forwarding the match. Keep at most one step of credit.
    else if (gated) acc = Math.min(acc, DT);
    render();
    fpsFrames++;
    fpsTime += dtSec;
    if (fpsTime >= 0.5) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }
    rafId = requestAnimationFrame(tick);
  }

  const loop = {
    testMode,
    /** Start the rAF loop. No-op in testMode unless `force` is set (netplay tests need the real gated loop). */
    start(force = false) {
      if ((testMode && !force) || running) return;
      running = true;
      last = performance.now();
      acc = 0;
      rafId = requestAnimationFrame(tick);
    },
    /** Stop the rAF loop. */
    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    },
    /** Run n fixed updates then one render, ignoring `canUpdate`. Used by tests; also works in normal mode. */
    step(n = 1) {
      for (let i = 0; i < n; i++) { update(); frame++; }
      render();
    },
    get fps() { return testMode ? 60 : fps; },
    get running() { return running; },
    get frame() { return frame; },
    /** True when the last tick was held back by `canUpdate` (netplay draws a waiting overlay on this). */
    get gated() { return lastGated; },
  };
  return loop;
}
