/**
 * draw-bag.test.js — run with: npm test  (node --test, zero deps)
 *
 * Covers the shuffle-bag draw that replaced the old memoryless
 * `weighted[Math.floor(Math.random() * weighted.length)]`.
 *
 * The bug being fixed, measured on an 8-card filtered pool: the old draw
 * repeated a card inside three draws 38% of the time. True randomness feels
 * rigged, so the draw now deals from a shuffled bag instead.
 *
 * These tests extract the REAL source out of poul-v1.5.html rather than
 * re-declaring a copy — a copy would drift, and drift is the whole reason
 * this file exists. If the bag block is renamed or moved, this fails loudly.
 */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'poul-v1.5.html');
const PACKS = path.join(__dirname, '..', 'packs');

// ── Load the shipped implementation ──────────────────────────────────────────
const html = fs.readFileSync(HTML, 'utf8');
const START = "const BAGS_KEY = 'poul_bags_v1';";
const startIdx = html.indexOf(START);
const endIdx = html.indexOf('// CATEGORY COLORS');
assert.ok(startIdx > -1, 'could not find the shuffle-bag block in poul-v1.5.html');
assert.ok(endIdx > startIdx, 'could not find the end of the shuffle-bag block');
const SRC = html.slice(startIdx, html.lastIndexOf('}', endIdx) + 1);

const RARITY_WEIGHTS = { Common: 6, Rare: 3, Legendary: 1 };

// Fresh sandbox per test so localStorage never leaks between cases.
function sandbox({ throwOnWrite = false } = {}) {
  let store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => {
      if (throwOnWrite) throw new Error('QuotaExceededError');
      store[k] = String(v);
    },
  };
  const state = { activePack: 'phoenix' };
  let pool = [];
  const api = new Function(
    'RARITY_WEIGHTS', 'getFilteredPool', 'state', 'localStorage', 'console',
    SRC + '\nreturn { drawCard, fillBag, poolSignature, BAGS_MAX };'
  )(RARITY_WEIGHTS, () => pool, state, localStorage, { warn() {} });

  return {
    ...api,
    state,
    setPool: p => { pool = p; },
    bags: () => (store.poul_bags_v1 ? JSON.parse(store.poul_bags_v1) : null),
    seed: v => { store.poul_bags_v1 = v; },
    raw: () => store,
  };
}

const pack = JSON.parse(fs.readFileSync(path.join(PACKS, 'phoenix.json'), 'utf8'));
const SOCIAL = pack.cards.social;

// A real pool that actually contains Legendaries, for the rarity tests.
const LEGENDARY_POOL = (() => {
  for (const f of fs.readdirSync(PACKS)) {
    if (f === 'index.json') continue;
    const p = JSON.parse(fs.readFileSync(path.join(PACKS, f), 'utf8'));
    for (const arr of Object.values(p.cards || {})) {
      if (arr.length >= 12 && arr.some(c => c.rarity === 'Legendary')) return arr;
    }
  }
  return null;
})();

// ── 1. THE CONTRACT: a cycle never repeats ───────────────────────────────────
describe('shuffle bag — no repeats within a cycle', () => {
  test('N draws on an N-card pool are all distinct and cover the pool', () => {
    const s = sandbox();
    const pool = SOCIAL.slice(0, 8);
    s.setPool(pool);
    const drawn = Array.from({ length: 8 }, () => s.drawCard('social').id);
    assert.strictEqual(new Set(drawn).size, 8, 'a cycle repeated: ' + drawn.join(','));
    assert.deepStrictEqual(new Set(drawn), new Set(pool.map(c => c.id)));
  });

  test('the old 38%-repeat-within-3-draws bug is gone', () => {
    let repeats = 0;
    for (let i = 0; i < 2000; i++) {
      const s = sandbox();
      s.setPool(SOCIAL.slice(0, 8));
      const three = [s.drawCard('social').id, s.drawCard('social').id, s.drawCard('social').id];
      if (new Set(three).size < 3) repeats++;
    }
    assert.strictEqual(repeats, 0, repeats + ' repeats in 2000 trials');
  });

  test('no card repeats across the reshuffle boundary', () => {
    let boundary = 0;
    for (let i = 0; i < 2000; i++) {
      const s = sandbox();
      s.setPool(SOCIAL.slice(0, 5));
      const drawn = Array.from({ length: 6 }, () => s.drawCard('social').id);
      if (drawn[4] === drawn[5]) boundary++;   // 5 = one full cycle; the 6th crosses
    }
    assert.strictEqual(boundary, 0, boundary + ' boundary repeats');
  });
});

// ── 2. The bag key tracks the pool, so filters/season/packs self-invalidate ──
describe('shuffle bag — pool identity', () => {
  test('a changed pool starts a new cycle instead of reusing a stale bag', () => {
    const s = sandbox();
    s.setPool(SOCIAL.slice(0, 8));
    s.drawCard('social');
    assert.strictEqual(Object.keys(s.bags()).length, 1);
    s.setPool(SOCIAL.slice(0, 6));            // e.g. the user applied a filter
    s.drawCard('social');
    assert.strictEqual(Object.keys(s.bags()).length, 2, 'stale bag was reused');
  });

  test('the signature is order-independent', () => {
    const s = sandbox();
    const a = SOCIAL.slice(0, 6);
    assert.strictEqual(s.poolSignature(a), s.poolSignature(a.slice().reverse()));
  });

  test('different pools produce different signatures', () => {
    const s = sandbox();
    assert.notStrictEqual(s.poolSignature(SOCIAL.slice(0, 6)), s.poolSignature(SOCIAL.slice(0, 7)));
  });
});

// ── 3. Rarity survives as ORDER, not frequency ───────────────────────────────
describe('shuffle bag — rarity', () => {
  test('every card appears exactly once per cycle', () => {
    const s = sandbox();
    const bag = s.fillBag(LEGENDARY_POOL);
    assert.strictEqual(bag.length, LEGENDARY_POOL.length);
    assert.strictEqual(new Set(bag).size, LEGENDARY_POOL.length);
  });

  test('Commons surface earlier in a cycle than Legendaries', () => {
    const s = sandbox();
    const rarityOf = Object.fromEntries(LEGENDARY_POOL.map(c => [c.id, c.rarity]));
    const sum = {}, n = {};
    for (let t = 0; t < 3000; t++) {
      // fillBag returns draw-order reversed (it is consumed with pop())
      s.fillBag(LEGENDARY_POOL).slice().reverse().forEach((id, i) => {
        const r = rarityOf[id];
        sum[r] = (sum[r] || 0) + i;
        n[r] = (n[r] || 0) + 1;
      });
    }
    const mean = r => sum[r] / n[r];
    assert.ok(mean('Common') < mean('Rare'), `Common ${mean('Common')} !< Rare ${mean('Rare')}`);
    assert.ok(mean('Rare') < mean('Legendary'), `Rare ${mean('Rare')} !< Legendary ${mean('Legendary')}`);
  });
});

// ── 4. Nothing here may ever break the draw ──────────────────────────────────
describe('shuffle bag — resilience', () => {
  test('corrupt storage still returns a card', () => {
    const s = sandbox();
    s.setPool(SOCIAL.slice(0, 8));
    s.seed('this is not json');
    assert.ok(s.drawCard('social'));
  });

  test('ids left over from a removed or edited pack are ignored', () => {
    const s = sandbox();
    s.setPool(SOCIAL.slice(0, 8));
    s.seed(JSON.stringify({ 'phoenix:social:zzz': { b: ['GONE-1', 'GONE-2'], l: null, u: 1 } }));
    assert.ok(s.drawCard('social'));
  });

  test('a failing localStorage write never breaks the draw', () => {
    const s = sandbox({ throwOnWrite: true });
    s.setPool(SOCIAL.slice(0, 8));
    for (let i = 0; i < 5; i++) assert.ok(s.drawCard('social'), 'draw ' + i + ' returned nothing');
  });

  test('empty pool returns null', () => {
    const s = sandbox();
    s.setPool([]);
    assert.strictEqual(s.drawCard('social'), null);
  });

  test('a one-card pool returns that card and writes no bag', () => {
    const s = sandbox();
    s.setPool([SOCIAL[0]]);
    assert.strictEqual(s.drawCard('social').id, SOCIAL[0].id);
    assert.strictEqual(s.bags(), null, 'churned storage for a pool with nothing to shuffle');
  });

  test('stored bags stay bounded as packs and filters accumulate', () => {
    const s = sandbox();
    for (let i = 0; i < 60; i++) {
      s.setPool(SOCIAL.slice(0, 4 + (i % 10)));
      s.state.activePack = 'pack' + i;
      s.drawCard('social');
    }
    assert.ok(Object.keys(s.bags()).length <= s.BAGS_MAX,
      'bag storage grew to ' + Object.keys(s.bags()).length);
  });
});
