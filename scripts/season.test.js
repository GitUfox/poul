// season.test.js. Run from scripts/: node --test
//
// Contract for the season vocabulary. The parser under test is the REAL one,
// sliced out of poul-v1.5.html by season.js, so the draw gate, the collector
// badge and the export gate are all covered by the same cases.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseSeason, isCardInSeason, seasonWindowEnd, normalizeSeason, seasonParses, seasonCache } = require('./season');

const PACKS = path.join(__dirname, '..', 'packs');
const M = 'JFMAMJJASOND';
const shape = s => parseSeason(s).months.map((b, i) => (b ? M[i] : '.')).join('');
const at = (month, day = 15) => new Date(2026, month, day, 12, 0, 0);

describe('season parser grammar', () => {
  test('Year Round, blank and null are every month', () => {
    for (const s of ['Year Round', 'year round', 'All Year', '', '   ', null, undefined]) {
      const r = parseSeason(s);
      assert.equal(r.allYear, true, JSON.stringify(s));
      assert.equal(r.parsed, true, JSON.stringify(s));
      assert.equal(shape(s), M);
    }
  });

  test('a single month, in any spelling, with Late/Early/only and day numbers', () => {
    assert.equal(shape('Dec'), '...........D');
    assert.equal(shape('April'), '...A........');
    assert.equal(shape('Sept'), '........S...');
    assert.equal(shape('Jun'), '.....J......');
    assert.equal(shape('Early Nov'), '..........N.');
    assert.equal(shape('Jan only'), 'J...........');
    assert.equal(shape('Jun 23-24'), '.....J......');
    assert.equal(parseSeason('Dec').label, 'December');
  });

  test('a month range with an en dash or an ASCII hyphen', () => {
    assert.equal(shape('Apr–Oct'), '...AMJJASO..');
    assert.equal(shape('Apr-Oct'), '...AMJJASO..');
    assert.equal(shape('May-Sep'), '....MJJAS...');
    assert.equal(shape('Jun–Jul'), '.....JJ.....');
    assert.equal(shape('Feb–Mar'), '.FM.........');
  });

  test('wrap-around ranges cross the year end', () => {
    assert.equal(shape('Oct–Apr'), 'JFMA.....OND');
    assert.equal(shape('Oct–May'), 'JFMAM....OND');
    assert.equal(shape('Dec-Feb'), 'JF.........D');
    assert.equal(shape('Nov–Mar'), 'JFM.......ND');
    assert.equal(shape('Sep–early Jun'), 'JFMAMJ..SOND');
    assert.equal(shape('Late Aug–Early Sep'), '.......AS...');
  });

  test('named seasons map to three months each', () => {
    assert.equal(shape('Summer'), '.....JJA....');
    assert.equal(shape('Spring'), '..MAM.......');
    assert.equal(shape('Fall'), '........SON.');
    assert.equal(shape('Autumn'), '........SON.');
    assert.equal(shape('Winter'), 'JF.........D');
  });

  test('comma and ampersand lists are a union', () => {
    assert.equal(shape('Apr–May & Oct–Nov'), '...AM....ON.');
    assert.equal(shape('Apr–Sep, Oct (Halloween), Nov–Jan (Christmas)'), 'J..AMJJASOND');
    assert.equal(parseSeason('Apr–Sep, Oct (Halloween), Nov–Jan (Christmas)').label, 'Apr–Sep, Oct, Nov–Jan');
  });

  test('a Year Round prefix wins over the parenthetical', () => {
    for (const s of ['Year Round (rooftop May–Oct)', 'Year Round (weather dependent)', 'Year Round (semla Jan–Apr)']) {
      assert.equal(parseSeason(s).allYear, true, s);
      assert.equal(parseSeason(s).parsed, true, s);
    }
  });

  test('parentheticals after a range are commentary', () => {
    assert.equal(shape('Feb–Dec (league season)'), '.FMAMJJASOND');
    assert.equal(shape('Sep–Dec (Argentine Open Nov–Dec)'), '........SOND');
    assert.equal(parseSeason('Feb–Dec (league season)').label, 'Feb–Dec');
  });

  test('a span that covers the whole year is allYear', () => {
    assert.equal(parseSeason('Jan–Dec').allYear, true);
    assert.equal(parseSeason('Jan–Dec').parsed, true);
  });

  test('an unparsable string falls back to every month and warns exactly once', () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    try {
      seasonCache.delete('Limited dates');
      const r1 = parseSeason('Limited dates');
      const r2 = parseSeason('Limited dates');
      assert.equal(r1.allYear, true);
      assert.equal(r1.parsed, false);
      assert.equal(r2, r1);
      assert.equal(warns.length, 1);
      assert.match(warns[0], /Limited dates/);
      assert.equal(seasonParses('Limited dates'), false);
      assert.equal(seasonParses('Mayo–Junk'), false);
      assert.equal(seasonParses('Apr–Oct'), true);
    } finally {
      console.warn = orig;
    }
  });
});

describe('season gate and collector window', () => {
  test('isCardInSeason reads the parsed months, not an 8-string table', () => {
    assert.equal(isCardInSeason({ season: 'Dec' }, at(9)), false);   // Kabuki in October: out
    assert.equal(isCardInSeason({ season: 'Dec' }, at(11)), true);
    assert.equal(isCardInSeason({ season: 'Summer' }, at(6)), true);
    assert.equal(isCardInSeason({ season: 'Summer' }, at(0)), false);
    assert.equal(isCardInSeason({ season: 'Dec–Mar' }, at(6)), false); // ski card in July: out
    assert.equal(isCardInSeason({ season: 'May-Sep' }, at(5)), true);
    assert.equal(isCardInSeason({ season: null }, at(3)), true);
    assert.equal(isCardInSeason({ season: 'Limited dates' }, at(3)), true);
  });

  test('seasonWindowEnd is the last day of the active run, across the year end', () => {
    const e1 = seasonWindowEnd('Apr–Oct', at(9, 20));
    assert.equal(e1.getMonth(), 9); assert.equal(e1.getDate(), 31); assert.equal(e1.getFullYear(), 2026);
    const e2 = seasonWindowEnd('Oct–Apr', at(11, 1));
    assert.equal(e2.getMonth(), 3); assert.equal(e2.getDate(), 30); assert.equal(e2.getFullYear(), 2027);
    const e3 = seasonWindowEnd('Apr–May & Oct–Nov', at(3, 1));
    assert.equal(e3.getMonth(), 4); assert.equal(e3.getDate(), 31);
    assert.equal(seasonWindowEnd('Dec', at(9)), null);
    assert.equal(seasonWindowEnd('Year Round', at(9)), null);
    assert.equal(seasonWindowEnd('Feb', at(1, 1)).getDate(), 28);
  });
});

describe('export-side season contract', () => {
  test('normalizeSeason trims, en-dashes and defaults blank to Year Round', () => {
    assert.equal(normalizeSeason('  Apr - Oct '), 'Apr–Oct');
    assert.equal(normalizeSeason('May-Sep'), 'May–Sep');
    assert.equal(normalizeSeason('Jun 23-24'), 'Jun 23–24');
    assert.equal(normalizeSeason(''), 'Year Round');
    assert.equal(normalizeSeason(null), 'Year Round');
    assert.equal(normalizeSeason('year round'), 'Year Round');
    assert.equal(normalizeSeason('Year Round (rooftop May–Oct)'), 'Year Round (rooftop May–Oct)');
    assert.equal(normalizeSeason('Summer'), 'Summer');
  });

  test('export-cards.js normalises season and gates on the parser', () => {
    const src = fs.readFileSync(path.join(__dirname, 'export-cards.js'), 'utf8');
    assert.match(src, /season:\s*normalizeSeason\(prop\(page, 'Season', 'text'\)\)/);
    assert.match(src, /filter\(c => !seasonParses\(c\.season\)\)/);
    assert.match(src, /throw new SeasonGateError/);
  });
});

describe('every season string shipped in packs/', () => {
  // Every shipped season string parses. The last leftover, Portland PDX-S-10
  // "Limited dates", was fixed in Notion on 2026-10-17. If a new one appears,
  // fix the Season cell in Notion and re-export; do not add it here.
  const KNOWN_UNPARSED = new Set();

  test('parses, except the documented Notion leftovers', () => {
    const idx = JSON.parse(fs.readFileSync(path.join(PACKS, 'index.json'), 'utf8')).packs;
    const seen = new Map();
    for (const p of idx) {
      const pack = JSON.parse(fs.readFileSync(path.join(PACKS, p.id + '.json'), 'utf8'));
      for (const c of Object.values(pack.cards).flat()) {
        if (c.season == null) continue;
        if (!seen.has(c.season)) seen.set(c.season, c.id);
      }
    }
    assert.ok(seen.size > 100, 'expected the full season vocabulary, saw ' + seen.size);
    const orig = console.warn;
    console.warn = () => {};
    let unparsed;
    try {
      unparsed = [...seen.keys()].filter(s => !seasonParses(s));
    } finally {
      console.warn = orig;
    }
    assert.deepEqual(unparsed.sort(), [...KNOWN_UNPARSED].sort(),
      'season strings outside the grammar: ' + unparsed.map(s => JSON.stringify(s) + ' (' + seen.get(s) + ')').join(', '));
  });
});

test('isCardInSeason ignores a non-Date second argument (Array.filter passes the index)', () => {
  const seasonal = [{ season: 'Year Round' }, { season: 'Dec' }, { season: 'Jan–Dec' }];
  assert.doesNotThrow(() => seasonal.filter(isCardInSeason));
  assert.equal(seasonal.filter(isCardInSeason).length >= 2, true);
  assert.doesNotThrow(() => seasonWindowEnd('Apr–Oct', 3));
});
