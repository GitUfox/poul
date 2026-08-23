/**
 * facet-filters.test.js — run with: npm test  (node --test, zero deps)
 *
 * Pins the Phase 1 facet semantics (Company + 21+, 2026-08-07):
 *   - a facet tag means "works especially well for" — an UNTAGGED card is
 *     'any' and passes every company filter. Sparse tagging is the contract;
 *     breaking this empties every pool that hasn't been tagged yet.
 *   - 21+ is an explicit opt-in: only flagged cards qualify. It is a
 *     preference filter, never age verification.
 *   - the true 8-ball racks every category (getCategoryDeck merges decks).
 *
 * Extracts the REAL source from poul-v1.5.html — a copy would drift.
 * Anchored on declarations, never on values (the reset-test lesson).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'poul-v1.5.html'), 'utf8');

function slice(startMarker, endMarker) {
  const s = html.indexOf(startMarker);
  assert.ok(s > -1, 'missing block: ' + startMarker);
  const e = html.indexOf(endMarker, s);
  assert.ok(e > s, 'missing end for: ' + startMarker);
  return html.slice(s, e);
}

const passesSrc = slice('function cardPassesFilters(card) {', 'function getActiveDeck');
const countSrc  = slice('function countActiveFilters() {', '\n\n');
const vibesSrc  = slice('const VIBES = {', '};') + '};';
const deckSrc   = slice('function getCategoryDeck(category) {', 'function getFilteredPool');

// Build a sandboxed harness around the shipped source.
function makeHarness(filters) {
  const src = `
    "use strict";
    const state = { houseRules: { active: false } };
    function isCardInSeason() { return true; }
    let filters = ${JSON.stringify(filters)};
    ${passesSrc}
    ${countSrc}
    ${vibesSrc}
    return { passes: cardPassesFilters, count: countActiveFilters, VIBES };
  `;
  return new Function(src)();
}

const base = { cost: [], time: [], duration: [], company: [], adult: [] };

describe('company facet — sparse tagging contract', () => {
  test('untagged card passes every company filter', () => {
    const h = makeHarness({ ...base, company: ['couple'] });
    assert.equal(h.passes({ time: 'Any', cost: '$' }), true);
  });
  test('card tagged for someone else fails', () => {
    const h = makeHarness({ ...base, company: ['couple'] });
    assert.equal(h.passes({ time: 'Any', cost: '$', company: ['group'] }), false);
  });
  test('matching tag passes; multi-tag passes on any overlap', () => {
    const h = makeHarness({ ...base, company: ['couple'] });
    assert.equal(h.passes({ time: 'Any', cost: '$', company: ['couple'] }), true);
    assert.equal(h.passes({ time: 'Any', cost: '$', company: ['group', 'couple'] }), true);
  });
  test('no company filter — tagged and untagged both pass', () => {
    const h = makeHarness(base);
    assert.equal(h.passes({ time: 'Any', cost: '$', company: ['group'] }), true);
    assert.equal(h.passes({ time: 'Any', cost: '$' }), true);
  });
});

describe('21+ facet — explicit opt-in', () => {
  test('filter on: only flagged cards qualify', () => {
    const h = makeHarness({ ...base, adult: ['21'] });
    assert.equal(h.passes({ time: 'Any', cost: '$', adult: true }), true);
    assert.equal(h.passes({ time: 'Any', cost: '$' }), false);
  });
  test('filter off: flagged cards still show (preference, not a gate)', () => {
    const h = makeHarness(base);
    assert.equal(h.passes({ time: 'Any', cost: '$', adult: true }), true);
  });
  test('filterExempt (8-ball dares) bypasses every facet', () => {
    const h = makeHarness({ ...base, company: ['solo'], adult: ['21'] });
    assert.equal(h.passes({ filterExempt: true }), true);
  });
});

describe('countActiveFilters covers all five facets', () => {
  test('company and adult selections light the badge', () => {
    const h = makeHarness({ ...base, company: ['solo', 'group'], adult: ['21'] });
    assert.equal(h.count(), 3);
  });
});

describe('vibes carry the new facets', () => {
  test('Date Night = Evening + couple (the honest version)', () => {
    const h = makeHarness(base);
    assert.deepEqual(h.VIBES.date.f.time, ['Evening']);
    assert.deepEqual(h.VIBES.date.f.company, ['couple']);
  });
  test('every vibe declares the full facet shape', () => {
    const h = makeHarness(base);
    for (const v of Object.values(h.VIBES)) {
      for (const k of ['cost', 'time', 'duration', 'company', 'adult'])
        assert.ok(Array.isArray(v.f[k]), 'vibe missing facet array: ' + k);
    }
  });
});

describe('the true 8-ball', () => {
  test('getCategoryDeck merges every category for 8ball', () => {
    const src = `
      "use strict";
      const decks = { adventure: [{ id: 'a1' }], chill: [{ id: 'c1' }, { id: 'c2' }], '8ball': [{ id: 'w1' }] };
      function getActiveDeck() { return decks; }
      ${deckSrc}
      return getCategoryDeck;
    `;
    const getCategoryDeck = new Function(src)();
    assert.equal(getCategoryDeck('8ball').length, 4);
    assert.equal(getCategoryDeck('chill').length, 2);
  });
});
