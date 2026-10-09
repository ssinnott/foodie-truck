// The arcade (github.com/ssinnott/arcade) shows this page in a frame, one game on a shelf of several. Inside it,
// three small things change and nothing else does:
//
//   - the title's menu gains a last row, BACK TO ARCADE, which hands the player back to the shelf (screens/title.ts);
//   - a table's invite link opens THIS GAME IN THE ARCADE, not the bare page the arcade frames (screens/lobby.ts);
//   - the host's table is reported to the arcade, so its address bar carries that link the way this page's own does.
//
// Everywhere else - this game's own site, a file opened from disk, an installed copy, a test, any OTHER page that
// frames it - `arcade.active` is false and every member below does nothing: the game is exactly the game.
//
// HOW THE ARCADE IS RECOGNISED. Not by a URL flag, which a link would carry to a friend and any page could add, but
// by two things only the arcade arranges together: the frame's NAME, which it sets to `arcade:` followed by its own
// link to this game with the host key left off the end, and a parent on this page's OWN origin. Reading another
// site's location throws, so a page elsewhere that frames the game - and names the frame whatever it likes - is not
// the arcade. The link has to be on this origin too: an invite never points anywhere the game itself is not served.
//
// TALKING BACK is postMessage to the parent, addressed to this origin only:
//   { type: 'arcade:hello' }                at boot: this game has its own way back, so the arcade drops its fallback
//   { type: 'arcade:exit' }                 BACK TO ARCADE: the arcade removes the frame, which ends everything in it
//   { type: 'arcade:room', room: 'BCDFGH' } a host's key: the arcade puts the invite link in its address bar
// Nothing here is simulation: no screen's checksumFields sees it, and a peer never hears about it.

const NAME_PREFIX = 'arcade:';

/** The arcade's link to this game, ready for a host key on the end; '' when the arcade is not what frames us. */
function find(): string {
  try {
    if (window.parent === window) return '';
    const name = String(window.name || '');
    if (!name.startsWith(NAME_PREFIX)) return '';
    // Throws for a parent on another origin, which is the point; equal origins are the arcade's own site.
    if (window.parent.location.origin !== window.location.origin) return '';
    const link = name.slice(NAME_PREFIX.length);
    return new URL(link).origin === window.location.origin ? link : '';
  } catch { return ''; }
}

function post(msg: object): void {
  try { window.parent.postMessage(msg, window.location.origin); } catch { /* the arcade is gone; so is this frame shortly */ }
}

export const arcade = {
  /** True while the arcade frames this page: the title shows its row and the lobby hands out its link. */
  active: false,
  /** The arcade's link to this game without a key (see find()); '' when not in the arcade. */
  link: '',
  /** Look for the arcade, once, before the first screen opens (main.ts). Finding it, say so. */
  init(): void {
    this.link = find();
    this.active = this.link !== '';
    if (this.active) post({ type: 'arcade:hello' });
  },
  /** The link that opens this game in the arcade at `room`'s table, or '' outside the arcade. */
  inviteUrl(room: string): string { return this.active ? this.link + encodeURIComponent(room) : ''; },
  /** A host's key is known: the arcade's address bar becomes the invite, as this page's own does standalone. */
  showRoom(room: string): void { if (this.active) post({ type: 'arcade:room', room }); },
  /** BACK TO ARCADE. The arcade removes this frame, and the loop, the sound and any open table go with it. */
  exit(): void { if (this.active) post({ type: 'arcade:exit' }); },
};
