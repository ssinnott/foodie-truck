// Find class fields that ADD runtime semantics the original JavaScript did not have.
//
// tsconfig sets target es2022, which implies useDefineForClassFields: true. A BARE field
// declaration (`x: T;` with no initialiser and no `declare`) is therefore not merely a type
// annotation: it emits a define that sets the property to undefined immediately after super(),
// BEFORE the rest of the constructor runs. In a migration that is describing code which already
// works, that is a behaviour change, and in a class hierarchy it is a silent, severe one:
//
//   class Entity  { constructor(o) { this.hp = o.hp; } }
//   class Fighter extends Entity { hp: number;  constructor(o) { super(o); /* hp is now undefined */ } }
//
// The safe form for a migration-added declaration is `declare x: T;`, which emits nothing.
//
//   node tools/class-fields.js        (repo root is inferred)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { fileURLToPath } from 'node:url';
const repo = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(repo, 'package.json'));
const ts = require('typescript');

const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

const files = walk(path.join(repo, 'src')).filter((f) => f.endsWith('.ts'));
let bare = 0, initialised = 0, declared = 0;
const hits = [];
for (const file of files) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const visit = (node) => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const cls = node.name ? node.name.text : '<anon>';
      const heritage = (node.heritageClauses || []).some((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
      for (const m of node.members) {
        if (!ts.isPropertyDeclaration(m)) continue;
        const mods = m.modifiers || [];
        if (mods.some((x) => x.kind === ts.SyntaxKind.StaticKeyword)) continue;
        if (mods.some((x) => x.kind === ts.SyntaxKind.DeclareKeyword)) { declared++; continue; }
        if (m.initializer) { initialised++; continue; }
        bare++;
        const { line } = sf.getLineAndCharacterOfPosition(m.getStart(sf));
        hits.push({ file: path.relative(repo, file), line: line + 1, cls, name: m.name.getText(sf), extends: heritage });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
console.log(`declare: ${declared}   with initialiser: ${initialised}   BARE (emit a define): ${bare}`);
const sub = hits.filter((h) => h.extends);
if (hits.length) {
  console.log(`\n${sub.length} of the ${hits.length} bare fields are in a class that EXTENDS another (highest risk):`);
  for (const h of hits.slice(0, 40)) console.log(`  ${h.extends ? 'EXTENDS ' : '        '}${h.file}:${h.line}  ${h.cls}.${h.name}`);
  if (hits.length > 40) console.log(`  ... and ${hits.length - 40} more`);
}
process.exit(bare ? 1 : 0);
