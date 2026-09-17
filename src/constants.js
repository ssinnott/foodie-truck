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
/**
 * How many of those slots COUCH play may fill. All four: the keyboard seats two (one nine-key block each) and a
 * gamepad claims any free seat on its first press, so four pads - or two pads either side of the keyboard pair -
 * fill the truck without anybody going online.
 */
export const LOCAL_PLAYERS = 4;
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
/**
 * Scene signal colours (docs/ART_STYLE.md section 4): ONE saturated colour per scene, bound to one meaning, used only
 * as small emitters and banned as decor anywhere else. `hot` is reserved game-wide for heat and danger.
 */
export const SIGNAL = Object.freeze({
  map: '#F2C14E',      // lantern gold: the next destination's sign glow, the ticket's NEED arrow
  orchard: '#D9463B',  // ripe apple (= UI.red)
  pond: '#5FD3C0',     // the bite ring and the float's stripe
  coop: '#F2C14E',     // fresh-egg sparkle (shared with the map by exemption: both mean "the thing you want")
  kitchen: '#E23A2E',  // HOT
  // The four landmarks the prototype finished last take their signal from the two meanings already in the table
  // rather than inventing four more saturated hexes: the player colours own blue, marmalade, lavender and
  // raspberry, so a fifth and sixth saturated family would collide with an apron inside the very scene it marks.
  dairy: '#5FD3C0',    // the milking beat: the pump chevron and the full pail's ring (mint = "press on this beat", the pond's bite ring by exemption)
  mill: '#F2C14E',     // the chute that is pouring NOW (the map/coop gold: "the thing you want")
  hive: '#F2C14E',     // the skep with honey left in it; the swarm's alert is SIGNAL.hot, as on the rooster's comb
  garden: '#F2C14E',   // the ripe root's sparkle, the same mark the coop's fresh egg wears
  hot: '#E23A2E',      // burner, boil-over, burnt, the rooster's comb, the swarm on the turn: never anywhere else
  good: '#5FA652',     // "good timing" fills on paper UI, always ink-outlined (= UI.green)
});
/** The apron a critter wears when no seat owns it (gallery, customers, the title's idle crew). */
export const OFF_DUTY_APRON = '#D8C093';
/** Plum shadow tones the whole world uses instead of black (docs/ART_STYLE.md section 1). */
export const PLUM = Object.freeze({ shadow: '#4A3038', deep: '#2F2338' });

/** Per-slot colour, indexed by player slot 0..3. */
export const PLAYER_COLORS = Object.freeze([UI.p1, UI.p2, UI.p3, UI.p4]);
/** Player slot names as the game says them. */
export const PLAYER_LABELS = Object.freeze(['P1', 'P2', 'P3', 'P4']);

/** Where this build came from (the title screen's SOURCE row). */
export const REPO_URL = 'https://github.com/ssinnott/foodie-truck';
export const REPO_LABEL = 'GITHUB.COM/SSINNOTT/FOODIE-TRUCK';
