// pack-geo.test.js. Run from scripts/: node --test
//
// Every pack in the index has a region and coordinates, and the files on
// disk carry them, so the selector never drops a pack into "More" and Nearby
// can reach every city. Same shape as the flag-mapping test.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REGION_ORDER, PACK_GEO, geoFor } = require('./pack-geo');

const PACKS = path.join(__dirname, '..', 'packs');
const idx = JSON.parse(fs.readFileSync(path.join(PACKS, 'index.json'), 'utf8')).packs;

describe('pack-geo covers the live index', () => {
  test('every pack in the index has an entry', () => {
    const missing = idx.map(p => p.id).filter(id => !PACK_GEO[id]);
    assert.deepEqual(missing, [], `add to pack-geo.js: ${missing.join(', ')}`);
  });

  test('every entry names a region in REGION_ORDER and a real coordinate', () => {
    for (const [id, g] of Object.entries(PACK_GEO)) {
      assert.ok(REGION_ORDER.includes(g.region), `${id}: region "${g.region}" not in REGION_ORDER`);
      assert.notEqual(g.region, 'More', `${id}: "More" is the fallback, not a region`);
      const [lat, lng] = g.coords;
      assert.ok(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180, `${id}: coords out of range`);
      assert.ok(Math.abs(lat) + Math.abs(lng) > 0, `${id}: coords are 0,0`);
    }
  });

  test('no entry is for a pack that left the index', () => {
    const live = new Set(idx.map(p => p.id));
    const stale = Object.keys(PACK_GEO).filter(id => !live.has(id));
    assert.deepEqual(stale, [], `remove from pack-geo.js: ${stale.join(', ')}`);
  });

  test('geoFor is empty for an unknown pack', () => {
    assert.deepEqual(geoFor('atlantis'), {});
    assert.deepEqual(geoFor('phoenix'), { region: 'Arizona', coords: [33.45, -112.07] });
  });
});

describe('the files on disk carry the geo fields', () => {
  test('index.json has region and coords on every pack', () => {
    for (const p of idx) {
      assert.equal(p.region, PACK_GEO[p.id].region, `${p.id}: index region`);
      assert.deepEqual(p.coords, PACK_GEO[p.id].coords, `${p.id}: index coords`);
    }
  });

  test('every pack file has the same region and coords', () => {
    for (const p of idx) {
      const pack = JSON.parse(fs.readFileSync(path.join(PACKS, `${p.id}.json`), 'utf8'));
      assert.equal(pack.region, PACK_GEO[p.id].region, `${p.id}: pack region`);
      assert.deepEqual(pack.coords, PACK_GEO[p.id].coords, `${p.id}: pack coords`);
    }
  });

  test('export-cards.js merges geo into pack meta and the index', () => {
    const src = fs.readFileSync(path.join(__dirname, 'export-cards.js'), 'utf8');
    assert.match(src, /require\('\.\/pack-geo'\)/);
    assert.ok((src.match(/geoFor\(/g) || []).length >= 3, 'geoFor used in exportPack, patchIndexCount and exportIndex');
  });
});

describe('the app reads geo from the packs, not from a map of its own', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'poul-v1.5.html'), 'utf8');
  test('PACK_REGIONS and PACK_COORDS are gone', () => {
    assert.equal(html.includes('const PACK_REGIONS'), false);
    assert.equal(html.includes('const PACK_COORDS'), false);
  });
  test('REGION_ORDER in the app matches pack-geo.js', () => {
    const m = /const REGION_ORDER = (\[[^\]]*\]);/.exec(html);
    assert.ok(m, 'REGION_ORDER not found in poul-v1.5.html');
    assert.deepEqual(new Function('return ' + m[1])(), REGION_ORDER);
  });
});
