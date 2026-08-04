/**
 * spacing-scale.test.js — run with: npm test  (node --test, zero deps)
 *
 * Guards the spacing rhythm.
 *
 * Poul had 26 padding values, 18 margins and 13 gaps — including 1, 1.5, 3, 5,
 * 7, 9, 11, 13, 15, 22, 38 and 44px. None of those were chosen; they drifted in
 * over many sessions, and that drift is most of what reads as unpolished.
 *
 * The scale is 2/4/6/8/10/12/16/20/24/32/40/48/60: 2px steps under 12 where
 * density genuinely matters, 4px through the mid range, 8px+ at the top.
 *
 * Also pins the tap-target floor. Collapsing 14px padding to 12px silently
 * dropped seven primary controls from 45px to 41px, under the 44px minimum.
 * Control height is now stated explicitly so the scale can move again safely.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'poul-v1.5.html'), 'utf8');
const cssBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]);
const css = cssBlocks.join('\n');

const SCALE = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 60];
const SPACING_PROPS = /(^|[\s;{])((?:padding|margin|gap|row-gap|column-gap)(?:-top|-bottom|-left|-right)?)\s*:\s*([^;{}]+)/g;

function declaredScale() {
  const out = {};
  for (const m of css.matchAll(/--sp-([0-9.]+): *([0-9.]+)px;/g)) out['--sp-' + m[1]] = parseFloat(m[2]);
  return out;
}

describe('spacing scale — the rhythm exists', () => {
  test('every step is declared and self-consistent', () => {
    const scale = declaredScale();
    assert.strictEqual(Object.keys(scale).length, SCALE.length,
      'expected ' + SCALE.length + ' steps, found ' + JSON.stringify(scale));
    for (const px of SCALE) {
      assert.strictEqual(scale['--sp-' + px], px, '--sp-' + px + ' should equal ' + px + 'px');
    }
  });

  test('steps are unique and ascending', () => {
    const px = Object.values(declaredScale()).sort((a, b) => a - b);
    for (let i = 1; i < px.length; i++) {
      assert.ok(px[i] > px[i - 1], 'duplicate or unordered step near ' + px[i] + 'px');
    }
  });
});

describe('spacing scale — nothing bypasses it', () => {
  test('no literal px padding/margin/gap survives in CSS', () => {
    const strays = [];
    for (const block of cssBlocks) {
      for (const m of block.matchAll(SPACING_PROPS)) {
        const [, , prop, val] = m;
        // calc()/env() values are exempt: they carry safe-area insets, which are
        // device geometry rather than design rhythm.
        if (/calc\(|env\(/.test(val)) continue;
        if (/%|r?em|vh|vw|auto|inherit|initial/.test(val)) continue;
        for (const px of val.match(/[0-9.]+px/g) || []) strays.push(prop + ': ' + px);
      }
    }
    assert.deepStrictEqual(strays, [],
      'these bypass the spacing scale: ' + strays.slice(0, 12).join(', '));
  });

  test('every spacing var used is a declared step', () => {
    const scale = declaredScale();
    const used = new Set([...css.matchAll(/var\((--sp-[0-9.]+)\)/g)].map(m => m[1]));
    assert.ok(used.size > 6, 'expected the scale to be used broadly, saw ' + used.size + ' distinct steps');
    for (const name of used) {
      assert.ok(name in scale, name + ' is used but never declared in :root');
    }
  });
});

describe('spacing scale — tap targets survive it', () => {
  // These four are the primary sheet/share actions. They cleared 44px only
  // because 14px of padding happened to add up; when the scale moved to 12px
  // they silently became 41px. The floor is now explicit.
  const GUARDED = ['.btn-clear-filters', '.btn-apply-filters', '.btn-share', '.btn-share-close'];

  test('a 44px min-height floor is declared for the primary controls', () => {
    const rule = css.match(/([^{}]*)\{\s*min-height:\s*44px;?\s*\}/);
    assert.ok(rule, 'no 44px min-height rule found — tap targets are unprotected');
    for (const sel of GUARDED) {
      assert.ok(rule[1].includes(sel), sel + ' is not covered by the 44px floor');
    }
  });
});
