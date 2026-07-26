/**
 * places-match.js — pure matching logic for card venue verification.
 * No I/O, no network, no env. Everything here is unit-tested (places-match.test.js).
 *
 * ⚠️ PORTED LOGIC — normalizeVenueName / venueMatchScore / pickBestMatch /
 * MATCH_THRESHOLD are a deliberate copy of Wandr's api/places-shared.js
 * (~/Documents/Claude/Projects/The Kraig/Claude Combinator/wandr). Kept
 * behaviourally identical so the contract cases match in both repos —
 * "Futuro" vs "Futile" must fail, "Café Boulud" vs "Cafe Boulud" must pass.
 * If you tune the matcher here, tune it there too, or the two apps will
 * disagree about what counts as a real place.
 *
 * Everything below the PORTED block is Poul-specific: Poul cards carry a
 * `mapsUrl` that already contains a locality-qualified search query, which is
 * a better Places query than the card title.
 */

// ── PORTED from Wandr api/places-shared.js — keep in sync ────────────────────

/** Similarity threshold for accepting a candidate as "the same place". */
const MATCH_THRESHOLD = 0.6;

/**
 * Normalize a venue name for comparison: lowercase, strip accents and
 * punctuation, drop a leading English article, collapse whitespace.
 * "The Café Boulud" → "cafe boulud".
 */
function normalizeVenueName(name) {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics: e-acute -> e
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

/**
 * Similarity between two venue names, 0..1. Token-set Jaccard, plus a
 * containment boost: when every token of the shorter name appears in the
 * longer, treat it as a strong match — Google often returns the fuller
 * official name ("Camelback Mountain Echo Canyon Trailhead" for "Camelback
 * Mountain"), which plain Jaccard would under-score.
 */
function venueMatchScore(a, b) {
  const ta = normalizeVenueName(a).split(' ').filter(Boolean);
  const tb = normalizeVenueName(b).split(' ').filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const sa = new Set(ta), sb = new Set(tb);
  const inter = [...sa].filter(t => sb.has(t)).length;
  const jaccard = inter / (sa.size + sb.size - inter);
  const [small, big] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  const contained = [...small].every(t => big.has(t));
  return contained ? Math.max(jaccard, 0.85) : jaccard;
}

/**
 * Pick the best-scoring candidate above MATCH_THRESHOLD, or null.
 * Candidates: [{ name, address, placeId, location, businessStatus }]
 */
function pickBestMatch(queryName, candidates) {
  let best = null, bestScore = 0;
  for (const c of candidates || []) {
    const s = venueMatchScore(queryName, c.name);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  return bestScore >= MATCH_THRESHOLD ? { ...best, score: bestScore } : null;
}

// ── Poul-specific ────────────────────────────────────────────────────────────

/** Verdicts, worst first. Sort order and console grouping both use this array. */
const VERDICTS = ['CLOSED', 'NO_MATCH', 'GEO_MISMATCH', 'NO_QUERY', 'UNVERIFIED', 'OPERATIONAL'];
const severity = (v) => {
  const i = VERDICTS.indexOf(v);
  return i === -1 ? VERDICTS.length : i;
};

/**
 * Pull the search query out of a card's mapsUrl. Poul cards use two shapes
 * (surveyed across all 29 packs): /maps/search/<q> (1497) and ?q=<q> (282).
 * Also handles ?api=1&query=<q> — the shape Wandr's grounding layer emits —
 * and /maps/place/<q>, so future cards from either app parse.
 * Returns '' when nothing usable is present.
 */
function extractMapsQuery(url) {
  if (typeof url !== 'string' || !url) return '';
  const decode = (s) => {
    try { return decodeURIComponent(s.replace(/\+/g, ' ')).trim(); }
    catch { return s.replace(/\+/g, ' ').trim(); }
  };
  let u;
  try { u = new URL(url); } catch { return ''; }

  const param = u.searchParams.get('q') || u.searchParams.get('query');
  if (param) return decode(param);

  const m = u.pathname.match(/\/maps\/(?:search|place)\/([^/]+)/);
  if (m && m[1]) {
    const q = decode(m[1]);
    // "@33.4,-112.0,15z" is a viewport, not a name.
    return q.startsWith('@') ? '' : q;
  }
  return '';
}

/**
 * Normalized tokens for a card's `city`, used for both locality stripping and
 * the address check. City values are inconsistent across packs by design
 * ("Baltimore, MD" / "Baltimore, Maryland" / "Thousand Islands region, NY
 * (Clayton, Alexandria Bay, Cape Vincent)"), so we take EVERY token and treat
 * a match on ANY of them as good enough. Two-letter state codes are dropped —
 * too collision-prone to be evidence on their own.
 */
function cityTokens(city) {
  const stop = new Set(['region', 'area', 'and', 'the', 'greater', 'metro']);
  return normalizeVenueName(city)
    .split(' ')
    .filter(t => t.length > 2 && !stop.has(t));
}

/**
 * Remove locality tokens from a query so the venue name can be compared on its
 * own. "Camelback Mountain Phoenix" + city "Phoenix, AZ" → "Camelback Mountain".
 * Without this, locality tokens drag Jaccard below threshold and real venues
 * read as fabrications. Returns '' if stripping would leave nothing.
 */
function stripLocality(query, city) {
  const drop = new Set(cityTokens(city));
  if (!drop.size) return query;
  const kept = normalizeVenueName(query).split(' ').filter(t => t && !drop.has(t));
  return kept.length ? kept.join(' ') : '';
}

/**
 * Best score for a candidate name against a card, tried against both the full
 * mapsUrl query and the locality-stripped query. Deliberately does NOT score
 * against the card title: titles are prose ("Wine Bar Night at Enoteca Bricco
 * on Hanover Street") and long token sets make the containment boost fire on
 * any generic one-word result — a false green, which is the expensive error.
 */
function scoreCard(card, candidateName, query) {
  const q = query || extractMapsQuery(card.mapsUrl);
  const targets = [q, stripLocality(q, card.city)].filter(Boolean);
  return targets.reduce((max, t) => Math.max(max, venueMatchScore(t, candidateName)), 0);
}

/**
 * Does a Places formattedAddress place the venue where the card intended?
 *
 * Accepts a match against the card's `city` OR against any token of the search
 * query itself. The second half matters more than it looks: packs are METROS,
 * not municipalities. Boston's pack legitimately contains Oleana in Cambridge,
 * SF's contains Oakland, LA's contains Santa Monica. The card's city field says
 * "Boston, MA" while the address says "Cambridge, MA" — comparing those alone
 * flags a perfectly good card. But the query said "…Inman Square Cambridge",
 * so the intended locality is right there in what we asked Google for.
 *
 * Net effect: GEO_MISMATCH only fires when the returned address matches NEITHER
 * the card's city NOR anything we searched for — i.e. Google handed back a place
 * somewhere entirely unrelated. Deliberately conservative; this is the noisiest
 * of the four checks and a false flag costs more than a missed one.
 */
function addressMatchesCity(address, city, query = '') {
  const toks = [...cityTokens(city), ...normalizeVenueName(query).split(' ').filter(t => t.length > 2)];
  if (!toks.length) return true; // nothing declared → nothing to contradict
  const addr = new Set(normalizeVenueName(address).split(' ').filter(Boolean));
  return toks.some(t => addr.has(t));
}

/**
 * Classify one card against its Places candidates.
 *
 * @param card        card object from fetch-inactive.js or packs/<pack>.json
 * @param candidates  [{name,address,placeId,location,businessStatus}] — or null
 *                    when grounding was unavailable (stub mode / cache miss)
 * @returns { verdict, reason, score, canonicalName, address, placeId, query }
 *
 * ⚠️ OPERATIONAL means "a place with this name exists here and Google says it
 * is open". It does NOT mean the card's CLAIM is true — opening hours, the
 * activity described, price, season, and legality are all still human review.
 * Verified ≠ activatable.
 */
function classify(card, candidates) {
  const query = extractMapsQuery(card.mapsUrl);
  const base = { query, score: 0, canonicalName: '', address: '', placeId: '' };

  if (!query) {
    return { ...base, verdict: 'NO_QUERY', reason: 'card has no usable Maps query' };
  }
  if (candidates == null) {
    return { ...base, verdict: 'UNVERIFIED', reason: 'grounding unavailable' };
  }

  // Re-score every candidate against the card (not just the raw query) so the
  // locality-stripped comparison is included, then take the best.
  let best = null, bestScore = 0;
  for (const c of candidates) {
    const s = scoreCard(card, c.name, query);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  if (!best || bestScore < MATCH_THRESHOLD) {
    return {
      ...base,
      verdict: 'NO_MATCH',
      reason: candidates.length
        ? `no candidate above ${MATCH_THRESHOLD} (best "${candidates[0]?.name || ''}")`
        : 'Places returned nothing',
    };
  }

  const found = {
    ...base,
    score: Number(bestScore.toFixed(2)),
    canonicalName: best.name,
    address: best.address || '',
    placeId: best.placeId || '',
  };

  if (best.businessStatus && best.businessStatus !== 'OPERATIONAL') {
    return { ...found, verdict: 'CLOSED', reason: `Google: ${best.businessStatus}` };
  }
  if (best.address && !addressMatchesCity(best.address, card.city, query)) {
    return { ...found, verdict: 'GEO_MISMATCH', reason: `address is not in ${card.city}` };
  }
  return { ...found, verdict: 'OPERATIONAL', reason: '' };
}

module.exports = {
  MATCH_THRESHOLD,
  VERDICTS,
  severity,
  normalizeVenueName,
  venueMatchScore,
  pickBestMatch,
  extractMapsQuery,
  cityTokens,
  stripLocality,
  scoreCard,
  addressMatchesCity,
  classify,
};
