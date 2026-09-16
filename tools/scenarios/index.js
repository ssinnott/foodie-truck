// Extra playtest scenarios, one module per feature owner, merged into tools/playtest.js SCENARIOS.
// Each export is `async (server) => void` and uses withPage / withPeers / assert from ../playtest.js.
import { SCENARIOS as netplay } from './netplay.js';
import { SCENARIOS as cast } from './cast.js';
import { SCENARIOS as map } from './map.js';
import { SCENARIOS as orchard } from './orchard.js';
import { SCENARIOS as pond } from './pond.js';
import { SCENARIOS as coop } from './coop.js';
import { SCENARIOS as kitchen } from './kitchen.js';
import { SCENARIOS as ui } from './ui.js';

export const SCENARIOS = { ...netplay, ...cast, ...map, ...orchard, ...pond, ...coop, ...kitchen, ...ui };
