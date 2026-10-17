#!/usr/bin/env node
/**
 * fix-card-style.js
 * One-time text-style cleanup across the whole Card Database:
 *   1. Title  → Title Case (deck standard). Proper nouns, non-Latin text,
 *      stylized brands (d.o.g.s, iPhone) and small words mid-title stay as
 *      they are. Letters with diacritics are only ever uppercased (ç → Ç),
 *      never stripped. A " — " inside a title becomes ": " (61 titles already
 *      use a colon as the subtitle separator).
 *   2. Description / Bonus → no em dashes. A spaced em dash becomes
 *        ". "  when both sides are clauses (the next word is capitalised),
 *        ": "  when the right side is a list fragment (two or more commas),
 *        ", "  otherwise.
 *      A pair of dashes around an aside becomes two commas, or parentheses
 *      when the aside is itself a comma list.
 *      Spaced en dashes, hyphens and numeric ranges (2–3 hrs) are untouched.
 *
 * Background: the daily city-expansion routine writes clean cards since the
 * style rule landed on the Notion queue page (2026-10-16). This script is the
 * backlog pass (about 2,200 cards with em dashes, about 400 sentence-case
 * titles, mostly in rome / istanbul / oslo / brussels / bangkok / tokyo / paris).
 *
 * Only Title, Description, Bonus and Comments are written. Active, Pack,
 * Category, Spark and every other field are never touched. Each changed card
 * gets a Comments suffix " · style-fix YYYY-MM-DD" so a later run can see it.
 * Re-running is safe: a card with nothing left to change is skipped.
 *
 * Usage (from scripts/):
 *   node fix-card-style.js --dry-run     # writes style-review.json, no Notion writes
 *   node fix-card-style.js               # writes to Notion, one card per 350 ms
 *   node fix-card-style.js --verify      # re-reads Notion, reports remaining em dashes
 */

const path = require('path');
const fs   = require('fs');

const DB_ID = '68dabc44-f31e-48d9-9dac-2a6d6edb4414';
const PAUSE_MS = 350;
const REVIEW_FILE = path.join(__dirname, 'style-review.json');

// ── Title Case ─────────────────────────────────────────────────────────────

// English words that stay lowercase mid-title. Mirrors the deck's own usage:
// at / the / in / on / a / to / and / of / from / with / for / an / by / or /
// into / via / vs are lowercase in the existing titles; through / under / over /
// along / around / after / before / above / across / up / out / off / down are
// capitalised there, so they are NOT in this set.
const SMALL = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into',
  'nor', 'of', 'on', 'or', 'the', 'to', 'via', 'vs', 'with',
]);

// Articles, prepositions and conjunctions from venue names in other languages.
// They stay lowercase anywhere but the start of a title or segment.
const FOREIGN = new Set([
  // Romance
  'de', 'del', 'della', 'delle', 'dei', 'degli', 'di', 'da', 'do', 'dos', 'das',
  'du', 'des', 'la', 'le', 'les', 'lo', 'los', 'las', 'el', 'il', 'al', 'au',
  'aux', 'à', 'et', 'e', 'y', 'es', 'o', 'con', 'per', 'su', 'sul', 'sulla',
  'sur', 'sous', 'en', 'un', 'une', 'una', 'uno', 'dans', 'chez', 'pour', 'avec',
  'sans', 'd', 'l',
  // Germanic
  'van', 'von', 'der', 'den', 'die', 'das', 'het', 'ten', 'ter', 'zum', 'zur',
  'am', 'im', 'bei', 'und', 'mit', 'für', 'bij', 'op', 'te', 'zu', 'nach', 'auf',
  'vom', 'og', 'och', 'i', 'på', 'om', 'med', 'til', 'fra', 'av', 'ved',
  // Slavic
  'pod', 'nad', 'na', 'w', 'z', 'przy', 'u', 'v', 've',
  // Turkish / Japanese / Pacific / Tagalog particles
  'bir', 'ile', 'no', 'ng', 'sa', 'ya', 'wa', 'ka', 'o',
]);

// Second halves of hyphenated romanised Japanese names (Senso-ji, Daisen-in).
const JP_SUFFIX = new Set(['dong', 'gil', 'ro', 'dae', 'rikyu', 'suji', 'ji', 'in', 'en', 'dera', 'do', 'gu', 'san', 'jo', 'mae', 'machi', 'cho', 'dori', 'ku', 'shi', 'koen', 'yama', 'kawa', 'gawa', 'bashi', 'mon', 'dake', 'zaka', 'chome', 'ga', 'ni', 'guchi', 'hama', 'shima', 'jima', 'misaki', 'onsen', 'taisha', 'jingu']);

// Characters that may open a word before its first letter: ( [ " “ ‘
// A straight apostrophe is NOT an opener, so 'em / 'n' stay as written.
// macOS / Linux word list, when present: a lowercase title word that is in no
// dictionary and never capitalised in the corpus is a likely lowercase brand.
let DICT = null;
function inDict(word) {
  if (DICT === null) {
    DICT = new Set();
    for (const f of ['/usr/share/dict/words', '/usr/dict/words']) {
      if (fs.existsSync(f)) { fs.readFileSync(f, 'utf8').split('\n').forEach(w => DICT.add(w.toLowerCase())); break; }
    }
  }
  return DICT.has(word) || (word.endsWith('s') && DICT.has(word.slice(0, -1)));
}

const OPENERS = /^[(\["“‘]*/;

// First letter we are willing to uppercase: ASCII or Latin-1 / Latin Extended-A
// lowercase. ß is excluded (toUpperCase gives SS).
const LOWER_FIRST = /^[a-zà-öø-ÿāăąćčďđēėęěğģīįıķļłńņňōőœřśşšţťūůűųźżžș]/;

function capWord(core) {
  return core[0].toUpperCase() + core.slice(1);
}

// Capitalise the part after a hyphen only when both halves are ordinary English
// words (Home-style → Home-Style, Zip-line → Zip-Line). Romanised names keep their
// lowercase halves (Senso-ji, Ikseon-dong, Hama-rikyu, Saint-Germain-des-Prés).
function capHyphenParts(core) {
  const parts = core.split('-');
  if (parts.length < 2) return core;
  for (let i = 1; i < parts.length; i++) {
    const prev = parts[i - 1].replace(/[^A-Za-z]/g, '').toLowerCase();
    const m = parts[i].match(/^([a-z]{3,})(?=$|[^a-z])/);
    if (!m) continue;
    const part = m[1];
    if (SMALL.has(part) || FOREIGN.has(part) || JP_SUFFIX.has(part)) continue;
    if (!inDict(prev) || !inDict(part)) continue;
    parts[i] = capWord(parts[i]);
  }
  return parts.join('-');
}

function titleCase(title) {
  if (!title) return title;
  const words = title.split(' ');
  let segmentStart = true;        // first word, or the word after : — ·
  const out = words.map((w, i) => {
    if (w === '') return w;
    if (/^[—–·|/:-]$/.test(w)) { segmentStart = true; return w; }
    const lead = w.match(OPENERS)[0];
    let core = w.slice(lead.length);
    const isLast = i === words.length - 1;

    if (LOWER_FIRST.test(core)) {
      const body = core.replace(/[.,;:!?)\]"”’']+$/, '');     // strip trailing punctuation
      const bare = body.toLowerCase();
      const stylized = /\d/.test(body) || /\./.test(body) || /[A-Z]/.test(body);   // d.o.g.s, 14er, iPhone
      const elision  = /^[a-z]{1,4}['’]\S/.test(body);                              // d'Orsay, l'Ancienne
      const small    = SMALL.has(bare) || FOREIGN.has(bare);
      const keepLower = stylized || elision || (small && !segmentStart && !(isLast && SMALL.has(bare)));
      if (!keepLower) core = capWord(core);
    }
    if (/^[A-Z]/.test(core)) core = capHyphenParts(core);
    segmentStart = /[:—·]$/.test(core);
    return lead + core;
  });
  return out.join(' ');
}

// Title em dash → colon, then Title Case.
function fixTitle(title) {
  if (!title) return title;
  const t = title.replace(/\s*—\s*/g, ': ').replace(/:\s*:/g, ':').trim();
  return titleCase(t);
}

// ── Em dashes in prose ─────────────────────────────────────────────────────

const PRONOUN_START = new Set(['you', 'it', 'they', 'we', 'he', 'she', 'there', 'i', "you'll", "you're", "it's", "they're", "we're", "there's", "don't", 'never', 'do']);
const DEMONSTRATIVE = new Set(['this', 'that', 'these', 'those', 'each', 'both', 'all', 'none', 'nobody', 'everyone', 'someone', 'most', 'half', 'one', 'some', 'many', 'few', 'nothing', 'everything']);
const DETERMINER    = new Set(['the', 'a', 'an', 'its', 'their', 'your', 'our', 'his', 'her', 'my', 'every', 'no']);

// Verbs that are almost always an imperative when they open a fragment.
const IMPERATIVE_CLEAR = new Set([
  'go', 'get', 'take', 'order', 'eat', 'drink', 'ask', 'find', 'let', 'bring', 'skip', 'try',
  'pick', 'give', 'make', 'put', 'keep', 'wait', 'leave', 'start', 'finish', 'come', 'arrive',
  'grab', 'check', 'learn', 'read', 'see', 'hold', 'throw', 'catch', 'jump', 'dive', 'push',
  'pull', 'spend', 'rent', 'buy', 'commit', 'choose', 'use', 'settle', 'decide', 'send',
  'explore', 'wander', 'memorise', 'memorize', 'repeat', 'expect', 'remember', 'forget',
  'ignore', 'resist', 'refuse', 'accept', 'allow', 'promise', 'trust', 'believe', 'be',
  'begin', 'introduce', 'greet', 'volunteer', 'sit', 'stand', 'stay', 'look', 'listen',
  'feel', 'touch', 'wear', 'carry', 'say', 'tell', 'meet', 'follow', 'walk', 'climb', 'hike',
  'swim', 'ride', 'cycle', 'drive', 'paddle', 'taste', 'count', 'stop', 'turn', 'tip', 'pay',
  'book', 'pack', 'sleep', 'wake', 'call', 'bet', 'guess', 'sing', 'dance', 'play', 'cook',
  'bake', 'pour', 'sip', 'photograph', 'shoot', 'add', 'dig', 'build', 'draw', 'lift', 'drop',
  'lean', 'kneel', 'hang', 'wave', 'nod', 'smile', 'laugh', 'shout', 'whisper', 'speak', 'talk',
  'thank', 'join', 'enter', 'cross', 'stretch', 'breathe', 'relax', 'rest', 'aim', 'return',
  'linger', 'treat', 'raise', 'lower', 'bend', 'split', 'share', 'queue', 'watch', 'run',
  'bike', 'float', 'flash', 'scan', 'charter', 'kayak', 'surf', 'ski', 'skate', 'snorkel', 'sprint',
  'jog', 'stroll', 'browse', 'sample', 'dare', 'challenge', 'order', 'climb', 'descend', 'board',
  'hop', 'ditch', 'lock', 'leave', 'avoid', 'bargain', 'haggle', 'tip', 'toss', 'fold', 'wrap',
]);
// Verbs that are often nouns too; count as imperative only when a function word follows.
const IMPERATIVE_AMBIG = new Set([
  'open', 'close', 'time', 'name', 'line', 'text', 'phone', 'ring', 'knock', 'hand', 'head',
  'frame', 'stick', 'stake', 'race', 'beat', 'win', 'lose', 'row', 'sail', 'fish', 'toast',
  'cheers', 'plan', 'show', 'hunt', 'spot', 'dress', 'trade', 'swap', 'post', 'pass', 'exit',
  'end', 'nap', 'smell', 'chew', 'then', 'lie', 'cry', 'chat', 'work', 'walk', 'shop',
]);
const FUNCTION_NEXT = new Set([
  'the', 'a', 'an', 'it', 'them', 'your', 'this', 'that', 'these', 'those', 'every', 'each',
  'all', 'some', 'one', 'two', 'three', 'to', 'up', 'down', 'out', 'in', 'on', 'at', 'for',
  'with', 'off', 'into', 'through', 'along', 'around', 'over', 'past', 'back', 'away', 'there',
  'here', 'early', 'late', 'first', 'straight', 'slowly', 'whatever', 'whichever', 'wherever',
  'whoever', 'who', 'what', 'how', 'where', 'when', 'and', 'yourself', 'someone', 'somewhere',
  'nothing', 'everything', 'anything', 'until', 'before', 'after', 'by', 'from', 'like',
]);
// Finite verbs that mark a clause.
const FINITE = new Set([
  'is', 'are', 'was', 'were', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'can',
  'cannot', "can't", 'must', 'may', 'might', 'should', 'would', 'could', "isn't", "aren't",
  "doesn't", "won't", "wasn't", "weren't", "hasn't", "haven't", "didn't", "it's", "there's",
  "that's", "you'll", "you're", "they're",
  'runs', 'opens', 'closes', 'sells', 'serves', 'pours', 'takes', 'makes', 'means', 'gets',
  'goes', 'starts', 'ends', 'turns', 'sits', 'stands', 'holds', 'keeps', 'stays', 'becomes',
  'claims', 'needs', 'costs', 'leaves', 'arrives', 'begins', 'looks', 'feels', 'works',
  'sounds', 'brings', 'puts', 'lets', 'gives', 'says', 'wants', 'knows', 'draws', 'fills',
  'lives', 'plays', 'shows', 'tells', 'follows', 'stops', 'comes', 'happens', 'counts',
  'matters', 'hits', 'hides', 'waits', 'lands', 'fits', 'pays', 'wins', 'tastes', 'smells',
  'seems', 'remains', 'stretches', 'climbs', 'drops', 'rises', 'falls', 'passes', 'crosses',
  'winds', 'cuts', 'doubles', 'dates', 'marks', 'sets', 'offers', 'charges', 'shuts', 'swings',
  'sees', 'stocks', 'carries', 'books', 'hangs', 'lies', 'sleeps', 'walks', 'owns', 'hosts',
  'ran', 'opened', 'closed', 'built', 'made', 'took', 'came', 'went', 'became', 'began',
  'started', 'left', 'kept', 'sold', 'served', 'poured', 'said', 'named', 'called', 'brought',
  'drew', 'won', 'lost', 'moved', 'held', 'gave', 'found', 'put', 'set', 'turned', 'used',
  'wrote', 'stood', 'sat', 'hosted', 'invented', 'designed', 'founded', 'burned', 'sank',
  'reopened', 'survived', 'arrived', 'landed', 'played', 'filmed', 'painted', 'carved', 'owned',
]);

function tokens(s) {
  return s.replace(/^[("“‘'\s]+/, '').toLowerCase().split(/\s+/)
    .map(t => t.replace(/’/g, "'").replace(/[^a-z']/g, '')).filter(Boolean);
}

function startsClause(t) {
  if (!t.length) return false;
  if (PRONOUN_START.has(t[0])) return true;
  if (IMPERATIVE_CLEAR.has(t[0])) return true;
  if (IMPERATIVE_AMBIG.has(t[0]) && t[1] && FUNCTION_NEXT.has(t[1])) return true;
  if (DEMONSTRATIVE.has(t[0]) && t[1] && FINITE.has(t[1])) return true;
  return false;
}

// Right side of a dash: 'strong' | 'weak' | false
function clauseStrength(side) {
  const t = tokens(side);
  if (!t.length) return false;
  if (startsClause(t)) return 'strong';
  // "at each place, ask whoever…" — an intro phrase, then an imperative/pronoun
  const commaAt = side.indexOf(',');
  if (commaAt > 0 && startsClause(tokens(side.slice(commaAt + 1)))) return 'strong';
  if (t.slice(1, 7).some(w => FINITE.has(w))) return 'weak';
  return false;
}

// Left side of a dash: is the whole prefix a clause?
function leftIsClause(side) {
  const t = tokens(side);
  if (!t.length) return false;
  if (startsClause(t)) return true;
  if (t.some(w => FINITE.has(w))) return true;
  return side.split(',').slice(1).some(seg => startsClause(tokens(seg)));
}

function isList(side) {
  const commas = (side.match(/,/g) || []).length;
  return commas >= 2 || /^no\s+[^,]+,\s*no\s+/i.test(side);
}

function capFirst(s) {
  return s.replace(/^([("“‘'\s]*)([a-zà-öø-ÿ])/, (m, lead, c) => lead + c.toUpperCase());
}

// Join two sides that were separated by an em dash. Returns { text, rule }.
function joinSides(left, right) {
  const l = left.replace(/\s+$/, '');
  const r = right.replace(/^\s+/, '');
  if (!l) return { text: capFirst(r), rule: 'drop-leading' };
  if (!r) return { text: l, rule: 'drop-trailing' };
  if (/[.!?]["”’)]?$/.test(l))  return { text: `${l} ${capFirst(r)}`, rule: 'after-period' };
  if (/[,;:]$/.test(l))         return { text: `${l} ${r}`, rule: 'after-comma' };
  if (/^[,;:]/.test(r))         return { text: `${l}${r}`, rule: 'before-comma' };
  const rc = clauseStrength(r);
  const lc = leftIsClause(l);
  if (rc === 'strong')          return { text: `${l}. ${capFirst(r)}`, rule: lc ? 'period' : 'period-after-fragment' };
  const longRight = tokens(r).length >= 6;
  if (rc === 'weak' && (lc || longRight)) return { text: `${l}. ${capFirst(r)}`, rule: lc ? 'period-weak' : 'period-weak-long' };
  if (!rc && isList(r))         return { text: `${l}: ${r}`, rule: 'colon-list' };
  return { text: `${l}, ${r}`, rule: rc === 'weak' ? 'comma-weak-clause' : 'comma' };
}

const SENTENCE_SPLIT = /(?<=[.!?]["”’)]?)\s+(?=[A-Z0-9"“(ʻÀ-Þ])/;

// Replace every em dash in a prose field. Returns { text, rules: [...] }.
function fixDashes(text) {
  if (!text || !text.includes('—')) return { text, rules: [] };
  const rules = [];
  const normalised = text.replace(/\s*—\s*/g, ' — ').replace(/^ — /, '').replace(/ — $/, '');
  const sentences = normalised.split(SENTENCE_SPLIT);
  const fixed = sentences.map(sentence => {
    const parts = sentence.split(' — ');
    if (parts.length === 1) return sentence;
    if (parts.length === 3) {
      const inner = parts[1].trim();
      const innerWords = inner.split(/\s+/).length;
      const isAside = innerWords <= 16 && !/[.!?]$/.test(inner);
      if (isAside) {
        const l = parts[0].replace(/\s+$/, '');
        const r = parts[2].replace(/^\s+/, '');
        if (inner.includes(',')) {
          rules.push('aside-parens');
          const rsep = /^[,;:.!?]/.test(r) ? '' : ' ';
          return `${l} (${inner})${rsep}${r}`;
        }
        rules.push('aside-commas');
        const lsep = /[,;:]$/.test(l) ? ' ' : ', ';
        const rsep = /^[,;:.!?]/.test(r) ? '' : ', ';
        return `${l}${lsep}${inner}${rsep}${r}`;
      }
    }
    let acc = parts[0];
    for (let i = 1; i < parts.length; i++) {
      const j = joinSides(acc, parts[i]);
      rules.push(j.rule);
      acc = j.text;
    }
    return acc;
  });
  return { text: fixed.join(' ').replace(/\s+/g, ' ').trim(), rules };
}

// ── Per-card transform + doubt score ───────────────────────────────────────

// capIndex: Map word → count of capitalised occurrences away from sentence
// starts, built from the whole corpus. A word never seen capitalised anywhere
// is a likely lowercase brand (lucettegrace, about blank) and scores as doubtful.
function buildCapIndex(cards) {
  const idx = new Map();
  for (const c of cards) {
    for (const field of [c.title, c.description, c.bonus]) {
      if (!field) continue;
      const words = field.split(/\s+/);
      for (let i = 1; i < words.length; i++) {
        if (/[.!?:—]$/.test(words[i - 1])) continue;
        const w = words[i].replace(/^[("“‘']+/, '').replace(/[^A-Za-zÀ-ÿ]/g, '');
        if (/^[A-ZÀ-Þ][a-zà-ÿ]+$/.test(w)) idx.set(w.toLowerCase(), (idx.get(w.toLowerCase()) || 0) + 1);
      }
    }
  }
  return idx;
}

const DOUBT = {
  'period-after-fragment': [1, 'period after a fragment'],
  'period-weak':           [1, 'period on a weak clause'],
  'period-weak-long':      [2, 'period on a weak clause after a fragment'],
  'comma-weak-clause':     [2, 'comma before a clause'],
  'colon-list':            [1, 'colon before a list'],
  'aside-commas':          [1, 'aside → commas'],
  'aside-parens':          [2, 'aside → parentheses'],
  'drop-leading':          [3, 'dash at an edge'],
  'drop-trailing':         [3, 'dash at an edge'],
};

function transformCard(card, capIndex = new Map()) {
  const changes = [];
  let doubt = 0;
  const reasons = [];

  const newTitle = fixTitle(card.title);
  if (newTitle !== card.title) {
    changes.push({ field: 'Title', before: card.title, after: newTitle });
    if (card.title.includes('—')) { doubt += 1; reasons.push('title dash → colon'); }
    const base = card.title.replace(/\s*—\s*/g, ': ').replace(/:\s*:/g, ':').trim();
    const before = base.split(' '), after = newTitle.split(' ');
    after.forEach((w, i) => {
      if (before[i] && before[i] !== w) {
        const bare = w.replace(/[^A-Za-zÀ-ÿ]/g, '').toLowerCase();
        if (/^[à-ÿ]/.test(before[i].replace(/^[("“‘]+/, ''))) { doubt += 1; reasons.push(`"${before[i]}" accented first letter`); }
        if (bare && !capIndex.get(bare) && !inDict(bare)) { doubt += 3; reasons.push(`"${before[i]}" never capitalised elsewhere, not in the dictionary`); }
      }
    });
  }

  for (const [field, key] of [['Description', 'description'], ['Bonus', 'bonus']]) {
    const r = fixDashes(card[key]);
    if (r.text !== card[key]) {
      changes.push({ field, before: card[key], after: r.text, rules: r.rules });
      for (const rule of r.rules) {
        if (DOUBT[rule]) { doubt += DOUBT[rule][0]; reasons.push(`${field}: ${DOUBT[rule][1]}`); }
      }
      if (/,,|, ,|\.\.|: :|,:|:,|\( |\s\)/.test(r.text)) { doubt += 5; reasons.push(`${field}: doubled punctuation`); }
    }
  }
  return { changes, doubt, reasons };
}

// ── Notion I/O ─────────────────────────────────────────────────────────────

function plain(prop) {
  return (prop?.title || prop?.rich_text || []).map(t => t.plain_text).join('');
}

function pageToCard(page, readPack) {
  return {
    pageId: page.id,
    pack: readPack(page),
    id: plain(page.properties['Card ID']),
    active: !!page.properties['Active']?.checkbox,
    title: plain(page.properties['Title']),
    description: plain(page.properties['Description']),
    bonus: plain(page.properties['Bonus']),
    commentsRich: page.properties['Comments']?.rich_text || [],
  };
}

async function queryAll(notion) {
  const pages = [];
  let cursor;
  do {
    const res = await notion.databases.query({ database_id: DB_ID, start_cursor: cursor, page_size: 100 });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return pages;
}

// Rebuild the existing Comments segments (keeping links and annotations) and
// append the audit suffix as one more segment.
function commentsWithSuffix(rich, suffix) {
  const allText = rich.every(t => t.type === 'text');
  const kept = allText
    ? rich.map(t => ({ type: 'text', text: { content: t.text.content, link: t.text.link || null }, annotations: t.annotations }))
    : [{ type: 'text', text: { content: rich.map(t => t.plain_text).join('') } }];
  while (kept.length && !kept[kept.length - 1].text.content) kept.pop();
  return [...kept, { type: 'text', text: { content: suffix } }];
}

function buildProperties(card, changes, suffix) {
  const props = {};
  for (const c of changes) {
    if (c.field === 'Title')       props['Title']       = { title: [{ text: { content: c.after } }] };
    if (c.field === 'Description') props['Description'] = { rich_text: [{ text: { content: c.after } }] };
    if (c.field === 'Bonus')       props['Bonus']       = { rich_text: [{ text: { content: c.after } }] };
  }
  props['Comments'] = { rich_text: commentsWithSuffix(card.commentsRich, suffix) };
  return props;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });
  const { Client } = require('@notionhq/client');
  const { initPackType, readPack } = require('./pack-prop');

  const DRY_RUN = process.argv.includes('--dry-run');
  const VERIFY  = process.argv.includes('--verify');
  if (!process.env.NOTION_API_KEY) { console.error('Missing NOTION_API_KEY'); process.exit(1); }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  await initPackType(notion);
  console.log('Reading every row…');
  const pages = await queryAll(notion);
  const cards = pages.map(p => pageToCard(p, readPack));
  console.log(`  ${cards.length} rows`);

  if (VERIFY) {
    const remaining = cards.filter(c => [c.title, c.description, c.bonus].some(s => s.includes('—')));
    console.log(`Em dashes remaining in Title/Description/Bonus: ${remaining.length} card(s)`);
    remaining.slice(0, 20).forEach(c => console.log(`  [${c.pack}] ${c.id} "${c.title}"`));
    const stamped = cards.filter(c => plain({ rich_text: c.commentsRich }).includes('style-fix')).length;
    console.log(`Cards stamped style-fix: ${stamped}`);
    const titleLeft = cards.filter(c => fixTitle(c.title) !== c.title).length;
    console.log(`Titles that would still change: ${titleLeft}`);
    process.exit(remaining.length ? 1 : 0);
  }

  const capIndex = buildCapIndex(cards);
  const plan = [];
  for (const card of cards) {
    const { changes, doubt, reasons } = transformCard(card, capIndex);
    if (changes.length) plan.push({ card, changes, doubt, reasons });
  }

  const perPack = {};
  for (const p of plan) perPack[p.card.pack || '(none)'] = (perPack[p.card.pack || '(none)'] || 0) + 1;
  const fields = { Title: 0, Description: 0, Bonus: 0 };
  const rules = {};
  for (const p of plan) for (const c of p.changes) { fields[c.field]++; for (const r of c.rules || []) rules[r] = (rules[r] || 0) + 1; }
  console.log(`\n${plan.length} cards change (${plan.filter(p => p.card.active).length} active): ${JSON.stringify(fields)}`);
  console.log('Rules:', JSON.stringify(rules));

  if (DRY_RUN) {
    const review = {
      generatedAt: new Date().toISOString(),
      totalRows: cards.length,
      cardsChanged: plan.length,
      activeChanged: plan.filter(p => p.card.active).length,
      fields,
      rules,
      perPack: Object.fromEntries(Object.entries(perPack).sort((a, b) => b[1] - a[1])),
      doubtful: plan.filter(p => p.doubt > 0).sort((a, b) => b.doubt - a.doubt).slice(0, 60)
        .map(p => ({ pack: p.card.pack, id: p.card.id, active: p.card.active, doubt: p.doubt, reasons: p.reasons, changes: p.changes })),
      changes: plan.map(p => ({ pack: p.card.pack, id: p.card.id, active: p.card.active, pageId: p.card.pageId, doubt: p.doubt, reasons: p.reasons, changes: p.changes })),
    };
    fs.writeFileSync(REVIEW_FILE, JSON.stringify(review, null, 1));
    console.log(`Review written to ${path.relative(process.cwd(), REVIEW_FILE)}`);
    console.log('Per pack:', Object.entries(review.perPack).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(' · '));
    return;
  }

  const suffix = ` · style-fix ${new Date().toISOString().slice(0, 10)}`;
  let done = 0, failed = 0;
  const failures = [];
  for (const p of plan) {
    try {
      await notion.pages.update({ page_id: p.card.pageId, properties: buildProperties(p.card, p.changes, suffix) });
      done++;
    } catch (e) {
      failed++;
      failures.push({ id: p.card.id, pack: p.card.pack, error: e.message });
      console.error(`  ✗ [${p.card.pack}] ${p.card.id}: ${e.message}`);
      if (e.code === 'rate_limited') await sleep(5000);
    }
    if ((done + failed) % 100 === 0) console.log(`  ${done + failed}/${plan.length} (${failed} failed)`);
    await sleep(PAUSE_MS);
  }
  console.log(`\nDone: ${done} updated, ${failed} failed.`);
  if (failures.length) fs.writeFileSync(path.join(__dirname, 'style-fix-failures.json'), JSON.stringify(failures, null, 1));
}

module.exports = { titleCase, fixTitle, fixDashes, joinSides, clauseStrength, leftIsClause, transformCard, buildCapIndex, commentsWithSuffix, SMALL, FOREIGN };

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
