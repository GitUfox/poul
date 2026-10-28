// duration-buckets.test.js. Run from scripts/: node --test
//
// Duration chips are ranges that match their labels. Before 2026-10-27 the
// filter kept every card up to the LARGEST selected bucket, so "Half day+"
// admitted everything and "2–4 hrs" admitted a 20-minute stroll (sweep
// defect 9). The code under test is the REAL cardPassesFilters block.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'poul-v1.5.html'), 'utf8');
const s = html.indexOf('function cardPassesFilters(card) {');
const e = html.indexOf('function getActiveDeck', s);
assert.ok(s > -1 && e > s, 'cardPassesFilters block not found');
const SRC = html.slice(s, e);

function harness(duration) {
  return new Function(`
    const state = { houseRules: { active: false } };
    function isCardInSeason() { return true; }
    let filters = { cost: [], time: [], duration: ${JSON.stringify(duration)}, company: [], adult: [] };
    ${SRC}
    return { passes: cardPassesFilters, inDurationBucket, DURATION_BUCKETS };
  `)();
}
const card = mins => ({ time: 'Any', cost: '$', durationMins: mins });

describe('duration chips are ranges', () => {
  test('each chip admits only its own range', () => {
    const h60 = harness(['60']), h120 = harness(['120']), h240 = harness(['240']), h999 = harness(['999']);
    assert.equal(h60.passes(card(45)), true);
    assert.equal(h60.passes(card(90)), false);
    assert.equal(h120.passes(card(45)), false);
    assert.equal(h120.passes(card(90)), true);
    assert.equal(h120.passes(card(150)), false);
    assert.equal(h240.passes(card(20)), false);
    assert.equal(h240.passes(card(180)), true);
    assert.equal(h240.passes(card(300)), false);
    assert.equal(h999.passes(card(180)), false);
    assert.equal(h999.passes(card(300)), true);
    assert.equal(h999.passes(card(480)), true);
  });

  test('"Half day+" alone narrows the deck instead of admitting everything', () => {
    const h = harness(['999']);
    assert.equal([20, 60, 120, 240].some(m => h.passes(card(m))), false);
  });

  test('two chips are a union', () => {
    const h = harness(['60', '120']);
    assert.equal(h.passes(card(30)), true);
    assert.equal(h.passes(card(100)), true);
    assert.equal(h.passes(card(200)), false);
  });

  test('a card with no duration passes every chip', () => {
    const h = harness(['240']);
    assert.equal(h.passes({ time: 'Any', cost: '$' }), true);
    assert.equal(h.passes({ time: 'Any', cost: '$', durationMins: null }), true);
  });

  test('the bucket table matches the chip values in the sheet', () => {
    const h = harness([]);
    const chips = [...html.matchAll(/data-group="duration" data-value="(\d+)"/g)].map(m => m[1]);
    assert.deepEqual(chips, Object.keys(h.DURATION_BUCKETS));
  });

  test('the Quick Hit vibe still means up to two hours', () => {
    const m = /quick:\s*\{[^}]*duration:\s*(\[[^\]]*\])/.exec(html);
    assert.ok(m, 'quick vibe not found');
    assert.deepEqual(new Function('return ' + m[1])(), ['60', '120']);
  });
});

describe('UI chrome copy', () => {
  test('no em dash in How to Play, House Rules, toasts or share text', () => {
    const body = html.slice(html.indexOf('<body'))
      .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments (CSS and JS)
      .replace(/<!--[\s\S]*?-->/g, '')           // HTML comments
      .replace(/\/\/[^\n]*/g, '');               // line comments
    const offenders = body.split('\n')
      .filter(l => l.includes('—'))
      .filter(l => !/>—<|'—'|"—"/.test(l))        // the empty-value placeholder
      .filter(l => !/\[–—‒-\]/.test(l));          // the dash-normalising regex
    assert.deepEqual(offenders.map(l => l.trim().slice(0, 80)), []);
  });
});
