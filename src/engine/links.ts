// Outward links: the one module in the build that navigates anywhere. Everything else this game does happens on
// the canvas, so this exists for the two addresses drawn along the bottom of the title - the repository this
// build came from, and the Ko-fi address beside it.
//
// Ported from the sibling game *Aether & Brass* (src/engine/links.ts), minus its SHARE zone: that one hands the
// host's invite link to a phone's share sheet, and this game's lobby draws its invite link for reading rather
// than sending it anywhere (screens/lobby.ts), so there is nothing here to share.
//
// Two ways in, for the two kinds of address:
//
//  - A menu row calls `open()` from the fixed step, which serves keyboard, gamepad and pad alike. That is a rAF
//    callback rather than an event handler, so a browser that insists on a real user gesture may refuse the tab.
//    `open()` reports that honestly, and the caller says so on screen rather than looking broken. The SOURCE row
//    is the one row that does this.
//  - A click on a drawn address goes through the listener below, which IS a gesture, so it always opens. That is
//    the only way to the Ko-fi address: it is a thing to find, not a row on the way into the game, and it costs
//    the game no key. The screen that draws the addresses claims their rects in `enter()` and releases them in
//    `exit()`; the zones are in internal 640x360 px like everything else on screen.
//
// One `click` listener covers both a mouse and a finger: nothing in this game preventDefaults `touchstart` - the
// on-screen controls hold the canvas with pointer events and `touch-action: none` rather than by swallowing the
// touch (engine/touch.ts) - so a tap still synthesizes the click, and a synthesized click carries the activation
// `window.open` wants.
//
// That is also why a tap the thumb controls own is dropped below. The overlay lies along the bottom of the
// screen, which is where the addresses are drawn, and the two are clear of each other by 19 px today: a longer
// address, or a button moved a little, and pressing BACK would open a browser tab in the middle of a game. There
// is no undoing that from a phone, so the geometry is not what keeps them apart - the check is.
//
// And whichever way it goes, the address stays drawn: a player whose browser refuses the tab can read it off the
// screen and type it in.

import { touchHitAt } from './touch.ts';

/** The bit of the canvas view this module needs: the element listeners go on, and the px conversion. */
export interface LinkView {
  displayCanvas: HTMLCanvasElement;
  toInternal(clientX: number, clientY: number): { x: number; y: number };
}

/** A clickable address on screen, in internal px. */
export interface LinkZone {
  /** Left edge in internal px. */
  x: number;
  /** Top edge in internal px. */
  y: number;
  /** Width in internal px. */
  w: number;
  /** Height in internal px. */
  h: number;
  /** The address a click on the rect opens. */
  url: string;
  /** Told whether the tab actually opened, so the screen can report it the same way the menu row does. */
  onOpen?: (opened: boolean) => void;
}

let view: LinkView | null = null;
/** The rects the screen on top of the stack has claimed; empty everywhere else in the game. */
let zones: LinkZone[] = [];
/** The one the mouse is resting on, so the screen can light THAT address and leave the other alone. */
let hotZone: LinkZone | null = null;
/** Last mouse position in internal px, so a zone claimed under a resting cursor still lights up. */
let mx = -1, my = -1;

/** The claimed rect a point is inside, or null. The rects never overlap: they are pieces of one line of text. */
function zoneAt(p: { x: number; y: number }): LinkZone | null {
  for (const z of zones) if (p.x >= z.x && p.x < z.x + z.w && p.y >= z.y && p.y < z.y + z.h) return z;
  return null;
}

function setHot(next: LinkZone | null): void {
  if (next === hotZone) return;
  const was = !!hotZone;
  hotZone = next;
  if (was === !!next) return;
  const el = view && view.displayCanvas;
  if (el && el.style) el.style.cursor = next ? 'pointer' : '';
}

export const links = {
  /** True while a mouse is resting on any claimed zone. */
  get hot(): boolean { return !!hotZone; },

  /** The address the mouse is resting on, or '' - what the screen lights up, one address at a time. */
  get hotUrl(): string { return hotZone ? hotZone.url : ''; },

  /**
   * Attach the listeners to the display canvas. Called once at boot (src/main.ts), beside `input.init`, which
   * owns the only other pointer listener on the same element.
   */
  init(v: LinkView): void {
    view = v;
    const el = v && v.displayCanvas;
    if (!el || !el.addEventListener) return;
    el.addEventListener('mousemove', (e: MouseEvent) => {
      const p = v.toInternal(e.clientX, e.clientY);
      mx = p.x; my = p.y;
      setHot(zoneAt(p));
    });
    el.addEventListener('mouseleave', () => { mx = -1; my = -1; setHot(null); });
    el.addEventListener('click', (e: MouseEvent) => {
      if (e.button !== 0) return;
      const p = v.toInternal(e.clientX, e.clientY);
      // A tap on a thumb control is a press, not a click on whatever is drawn under it.
      if (touchHitAt(p.x, p.y)) return;
      const z = zoneAt(p);
      if (!z) return;
      const opened = links.open(z.url);
      if (z.onOpen) z.onOpen(opened);
    });
  },

  /**
   * Claim the clickable rects. One screen's worth at a time: only the screen on top of the stack draws addresses,
   * and it releases them on the way out.
   */
  setZones(list: LinkZone[]): void {
    zones = (list || []).filter((z) => z && z.url);
    // A rect claimed under a cursor already sitting there must light up without waiting for the mouse to move,
    // and one that goes away must never leave the pointer cursor behind.
    setHot(zoneAt({ x: mx, y: my }));
  },

  /** Release them (screens call this from `exit()`). */
  clearZones(): void { links.setZones([]); },

  /**
   * Open `url` in a new tab.
   *
   * Returns true if a window was actually opened; false if the browser refused it (a popup blocker, or a context
   * with no `window.open` at all), which is the caller's cue to say so and leave the address on screen.
   */
  open(url: string): boolean {
    try {
      if (typeof window === 'undefined' || !window.open) return false;
      const w = window.open(url, '_blank');
      if (!w) return false;
      // The new tab has no business reaching back into the game. `noopener` as a window feature would do this
      // too, but it makes window.open return null, and then a blocked popup and a successful one look identical
      // from here.
      try { w.opener = null; } catch { /* cross-origin: the tab has already navigated away */ }
      return true;
    } catch { return false; }
  },
};
