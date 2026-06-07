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
  'nyc-fifa':   { name: 'FIFA World Cup',        location: 'New York · New Jersey',  emoji: '⚽', isDefault: false },
  'istanbul':   { name: 'Istanbul',              location: 'Türkiye',                emoji: '🕌', isDefault: false },
  'brussels':   { name: 'Brussels',              location: 'Belgium',                emoji: '🍺', isDefault: false },
  'hamptons':   { name: 'The Hamptons',          location: 'New York',               emoji: '🏖️', isDefault: false },
  'paris':      { name: 'Paris',                 location: 'France',                 emoji: '🗼', isDefault: false },
  'oslo':       { name: 'Oslo',                  location: 'Norway',                 emoji: '🏔️', isDefault: false },
  'baltimore':  { name: 'Baltimore',             location: 'Maryland',               emoji: '🦀', isDefault: false },
  'ocean-city': { name: 'Ocean City',            location: 'Maryland',               emoji: '🌊', isDefault: false },
  'dc':         { name: 'Washington, DC',        location: 'District of Columbia',   emoji: '🏛️', isDefault: false },
  'tokyo':      { name: 'Tokyo',                 location: 'Japan',                  emoji: '🌸', isDefault: false },
  'bangkok':    { name: 'Bangkok',               location: 'Thailand',               emoji: '🛕', isDefault: false },
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

  // Group by category
  const cards = {};
  for (const page of pages) {
    const cat = prop(page, 'Category', 'select');
    if (!cat) continue;
    (cards[cat] = cards[cat] || []).push(pageToCard(page));
  }

  const meta = PACK_META[packId] || { name: packId, location: '', emoji: '📍', isDefault: false };
  const output = { id: packId, ...meta, cards };

  if (!fs.existsSync(PACKS_DIR)) fs.mkdirSync(PACKS_DIR, { recursive: true });
  fs.writeFileSync(path.join(PACKS_DIR, `${packId}.json`), JSON.stringify(output, null, 2));

  const total = Object.values(cards).flat().length;
  console.log(`  ✓ ${total} cards → packs/${packId}.json`);
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
    await exportPack(notion, targetPack);
  } else {
    const allActive = await queryAll(notion, { property: 'Active', checkbox: { equals: true } });
    const packIds   = [...new Set(allActive.map(p => prop(p, 'Pack', 'select')).filter(Boolean))];
    for (const id of packIds) await exportPack(notion, id);
    await exportIndex(notion);
  }
  console.log('\nDone. Commit the packs/ folder to deploy.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
