// Playtest scenarios for Hazel Holt (registered in tools/scenarios/index.js).
//
//   holt           - two seats in the grove on the HAZELNUT BROWNIES order (?recipes=51), so the visit is for
//                    hazelnuts: seat 0 is parked at a tree and holds; the tree's bar climbs, letting go early KEEPS
//                    it, holding on to SHAKE_HOLD brings the shower - one nut every SHOWER_EVERY frames into the
//                    basket, never past the target - and the tree goes bare. The rules with the jokes held off:
//                    every crop is parked PLAIN, so no tree sags and no squirrel comes down. Writes holt-shake.
//   holtSquirrel   - the old joke, bigger: a crop dealt SQUIRREL shows its tail in the leaves (the tell); shaken
//                    down, the squirrel tumbles onto the head ('!'), chatters with the stick locked, BONK!s the
//                    head with a nut, leaps off while the critter sees stars, and the critter shakes it off; the
//                    shower under it all lands. Then a round ended in the middle of one drops it cleanly and banks
//                    the nuts. Writes holt-squirrel-tell, -lands, -bonk and -leap.
//   holtAvalanche  - the new joke: a crop dealt HEAVY sags (the tell); its last WINDUP frames of bar are the wind-up
//                    ('!', the shaker staring up - and letting go there is the dodge, the bar keeps); at the top the
//                    whole crop comes down - CRASH!, buried to the ears, out of the heap dazed with a nut on the head,
//                    shaken off - and only the ordinary shower scores. Then Barley gets one and eats the nut off his
//                    head (MMM!), and the order's last shake bringing one down holds the sign until it has played
//                    out. Writes holt-avalanche-tell, -windup, -fall, -crash, -buried, -nut, -shakeoff and -barley.
import { withPage, assert } from '../playtest.js';

const SHAKE_HOLD = 90, SHOWER_EVERY = 5, BARE_FRAMES = 150;
/** The jokes' numbers (game/screens/holtGags.ts), mirrored: a crop's deal, the wind-up, and each beat's frames. */
const PLAIN = 0, HEAVY = 1, SQUIRREL = 2;
const WINDUP = 30;
const AV_FALL = 12, AV_BURIED = 44, AV_DAZED = 44, AV_OFF = 30, AVALANCHE_FRAMES = AV_FALL + AV_BURIED + AV_DAZED + AV_OFF;
/** The pop's jump, and Barley's flip (the dip and the nut's flight) before the chew. */
const POP_JUMP = 10, FLIP = 12;
const SQ_DROP = 10, SQ_SCOLD = 36, SQ_GLOAT = 8, SQ_LEAP = 16, SQ_STARS = 10, SQ_OFF = 12;
const SQUIRREL_FRAMES = SQ_DROP + SQ_SCOLD + SQ_GLOAT + SQ_LEAP + SQ_STARS + SQ_OFF;
/** The HOW TO PLAY card covers the top middle of the grove for its first 210 frames: the jokes' shots wait it out. */
const CARD_GONE = 220;

function seatN(page, n = 0) {
  return page.evaluate((k) => {
    const sc = window.__game.game.screen, s = sc.seats[k];
    return {
      x: s.x, count: s.count, tree: s.tree, squirrelT: s.squirrelT, avalancheT: s.avalancheT, anim: s.anim, total: sc.total, target: sc.target,
      trees: sc.trees.map((t) => ({ ...t })), squirrels: sc.squirrels, avalanches: sc.avalanches, phase: sc.clock.phase,
    };
  }, n);
}
/** Word cards up (game/gags.ts): the same module instance as the game's, since the URL is the same. */
function cards(page) { return page.evaluate(async () => (await import('/src/game/gags.ts')).gagsUp()); }
/**
 * Park seat `n` under tree `i` with every tree full, unheld and nothing in the air, the target held high - and
 * every crop dealt PLAIN except tree i's, which is dealt `gag` (PLAIN is how the rules test holds the jokes off).
 */
function park(page, i, n = 0, gag = PLAIN) {
  return page.evaluate(([k, m, g]) => {
    const sc = window.__game.game.screen, s = sc.seats[m];
    for (const t of sc.trees) { t.shake = 0; t.held = 0; t.refill = 0; t.shower = 0; t.gag = 0; }
    sc.trees[k].gag = g;
    s.x = [90, 250, 410, 570][k]; s.tree = -1; s.squirrelT = 0; s.avalancheT = 0; s.moving = false;
    sc.target = Math.max(sc.target, sc.total + 20); sc.setTotal(sc.total);
  }, [i, n, gag]);
}

export const SCENARIOS = {
  async holt(server) {
    await withPage(server, 'skipTo=holt&critters=0,1&recipes=51', async (api, page) => {
      await api.step(2);
      const s0 = await api.summary();
      assert(s0.screen === 'holt' && s0.top.ing === 'hazelnut' && s0.top.target > 0, `the holt is up as a hazelnut visit (${s0.screen}, ${s0.top.ing}, target ${s0.top.target})`);
      assert(s0.top.trees.length === 4, `four trees in the grove (${s0.top.trees.length})`);
      assert(s0.top.trees.every((t) => t[5] === PLAIN || t[5] === HEAVY || t[5] === SQUIRREL), `every crop the truck pulls up to is dealt (${s0.top.trees.map((t) => t[5])})`);
      // the hold: the bar climbs; let go at 30 and it KEEPS its 30
      await park(page, 1);
      await api.hold(0, { action: true }); await api.step(30); await api.release(0); await api.step(2);
      const kept = await seatN(page);
      assert(kept.tree === -1 && kept.trees[1].shake === 30 && kept.trees[1].held === 0 && kept.count === 0, `letting go early keeps the tree's shake (shake ${kept.trees[1].shake}, held ${kept.trees[1].held}, count ${kept.count})`);
      // hold on: the shower comes at SHAKE_HOLD, one nut every SHOWER_EVERY frames
      await api.hold(0, { action: true }); await api.step(SHAKE_HOLD - 30 + 1);
      await api.shot('holt-shake');
      const sh = await seatN(page);
      assert(sh.trees[1].refill > 0 && sh.trees[1].refill <= BARE_FRAMES && sh.trees[1].shower + sh.count >= 1, `the shower starts and the tree goes bare (refill ${sh.trees[1].refill}, shower left ${sh.trees[1].shower}, count ${sh.count})`);
      await api.release(0);
      await api.step(SHOWER_EVERY * 9);
      const done = await seatN(page);
      assert(done.count >= 1 && done.count <= 3 && done.total === done.count && done.trees[1].shower === 0, `one to three nuts land in the basket (count ${done.count}, total ${done.total})`);
      // never past the target: a shower on a target one away is one nut
      await park(page, 2);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = sc.total + 1; sc.setTotal(sc.total); sc.trees[2].shake = 89; });
      await api.hold(0, { action: true }); await api.step(2); await api.release(0); await api.step(SHOWER_EVERY * 9);
      const capped = await seatN(page);
      assert(capped.total === capped.target && capped.trees[2].shower === 0, `a shower never counts past the target (total ${capped.total}, target ${capped.target})`);
      assert(capped.squirrels === 0 && capped.avalanches === 0, `the jokes were held off: the rules saw neither (squirrels ${capped.squirrels}, avalanches ${capped.avalanches})`);
    });
  },

  async holtSquirrel(server) {
    await withPage(server, 'skipTo=holt&critters=0,1&recipes=51', async (api, page) => {
      await api.step(CARD_GONE);
      // the tell: a crop dealt the squirrel hangs its tail out of the leaves
      await park(page, 1, 0, SQUIRREL);
      await api.step(4);
      const tell = await api.summary();
      assert(tell.top.trees[1][5] === SQUIRREL && tell.top.squirrels === 0, `tree 1's crop is the squirrel's (gag ${tell.top.trees[1][5]})`);
      await api.shot('holt-squirrel-tell');
      // shake it down: one frame from the top, the second held frame brings the shower and the squirrel with it
      await page.evaluate(() => { window.__game.game.screen.trees[1].shake = 89; });
      await api.hold(0, { action: true }); await api.step(2); await api.release(0);
      const got = await seatN(page);
      assert(got.squirrelT === SQUIRREL_FRAMES && got.squirrels === 1 && got.anim === 'lookUp', `the squirrel comes down with the nuts (squirrelT ${got.squirrelT}, squirrels ${got.squirrels}, anim '${got.anim}')`);
      assert(got.trees[1].gag === PLAIN && got.trees[1].refill === BARE_FRAMES && got.avalancheT === 0, `the deal is spent, the tree bare, and never both jokes at once (gag ${got.trees[1].gag}, avalancheT ${got.avalancheT})`);
      // the landing: '!' over the head, and the scolding
      await api.step(SQ_DROP + 8);
      const landed = await seatN(page);
      assert(landed.anim === 'squirrelHat' && (await cards(page)) >= 1, `it lands on the head ('!' up) and scolds (anim '${landed.anim}')`);
      await api.shot('holt-squirrel-lands');
      // the stick is locked through the beat
      const x0 = landed.x;
      await api.hold(0, { right: true }); await api.step(SQ_SCOLD - 8 - 4); await api.release(0);
      const held = await seatN(page);
      assert(held.x === x0 && held.squirrelT > 0, `the stick is locked while it sits there (x ${x0} -> ${held.x}, squirrelT ${held.squirrelT})`);
      // BONK: the nut comes down on the head
      await api.step(4 + 3);
      const bonk = await seatN(page);
      assert(bonk.anim === 'bonked' && (await cards(page)) >= 1, `BONK! - the nut comes down on the head (anim '${bonk.anim}')`);
      await api.shot('holt-squirrel-bonk');
      // it leaps off for the trunk while the critter sees stars
      await api.step(SQ_GLOAT - 3 + SQ_LEAP / 2);
      const leap = await seatN(page);
      assert(leap.anim === 'dizzy' && leap.squirrelT > SQ_STARS + SQ_OFF, `it leaps away and the critter is seeing stars (anim '${leap.anim}', squirrelT ${leap.squirrelT})`);
      await api.shot('holt-squirrel-leap');
      // shaken off: the seat is a player again, and the shower under it all landed
      await api.step(leap.squirrelT);
      const off = await seatN(page);
      assert(off.squirrelT === 0 && off.anim === 'carry', `then it shakes it off (squirrelT ${off.squirrelT}, anim '${off.anim}')`);
      assert(off.count >= 1 && off.count <= 3 && off.total === off.count, `nothing lost: the shower's nuts all landed (count ${off.count}, total ${off.total})`);
      await api.hold(0, { right: true }); await api.step(4); await api.release(0);
      assert((await seatN(page)).x > off.x, 'and it can walk again');
      // a round ended in the middle of one (finish() from anywhere) drops the beat cleanly and banks the nuts
      await park(page, 1, 0, SQUIRREL);
      await page.evaluate(() => { window.__game.game.screen.trees[1].shake = 89; });
      await api.hold(0, { action: true }); await api.step(2 + SQ_DROP + 4); await api.release(0);
      const mid = await seatN(page);
      await page.evaluate(() => window.__game.game.screen.finish());
      const cut = await seatN(page);
      assert(mid.squirrelT > 0 && cut.phase === 1 && cut.squirrelT === 0 && cut.anim === 'cheer', `ended mid-squirrel: the beat is dropped and the critter cheers (squirrelT ${mid.squirrelT} -> ${cut.squirrelT}, anim '${cut.anim}')`);
      await api.step(70);
      const map = await api.summary();
      const line = (map.run.needs || []).find((n) => n.startsWith('hazelnut:')) || '';
      assert(map.screen === 'map' && parseInt(line.split(':')[1], 10) === Math.min(cut.total, parseInt(line.split('/')[1], 10)), `and back on the map with the nuts banked (${map.screen}, ${line}, total ${cut.total})`);
    });
  },

  async holtAvalanche(server) {
    // seat 0 is Sorrel, who shakes it off; seat 1 is Barley, who eats the evidence
    await withPage(server, 'skipTo=holt&critters=1,0&recipes=51', async (api, page) => {
      await api.step(CARD_GONE);
      // the tell: a heavy crop sags its branches
      await park(page, 1, 0, HEAVY);
      await api.step(4);
      const tell = await api.summary();
      assert(tell.top.trees[1][5] === HEAVY && tell.top.avalanches === 0, `tree 1's crop is heavy (gag ${tell.top.trees[1][5]})`);
      await api.shot('holt-avalanche-tell');

      // the wind-up: the bar crosses into its last WINDUP frames and the shaker stares up at the groaning branches
      await page.evaluate((v) => { window.__game.game.screen.trees[1].shake = v; }, SHAKE_HOLD - WINDUP - 5);
      const before = await cards(page);
      await api.hold(0, { action: true }); await api.step(5);
      const wind = await seatN(page);
      assert(wind.trees[1].shake === SHAKE_HOLD - WINDUP && wind.anim === 'shakeLook' && (await cards(page)) === before + 1, `into the wind-up: '!' and a look up (shake ${wind.trees[1].shake}, anim '${wind.anim}')`);
      // the hold is the lock: pushing the stick while it groans goes nowhere
      await api.hold(0, { action: true, right: true }); await api.step(8); await api.hold(0, { action: true });
      const locked = await seatN(page);
      assert(locked.x === wind.x && locked.anim === 'shakeLook', `the stick is locked through the wind-up (x ${wind.x} -> ${locked.x})`);
      await api.shot('holt-avalanche-windup');
      // the dodge: let go in the wind-up and the bar keeps, the stick is free
      await api.release(0); await api.step(1);
      const dodge = await seatN(page);
      assert(dodge.tree === -1 && dodge.trees[1].held === 0 && dodge.trees[1].shake === SHAKE_HOLD - WINDUP + 8 && dodge.avalancheT === 0, `letting go in the wind-up keeps the bar (shake ${dodge.trees[1].shake}, tree ${dodge.tree})`);
      // ...and a grab of a tree already groaning stares straight up
      await api.hold(0, { action: true }); await api.step(1);
      assert((await seatN(page)).anim === 'shakeLook', 'a grab of a groaning tree looks straight up');
      // BANG: the top brings the whole crop down
      const pre = await seatN(page);
      await api.step(SHAKE_HOLD - pre.trees[1].shake + 1); await api.release(0);
      const bang = await seatN(page);
      assert(bang.avalancheT === AVALANCHE_FRAMES - 1 && bang.avalanches === 1 && bang.anim === 'lookUp', `at the top the crop lets go (avalancheT ${bang.avalancheT}, avalanches ${bang.avalanches}, anim '${bang.anim}')`);
      assert(bang.trees[1].gag === PLAIN && bang.trees[1].refill > 0 && bang.trees[1].shower + bang.count >= 1 && bang.squirrels === 0, `the deal is spent, the tree bare, an ordinary shower under it, no squirrel (gag ${bang.trees[1].gag}, shower ${bang.trees[1].shower}, count ${bang.count})`);
      await api.step(AV_FALL / 2 - 1);
      await api.shot('holt-avalanche-fall');
      // CRASH!: buried
      await api.step(AV_FALL / 2 + 4);
      const crash = await seatN(page);
      assert(crash.anim === 'buried' && crash.avalancheT === AVALANCHE_FRAMES - AV_FALL - 4 && (await cards(page)) >= 1, `CRASH! and it is under the heap (anim '${crash.anim}', avalancheT ${crash.avalancheT})`);
      await api.shot('holt-avalanche-crash');
      const x0 = crash.x;
      await api.hold(0, { right: true }); await api.step(16); await api.release(0);
      const buried = await seatN(page);
      assert(buried.x === x0 && buried.anim === 'buried', `buried, the stick does nothing (x ${x0} -> ${buried.x})`);
      await api.shot('holt-avalanche-buried');
      // out of the heap: dazed, the stars going round, a nut balanced on the head
      await api.step(buried.avalancheT - (AV_DAZED + AV_OFF) + POP_JUMP + 6);
      const dazed = await seatN(page);
      assert(dazed.anim === 'dizzy' && dazed.avalancheT < AV_DAZED + AV_OFF && dazed.avalancheT > AV_OFF, `it pops out of the heap dazed (anim '${dazed.anim}', avalancheT ${dazed.avalancheT})`);
      await api.shot('holt-avalanche-nut');
      // shaken off, and a player again
      await api.step(dazed.avalancheT - AV_OFF + 6);
      const shaking = await seatN(page);
      assert(shaking.anim === 'shakeOff', `then it shakes the nut off (anim '${shaking.anim}')`);
      await api.shot('holt-avalanche-shakeoff');
      await api.step(shaking.avalancheT);
      const fine = await seatN(page);
      assert(fine.avalancheT === 0 && fine.anim === 'carry', `and it is over (avalancheT ${fine.avalancheT}, anim '${fine.anim}')`);
      assert(fine.count >= 1 && fine.count <= 3 && fine.total === fine.count, `nothing lost and nothing extra: only the shower scored (count ${fine.count}, total ${fine.total})`);
      await api.hold(0, { right: true }); await api.step(4); await api.release(0);
      assert((await seatN(page)).x > fine.x, 'and it can walk again');

      // Barley eats the evidence: the same avalanche, but the nut on his head goes in his mouth
      await park(page, 2, 1, HEAVY);
      await page.evaluate(() => { window.__game.game.screen.trees[2].shake = 89; });
      const b0 = await seatN(page, 1);
      await api.hold(1, { action: true }); await api.step(2); await api.release(1);
      const bb = await seatN(page, 1);
      assert(bb.avalancheT === AVALANCHE_FRAMES && bb.avalanches === 2, `Barley shakes a heavy one down (avalancheT ${bb.avalancheT})`);
      await api.step(AVALANCHE_FRAMES - AV_OFF);
      const flip = await seatN(page, 1);
      assert(flip.anim === 'flipNut' && flip.avalancheT === AV_OFF, `he flips the nut up off his head instead of shaking it off (anim '${flip.anim}', avalancheT ${flip.avalancheT})`);
      await api.step(FLIP + 6);
      const chomp = await seatN(page, 1);
      assert(chomp.anim === 'chomp' && (await cards(page)) >= 1, `into his mouth: MMM! (anim '${chomp.anim}')`);
      await api.shot('holt-avalanche-barley');
      await api.step(chomp.avalancheT);
      const fed = await seatN(page, 1);
      assert(fed.avalancheT === 0 && fed.anim === 'carry' && fed.count >= b0.count + 1 && fed.count <= b0.count + 3 && fed.total === b0.total + (fed.count - b0.count), `and nothing in the basket was eaten: only his shower scored (count ${b0.count} -> ${fed.count}, total ${b0.total} -> ${fed.total})`);

      // the order's last shake brings a heavy crop down: its first nut completes the order, and the sign waits for
      // the avalanche to play out rather than cut it off in mid-air - then drops, never a nut past the target
      await park(page, 1, 0, HEAVY);
      await page.evaluate(() => { const sc = window.__game.game.screen; sc.target = sc.total + 1; sc.setTotal(sc.total); sc.trees[1].shake = 89; });
      await api.hold(0, { action: true }); await api.step(2); await api.release(0); await api.step(SHOWER_EVERY);
      const last = await seatN(page);
      assert(last.total === last.target && last.phase === 0 && last.avalancheT > 0, `the order is in, but the sign waits for the avalanche (total ${last.total}/${last.target}, phase ${last.phase}, avalancheT ${last.avalancheT})`);
      await api.hold(1, { action: true }); await api.step(2); await api.release(1);
      assert((await seatN(page, 1)).tree === -1, 'and nobody can start another shake meanwhile');
      await api.step(last.avalancheT - 2);
      const ended = await seatN(page);
      assert(ended.phase === 1 && ended.avalancheT === 0 && ended.total === ended.target, `then the sign drops, the target not passed (phase ${ended.phase}, avalancheT ${ended.avalancheT}, total ${ended.total}/${ended.target})`);
    });
  },
};
