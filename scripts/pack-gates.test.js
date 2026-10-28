// pack-gates.test.js. Run from scripts/: node --test
//
// Contract for the card gates the export runs before writing a pack. Fixtures
// first, then the real packs on disk, so a Notion fix that lands in packs/
// shows up here as a shrinking leftover list, never as a surprise.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { danglingTitleReason, packGateProblems, idSchemeWarnings } = require('./pack-gates');

const PACKS = path.join(__dirname, '..', 'packs');
const card = (id, title) => ({ id, title, description: 'x', bonus: 'y' });

describe('dangling titles', () => {
  test('a title that ends in a lowercase connector or whitespace is cut short', () => {
    assert.match(danglingTitleReason('Nordecke Night at '), /whitespace/);
    assert.match(danglingTitleReason('Nordecke Night at'), /ends in "at"/);
    assert.match(danglingTitleReason('Dinner at the'), /ends in "the"/);
    assert.match(danglingTitleReason('  Brunch'), /whitespace/);
    assert.equal(danglingTitleReason(''), 'title is empty');
    assert.equal(danglingTitleReason(null), 'title is empty');
  });

  test('a complete Title Case title passes, including one that ends in "Of"', () => {
    assert.equal(danglingTitleReason('Get Off at a Station You Have Never Heard Of'), null);
    assert.equal(danglingTitleReason('Happy Hour at Carry On'), null);
    assert.equal(danglingTitleReason('Order Finger Steaks at Westside Drive In'), null);
    assert.equal(danglingTitleReason('Bouldering at Crux in Nakameguro'), null);
    assert.equal(danglingTitleReason('Cinnamon Rolls at Zeit für Brot'), null);
  });
});

describe('packGateProblems', () => {
  test('reports a duplicate id once, naming the card it collides with', () => {
    const p = packGateProblems([card('X-1', 'First'), card('X-2', 'Second'), card('X-1', 'Third')]);
    assert.equal(p.length, 1);
    assert.equal(p[0].gate, 'duplicate-id');
    assert.equal(p[0].id, 'X-1');
    assert.equal(p[0].title, 'Third');
    assert.match(p[0].reason, /"First"/);
  });

  test('reports a dangling title', () => {
    const p = packGateProblems([card('X-1', 'Night at ')]);
    assert.equal(p.length, 1);
    assert.equal(p[0].gate, 'dangling-title');
  });

  test('a clean pack has no problems', () => {
    assert.deepEqual(packGateProblems([card('X-1', 'Climb Camelback'), card('X-2', 'Dinner at Kai')]), []);
  });
});

describe('idSchemeWarnings', () => {
  test('warns once when a pack mixes separators, silent otherwise', () => {
    assert.deepEqual(idSchemeWarnings([card('PAR-S-08', 'a'), card('PAR-A-105', 'b')]), []);
    const w = idSchemeWarnings([card('PAR-S-08', 'a'), card('PARI_F_03', 'b'), card('PARI_S_04', 'c')]);
    assert.equal(w.length, 1);
    assert.match(w[0], /"-" x1/);
    assert.match(w[0], /"_" x2/);
  });
});

describe('the real packs on disk', () => {
  // Cards the sweep found on 2026-10-17. Each one is fixed in Notion, then
  // exported. Shrink this list as they go; nothing new may join it.
  const KNOWN_LEFTOVERS = new Set(['bangkok:BKK-F-04', 'columbus:CMH-S-02']);

  test('no pack has a gate problem outside the known leftovers', () => {
    const idx = JSON.parse(fs.readFileSync(path.join(PACKS, 'index.json'), 'utf8')).packs;
    const found = [];
    for (const m of idx) {
      const pack = JSON.parse(fs.readFileSync(path.join(PACKS, `${m.id}.json`), 'utf8'));
      for (const p of packGateProblems(Object.values(pack.cards).flat())) found.push(`${m.id}:${p.id}`);
    }
    const fresh = found.filter(k => !KNOWN_LEFTOVERS.has(k));
    assert.deepEqual(fresh, [], `new gate problems: ${fresh.join(', ')}`);
  });

  test('export-cards.js runs the gates and stops the pack', () => {
    const src = fs.readFileSync(path.join(__dirname, 'export-cards.js'), 'utf8');
    assert.match(src, /require\('\.\/pack-gates'\)/);
    assert.match(src, /packGateProblems\(/);
    assert.match(src, /idSchemeWarnings\(/);
    assert.match(src, /throw new PackGateError/);
  });
});
