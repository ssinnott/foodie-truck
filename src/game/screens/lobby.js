// LOBBY - the host key (docs/MULTIPLAYER.md, docs/GDD.md section 10). The screen that drives net/session.js:
//
//   role -> code -> connecting -> lobby -> starting
//                                       -> error
//
// The room code is the table number on a big paper ticket, the party is four stools at the truck's hatch with a
// bust behind each, and everything the screen does to the session goes through the session's own API
// (start / setCritter / setReady / leave). The session applies START and resets the game to the map itself in the
// same call that flips its state, so the `starting` PHASE is never actually drawn: the GDD's STARTING! beat is
// keyed off the roster being all-ready, which is the window a guest really sits in while the host settles.
//
// Two things here are deliberately not like a gameplay screen, because this screen never runs under lockstep
// (once net.state is 'playing' the session has already reset us away):
//   * the room code is read RAW from the keyboard - every code letter is a bound game key, so there is no action
//     to read it through (docs/MULTIPLAYER.md "Deferred"). The codes come from engine/input.js's per-step buffer
//     (`typedCodes()`), which holds what was typed for the step a screen is updating in, so there is one keystream
//     and one reader;
//   * the invite link and the address bar come from window.location, which no simulation ever sees.
import { VIEW_W, UI, NET_MIN_PLAYERS, NET_PLAYERS, PLAYER_COLORS } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined, measureText } from '../../engine/text.js';
import { drawShadow } from '../../art/fx.js';
import { drawTruck, TRUCK } from '../../art/truck.js';
import { drawBust, idlePoseOf } from '../../art/portraits.js';
import { critterRig } from '../../content/critters/common.js';
import { CRITTERS } from '../../content/critters/index.js';
import { AnimPlayer } from '../animation.js';
import { createNetSession } from '../../net/session.js';
import { drawTicket, drawSlate, drawMenuRows, drawStamp, drawNamePlate, drawHint, drawDim, ROW } from '../ui.js';
import { confirmPressed, cancelPressed, navY } from '../menuinput.js';
import { drawLane, TRUCK_Y } from '../../art/logo.js';

const R = Math.round;
/** A host key is six characters; a typed one is allowed a little slack in case the alphabet ever grows. */
const MAX_CODE = 8;

/**
 * KeyboardEvent.code -> the character it types, for A-Z and 0-9 only.
 */
function codeChar(code) {
  if (code.length === 4 && code.startsWith('Key')) return code[3];
  if (code.length === 6 && code.startsWith('Digit')) return code[5];
  return '';
}

/**
 * The truck is parked up the lane at the right, hatch toward the stools, with its tyres ON the lane's row band
 * (art/logo.js owns those bands, so nothing here invents a y). It is drawn at scale 2 rather than the 320x192 of
 * ART_STYLE section 1: at 4x it is wider than the half of the screen the stools do not use - recorded as a
 * deviation.
 */
const TRUCK_X = 552, TRUCK_OPTS = { scale: 2, facing: 1, wheel: 0 };
const RAIL_Y = 26, RAIL_X0 = 16, RAIL_X1 = 470;
/** The table ticket: 400x72, the code at size 4 spaced 2 on the first rule, the invite link on the second. */
const TICKET = { x: 66, y: 30, w: 400, h: 72 };
const CODE_Y = TICKET.y + 20, LINK_Y = TICKET.y + 54, LINK_RULE_Y = TICKET.y + 51;
const CODE_SIZE = 4, CODE_SPACING = 2, CODE_ADV = (5 + CODE_SPACING) * CODE_SIZE;
/** A code glyph flips in over 6 frames, one after another (the panel's graft). */
const FLIP_FRAMES = 6;
/** Longest link that fits the ticket at size 1. */
const LINK_MAX = 62;
/** The four stools, their busts and the status column under each: the row sits LEFT of the parked truck. */
const SEAT_X = [62, 177, 292, 407];
const BUST_Y = 138, BUST_W = 92, BUST_H = 96, BUST_SCALE = 1.4;
const STOOL_Y = 226, PLATE_Y = 274, NAME_Y = 288, STATE_Y = 302;
const TAG_Y = 196;
/**
 * The READY stamp slams onto a paper docket on the critter's SHOULDER line - high enough that the apron (the
 * seat's own colour) still reads under it, and the docket is sized from the stamp rather than a slab of paper.
 */
const STAMP_Y = BUST_Y + 58;
const STATUS_Y = 322, STATUS_W = 330;
const BANNER_Y = 114;
/** The role menu, and the slate it stands on when no session exists yet. */
const ROLE_ROWS = ['HOST A TABLE', 'JOIN A TABLE'];
const ROLE_SLATE = { x: 150, y: 132, w: 250, h: 92 };
/** Captions built once: draw() never joins a string. */
const SEAT_YOU = ['P1 (YOU)', 'P2 (YOU)', 'P3 (YOU)', 'P4 (YOU)'];
const SEAT_LABEL = ['P1', 'P2', 'P3', 'P4'];
const WAIT_TEXT = ['WAITING FOR PLAYER 2', 'WAITING FOR PLAYER 2 .', 'WAITING FOR PLAYER 2 . .', 'WAITING FOR PLAYER 2 . . .'];
const READY_TEXT = 'READY', CHOOSING_TEXT = 'CHOOSING', OPEN_TEXT = 'OPEN', EMPTY_TEXT = '- - -';
const STARTING_TEXT = 'STARTING!';
/** The docket under the stamp is sized from the stamp, and pinned at the SAME tilt, so the ink never bursts out of the paper. */
const DOCKET_W = measureText(READY_TEXT, 2) + 24, DOCKET_H = 28, DOCKET_TILT = -0.14;
const STAMP_FRAMES = 24;
/**
 * Beetroot stamp ink from the truck's own body rather than a copied hex. Beetroot over UI.red is a deliberate
 * deviation from ART_STYLE section 4: apple red is the orchard's signal colour and is banned as decor elsewhere.
 */
const STAMP_OPTS = { size: 2, color: TRUCK.body, light: TRUCK.bodyHi, angle: DOCKET_TILT };

export class LobbyScreen extends Screen {
  constructor(game) {
    super(game, 'lobby');
    this.net = null; this.crit = []; this.party = []; this.readyT = [0, 0, 0, 0];
  }

  enter(params) {
    super.enter(params);
    const game = this.game;
    this.crit = CRITTERS.map((def, i) => {
      const player = new AnimPlayer(def.anims);
      player.play('idle');
      for (let k = 0; k < i * 11; k++) player.tick();
      const rigs = [];
      for (let s = 0; s < NET_PLAYERS; s++) rigs.push(critterRig(def, s));
      return { def, rigs, player, anchor: idlePoseOf(def) };
    });
    this.sel = 0;
    this.typing = false;
    this.code = '';                 // what is being typed
    this.codeChars = [];            // the code actually on the ticket, one glyph per entry
    this.shownCode = '';
    this.codeAt = -1;               // frame the code arrived, for the flip-in
    this.link = '';
    this.statusLine = '';
    // the four scalars the status line is built from: compared as numbers so refresh() joins a string only when
    // one of them actually moves (ART_STYLE section 9)
    this.sRoom = ''; this.sParty = -1; this.sPing = ''; this.sDelay = -1;
    this.allReady = false;
    this.party = [];
    this.readyT = [0, 0, 0, 0];
    this.bustOpts = { margin: 8, facing: 1 };
    this.roleHint = `${game.input.keyText(0, 'action')}: CHOOSE    ${game.input.keyText(0, 'cancel')}: BACK`;
    this.codeHint = 'TYPE THE TABLE NUMBER    ENTER: JOIN    ESC: BACK';
    this.lobbyHint = `${game.input.keyText(0, 'left')} ${game.input.keyText(0, 'right')}: CRITTER    ${game.input.keyText(0, 'action')}: READY    ${game.input.keyText(0, 'cancel')}: LEAVE`;
    this.endHint = `${game.input.keyText(0, 'action')}: BACK TO TITLE`;
    this.onState = () => { this.refresh(); };
    // A session that is already live (an invite link, or coming back to the lobby) is adopted, never restarted.
    if (game.net && game.net.state !== 'ended') { this.net = game.net; this.net.onStateChange(this.onState); this.noteCode(); }
    else if (params.autoRoom) {
      if (game.options.room) this.open(false, game.options.room);
      else if (game.options.host) this.open(true, '');
    }
    this.refresh();
  }

  exit() {
    // The session outlives this screen (the match is about to start), so only the callback is taken back.
    if (this.net && this.net.onStateChange) this.net.onStateChange(null);
  }

  // ---- the session ----------------------------------------------------------------------------

  /** Open a room: the host mints a key, a guest brings one. `game.net` is the session from here on. */
  open(isHost, room) {
    const game = this.game;
    if (game.net && game.net.state !== 'ended') game.net.leave();
    const net = createNetSession({
      game, input: game.input, isHost, room: String(room || '').toUpperCase(),
      transport: game.options.transport, onState: this.onState,
    });
    game.net = net;
    this.net = net;
    this.typing = false;
    net.start();
    this.noteCode();
  }

  /** The code just became known: start its flip-in, build the invite link, and put it in the address bar. */
  noteCode() {
    const net = this.net;
    if (!net || !net.room || net.room === this.shownCode) return;
    this.shownCode = net.room;
    this.codeChars = net.room.split('');
    this.codeAt = this.frame;
    let url = '';
    try { url = (window.location.origin + window.location.pathname + '?room=' + net.room).toUpperCase(); } catch { url = '?ROOM=' + net.room; }
    this.link = url.length > LINK_MAX ? url.slice(0, LINK_MAX - 3) + '...' : url;
    // The address bar becomes the link the host reads out; the dev flags on it are kept so a reload still works.
    if (net.isHost) {
      try {
        const q = new URLSearchParams(window.location.search);
        q.set('room', net.room); q.delete('host');
        window.history.replaceState(null, '', window.location.pathname + '?' + q.toString());
      } catch { /* no history API: the ticket is still the invite */ }
    }
  }

  /** Re-read everything the screen shows from the session. Cheap, and the only place strings are built. */
  refresh() {
    const net = this.net;
    this.party = net ? net.party() : [];
    // Is the room full enough and has every seat in it stamped? draw() reads this rather than walking the roster
    // with a closure every frame, and it is what puts STARTING! on the screen.
    let ready = this.party.length >= NET_MIN_PLAYERS;
    for (let i = 0; i < this.party.length && ready; i++) if (!this.party[i] || !this.party[i].ready) ready = false;
    this.allReady = ready;
    if (!net) return;
    this.noteCode();
    const s = net.summary();
    const ping = s.rtt == null ? '--' : R(s.rtt);
    if (s.room !== this.sRoom || this.party.length !== this.sParty || ping !== this.sPing || s.delay !== this.sDelay) {
      this.sRoom = s.room; this.sParty = this.party.length; this.sPing = ping; this.sDelay = s.delay;
      this.statusLine = `TABLE ${s.room}  PARTY ${this.party.length}/${NET_PLAYERS}  PING ${ping}MS  DELAY ${s.delay}F`;
    }
  }

  /** role | code | connecting | lobby | starting | error. STARTING! on the screen is `allReady`, not this. */
  get phase() {
    const net = this.net;
    if (!net) return this.typing ? 'code' : 'role';
    if (net.state === 'ended') return 'error';
    if (net.state === 'playing') return 'starting';
    if (net.state === 'lobby') return this.party.length >= NET_MIN_PLAYERS ? 'lobby' : 'connecting';
    return 'connecting';
  }

  /** Step the pick one critter along, skipping every one another seat already holds. */
  pick(dir) {
    const net = this.net, n = this.crit.length;
    for (let k = 1; k <= n; k++) {
      const c = ((net.lobby.myCritter + dir * k) % n + n) % n;
      if (!net.critterTaken(c)) { net.setCritter(c); return; }
    }
  }

  // ---- update ---------------------------------------------------------------------------------

  update() {
    super.update();
    const inp = this.game.input;
    this.refresh();
    for (const c of this.crit) c.player.tick();
    for (let i = 0; i < this.readyT.length; i++) {
      const m = this.party[i];
      this.readyT[i] = m && m.ready ? this.readyT[i] + 1 : 0;
    }
    const phase = this.phase;
    if (phase === 'code') { this.updateCode(inp); return; }
    if (phase === 'role') {
      const dy = navY(inp);
      if (dy) this.sel = (this.sel + dy + ROLE_ROWS.length) % ROLE_ROWS.length;
      if (cancelPressed(inp) >= 0) { this.game.reset('title'); return; }
      if (confirmPressed(inp) >= 0) {
        if (this.sel === 0) this.open(true, '');
        else { this.typing = true; this.code = ''; this.codeChars = []; this.shownCode = ''; this.codeAt = -1; }
      }
      return;
    }
    if (phase === 'error') {
      if (confirmPressed(inp) >= 0 || cancelPressed(inp) >= 0) { this.net.leave(); this.game.net = null; this.game.reset('title'); }
      return;
    }
    if (phase === 'starting') return;                 // the session is resetting us to the map
    // connecting / lobby: everyone drives their own seat from keyboard block 0, whatever seat they hold
    const net = this.net;
    if (inp.pressed(0, 'right')) this.pick(1);
    if (inp.pressed(0, 'left')) this.pick(-1);
    if (inp.pressed(0, 'action')) net.setReady(true);
    if (inp.pressed(0, 'cancel')) {
      if (net.lobby.myReady) net.setReady(false);
      else { net.leave(); this.game.net = null; this.game.reset('title'); }
    }
  }

  /**
   * Code entry. Every letter of the alphabet is a bound game key, so this reads KeyboardEvent.code values
   * rather than actions; engine/input.js holds them for the step this update belongs to.
   */
  updateCode(inp) {
    const raw = inp.typedCodes();
    for (let i = 0; i < raw.length; i++) {
      const code = raw[i];
      if (code === 'Escape') { this.typing = false; this.code = ''; this.codeChars = []; break; }
      if (code === 'Backspace') { this.code = this.code.slice(0, -1); this.codeChars = this.code.split(''); continue; }
      if (code === 'Enter' || code === 'NumpadEnter') {
        if (this.code.length >= 4) { this.open(false, this.code); return; }
        continue;
      }
      const ch = codeChar(code);
      if (ch && this.code.length < MAX_CODE) { this.code += ch; this.codeChars = this.code.split(''); }
    }
  }

  // ---- drawing --------------------------------------------------------------------------------

  /** The code glyphs, tracked at spacing 2, each flipping in over its own six frames. */
  drawCode(ctx, chars, caret) {
    const total = chars.length * CODE_ADV - CODE_SPACING * CODE_SIZE;
    let x = R(TICKET.x + TICKET.w / 2 - total / 2);
    for (let i = 0; i < chars.length; i++) {
      let k = 1;
      if (this.codeAt >= 0) {
        const t = (this.frame - this.codeAt - i * FLIP_FRAMES) / FLIP_FRAMES;
        if (t < 0) { x += CODE_ADV; continue; }
        if (t < 1) k = Math.max(0.04, Math.abs(1 - 2 * t));
      }
      ctx.save();
      ctx.translate(x + 5 * CODE_SIZE / 2, 0);
      ctx.scale(k, 1);
      drawText(ctx, chars[i], 0, CODE_Y, { size: CODE_SIZE, color: UI.ink, align: 'center', shadow: false });
      ctx.restore();
      x += CODE_ADV;
    }
    if (caret && chars.length < MAX_CODE && this.frame % 60 < 30) {
      drawText(ctx, '_', x + 5 * CODE_SIZE / 2, CODE_Y, { size: CODE_SIZE, color: TRUCK.body, align: 'center', shadow: false });
    }
  }

  /** The pegged table ticket: header, the code, a rule, and the invite link. */
  drawTable(ctx, chars, caret) {
    ctx.fillStyle = TRUCK.brass; ctx.fillRect(RAIL_X0, RAIL_Y, RAIL_X1 - RAIL_X0, 2);
    ctx.fillStyle = UI.ink; ctx.fillRect(RAIL_X0, RAIL_Y + 2, RAIL_X1 - RAIL_X0, 1);
    drawTicket(ctx, TICKET.x, TICKET.y, TICKET.w, TICKET.h, { title: 'TABLE', rules: false });
    ctx.fillStyle = UI.paperLine; ctx.fillRect(TICKET.x + 8, LINK_RULE_Y, TICKET.w - 16, 1);
    this.drawCode(ctx, chars, caret);
    // the link is the one string a host reads out, so it is wood on paper (4.2:1), never the ruled-line colour
    if (this.link) drawText(ctx, this.link, TICKET.x + TICKET.w / 2, LINK_Y, { size: 1, color: UI.wood, align: 'center', shadow: false });
    // the wooden peg that clips the ticket to the rail
    ctx.fillStyle = UI.ink; ctx.fillRect(R(TICKET.x + TICKET.w / 2) - 3, RAIL_Y - 1, 6, 12);
    ctx.fillStyle = UI.wood; ctx.fillRect(R(TICKET.x + TICKET.w / 2) - 2, RAIL_Y, 4, 10);
  }

  /** One stool with its cushion, post and foot; the bust behind it belongs to whoever is sitting there. */
  drawStool(ctx, cx, colour) {
    // One ink pass under the whole stool, then the cushion, the seat, its shadow band, the post and the foot.
    ctx.fillStyle = UI.ink;
    ctx.fillRect(cx - 21, STOOL_Y - 8, 42, 20);
    ctx.fillRect(cx - 5, STOOL_Y + 12, 10, 22);
    ctx.fillRect(cx - 15, STOOL_Y + 32, 30, 8);
    ctx.fillStyle = colour || UI.paperDark;
    ctx.fillRect(cx - 20, STOOL_Y - 7, 40, 8);
    ctx.fillStyle = UI.wood; ctx.fillRect(cx - 20, STOOL_Y + 1, 40, 10);
    ctx.fillStyle = UI.woodDark; ctx.fillRect(cx - 20, STOOL_Y + 8, 40, 3);
    ctx.fillStyle = UI.wood; ctx.fillRect(cx - 4, STOOL_Y + 13, 8, 20); ctx.fillRect(cx - 14, STOOL_Y + 33, 28, 6);
    ctx.fillStyle = UI.woodDark; ctx.fillRect(cx - 14, STOOL_Y + 36, 28, 3);
  }

  drawSeats(ctx) {
    for (let i = 0; i < SEAT_X.length; i++) {
      const cx = SEAT_X[i], m = this.party[i];
      drawShadow(ctx, cx, STOOL_Y + 36, 46, 0.35);
      if (m) {
        const c = this.crit[((m.critter % this.crit.length) + this.crit.length) % this.crit.length];
        drawBust(ctx, c.rigs[i], c.player.pose, c.anchor, cx - BUST_W / 2, BUST_Y, BUST_W, BUST_H, BUST_SCALE, this.bustOpts);
        this.drawStool(ctx, cx, PLAYER_COLORS[i]);
        drawNamePlate(ctx, i, m.local ? SEAT_YOU[i] : SEAT_LABEL[i], cx, PLATE_Y);
        drawTextOutlined(ctx, c.def.name, cx, NAME_Y, { size: 1, color: UI.cream, outline: UI.ink, thickness: 1, align: 'center', shadow: false });
        drawTextOutlined(ctx, m.ready ? READY_TEXT : CHOOSING_TEXT, cx, STATE_Y, { size: 1, color: m.ready ? UI.cream : UI.paperDark, outline: UI.ink, thickness: 1, align: 'center', shadow: false });
        if (m.ready) {
          // beetroot ink on dark fur is no read at all, so the stamp lands on a paper docket pinned to the critter
          ctx.save();
          ctx.translate(cx, STAMP_Y); ctx.rotate(DOCKET_TILT);
          ctx.fillStyle = UI.ink; ctx.fillRect(-R(DOCKET_W / 2), -R(DOCKET_H / 2), DOCKET_W, DOCKET_H);
          ctx.fillStyle = UI.paper; ctx.fillRect(-R(DOCKET_W / 2) + 1, -R(DOCKET_H / 2) + 1, DOCKET_W - 2, DOCKET_H - 2);
          ctx.restore();
          drawStamp(ctx, READY_TEXT, cx, STAMP_Y, Math.min(1, this.readyT[i] / STAMP_FRAMES), STAMP_OPTS);
        }
      } else {
        this.drawStool(ctx, cx, null);
        // an OPEN paper tag hanging where a head would be
        ctx.fillStyle = UI.ink; ctx.fillRect(cx - 1, TAG_Y + 15, 2, STOOL_Y - 7 - TAG_Y - 15);
        ctx.fillStyle = UI.ink; ctx.fillRect(cx - 20, TAG_Y - 1, 40, 17);
        ctx.fillStyle = UI.paper; ctx.fillRect(cx - 19, TAG_Y, 38, 15);
        ctx.fillStyle = UI.paperDark; ctx.fillRect(cx - 19, TAG_Y + 11, 38, 4);
        drawText(ctx, OPEN_TEXT, cx, TAG_Y + 4, { size: 1, color: UI.ink, align: 'center', shadow: false });
        drawNamePlate(ctx, -1, SEAT_LABEL[i], cx, PLATE_Y);
        drawTextOutlined(ctx, EMPTY_TEXT, cx, NAME_Y, { size: 1, color: UI.paperDark, outline: UI.ink, thickness: 1, align: 'center', shadow: false });
      }
    }
  }

  drawStatusLine(ctx) {
    if (!this.statusLine) return;
    const x = R(VIEW_W / 2 - STATUS_W / 2);
    ctx.fillStyle = UI.ink; ctx.fillRect(x - 1, STATUS_Y - 1, STATUS_W + 2, 14);
    ctx.fillStyle = UI.cream; ctx.fillRect(x, STATUS_Y, STATUS_W, 12);
    drawText(ctx, this.statusLine, VIEW_W / 2, STATUS_Y + 3, { size: 1, color: UI.ink, align: 'center', shadow: false });
  }

  draw(ctx) {
    drawLane(ctx);
    drawDim(ctx, 0.62);
    drawShadow(ctx, TRUCK_X, TRUCK_Y, 150, 0.35);
    drawTruck(ctx, TRUCK_X, TRUCK_Y, TRUCK_OPTS);
    const phase = this.phase;
    if (phase === 'role') {
      drawSlate(ctx, ROLE_SLATE.x, ROLE_SLATE.y, ROLE_SLATE.w, ROLE_SLATE.h, { title: 'ONLINE CO-OP' });
      drawMenuRows(ctx, ROLE_ROWS, ROLE_SLATE.x, ROLE_SLATE.y + 44, ROLE_SLATE.w, this.sel, this.frame, 16);
      drawHint(ctx, this.roleHint);
      return;
    }
    if (phase === 'code') {
      this.drawTable(ctx, this.codeChars, true);
      drawTextOutlined(ctx, 'JOIN A TABLE', TICKET.x + TICKET.w / 2, BANNER_Y, { size: 2, color: UI.cream, outline: UI.ink, thickness: 1, align: 'center', shadow: false });
      drawHint(ctx, this.codeHint);
      return;
    }
    if (phase === 'error') {
      const h = 16 + ROW * 3 + 6;
      drawTicket(ctx, 140, 130, 360, h, { title: 'THE ROOM CLOSED' });
      drawText(ctx, (this.net && (this.net.endReason || this.net.error)) || 'session ended', 320, 130 + 22, { size: 1, color: UI.ink, align: 'center', shadow: false });
      drawText(ctx, this.endHint, 320, 130 + 22 + ROW * 2, { size: 1, color: UI.ink, align: 'center', shadow: false });
      return;
    }
    this.drawTable(ctx, this.codeChars, false);
    this.drawSeats(ctx);
    this.drawStatusLine(ctx);
    if (phase === 'connecting') {
      drawTextOutlined(ctx, WAIT_TEXT[(this.frame >> 4) % WAIT_TEXT.length], TICKET.x + TICKET.w / 2, BANNER_Y, { size: 2, color: UI.cream, outline: UI.ink, thickness: 1, align: 'center', shadow: false });
    } else if (this.allReady || phase === 'starting') {
      // The 'starting' PHASE is never drawn - the session resets us to the map in the same call that flips its
      // state - so the GDD's STARTING! beat is keyed off the ROSTER being all-ready instead. That window is real:
      // the host refuses to start until the round-trip times have settled, and every guest sits in it between its
      // own READY and the host's START packet.
      drawTextOutlined(ctx, STARTING_TEXT, TICKET.x + TICKET.w / 2, BANNER_Y, { size: 2, color: UI.cream, outline: UI.ink, thickness: 1, align: 'center', shadow: false });
    }
    drawHint(ctx, this.lobbyHint);
  }

  summary() {
    const net = this.net;
    return {
      phase: this.phase, banner: this.allReady ? STARTING_TEXT : '', code: this.shownCode || this.code, typing: this.typing,
      state: net ? net.state : '', slot: net ? net.localSlot : -1,
      party: this.party.map((m) => ({ slot: m.slot, critter: m.critter, ready: m.ready, local: m.local })),
      link: this.link, reason: net ? (net.endReason || net.error) : '',
    };
  }
  /** Nothing here runs under lockstep (the session resets us away at START), but the canary wants a list. */
  checksumFields() { return [this.sel, this.code.length, this.party.length]; }
}
