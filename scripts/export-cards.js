#!/usr/bin/env node
/**
 * export-cards.js
 * Reads the Poul Card Database from Notion → writes packs/*.json
 *
 * Usage:
 *   node scripts/export-cards.js              # export all packs
 *   node scripts/export-cards.js phoenix      # export one pack
 *
 * Env: NOTION_API_KEY (in ../.env)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const { Client } = require('@notionhq/client');
const fs   = require('fs');
const path = require('path');

const DB_ID    = '68dabc44-f31e-48d9-9dac-2a6d6edb4414';
const PACKS_DIR = path.join(__dirname, '..', 'packs');

// Pack metadata — name, location, emoji, whether it's the default home deck
// IMPORTANT: every pack id that exists in Notion must have an entry here.
// Missing entries fall back to { name: packId, location: '', emoji: '📍' },
// which produces broken display names in the app.
const PACK_META = {
  'phoenix':    { name: 'Phoenix · Scottsdale', location: 'Arizona',                emoji: '🌵', isDefault: true  },
  'nyc':        { name: 'New York City',         location: 'New York · New Jersey',  emoji: '🗽', isDefault: false },
  'norway':     { name: 'Bergen & Voss',          location: 'Norway',                 emoji: '🏔️', isDefault: false },
  'turkey':     { name: 'Cappadocia',             location: 'Türkiye',                emoji: '🎈', isDefault: false },
  'istanbul':   { name: 'Istanbul',              location: 'Türkiye',                emoji: '🕌', isDefault: false },
  'brussels':   { name: 'Brussels',              location: 'Belgium',                emoji: '🍺', isDefault: false },
  'hamptons':   { name: 'The Hamptons',          location: 'New York',               emoji: '🏖️', isDefault: false },
  'paris':      { name: 'Paris',                 location: 'France',                 emoji: '🗼', isDefault: false },
  'oslo':       { name: 'Oslo',                  location: 'Norway',                 emoji: '🏔️', isDefault: false },
  'baltimore':  { name: 'Baltimore',             location: 'Maryland',               emoji: '🦀', isDefault: false },
  'ocean-city': { name: 'Ocean City',            location: 'Maryland',               emoji: '🌊', isDefault: false },
  'dc':               { name: 'Washington, DC',    location: 'District of Columbia',   emoji: '🏛️', isDefault: false },
  'thousand-islands': { name: 'Thousand Islands', location: 'New York',               emoji: '⛵', isDefault: false },
  'flagstaff':        { name: 'Flagstaff',         location: 'Arizona',                emoji: '🌲', isDefault: false },
  'sedona':           { name: 'Sedona',            location: 'Arizona',                emoji: '🏜️', isDefault: false },
  'tokyo':            { name: 'Tokyo',             location: 'Japan',                  emoji: '🌸', isDefault: false },
  'bangkok':    { name: 'Bangkok',               location: 'Thailand',               emoji: '🛕', isDefault: false },
  // Wave 1 — North America ≥1M metros
  'los-angeles':  { name: 'Los Angeles',   location: 'California',     emoji: '🌴', isDefault: false },
  'chicago':      { name: 'Chicago',       location: 'Illinois',       emoji: '🌭', isDefault: false },
  'las-vegas':    { name: 'Las Vegas',     location: 'Nevada',         emoji: '🎰', isDefault: false },
  'miami':        { name: 'Miami',         location: 'Florida',        emoji: '🦩', isDefault: false },
  'san-francisco':{ name: 'San Francisco', location: 'California',     emoji: '🌉', isDefault: false },
  'seattle':      { name: 'Seattle',       location: 'Washington',     emoji: '☕', isDefault: false },
  'denver':       { name: 'Denver',        location: 'Colorado',       emoji: '⛰️', isDefault: false },
  'austin':       { name: 'Austin',        location: 'Texas',          emoji: '🦇', isDefault: false },
  'nashville':    { name: 'Nashville',     location: 'Tennessee',      emoji: '🎸', isDefault: false },
  'san-diego':    { name: 'San Diego',     location: 'California',     emoji: '🏄', isDefault: false },
  'new-orleans':  { name: 'New Orleans',   location: 'Louisiana',      emoji: '⚜️', isDefault: false },
  'boston':       { name: 'Boston',        location: 'Massachusetts',  emoji: '🦞', isDefault: false },
  // Wave 2 — Canada · Mexico · US round-out
  'toronto':      { name: 'Toronto',       location: 'Ontario',          emoji: '🍁', isDefault: false },
  'montreal':     { name: 'Montréal',      location: 'Québec',           emoji: '🥐', isDefault: false },
  'vancouver':    { name: 'Vancouver',     location: 'British Columbia', emoji: '🌲', isDefault: false },
  'mexico-city':  { name: 'Mexico City',   location: 'Mexico',           emoji: '🦅', isDefault: false },
  'guadalajara':  { name: 'Guadalajara',   location: 'Jalisco · Mexico', emoji: '🎺', isDefault: false },
  'cancun':       { name: 'Cancún',        location: 'Quintana Roo · Mexico', emoji: '🏝️', isDefault: false },
  'atlanta':      { name: 'Atlanta',       location: 'Georgia',          emoji: '🍑', isDefault: false },
  'dallas':       { name: 'Dallas',        location: 'Texas',            emoji: '🤠', isDefault: false },
  'houston':      { name: 'Houston',       location: 'Texas',            emoji: '🚀', isDefault: false },
  'philadelphia': { name: 'Philadelphia',  location: 'Pennsylvania',     emoji: '🔔', isDefault: false },
};

// ── Notion helpers ─────────────────────────────────────────────────────────

async function queryAll(notion, filter) {
  const pages = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: DB_ID,
      filter,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return pages;
}

function prop(page, key, type) {
  const p = page.properties[key];
  if (!p) return null;
  switch (type) {
    case 'title':    return p.title?.[0]?.plain_text   || null;
    case 'text':     return p.rich_text?.[0]?.plain_text || null;
    case 'select':   return p.select?.name              || null;
    case 'number':   return p.number                    ?? null;
    case 'url':      return p.url                       || null;
    case 'checkbox': return p.checkbox                  ?? false;
    case 'multi_select': return p.multi_select?.map(o => o.name) || [];
    default:         return null;
  }
}

function pageToCard(page) {
  const card = {
    id:           prop(page, 'Card ID',      'text'),
    title:        prop(page, 'Title',        'title'),
    description:  prop(page, 'Description',  'text'),
    rarity:       prop(page, 'Rarity',       'select'),
    cost:         prop(page, 'Cost',         'select'),
    duration:     prop(page, 'Duration',     'text'),
    durationMins: prop(page, 'Duration Mins','number'),
    time:         prop(page, 'Time',         'select'),
    season:       prop(page, 'Season',       'text'),
    spark:        prop(page, 'Spark',        'number'),
    bonus:        prop(page, 'Bonus',        'text'),
    city:         prop(page, 'City',         'text'),
    mapsUrl:      prop(page, 'Maps URL',     'url'),
  };
  const exempt = prop(page, 'Filter Exempt', 'checkbox');
  if (exempt) card.filterExempt = true;
  // Facets (2026-08-07): sparse by design — absence means "any", so only
  // tagged cards carry the fields at all.
  const company = prop(page, 'Company', 'multi_select');
  if (company && company.length) card.company = company;
  const adult = prop(page, '21+', 'checkbox');
  if (adult) card.adult = true;
  return card;
}

// ── Export ─────────────────────────────────────────────────────────────────

async function exportPack(notion, packId) {
  console.log(`Exporting pack: ${packId}...`);
  const pages = await queryAll(notion, {
    and: [
      { property: 'Pack',   select:   { equals: packId } },
      { property: 'Active', checkbox: { equals: true   } },
    ],
  });

  if (!pages.length) { console.log(`  (no active cards)`); return; }

  // Group by category. KNOWN = the live taxonomy — an unknown key here means
  // a reactivated card still carries a retired category (e.g. 'active', merged
  // into adventure 2026-08-07): it would export fine but be UNREACHABLE in the
  // app (no tile draws from it). Warn loudly; retag the card in Notion.
  const KNOWN = new Set(['adventure', 'foodie', 'chill', 'social', 'culture', '8ball']);
  const cards = {};
  for (const page of pages) {
    const cat = prop(page, 'Category', 'select');
    if (!cat) continue;
    if (!KNOWN.has(cat)) console.warn(`  ⚠ UNKNOWN CATEGORY "${cat}" on "${prop(page, 'Title', 'title')}" — unreachable in the app, retag it`);
    (cards[cat] = cards[cat] || []).push(pageToCard(page));
  }

  const meta = PACK_META[packId] || { name: packId, location: '', emoji: '📍', isDefault: false };
  const output = { id: packId, ...meta, cards };

  if (!fs.existsSync(PACKS_DIR)) fs.mkdirSync(PACKS_DIR, { recursive: true });
  fs.writeFileSync(path.join(PACKS_DIR, `${packId}.json`), JSON.stringify(output, null, 2));

  const total = Object.values(cards).flat().length;
  console.log(`  ✓ ${total} cards → packs/${packId}.json`);
  return total;
}

// Single-pack export: keep index.json's cardCount in sync without a full export
function patchIndexCount(packId, cardCount) {
  const indexPath = path.join(PACKS_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) return;
  const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  let entry = idx.packs.find(p => p.id === packId);
  if (entry && entry.cardCount === cardCount) return;
  if (!entry) {
    const m = PACK_META[packId] || { name: packId, location: '', emoji: '📍' };
    entry = { id: packId, name: m.name, location: m.location, emoji: m.emoji, cardCount };
    idx.packs.push(entry);
    console.log(`  ✓ index.json: added new pack ${packId}`);
  }
  entry.cardCount = cardCount;
  fs.writeFileSync(indexPath, JSON.stringify(idx, null, 2));
  console.log(`  ✓ index.json: ${packId} cardCount → ${cardCount}`);
}

async function exportIndex(notion) {
  const allActive = await queryAll(notion, { property: 'Active', checkbox: { equals: true } });
  const seen = {};
  for (const p of allActive) {
    const id = prop(p, 'Pack', 'select');
    if (id) seen[id] = (seen[id] || 0) + 1;
  }
  const packs = Object.entries(seen).map(([id, cardCount]) => {
    const m = PACK_META[id] || { name: id, location: '', emoji: '📍' };
    return { id, name: m.name, location: m.location, emoji: m.emoji, cardCount };
  });
  fs.writeFileSync(path.join(PACKS_DIR, 'index.json'), JSON.stringify({ packs }, null, 2));
  console.log(`✓ index.json updated (${packs.length} packs)`);
}

async function main() {
  if (!process.env.NOTION_API_KEY) {
    console.error('Missing NOTION_API_KEY — copy .env.example to .env and fill it in');
    process.exit(1);
  }
  const notion    = new Client({ auth: process.env.NOTION_API_KEY });
  const targetPack = process.argv[2];

  if (targetPack) {
    const total = await exportPack(notion, targetPack);
    if (total) patchIndexCount(targetPack, total);
  } else {
    const allActive = await queryAll(notion, { property: 'Active', checkbox: { equals: true } });
    const packIds   = [...new Set(allActive.map(p => prop(p, 'Pack', 'select')).filter(Boolean))];
    for (const id of packIds) await exportPack(notion, id);
    await exportIndex(notion);
  }
  console.log('\nDone. Commit the packs/ folder to deploy.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
