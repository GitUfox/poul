#!/usr/bin/env node
// apply-pack-geo.js: stamp region and coords from pack-geo.js onto the packs
// already on disk, without a Notion export. Run from scripts/:
//   node apply-pack-geo.js
// Idempotent. export-cards.js writes the same fields on every future export,
// so this is only needed once, or after a pack-geo.js edit between exports.
const fs = require('fs');
const path = require('path');
const { geoFor } = require('./pack-geo');

const PACKS_DIR = path.join(__dirname, '..', 'packs');
const indexPath = path.join(PACKS_DIR, 'index.json');
const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

let touched = 0;
for (const entry of idx.packs) {
  const geo = geoFor(entry.id);
  if (!geo.region) { console.warn(`  ⚠ ${entry.id}: no entry in pack-geo.js, left under More`); continue; }
  Object.assign(entry, geo);
  const packPath = path.join(PACKS_DIR, `${entry.id}.json`);
  if (!fs.existsSync(packPath)) continue;
  const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  const next = { id: pack.id, name: pack.name, location: pack.location, emoji: pack.emoji, isDefault: pack.isDefault, ...geo, cards: pack.cards };
  // Keep any other top-level keys a pack may carry, after the known ones.
  for (const k of Object.keys(pack)) if (!(k in next)) next[k] = pack[k];
  const before = JSON.stringify(pack);
  const after = JSON.stringify(next);
  if (before !== after) { fs.writeFileSync(packPath, JSON.stringify(next, null, 2)); touched++; }
}
fs.writeFileSync(indexPath, JSON.stringify(idx, null, 2));
console.log(`✓ index.json carries region + coords for ${idx.packs.filter(p => p.region).length} of ${idx.packs.length} packs; ${touched} pack files updated`);
