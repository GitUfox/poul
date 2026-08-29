/**
 * taxonomy.test.js — run with: npm test  (node --test, zero deps)
 *
 * Pins the Phase 2 category contract (2026-08-07): internals are permanent,
 * labels are UI. The live taxonomy is adventure/foodie/chill/social/culture
 * /8ball, displaying as Outdoors / Eat & Drink / Chill / Nightlife / Culture
 * / The 8-Ball. Retired 'active' lives FOREVER in old pocketed cards in
 * localStorage — the lookup tables must resolve it, never a migration.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'poul-v1.5.html'), 'utf8');

function extractObj(decl) {
  const s = html.indexOf(decl);
  assert.ok(s > -1, 'missing declaration: ' + decl);
  const e = html.indexOf('};', s);
  return new Function('return ' + html.slice(s + decl.length - 1, e + 1))();
}

const LIVE = ['adventure', 'foodie', 'chill', 'social', 'culture', '8ball'];

describe('the live taxonomy', () => {
  const labels = extractObj('const CAT_LABELS = {');
  test('all six live categories have labels', () => {
    for (const c of LIVE) assert.ok(labels[c], 'no label for ' + c);
  });
  test('labels are the Phase 2 display names', () => {
    assert.equal(labels.adventure, 'Outdoors');
    assert.equal(labels.foodie, 'Eat & Drink');
    assert.equal(labels.social, 'Nightlife');
    assert.equal(labels.culture, 'Culture');
  });
  test('every live category has a home-screen tile', () => {
    for (const c of LIVE) assert.ok(html.includes(`data-category="${c}"`), 'no tile for ' + c);
  });
});

describe('legacy tolerance — old pocketed cards resolve forever', () => {
  test("CAT_LABELS['active'] still reads as Outdoors", () => {
    const labels = extractObj('const CAT_LABELS = {');
    assert.equal(labels.active, 'Outdoors');
  });
  test("CAT_COLORS['active'] resolves to the adventure hue", () => {
    const colors = extractObj('const CAT_COLORS = {');
    assert.equal(colors.active, 'var(--adventure)');
    assert.ok(colors.culture, 'culture missing from CAT_COLORS');
  });
});

describe('the pipeline agrees with the app', () => {
  test('generator produces only live categories', () => {
    const gen = fs.readFileSync(path.join(__dirname, 'generate-city.js'), 'utf8');
    const m = gen.match(/const CATEGORIES = \[([^\]]+)\]/);
    const cats = m[1].split(',').map(s => s.trim().replace(/'/g, ''));
    for (const c of cats) assert.ok(LIVE.includes(c), 'generator emits retired category: ' + c);
    assert.ok(!cats.includes('active'), 'generator still emits active');
  });
  test('export KNOWN set matches the live taxonomy', () => {
    const exp = fs.readFileSync(path.join(__dirname, 'export-cards.js'), 'utf8');
    const m = exp.match(/const KNOWN = new Set\(\[([^\]]+)\]\)/);
    assert.ok(m, 'export shrink-warning KNOWN set missing');
    const cats = m[1].split(',').map(s => s.trim().replace(/'/g, ''));
    assert.deepEqual(cats.sort(), [...LIVE].sort());
  });
});
