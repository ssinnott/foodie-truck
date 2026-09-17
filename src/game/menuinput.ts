// One menu scheme for every screen (docs/ARCHITECTURE.md section 5): CONFIRM is `action` or `start`, BACK is
// `cancel`, and any JOINED seat may press them - a couch P2 or an online guest can drive a shared menu.
// Every helper returns the slot that pressed, or -1.

/** Slot that pressed confirm this step (action or start), or -1. */
export function confirmPressed(input) { const a = input.anyPressed('action'); return a >= 0 ? a : input.anyPressed('start'); }
/** Slot that pressed back this step, or -1. */
export function cancelPressed(input) { return input.anyPressed('cancel'); }
/** Slot that pressed a direction this step, or -1. */
export function navPressed(input, dir) { return input.anyPressed(dir); }
/** -1 / 0 / +1 for left/right pressed by any joined seat this step (first seat wins). */
export function navX(input) { return navPressed(input, 'right') >= 0 ? 1 : navPressed(input, 'left') >= 0 ? -1 : 0; }
export function navY(input) { return navPressed(input, 'down') >= 0 ? 1 : navPressed(input, 'up') >= 0 ? -1 : 0; }
/** Key labels for hint lines, P1's keys (the same block everyone online uses). */
export function confirmKey(input) { return input.keyText(0, 'action'); }
export function backKey(input) { return input.keyText(0, 'cancel'); }
