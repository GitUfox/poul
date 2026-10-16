/**
 * pack-prop.js — the ONE place that knows how the Notion `Pack` property is shaped.
 *
 * WHY THIS EXISTS (2026-10-15): Notion caps a Select property at 100 options.
 * The Card Database reached 100 packs, and the daily city-expansion routine
 * was blocked for 13 straight runs because no new Pack option could be created.
 * The fix is to convert `Pack` from Select to Text (no cap). The conversion is
 * done in the Notion UI (Pack property → Edit property → Type → Text); Notion
 * keeps every existing value as plain text.
 *
 * Every script reads and writes `Pack` through the helpers below and calls
 * initPackType(notion) once at startup. initPackType reads the live property
 * type from the schema, so the scripts work before AND after the conversion
 * with no code change. `readPack` tolerates both shapes.
 */

const PACK_PROP_TYPE = 'select';   // fallback when initPackType() was not called
let currentType = PACK_PROP_TYPE;

// Detect the live shape of `Pack` from the database schema. Call once after
// creating the Notion client. Returns 'select' or 'rich_text'.
async function initPackType(notion, databaseId = '68dabc44-f31e-48d9-9dac-2a6d6edb4414') {
  const db = await notion.databases.retrieve({ database_id: databaseId });
  const t = db?.properties?.Pack?.type;
  if (t !== 'select' && t !== 'rich_text') throw new Error(`Unexpected Pack property type: ${t}`);
  currentType = t;
  return t;
}

// Read the pack id from a Notion page object. Works for both shapes.
function readPack(page) {
  const p = page?.properties?.Pack;
  if (!p) return null;
  const fromSelect = p.select?.name || null;
  const fromText   = (p.rich_text || []).map(t => t.plain_text).join('').trim() || null;
  return fromSelect || fromText;
}

// Filter clause for databases.query — exact match on the pack id.
function packFilter(packId, type = currentType) {
  return type === 'rich_text'
    ? { property: 'Pack', rich_text: { equals: packId } }
    : { property: 'Pack', select:    { equals: packId } };
}

// Property value for pages.create / pages.update.
function packValue(packId, type = currentType) {
  return type === 'rich_text'
    ? { rich_text: [{ text: { content: packId } }] }
    : { select: { name: packId } };
}

module.exports = { PACK_PROP_TYPE, initPackType, readPack, packFilter, packValue };
