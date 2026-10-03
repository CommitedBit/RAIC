import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export function verifyBracesDepth(packageRoot) {
  const braces = require(path.join(packageRoot, 'index.js'));
  const guarded = (run) =>
    assert.throws(run, {
      name: 'RangeError',
      message: 'braces nesting depth exceeds 100',
    });
  const nestedAst = (depth) => {
    let node = { type: 'text', value: 'x' };
    for (let i = 0; i < depth; i++) node = { type: 'root', nodes: [node] };
    return { type: 'root', nodes: [node] };
  };

  for (const method of ['parse', 'compile', 'expand', 'stringify']) {
    for (const [left, right] of [
      ['{', '}'],
      ['(', ')'],
      ['({', '})'],
    ]) {
      for (const depth of [101, 4000]) {
        // Mixed groups stay below the existing 10,000-character input limit.
        const count = left.length === 2 ? Math.ceil(depth / 2) : depth;
        const pattern = left.repeat(count) + 'x' + right.repeat(count);
        guarded(() => braces[method](pattern));
      }
      guarded(() => braces[method](left.repeat(101)));
    }
    for (const maxDepth of [Infinity, NaN, 10000, false, -1]) {
      guarded(() => braces[method]('{'.repeat(101) + 'x' + '}'.repeat(101), { maxDepth }));
    }
    assert.doesNotThrow(() => braces[method]('('.repeat(100) + 'x' + ')'.repeat(100)));
    assert.doesNotThrow(() => braces[method]('{'.repeat(100) + 'x' + '}'.repeat(100)));
  }
  for (const method of ['compile', 'expand', 'stringify']) {
    guarded(() => braces[method](nestedAst(20000)));
    guarded(() => require(path.join(packageRoot, 'lib', method + '.js'))(nestedAst(20000)));
    assert.doesNotThrow(() => braces[method](nestedAst(100)));
    const cycle = { type: 'root', nodes: [] };
    cycle.nodes.push(cycle);
    guarded(() => braces[method](cycle));
  }
  guarded(() => require(path.join(packageRoot, 'lib/parse.js'))('('.repeat(101)));
  guarded(() => braces(['{a,b}', '('.repeat(101)]));
  guarded(() => braces.create('('.repeat(101), { expand: true }));

  const parentCycle = { type: 'paren', nodes: [] };
  parentCycle.parent = parentCycle;
  guarded(() => braces.expand({ type: 'root', nodes: [parentCycle] }));
  const invalid = nestedAst(20000);
  invalid.invalid = true;
  guarded(() => braces.expand({ type: 'root', nodes: [invalid] }));
  let nestedValue = 'x';
  for (let i = 0; i < 1000; i++) nestedValue = [nestedValue];
  guarded(() => braces.expand({ type: 'root', nodes: [{ type: 'text', value: nestedValue }] }));

  assert.deepEqual(braces.expand('lesson-{01..03}/{intro,quiz}'), [
    'lesson-01/intro',
    'lesson-01/quiz',
    'lesson-02/intro',
    'lesson-02/quiz',
    'lesson-03/intro',
    'lesson-03/quiz',
  ]);
  assert.deepEqual(braces.expand('{a,{b,c}}'), ['a', 'b', 'c']);
  assert.deepEqual(braces.expand('{a,a,,b}', { nodupes: true, noempty: true }), ['a', 'b']);
  assert.equal(braces.compile('a/{b,c}/d'), 'a/(b|c)/d');
  assert.equal(braces.stringify('a/{b,c}/d'), 'a/{b,c}/d');
  assert.deepEqual(braces.expand('"'.concat('{'.repeat(101), '"')), ['{'.repeat(101)]);
  assert.deepEqual(braces.expand('\\{a,b\\}'), ['{a,b}']);
  assert.throws(() => braces.expand('{1..1001}'), /range limit/);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  verifyBracesDepth(path.resolve(process.argv[2]));
  console.log('braces depth, alternate-input, and legitimate-control probes passed');
}
