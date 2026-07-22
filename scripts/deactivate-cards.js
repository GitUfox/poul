#!/usr/bin/env node
/**
 * deactivate-cards.js
 * Sets Active=false in Notion for duplicate/removed cards.
 * Uses title matching for disambiguation when multiple pages share the same Card ID.
 *
 * Usage: node scripts/deactivate-cards.js [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const { Client } = require('@notionhq/client');

const DRY_RUN = process.argv.includes('--dry-run');
const DB_ID   = '68dabc44-f31e-48d9-9dac-2a6d6edb4414';

// Cards to deactivate: { pack, id, title } where title is used for disambiguation
// when two Notion pages share the same Card ID (Bangkok collision cases).
const TARGETS = [
  // ── 2026-07-21 batch 2: istanbul zombies — culled locally in 7facaa4 but never
  // deactivated in Notion, so the full-pack sync resurrected them. This makes the
  // cull permanent. (Batch 1, the 12-card audit, ran earlier today — see 7f389e4.)
  { pack: 'istanbul', id: 'IST-CH-02',  title: 'Hammam session at Çemberlitaş Hamamı' },
  { pack: 'istanbul', id: 'IST-CH-08',  title: 'Sunset at Eyüp Sultan Hill with tea' },
  { pack: 'istanbul', id: 'ISTA-C-04',  title: 'Afternoon at Karaköy Güllüoğlu with Baklava' },
  { pack: 'istanbul', id: 'ISTA-A-04',  title: 'Underground Cistern Spelunking at Basilica Cistern' },
  { pack: 'istanbul', id: 'IST-F-04',   title: 'Fresh balık ekmek on the Galata Bridge' },
  { pack: 'istanbul', id: 'ISTA-F-04',  title: 'Kokoreç at Şaşkınbakkal Market, Kadıköy' },
  { pack: 'istanbul', id: 'IST-AC-01',  title: 'Run the Bosphorus Bridge path at dawn' },
];

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

function getTitle(page) {
  return page.properties['Title']?.title?.[0]?.plain_text || '';
}

function getCardId(page) {
  return page.properties['Card ID']?.rich_text?.[0]?.plain_text || '';
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.NOTION_API_KEY) {
    console.error('Missing NOTION_API_KEY');
    process.exit(1);
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const results = { ok: [], notFound: [], ambiguous: [] };

  // Process pack-by-pack to minimize API calls
  const byPack = {};
  for (const t of TARGETS) {
    (byPack[t.pack] = byPack[t.pack] || []).push(t);
  }

  for (const [pack, targets] of Object.entries(byPack)) {
    console.log(`\n── ${pack} (${targets.length} targets) ──`);

    // Fetch all active cards for this pack in one query
    const pages = await queryAll(notion, {
      and: [
        { property: 'Pack',   select:   { equals: pack } },
        { property: 'Active', checkbox: { equals: true  } },
      ],
    });

    for (const target of targets) {
      // Find pages matching this card ID
      const byId = pages.filter(p => getCardId(p) === target.id);

      let match;
      if (byId.length === 0) {
        console.log(`  ✗ NOT FOUND   [${target.id}] "${target.title}"`);
        results.notFound.push(target);
        continue;
      } else if (byId.length === 1) {
        match = byId[0];
      } else {
        // Disambiguation by title (collision cards)
        const byTitle = byId.filter(p => getTitle(p) === target.title);
        if (byTitle.length === 1) {
          match = byTitle[0];
        } else {
          console.log(`  ⚠ AMBIGUOUS   [${target.id}] — ${byId.length} pages share this ID`);
          byId.forEach(p => console.log(`       "${getTitle(p)}" (${p.id})`));
          results.ambiguous.push(target);
          continue;
        }
      }

      // Deactivate
      const pageTitle = getTitle(match);
      if (DRY_RUN) {
        console.log(`  ~ DRY RUN     [${target.id}] "${pageTitle}"`);
        results.ok.push({ ...target, pageId: match.id });
      } else {
        await notion.pages.update({
          page_id: match.id,
          properties: { Active: { checkbox: false } },
        });
        console.log(`  ✓ deactivated [${target.id}] "${pageTitle}"`);
        results.ok.push({ ...target, pageId: match.id });
      }
    }
  }

  console.log('\n── Summary ──────────────────────────────────────');
  console.log(`  ✓ ${results.ok.length} deactivated`);
  if (results.notFound.length) {
    console.log(`  ✗ ${results.notFound.length} not found:`);
    results.notFound.forEach(t => console.log(`      [${t.pack}] ${t.id} — "${t.title}"`));
  }
  if (results.ambiguous.length) {
    console.log(`  ⚠ ${results.ambiguous.length} ambiguous (title mismatch or extra copies):`);
    results.ambiguous.forEach(t => console.log(`      [${t.pack}] ${t.id} — "${t.title}"`));
  }

  if (!DRY_RUN && results.ok.length > 0) {
    console.log('\nDone. Now run: node scripts/export-cards.js to regenerate the packs.');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
