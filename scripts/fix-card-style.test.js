// Contract tests for the card text-style cleanup (fix-card-style.js).
// Run from scripts/: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { titleCase, fixTitle, fixDashes, transformCard, commentsWithSuffix } = require('./fix-card-style');

// ── Title Case ─────────────────────────────────────────────────────────────

test('titleCase capitalises ordinary words and keeps small words lowercase mid-title', () => {
  assert.equal(titleCase('Spend an evening on the Isola Tiberina'), 'Spend an Evening on the Isola Tiberina');
  assert.equal(titleCase('Throw a coin in the Trevi Fountain before 7am'), 'Throw a Coin in the Trevi Fountain Before 7am');
  assert.equal(titleCase('Pizza and Sour Beer at Omnipollos hatt'), 'Pizza and Sour Beer at Omnipollos Hatt');
});

test('titleCase follows the deck: up / out / off / over / through capitalise, with / from / into stay lowercase', () => {
  assert.equal(titleCase('Road Ride up Emigration Canyon'), 'Road Ride Up Emigration Canyon');
  assert.equal(titleCase('Kayak the River Liffey through the city center'), 'Kayak the River Liffey Through the City Center');
  assert.equal(titleCase('Canal Saint-Martin picnic with market cheese and wine'), 'Canal Saint-Martin Picnic with Market Cheese and Wine');
  assert.equal(titleCase('Cycle from Asakusa to Odaiba via the waterfront'), 'Cycle from Asakusa to Odaiba via the Waterfront');
});

test('titleCase never lowercases anything that is already capitalised', () => {
  assert.equal(titleCase('Find the door at The Jerry Thomas Project'), 'Find the Door at The Jerry Thomas Project');
  assert.equal(titleCase('Walk The Dog'), 'Walk The Dog');
});

test('titleCase leaves foreign articles and prepositions inside venue names lowercase', () => {
  assert.equal(titleCase('Order cacio e pepe at Da Enzo al 29'), 'Order Cacio e Pepe at Da Enzo al 29');
  assert.equal(titleCase('Canopy Zipline at Cascada de las Ánimas'), 'Canopy Zipline at Cascada de las Ánimas');
  assert.equal(titleCase('Cabaret at Piwnica pod Baranami'), 'Cabaret at Piwnica pod Baranami');
  assert.equal(titleCase('Walk the Murals of Santurce es Ley'), 'Walk the Murals of Santurce es Ley');
  assert.equal(titleCase('Breakfast tacos at Mi Tierra Café y Panadería'), 'Breakfast Tacos at Mi Tierra Café y Panadería');
});

test('titleCase keeps elisions, stylized brands, contractions and non-Latin starts as written', () => {
  assert.equal(titleCase("Early morning at the Musée d'Orsay"), "Early Morning at the Musée d'Orsay");
  assert.equal(titleCase('The Courtyard at Six d.o.g.s'), 'The Courtyard at Six d.o.g.s');
  assert.equal(titleCase("Rack 'em Up at the pool hall"), "Rack 'em Up at the Pool Hall");
  assert.equal(titleCase('Summit Quandary Peak, a Colorado 14er'), 'Summit Quandary Peak, a Colorado 14er');
  assert.equal(titleCase('Golden Hour at the Nuʻuanu Pali Lookout'), 'Golden Hour at the Nuʻuanu Pali Lookout');
});

test('titleCase uppercases an accented first letter and never strips a diacritic', () => {
  assert.equal(titleCase('Backgammon at a çay bahçesi in Üsküdar'), 'Backgammon at a Çay Bahçesi in Üsküdar');
  assert.equal(titleCase('Craft Beer at Élesztőház'), 'Craft Beer at Élesztőház');
  assert.equal(titleCase('Pho at Pho Bắc Súp Shop, Little Saigon'), 'Pho at Pho Bắc Súp Shop, Little Saigon');
});

test('titleCase capitalises hyphen halves only for plain English compounds', () => {
  assert.equal(titleCase('Home-style plate lunch at Helenas'), 'Home-Style Plate Lunch at Helenas');
  assert.equal(titleCase('Zip-line at Treetop Quest'), 'Zip-Line at Treetop Quest');
  assert.equal(titleCase('Early morning at Senso-ji temple'), 'Early Morning at Senso-ji Temple');
  assert.equal(titleCase('Ikseon-dong Makgeolli Bar Hopping'), 'Ikseon-dong Makgeolli Bar Hopping');
  assert.equal(titleCase('Espresso at Café Procope, Saint-Germain-des-Prés'), 'Espresso at Café Procope, Saint-Germain-des-Prés');
});

test('titleCase capitalises the first word after a colon even when it is a small word', () => {
  assert.equal(titleCase('Tsukiji outer market breakfast: the full tour'), 'Tsukiji Outer Market Breakfast: The Full Tour');
  assert.equal(titleCase('Midnight sun from Ekeberg Hill (summer)'), 'Midnight Sun from Ekeberg Hill (Summer)');
});

test('fixTitle turns a title em dash into a colon', () => {
  assert.equal(fixTitle('Pink Jeep Tour — Broken Arrow'), 'Pink Jeep Tour: Broken Arrow');
  assert.equal(fixTitle("Thrasher's Fries with Old Bay — no ketchup"), "Thrasher's Fries with Old Bay: No Ketchup");
  assert.equal(fixTitle('Vol de Nuit, The Hidden Bar — West Village'), 'Vol de Nuit, The Hidden Bar: West Village');
});

// ── Em dashes ──────────────────────────────────────────────────────────────

test('fixDashes leaves text without em dashes, en dashes and ranges untouched', () => {
  const s = 'A 2–3 hr hike – with a well-earned beer after.';
  assert.equal(fixDashes(s).text, s);
  assert.deepEqual(fixDashes(s).rules, []);
  assert.equal(fixDashes('').text, '');
  assert.equal(fixDashes(null).text, null);
});

test('clause — clause becomes a period and the next word is capitalised', () => {
  assert.equal(fixDashes('Get all the way in — the water is colder than it looks.').text,
    'Get all the way in. The water is colder than it looks.');
  assert.equal(fixDashes('Claim a teepee before sunset — there are only ten and they go fast.').text,
    'Claim a teepee before sunset. There are only ten and they go fast.');
  assert.equal(fixDashes('Do not ask what is coming next — let the whole set menu land unannounced.').text,
    'Do not ask what is coming next. Let the whole set menu land unannounced.');
});

test('clause — fragment becomes a comma', () => {
  assert.equal(fixDashes('Wrap it properly in mustard leaf and herbs before the first bite — no cutlery.').text,
    'Wrap it properly in mustard leaf and herbs before the first bite, no cutlery.');
  assert.equal(fixDashes('The 1860s sedan-chair route up the mountain — a relentless concrete ramp through the jungle.').text,
    'The 1860s sedan-chair route up the mountain, a relentless concrete ramp through the jungle.');
});

test('a comma-list fragment after a dash takes a colon', () => {
  assert.equal(fixDashes('Eat at whichever warung has the most motorbikes parked outside — no reviews, no menus checked, no exceptions.').text,
    'Eat at whichever warung has the most motorbikes parked outside: no reviews, no menus checked, no exceptions.');
});

test('a dash pair around an aside becomes commas, or parentheses when the aside is itself a list', () => {
  assert.equal(fixDashes('Order it both ways — plate and turnover — and settle it for yourself.').text,
    'Order it both ways, plate and turnover, and settle it for yourself.');
  assert.equal(fixDashes('Order chocolate into everything — grilled cheese, burgers, coffee — at the café.').text,
    'Order chocolate into everything (grilled cheese, burgers, coffee) at the café.');
});

test('fixDashes handles dashes next to existing punctuation without doubling it', () => {
  assert.equal(fixDashes('Go early. — the queue forms by nine.').text, 'Go early. The queue forms by nine.');
  assert.equal(fixDashes('Bring cash, — cards are not taken.').text, 'Bring cash, cards are not taken.');
  assert.equal(fixDashes('— Start at the top.').text, 'Start at the top.');
  const out = fixDashes('One, two — three, four, five — six — seven.').text;
  assert.ok(!/,,|, ,|\.\./.test(out), out);
  assert.ok(!out.includes('—'));
});

test('fixDashes removes every em dash from a mixed paragraph', () => {
  const s = 'A — B. C — d, e, f — g. H — i is here — and more — stuff.';
  const out = fixDashes(s).text;
  assert.ok(!out.includes('—'), out);
});

// ── Card transform ─────────────────────────────────────────────────────────

test('transformCard reports only the fields that change and never Title Cases a clean title', () => {
  const clean = { title: 'Climb Camelback', description: 'One sentence.', bonus: 'No phone to the top.' };
  assert.deepEqual(transformCard(clean).changes, []);
  const dirty = { title: 'climb camelback at dawn', description: 'Start early — the heat arrives by nine.', bonus: 'Fine as is.' };
  const r = transformCard(dirty);
  assert.deepEqual(r.changes.map(c => c.field), ['Title', 'Description']);
  assert.equal(r.changes[0].after, 'Climb Camelback at Dawn');
  assert.equal(r.changes[1].after, 'Start early. The heat arrives by nine.');
});

test('commentsWithSuffix keeps existing segments and appends the audit stamp', () => {
  const rich = [{ type: 'text', plain_text: 'Auto-gen 2026-10-16.', text: { content: 'Auto-gen 2026-10-16.', link: null }, annotations: { bold: true } }];
  const out = commentsWithSuffix(rich, ' · style-fix 2026-10-16');
  assert.equal(out.length, 2);
  assert.equal(out[0].text.content, 'Auto-gen 2026-10-16.');
  assert.equal(out[0].annotations.bold, true);
  assert.equal(out[1].text.content, ' · style-fix 2026-10-16');
  assert.deepEqual(commentsWithSuffix([], 'x')[0].text.content, 'x');
});
