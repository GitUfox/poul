/**
 * type-scale.test.js — run with: npm test  (node --test, zero deps)
 *
 * Guards the type scale.
 *
 * Poul had 22 ad-hoc font sizes between 10px and 72px, seven of them one-off
 * strays used once or twice (13.5, 15, 17, 19, 27, 30, 34). Nobody chose them;
 * they drifted there. The fix was a named ramp in :root and var() everywhere,
 * so the next stray is visible in review instead of invisible in a 5,000-line
 * stylesheet.
 *
 * Two deliberate decisions this file protects:
 *   - 12px is the floor (standing legibility rule). Nothing smaller ships.
 *   - 12px and 12.5px both exist ON PURPOSE. Uppercase micro-labels at 12 read
 *     optically smaller than lowercase reading text at 12.5, so they are two
 *     roles, not a duplicate. Do not "tidy" them together.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'poul-v1.5.html'), 'utf8');
const cssBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]);
const css = cssBlocks.join('\n');

/** The scale as declared in :root. */
function declaredScale() {
  const out = {};
  for (const m of css.matchAll(/--fs-([a-z0-9-]+): *([0-9.]+)px;/g)) out['--fs-' + m[1]] = parseFloat(m[2]);
  return out;
}

describe('type scale — the ramp exists', () => {
  test('at least one CSS block is present', () => {
    assert.ok(cssBlocks.length > 0, 'no <style> blocks found — did the file structure change?');
  });

  test('tokens are declared', () => {
    const scale = declaredScale();
    assert.ok(Object.keys(scale).length >= 10,
      'expected a full ramp, found ' + JSON.stringify(scale));
    for (const required of ['--fs-micro', '--fs-small', '--fs-body', '--fs-base', '--fs-lg', '--fs-2xl']) {
      assert.ok(required in scale, 'missing scale step ' + required);
    }
  });

  test('the 12 / 12.5 optical pair is intact', () => {
    const scale = declaredScale();
    assert.strictEqual(scale['--fs-micro'], 12, 'caps label size moved off 12px');
    assert.strictEqual(scale['--fs-small'], 12.5, 'small reading size moved off 12.5px');
  });

  test('nothing in the scale is below the 12px legibility floor', () => {
    for (const [name, px] of Object.entries(declaredScale())) {
      assert.ok(px >= 12, `${name} is ${px}px — below the 12px floor`);
    }
  });

  test('the ramp is strictly ascending with no duplicate steps', () => {
    const px = Object.values(declaredScale()).sort((a, b) => a - b);
    for (let i = 1; i < px.length; i++) {
      assert.notStrictEqual(px[i], px[i - 1], 'two scale steps share the value ' + px[i] + 'px');
    }
  });
});

describe('type scale — nothing bypasses it', () => {
  test('no literal px font-size survives in any CSS block', () => {
    const strays = [];
    for (const block of cssBlocks) {
      for (const m of block.matchAll(/font-size: *([0-9.]+)px/g)) strays.push(m[1] + 'px');
    }
    assert.deepStrictEqual(strays, [],
      'literal font-size values bypass the scale: ' + strays.join(', '));
  });

  test('every font-size in CSS resolves to a declared token', () => {
    const scale = declaredScale();
    const used = [...css.matchAll(/font-size: *var\((--fs-[a-z0-9-]+)\)/g)].map(m => m[1]);
    assert.ok(used.length > 50, 'expected the scale to be used broadly, saw ' + used.length + ' uses');
    for (const name of new Set(used)) {
      assert.ok(name in scale, name + ' is used but never declared in :root');
    }
  });
});
