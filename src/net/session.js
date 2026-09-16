// Online co-op session (docs/MULTIPLAYER.md): signalling -> peers -> lobby -> synchronised match.
// STUB: the real session is a port of the sibling game's net/session.js against this game's run contract.
export function createNetSession() { throw new Error('net/session.js: not implemented yet'); }
/** Debug/test hooks on window.__game: netHost(opts), netJoin(code, opts), net (getter). */
export function installNetHooks(hooks, game, input) { hooks.net = () => game.net; void input; }
