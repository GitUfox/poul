#!/usr/bin/env node
/**
 * tag-facets.js — Phase 1 facet tagging (Company + 21+)
 *
 * Facet philosophy: tag only STRONG signals. An untagged card means "any" —
 * the app treats absence as passing every company filter. Sparse and honest
 * beats exhaustive and wrong.
 *
 * Usage:
 *   node scripts/tag-facets.js candidates          # regex sweep over packs/*.json → candidate lists (review these)
 *   node scripts/tag-facets.js apply mapping.json  # ensure Notion columns, write reviewed tags to Notion
 *
 * mapping.json shape: { "pack:CARD-ID": { "company": ["group"], "adult": true }, ... }
 * Env: NOTION_API_KEY (in ../.env) — apply mode only.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const fs = require('fs');
const path = require('path');

const DB_ID = '68dabc44-f31e-48d9-9dac-2a6d6edb4414';
const PACKS_DIR = path.join(__dirname, '..', 'packs');

// ── Candidate regexes — deliberately wide; the human/AI review prunes ──────
const RX = {
  adult: /\b(bar|bars|brewery|breweries|brewpub|taproom|cocktail|speakeasy|whiskey|whisky|bourbon|tequila|mezcal|sake|winery|wine|vineyard|distillery|cidery|cider|beer|pint|happy hour|nightclub|dance club|comedy club|jazz club|club night|casino|poker|drag|burlesque|hookah|dive|pub|brews|margarita|sangria|mimosa|drinks|nightlife|lounge)\b/i,
  group: /\b(trivia|karaoke|game night|board game|crawl|league|pickup|tournament|team|crew|party|potluck|friends|group)\b/i,
  couple: /\b(date night|romantic|sunset|stargaz|candlelit|picnic|couples?)\b/i,
  solo: /\b(solo|alone|by yourself|journal|sketchbook|meditat|bookstore|library|people-?watch)\b/i,
};

function loadAllCards() {
  const out = [];
  for (const f of fs.readdirSync(PACKS_DIR).sort()) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const pack = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, f), 'utf8'));
    for (const [cat, cards] of Object.entries(pack.cards)) {
      for (const c of cards) out.push({ pack: pack.id, cat, id: c.id, title: c.title, desc: c.description || '' });
    }
  }
  return out;
}

function candidates() {
  const cards = loadAllCards();
  const hits = { adult: [], group: [], couple: [], solo: [] };
  for (const c of cards) {
    const text = c.title + ' — ' + c.desc;
    for (const facet of Object.keys(RX)) {
      if (RX[facet].test(text)) hits[facet].push(c);
    }
  }
  for (const [facet, list] of Object.entries(hits)) {
    console.log(`\n══ ${facet.toUpperCase()} candidates: ${list.length} ══`);
    for (const c of list) console.log(`${c.pack}:${c.id} [${c.cat}] ${c.title}`);
  }
  console.log(`\nTotal cards scanned: ${cards.length}`);
}

// ── Apply mode ─────────────────────────────────────────────────────────────
async function ensureColumns(notion) {
  const db = await notion.databases.retrieve({ database_id: DB_ID });
  const props = {};
  if (!db.properties['Company']) {
    props['Company'] = { multi_select: { options: [
      { name: 'solo', color: 'blue' },
      { name: 'couple', color: 'pink' },
      { name: 'group', color: 'orange' },
    ] } };
  }
  if (!db.properties['21+']) {
    props['21+'] = { checkbox: {} };
  }
  if (Object.keys(props).length) {
    await notion.databases.update({ database_id: DB_ID, properties: props });
    console.log('✓ Added columns:', Object.keys(props).join(', '));
  } else {
    console.log('✓ Columns already exist');
  }
}

async function queryAllActive(notion) {
  const pages = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: DB_ID,
      filter: { property: 'Active', checkbox: { equals: true } },
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function apply(mappingPath) {
  const { Client } = require('@notionhq/client');
  if (!process.env.NOTION_API_KEY) { console.error('Missing NOTION_API_KEY'); process.exit(1); }
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

  await ensureColumns(notion);

  console.log('Fetching active cards for id resolution…');
  const pages = await queryAllActive(notion);
  console.log(`  ${pages.length} active pages`);

  const key = p => {
    const pack = p.properties['Pack']?.select?.name || '';
    const cid = (p.properties['Card ID']?.rich_text || []).map(t => t.plain_text).join('');
    return pack + ':' + cid;
  };
  const byKey = new Map(pages.map(p => [key(p), p]));

  let done = 0, missing = [];
  const entries = Object.entries(mapping);
  for (const [k, tags] of entries) {
    const page = byKey.get(k);
    if (!page) { missing.push(k); continue; }
    const props = {};
    if (tags.company) props['Company'] = { multi_select: tags.company.map(name => ({ name })) };
    if (tags.adult) props['21+'] = { checkbox: true };
    let attempt = 0;
    for (;;) {
      try {
        await notion.pages.update({ page_id: page.id, properties: props });
        break;
      } catch (e) {
        if (++attempt >= 4) throw e;
        await sleep(1200 * attempt);   // back off on rate limits / transient errors
      }
    }
    if (++done % 50 === 0) console.log(`  ${done}/${entries.length}…`);
    await sleep(350);                  // ~3 req/s — Notion's documented ceiling
  }
  console.log(`✓ Applied ${done}/${entries.length}`);
  if (missing.length) {
    console.log(`⚠ ${missing.length} mapping keys matched no active page:`);
    missing.forEach(k => console.log('  ' + k));
  }
}

const mode = process.argv[2];
if (mode === 'candidates') candidates();
else if (mode === 'apply' && process.argv[3]) apply(process.argv[3]).catch(e => { console.error(e.message); process.exit(1); });
else { console.log('Usage: tag-facets.js candidates | apply <mapping.json>'); process.exit(1); }
