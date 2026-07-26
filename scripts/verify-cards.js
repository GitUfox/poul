#!/usr/bin/env node
/**
 * verify-cards.js — ground card venues against Google Places (New) Text Search.
 *
 * Part of the review workflow:
 *   generate-city.js → fetch-inactive.js → ★ verify-cards.js ★ → human review
 *   → apply-review.js → export-cards.js
 *
 * READ-ONLY. This script never writes to Notion and never activates anything.
 * It reads a card JSON file, asks Places whether each venue exists and is open,
 * and writes a triaged copy sorted worst-first so review starts where the risk is.
 *
 * ⚠️ OPERATIONAL ≠ ACTIVATABLE. A green verdict means "a place with this name
 * exists at this location and Google says it's open". It says NOTHING about
 * whether the card's claim is true — hours, season, price, legality, the
 * activity itself, and taste are all still human review. The two failure modes
 * this catches are closed venues and fabricated venues. That's it.
 *
 * Usage:
 *   node verify-cards.js <cards.json>          # a fetch-inactive.js dump
 *   node verify-cards.js --live <pack>         # packs/<pack>.json (shipped cards)
 *   node verify-cards.js --live all            # every shipped pack
 *
 * Options:
 *   --out <file>       output path (default: <input>-verified.json)
 *   --max-age <days>   reuse cached lookups newer than this (default 30)
 *   --no-cache         ignore the cache, re-query everything
 *   --limit <n>        hard cap on Places calls this run (default 1200)
 *   --quiet            summary only, no per-card lines
 *
 * Env: GOOGLE_PLACES_API_KEY in ../.env
 *   Unset → STUB MODE: parses, uses any cached results, reports what it would
 *   have cost, exits 0. Same contract as Wandr's places proxy ({available:false}).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const fs = require('fs');
const path = require('path');
const { classify, severity, VERDICTS, extractMapsQuery } = require('./places-match.js');

const PACKS_DIR = path.join(__dirname, '..', 'packs');
const CACHE_PATH = path.join(__dirname, '.places-cache.json');

const GOOGLE_URL = 'https://places.googleapis.com/v1/places:searchText';

// ⚠️ BILLING CONTRACT — Google prices Places (New) by requested fields, not by
// volume. This exact mask keeps every call in the Text Search **Pro** SKU
// (free monthly cap; re-check Google's SKU table before changing). Adding
// rating, currentOpeningHours, priceLevel, or similar silently moves EVERY
// call to the Enterprise SKU. Identical to Wandr's mask — keep them the same.
const FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus';

const CONCURRENCY = 5;      // polite; Places allows far more
const DEFAULT_LIMIT = 1200; // budget guard — see README note in the summary output
const DEFAULT_MAX_AGE = 30; // days

// ── CLI parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const o = {
    input: null, live: null, out: null, quiet: false, noCache: false,
    limit: DEFAULT_LIMIT, maxAge: DEFAULT_MAX_AGE,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--live')      o.live = argv[++i];
    else if (a === '--out')  o.out = argv[++i];
    else if (a === '--limit')    o.limit = Number(argv[++i]);
    else if (a === '--max-age')  o.maxAge = Number(argv[++i]);
    else if (a === '--no-cache') o.noCache = true;
    else if (a === '--quiet')    o.quiet = true;
    else if (!a.startsWith('--')) o.input = a;
  }
  return o;
}

// ── Card loading ─────────────────────────────────────────────────────────────

/** packs/<pack>.json stores cards grouped by category; flatten with pack tagged. */
function loadPackFile(file) {
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = [];
  for (const [category, cards] of Object.entries(p.cards || {})) {
    for (const c of cards) out.push({ pack: p.id, category, ...c });
  }
  return out;
}

function loadCards(opts) {
  if (opts.live) {
    const packs = opts.live === 'all'
      ? fs.readdirSync(PACKS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json')
      : [`${opts.live}.json`];
    const cards = [];
    for (const f of packs) {
      const full = path.join(PACKS_DIR, f);
      if (!fs.existsSync(full)) throw new Error(`No such pack: ${f.replace(/\.json$/, '')}`);
      cards.push(...loadPackFile(full));
    }
    return cards;
  }
  if (!opts.input) throw new Error('Give a cards file, or --live <pack>');
  const raw = JSON.parse(fs.readFileSync(path.resolve(opts.input), 'utf8'));
  // fetch-inactive.js emits a flat array; tolerate a pack-shaped file too.
  return Array.isArray(raw) ? raw : loadPackFile(path.resolve(opts.input));
}

// ── Cache ────────────────────────────────────────────────────────────────────
//
// Keyed by query string, storing raw candidates. Caching the CANDIDATES rather
// than the verdict means matching logic can be re-tuned and re-run for free —
// network is the scarce resource, not CPU. At Wave 3–4 scale (~4,800 cards) a
// full monthly re-scan would eat the entire free tier on its own, so this is
// load-bearing, not an optimization.

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { return {}; }
}
function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 0));
}
function cacheHit(cache, query, maxAgeDays) {
  const e = cache[query];
  if (!e) return null;
  const ageDays = (Date.now() - new Date(e.fetchedAt).getTime()) / 86400000;
  return ageDays <= maxAgeDays ? e.candidates : null;
}

// ── Google adapter (the one vendor-specific function) ────────────────────────

/**
 * Look one query up via Places (New) Text Search. Returns normalized candidates
 * — the vendor-neutral shape everything downstream consumes. Swapping vendors
 * means rewriting this function and nothing else.
 * Returns null on failure (distinct from [] = "searched, found nothing"), so a
 * transient error is never cached or mistaken for a fabricated venue.
 */
async function googleTextSearch(query, key) {
  try {
    const res = await fetch(GOOGLE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': key,
        'x-goog-fieldmask': FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, pageSize: 3 }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`  ! Places ${res.status} for "${query}" ${body.slice(0, 120)}`);
      return null;
    }
    const data = await res.json();
    return (data.places || []).map(p => ({
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      placeId: p.id || '',
      location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null,
      businessStatus: p.businessStatus || '',
    }));
  } catch (err) {
    console.error(`  ! lookup failed for "${query}": ${err.message}`);
    return null;
  }
}

/** Run tasks with a small concurrency window. */
async function pooled(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// ── Reporting ────────────────────────────────────────────────────────────────

const ICON = {
  CLOSED: '🔴', NO_MATCH: '🟠', GEO_MISMATCH: '🟡',
  NO_QUERY: '⚪', UNVERIFIED: '⚫', OPERATIONAL: '🟢',
};

function report(results, { stubMode, calls, cached, skipped, quiet }) {
  const counts = Object.fromEntries(VERDICTS.map(v => [v, 0]));
  results.forEach(r => { counts[r.verdict] = (counts[r.verdict] || 0) + 1; });

  if (!quiet) {
    const flagged = results.filter(r => severity(r.verdict) <= severity('NO_QUERY'));
    if (flagged.length) {
      console.log('\nFlagged, worst first:\n');
      for (const r of flagged) {
        console.log(`  ${ICON[r.verdict]} ${r.verdict.padEnd(12)} ${r.id || ''} ${r.title}`);
        console.log(`     ${r.verification.reason}`);
        if (r.verification.canonicalName) {
          console.log(`     Google: "${r.verification.canonicalName}" — ${r.verification.address}`);
        }
      }
    }
  }

  console.log('\n─────────────────────────────────────────────');
  for (const v of VERDICTS) {
    if (counts[v]) console.log(`  ${ICON[v]} ${v.padEnd(13)} ${String(counts[v]).padStart(5)}`);
  }
  console.log('─────────────────────────────────────────────');
  console.log(`  cards ${results.length} · Places calls ${calls} · cache hits ${cached}`);
  if (skipped) {
    console.log(`  ⚠️  ${skipped} card(s) not looked up — hit the --limit budget guard.`);
    console.log('     Re-run to continue (cached results are free), or raise --limit.');
  }
  if (stubMode) {
    console.log('\n  ⚫ STUB MODE — GOOGLE_PLACES_API_KEY not set, no lookups made.');
    console.log('     Everything above the ⚫ line is offline parsing only.');
    console.log(`     With a key, this run would cost ~${counts.UNVERIFIED} Places calls.`);
  }
  console.log('\n  Reminder: OPERATIONAL ≠ activatable. Claims, hours, season,');
  console.log('  legality and taste are still human review.\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const stubMode = !key;

  const cards = loadCards(opts);
  if (!cards.length) { console.log('No cards found.'); return; }

  const cache = opts.noCache ? {} : loadCache();
  let calls = 0, cached = 0, skipped = 0;

  console.log(`${cards.length} card(s)${stubMode ? ' · STUB MODE (no key)' : ''}`);

  // One lookup per DISTINCT query — packs repeat venues across cards.
  const queries = new Map(); // query -> candidates | null
  for (const c of cards) {
    const q = extractMapsQuery(c.mapsUrl);
    if (q && !queries.has(q)) queries.set(q, undefined);
  }

  const pending = [];
  for (const q of queries.keys()) {
    const hit = cacheHit(cache, q, opts.maxAge);
    if (hit) { queries.set(q, hit); cached++; }
    else pending.push(q);
  }

  if (!stubMode && pending.length) {
    const todo = pending.slice(0, Math.max(0, opts.limit));
    skipped = pending.length - todo.length;
    console.log(`${cached} cached · ${todo.length} to look up${skipped ? ` · ${skipped} over budget` : ''}`);

    await pooled(todo, CONCURRENCY, async (q) => {
      const candidates = await googleTextSearch(q, key);
      calls++;
      if (candidates !== null) {
        queries.set(q, candidates);
        cache[q] = { candidates, fetchedAt: new Date().toISOString() };
      }
      if (calls % 25 === 0) process.stdout.write('.');
    });
    if (calls) { saveCache(cache); console.log(''); }
  } else if (stubMode && cached) {
    console.log(`${cached} query(s) answered from cache`);
  }

  const results = cards.map(c => {
    const q = extractMapsQuery(c.mapsUrl);
    const candidates = q ? queries.get(q) : undefined;
    return { ...c, verification: classify(c, candidates === undefined ? null : candidates) };
  }).map(r => ({ ...r, verdict: r.verification.verdict }));

  results.sort((a, b) =>
    severity(a.verdict) - severity(b.verdict) ||
    String(a.id).localeCompare(String(b.id)));

  const outPath = opts.out || (opts.live
    ? path.join(process.cwd(), `${opts.live}-verified.json`)
    : path.resolve(opts.input).replace(/\.json$/, '') + '-verified.json');

  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: opts.live ? `packs/${opts.live}` : opts.input,
    stubMode,
    note: 'OPERATIONAL means the venue exists and Google says it is open. It does NOT mean the card claim is true. Verified != activatable.',
    cards: results,
  }, null, 2));

  report(results, { stubMode, calls, cached, skipped, quiet: opts.quiet });
  console.log(`  → ${outPath}\n`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
