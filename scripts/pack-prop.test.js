// Pins the Pack property contract: one switch, both shapes readable, filter and
// value shapes follow the switch.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PACK_PROP_TYPE, readPack, packFilter, packValue } = require('./pack-prop');

test('the migration switch holds a known shape', () => {
  assert.ok(['select', 'rich_text'].includes(PACK_PROP_TYPE));
});

test('readPack resolves the select shape', () => {
  const page = { properties: { Pack: { type: 'select', select: { name: 'phoenix' } } } };
  assert.equal(readPack(page), 'phoenix');
});

test('readPack resolves the text shape', () => {
  const page = { properties: { Pack: { type: 'rich_text', rich_text: [{ plain_text: 'kyoto' }] } } };
  assert.equal(readPack(page), 'kyoto');
});

test('readPack returns null when the pack is empty', () => {
  assert.equal(readPack({ properties: { Pack: { type: 'rich_text', rich_text: [] } } }), null);
  assert.equal(readPack({ properties: { Pack: { type: 'select', select: null } } }), null);
  assert.equal(readPack({ properties: {} }), null);
});

test('packFilter follows the switch', () => {
  assert.deepEqual(packFilter('san-diego', 'select'),    { property: 'Pack', select:    { equals: 'san-diego' } });
  assert.deepEqual(packFilter('san-diego', 'rich_text'), { property: 'Pack', rich_text: { equals: 'san-diego' } });
  assert.deepEqual(packFilter('oslo'), packFilter('oslo', PACK_PROP_TYPE));
});

test('packValue follows the switch', () => {
  assert.deepEqual(packValue('oslo', 'select'),    { select: { name: 'oslo' } });
  assert.deepEqual(packValue('oslo', 'rich_text'), { rich_text: [{ text: { content: 'oslo' } }] });
  assert.deepEqual(packValue('oslo'), packValue('oslo', PACK_PROP_TYPE));
});
