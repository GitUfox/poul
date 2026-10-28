// lazy-packs.test.js. Run from scripts/: node --test
//
// Startup fetches the index, the default deck and the active pack, nothing
// more. Until 2026-10-27 loadExternalPacks() fetched all 109 packs (4.6 MB)
// before the deck was ready. The loader under test is the REAL one, sliced
// out of poul-v1.5.html and run against a counting fetch stub.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'poul-v1.5.html'), 'utf8');
const START = '// EXTERNAL PACK LOADER';
const END = '// INIT';
const s = html.indexOf(START);
const e = html.indexOf(END, s);
assert.ok(s > -1 && e > s, 'EXTERNAL PACK LOADER block not found in poul-v1.5.html');
const SRC = html.slice(s, e);

const PACKS = path.join(__dirname, '..', 'packs');
const idx = JSON.parse(fs.readFileSync(path.join(PACKS, 'index.json'), 'utf8'));

function harness({ activePack, failing = [] }) {
  const calls = [];
  const toasts = [];
  const fetch = async url => {
    calls.push(url);
    const file = url.replace('./packs/', '');
    if (failing.includes(file)) return { ok: false };
    if (file === 'index.json') return { ok: true, json: async () => idx };
    const p = path.join(PACKS, file);
    if (!fs.existsSync(p)) return { ok: false };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
  };
  // packMeta reads the block's own PACK_INDEX once the block exists (late bound).
  let indexRef = () => [];
  const env = {
    fetch,
    state: { activePack },
    CARDS: { adventure: [], foodie: [], chill: [], social: [], culture: [], '8ball': [] },
    TRAVEL_PACKS: {},
    PACK_INDEX: [],
    showToast: m => toasts.push(m),
    updateHomeUI: () => {},
    packMeta: id => indexRef().find(p => p.id === id) || {},
    document: { getElementById: () => ({ textContent: '' }) },
    console: { log() {}, warn() {} },
    setTimeout: fn => fn(),
  };
  const run = new Function(...Object.keys(env),
    SRC + '\nreturn { loadExternalPacks, fetchPack, packsLoaded: () => Object.keys(TRAVEL_PACKS), cards: () => CARDS, index: () => PACK_INDEX };');
  const api = run(...Object.values(env));
  indexRef = api.index;
  return { api, calls, toasts, env };
}

describe('startup payload', () => {
  test('default pack: index + phoenix only', async () => {
    const h = harness({ activePack: 'phoenix' });
    await h.api.loadExternalPacks();
    assert.deepEqual(h.calls, ['./packs/index.json', './packs/phoenix.json']);
    assert.ok(Object.values(h.api.cards()).flat().length > 0, 'default deck filled CARDS');
    assert.deepEqual(h.api.packsLoaded(), []);
  });

  test('travel pack: index + phoenix + that one pack, 3 fetches not 110', async () => {
    const h = harness({ activePack: 'tokyo' });
    await h.api.loadExternalPacks();
    assert.deepEqual(h.calls.sort(), ['./packs/index.json', './packs/phoenix.json', './packs/tokyo.json']);
    assert.deepEqual(h.api.packsLoaded(), ['tokyo']);
    assert.equal(h.api.index().length, idx.packs.length);
  });

  test('an unreachable active pack is said out loud and the default deck stays', async () => {
    const h = harness({ activePack: 'kyoto', failing: ['kyoto.json'] });
    await h.api.loadExternalPacks();
    assert.ok(Object.values(h.api.cards()).flat().length > 0);
    assert.deepEqual(h.api.packsLoaded(), []);
    assert.ok(h.toasts.some(t => /Couldn't load Kyoto/.test(t)), h.toasts.join(' | '));
  });

  test('fetchPack fetches a pack once and shares an in-flight load', async () => {
    const h = harness({ activePack: 'phoenix' });
    await h.api.loadExternalPacks();
    const [a, b] = await Promise.all([h.api.fetchPack('paris'), h.api.fetchPack('paris')]);
    assert.equal(a, b);
    await h.api.fetchPack('paris');
    assert.equal(h.calls.filter(u => u.endsWith('paris.json')).length, 1);
  });

  test('sw.js still precaches the index and the default deck for offline', () => {
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    assert.match(sw, /cache\.add\('\.\/packs\/index\.json'\)/);
    assert.match(sw, /cache\.add\('\.\/packs\/phoenix\.json'\)/);
  });
});
