// The eight actions, and nothing else. Its own module because engine/bindings.js and engine/input.js both need
// them and neither may import the other: bindings owns which key and button an action sits on, input turns that
// into masks. engine/input.js re-exports ACTIONS, so everything outside the engine still reads it from there.
//
// FROZEN. Bit i of an input mask is ACTIONS[i], net/protocol.js puts that byte on the wire unchanged, and a peer
// on an older build would read a reordered list as somebody pressing the wrong buttons. Adding a ninth action is
// a protocol change, not an edit to this line.

/** One action: a member of ACTIONS, a key of a keyboard or pad binding, and a key of an action map. */
export type Action = 'left' | 'right' | 'up' | 'down' | 'action' | 'alt' | 'cancel' | 'start';

/** All per-player actions, in bit order (bit i of a mask is ACTIONS[i]). */
export const ACTIONS: readonly Action[] = Object.freeze(['left', 'right', 'up', 'down', 'action', 'alt', 'cancel', 'start'] as const);

/**
 * `BIT.action` is the mask of one action.
 *
 * Built by the loop below rather than written out, so it cannot drift from ACTIONS' order -- which is the wire
 * format. The cast is what lets it be filled after it is declared; every key is written on the next line.
 */
export const BIT = {} as Record<Action, number>;
ACTIONS.forEach((a, i) => { BIT[a] = 1 << i; });

/** What each action is called on screen, in ACTIONS order (the CONTROLS table's first column). */
export const ACTION_LABELS = Object.freeze(['LEFT', 'RIGHT', 'UP', 'DOWN', 'ACTION', 'ALT', 'CANCEL', 'START']);
