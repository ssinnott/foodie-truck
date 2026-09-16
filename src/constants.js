// Shared constants (docs/ARCHITECTURE.md). Never hardcode these numbers elsewhere.

/** Internal render width in px. */
export const VIEW_W = 640;
/** Internal render height in px. */
export const VIEW_H = 360;
/** Fixed timestep in seconds (logic runs at exactly 60 Hz). */
export const DT = 1 / 60;
/** Max fixed updates per animation frame (spiral-of-death clamp). */
export const MAX_STEPS_PER_FRAME = 5;
/** Input buffer length in frames: a press is remembered this long for a late confirm. */
export const INPUT_BUFFER = 8;
/** Player slots the engine holds. Four, because an online room seats four. */
export const MAX_PLAYERS = 4;
/** How many of those slots COUCH play may fill (two people, one keyboard, one nine-key block each). */
export const LOCAL_PLAYERS = 2;
/** An online room holds this many players at most... */
export const NET_PLAYERS = 4;
/** ...and at least this many. Below it there is nobody to be in lockstep with. */
export const NET_MIN_PLAYERS = 2;

/**
 * UI colours shared by HUD and screens. The motif is a food truck's own kit: warm INK for every outline,
 * PAPER order tickets, a WOOD counter, a CHALK board menu. Player colours are the four apron/bandana
 * accents and every cursor, name plate and ready stamp uses the same four (docs/ART_STYLE.md section 4).
 */
export const UI = Object.freeze({
  ink: '#2A1F1A', paper: '#F7E9C9', paperDark: '#D8C093', paperLine: '#B99A6A', chalk: '#F2EFE6', board: '#2F4B3C', boardDark: '#22382C',
  wood: '#9A6234', woodLight: '#C48A52', woodDark: '#5E3A1B', cream: '#FFF6E0', white: '#FFFFFF',
  red: '#D9463B', green: '#5FA652', blue: '#4A8FD6', yellow: '#F2C14E', orange: '#EF8A3C',
  dim: 'rgba(20,12,8,0.55)', panel: 'rgba(42,31,26,0.88)', shadow: '#000000',
  p1: '#3F9BFF', p2: '#FF8140', p3: '#B08CFF', p4: '#FF63B0',
});
/** Per-slot colour, indexed by player slot 0..3. */
export const PLAYER_COLORS = Object.freeze([UI.p1, UI.p2, UI.p3, UI.p4]);
/** Player slot names as the game says them. */
export const PLAYER_LABELS = Object.freeze(['P1', 'P2', 'P3', 'P4']);

/** Where this build came from (the title screen's SOURCE row). */
export const REPO_URL = 'https://github.com/ssinnott/foodie-truck';
export const REPO_LABEL = 'GITHUB.COM/SSINNOTT/FOODIE-TRUCK';
