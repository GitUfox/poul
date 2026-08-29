#!/usr/bin/env node
/**
 * retag-category.js — Phase 2 taxonomy migration (2026-08-07)
 *
 * The Pool-Hall lesson applies to categories: INTERNALS ARE PERMANENT, labels
 * are UI. `adventure` absorbs `active` (displays as "Outdoors"), `social`
 * becomes the Nightlife bucket, `foodie` displays as "Eat & Drink". The only
 * NEW internal is `culture`. Old select options stay in the schema — archived
 * cards keep their history.
 *
 * Usage: node scripts/retag-category.js scripts/category-mapping.json
 * mapping shape: { "pack:CARD-ID": "newCategory", ... }
 * Env: NOTION_API_KEY (in ../.env)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const fs = require('fs');
const { Client } = require('@notionhq/client');

const DB_ID = '68dabc44-f31e-48d9-9dac-2a6d6edb4414';
const VALID = new Set(['adventure', 'foodie', 'social', 'culture', 'chill', '8ball']);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!process.env.NOTION_API_KEY) { console.error('Missing NOTION_API_KEY'); process.exit(1); }
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const mapping = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

  for (const v of Object.values(mapping)) {
    if (!VALID.has(v)) { console.error('Invalid target category:', v); process.exit(1); }
  }

  // Ensure the one new option exists with a deliberate colour.
  const db = await notion.databases.retrieve({ database_id: DB_ID });
  const opts = db.properties['Category'].select.options;
  if (!opts.some(o => o.name === 'culture')) {
    await notion.databases.update({
      database_id: DB_ID,
      properties: { Category: { select: { options: [...opts, { name: 'culture', color: 'brown' }] } } },
    });
    console.log('✓ Added Category option: culture');
  }

  console.log('Fetching active cards…');
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
  console.log(`  ${pages.length} active pages`);

  const key = p => (p.properties['Pack']?.select?.name || '') + ':'
    + (p.properties['Card ID']?.rich_text || []).map(t => t.plain_text).join('');
  const byKey = new Map(pages.map(p => [key(p), p]));

  let done = 0, skipped = 0;
  const missing = [];
  const entries = Object.entries(mapping);
  for (const [k, to] of entries) {
    const page = byKey.get(k);
    if (!page) { missing.push(k); continue; }
    if (page.properties['Category']?.select?.name === to) { skipped++; continue; }
    let attempt = 0;
    for (;;) {
      try {
        await notion.pages.update({ page_id: page.id, properties: { Category: { select: { name: to } } } });
        break;
      } catch (e) {
        if (++attempt >= 4) throw e;
        await sleep(1200 * attempt);
      }
    }
    if (++done % 50 === 0) console.log(`  ${done}/${entries.length}…`);
    await sleep(350);
  }
  console.log(`✓ Retagged ${done}/${entries.length} (${skipped} already correct)`);
  if (missing.length) {
    console.log(`⚠ ${missing.length} keys matched no active page:`);
    missing.forEach(k => console.log('  ' + k));
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
