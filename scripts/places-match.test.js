/**
 * places-match.test.js — run with: npm test  (node --test, zero deps)
 *
 * Two groups:
 *   1. PORTED CONTRACT — mirrors Wandr's api/places-shared.test.js. If these
 *      diverge, the two apps disagree about what a real place is.
 *   2. POUL-SPECIFIC — mapsUrl parsing, locality stripping, verdicts. Built
 *      from real card data surveyed across all 29 packs.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  MATCH_THRESHOLD,
  normalizeVenueName,
  venueMatchScore,
  pickBestMatch,
  extractMapsQuery,
  cityTokens,
  stripLocality,
  addressMatchesCity,
  classify,
} = require('./places-match.js');

// ── 1. PORTED CONTRACT (keep in sync with Wandr) ─────────────────────────────

describe('normalizeVenueName', () => {
  test('lowercases, strips accents and punctuation, drops leading articles', () => {
    assert.equal(normalizeVenueName('The Café Boulud'), 'cafe boulud');
    assert.equal(normalizeVenueName('FUTURO'), 'futuro');
    assert.equal(normalizeVenueName("Tom's Thumb Trailhead"), 'tom s thumb trailhead');
    assert.equal(normalizeVenueName('A Bar Named Sue'), 'bar named sue');
  });

  test('handles junk safely', () => {
    assert.equal(normalizeVenueName(''), '');
    assert.equal(normalizeVenueName(null), '');
    assert.equal(normalizeVenueName(undefined), '');
  });

  test('handles non-Latin diacritics in live packs (Türkiye)', () => {
    assert.equal(normalizeVenueName('İstanbul'), 'istanbul');
    assert.equal(normalizeVenueName('Ürgüp'), 'urgup');
  });
});

describe('venueMatchScore — the contract cases', () => {
  test('Futuro vs Futile do NOT match (the original hallucination)', () => {
    assert.ok(venueMatchScore('Futuro', 'Futile Coffee') < MATCH_THRESHOLD);
    assert.ok(venueMatchScore('Futile Coffee', 'FUTURO') < MATCH_THRESHOLD);
  });

  test('accent/punctuation variants DO match', () => {
    assert.ok(venueMatchScore('Café Boulud', 'Cafe Boulud') >= MATCH_THRESHOLD);
  });

  test('official longer names match via containment', () => {
    assert.ok(venueMatchScore('Camelback Mountain', 'Camelback Mountain Echo Canyon Trailhead')
      >= MATCH_THRESHOLD);
  });

  test('sharing one generic word is not a match', () => {
    assert.ok(venueMatchScore('Desert Botanical Garden', 'Desert Museum') < MATCH_THRESHOLD);
  });

  test('identical names score 1', () => {
    assert.equal(venueMatchScore('Heard Museum', 'Heard Museum'), 1);
  });

  test('empty inputs score 0', () => {
    assert.equal(venueMatchScore('', 'Heard Museum'), 0);
    assert.equal(venueMatchScore('Heard Museum', ''), 0);
  });
});

describe('pickBestMatch', () => {
  const candidates = [
    { name: 'Phoenix Art Museum', placeId: 'a' },
    { name: 'Heard Museum', placeId: 'b' },
    { name: 'Musical Instrument Museum', placeId: 'c' },
  ];

  test('picks the best-scoring candidate above threshold', () => {
    assert.equal(pickBestMatch('Heard Museum', candidates)?.placeId, 'b');
  });

  test('returns null when nothing clears the threshold', () => {
    assert.equal(pickBestMatch('Futuro Coffee Roasters', candidates), null);
  });

  test('returns null for empty candidate lists', () => {
    assert.equal(pickBestMatch('Heard Museum', []), null);
    assert.equal(pickBestMatch('Heard Museum', undefined), null);
  });
});

// ── 2. POUL-SPECIFIC ─────────────────────────────────────────────────────────

describe('extractMapsQuery — both live URL shapes', () => {
  test('/maps/search/<q> — 1497 of 1789 live cards', () => {
    assert.equal(
      extractMapsQuery('https://www.google.com/maps/search/Winsor+Dim+Sum+Cafe+Chinatown+Boston'),
      'Winsor Dim Sum Cafe Chinatown Boston');
  });

  test('?q=<q> — the other 282', () => {
    assert.equal(
      extractMapsQuery('https://maps.google.com/?q=American+Visionary+Art+Museum+Baltimore'),
      'American Visionary Art Museum Baltimore');
  });

  test('?api=1&query=<q> — the shape Wandr emits, for cross-app cards', () => {
    assert.equal(
      extractMapsQuery('https://www.google.com/maps/search/?api=1&query=Heard%20Museum'),
      'Heard Museum');
  });

  test('percent-encoded accents survive', () => {
    assert.equal(extractMapsQuery('https://maps.google.com/?q=Caf%C3%A9+Boulud+NYC'),
      'Café Boulud NYC');
  });

  test('a viewport path is not a venue name', () => {
    assert.equal(extractMapsQuery('https://www.google.com/maps/@33.4,-112.0,15z'), '');
  });

  test('junk returns empty, never throws', () => {
    assert.equal(extractMapsQuery(''), '');
    assert.equal(extractMapsQuery(null), '');
    assert.equal(extractMapsQuery('not a url'), '');
    assert.equal(extractMapsQuery('https://www.google.com/maps/%E0%A4%A'), '');
  });
});

describe('cityTokens — pack city values are deliberately inconsistent', () => {
  test('drops two-letter state codes (too collision-prone to be evidence)', () => {
    assert.deepEqual(cityTokens('Baltimore, MD'), ['baltimore']);
    assert.deepEqual(cityTokens('Baltimore, Maryland'), ['baltimore', 'maryland']);
  });

  test('keeps every sub-locality from a multi-town pack', () => {
    const t = cityTokens('Thousand Islands region, NY (Clayton, Alexandria Bay, Cape Vincent)');
    assert.ok(t.includes('clayton'));
    assert.ok(t.includes('alexandria'));
    assert.ok(!t.includes('region'), 'stop word "region" should be dropped');
  });

  test('empty city yields no tokens', () => {
    assert.deepEqual(cityTokens(''), []);
  });
});

describe('stripLocality — the false-NO_MATCH fix', () => {
  test('locality tokens would otherwise sink a real venue below threshold', () => {
    const query = 'Camelback Mountain Phoenix';
    const google = 'Camelback Mountain Echo Canyon Trailhead';
    // Raw query loses: "phoenix" is dead weight in the Jaccard denominator.
    assert.ok(venueMatchScore(query, google) < MATCH_THRESHOLD);
    // Stripped query wins via containment.
    assert.ok(venueMatchScore(stripLocality(query, 'Phoenix, AZ'), google) >= MATCH_THRESHOLD);
  });

  test('never strips a query down to nothing', () => {
    assert.equal(stripLocality('Boston', 'Boston, MA'), '');
    assert.equal(stripLocality('Bricco North End Boston', 'Boston, MA'), 'bricco north end');
  });
});

describe('addressMatchesCity', () => {
  test('matches on any city token', () => {
    assert.ok(addressMatchesCity('10 Tyler St, Boston, MA 02111, USA', 'Boston, MA'));
    assert.ok(addressMatchesCity('1 Main St, Clayton, NY', 'Thousand Islands region, NY (Clayton)'));
  });

  test('flags a venue in the wrong metro', () => {
    assert.equal(addressMatchesCity('500 S Grand Ave, Los Angeles, CA', 'Boston, MA'), false);
  });

  test('no city on the card means nothing to contradict', () => {
    assert.ok(addressMatchesCity('anywhere at all', ''));
  });

  test('a metro suburb is NOT a mismatch when the query named it (real: Oleana)', () => {
    // Boston pack, card city "Boston, MA", venue actually in Cambridge.
    // Same shape as SF/Oakland, LA/Santa Monica, Phoenix/Scottsdale.
    assert.equal(
      addressMatchesCity('134 Hampshire St, Cambridge, MA 02139, USA', 'Boston, MA'),
      false, 'city alone would wrongly flag it');
    assert.ok(
      addressMatchesCity('134 Hampshire St, Cambridge, MA 02139, USA', 'Boston, MA',
        'Oleana Restaurant Inman Square Cambridge'),
      'the query declares the intended locality');
  });

  test('still flags a genuinely unrelated result', () => {
    assert.equal(
      addressMatchesCity('500 S Grand Ave, Los Angeles, CA', 'Boston, MA',
        'Bricco North End Boston'),
      false);
  });
});

describe('classify — verdicts', () => {
  const card = {
    id: 'BOS-F-201',
    title: 'Dim Sum at Winsor Dim Sum Café',
    city: 'Boston, MA',
    mapsUrl: 'https://www.google.com/maps/search/Winsor+Dim+Sum+Cafe+Chinatown+Boston',
  };
  const open = {
    name: 'Winsor Dim Sum Cafe', address: '10 Tyler St, Boston, MA 02111, USA',
    placeId: 'p1', businessStatus: 'OPERATIONAL',
  };

  test('OPERATIONAL when it exists, is open, and is in the right city', () => {
    const v = classify(card, [open]);
    assert.equal(v.verdict, 'OPERATIONAL');
    assert.equal(v.canonicalName, 'Winsor Dim Sum Cafe');
    assert.ok(v.score >= MATCH_THRESHOLD);
  });

  test('CLOSED outranks everything — the Husk / Cliff House class', () => {
    const v = classify(card, [{ ...open, businessStatus: 'CLOSED_PERMANENTLY' }]);
    assert.equal(v.verdict, 'CLOSED');
    assert.match(v.reason, /CLOSED_PERMANENTLY/);
  });

  test('CLOSED_TEMPORARILY also counts as not-open', () => {
    assert.equal(classify(card, [{ ...open, businessStatus: 'CLOSED_TEMPORARILY' }]).verdict, 'CLOSED');
  });

  test('NO_MATCH when Places finds nothing resembling it (fabrication)', () => {
    assert.equal(classify(card, []).verdict, 'NO_MATCH');
    assert.equal(classify(card, [{ name: 'Totally Different Bar', businessStatus: 'OPERATIONAL' }]).verdict,
      'NO_MATCH');
  });

  test('GEO_MISMATCH — right name, wrong metro', () => {
    const v = classify(card, [{ ...open, address: '123 Spring St, Los Angeles, CA 90012, USA' }]);
    assert.equal(v.verdict, 'GEO_MISMATCH');
  });

  test('NO_QUERY when the card has no usable Maps link (10 live cards)', () => {
    assert.equal(classify({ ...card, mapsUrl: null }, [open]).verdict, 'NO_QUERY');
  });

  test('UNVERIFIED in stub mode — never mistaken for a fabrication', () => {
    const v = classify(card, null);
    assert.equal(v.verdict, 'UNVERIFIED');
    assert.equal(v.reason, 'grounding unavailable');
  });

  test('a transient lookup failure must not read as CLOSED or NO_MATCH', () => {
    // googleTextSearch returns null on error; classify(card, null) is UNVERIFIED.
    assert.notEqual(classify(card, null).verdict, 'NO_MATCH');
  });
});
