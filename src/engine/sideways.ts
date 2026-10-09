// A phone held upright plays the game ON ITS SIDE (docs/ARCHITECTURE.md section 3).
//
// The game is 16:9 and a phone held upright is the other way round. The page used to cover the game with TURN YOUR
// DEVICE SIDEWAYS until it was - and a phone with its rotation lock on never is, however it is held, because the
// page stays upright: for that player the notice WAS the game. Now index.html turns the canvas a quarter turn
// clockwise instead (its `(hover: none) and (orientation: portrait)` rule), sized so the game's long side runs down
// the screen, and the player turns the phone anticlockwise - top to the left - to play. A phone whose rotation is
// unlocked turns the page landscape as it goes, the rule stops matching, and the game comes out the right way up
// whichever way the phone was turned.
//
// This module is the other half: a contact on a turned canvas has to be measured THROUGH the turn. The canvas
// library's toInternal maps a client point by the element's bounding rect, which for a turned element is the turned
// box - x and y would come out swapped and one of them backwards. turnSideways() wraps it on the view, so
// engine/touch.ts and engine/links.ts go on asking the view and get game-space points whichever way up the page is.
// Whether the canvas IS turned is read off its computed transform, not re-asked of the media query, so the mapping is
// whatever the stylesheet actually did - the quarter turn is the only transform the page ever gives it.
import { VIEW_W, VIEW_H } from '../constants.ts';
import type { Canvas } from '../lib/engine/canvas.ts';

/**
 * Teach `view.toInternal` the quarter turn. Call once at boot, before anything holds on to the view's mapping (it is
 * looked up on the view at every event, so the touch layer and the links pick the wrapped one up either way).
 */
export function turnSideways(view: Canvas): void {
  const flat = view.toInternal, el = view.canvas;
  if (!el || typeof window === 'undefined') return;
  /** The canvas's on-screen box and whether it is turned, read together and kept until the layout can have moved. */
  let rect: DOMRect | null = null, turned = false;
  const drop = () => { rect = null; };
  window.addEventListener('resize', drop);
  window.addEventListener('orientationchange', drop);
  window.addEventListener('scroll', drop, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', drop);
  view.toInternal = (clientX: number, clientY: number) => {
    if (!rect) { rect = el.getBoundingClientRect(); turned = getComputedStyle(el).transform !== 'none'; }
    if (!turned) return flat(clientX, clientY);
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    // A quarter turn clockwise: the game's top-left corner is the turned box's top-right, the game's x runs DOWN the
    // screen and its y runs right to left across it. Linear all the way out, so a contact in the bands above and
    // below the turned canvas comes back as an x below 0 or past VIEW_W, as the side bands do the right way up.
    return { x: (clientY - rect.top) * (VIEW_W / rect.height), y: (rect.right - clientX) * (VIEW_H / rect.width) };
  };
}
