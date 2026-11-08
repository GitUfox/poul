/**
 * rack-balls.test.js — run with: npm test  (node --test, zero deps)
 *
 * Every category IS a pool ball (2026-11-01 redesign). CAT_BALL in the app is
 * the one source for the number. The home rack and the rules sheet carry the
 * numbers as static markup too (the no-JS fallback), so this file pins the
 * markup to the map: a category that changes ball in one place and not the
 * other fails here, not on a phone.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'poul-v1.5.html'), 'utf8');

function readMap(name) {
  const m = html.match(new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\};'));
  assert.ok(m, name + ' not found');
  const out = {};
  for (const row of m[1].matchAll(/^\s*'?([\w]+)'?:\s*([^,\n]+?)\s*(?:,|\s*\/\/|$)/gm)) out[row[1]] = row[2].trim();
  return out;
}
const CAT_BALL = readMap('CAT_BALL');
const CAT_COLORS = readMap('CAT_COLORS');
const CAT_LABELS = readMap('CAT_LABELS');

function section(startMarker, endMarker) {
  const s = html.indexOf(startMarker); assert.ok(s > -1, 'missing ' + startMarker);
  const e = html.indexOf(endMarker, s); assert.ok(e > s, 'missing ' + endMarker);
  return html.slice(s, e);
}

describe('rack balls — one map', () => {
  test('every category in CAT_LABELS has a ball number 1–8', () => {
    for (const cat of Object.keys(CAT_LABELS)) {
      const n = Number(CAT_BALL[cat]);
      assert.ok(Number.isInteger(n) && n >= 1 && n <= 8, cat + ' has no ball: ' + CAT_BALL[cat]);
    }
  });

  test('no two live categories share a ball', () => {
    const live = Object.keys(CAT_BALL).filter(c => c !== 'active');
    const nums = live.map(c => CAT_BALL[c]);
    assert.strictEqual(new Set(nums).size, nums.length, 'duplicate ball: ' + nums.join(','));
  });

  test('the legacy active category rides the Outdoors ball', () => {
    assert.strictEqual(CAT_BALL.active, CAT_BALL.adventure);
  });

  test('CAT_COLORS reads the matching --ball token (8-ball keeps ivory on dark surfaces)', () => {
    for (const [cat, n] of Object.entries(CAT_BALL)) {
      if (cat === '8ball') { assert.strictEqual(CAT_COLORS[cat], "'var(--ivory)'"); continue; }
      assert.strictEqual(CAT_COLORS[cat], `'var(--ball-${n})'`, cat);
    }
  });

  test('every --ball token used is declared in :root', () => {
    for (let n = 1; n <= 8; n++) assert.match(html, new RegExp('--ball-' + n + ': #[0-9a-f]{6};'), '--ball-' + n);
  });
});

describe('rack balls — static markup agrees with the map', () => {
  test('the home rack numbers and colours match CAT_BALL', () => {
    const home = section('<div id="screen-home"', '<!-- ── SCREEN 2');
    const tiles = [...home.matchAll(/data-category="([\w]+)" style="--cc:var\(--ball-(\d)\)"[\s\S]*?<span class="pnum">(\d)<\/span>/g)];
    assert.strictEqual(tiles.length, 6, 'expected six balls in the rack, found ' + tiles.length);
    for (const [, cat, tok, num] of tiles) {
      assert.strictEqual(tok, String(CAT_BALL[cat]), cat + ' colour token');
      assert.strictEqual(num, String(CAT_BALL[cat]), cat + ' numeral');
    }
  });

  test('the rules sheet shows the same six balls', () => {
    const rules = section('<!-- CATEGORIES -->', '<!-- RARITY -->');
    const balls = [...rules.matchAll(/--cc:var\(--ball-(\d)\)[^>]*>\s*<span class="pnum">(\d)<\/span>/g)].map(m => m[1] + m[2]);
    const want = ['adventure', 'foodie', 'chill', 'social', 'culture', '8ball'].map(c => CAT_BALL[c] + CAT_BALL[c]);
    assert.deepStrictEqual(balls, want);
  });

  test('the draw ball and the card header ball exist for paintBall to fill', () => {
    assert.match(html, /id="draw-ball"[\s\S]*?class="ball-number"/);
    assert.match(html, /id="card-ball"[^>]*>\s*<span class="pnum">/);
    assert.match(html, /function paintBall\(el, cat, numSel\)/);
  });

  test('Playfair is gone: no stylesheet rule, no SVG attribute, no canvas font names it', () => {
    const code = html.replace(/\/\*[\s\S]*?\*\//g, '');   // comments may keep the history
    assert.doesNotMatch(code, /font-family:\s*'Playfair/);
    assert.doesNotMatch(code, /font-family="\\?'Playfair/);
    assert.doesNotMatch(code, /"Playfair Display"/);
    assert.doesNotMatch(code, /fonts\.googleapis\.com[^"]*Playfair/);
  });
});
