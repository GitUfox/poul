// season.js: the season vocabulary for scripts, sliced out of the app.
//
// The parser lives ONCE, in poul-v1.5.html (the SEASONAL LOGIC block). This
// module evaluates that exact source so export-cards.js and the tests gate on
// the same grammar the draw uses. A copy here would drift, and drift is the
// defect this replaces. If the block is renamed or moved, this fails loudly.
const fs   = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'poul-v1.5.html');
const START = '// SEASONAL LOGIC';
const END   = '// COLLECTOR / LIMITED CARDS';

function loadSeasonBlock() {
  const html = fs.readFileSync(HTML, 'utf8');
  const s = html.indexOf(START);
  const e = html.indexOf(END, s);
  if (s < 0 || e < 0) throw new Error('season.js: SEASONAL LOGIC block not found in poul-v1.5.html');
  const src = html.slice(s, e);
  // getSeasonInfo() is UI-only (icon names) and harmless here. console.warn is
  // the app's fallback signal, so the caller can swap it to count warnings.
  const factory = new Function('console', src + '\nreturn { parseSeason, isCardInSeason, seasonWindowEnd, seasonCache };');
  return factory(console);
}

const block = loadSeasonBlock();

// Export-time contract: trim, collapse whitespace, ASCII hyphen between month
// words becomes an en dash, blank means Year Round. Parentheticals and the
// words around them are kept as written (the parser ignores them).
function normalizeSeason(raw) {
  if (raw == null) return 'Year Round';
  let s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s) return 'Year Round';
  if (/^(year[\s-]*round|all[\s-]*year)$/i.test(s)) return 'Year Round';
  s = s.replace(/(\S)\s*[-‒—]\s*(\S)/g, '$1–$2');
  return s;
}

// True when the string is in the season grammar (no fallback, no warning).
function seasonParses(value) {
  return block.parseSeason(value).parsed;
}

module.exports = { ...block, normalizeSeason, seasonParses };
