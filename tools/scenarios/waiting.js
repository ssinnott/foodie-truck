// Playtest scenarios for THE LINE, WAITING (docs/GDD.md sections 6, 7 and 10; game/waiting.ts and
// content/critters/dinerAnims.ts; registered in tools/scenarios/index.js). Each export is `async (server) => void`
// using withPage / assert from ../playtest.js.
//
//   waitingDeal - the deal, in node: the same seed deals the same line the same beats, frame for frame, and another
//        seed another; only the beats a place deals are ever played; a diner is only ever turned round for a look or
//        a chat, and a chat is two neighbours in the same row turned to each other; a favourite comes up more than
//        anything else; a fed line pats its tummy first; and none of it touches the gameplay rng.
//   lineBeats - the line on the lane: each diner waves once (a hello that ends, never the cast's endless wave) and only
//        then starts fidgeting - a variety of beats across the line, the chats face to face - while the gameplay rng
//        never moves, the checksum cannot see a beat, and the same line reopened does the same things. Writes
//        tools/screens/line-beats.png.
//   hatchBeats - the line at the kitchen's hatch fidgets while the order cooks, with nothing that is all feet and no
//        chat; whoever the order-taker is asking holds still to give their order; and once a plate is in a diner's
//        paws they hold it. Writes tools/screens/kitchen-beats.png.
//   fedBeats - results: nobody fidgets with a plate in their paws; each diner cheers their empty plate twice and comes
//        down (never the cast's endless cheer), pats a full tummy first, and then anything a fed line does. Writes
//        tools/screens/results-beats.png.
import { withPage, assert } from '../playtest.js';
import { cook } from './kitchen.js';
import { AnimPlayer } from '../../src/lib/art/animation.ts';
import { rng } from '../../src/lib/engine/rng.ts';
import { getCustomer } from '../../src/content/critters/customers.ts';
import { DINERS } from '../../src/content/critters/diners.ts';
import { FAVOURITE } from '../../src/content/critters/dinerAnims.ts';
import { WaitingBeats, LINE_BEATS, HATCH_BEATS, FED_BEATS } from '../../src/game/waiting.ts';

/** The animations a set of beats plays: a chat is `talk` and `agree`. */
const animsOf = (set) => new Set(set.flatMap((b) => (b === 'chat' ? ['talk', 'agree'] : [b])));
/** The frames a non-looping animation in a diner's table runs for. */
const lengthOf = (name) => getCustomer('owl').anims[name].frames.reduce((n, f) => n + f.dur, 0);
/** The screens' own animations around the beats. */
const LINE_OWN = ['idle', 'hello'], HATCH_OWN = ['idle', 'wave', 'carry'], FED_OWN = ['idle', 'carry', 'eat', 'hooray'];
/** Who may stand turned round, and what they must be doing. */
const TURNED = new Set(['look', 'talk', 'agree']);

/**
 * Step the top screen `n` frames, one at a time inside the page, and log its diners on every one: their animation,
 * facing and (results) whether they hold a plate, through `field` (the screen's list of diners).
 */
async function sample(page, field, n) {
  return page.evaluate(([fld, k]) => {
    const g = window.__game.game, out = [];
    for (let i = 0; i < k; i++) {
      window.__game.step(1);
      const s = g.screen, list = s[fld] || [];
      out.push({
        f: s.frame, screen: s.id, anims: list.map((d) => d.player.name), facing: list.map((d) => d.facing),
        holding: list.map((d) => !!(d.holding || d.served)), asking: s.friends ? s.friends.asking : -1, askT: s.friends ? s.friends.t : 0,
      });
    }
    return out;
  }, [field, n]);
}

/** Every sample where a diner stands turned round while doing something that does not turn them, as `i@frame:anim`. */
function strayTurns(log) {
  const bad = [];
  for (const s of log) s.facing.forEach((fc, i) => { if (fc > 0 && !TURNED.has(s.anims[i])) bad.push(`${i}@${s.f}:${s.anims[i]}`); });
  return bad;
}

/** Every sample where someone talks without a neighbour in their row agreeing and facing them, as `i@frame`. */
function lonelyTalk(log, rowOf, xs) {
  const bad = [];
  for (const s of log) {
    s.anims.forEach((a, i) => {
      if (a !== 'talk') return;
      const j = [i - 1, i + 1].find((k) => k >= 0 && k < s.anims.length && rowOf(k) === rowOf(i) && s.anims[k] === 'agree');
      if (j == null) { bad.push(`${i}@${s.f}`); return; }
      const left = xs[i] < xs[j] ? i : j, right = left === i ? j : i;
      if (s.facing[left] !== 1 || s.facing[right] !== -1) bad.push(`${i}+${j}@${s.f} facing ${s.facing[left]},${s.facing[right]}`);
    });
  }
  return bad;
}

/** The beat animations seen in a log (none of the screen's own). */
function beatsSeen(log, own) {
  const seen = new Set();
  for (const s of log) for (const a of s.anims) if (!own.includes(a)) seen.add(a);
  return seen;
}

/** Deal `frames` frames to a line of diners the way a screen does - tick, back to idle when done, then the beats -
 *  every one freed at frame 0, and return the trace and the deal. */
function deal(seed, ids, set, rows, xs, first = '', frames = 900) {
  const beats = new WaitingBeats();
  beats.enter(seed, ids, set, rows, xs, first);
  const diners = ids.map((id) => { const player = new AnimPlayer(getCustomer(id).anims); player.play('idle'); return { player, facing: -1 }; });
  ids.forEach((_, i) => beats.free(i, 0));
  const trace = [];
  for (let f = 1; f <= frames; f++) {
    for (const d of diners) { d.player.tick(); if (d.player.done) d.player.play('idle', { restart: true }); }
    beats.update(f, diners);
    trace.push({ f, anims: diners.map((d) => d.player.name), facing: diners.map((d) => d.facing) });
  }
  return { trace, beats };
}

export const SCENARIOS = {
  async waitingDeal() {
    // nine of the roll in the line's shape: six along the front, three in the row behind running back the other way
    const ids = DINERS.slice(0, 9), rows = ids.map((_, i) => (i < 6 ? 0 : 1)), xs = ids.map((_, i) => (i < 6 ? 268 + i * 62 : 547 - (i - 6) * 56));
    const rowOf = (i) => rows[i];
    const rng0 = rng.state;
    const a = deal(7, ids, LINE_BEATS, rows, xs), b = deal(7, ids, LINE_BEATS, rows, xs), c = deal(8, ids, LINE_BEATS, rows, xs);
    assert(rng.state === rng0, `dealing three lines never touches the gameplay rng (${rng0} -> ${rng.state})`);
    const key = (t) => t.trace.map((s) => s.anims.join() + s.facing.join()).join('|');
    assert(key(a) === key(b), 'the same seed deals the same line the same beats, frame for frame');
    assert(key(a) !== key(c), 'and another seed deals another');
    const seen = beatsSeen(a.trace, ['idle']), allowed = animsOf(LINE_BEATS);
    assert([...seen].every((x) => allowed.has(x)), `the line plays nothing but its beats (${[...seen].join()})`);
    assert(seen.size >= 6 && a.beats.dealt >= 18, `and plenty of them: ${a.beats.dealt} dealt, ${seen.size} kinds (${[...seen].join()})`);
    assert(strayTurns(a.trace).length === 0, `nobody stands turned round but for a look or a chat (${strayTurns(a.trace).slice(0, 4).join(' ')})`);
    assert(a.beats.chats > 0 && lonelyTalk(a.trace, rowOf, xs).length === 0, `${a.beats.chats} chats, each between neighbours in a row turned to each other (${lonelyTalk(a.trace, rowOf, xs).slice(0, 4).join(' ')})`);
    // the hatch: no feet, no chats
    const h = deal(7, ids, HATCH_BEATS, null, null), hs = beatsSeen(h.trace, ['idle']);
    assert(![...hs].some((x) => ['tap', 'dance', 'talk', 'agree'].includes(x)) && hs.size >= 4, `the hatch deals nothing that is all feet and no chat (${[...hs].join()})`);
    // a fed line: everybody pats a full tummy first
    const fed = deal(7, ids, FED_BEATS, rows, xs, 'full');
    const firsts = ids.map((_, i) => { const s = fed.trace.find((t) => t.anims[i] !== 'idle'); return s ? s.anims[i] : ''; });
    assert(firsts.every((x) => x === 'full'), `a fed line pats a full tummy first, every one of them (${firsts.join()})`);
    const fs = beatsSeen(fed.trace, ['idle']);
    assert([...fs].every((x) => animsOf(FED_BEATS).has(x)), `and does nothing hungry or impatient after (${[...fs].join()})`);
    // the favourite: a diner alone in a line, dealt for a long while, does theirs most
    for (const id of ['pig', 'badger', 'dog']) {
      const solo = deal(11, [id], LINE_BEATS, null, null, '', 30000), n = solo.beats.counts;
      const top = Object.keys(n).sort((p, q) => n[q] - n[p])[0];
      assert(top === FAVOURITE[id], `the ${id}'s favourite (${FAVOURITE[id]}) comes up more than anything else (${JSON.stringify(n)})`);
    }
  },

  async lineBeats(server) {
    await withPage(server, 'skipTo=line&critters=0,1&day=5&seed=3', async (api, page) => {
      await api.step(1);
      const s0 = await api.summary(), n = s0.top.waiting;
      const xs = s0.top.spots.map((p) => Number(p.split(',')[0])), rowOf = (i) => Math.floor(i / 6);
      assert(s0.top.beats.dealt === 0 && s0.top.anims.every((a) => a === 'idle'), `nobody fidgets before the line has waved (${s0.top.anims.join()})`);
      const rng0 = await page.evaluate(() => window.__game.game.rng.state);
      const log = await sample(page, 'queue', 560);
      const rng1 = await page.evaluate(() => window.__game.game.rng.state);
      assert(log.every((s) => s.screen === 'line'), 'the line stays up while it waits');
      // each diner waves once - a hello that ends - and only then fidgets
      const HELLO = lengthOf('hello');
      const early = [], waving = [];
      for (let i = 0; i < n; i++) {
        const waveAt = 12 + i * 10;
        const first = log.find((s) => !LINE_OWN.includes(s.anims[i]));
        if (first && first.f < waveAt + HELLO) early.push(`${i}@${first.f}`);
        if (log.some((s) => s.anims[i] === 'hello' && (s.f < waveAt || s.f > waveAt + HELLO))) waving.push(i);
      }
      assert(early.length === 0, `nobody fidgets until their hello is over (${early.join(' ')})`);
      assert(waving.length === 0 && log.every((s) => !s.anims.includes('wave')), `every hello ends, and nobody waves on and on (${waving.join()})`);
      const seen = beatsSeen(log, LINE_OWN), allowed = animsOf(LINE_BEATS);
      assert([...seen].every((x) => allowed.has(x)), `the line plays nothing but its beats (${[...seen].join()})`);
      const s1 = await api.summary();
      assert(seen.size >= 5 && s1.top.beats.dealt >= n, `the whole line fidgets: ${s1.top.beats.dealt} beats dealt to ${n} diners, ${seen.size} kinds (${[...seen].join()})`);
      assert(strayTurns(log).length === 0, `nobody stands turned round but for a look or a chat (${strayTurns(log).slice(0, 4).join(' ')})`);
      assert(lonelyTalk(log, rowOf, xs).length === 0, `a chat is two neighbours in a row turned to each other (${lonelyTalk(log, rowOf, xs).slice(0, 4).join(' ')})`);
      assert(rng1 === rng0, `560 frames of waiting never touch the gameplay rng (${rng0} -> ${rng1})`);
      await api.shot('line-beats');
      // nothing about a beat is in the checksum: rewrite the deal and turn everyone round, and the fields do not change
      const same = await page.evaluate(() => {
        const k = window.__game.game.screen, a = k.checksumFields().slice();
        k.beats.dealt += 9; k.beats.list.forEach((s) => { s.due = 1; s.beat = 'look'; }); k.queue.forEach((d) => { d.facing = 1; d.player.play('yawn', { restart: true }); });
        return a.join() === k.checksumFields().slice().join();
      });
      assert(same, 'the line\'s checksum fields cannot see a beat');
      // the same line reopened does the same things (every peer sees one line)
      const trace = async () => {
        await page.evaluate(() => window.__game.game.reset('line'));
        return (await sample(page, 'queue', 360)).map((s) => s.anims.join() + s.facing.join()).join('|');
      };
      assert((await trace()) === (await trace()), 'the same line reopened deals the same beats, frame for frame');
    });
  },

  async hatchBeats(server) {
    await withPage(server, 'skipTo=kitchen&critters=0&seed=7', async (api, page) => {
      await api.step(2);
      const rng0 = await page.evaluate(() => window.__game.game.rng.state);
      const log = await sample(page, 'custs', 600);
      const rng1 = await page.evaluate(() => window.__game.game.rng.state);
      const s = await api.summary();
      const seen = beatsSeen(log, HATCH_OWN), allowed = animsOf(HATCH_BEATS);
      assert([...seen].every((x) => allowed.has(x)) && seen.size >= 3, `the line at the hatch fidgets, nothing that is all feet and no chat (${[...seen].join()})`);
      assert(s.top.crowdBeats.dealt >= s.top.custs, `${s.top.crowdBeats.dealt} beats dealt to ${s.top.custs} diners while the order cooks`);
      assert(strayTurns(log).length === 0, `nobody at the hatch stands turned round but for a look (${strayTurns(log).slice(0, 4).join(' ')})`);
      // whoever is giving the order-taker their order holds still for it: waving, then at idle, while the bead is up
      // (from the ask's first frame: the order-taker moves on to the next diner at the end of a step and asks them on
      // the one after, which is what puts their paw up over whatever they were doing)
      const fidgety = log.filter((x) => x.asking >= 0 && x.askT >= 1 && x.askT < 60 && !['wave', 'idle'].includes(x.anims[x.asking])).map((x) => `${x.asking}@${x.f}:${x.anims[x.asking]}`);
      assert(log.some((x) => x.asking >= 0) && fidgety.length === 0, `whoever is asked for their order holds still to give it (${fidgety.slice(0, 4).join(' ')})`);
      assert(rng1 === rng0, `600 frames of the hatch waiting never touch the gameplay rng (${rng0} -> ${rng1})`);
      await api.shot('kitchen-beats');
      const same = await page.evaluate(() => {
        const k = window.__game.game.screen, a = k.checksumFields().slice();
        k.beats.dealt += 9; k.custs.forEach((c) => { c.facing = 1; c.player.play('sniff', { restart: true }); });
        return a.join() === k.checksumFields().slice().join();
      });
      assert(same, 'the kitchen\'s checksum fields cannot see a beat');
      // the bell: once a diner's plate is in their paws they hold it, and fidget no more
      await page.evaluate(() => window.__game.game.reset('kitchen'));
      await api.step(2);
      await cook(api);
      const serving = await sample(page, 'custs', 240);
      const busy = [];
      for (const x of serving) if (x.screen === 'kitchen') x.anims.forEach((a, i) => { if (x.holding[i] && a !== 'carry') busy.push(`${i}@${x.f}:${a}`); });
      assert(serving.some((x) => x.screen === 'kitchen' && x.holding.some(Boolean)) && busy.length === 0, `a diner with their plate holds it, and fidgets no more (${busy.slice(0, 4).join(' ')})`);
    });
  },

  async fedBeats(server) {
    await withPage(server, 'skipTo=results&critters=0,1&day=5&seed=3', async (api, page) => {
      await api.step(1);
      const s0 = await api.summary(), n = s0.top.diners;
      const xs = await page.evaluate(() => window.__game.game.screen.diners.map((d) => d.x)), rowOf = (i) => Math.floor(i / 6);
      const log = await sample(page, 'diners', 560);
      // nobody fidgets with a plate in their paws
      const busy = [];
      for (const x of log) x.anims.forEach((a, i) => { if (x.holding[i] && !['carry', 'eat'].includes(a)) busy.push(`${i}@${x.f}:${a}`); });
      assert(busy.length === 0, `nobody fidgets with a plate in their paws (${busy.slice(0, 4).join(' ')})`);
      // a cheer at the empty plate that comes down, never the cast's endless one, then a full tummy first
      const HOORAY = lengthOf('hooray');
      const long = [], firsts = [];
      for (let i = 0; i < n; i++) {
        const frames = log.filter((x) => x.anims[i] === 'hooray').length;
        if (frames === 0 || frames > HOORAY + 1) long.push(`${i}:${frames}`);
        const after = log.findIndex((x) => x.anims[i] === 'hooray');
        const first = log.slice(after).find((x) => !FED_OWN.includes(x.anims[i]));
        firsts.push(first ? first.anims[i] : '');
      }
      assert(long.length === 0 && log.every((x) => !x.anims.includes('cheer')), `every diner cheers their empty plate twice and comes down (${long.join(' ')})`);
      assert(firsts.every((x) => x === 'full'), `and pats a full tummy first (${firsts.join()})`);
      const seen = beatsSeen(log, FED_OWN), allowed = animsOf(FED_BEATS);
      assert([...seen].every((x) => allowed.has(x)) && seen.size >= 3, `then does what a fed line does (${[...seen].join()})`);
      assert(strayTurns(log).length === 0 && lonelyTalk(log, rowOf, xs).length === 0, 'turned round only for a look or a chat, the chats face to face');
      const s1 = await api.summary();
      assert(s1.top.chews.every((c) => c === 3) && s1.top.holding.every((h) => !h), `and every plate was still eaten up (${s1.top.chews})`);
      await api.shot('results-beats');
    });
  },
};
