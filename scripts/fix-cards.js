#!/usr/bin/env node
/**
 * fix-cards.js
 * Applies field-level fixes to cards in Notion: Maps URLs pointing at generic
 * searches instead of the titled venue, descriptions written for a different
 * card, typos, and stale facts. Also stamps Comments on deactivated cards so
 * the audit trail lives in the database.
 *
 * mapsQuery is a plain-text place query; the script builds the canonical
 * https://www.google.com/maps/search/?api=1&query=… URL from it.
 *
 * Usage: node scripts/fix-cards.js [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const { Client } = require('@notionhq/client');

const DRY_RUN = process.argv.includes('--dry-run');
const DB_ID   = '68dabc44-f31e-48d9-9dac-2a6d6edb4414';

// { pack, id, match: <current title, for disambiguation>, set: { title?, description?, mapsQuery?, comments? } }
const FIXES = [
  // ── Paris — retitle-only cards from 45074ef: URL + description now match the venue ──
  { pack: 'paris', id: 'PAR-CH-02', match: 'Early morning at the Musée d\'Orsay', set: {
    description: 'The Impressionist collection on the top floor at 9:31am, before any group tours arrive — you and the Monets in a converted train station with almost nobody else.' } },
  { pack: 'paris', id: 'PAR-CH-03', match: 'Espresso at Café Procope, Saint-Germain-des-Prés', set: {
    description: 'Café Procope has poured coffee since 1686 — Voltaire ran a tab here. Order a café crème, take the chair facing Rue de l\'Ancienne Comédie, and don\'t look at your phone for an hour.',
    mapsQuery: 'Café Procope Paris' } },
  { pack: 'paris', id: 'PAR-F-01', match: 'Croissant at Du Pain et des Idées, Canal Saint-Martin', set: {
    description: 'Christophe Vasseur\'s 1889-vintage boulangerie near Canal Saint-Martin bakes the most argued-about croissant in Paris — go on a weekday morning, add a pain des amis, and eat both on the canal.',
    mapsQuery: 'Du Pain et des Idées Paris' } },
  { pack: 'paris', id: 'PAR-F-02', match: 'Steak-frites at Bistrot Paul Bert, 11th', set: {
    mapsQuery: 'Bistrot Paul Bert Paris' } },
  { pack: 'paris', id: 'PAR-F-03', match: 'Natural wine at La Cave de Belleville', set: {
    description: 'The Belleville cave à manger pours minimal-intervention wines by the glass with serious charcuterie boards — taste five things you\'ve never heard of and be changed.',
    mapsQuery: 'La Cave de Belleville Paris' } },
  { pack: 'paris', id: 'PAR-F-04', match: 'French onion soup at Au Pied de Cochon, Les Halles', set: {
    mapsQuery: 'Au Pied de Cochon Paris' } },
  { pack: 'paris', id: 'PAR-F-05', match: 'Pâtisserie at Jacques Genin, Le Marais', set: {
    description: 'Jacques Genin\'s Rue de Turenne salon is the Marais\'s most serious sweet stop — mango-passion caramels, sculptural fruit jellies, and a Paris-Brest assembled when you order it.',
    mapsQuery: 'Jacques Genin Paris' } },
  { pack: 'paris', id: 'PAR-F-07', match: 'Ramen at Kodawari Ramen, Rue Monsieur-le-Prince', set: {
    description: 'The original Kodawari counter on Rue Monsieur-le-Prince recreates a Tokyo yokocho down to the soundtrack — the line down the street knows exactly what it\'s waiting for.',
    mapsQuery: 'Kodawari Ramen Rue Monsieur-le-Prince Paris' } },
  { pack: 'paris', id: 'PAR-F-08', match: 'Crêpes at Breizh Café, Le Marais', set: {
    description: 'Cancale butter, buckwheat galettes, and a proper Breton cider list — Breizh Café\'s Marais dining room is the standing argument that a crêpe is cuisine, not street food.',
    mapsQuery: 'Breizh Café Le Marais Paris' } },
  { pack: 'paris', id: 'PAR-F-09', match: 'Lunch at Frenchie, Rue du Nil, 2nd', set: {
    description: 'Grégory Marchand\'s Rue du Nil flagship anchors Paris\'s bistronomie movement — serious cooking at lunch prices; book ahead and give the afternoon to it.',
    mapsQuery: 'Frenchie Rue du Nil Paris' } },
  { pack: 'paris', id: 'PAR-F-10', match: 'Tasting menu at Guy Savoy, Monnaie de Paris', set: {
    description: 'Guy Savoy\'s dining room inside the Monnaie de Paris looks over the Seine — the artichoke and black truffle soup with brioche has anchored the menu for decades. Give the table the evening.',
    mapsQuery: 'Guy Savoy Monnaie de Paris' } },
  { pack: 'paris', id: 'PAR-A-06', match: 'Rooftop drinks at Le Perchoir Ménilmontant', set: {
    description: 'Seven floors above the 11th, Le Perchoir\'s original rooftop pours cocktails with a 360° sweep from Sacré-Cœur to the Eiffel Tower — arrive before golden hour or expect the queue.',
    mapsQuery: 'Le Perchoir Ménilmontant Paris' } },
  { pack: 'paris', id: 'PAR-S-02', match: 'Jazz at New Morning, Rue des Petites-Écuries', set: {
    description: 'The bare-brick hall on Rue des Petites-Écuries has hosted Chet Baker, Prince, and every serious jazz act passing through Paris since 1981 — check the bill, buy the ticket, stand close.',
    mapsQuery: 'New Morning Paris' } },
  { pack: 'paris', id: 'PAR-S-05', match: 'Cocktails at Terrass Hotel rooftop, Montmartre', set: {
    mapsQuery: 'Terrass Hotel Paris' } },
  { pack: 'paris', id: 'PAR-S-07', match: 'Film at Le Grand Rex, Grands Boulevards', set: {
    mapsQuery: 'Le Grand Rex Paris' } },
  // ── Paris — factual repairs ──
  { pack: 'paris', id: 'PAR-AC-02', match: 'Rollerblade the Sunday Coulée Verte path', set: {
    title: 'Walk the Coulée Verte from Bastille to Vincennes',
    description: 'The elevated Coulée Verte René-Dumont — the 1993 planted walkway that inspired New York\'s High Line — runs 4.5km from Bastille toward the Bois de Vincennes at treetop level.',
    mapsQuery: 'Coulée verte René-Dumont Paris' } },
  { pack: 'paris', id: 'PAR-AC-07', match: 'Climb at Block\'Out bouldering gym', set: {
    description: 'Paris bouldering is quietly serious — Block\'Out Saint-Ouen, just past the Périphérique, sets 1,200m² of modern problems weekly and keeps a terrace for recovery beers.',
    mapsQuery: 'Block\'Out Paris Saint-Ouen' } },
  { pack: 'paris', id: 'PAR-AC-08', match: 'Cycle to Versailles on the Greenway', set: {
    title: 'Cycle to Versailles on La Véloscénie',
    description: 'The first leg of La Véloscénie greenway links Paris to Versailles on mostly traffic-free paths through the Meudon woods — a half-day out-and-back ending at the palace gates.',
    mapsQuery: 'Château de Versailles' } },

  // ── Oslo — retitle-only + factual repairs ──
  { pack: 'oslo', id: 'OSL-CH-03', match: 'Midnight sun from Ekeberg Hill (summer)', set: {
    title: 'Midsummer light from Ekeberg Hill',
    description: 'Oslo\'s June sky never goes properly dark — hike up Ekeberg with a thermos near midnight and watch the fjord hold a glow that passes for daylight.',
    mapsQuery: 'Ekebergparken Oslo' } },
  { pack: 'oslo', id: 'OSL-CH-08', match: 'Fjord kayak near Byg døy peninsula', set: {
    title: 'Fjord kayak off the Bygdøy peninsula',
    description: 'The Bygdøy peninsula has calm fjord water with museum ships, royal estates, and forested shoreline — kayak rentals give you a 2-hour window in one of the world\'s most beautiful urban waterways.',
    mapsQuery: 'Bygdøy peninsula Oslo' } },
  { pack: 'oslo', id: 'OSL-A-05', match: 'Kayak around Oscarborg Fortress at dusk', set: {
    title: 'Kayak around Oscarsborg Fortress at dusk',
    description: 'The 19th-century island fortress in the Oslofjord that sank the cruiser Blücher in 1940 is reached only by water — paddle its walls at golden hour from Drøbak.',
    mapsQuery: 'Oscarsborg Fortress Norway' } },
  { pack: 'oslo', id: 'OSL-S-01', match: 'Bar hop starting at Crowbar, Torggata', set: {
    mapsQuery: 'Crowbar Torggata Oslo' } },
  { pack: 'oslo', id: 'OSL-F-02', match: 'Cinnamon roll at Åpent Bakeri, Grünerløkka', set: {
    title: 'Cinnamon roll at Åpent Bakeri',
    description: 'The Norwegian kanelbolle is thicker and more cardamom-forward than its Swedish cousin — Åpent Bakeri\'s version sells out by mid-afternoon for a reason.',
    mapsQuery: 'Åpent Bakeri Oslo' } },
  { pack: 'oslo', id: 'OSL-F-03', match: 'Tasting menu at Kontrast, Vulkan', set: {
    description: 'Kontrast\'s Michelin-starred kitchen at Vulkan turns foraged, fermented, and preserved Norwegian produce into one of the most distinctive tasting menus in the Nordics — surrender the evening.',
    mapsQuery: 'Kontrast Restaurant Oslo' } },
  { pack: 'oslo', id: 'OSL-F-05', match: 'Craft beer at Schouskjelleren Mikrobryggeri, Grünerløkka', set: {
    description: 'The vaulted brick cellar of the 1820s Schous brewery pours house-brewed ales metres from the tanks — candlelit, loud, and the most atmospheric pint in Oslo.',
    mapsQuery: 'Schouskjelleren Mikrobryggeri Oslo' } },
  { pack: 'oslo', id: 'OSL-F-06', match: 'Norwegian fish at Lofoten Fiskerestaurant, Aker Brygge', set: {
    description: 'Aker Brygge\'s harbourside fish house treats Norwegian cod — dried, salted, or straight off the boat — with the respect the national dish deserves; book the terrace at sunset.',
    mapsQuery: 'Lofoten Fiskerestaurant Oslo' } },
  { pack: 'oslo', id: 'OSL-F-07', match: 'Reindeer steak at Engebret Café, Bankplassen', set: {
    mapsQuery: 'Engebret Café Oslo' } },
  { pack: 'oslo', id: 'OSL-F-08', match: 'Waffles at Kaffistova, Rosenkrantz gate', set: {
    description: 'Kaffistova has served heart-shaped waffles with rømme and jam in the same Rosenkrantz gate dining room since 1901 — traditional Norwegian comfort food with zero irony.',
    mapsQuery: 'Kaffistova Oslo' } },
  { pack: 'oslo', id: 'OSL-F-09', match: 'Aquavit tasting at Himkok, Stortingsgata', set: {
    title: 'Aquavit tasting at Himkok, Storgata',
    description: 'Behind an unmarked Storgata door, Himkok distils its own aquavit and gin on site and is a fixture on the World\'s 50 Best Bars list — order the aquavit flight.',
    mapsQuery: 'Himkok Oslo' } },

  // ── DC ──
  { pack: 'dc', id: 'DC-S-105', match: 'Kramerbooks Late Night, Dupont', set: {
    title: 'Kramers Late Night, Dupont',
    mapsQuery: 'Kramers 1517 Connecticut Ave Washington DC' } },
  { pack: 'dc', id: 'DC_AC_03', match: 'Climb at Earth Treks Crystal City', set: {
    title: 'Climb at Movement Crystal City',
    description: 'Movement Crystal City — opened by Earth Treks as the largest climbing gym in the country — runs walls up to 50 feet with routes that humble anyone.',
    mapsQuery: 'Movement Crystal City Arlington Virginia' } },

  // ── Baltimore ──
  { pack: 'baltimore', id: 'BALT-A-03', match: 'Climb at Earth Treks Rockville — Baltimore\'s Home Wall', set: {
    title: 'Climb at Movement Timonium — Baltimore\'s Home Wall',
    description: 'Baltimore climbers have cut their teeth on these walls since 2002, when it opened as Earth Treks — now Movement, still the region\'s proving ground.',
    mapsQuery: 'Movement Timonium Maryland' } },

  // ── Audit-trail comments on the 12 cards deactivated 2026-07-21 ──
  { pack: 'paris', id: 'PAR-A-03', match: 'Kayak the Seine from Île Saint-Louis', set: {
    comments: 'Deactivated 2026-07-21: paddling the central Seine is prohibited (navigation channel) — activity not bookable.' } },
  { pack: 'paris', id: 'PAR-CH-05', match: 'Two hours in Shakespeare and Company bookshop', set: {
    comments: 'Deactivated 2026-07-21: same venue as PAR-S-04 (Shakespeare and Company Sunday readings).' } },
  { pack: 'oslo', id: 'OSL-CH-06', match: 'Viking Ship Museum at Byg døy', set: {
    comments: 'Deactivated 2026-07-21: closed for rebuild; reopens ~2027 as Museum of the Viking Age — reactivate with new name then.' } },
  { pack: 'oslo', id: 'OSLO_F_03', match: 'Saturday Market at Mathallen Oslo', set: {
    comments: 'Deactivated 2026-07-21: same venue as OSL-S-06 (Mathallen).' } },
  { pack: 'oslo', id: 'OSL-F-01', match: 'Lunch at Engebret Café, Bankplassen', set: {
    comments: 'Deactivated 2026-07-21: same venue as OSL-F-07 (Engebret Café reindeer).' } },
  { pack: 'oslo', id: 'OSL-AC-03', match: 'Swim at Sørenga Seawater Pool in the Oslo Fjord', set: {
    comments: 'Deactivated 2026-07-21: third Sørenga card — kept sauna (OSL-S-02) and cliff jump (OSLO_A_04).' } },
  { pack: 'oslo', id: 'OSL-F-04', match: 'Fish soup at the Aker Brygge fish market', set: {
    comments: 'Deactivated 2026-07-21: no fish market at Aker Brygge; Fiskeriet is at Youngstorget (OSLO_F_01).' } },
  { pack: 'ocean-city', id: 'OC-A-104', match: 'Whale Watch Cruise — Ocean City Offshore', set: {
    comments: 'Deactivated 2026-07-21: no established whale-watch operator out of Ocean City.' } },
  { pack: 'ocean-city', id: 'OCEA_F_03', match: 'Raw Bar at Hooper\'s Crab House', set: {
    comments: 'Deactivated 2026-07-21: same venue as OC-F-107 (Hooper\'s).' } },
  { pack: 'ocean-city', id: 'OCEA_F_04', match: 'Dinner at the Lighthouse Club Hotel Restaurant', set: {
    comments: 'Deactivated 2026-07-21: same venue as OC-S-101 (Fager\'s Island).' } },
  { pack: 'dc', id: 'DC_A_03', match: 'Explore the Georgetown Waterfront Tunnel System', set: {
    comments: 'Deactivated 2026-07-21: no such tunnel system — C&O towpath already covered by DC-AC-101 and DC-C-106.' } },
  { pack: 'dc', id: 'DC_AC_01', match: 'Run the Mall Loop at Sunset', set: {
    comments: 'Deactivated 2026-07-21: same run as DC-AC-103 (kept the dawn version).' } },
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

function mapsUrl(query) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
}

function buildProperties(set) {
  const props = {};
  if (set.title)       props['Title']       = { title: [{ text: { content: set.title } }] };
  if (set.description) props['Description'] = { rich_text: [{ text: { content: set.description } }] };
  if (set.mapsQuery)   props['Maps URL']    = { url: mapsUrl(set.mapsQuery) };
  if (set.comments)    props['Comments']    = { rich_text: [{ text: { content: set.comments } }] };
  return props;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.NOTION_API_KEY) {
    console.error('Missing NOTION_API_KEY');
    process.exit(1);
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const results = { ok: [], notFound: [], ambiguous: [] };

  const byPack = {};
  for (const t of FIXES) {
    (byPack[t.pack] = byPack[t.pack] || []).push(t);
  }

  for (const [pack, targets] of Object.entries(byPack)) {
    console.log(`\n── ${pack} (${targets.length} fixes) ──`);

    // No Active filter: comment-stamping targets just-deactivated cards too
    const pages = await queryAll(notion, {
      property: 'Pack', select: { equals: pack },
    });

    for (const target of targets) {
      const byId = pages.filter(p => getCardId(p) === target.id);

      let match;
      if (byId.length === 0) {
        console.log(`  ✗ NOT FOUND   [${target.id}] "${target.match}"`);
        results.notFound.push(target);
        continue;
      } else if (byId.length === 1) {
        match = byId[0];
      } else {
        const byTitle = byId.filter(p => getTitle(p) === target.match);
        if (byTitle.length === 1) {
          match = byTitle[0];
        } else {
          console.log(`  ⚠ AMBIGUOUS   [${target.id}] — ${byId.length} pages share this ID`);
          byId.forEach(p => console.log(`       "${getTitle(p)}" (${p.id})`));
          results.ambiguous.push(target);
          continue;
        }
      }

      const fields = Object.keys(target.set).join(', ');
      if (DRY_RUN) {
        console.log(`  ~ DRY RUN     [${target.id}] "${getTitle(match)}" → ${fields}`);
        if (target.set.title)     console.log(`       title: "${target.set.title}"`);
        if (target.set.mapsQuery) console.log(`       url:   ${mapsUrl(target.set.mapsQuery)}`);
        results.ok.push(target);
      } else {
        await notion.pages.update({
          page_id: match.id,
          properties: buildProperties(target.set),
        });
        console.log(`  ✓ fixed       [${target.id}] → ${fields}`);
        results.ok.push(target);
      }
    }
  }

  console.log('\n── Summary ──────────────────────────────────────');
  console.log(`  ✓ ${results.ok.length} ${DRY_RUN ? 'would be ' : ''}updated`);
  if (results.notFound.length) {
    console.log(`  ✗ ${results.notFound.length} not found:`);
    results.notFound.forEach(t => console.log(`      [${t.pack}] ${t.id} — "${t.match}"`));
  }
  if (results.ambiguous.length) {
    console.log(`  ⚠ ${results.ambiguous.length} ambiguous:`);
    results.ambiguous.forEach(t => console.log(`      [${t.pack}] ${t.id} — "${t.match}"`));
  }

  if (!DRY_RUN && results.ok.length > 0) {
    console.log('\nDone. Now trigger the "Sync cards from Notion" Action to regenerate packs.');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
