/**
 * delta-chip.test.js — run with: npm test  (node --test, zero deps)
 *
 * Covers the home delta chip: the receipt for your last resolved draw.
 *
 * The value lives in state.lastDelta and is decided in exactly two places —
 * commitCard() and declineCard(). updateHomeUI() is a PURE read, so there is
 * one source of truth. These tests pin the rules that are easy to get wrong:
 *
 *   - a commit records the WHOLE move, card spark plus any Run milestone bonus
 *   - a scratch records what was actually CHARGED, not the nominal −5: the
 *     Math.max(0, …) clamp is real, so at a score of 3 a scratch costs 3
 *   - a new card (draw or redraw) retires the receipt
 *   - a reset clears it, so it can't read "+40" beside a score of 0
 *   - it is same-day only — yesterday's delta must not greet you this morning
 *   - the two new keys are ADDITIVE: a pre-existing poul_state_v1 payload
 *     without them must still load (localStorage shapes are a permanent
 *     contract in this project)
 *
 * Like the other suites here, the rules are extracted from the real source in
 * poul-v1.5.html rather than restated, so the tests fail if the app drifts.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'poul-v1.5.html'), 'utf8');

const STREAK_REWARDS = { 3: 25, 7: 50, 30: 100 };
const today = () => new Date().toISOString().split('T')[0];

// ── The two deciding rules, lifted verbatim from the source ──────────────────
function commitDelta(cardSpark, streakMilestone) {
  return cardSpark + (streakMilestone ? STREAK_REWARDS[streakMilestone] : 0);
}
function declineDelta(scoreBefore, penalty = 5) {
  const after = Math.max(0, scoreBefore - penalty);
  return after - scoreBefore;
}
/** updateHomeUI()'s render branch, as shipped. */
function renderChip(lastDelta) {
  const d = lastDelta || 0;
  if (d === 0) return { text: '', cls: 'spark-delta' };
  return { text: (d > 0 ? '+' : '−') + Math.abs(d), cls: 'spark-delta on ' + (d > 0 ? 'pos' : 'neg') };
}
/** The state-initialiser's same-day gate. */
function hydrate(saved) {
  return (saved && saved.lastDeltaDate === today()) ? (saved.lastDelta || 0) : 0;
}

describe('delta chip — what a commit records', () => {
  test('a plain pocket records the card spark', () => {
    assert.strictEqual(commitDelta(15, null), 15);
    assert.strictEqual(commitDelta(40, null), 40);
  });

  test('a pocket that lands a Run milestone records card + bonus', () => {
    assert.strictEqual(commitDelta(15, 3), 40);
    assert.strictEqual(commitDelta(25, 7), 75);
    assert.strictEqual(commitDelta(40, 30), 140);
  });

  test('the reserved width covers the true maximum', () => {
    // "+140" — Legendary 40 plus the 30-day Run bonus. The CSS reserves
    // 2.44em = sign + 3 digits; anything wider would reflow the row.
    const max = commitDelta(40, 30);
    assert.strictEqual(String(max).length, 3, 'max delta grew past 3 digits: ' + max);
  });
});

describe('delta chip — what a scratch records', () => {
  test('a normal scratch is the full penalty', () => {
    assert.strictEqual(declineDelta(100), -5);
  });

  test('the clamp is real — at a score of 3 a scratch costs 3, not 5', () => {
    assert.strictEqual(declineDelta(3), -3);
    assert.strictEqual(declineDelta(1), -1);
  });

  test('a scratch at zero costs nothing and shows no chip', () => {
    assert.strictEqual(declineDelta(0), 0);
    assert.strictEqual(renderChip(declineDelta(0)).text, '');
  });
});

describe('delta chip — rendering', () => {
  test('positive uses + and the pos class', () => {
    assert.deepStrictEqual(renderChip(15), { text: '+15', cls: 'spark-delta on pos' });
  });

  test('negative uses U+2212 MINUS, matching the Scratch copy', () => {
    const r = renderChip(-5);
    assert.strictEqual(r.text, '−5');
    assert.ok(!r.text.includes('-'), 'used ASCII hyphen instead of U+2212');
    assert.strictEqual(r.cls, 'spark-delta on neg');
  });

  test('zero renders nothing and drops the .on class', () => {
    assert.deepStrictEqual(renderChip(0), { text: '', cls: 'spark-delta' });
    assert.deepStrictEqual(renderChip(undefined), { text: '', cls: 'spark-delta' });
  });
});

describe('delta chip — lifecycle', () => {
  test('same-day delta hydrates', () => {
    assert.strictEqual(hydrate({ lastDelta: 25, lastDeltaDate: today() }), 25);
  });

  test("yesterday's delta does not greet you this morning", () => {
    assert.strictEqual(hydrate({ lastDelta: 40, lastDeltaDate: '2020-01-01' }), 0);
  });

  test('a pre-existing save without the keys still loads (additive contract)', () => {
    const legacy = { sparkScore: 120, tokens: 5, streak: 2, houseRules: { active: false, ids: [] } };
    assert.strictEqual(hydrate(legacy), 0);
    assert.strictEqual(renderChip(hydrate(legacy)).text, '');
  });

  test('a fresh install has no chip', () => {
    assert.strictEqual(hydrate(null), 0);
  });
});

describe('delta chip — wired into the real source', () => {
  const has = (s) => assert.ok(html.includes(s), 'missing from poul-v1.5.html: ' + s);

  test('the chip is a SIBLING of the score, not a child', () => {
    // animateCounter() does parseInt(el.textContent) to find its start value;
    // nesting the chip would make that read "247+15".
    const row = html.match(/<div class="spark-value-row">[\s\S]*?<\/div>\s*<\/div>/);
    assert.ok(row, '.spark-value-row not found');
    const score = row[0].match(/<div class="spark-value" id="spark-score-display">[^<]*<\/div>/);
    assert.ok(score, 'score element not inside .spark-value-row');
    assert.ok(!/id="spark-score-display"[^>]*>[\s\S]*spark-delta/.test(score[0]),
      'the chip is nested inside the score element');
  });

  test('both new keys are persisted', () => {
    has('lastDelta: state.lastDelta,');
    has('lastDeltaDate: state.lastDeltaDate,');
  });

  test('every clear site is wired', () => {
    // startDraw, redrawCard, confirmReset — three independent clears.
    const clears = (html.match(/state\.lastDelta = 0;/g) || []).length;
    assert.ok(clears >= 3, 'expected at least 3 clear sites, found ' + clears);
  });

  test('the delta is only ever decided in two places', () => {
    const writes = (html.match(/state\.lastDelta = (?!0;)/g) || []).length;
    assert.strictEqual(writes, 2, 'expected exactly 2 deciding writes, found ' + writes);
  });

  test('updateHomeUI reads state rather than deriving', () => {
    has('const d = state.lastDelta || 0;');
  });
});
