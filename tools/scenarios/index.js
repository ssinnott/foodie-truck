// Extra playtest scenarios, one module per feature, merged into tools/playtest.js SCENARIOS.
// Each export is `async (server) => void` and uses withPage / withPeers / assert from ../playtest.js.
import { SCENARIOS as NET } from './netplay.js';

export const SCENARIOS = { ...NET };
