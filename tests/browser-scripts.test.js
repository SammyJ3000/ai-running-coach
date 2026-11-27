// The browser app in js/ is plain scripts that share one scope, run in the order index.html lists them.
// Each file lists what it takes from earlier files (/* global */) and what it provides (/* exported */).
// ESLint checks a file against its own lists; this checks the lists against each other and the load order.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script[^>]*\ssrc="\/(js\/[^"]+)"/g)].map((m) => m[1]);
const list = (src, kind) => [...src.matchAll(new RegExp(`^/\\* ${kind} (.*) \\*/$`, 'gm'))].flatMap((m) => m[1].split(',').map((x) => x.trim()));

test('index.html loads every file in js/', () => {
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  assert.deepStrictEqual([...order].sort(), walk('js').sort());
});

test('every name a file takes is provided by a file loaded before it', () => {
  const provided = new Map();
  for (const file of order) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const name of list(src, 'global')) assert.ok(provided.has(name), `${file} uses ${name}, which no earlier file exports`);
    for (const name of list(src, 'exported')) {
      assert.ok(!provided.has(name), `${name} is exported by both ${provided.get(name)} and ${file}`);
      const top = new RegExp(`^(const|let|function|async function)\\s+${name}\\b|^const .*[,{]\\s*${name}\\s*[,}=]`, 'm');
      assert.match(src, top, `${file} exports ${name} but does not declare it at the top level`);
      provided.set(name, file);
    }
  }
});
