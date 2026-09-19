// Outward links: the one module in the build that navigates anywhere. Everything else this game does happens on
// the canvas, so this exists for the two addresses that are drawn on it - the repository on the title (the SOURCE
// row and the address under it) and the Ko-fi address on the crew screen.
//
// Ported from the sibling game *Aether & Brass* (src/engine/links.ts), minus its SHARE zone: that one hands the
// host's invite link to a phone's share sheet, and this game's lobby draws its invite link for reading rather
// than sending it anywhere (screens/lobby.ts), so there is nothing here to share.
//
// An address needs two ways to follow it, because neither alone reaches every player:
//
//  - A menu row or a hint key calls `open()` from the fixed step, which serves keyboard, gamepad and pad alike.
//    That is a rAF callback rather than an event handler, so a browser that insists on a real user gesture may
//    refuse the tab. `open()` reports that honestly, and the caller says so on screen rather than looking broken.
//  - A click on the drawn address goes through the listener below, which IS a gesture, so it always opens. The
//    screen that draws an address claims its rect in `enter()` and releases it in `exit()`; the zone is in
//    internal 640x360 px like everything else on screen.
//
// One `click` listener covers both a mouse and a finger: unlike Aether & Brass, nothing in this game
// preventDefaults `touchstart` (there is no on-screen touch pad to defend), so a tap still synthesizes the click
// - and a synthesized click carries the activation `window.open` wants.
//
// And whichever way it goes, the address stays drawn: a player whose browser refuses the tab can read it off the
// screen and type it in.

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
let zone: LinkZone | null = null;
let hot = false;
/** Last mouse position in internal px, so a zone claimed under a resting cursor still lights up. */
let mx = -1, my = -1;

function inZone(p: { x: number; y: number }): boolean {
  return !!zone && p.x >= zone.x && p.x < zone.x + zone.w && p.y >= zone.y && p.y < zone.y + zone.h;
}

function setHot(next: boolean): void {
  if (next === hot) return;
  hot = next;
  const el = view && view.displayCanvas;
  if (el && el.style) el.style.cursor = next ? 'pointer' : '';
}

export const links = {
  /** True while a mouse is resting on the claimed zone, so the screen can light the address up. */
  get hot(): boolean { return hot; },

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
      setHot(inZone(p));
    });
    el.addEventListener('mouseleave', () => { mx = -1; my = -1; setHot(false); });
    el.addEventListener('click', (e: MouseEvent) => {
      const z = zone;
      if (!z || e.button !== 0) return;
      if (!inZone(v.toInternal(e.clientX, e.clientY))) return;
      const opened = links.open(z.url);
      if (z.onOpen) z.onOpen(opened);
    });
  },

  /**
   * Claim the clickable rect. One zone at a time: only the screen on top of the stack draws an address, and it
   * releases the rect on the way out.
   */
  setZone(z: LinkZone | null): void {
    zone = z && z.url ? z : null;
    // A zone claimed under a cursor already sitting there must light up without waiting for the mouse to move,
    // and one that goes away must never leave the pointer cursor behind.
    setHot(inZone({ x: mx, y: my }));
  },

  /** Release the claimed rect (screens call this from `exit()`). */
  clearZone(): void { links.setZone(null); },

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
