#!/usr/bin/env node
/**
 * generate-city.js
 * Uses Claude to generate Poul cards for any city → writes them to Notion.
 * After running, execute export-cards.js to produce the pack JSON.
 *
 * Usage:
 *   node scripts/generate-city.js --city "Paris, France" --pack paris --count 20
 *   node scripts/generate-city.js --city "Oslo, Norway"  --pack oslo  --count 20
 *
 * Env: ANTHROPIC_API_KEY, NOTION_API_KEY (in ../.env)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const Anthropic = require('@anthropic-ai/sdk');
const { Client } = require('@notionhq/client');

const DB_ID      = '68dabc44-f31e-48d9-9dac-2a6d6edb4414';
const CATEGORIES = ['adventure', 'foodie', 'chill', 'social', 'active'];

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

Return ONLY a valid JSON array — no markdown, no commentary, no code fences.

Card schema:
{
  "id": string,          // prefix + category code + number, e.g. "PAR-A-01"
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

// ── Generate ───────────────────────────────────────────────────────────────

async function generateCards(city, pack, count) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prefix    = pack.replace(/-/g, '_').toUpperCase().slice(0, 4);
  const perCat    = Math.ceil(count / CATEGORIES.length);

  const userMsg = `Generate ${count} Poul activity cards for ${city}.

Distribution: ~${perCat} cards per category across adventure, foodie, chill, social, active.
Use rarity mix: ~60% Common, ~30% Rare, ~10% Legendary.
ID prefix: "${prefix}" — e.g. "${prefix}_A_01", "${prefix}_F_01" etc.
City field value: "${city}"

Be hyper-local and specific. Use real venue names, real neighborhoods.
Include a range of price points and times of day.
Make the bonus challenges doable and daring, not vague.`;

  console.log(`Generating ${count} cards for ${city} (pack: ${pack})...`);

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
        'Active':         { checkbox:  true                                   },
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

async function main() {
  const city  = getArg('--city');
  const pack  = getArg('--pack');
  const count = parseInt(getArg('--count') || '20', 10);

  if (!city || !pack) {
    console.error('Usage: node scripts/generate-city.js --city "Paris, France" --pack paris --count 20');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY in .env');
    process.exit(1);
  }
  if (!process.env.NOTION_API_KEY) {
    console.error('Missing NOTION_API_KEY in .env');
    process.exit(1);
  }

  const cards = await generateCards(city, pack, count);
  console.log(`\nGenerated ${cards.length} cards — preview:`);
  cards.slice(0, 3).forEach(c => console.log(`  [${c.category}/${c.rarity}] ${c.title}`));
  console.log(`  ...and ${Math.max(0, cards.length - 3)} more\n`);

  await writeToNotion(cards, pack);

  console.log(`\nNext steps:`);
  console.log(`  1. Review cards in Notion: https://notion.so`);
  console.log(`  2. Deactivate any cards you want to cut (uncheck Active)`);
  console.log(`  3. Run: node scripts/export-cards.js ${pack}`);
  console.log(`  4. Commit packs/${pack}.json and push to GitHub`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
