#!/usr/bin/env node
/**
 * seed-cards.js
 * ONE-TIME migration: reads all hardcoded cards from poul-v1.5.html
 * and writes them to the Notion database.
 *
 * Run this once to bootstrap Notion with the existing deck.
 * After seeding, use generate-city.js for all new packs.
 *
 * Usage: node scripts/seed-cards.js [--dry-run]
 *
 * Env: NOTION_API_KEY (in ../.env)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const { Client } = require('@notionhq/client');
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const DB_ID   = '68dabc44-f31e-48d9-9dac-2a6d6edb4414';
const DRY_RUN = process.argv.includes('--dry-run');

// ── Extract hardcoded data from the HTML ───────────────────────────────────

function extractFromHTML() {
  const htmlPath = path.join(__dirname, '..', 'poul-v1.5.html');
  const lines    = fs.readFileSync(htmlPath, 'utf8').split('\n');

  function extractBlock(varName) {
    const startIdx = lines.findIndex(l => l.match(new RegExp(`^(?:let|const|var)\\s+${varName}\\s*=`)));
    if (startIdx === -1) throw new Error(`Could not find ${varName} in HTML`);

    // Walk forward counting braces to find the end of the object literal
    let depth = 0, endIdx = startIdx;
    for (let i = startIdx; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
      }
      if (depth === 0 && i > startIdx) break;
    }

    // Replace let/const with var so the declaration binds to the sandbox context
    const block = lines.slice(startIdx, endIdx + 1).join('\n')
      .replace(/^(?:let|const)\s+/, 'var ');
    const sandbox = {};
    vm.runInNewContext(block, sandbox);
    return sandbox[varName];
  }

  const CARDS        = extractBlock('CARDS');
  const TRAVEL_PACKS = extractBlock('TRAVEL_PACKS');

  if (!CARDS)        throw new Error('Could not extract CARDS from HTML');
  if (!TRAVEL_PACKS) throw new Error('Could not extract TRAVEL_PACKS from HTML');

  return { CARDS, TRAVEL_PACKS };
}

// ── Notion page builder ────────────────────────────────────────────────────

function buildProps(card, packId, category) {
  return {
    'Title':         { title:     [{ text: { content: card.title || ''       } }] },
    'Card ID':       { rich_text: [{ text: { content: card.id    || ''       } }] },
    'Pack':          { select:    { name: packId                               } },
    'Category':      { select:    { name: category                            } },
    'Rarity':        { select:    { name: card.rarity  || 'Common'            } },
    'City':          { rich_text: [{ text: { content: card.city || ''        } }] },
    'Description':   { rich_text: [{ text: { content: card.description || '' } }] },
    'Cost':          { select:    { name: card.cost    || '$'                 } },
    'Duration':      { rich_text: [{ text: { content: card.duration || ''    } }] },
    'Duration Mins': { number:    card.durationMins || 60                       },
    'Time':          { select:    { name: card.time   || 'Any'                } },
    'Season':        { rich_text: [{ text: { content: card.season || 'Year Round' } }] },
    'Spark':         { number:    card.spark || 15                              },
    'Bonus':         { rich_text: [{ text: { content: card.bonus || ''       } }] },
    'Maps URL':      card.mapsUrl ? { url: card.mapsUrl } : { url: null         },
    'Filter Exempt': { checkbox:  card.filterExempt || false                   },
    'Active':        { checkbox:  true                                          },
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.NOTION_API_KEY) {
    console.error('Missing NOTION_API_KEY in .env');
    process.exit(1);
  }

  console.log('Extracting cards from poul-v1.5.html...');
  const { CARDS, TRAVEL_PACKS } = extractFromHTML();

  // Collect all (packId, category, card) triples
  const allCards = [];

  // Phoenix pack — CARDS object
  for (const [category, cards] of Object.entries(CARDS)) {
    for (const card of cards) {
      allCards.push({ packId: 'phoenix', category, card });
    }
  }

  // Travel packs
  for (const [packId, pack] of Object.entries(TRAVEL_PACKS)) {
    for (const [category, cards] of Object.entries(pack.cards || {})) {
      for (const card of cards) {
        allCards.push({ packId, category, card });
      }
    }
  }

  console.log(`Found ${allCards.length} cards total`);
  if (DRY_RUN) {
    console.log('[dry-run] Would write:');
    allCards.forEach(({ packId, category, card }) =>
      console.log(`  [${packId}/${category}] ${card.id} — ${card.title}`));
    return;
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  let written = 0;

  for (const { packId, category, card } of allCards) {
    await notion.pages.create({
      parent:     { database_id: DB_ID },
      properties: buildProps(card, packId, category),
    });
    process.stdout.write('.');
    written++;
    // Notion rate limit: ~3 req/s
    await new Promise(r => setTimeout(r, 340));
  }

  console.log(`\n✓ Seeded ${written} cards to Notion`);
  console.log('\nNext: node scripts/export-cards.js');
}

main().catch(e => { console.error(e.message); process.exit(1); });
