// This game's text layer: the shared 5x7 pixel font from the library, with this game's ink applied.
//
// The renderer itself is engine and lives in src/lib/engine/text.ts, shared with the sibling game.
// The only thing that differs between the two is the ink -- Hedgerow Dusk's warm near-black
// #2A1F1A against the sibling's cool #120c14 -- so the library takes it as a default and each game
// sets its own. Setting it HERE, as an import side effect, rather than at startup in main.js means
// any entry point gets the right ink: the game, the contact sheet, the headless playtest, a tool
// that imports one screen. There is no ordering to get wrong.
import { setTextDefaults } from '../lib/engine/text.ts';

setTextDefaults({ shadowColor: '#2A1F1A', outline: '#2A1F1A' });

export * from '../lib/engine/text.ts';
