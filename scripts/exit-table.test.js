// exit-table.test.js. Run from scripts/: node --test
//
// The exit on the draw and card screens (design pick 1A + 2A, 2026-10-30).
// Leaving puts the drawn card back on top of its bag, so the next draw in
// that category is the same card: a retreat, never a free redraw. The code
// under test is the REAL shuffle-bag block sliced out of poul-v1.5.html.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'poul-v1.5.html'), 'utf8');
const s = html.indexOf('// UTILITY: SHUFFLE-BAG DRAW');
const e = html.indexOf('// CATEGORY COLORS', s);
assert.ok(s > -1 && e > s, 'SHUFFLE-BAG block not found');
const SRC = html.slice(s, e);

function harness(pool) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  const env = {
    localStorage,
    state: { activePack: 'tokyo' },
    RARITY_WEIGHTS: { Common: 6, Rare: 3, Legendary: 1 },
    getFilteredPool: () => pool,
    console: { warn() {} },
  };
  return new Function(...Object.keys(env), SRC + '\nreturn { drawCard, returnCardToBag, loadBags };')(...Object.values(env));
}
const mk = (id, rarity = 'Common') => ({ id, rarity });

describe('leaving the table', () => {
  test('the returned card is the next draw, then the cycle continues', () => {
    const pool = [mk('A'), mk('B'), mk('C'), mk('D', 'Rare'), mk('E')];
    const h = harness(pool);
    const first = h.drawCard('chill');
    assert.equal(h.returnCardToBag(first, 'chill'), true);
    const again = h.drawCard('chill');
    assert.equal(again.id, first.id);
    const next = h.drawCard('chill');
    assert.notEqual(next.id, first.id, 'after the real draw the cycle moves on');
  });

  test('returning twice does not stack the same id', () => {
    const pool = [mk('A'), mk('B'), mk('C')];
    const h = harness(pool);
    const first = h.drawCard('chill');
    h.returnCardToBag(first, 'chill');
    h.returnCardToBag(first, 'chill');
    const bags = h.loadBags();
    const entry = Object.values(bags)[0];
    assert.equal(entry.b.filter(id => id === first.id).length, 1);
    assert.equal(entry.b.length, 3, 'the bag holds every card exactly once');
  });

  test('a pool of one never touched the bag, so nothing goes back', () => {
    const h = harness([mk('ONLY')]);
    const only = h.drawCard('chill');
    assert.equal(h.returnCardToBag(only, 'chill'), false);
    assert.equal(h.drawCard('chill').id, 'ONLY');
  });

  test('no card or no category is a no-op', () => {
    const h = harness([mk('A'), mk('B')]);
    assert.equal(h.returnCardToBag(null, 'chill'), false);
    assert.equal(h.returnCardToBag(mk('A'), null), false);
  });
});

describe('the exit is wired on both screens', () => {
  test('draw and card screens each carry one Table exit, and leaveTable exists', () => {
    const draw = html.slice(html.indexOf('<div id="screen-draw"'), html.indexOf('<div id="screen-card"'));
    const card = html.slice(html.indexOf('<div id="screen-card"'), html.indexOf('<div id="screen-result"'));
    assert.equal((draw.match(/class="exit-link" onclick="leaveTable\(\)"/g) || []).length, 1);
    assert.equal((card.match(/class="exit-link" onclick="leaveTable\(\)"/g) || []).length, 1);
    assert.match(html, /function leaveTable\(\)/);
    assert.match(html, /returnCardToBag\(card, state\.selectedCategory\)/);
  });
});
