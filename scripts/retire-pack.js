#!/usr/bin/env node
/**
 * retire-pack.js
 * Soft-retires an entire pack by setting Active=false in Notion for every
 * active card with the given Pack value. Reversible — flip the checkboxes
 * back in Notion (or re-tag cards to another pack) to revive.
 *
 * Built for seasonal/event packs (FIFA, and future big events) that come and
 * go. After running, re-export so index.json drops the pack, then delete the
 * orphan packs/<packId>.json.
 *
 * Usage:
 *   node scripts/retire-pack.js <packId> [--dry-run]
 *
 * Env: NOTION_API_KEY (in ../.env)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const { Client } = require('@notionhq/client');

const DRY_RUN = process.argv.includes('--dry-run');
const PACK_ID = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
const DB_ID   = '68dabc44-f31e-48d9-9dac-2a6d6edb4414';

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

const getTitle = (p) => p.properties['Title']?.title?.[0]?.plain_text || '';

async function main() {
  if (!PACK_ID) {
    console.error('Usage: node scripts/retire-pack.js <packId> [--dry-run]');
    process.exit(1);
  }
  if (!process.env.NOTION_API_KEY) {
    console.error('Missing NOTION_API_KEY');
    process.exit(1);
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });

  console.log(`\n── Retiring pack: ${PACK_ID}${DRY_RUN ? '  (DRY RUN)' : ''} ──`);
  const pages = await queryAll(notion, {
    and: [
      { property: 'Pack',   select:   { equals: PACK_ID } },
      { property: 'Active', checkbox: { equals: true    } },
    ],
  });

  if (!pages.length) {
    console.log('  (no active cards found — nothing to retire)');
    return;
  }

  for (const page of pages) {
    const title = getTitle(page);
    if (DRY_RUN) {
      console.log(`  ~ would deactivate  "${title}"`);
    } else {
      await notion.pages.update({
        page_id: page.id,
        properties: { Active: { checkbox: false } },
      });
      console.log(`  ✓ deactivated  "${title}"`);
    }
  }

  console.log(`\n  ${DRY_RUN ? 'Would deactivate' : 'Deactivated'} ${pages.length} card(s).`);
  if (!DRY_RUN) {
    console.log('\nNext: re-export, delete the orphan packs/' + PACK_ID + '.json, bump the SW cache.');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
