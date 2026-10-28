// day-keys.test.js. Run from scripts/: node --test
//
// Contract for the once-a-day rules: the Run, the daily chalk and the delta
// chip all key on dayKey(). The code under test is the REAL block, sliced out
// of poul-v1.5.html, so a drift in the app fails here.
//
// The defect this pins (sweep 2026-10-17, defect 2): the key used to be
// toISOString(), which is UTC. In Phoenix the day flipped at 17:00, so the
// Run stalled or broke on consecutive local days.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HTML = path.join(__dirname, '..', 'poul-v1.5.html');
const html = fs.readFileSync(HTML, 'utf8');
const START = '// DAY KEYS + THE RUN';
const END = '// GAME STATE';
const s = html.indexOf(START);
const e = html.indexOf(END, s);
assert.ok(s > -1 && e > s, 'DAY KEYS block not found in poul-v1.5.html');
const SRC = html.slice(s, e);
const { dayKey, dayDiff, clampDayKey, advanceRun, RUN_MILESTONES } =
  new Function(SRC + '\nreturn { dayKey, dayDiff, clampDayKey, advanceRun, RUN_MILESTONES };')();

const local = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0);

describe('dayKey is the local calendar day', () => {
  test('an evening and a morning on the same local date share a key', () => {
    assert.equal(dayKey(local(2026, 10, 17, 18)), '2026-10-17');
    assert.equal(dayKey(local(2026, 10, 17, 6)), '2026-10-17');
    assert.equal(dayKey(local(2026, 1, 5, 23)), '2026-01-05');
  });

  test('the key is stable across time zones (child processes in Phoenix and UTC)', () => {
    for (const TZ of ['America/Phoenix', 'UTC', 'Asia/Tokyo']) {
      const out = execFileSync(process.execPath, ['-e', `
        ${SRC}
        const d = new Date(2026, 9, 17, 18, 0, 0);
        process.stdout.write(dayKey(d) + ' ' + d.toISOString().split('T')[0]);
      `], { env: { ...process.env, TZ }, encoding: 'utf8' });
      const [key, iso] = out.trim().split(' ');
      assert.equal(key, '2026-10-17', TZ);
      if (TZ === 'America/Phoenix') assert.equal(iso, '2026-10-18', 'the old UTC key was a day ahead in Phoenix');
    }
  });
});

describe('dayDiff counts whole days', () => {
  test('adjacent, same, gap, and across a DST change', () => {
    assert.equal(dayDiff('2026-10-17', '2026-10-18'), 1);
    assert.equal(dayDiff('2026-10-17', '2026-10-17'), 0);
    assert.equal(dayDiff('2026-10-17', '2026-10-20'), 3);
    assert.equal(dayDiff('2026-10-31', '2026-11-02'), 2);   // US DST ends 2026-11-01
    assert.equal(dayDiff('2026-03-07', '2026-03-09'), 2);   // US DST starts 2026-03-08
    assert.equal(dayDiff('2026-12-31', '2027-01-01'), 1);
    assert.equal(dayDiff('2026-10-18', '2026-10-17'), -1);
  });
});

describe('clampDayKey heals stored UTC keys', () => {
  test('a key one day ahead of today becomes today, a past or present key is kept', () => {
    assert.equal(clampDayKey('2026-10-18', '2026-10-17'), '2026-10-17');
    assert.equal(clampDayKey('2026-10-17', '2026-10-17'), '2026-10-17');
    assert.equal(clampDayKey('2026-10-10', '2026-10-17'), '2026-10-10');
  });
  test('null, undefined and junk pass through as null or unchanged', () => {
    assert.equal(clampDayKey(null, '2026-10-17'), null);
    assert.equal(clampDayKey(undefined, '2026-10-17'), null);
    assert.equal(clampDayKey('not-a-date', '2026-10-17'), 'not-a-date');
  });
});

describe('advanceRun judges the day exactly once', () => {
  const fresh = { streak: 0, bestStreak: 0, lastCommitDate: null };

  test('first pocket ever starts a Run of 1', () => {
    assert.deepEqual(advanceRun(fresh, '2026-10-17'),
      { streak: 1, bestStreak: 1, lastCommitDate: '2026-10-17', milestone: null });
  });

  test('a second pocket the same day holds', () => {
    const r = advanceRun({ streak: 2, bestStreak: 2, lastCommitDate: '2026-10-17' }, '2026-10-17');
    assert.equal(r.streak, 2);
    assert.equal(r.lastCommitDate, '2026-10-17');
    assert.equal(r.milestone, null);
  });

  test('the next local day grows the Run and fires the 3, 7 and 30 milestones', () => {
    assert.deepEqual(RUN_MILESTONES, [3, 7, 30]);
    const r3 = advanceRun({ streak: 2, bestStreak: 2, lastCommitDate: '2026-10-16' }, '2026-10-17');
    assert.equal(r3.streak, 3);
    assert.equal(r3.bestStreak, 3);
    assert.equal(r3.milestone, 3);
    const r4 = advanceRun({ streak: 3, bestStreak: 9, lastCommitDate: '2026-10-16' }, '2026-10-17');
    assert.equal(r4.streak, 4);
    assert.equal(r4.bestStreak, 9);
    assert.equal(r4.milestone, null);
    const r7 = advanceRun({ streak: 6, bestStreak: 6, lastCommitDate: '2026-10-16' }, '2026-10-17');
    assert.equal(r7.milestone, 7);
    const r30 = advanceRun({ streak: 29, bestStreak: 29, lastCommitDate: '2026-10-16' }, '2026-10-17');
    assert.equal(r30.milestone, 30);
  });

  test('a missed day restarts at 1 and keeps the best', () => {
    const r = advanceRun({ streak: 5, bestStreak: 5, lastCommitDate: '2026-10-14' }, '2026-10-17');
    assert.deepEqual(r, { streak: 1, bestStreak: 5, lastCommitDate: '2026-10-17', milestone: null });
  });

  test('the Phoenix evening-then-morning case that used to stall now grows', () => {
    // 18:00 on the 16th and 10:00 on the 17th are two local days.
    const k1 = dayKey(local(2026, 10, 16, 18));
    const k2 = dayKey(local(2026, 10, 17, 10));
    const r = advanceRun({ streak: 1, bestStreak: 1, lastCommitDate: k1 }, k2);
    assert.equal(r.streak, 2);
  });

  test('upgrade path: a UTC key written on an evening, clamped, then the next day grows', () => {
    // Evening pocket on local 10-16 was keyed 10-17 by the old UTC code.
    const stored = clampDayKey('2026-10-17', dayKey(local(2026, 10, 16, 18)));
    assert.equal(stored, '2026-10-16');
    const r = advanceRun({ streak: 1, bestStreak: 1, lastCommitDate: stored }, '2026-10-17');
    assert.equal(r.streak, 2);
  });

  test('never mutates its input', () => {
    const run = { streak: 2, bestStreak: 2, lastCommitDate: '2026-10-16' };
    advanceRun(run, '2026-10-17');
    assert.deepEqual(run, { streak: 2, bestStreak: 2, lastCommitDate: '2026-10-16' });
  });
});

describe('no UTC day keys remain in the app', () => {
  test("toISOString().split('T')[0] is gone from poul-v1.5.html", () => {
    assert.equal((html.match(/toISOString\(\)\.split\('T'\)\[0\]/g) || []).length, 0);
  });
});
