// Fail if src/lib/ has drifted from the engine commit it was vendored from.
//
// src/lib/ is the game-engine repository's `src/`, pulled in with `git subtree pull --squash`. Every pull leaves a
// squash commit whose tree IS the library at one engine commit, and whose body names that commit
// (`git-subtree-split: <sha>`). So "is src/lib exactly what the engine shipped?" needs no network and no engine
// checkout: compare src/lib at HEAD (and in the working tree) with the tree of the newest squash commit.
//
// Any difference is a local edit to vendored code. That is the one thing subtree cannot prevent, and the fix is
// lost at the next pull: make the change in game-engine, publish its split branch, and `git subtree pull` it.
//
//   node tools/lib-check.js        (repo root is inferred)
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'src/lib';

function git(...args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed:\n${r.stderr.trim()}`);
  return r.stdout;
}

/** The newest `git subtree --squash` commit for PREFIX reachable from HEAD, or null. */
function latestSquash() {
  const out = git('log', 'HEAD', `--grep=^Squashed '${PREFIX}/'`, '--format=%H %s').trim();
  return out ? out.split('\n')[0] : null;
}

let squash = latestSquash();
// A shallow clone (CI's default, and some session containers) may not reach back to the squash commit.
if (!squash && git('rev-parse', '--is-shallow-repository').trim() === 'true') {
  console.log('shallow clone: fetching full history to find the subtree squash commit');
  git('fetch', '--quiet', '--unshallow');
  squash = latestSquash();
}
if (!squash) {
  console.log(`LIB-CHECK: no "Squashed '${PREFIX}/'" commit is reachable from HEAD, so there is nothing to compare against.`);
  console.log(`${PREFIX} must be vendored with \`git subtree pull --prefix=${PREFIX} ... --squash\`.`);
  process.exit(1);
}
const [squashSha, ...subject] = squash.split(' ');
const body = git('show', '-s', '--format=%B', squashSha);
const split = (/git-subtree-split: ([0-9a-f]{40})/.exec(body) || [])[1] || '(unrecorded)';

// Committed drift: the squash commit's tree is the library root, so compare it with HEAD's src/lib tree.
const committed = git('diff', '--name-status', `${squashSha}^{tree}`, `HEAD:${PREFIX}`).trim();
// Uncommitted drift: anything modified, added or removed under src/lib in the working tree or the index.
const dirty = git('status', '--porcelain', '--untracked-files=all', '--', PREFIX).trim();

if (committed || dirty) {
  console.log(`LIB-CHECK: ${PREFIX} differs from the engine it was pulled from (${split.slice(0, 7)}, ${subject.join(' ')}).`);
  if (committed) console.log(`\ncommitted since that pull:\n${committed.replace(/^/gm, '  ')}`);
  if (dirty) console.log(`\nuncommitted in the working tree:\n${dirty.replace(/^/gm, '  ')}`);
  console.log(`\nVendored code is not edited here. Make the change in game-engine, publish its split branch,\nand \`git subtree pull --prefix=${PREFIX} <game-engine> split --squash\`.`);
  process.exit(1);
}
console.log(`${PREFIX} matches engine ${split.slice(0, 7)} (${subject.join(' ')})`);
