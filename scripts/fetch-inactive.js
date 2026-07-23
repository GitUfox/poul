#!/usr/bin/env node
/**
 * fetch-inactive.js — dump a pack's INACTIVE Notion cards as JSON (with pageId).
 * Used by the card-review workflow: generate → fetch-inactive → verify venues →
 * apply-review.
 *
 * Usage: node fetch-inactive.js <pack> [outfile.json]
 * Env: NOTION_API_KEY (in ../.env)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const { Client } = require('@notionhq/client');
const fs = require('fs');

const DB_ID = '68dabc44-f31e-48d9-9dac-2a6d6edb4414';

async function main() {
  const pack = process.argv[2];
  const outfile = process.argv[3];
  if (!pack) { console.error('Usage: node fetch-inactive.js <pack> [outfile.json]'); process.exit(1); }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const results = [];
  let cursor;
  do {
    const r = await notion.databases.query({
      database_id: DB_ID,
      filter: { and: [
        { property: 'Pack', select: { equals: pack } },
        { property: 'Active', checkbox: { equals: false } },
      ]},
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);

  const t = (p) => (p?.rich_text || p?.title || []).map((x) => x.plain_text).join('');
  const cards = results.map((pg) => ({
    pageId: pg.id,
    id: t(pg.properties['Card ID']),
    title: t(pg.properties['Title']),
    description: t(pg.properties['Description']),
    category: pg.properties['Category']?.select?.name,
    rarity: pg.properties['Rarity']?.select?.name,
    cost: pg.properties['Cost']?.select?.name,
    duration: t(pg.properties['Duration']),
    time: pg.properties['Time']?.select?.name,
    season: t(pg.properties['Season']),
    spark: pg.properties['Spark']?.number,
    bonus: t(pg.properties['Bonus']),
    city: t(pg.properties['City']),
    mapsUrl: pg.properties['Maps URL']?.url,
  }));

  const json = JSON.stringify(cards, null, 2);
  if (outfile) { fs.writeFileSync(outfile, json); console.log(`${cards.length} inactive ${pack} cards → ${outfile}`); }
  else console.log(json);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
