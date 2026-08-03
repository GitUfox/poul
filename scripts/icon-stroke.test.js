/**
 * icon-stroke.test.js — run with: npm test  (node --test, zero deps)
 *
 * Guards the icon stroke system.
 *
 * The bug: stroke-width is in viewBox units, so a fixed stroke-width makes the
 * RENDERED weight scale linearly with the icon. Poul shipped 16 different
 * optical weights across 32 icons — 0.68px (a sub-pixel grey smear) up to
 * 5.24px — and the relationship was inverted: big glyphs were proportionally
 * HEAVIER than small ones, which is backwards from how icon families work.
 *
 * Like draw-bag.test.js, this extracts the real source out of poul-v1.5.html
 * rather than re-declaring a copy, so it fails if the shipped code drifts.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'poul-v1.5.html');
const html = fs.readFileSync(HTML, 'utf8');

function slice(startMarker, endMarker) {
  const s = html.indexOf(startMarker);
  assert.ok(s > -1, 'missing in poul-v1.5.html: ' + startMarker);
  const e = html.indexOf(endMarker, s);
  assert.ok(e > s, 'missing end marker after ' + startMarker);
  return html.slice(s, e);
}

const ICONS_SRC = slice('const ICONS = {', '\n};') + '\n};';
const MARKS_SRC = slice('const PACK_MARKS = {', '\n};') + '\n};';
const SYS_SRC   = slice('const ICON_STROKE_MIN', '// Mini pool ball');
const MARK_FN   = slice('function packMark(', '// ── POUL TYPE EMBLEMS ──');

const M = new Function(
  ICONS_SRC + MARKS_SRC + SYS_SRC + MARK_FN +
  '\nreturn { icon, packMark, opticalStroke, scaleGlyphStrokes, ICONS, PACK_MARKS, ICON_STROKE_MIN };'
)();

const VIEWBOX = 44;

/** Optical (on-screen) stroke width in CSS px for a rendered svg string. */
function opticalPx(svg) {
  const tag = svg.match(/<svg[^>]*>/)[0];
  const w = Number(tag.match(/[\s"']width="([0-9.]+)"/)[1]);
  const sw = Number(tag.match(/stroke-width="([0-9.]+)"/)[1]);
  return (sw * w) / VIEWBOX;
}

// Every size the app actually renders icons at.
const SIZES = [10, 11, 12, 12.8, 13, 14, 15, 17, 18, 26, 28, 34, 58, 64];

describe('icon strokes — legibility floor', () => {
  test('no icon renders a sub-pixel stroke at any shipped size', () => {
    for (const size of SIZES) {
      const px = opticalPx(M.icon('flame', size));
      assert.ok(px >= 1, `icon @${size}px renders ${px.toFixed(2)}px — sub-pixel strokes render as a grey smear`);
    }
  });

  test('no inline .pi icon in the HTML is sub-pixel either', () => {
    const tags = [...html.matchAll(/<svg[^>]*class="pi"[^>]*>/g)].map(m => m[0]);
    assert.ok(tags.length > 0, 'no inline .pi icons found — did the markup change?');
    for (const tag of tags) {
      const w = tag.match(/[\s"']width="([0-9.]+)"/);
      const sw = tag.match(/stroke-width="([0-9.]+)"/);
      const vb = tag.match(/viewBox="0 0 ([0-9.]+)/);
      if (!w || !sw || !vb) continue;
      const px = (Number(sw[1]) * Number(w[1])) / Number(vb[1]);
      assert.ok(px >= 1, `inline icon @${w[1]}px renders ${px.toFixed(2)}px`);
    }
  });
});

describe('icon strokes — one family', () => {
  test('icon() and packMark() render the same weight at the same size', () => {
    for (const size of SIZES) {
      const a = opticalPx(M.icon('flame', size));
      const b = opticalPx(M.packMark('phoenix', size));
      assert.ok(Math.abs(a - b) < 0.01,
        `@${size}px icon=${a.toFixed(2)}px but packMark=${b.toFixed(2)}px — two families, not one`);
    }
  });

  test('a string size ("12px") resolves the same as a number', () => {
    assert.strictEqual(
      M.icon('flame', 12).match(/stroke-width="([0-9.]+)"/)[1],
      M.icon('flame', '12px').match(/stroke-width="([0-9.]+)"/)[1]
    );
  });

  test('every ICONS entry renders a well-formed svg', () => {
    for (const name of Object.keys(M.ICONS)) {
      const svg = M.icon(name, 16);
      assert.match(svg, /^<svg [^>]*>[\s\S]*<\/svg>$/, name + ' produced malformed svg');
      assert.doesNotMatch(svg, /stroke-width="(NaN|Infinity|undefined)"/, name + ' produced an invalid stroke');
    }
  });

  test('every PACK_MARKS entry renders a well-formed svg', () => {
    for (const id of Object.keys(M.PACK_MARKS)) {
      const svg = M.packMark(id, 15);
      assert.match(svg, /^<svg [^>]*>[\s\S]*<\/svg>$/, id + ' produced malformed svg');
      assert.doesNotMatch(svg, /stroke-width="(NaN|Infinity|undefined)"/, id + ' produced an invalid stroke');
    }
  });
});

describe('icon strokes — the curve is sub-linear', () => {
  test('bigger icons carry more absolute weight', () => {
    for (let i = 1; i < SIZES.length; i++) {
      const prev = opticalPx(M.icon('flame', SIZES[i - 1]));
      const cur = opticalPx(M.icon('flame', SIZES[i]));
      assert.ok(cur >= prev, `weight went down from ${SIZES[i - 1]}px to ${SIZES[i]}px`);
    }
  });

  test('but proportionally LESS weight — small icons stay legible, big ones stay elegant', () => {
    // This is the relationship the app had backwards.
    for (let i = 1; i < SIZES.length; i++) {
      const prev = opticalPx(M.icon('flame', SIZES[i - 1])) / SIZES[i - 1];
      const cur = opticalPx(M.icon('flame', SIZES[i])) / SIZES[i];
      assert.ok(cur <= prev + 1e-9,
        `stroke-to-size ratio rose from ${SIZES[i - 1]}px to ${SIZES[i]}px — that is the inverted relationship again`);
    }
  });

  test('the whole range stays within a 3x spread (was 7.7x)', () => {
    const all = SIZES.map(s => opticalPx(M.icon('flame', s)));
    assert.ok(Math.max(...all) / Math.min(...all) < 3);
  });
});

describe('icon strokes — glyph hierarchy survives scaling', () => {
  test('internal stroke ratios are preserved exactly', () => {
    // istanbul de-emphasises its ground line; brussels and denver do too.
    for (const id of ['istanbul', 'brussels', 'chicago']) {
      const original = [2.6, ...[...M.PACK_MARKS[id].matchAll(/stroke-width="([0-9.]+)"/g)].map(m => Number(m[1]))];
      for (const size of [12, 28, 64]) {
        const rendered = [...M.packMark(id, size).matchAll(/stroke-width="([0-9.]+)"/g)].map(m => Number(m[1]));
        assert.strictEqual(rendered.length, original.length, id + ' lost a stroke override');
        for (let i = 0; i < original.length; i++) {
          const was = original[i] / original[0];
          const now = rendered[i] / rendered[0];
          assert.ok(Math.abs(was - now) < 0.01,
            `${id} @${size}px: override ${i} ratio drifted ${was.toFixed(2)} → ${now.toFixed(2)}`);
        }
      }
    }
  });

  test('scaleGlyphStrokes leaves a glyph without overrides untouched', () => {
    const plain = '<path d="M1 1 L2 2"/>';
    assert.strictEqual(M.scaleGlyphStrokes(plain, 3, 4.67), plain);
  });
});
