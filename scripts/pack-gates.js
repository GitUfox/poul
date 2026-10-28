// pack-gates.js: card-level checks the export runs before it writes a pack.
//
// Pure functions, no Notion, no filesystem, so the tests feed them fixtures
// and the real packs alike. export-cards.js throws on a problem and skips the
// pack, the same way the season gate does. Fix the card in Notion and export
// again. These came from the 2026-10-17 functional sweep:
//   - a duplicate Card ID inside a pack: the app's shuffle bag keys cards by
//     id, so one of the two cards is never drawable (bangkok BKK-F-04).
//   - a title that ends in a lowercase connector or in whitespace: the venue
//     name was lost in Notion ("Nordecke Night at ").
//   - a pack that mixes id separators (PAR-S-08 next to PARI_F_03): not a
//     player-facing defect, so it warns instead of stopping the pack.

// Title Case keeps these lowercase inside a title, so a title that ENDS on
// one of them is cut short. A title ending in "Of" (capitalised, like
// "A Station You Have Never Heard Of") is complete and passes.
const CONNECTORS = new Set([
  'a', 'an', 'the', 'at', 'in', 'of', 'on', 'to', 'for', 'with', 'and', 'or',
  'from', 'by', 'into', 'via', 'vs', 'de', 'da', 'del', 'di', 'du', 'la', 'le', 'el',
]);

function danglingTitleReason(title) {
  const raw = title == null ? '' : String(title);
  if (!raw.trim()) return 'title is empty';
  if (raw !== raw.trim()) return 'title has leading or trailing whitespace';
  const words = raw.trim().split(/\s+/);
  const last = words[words.length - 1].replace(/[^A-Za-zÀ-ɏ]/g, '');
  if (last && last === last.toLowerCase() && CONNECTORS.has(last)) {
    return `title ends in "${last}", the venue is missing`;
  }
  return null;
}

// Returns [{ gate, id, title, reason }] for every card that must stop the pack.
function packGateProblems(cards) {
  const problems = [];
  const byId = new Map();
  for (const c of cards) {
    if (byId.has(c.id)) {
      problems.push({ gate: 'duplicate-id', id: c.id, title: c.title,
        reason: `id also used by "${byId.get(c.id).title}"` });
    } else {
      byId.set(c.id, c);
    }
  }
  for (const c of cards) {
    const reason = danglingTitleReason(c.title);
    if (reason) problems.push({ gate: 'dangling-title', id: c.id, title: c.title, reason });
  }
  return problems;
}

// Returns [] or one warning string when a pack uses more than one id separator.
function idSchemeWarnings(cards) {
  const seps = new Map();
  for (const c of cards) {
    const m = /^[A-Za-z0-9]+([-_])/.exec(String(c.id || ''));
    const sep = m ? m[1] : '?';
    seps.set(sep, (seps.get(sep) || 0) + 1);
  }
  if (seps.size <= 1) return [];
  const parts = [...seps.entries()].map(([s, n]) => `"${s}" x${n}`).join(', ');
  return [`mixed id separators in this pack (${parts}): pick one scheme in Notion`];
}

module.exports = { CONNECTORS, danglingTitleReason, packGateProblems, idSchemeWarnings };
