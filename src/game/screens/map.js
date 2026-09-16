// The world map (docs/GDD.md section 4, docs/ARCHITECTURE.md section 5): one shared truck on a 1920x1080 storybook
// plane. Every seated player's stick is a vector; they are summed (the driver's x1.5), quantised to 16 headings on
// dcos/dsin tables built here, and the truck turns one step per 4 frames, rolling 2.2 px/frame on a lane and 1.0 in
// the fields; the river stops it except on the bridges. Arriving within 40 px of a landmark's door opens its
// mini-game (or the kitchen at home with the order complete), otherwise a wooden sign says why not.
//
// Everything in update() is deterministic: input by seat only, distances from + - * / and Math.sqrt, no clock, no
// Math.random; run.truck { x, y, heading, at } is the state that survives between visits and feeds the desync canary.
// The camera, the animation players, the sails, the bees, the smoke and the particles are visual and never hashed.
import { VIEW_W, VIEW_H, SIGNAL } from '../../constants.js';
import { Screen } from '../game.js';
import { dcos, dsin } from '../../engine/trig.js';
import { approach } from '../../engine/math.js';
import { particles } from '../../engine/particles.js';
import { drawShadow, steamPuff, ringAt, floatText } from '../../art/fx.js';
import { pulse } from '../../art/layers.js';
import { measureText } from '../../engine/text.js';
import { critterRig } from '../../content/critters/common.js';
import { getCritter } from '../../content/critters/index.js';
import { AnimPlayer } from '../animation.js';
import { WORLD_W, WORLD_H, PLACES } from '../../content/places.js';
import { drawTruck } from '../../art/truck.js';
import {
  CHUNK_W, CHUNK_H, CHUNKS_X, CHUNKS_Y, DRIVE_MIN_X, DRIVE_MAX_X, DRIVE_MIN_Y, DRIVE_MAX_Y, LANE_HALF, SPOTS, SIGN_AT, PARK_AT,
  ROADSIDE_TREES, GLINTS, chunkLayer, treeSprite, signSprite, cloudShadowSprite, destGlowSprite, laneDist, riverBlocked,
  drawSails, drawHen, drawBee, drawPhoneRing, MAP,
} from '../../art/backgrounds/map.js';
import { drawTicketHud, drawSeatPlates, drawWheel, drawDestArrow, drawHonk, drawSignPlate, drawMapHint } from '../maphud.js';

const HEADINGS = 16;
/** Unit vectors of the 16 headings (0 = east, clockwise on screen), from the deterministic trig. */
const COS = new Float64Array(HEADINGS), SIN = new Float64Array(HEADINGS);
for (let h = 0; h < HEADINGS; h++) { COS[h] = dcos(h * Math.PI / 8); SIN[h] = dsin(h * Math.PI / 8); }
/** Integer orbit table for the hive's bees (32 steps, radius 10): no trig in draw for these either. */
const BEE_X = new Int8Array(32), BEE_Y = new Int8Array(32);
for (let i = 0; i < 32; i++) { BEE_X[i] = Math.round(Math.cos(i * Math.PI / 16) * 10); BEE_Y[i] = Math.round(Math.sin(i * Math.PI / 16) * 6); }
const LANE_SPEED = 2.2, FIELD_SPEED = 1.0, TURN_EVERY = 4, ARRIVE_R = 40, DRIVER = 'chicory', DRIVER_WEIGHT = 1.5;
const HONK_FRAMES = 30, SQUASH_FRAMES = 4, SIGN_FRAMES = 90, RING_FRAMES = 60, TOKEN_SCALE = 0.5;
const KIND_TREE = 0, KIND_SIGN = 1, KIND_SAILS = 2, KIND_TRUCK = 3;
const DUST = { size: 2, life: 20, vy: -0.15 };
const COMING_SOON = 'COMING SOON', NOTHING = 'NOTHING NEEDED HERE', GATHER = 'GATHER THE ORDER FIRST';
const CLOUDS = [[200, 260], [900, 700], [1500, 420]];
/** The phone rings once per order: remembered per run object so a revisit stays quiet until run.served changes. */
let rungRun = null, rungServed = -1;

function placeIndex(id) { for (let i = 0; i < PLACES.length; i++) if (PLACES[i].id === id) return i; return -1; }
/** The heading whose unit vector is most aligned with (vx, vy): a dot-product argmax, so no atan2 in the sim. */
function bestHeading(vx, vy) {
  let best = 0, bd = -Infinity;
  for (let h = 0; h < HEADINGS; h++) { const d = vx * COS[h] + vy * SIN[h]; if (d > bd) { bd = d; best = h; } }
  return best;
}

export class MapScreen extends Screen {
  constructor(game) { super(game, 'map'); this.sprites = []; this.order = []; this.seats = []; this.heads = []; this.sum = [0, 0, 0, 0, 0]; }
  enter(params) {
    super.enter(params);
    const run = this.game.run, truck = run.truck;
    particles.clear();
    if (truck.x === 0 && truck.y === 0) { truck.x = PARK_AT.x; truck.y = PARK_AT.y; truck.heading = 0; truck.at = 'home'; }
    this.truck = truck;
    this.speed = 0; this.want = -1; this.turnCd = 0; this.facing = COS[truck.heading] < 0 ? -1 : 1;
    this.honk = 0; this.squashT = 0; this.signTimer = 0; this.signText = ''; this.signW = 0; this.ring = 0; this.splashCd = 0;
    this.wheelAcc = 0; this.wheelStep = 0; this.lean = 0; this.pushMask = 0; this.blocked = false;
    // the crew: one rig per seat in the seat's apron colour, one animation player each; heads ride in the windows
    this.seats.length = 0; this.heads.length = 0;
    for (const p of run.party) {
      const def = getCritter(p.critter), rig = critterRig(def, p.slot), player = new AnimPlayer(def.anims);
      player.play('idle');
      const plateText = `P${p.slot + 1} ${def.name}`;
      this.seats.push({ slot: p.slot, critter: p.critter, rig, player, plateText, plateW: measureText(plateText, 1) + 8 });
    }
    // the driver sits in the cab: the hare when seated, else seat 0
    const di = Math.max(0, this.seats.findIndex((s) => s.critter === DRIVER));
    this.heads.push({ rig: this.seats[di].rig, pose: this.seats[di].player.pose });
    for (let i = 0; i < this.seats.length; i++) if (i !== di) this.heads.push({ rig: this.seats[i].rig, pose: this.seats[i].player.pose });
    // where the order wants us: the landmark of the first missing ingredient, or home when everything is aboard
    const miss = run.missing();
    this.destId = miss.length ? run.placeFor(miss[0].id) : 'home';
    this.destSign = SIGN_AT[this.destId] || SIGN_AT.home;
    if (rungRun !== run || rungServed !== run.served) { rungRun = run; rungServed = run.served; this.ring = RING_FRAMES; }
    // the y-sorted cast of the map: roadside trees, signposts, the mill's sails and the truck
    this.sprites.length = 0;
    for (const t of ROADSIDE_TREES) { const L = treeSprite(t[2]); this.sprites.push({ kind: KIND_TREE, x: t[0], y: t[1], L, w: L.w, h: L.h, shadow: 18 + t[2] * 4 }); }
    for (const p of PLACES) { const s = SIGN_AT[p.id], L = signSprite(p.sign); this.sprites.push({ kind: KIND_SIGN, x: s.x, y: s.y, L, w: L.w, h: L.h, shadow: 16 }); }
    this.sprites.push({ kind: KIND_SAILS, x: SPOTS.millHub.x, y: SPOTS.millHub.y + 52, L: null, w: 70, h: 100, shadow: 0 });
    this.truckSprite = { kind: KIND_TRUCK, x: truck.x, y: truck.y, L: null, w: 44, h: 40, shadow: 40 };
    this.sprites.push(this.truckSprite);
    this.order.length = 0; for (let i = 0; i < this.sprites.length; i++) this.order.push(i);
    this.glow = destGlowSprite(); this.cloud = cloudShadowSprite();
    // dev-only nudge so a capture can show the truck rolling: seat 0 is pushed east for the first two seconds
    this.devDrive = this.game.options.debug && this.game.options.autotest ? 120 : 0;
    this.cam = { x: 0, y: 0, fx: truck.x - VIEW_W / 2, fy: truck.y - VIEW_H / 2 };
    this.snapCamera(true);
  }
  snapCamera(hard) {
    const c = this.cam, tx = this.truck.x - VIEW_W / 2, ty = this.truck.y - VIEW_H / 2;
    if (hard) { c.fx = tx; c.fy = ty; } else { c.fx += (tx - c.fx) * 0.1; c.fy += (ty - c.fy) * 0.1; }
    c.fx = Math.max(0, Math.min(WORLD_W - VIEW_W, c.fx)); c.fy = Math.max(0, Math.min(WORLD_H - VIEW_H, c.fy));
    c.x = Math.round(c.fx); c.y = Math.round(c.fy);
  }

  update() {
    super.update();
    const inp = this.game.input, game = this.game, truck = this.truck;
    if (inp.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    for (const s of this.seats) s.player.tick();
    // steering: every seat's stick summed, the driver's weighted; the wheel widget lights the seats that push
    let vx = 0, vy = 0, mask = 0;
    for (const s of this.seats) {
      const ax = inp.axisX(s.slot), ay = inp.axisY(s.slot);
      if (ax !== 0 || ay !== 0) mask |= 1 << s.slot;
      const w = s.critter === DRIVER ? DRIVER_WEIGHT : 1;
      vx += ax * w; vy += ay * w;
    }
    if (this.devDrive > 0) { this.devDrive--; vx += 1; mask |= 1; }
    this.pushMask = mask;
    const pushing = vx !== 0 || vy !== 0;
    this.want = pushing ? bestHeading(vx, vy) : -1;
    if (this.turnCd > 0) this.turnCd--;
    let leanTo = 0;
    if (this.want >= 0 && this.want !== truck.heading) {
      const d = (this.want - truck.heading + HEADINGS) % HEADINGS, dir = d <= HEADINGS / 2 ? 1 : -1;
      leanTo = dir * 0.45;
      if (this.turnCd === 0) { truck.heading = (truck.heading + dir + HEADINGS) % HEADINGS; this.turnCd = TURN_EVERY; }
    }
    this.lean = approach(this.lean, leanTo, 0.08);
    const onLane = laneDist(truck.x, truck.y) <= LANE_HALF + 2;
    const target = pushing ? (onLane ? LANE_SPEED : FIELD_SPEED) : 0;
    this.speed = approach(this.speed, target, this.speed < target ? 0.12 : 0.25);
    this.blocked = false;
    if (this.speed > 0) {
      let nx = truck.x + COS[truck.heading] * this.speed, ny = truck.y + SIN[truck.heading] * this.speed;
      nx = nx < DRIVE_MIN_X ? DRIVE_MIN_X : nx > DRIVE_MAX_X ? DRIVE_MAX_X : nx;
      ny = ny < DRIVE_MIN_Y ? DRIVE_MIN_Y : ny > DRIVE_MAX_Y ? DRIVE_MAX_Y : ny;
      if (riverBlocked(nx, ny)) {
        this.speed = 0; this.blocked = true;
        if (this.splashCd === 0) { ringAt(nx, ny, 4, 18, MAP.skyTop, 2, 16, true); floatText(nx, ny - 14, 'SPLASH', MAP.skyTop); this.splashCd = 30; }
      } else { truck.x = nx; truck.y = ny; }
      this.wheelAcc += this.speed; this.wheelStep = Math.floor(this.wheelAcc / 5) & 3;
      if (!onLane && (this.frame % 6) === 0) particles.spawn('dust', truck.x - COS[truck.heading] * 12, truck.y, DUST);
    }
    if (this.splashCd > 0) this.splashCd--;
    if (COS[truck.heading] > 0.01) this.facing = 1; else if (COS[truck.heading] < -0.01) this.facing = -1;
    // arrival: the first landmark whose door is within reach; leaving one clears `at` so it can fire again
    let near = -1;
    for (let i = 0; i < PLACES.length; i++) { const dx = PLACES[i].x - truck.x, dy = PLACES[i].y - truck.y; if (dx * dx + dy * dy < ARRIVE_R * ARRIVE_R) { near = i; break; } }
    if (near < 0) truck.at = '';
    else if (truck.at !== PLACES[near].id) { truck.at = PLACES[near].id; this.arrive(near); }
    if (inp.anyPressed('alt') >= 0) { this.honk = HONK_FRAMES; this.squashT = SQUASH_FRAMES; }
    if (this.honk > 0) this.honk--;
    if (this.squashT > 0) this.squashT--;
    if (this.signTimer > 0) this.signTimer--;
    if (this.ring > 0) this.ring--;
    this.truckSprite.x = truck.x; this.truckSprite.y = truck.y;
    this.snapCamera(false);
  }
  arrive(i) {
    const run = this.game.run, id = PLACES[i].id, screen = run.screenForPlace(id);
    if (screen) { this.game.fadeTo(() => this.game.replace(screen, { place: id })); return; }
    this.signText = id === 'home' ? GATHER : PLACES[i].screen ? NOTHING : COMING_SOON;
    this.signW = measureText(this.signText, 1) + 24;
    this.signTimer = SIGN_FRAMES;
  }

  draw(ctx) {
    const cam = this.cam, truck = this.truck, f = this.frame;
    const c0 = Math.floor(cam.x / CHUNK_W), c1 = Math.min(CHUNKS_X - 1, Math.floor((cam.x + VIEW_W - 1) / CHUNK_W));
    const r0 = Math.floor(cam.y / CHUNK_H), r1 = Math.min(CHUNKS_Y - 1, Math.floor((cam.y + VIEW_H - 1) / CHUNK_H));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) ctx.drawImage(chunkLayer(r * CHUNKS_X + c).canvas, c * CHUNK_W - cam.x, r * CHUNK_H - cam.y);
    // the cheap per-frame marks on the ground: glints, hens, bees, the phone, the chimney
    ctx.fillStyle = MAP.skyTop;
    for (let i = 0; i < GLINTS.length; i++) {
      if (!(((f + i * 7) >> 4) & 1)) continue;
      const gx = GLINTS[i][0] - cam.x, gy = GLINTS[i][1] - cam.y;
      if (gx >= 0 && gx < VIEW_W && gy >= 0 && gy < VIEW_H) ctx.fillRect(gx, gy, 2, 1);
    }
    for (let i = 0; i < SPOTS.hens.length; i++) { const h = SPOTS.hens[i]; if (this.inView(h.x, h.y, 16)) drawHen(ctx, h.x - cam.x, h.y - cam.y, ((f + i * 12) >> 4) & 1, i === 0 ? 1 : -1); }
    if (this.inView(SPOTS.hiveCentre.x, SPOTS.hiveCentre.y, 20)) for (let i = 0; i < 4; i++) { const k = ((f >> 1) + i * 8) & 31; drawBee(ctx, SPOTS.hiveCentre.x + BEE_X[k] - cam.x, SPOTS.hiveCentre.y + BEE_Y[k] - cam.y); }
    if (this.ring > 0 && this.inView(SPOTS.phone.x, SPOTS.phone.y, 20)) drawPhoneRing(ctx, SPOTS.phone.x - cam.x, SPOTS.phone.y - cam.y, this.ring > RING_FRAMES - 30 ? ((f >> 1) & 1) * 2 - 1 : 0);
    if (this.inView(SPOTS.chimney.x, SPOTS.chimney.y, 24)) { steamPuff(ctx, SPOTS.chimney.x - cam.x, SPOTS.chimney.y - cam.y, f, 24); steamPuff(ctx, SPOTS.chimney.x - cam.x + 1, SPOTS.chimney.y - cam.y, f + 12, 24); }
    particles.draw(ctx, cam, 'back');
    // shadows first, then the y-sorted pass (insertion sort on a reused index list: it is nearly sorted every frame)
    const sp = this.sprites, ord = this.order;
    let n = 0;
    for (let i = 0; i < sp.length; i++) { const s = sp[i]; if (s.x + s.w / 2 < cam.x || s.x - s.w / 2 > cam.x + VIEW_W || s.y < cam.y || s.y - s.h > cam.y + VIEW_H) continue; ord[n++] = i; }
    for (let i = 1; i < n; i++) { const v = ord[i]; let j = i - 1; while (j >= 0 && (sp[ord[j]].y > sp[v].y || (sp[ord[j]].y === sp[v].y && ord[j] > v))) { ord[j + 1] = ord[j]; j--; } ord[j + 1] = v; }
    for (let i = 0; i < n; i++) { const s = sp[ord[i]]; if (s.shadow) drawShadow(ctx, s.x - cam.x, s.y - cam.y, s.shadow, 0.35); }
    for (let i = 0; i < n; i++) {
      const s = sp[ord[i]], sx = s.x - cam.x, sy = s.y - cam.y;
      if (s.kind === KIND_TRUCK) this.drawTruck(ctx, sx, sy);
      else if (s.kind === KIND_SAILS) drawSails(ctx, SPOTS.millHub.x - cam.x, SPOTS.millHub.y - cam.y, f * 0.3);
      else ctx.drawImage(s.L.canvas, sx - (s.L.w >> 1), sy - s.L.h);
    }
    // the lantern glow over the destination's sign (the map's one signal colour), then the drifting cloud shadows
    const gs = this.destSign, gx = gs.x - cam.x, gy = gs.y - 18 - cam.y;
    if (gx > -24 && gx < VIEW_W + 24 && gy > -24 && gy < VIEW_H + 24) {
      ctx.globalAlpha = 0.5 + 0.3 * pulse(f, 90); ctx.drawImage(this.glow.canvas, gx - 22, gy - 22); ctx.globalAlpha = 1;
      // the lantern itself: a 4x5 gold lamp on an ink hook above the board
      ctx.fillStyle = MAP.plum; ctx.fillRect(gx - 3, gy - 22, 6, 2); ctx.fillRect(gx - 1, gy - 20, 2, 2);
      ctx.fillStyle = SIGNAL.map; ctx.fillRect(gx - 2, gy - 18, 4, 5);
    }
    for (let i = 0; i < CLOUDS.length; i++) {
      const cx = ((CLOUDS[i][0] + f * 0.15) % (WORLD_W + 160)) - 160 - cam.x, cy = CLOUDS[i][1] - cam.y;
      if (cx > -160 && cx < VIEW_W && cy > -60 && cy < VIEW_H) ctx.drawImage(this.cloud.canvas, Math.round(cx), cy);
    }
    particles.draw(ctx, cam, 'front');
    if (this.honk > 0) drawHonk(ctx, truck.x - cam.x + this.facing * 8, truck.y - cam.y - 44, (HONK_FRAMES - this.honk) / HONK_FRAMES);
    // HUD
    drawTicketHud(ctx, this.game.run);
    drawSeatPlates(ctx, this.seats);
    drawWheel(ctx, this.pushMask, this.lean);
    drawDestArrow(ctx, gs.x - cam.x, gs.y - 12 - cam.y, f);
    if (this.signTimer > 0) drawSignPlate(ctx, this.signText, this.signW, SIGN_FRAMES - this.signTimer);
    drawMapHint(ctx);
  }
  inView(wx, wy, m) { const c = this.cam; return wx >= c.x - m && wx <= c.x + VIEW_W + m && wy >= c.y - m && wy <= c.y + VIEW_H + m; }
  drawTruck(ctx, sx, sy) {
    const moving = this.speed > 0.2;
    drawTruck(ctx, sx, sy, this.truckOpts(moving ? ((this.frame >> 2) & 1) : 0));
  }
  /** Reuse one options object for drawTruck (zero allocation in draw). */
  truckOpts(bob) {
    const o = this._to || (this._to = { scale: TOKEN_SCALE, facing: 1, bob: 0, wheel: 0, squash: 1, heads: this.heads });
    o.facing = this.facing; o.bob = bob; o.wheel = this.wheelStep; o.squash = this.squashT > 0 ? 1.1 : 1; o.heads = this.heads;
    return o;
  }

  summary() {
    const t = this.truck;
    return { truck: { x: Math.round(t.x), y: Math.round(t.y), heading: t.heading, at: t.at }, speed: Math.round(this.speed * 100) / 100, dest: this.destId, sign: this.signTimer > 0 ? this.signText : '', honk: this.honk > 0, blocked: this.blocked, seats: this.seats.length };
  }
  /** Every field that could diverge between peers (net/checksum.js). */
  checksumFields() {
    const t = this.truck, s = this.sum;
    s[0] = t.x; s[1] = t.y; s[2] = t.heading; s[3] = this.speed; s[4] = placeIndex(t.at);
    return s;
  }
}
