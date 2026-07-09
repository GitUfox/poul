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
  // ── Brussels (3) ──────────────────────────────────────────────────────────
  { pack: 'brussels',    id: 'BRU-F-04',   title: 'Frites from Maison Antoine at Place Jourdan' },
  { pack: 'brussels',    id: 'BRUS-C-01',  title: 'Afternoon at Musée Magritte' },
  { pack: 'brussels',    id: 'BRU-A-03',   title: 'Climb the Atomium and see the whole city' },

  // ── Hamptons (7) ──────────────────────────────────────────────────────────
  { pack: 'hamptons',   id: 'HAMP-S-01',  title: 'Friday Night at The Stephen Talkhouse' },
  { pack: 'hamptons',   id: 'HAM-S-102',  title: 'Surf Lodge Montauk Concert Night' },
  { pack: 'hamptons',   id: 'HAM-S-106',  title: 'Harbor Bar Sag Harbor Waterfront' },
  { pack: 'hamptons',   id: 'HAM-C-102',  title: 'Parrish Art Museum, Water Mill' },
  { pack: 'hamptons',   id: 'HAMP-F-04',  title: "Dinner at Nick & Toni's" },
  { pack: 'hamptons',   id: 'HAMP-F-01',  title: 'Lunch at The Lobster Roll (LUNCH)' },
  { pack: 'hamptons',   id: 'HAM-F-106',  title: 'Wölffer Estate Vineyard Evening' },

  // ── Tokyo (13) ────────────────────────────────────────────────────────────
  { pack: 'tokyo',      id: 'TOKY-AC-01', title: 'Dawn Run Along the Imperial Palace Outer Gardens' },
  { pack: 'tokyo',      id: 'TKY-AC-01',  title: 'Imperial Palace Morning Run' },
  { pack: 'tokyo',      id: 'TOK-F-04',   title: 'Yakitori under the Yurakucho train tracks' },
  { pack: 'tokyo',      id: 'TOK-F-02',   title: 'Tsukiji outer market breakfast: tamagoyaki and tuna nigiri' },
  { pack: 'tokyo',      id: 'TOKY-F-01',  title: 'Ramen at Fuunji, Shinjuku' },
  { pack: 'tokyo',      id: 'TKY-F-05',   title: 'Isetan Shinjuku Depachika Crawl' },
  { pack: 'tokyo',      id: 'TKY-F-03',   title: 'Omakase at a Ginza Sushi Counter' },
  { pack: 'tokyo',      id: 'TOKY-S-02',  title: 'Bar Hop Through Golden Gai, Shinjuku' },
  { pack: 'tokyo',      id: 'TKY-S-02',   title: 'Golden Gai Bar Crawl' },
  { pack: 'tokyo',      id: 'TOK-CH-01',  title: 'Early morning at Senso-ji temple before the crowds' },
  { pack: 'tokyo',      id: 'TKY-C-03',   title: 'Shinjuku Gyoen National Garden' },
  { pack: 'tokyo',      id: 'TKY-C-04',   title: 'Thermae Yu Bathhouse in Shinjuku' },
  { pack: 'tokyo',      id: 'TKY-C-02',   title: 'Senso-ji Temple at Dawn' },

  // ── Bangkok (15) — title matching required for collision cards ─────────────
  { pack: 'bangkok',    id: 'BKK-A-02',   title: 'Sunrise at Wat Arun' },
  { pack: 'bangkok',    id: 'BKK-A-01',   title: 'Long-tail Boat Through the Thonburi Khlongs' },
  { pack: 'bangkok',    id: 'BKK-A-03',   title: 'Motorcycle Taxi Through the Old City Backstreets' },
  { pack: 'bangkok',    id: 'BKK-S-01',   title: 'Muay Thai Fight Night at Rajadamnern Stadium' },
  { pack: 'bangkok',    id: 'BKK-S-04',   title: 'Sunset Cocktails at Sky Bar, Lebua' },
  { pack: 'bangkok',    id: 'BKK-S-03',   title: 'Chatuchak Weekend Market on a Saturday Morning' },
  { pack: 'bangkok',    id: 'BKK-CH-02',  title: 'Thai massage at Wat Pho School, Rattanakosin' },
  { pack: 'bangkok',    id: 'BKK-CH-07',  title: 'Jim Thompson House museum afternoon' },
  { pack: 'bangkok',    id: 'BKK-F-05',   title: 'Street food crawl through Yaowarat after dark' },
  { pack: 'bangkok',    id: 'BANG_F_01',  title: 'Boat Noodles at Bang Pho Floating Market' },
  { pack: 'bangkok',    id: 'BKK-F-06',   title: 'Yaowarat Chinatown Street Food Walk' },
  { pack: 'bangkok',    id: 'BKK-F-03',   title: 'Rot Fai Ratchada Night Market Food Crawl' },
  { pack: 'bangkok',    id: 'BKK-F-02',   title: 'Dinner at Jay Fai' },
  { pack: 'bangkok',    id: 'BANG_AC_02', title: 'Cycle the Bang Krachao Green Lung' },
  { pack: 'bangkok',    id: 'BKK-AC-02',  title: 'Cycling the Bang Krachao Green Lung' },

  // ── Paris (5) ─────────────────────────────────────────────────────────────
  { pack: 'paris',      id: 'PAR-CH-04',  title: 'Père Lachaise at dusk' },
  { pack: 'paris',      id: 'PAR-A-02',   title: 'Eiffel Tower stairs' },
  { pack: 'paris',      id: 'PARI_A_01',  title: 'Catacombs of Paris' },
  { pack: 'paris',      id: 'PARI_AC_03', title: 'Swim at Piscine Joséphine Baker' },
  { pack: 'paris',      id: 'PAR-S-03',   title: 'Apéritif on Canal Saint-Martin' },

  // ── Oslo (3) ──────────────────────────────────────────────────────────────
  { pack: 'oslo',       id: 'OSL-CH-04',  title: 'Wander Vigeland Sculpture Park at dawn' },
  { pack: 'oslo',       id: 'OSL-F-10',   title: 'Dinner at Statholdergaarden, Rådhusgate' },
  { pack: 'oslo',       id: 'OSL-A-01',   title: 'Hike Vettakollen and back before breakfast' },

  // ── Baltimore (6) ─────────────────────────────────────────────────────────
  { pack: 'baltimore',  id: 'BAL-S-105',  title: 'Camden Yards Orioles Game' },
  { pack: 'baltimore',  id: 'BALT-A-04',  title: 'Explore Fort McHenry at Dawn' },
  { pack: 'baltimore',  id: 'BAL-C-103',  title: 'Walters Art Museum — Ancient to Medieval' },
  { pack: 'baltimore',  id: 'BAL-C-107',  title: 'Enoch Pratt Central Library' },
  { pack: 'baltimore',  id: 'BAL-C-105',  title: 'Patterson Park Chinese Pagoda Hill' },
  { pack: 'baltimore',  id: 'BAL-F-102',  title: 'LP Steamers Blue Crab Feast' },

  // ── DC (2) ────────────────────────────────────────────────────────────────
  { pack: 'dc',         id: 'DC-AC-107',  title: 'Rock Creek Park Trail System' },
  { pack: 'dc',         id: 'DC_A_02',    title: 'Kayak the Potomac from Thompson Boat Center' },

  // ── Ocean City (12) ───────────────────────────────────────────────────────
  { pack: 'ocean-city', id: 'OC-S-103',   title: 'Purple Moose Saloon on the Boardwalk' },
  { pack: 'ocean-city', id: 'OCEA_S_01',  title: 'Happy Hour at Seacrets Jamaica USA' },
  { pack: 'ocean-city', id: 'OC-AC-107',  title: 'Assateague Island Marsh Hike' },
  { pack: 'ocean-city', id: 'OCEA_AC_02', title: 'Stand-Up Paddleboard the Isle of Wight Bay' },
  { pack: 'ocean-city', id: 'OCEA_F_02',  title: 'Breakfast Sandwich at Fractured Prune' },
  { pack: 'ocean-city', id: 'OC-F-110',   title: 'All You Can Eat Snow Crab at a Crab Deck' },
  { pack: 'ocean-city', id: 'OC-C-104',   title: 'Sunset from the Inlet Jetty Rocks' },
  { pack: 'ocean-city', id: 'OCEA_C_04',  title: 'Watch Wild Ponies at Assateague State Park' },
  { pack: 'ocean-city', id: 'OCEA_C_01',  title: 'Dawn Walk on the Assateague Island National Seashore' },
  { pack: 'ocean-city', id: 'OC-A-102',   title: 'Parasailing Over the Atlantic' },
  { pack: 'ocean-city', id: 'OC-A-101',   title: 'Deep-Sea Fishing Charter from the Inlet' },
  { pack: 'ocean-city', id: 'OCEA_A_01',  title: 'Surf Lesson at Chauncey\'s Surf School' },
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
