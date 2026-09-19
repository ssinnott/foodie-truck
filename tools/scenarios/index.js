// Extra playtest scenarios, one module per feature owner, merged into tools/playtest.js SCENARIOS.
// Each export is `async (server) => void` and uses withPage / withPeers / assert from ../playtest.js.
import { SCENARIOS as netplay } from './netplay.js';
import { SCENARIOS as cast } from './cast.js';
import { SCENARIOS as map } from './map.js';
import { SCENARIOS as orchard } from './orchard.js';
import { SCENARIOS as pond } from './pond.js';
import { SCENARIOS as coop } from './coop.js';
import { SCENARIOS as dairy } from './dairy.js';
import { SCENARIOS as mill } from './mill.js';
import { SCENARIOS as hive } from './hive.js';
import { SCENARIOS as garden } from './garden.js';
import { SCENARIOS as bramble } from './bramble.js';
import { SCENARIOS as beach } from './beach.js';
import { SCENARIOS as holt } from './holt.js';
import { SCENARIOS as kitchen } from './kitchen.js';
import { SCENARIOS as ui } from './ui.js';
import { SCENARIOS as pads } from './pads.js';
import { SCENARIOS as controls } from './controls.js';
import { SCENARIOS as stage } from './stage.js';
import { SCENARIOS as playthrough } from './playthrough.js';
import { SCENARIOS as audio } from './audio.js';

export const SCENARIOS = { ...netplay, ...cast, ...map, ...orchard, ...pond, ...coop, ...dairy, ...mill, ...hive, ...garden, ...bramble, ...beach, ...holt, ...kitchen, ...ui, ...pads, ...controls, ...stage, ...playthrough, ...audio };
