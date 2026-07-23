#!/usr/bin/env node
/**
 * generate-city.js
 * Uses Claude to generate Poul cards for any city → writes them to Notion.
 * After running, execute export-cards.js to produce the pack JSON.
 *
 * Fresh pack:
 *   node generate-city.js --city "Los Angeles, CA" --pack los-angeles --prefix LAX --count 60
 *
 * Top up an existing pack to 60 active cards (reads packs/<pack>.json,
 * avoids duplicate venues, balances categories, continues ID numbering):
 *   node generate-city.js --city "Oslo, Norway" --pack oslo --top-up
 *   node generate-city.js --city "Oslo, Norway" --pack oslo --top-up --target 60 --prefix OSL
 *
 * Flags:
 *   --city     "City, Region"  (required)
 *   --pack     pack id          (required)
 *   --prefix   card ID prefix — use airport codes (LAX, ORD, SAT…).
 *              Required for new packs; top-up derives it from existing IDs if omitted.
 *   --count    total cards, fresh mode only (default 20)
 *   --target   top-up mode: target total cards for the pack (default 60)
 *   --dry-run  generate + print, skip the Notion write
 *
 * All cards are written with Active=false — review in Notion before export.
 *
 * Env: ANTHROPIC_API_KEY, NOTION_API_KEY (in ../.env)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { Client } = require('@notionhq/client');

const DB_ID      = '68dabc44-f31e-48d9-9dac-2a6d6edb4414';
const CATEGORIES = ['adventure', 'foodie', 'chill', 'social', 'active'];
const CAT_CODE   = { adventure: 'A', foodie: 'F', chill: 'C', social: 'S', active: 'AC' };
const BATCH_SIZE = 20;   // cards per API call — keeps output well inside max_tokens
const PACKS_DIR  = path.join(__dirname, '..', 'packs');

// ── Prompt ─────────────────────────────────────────────────────────────────

const SYSTEM = `You are a travel editor for Poul — a spontaneous activity lottery app.
Your job is to write activity cards for specific cities. Each card represents a real experience
a local or savvy traveler would genuinely do.

Card rules:
- Titles: specific real place names, not generic ("Dinner at Septime", not "Try a nice restaurant")
- Descriptions: one confident sentence in present tense that sells the experience
- Bonus: a micro-dare that adds stakes — something you can actually do at this activity
- Voice: cool, direct, never touristy, never hedging
- Rarity: Common = everyday good, Rare = memorable, Legendary = once-in-a-trip
- Spark: Common=15, Rare=25, Legendary=40
- Season: use specific months when seasonal (e.g. "Apr–Oct"), otherwise "Year Round"
- Maps URL: a valid Google Maps search URL for the specific venue
- Longevity: strongly prefer venues established 20+ years (institutions, historic cafes, museums, parks,
  long-standing restaurants). Newer spots are OK when genuinely exceptional but should be no more than
  30% of cards. Public parks, trails, and cultural institutions are always preferred over trendy new venues.

Return ONLY a valid JSON array — no markdown, no commentary, no code fences.

Card schema:
{
  "id": string,          // placeholder is fine — IDs are reassigned by the pipeline
  "title": string,
  "description": string,
  "category": string,    // adventure | foodie | chill | social | active
  "rarity": string,      // Common | Rare | Legendary
  "cost": string,        // $ | $$ | $$$
  "duration": string,    // e.g. "2–3 hrs"
  "durationMins": number,
  "time": string,        // Morning | Afternoon | Evening | Any
  "season": string,
  "spark": number,
  "bonus": string,
  "city": string,        // e.g. "Paris, France"
  "mapsUrl": string
}`;

// ── Existing-pack analysis (top-up mode) ───────────────────────────────────

function loadPack(pack) {
  const file = path.join(PACKS_DIR, `${pack}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeTitle(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function packStats(packJson) {
  const titles = [];
  const catCounts = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  let maxNum = 0;
  const prefixTally = {};

  for (const [cat, list] of Object.entries(packJson.cards || {})) {
    for (const card of list) {
      titles.push(card.title);
      if (cat in catCounts) catCounts[cat]++;
      const nums = String(card.id).match(/\d+/g);
      if (nums) maxNum = Math.max(maxNum, ...nums.map(Number));
      const m = String(card.id).match(/^([A-Za-z0-9]+)[-_]/);
      if (m) prefixTally[m[1].toUpperCase()] = (prefixTally[m[1].toUpperCase()] || 0) + 1;
    }
  }
  const prefixGuess = Object.entries(prefixTally).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { titles, catCounts, maxNum, prefixGuess };
}

function computeGaps(catCounts, target) {
  const perCat = Math.ceil(target / CATEGORIES.length);
  const gaps = {};
  for (const cat of CATEGORIES) {
    const gap = perCat - (catCounts[cat] || 0);
    if (gap > 0) gaps[cat] = gap;
  }
  return gaps;
}

// Split per-category counts into batches of ≤ BATCH_SIZE cards
function allocateBatches(counts) {
  const remaining = { ...counts };
  const batches = [];
  while (Object.values(remaining).some(n => n > 0)) {
    const batch = {};
    let room = BATCH_SIZE;
    for (const cat of CATEGORIES) {
      if (!remaining[cat] || room === 0) continue;
      const take = Math.min(remaining[cat], Math.max(1, Math.floor(room / CATEGORIES.length)), room);
      batch[cat] = take;
      remaining[cat] -= take;
      room -= take;
    }
    // top the batch off with whatever still remains
    for (const cat of CATEGORIES) {
      if (!remaining[cat] || room === 0) continue;
      const take = Math.min(remaining[cat], room);
      batch[cat] = (batch[cat] || 0) + take;
      remaining[cat] -= take;
      room -= take;
    }
    batches.push(batch);
  }
  return batches;
}

// ── Generate ───────────────────────────────────────────────────────────────

async function generateBatch(anthropic, { city, counts, avoidTitles }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const breakdown = Object.entries(counts).map(([c, n]) => `${n} ${c}`).join(', ');

  let userMsg = `Generate exactly ${total} Poul activity cards for ${city}.

Category breakdown (exact counts, no more no less): ${breakdown}.
Use rarity mix: ~60% Common, ~30% Rare, ~10% Legendary.
City field value: "${city}"

Be hyper-local and specific. Use real venue names, real neighborhoods.
Include a range of price points and times of day.
Make the bonus challenges doable and daring, not vague.`;

  if (avoidTitles.length) {
    userMsg += `

This pack already contains the following cards. Do NOT duplicate these venues or
activities — no repeats, no near-duplicates of the same place under a different name:
${avoidTitles.map(t => `- ${t}`).join('\n')}`;
  }

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  });

  const text  = msg.content[0].text.trim();
  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']') + 1;
  if (start === -1) throw new Error('No JSON array found in Claude response:\n' + text.slice(0, 200));
  return JSON.parse(text.slice(start, end));
}

// Model occasionally emits malformed JSON — retry the batch rather than losing the run
async function generateBatchWithRetry(anthropic, opts, attempts = 3) {
  for (let a = 1; ; a++) {
    try {
      return await generateBatch(anthropic, opts);
    } catch (e) {
      if (a >= attempts) throw e;
      console.log(`  ⚠ batch failed (${e.message.slice(0, 80)}) — retrying (${a}/${attempts - 1})...`);
    }
  }
}

// ── ID assignment (script-side — never trust generated IDs) ────────────────

function makeIdAssigner(prefix, seriesStart) {
  const counters = {};
  return (card) => {
    const code = CAT_CODE[card.category] || 'X';
    counters[code] = (counters[code] || seriesStart) ;
    const id = `${prefix}-${code}-${counters[code]}`;
    counters[code]++;
    return id;
  };
}

// ── Write to Notion ────────────────────────────────────────────────────────

async function writeToNotion(cards, packId) {
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  console.log(`Writing ${cards.length} cards to Notion...`);

  for (const c of cards) {
    await notion.pages.create({
      parent: { database_id: DB_ID },
      properties: {
        'Title':          { title:     [{ text: { content: c.title        } }] },
        'Card ID':        { rich_text: [{ text: { content: c.id           } }] },
        'Pack':           { select:    { name: packId                        } },
        'Category':       { select:    { name: c.category                   } },
        'Rarity':         { select:    { name: c.rarity                     } },
        'City':           { rich_text: [{ text: { content: c.city          } }] },
        'Description':    { rich_text: [{ text: { content: c.description   } }] },
        'Cost':           { select:    { name: c.cost                       } },
        'Duration':       { rich_text: [{ text: { content: c.duration      } }] },
        'Duration Mins':  { number:    c.durationMins                         },
        'Time':           { select:    { name: c.time                       } },
        'Season':         { rich_text: [{ text: { content: c.season        } }] },
        'Spark':          { number:    c.spark                                },
        'Bonus':          { rich_text: [{ text: { content: c.bonus         } }] },
        'Maps URL':       c.mapsUrl ? { url: c.mapsUrl } : { url: null       },
        'Filter Exempt':  { checkbox:  false                                  },
        'Active':         { checkbox:  false                                  },
      },
    });
    process.stdout.write('.');
    // Brief pause to avoid Notion rate limits
    await new Promise(r => setTimeout(r, 350));
  }
  console.log(`\n✓ ${cards.length} cards written to Notion`);
}

// ── CLI ────────────────────────────────────────────────────────────────────

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function main() {
  const city   = getArg('--city');
  const pack   = getArg('--pack');
  const topUp  = hasFlag('--top-up');
  const dryRun = hasFlag('--dry-run');
  const target = parseInt(getArg('--target') || '60', 10);
  const count  = parseInt(getArg('--count') || '20', 10);
  let   prefix = getArg('--prefix');

  if (!city || !pack) {
    console.error('Usage (fresh):  node generate-city.js --city "Los Angeles, CA" --pack los-angeles --prefix LAX --count 60');
    console.error('Usage (top-up): node generate-city.js --city "Oslo, Norway" --pack oslo --top-up [--target 60]');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY in .env');
    process.exit(1);
  }
  if (!dryRun && !process.env.NOTION_API_KEY) {
    console.error('Missing NOTION_API_KEY in .env');
    process.exit(1);
  }

  // ── Work out what to generate ──
  let counts, avoidTitles = [], seriesStart = 1;

  if (topUp) {
    const packJson = loadPack(pack);
    if (!packJson) {
      console.error(`--top-up: packs/${pack}.json not found. Run export-cards.js first, or drop --top-up for a fresh pack.`);
      process.exit(1);
    }
    const stats = packStats(packJson);
    avoidTitles = stats.titles;
    counts      = computeGaps(stats.catCounts, target);
    seriesStart = (Math.floor(stats.maxNum / 100) + 1) * 100 + 1;   // 402 → 501, 18 → 101
    prefix      = (prefix || stats.prefixGuess || pack.replace(/-/g, '_').toUpperCase().slice(0, 4)).toUpperCase();

    const totalGap = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalGap === 0) {
      console.log(`✓ ${pack} already has ≥${Math.ceil(target / CATEGORIES.length)} cards in every category — nothing to do.`);
      return;
    }
    console.log(`Top-up ${pack}: ${stats.titles.length} existing cards → target ${target}`);
    console.log(`  Gaps: ${Object.entries(counts).map(([c, n]) => `${c}+${n}`).join('  ')}`);
    console.log(`  Prefix: ${prefix}   ID series starts at: ${seriesStart}`);
  } else {
    if (!prefix) {
      console.error('--prefix is required for new packs (use the airport code: LAX, ORD, SAT…).');
      console.error('This prevents ID collisions — san-antonio/san-diego/san-jose would all auto-derive to "SAN".');
      process.exit(1);
    }
    prefix = prefix.toUpperCase();
    // even split across the 5 categories
    counts = {};
    const base = Math.floor(count / CATEGORIES.length);
    let extra  = count % CATEGORIES.length;
    for (const cat of CATEGORIES) counts[cat] = base + (extra-- > 0 ? 1 : 0);
    console.log(`Fresh pack ${pack}: ${count} cards, prefix ${prefix}`);
  }

  // ── Generate in batches, growing the avoid list as we go ──
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const batches   = allocateBatches(counts);
  const seen      = new Set(avoidTitles.map(normalizeTitle));
  const assignId  = makeIdAssigner(prefix, seriesStart);
  const allCards  = [];

  for (let i = 0; i < batches.length; i++) {
    const batchTotal = Object.values(batches[i]).reduce((a, b) => a + b, 0);
    console.log(`\nBatch ${i + 1}/${batches.length} (${batchTotal} cards) — generating...`);
    const cards = await generateBatchWithRetry(anthropic, {
      city,
      counts: batches[i],
      avoidTitles: [...avoidTitles, ...allCards.map(c => c.title)],
    });

    for (const c of cards) {
      if (!CATEGORIES.includes(c.category)) {
        console.log(`  ⚠ dropped (bad category "${c.category}"): ${c.title}`);
        continue;
      }
      const key = normalizeTitle(c.title);
      if (seen.has(key)) {
        console.log(`  ⚠ dropped duplicate: ${c.title}`);
        continue;
      }
      seen.add(key);
      c.id = assignId(c);
      allCards.push(c);
    }
  }

  console.log(`\nGenerated ${allCards.length} unique cards — preview:`);
  allCards.slice(0, 5).forEach(c => console.log(`  [${c.id} ${c.category}/${c.rarity}] ${c.title}`));
  if (allCards.length > 5) console.log(`  ...and ${allCards.length - 5} more`);

  if (dryRun) {
    console.log('\n--dry-run: skipping Notion write. Full output:');
    console.log(JSON.stringify(allCards, null, 2));
    return;
  }

  await writeToNotion(allCards, pack);

  console.log(`\nNext steps:`);
  console.log(`  1. Review cards in Notion: https://notion.so`);
  console.log(`  2. Activate the keepers (check Active)`);
  console.log(`  3. Run: node export-cards.js ${pack}`);
  console.log(`  4. Commit packs/${pack}.json and push to GitHub`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
