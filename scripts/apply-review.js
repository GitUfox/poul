#!/usr/bin/env node
/**
 * apply-review.js — apply a card-review decisions file to Notion.
 * Part of the review workflow: generate → fetch-inactive → verify venues →
 * apply-review. Cards not listed stay untouched (inactive = rejected/held).
 *
 * Usage: node apply-review.js <decisions.json>
 *
 * decisions.json shape:
 * {
 *   "pack": "turkey",
 *   "activate": ["<pageId>", ...],                 // verified as-is
 *   "fix": {                                       // corrected then activated
 *     "<pageId>": { "title"?: "...", "desc"?: "...", "maps"?: "...", "season"?: "..." }
 *   },
 *   "create": [ {                                  // hand-verified additions, born Active
 *     "id": "TUR-S-201", "title": "...", "description": "...", "category": "social",
 *     "rarity": "Common", "cost": "$$", "duration": "2–3 hrs", "durationMins": 150,
 *     "time": "Evening", "season": "Year Round", "spark": 15, "bonus": "...",
 *     "city": "...", "mapsUrl": "..."
 *   } ]
 * }
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const DB_ID = '68dabc44-f31e-48d9-9dac-2a6d6edb4414';
const pause = () => new Promise((r) => setTimeout(r, 350));

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node apply-review.js <decisions.json>'); process.exit(1); }
  const d = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const notion = new Client({ auth: process.env.NOTION_API_KEY });

  let activated = 0, fixed = 0, created = 0;

  for (const pageId of d.activate || []) {
    await notion.pages.update({ page_id: pageId, properties: { 'Active': { checkbox: true } } });
    activated++; process.stdout.write('.'); await pause();
  }

  for (const [pageId, f] of Object.entries(d.fix || {})) {
    const props = { 'Active': { checkbox: true } };
    if (f.title) props['Title'] = { title: [{ text: { content: f.title } }] };
    if (f.desc) props['Description'] = { rich_text: [{ text: { content: f.desc } }] };
    if (f.maps) props['Maps URL'] = { url: f.maps };
    if (f.season) props['Season'] = { rich_text: [{ text: { content: f.season } }] };
    if (f.city) props['City'] = { rich_text: [{ text: { content: f.city } }] };
    if (f.cost) props['Cost'] = { select: { name: f.cost } };
    if (f.bonus) props['Bonus'] = { rich_text: [{ text: { content: f.bonus } }] };
    if (f.rarity) props['Rarity'] = { select: { name: f.rarity } };
    if (f.spark) props['Spark'] = { number: f.spark };
    await notion.pages.update({ page_id: pageId, properties: props });
    fixed++; process.stdout.write('+'); await pause();
  }

  for (const c of d.create || []) {
    await notion.pages.create({
      parent: { database_id: DB_ID },
      properties: {
        'Title':         { title: [{ text: { content: c.title } }] },
        'Card ID':       { rich_text: [{ text: { content: c.id } }] },
        'Pack':          { select: { name: d.pack } },
        'Category':      { select: { name: c.category } },
        'Rarity':        { select: { name: c.rarity } },
        'City':          { rich_text: [{ text: { content: c.city } }] },
        'Description':   { rich_text: [{ text: { content: c.description } }] },
        'Cost':          { select: { name: c.cost } },
        'Duration':      { rich_text: [{ text: { content: c.duration } }] },
        'Duration Mins': { number: c.durationMins },
        'Time':          { select: { name: c.time } },
        'Season':        { rich_text: [{ text: { content: c.season } }] },
        'Spark':         { number: c.spark },
        'Bonus':         { rich_text: [{ text: { content: c.bonus } }] },
        'Maps URL':      c.mapsUrl ? { url: c.mapsUrl } : { url: null },
        'Filter Exempt': { checkbox: false },
        'Active':        { checkbox: true },
      },
    });
    created++; process.stdout.write('*'); await pause();
  }

  console.log(`\n✓ ${d.pack}: ${activated} activated, ${fixed} fixed+activated, ${created} created`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
