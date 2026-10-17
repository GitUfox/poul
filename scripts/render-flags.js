#!/usr/bin/env node
/**
 * render-flags.js — builds /flags/<key>.png, the pack mark tiles.
 *
 * Every pack carries its flag (state flag at home, national flag abroad).
 * The tiles are 4× renders (112×75, 3:2, object-fit cover) of the OFFICIAL
 * flag vectors on Wikimedia Commons, all public domain. Nothing is drawn by hand.
 *
 * Usage (from scripts/):   node render-flags.js            # all flags
 *                          node render-flags.js utah       # one key
 * Needs Google Chrome at the default macOS path (headless screenshot).
 * Sources are downloaded to a temp dir and not kept in the repo.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(__dirname, '..', 'flags');
const W = 112, H = 75;

// key → Wikimedia Commons file name (Special:FilePath resolves the current revision)
const FLAG_SOURCES = {
  // US states, DC, Puerto Rico
  'arizona': 'Flag_of_Arizona.svg', 'new-york': 'Flag_of_New_York.svg', 'maryland': 'Flag_of_Maryland.svg',
  'dc': 'Flag_of_Washington,_D.C..svg', 'california': 'Flag_of_California.svg', 'illinois': 'Flag_of_Illinois.svg',
  'nevada': 'Flag_of_Nevada.svg', 'florida': 'Flag_of_Florida.svg', 'washington': 'Flag_of_Washington.svg',
  'colorado': 'Flag_of_Colorado.svg', 'texas': 'Flag_of_Texas.svg', 'tennessee': 'Flag_of_Tennessee.svg',
  'louisiana': 'Flag_of_Louisiana.svg', 'massachusetts': 'Flag_of_Massachusetts.svg', 'georgia': 'Flag_of_Georgia_(U.S._state).svg',
  'pennsylvania': 'Flag_of_Pennsylvania.svg', 'alaska': 'Flag_of_Alaska.svg', 'west-virginia': 'Flag_of_West_Virginia.svg',
  'north-carolina': 'Flag_of_North_Carolina.svg', 'michigan': 'Flag_of_Michigan.svg', 'missouri': 'Flag_of_Missouri.svg',
  'wisconsin': 'Flag_of_Wisconsin.svg', 'new-mexico': 'Flag_of_New_Mexico.svg', 'oregon': 'Flag_of_Oregon.svg',
  'minnesota': 'Flag_of_Minnesota.svg', 'south-carolina': 'Flag_of_South_Carolina.svg', 'utah': 'Flag_of_Utah.svg',
  'hawaii': 'Flag_of_Hawaii.svg', 'idaho': 'Flag_of_Idaho.svg', 'virginia': 'Flag_of_Virginia.svg',
  'kentucky': 'Flag_of_Kentucky.svg', 'ohio': 'Flag_of_Ohio.svg', 'indiana': 'Flag_of_Indiana.svg',
  'rhode-island': 'Flag_of_Rhode_Island.svg', 'maine': 'Flag_of_Maine.svg', 'puerto-rico': 'Flag_of_Puerto_Rico.svg',
  // Nations (England and Scotland by their own flags)
  'turkiye': 'Flag_of_Turkey.svg', 'belgium': 'Flag_of_Belgium_(civil).svg', 'france': 'Flag_of_France.svg',
  'norway': 'Flag_of_Norway.svg', 'japan': 'Flag_of_Japan.svg', 'thailand': 'Flag_of_Thailand.svg',
  'canada': 'Flag_of_Canada_(Pantone).svg', 'mexico': 'Flag_of_Mexico.svg', 'south-korea': 'Flag_of_South_Korea.svg',
  'australia': 'Flag_of_Australia_(converted).svg', 'spain': 'Flag_of_Spain.svg', 'england': 'Flag_of_England.svg',
  'italy': 'Flag_of_Italy.svg', 'netherlands': 'Flag_of_the_Netherlands.svg', 'germany': 'Flag_of_Germany.svg',
  'ireland': 'Flag_of_Ireland.svg', 'czechia': 'Flag_of_the_Czech_Republic.svg', 'portugal': 'Flag_of_Portugal.svg',
  'denmark': 'Flag_of_Denmark.svg', 'sweden': 'Flag_of_Sweden.svg', 'argentina': 'Flag_of_Argentina.svg',
  'new-zealand': 'Flag_of_New_Zealand.svg', 'chile': 'Flag_of_Chile.svg', 'taiwan': 'Flag_of_the_Republic_of_China.svg',
  'austria': 'Flag_of_Austria.svg', 'hungary': 'Flag_of_Hungary.svg', 'poland': 'Flag_of_Poland.svg',
  'scotland': 'Flag_of_Scotland.svg', 'greece': 'Flag_of_Greece.svg', 'singapore': 'Flag_of_Singapore.svg',
  'hong-kong': 'Flag_of_Hong_Kong.svg', 'vietnam': 'Flag_of_Vietnam.svg', 'indonesia': 'Flag_of_Indonesia.svg',
  // Priority 9 cities generated 2026-10-16/17 (Medellín, Rio, Cape Town, Marrakech) and #25 Reykjavík
  'colombia': 'Flag_of_Colombia.svg', 'brazil': 'Flag_of_Brazil.svg', 'south-africa': 'Flag_of_South_Africa.svg',
  'morocco': 'Flag_of_Morocco.svg', 'iceland': 'Flag_of_Iceland.svg',
};

async function main() {
  const only = process.argv[2];
  const keys = only ? [only] : Object.keys(FLAG_SOURCES);
  if (only && !FLAG_SOURCES[only]) throw new Error('unknown flag key: ' + only);
  if (!fs.existsSync(CHROME)) throw new Error('Google Chrome not found at ' + CHROME);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poul-flags-'));
  fs.mkdirSync(OUT, { recursive: true });
  for (const key of keys) {
    const url = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(FLAG_SOURCES[key]);
    const res = await fetch(url, { headers: { 'User-Agent': 'poul-flags/1.0 (github.com/GitUfox/poul)' } });
    if (!res.ok) throw new Error(key + ': HTTP ' + res.status);
    let svg = await res.text();
    svg = svg.replace(/^﻿/, '');
    if (!/^(<\?xml|<svg)/.test(svg.trimStart())) throw new Error(key + ': not an SVG');
    const svgPath = path.join(tmp, key + '.svg');
    const htmlPath = path.join(tmp, key + '.html');
    fs.writeFileSync(svgPath, svg);
    fs.writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}img{display:block;width:${W}px;height:${H}px;object-fit:cover}</style></head><body><img src="${key}.svg"></body></html>`);
    execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      '--user-data-dir=' + path.join(tmp, 'profile'), '--window-size=' + W + ',' + H,
      '--default-background-color=00000000', '--screenshot=' + path.join(OUT, key + '.png'), 'file://' + htmlPath,
    ], { stdio: 'ignore' });
    console.log('rendered', key);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('done:', keys.length, 'tiles in', OUT);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { FLAG_SOURCES };
