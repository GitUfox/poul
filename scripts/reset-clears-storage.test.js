/**
 * reset-clears-storage.test.js — run with: npm test  (node --test, zero deps)
 *
 * "Wipe the table" used to remove only poul_state_v1, so poul_bags_v1,
 * poul_rules_seen and poul_install_dismissed all survived a reset the dialog
 * described as total. The fix sweeps every poul_-prefixed key.
 *
 * The trap this file exists to pin: localStorage.key(i) is a LIVE index.
 * Deleting while walking it renumbers the remaining keys and silently skips
 * every other one — the naive version of this fix passes a two-key test and
 * fails a five-key one. clearAllAppData() snapshots first; these tests prove it.
 *
 * Extracted from the real source rather than restated, so it fails if the
 * shipped implementation drifts.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'poul-v1.5.html'), 'utf8');

// Anchor on the DECLARATION, never on its value — pinning to `= []` meant
// editing the exception list broke the extraction rather than the assertion,
// which hides the real failure behind a loader crash.
const s = html.indexOf('const KEEP_ON_RESET');
assert.ok(s > -1, 'KEEP_ON_RESET not found in poul-v1.5.html');
const e = html.indexOf('function confirmReset()', s);
assert.ok(e > s, 'confirmReset not found after KEEP_ON_RESET');
const SRC = html.slice(s, e);

/** A localStorage stand-in with the same live-index semantics as the real one. */
function makeStorage(initial, opts = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) {
      if (opts.throwOnRemove) throw new Error('SecurityError');
      map.delete(k);
    },
    _keys: () => [...map.keys()],
  };
}

function load(storage) {
  return new Function('localStorage', 'console',
    SRC + '\nreturn { clearAllAppData, KEEP_ON_RESET };'
  )(storage, { warn() {} });
}

describe('reset — clears everything the app owns', () => {
  test('removes the progress keys', () => {
    const store = makeStorage({
      poul_state_v1: '{}', poul_bags_v1: '{}',
      poul_rules_seen: '1', poul_install_dismissed: '1',
    });
    const n = load(store).clearAllAppData();
    assert.strictEqual(n, 3);
    assert.deepStrictEqual(store._keys(), ['poul_rules_seen']);
  });

  test('the live-index trap: an odd number of keys is fully cleared', () => {
    // A delete-while-walking implementation skips every other key and leaves
    // roughly half behind. Five keys makes that failure unmistakable.
    const store = makeStorage({
      poul_a: '1', poul_b: '2', poul_c: '3', poul_d: '4', poul_e: '5',
    });
    const n = load(store).clearAllAppData();
    assert.strictEqual(n, 5, 'reported fewer than all keys');
    assert.deepStrictEqual(store._keys(), [], 'keys survived the sweep');
  });

  test('a future poul_ key is swept automatically', () => {
    // The whole point of a prefix sweep: the next key added does not have to
    // be remembered here. poul_bags_v1 being forgotten is what caused this bug.
    const store = makeStorage({ poul_state_v1: '{}', poul_something_added_later: 'x' });
    load(store).clearAllAppData();
    assert.deepStrictEqual(store._keys(), []);
  });
});

describe('reset — leaves everything else alone', () => {
  test('non-poul_ keys survive, including analytics identity', () => {
    // Resetting your score should not mint a new PostHog identity.
    const store = makeStorage({
      poul_state_v1: '{}',
      ph_phc_abc123_posthog: '{"distinct_id":"x"}',
      'some-other-app': 'keep me',
    });
    const n = load(store).clearAllAppData();
    assert.strictEqual(n, 1);
    assert.deepStrictEqual(store._keys().sort(), ['ph_phc_abc123_posthog', 'some-other-app']);
  });

  test('a key merely containing "poul_" is not swept', () => {
    const store = makeStorage({ 'notpoul_state': 'keep', 'x_poul_y': 'keep', poul_state_v1: '{}' });
    load(store).clearAllAppData();
    assert.deepStrictEqual(store._keys().sort(), ['notpoul_state', 'x_poul_y']);
  });

  test('the rules-seen flag survives a reset', () => {
    // A reset wipes what you EARNED, not what you have already SEEN. Being
    // taught the game again because you cleared your score is a tutorial
    // nagging you, not a fresh start.
    const store = makeStorage({ poul_state_v1: '{}', poul_rules_seen: '1' });
    load(store).clearAllAppData();
    assert.deepStrictEqual(store._keys(), ['poul_rules_seen']);
  });

  test('KEEP_ON_RESET holds exactly the seen-flags, not progress', () => {
    // If this fails, someone changed the exception list. Confirm the reset
    // dialog's wording still matches what actually gets deleted.
    assert.deepStrictEqual(load(makeStorage({})).KEEP_ON_RESET, ['poul_rules_seen']);
  });
});

describe('reset — never breaks the reset', () => {
  test('a storage that refuses to delete does not throw', () => {
    const store = makeStorage({ poul_state_v1: '{}' }, { throwOnRemove: true });
    assert.doesNotThrow(() => load(store).clearAllAppData());
  });

  test('empty storage is a no-op', () => {
    const store = makeStorage({});
    assert.strictEqual(load(store).clearAllAppData(), 0);
  });
});

describe('reset — wired into the real source', () => {
  test('confirmReset calls the sweep, not a single removeItem', () => {
    const fn = html.slice(html.indexOf('function confirmReset()'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    assert.ok(body.includes('clearAllAppData()'), 'confirmReset no longer calls clearAllAppData');
    assert.ok(!/localStorage\.removeItem\(STATE_KEY\)/.test(body),
      'confirmReset still removes only STATE_KEY');
  });
});
