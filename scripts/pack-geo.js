// pack-geo.js: where every pack is, for the selector's region groups and the
// Nearby sort. The ONE home for region and coordinates (2026-10-27).
//
// Before this, poul-v1.5.html carried two hand-typed maps (PACK_REGIONS and
// PACK_COORDS) that stopped at 17 packs while the deck grew to 109, so 92
// packs sat under "More" and Nearby could only ever point at those 17 cities.
// The export now writes `region` and `coords` into packs/index.json and each
// pack file, the app reads them, and pack-geo.test.js fails when a pack in the
// index has no entry here. New pack: add its id below.
//
// Regions: Kraig's home state first, then US regions, then the world by
// continent. Coordinates are city centres, two decimals, [lat, lng].

const REGION_ORDER = [
  'Arizona', 'West', 'Mountain', 'Midwest', 'South', 'Northeast', 'Mid-Atlantic',
  'Canada', 'Mexico & Caribbean', 'South America', 'Europe', 'Africa & Middle East',
  'Asia', 'Oceania', 'Events', 'More',
];

const PACK_GEO = {
  // Arizona
  'phoenix':          { region: 'Arizona', coords: [33.45, -112.07] },
  'flagstaff':        { region: 'Arizona', coords: [35.20, -111.65] },
  'sedona':           { region: 'Arizona', coords: [34.87, -111.76] },
  'tucson':           { region: 'Arizona', coords: [32.22, -110.97] },
  // West
  'los-angeles':      { region: 'West', coords: [34.05, -118.24] },
  'san-diego':        { region: 'West', coords: [32.72, -117.16] },
  'san-francisco':    { region: 'West', coords: [37.77, -122.42] },
  'palm-springs':     { region: 'West', coords: [33.83, -116.55] },
  'lake-tahoe':       { region: 'West', coords: [39.10, -120.03] },
  'las-vegas':        { region: 'West', coords: [36.17, -115.14] },
  'seattle':          { region: 'West', coords: [47.61, -122.33] },
  'portland':         { region: 'West', coords: [45.52, -122.68] },
  'honolulu':         { region: 'West', coords: [21.31, -157.86] },
  'anchorage':        { region: 'West', coords: [61.22, -149.90] },
  // Mountain
  'denver':           { region: 'Mountain', coords: [39.74, -104.99] },
  'boulder':          { region: 'Mountain', coords: [40.01, -105.27] },
  'salt-lake-city':   { region: 'Mountain', coords: [40.76, -111.89] },
  'boise':            { region: 'Mountain', coords: [43.62, -116.21] },
  'santa-fe':         { region: 'Mountain', coords: [35.69, -105.94] },
  'albuquerque':      { region: 'Mountain', coords: [35.08, -106.65] },
  // Midwest
  'chicago':          { region: 'Midwest', coords: [41.88, -87.63] },
  'minneapolis':      { region: 'Midwest', coords: [44.98, -93.27] },
  'milwaukee':        { region: 'Midwest', coords: [43.04, -87.91] },
  'detroit':          { region: 'Midwest', coords: [42.33, -83.05] },
  'columbus':         { region: 'Midwest', coords: [39.96, -83.00] },
  'cincinnati':       { region: 'Midwest', coords: [39.10, -84.51] },
  'indianapolis':     { region: 'Midwest', coords: [39.77, -86.16] },
  'st-louis':         { region: 'Midwest', coords: [38.63, -90.20] },
  'kansas-city':      { region: 'Midwest', coords: [39.10, -94.58] },
  // South
  'austin':           { region: 'South', coords: [30.27, -97.74] },
  'dallas':           { region: 'South', coords: [32.78, -96.80] },
  'houston':          { region: 'South', coords: [29.76, -95.37] },
  'san-antonio':      { region: 'South', coords: [29.42, -98.49] },
  'nashville':        { region: 'South', coords: [36.16, -86.78] },
  'memphis':          { region: 'South', coords: [35.15, -90.05] },
  'louisville':       { region: 'South', coords: [38.25, -85.76] },
  'new-orleans':      { region: 'South', coords: [29.95, -90.07] },
  'atlanta':          { region: 'South', coords: [33.75, -84.39] },
  'savannah':         { region: 'South', coords: [32.08, -81.09] },
  'charleston':       { region: 'South', coords: [32.78, -79.93] },
  'charlotte':        { region: 'South', coords: [35.23, -80.84] },
  'raleigh-durham':   { region: 'South', coords: [35.84, -78.78] },
  'asheville':        { region: 'South', coords: [35.60, -82.55] },
  'miami':            { region: 'South', coords: [25.76, -80.19] },
  'tampa':            { region: 'South', coords: [27.95, -82.46] },
  // Northeast
  'nyc':              { region: 'Northeast', coords: [40.71, -74.01] },
  'hamptons':         { region: 'Northeast', coords: [40.96, -72.18] },
  'thousand-islands': { region: 'Northeast', coords: [44.33, -75.92] },
  'boston':           { region: 'Northeast', coords: [42.36, -71.06] },
  'providence':       { region: 'Northeast', coords: [41.82, -71.41] },
  'portland-me':      { region: 'Northeast', coords: [43.66, -70.26] },
  'philadelphia':     { region: 'Northeast', coords: [39.95, -75.17] },
  'pittsburgh':       { region: 'Northeast', coords: [40.44, -79.99] },
  // Mid-Atlantic
  'dc':               { region: 'Mid-Atlantic', coords: [38.90, -77.04] },
  'baltimore':        { region: 'Mid-Atlantic', coords: [39.29, -76.61] },
  'ocean-city':       { region: 'Mid-Atlantic', coords: [38.34, -75.08] },
  'richmond':         { region: 'Mid-Atlantic', coords: [37.54, -77.44] },
  'new-river-gorge':  { region: 'Mid-Atlantic', coords: [38.07, -81.08] },
  // Canada
  'toronto':          { region: 'Canada', coords: [43.65, -79.38] },
  'montreal':         { region: 'Canada', coords: [45.50, -73.57] },
  'vancouver':        { region: 'Canada', coords: [49.28, -123.12] },
  'calgary':          { region: 'Canada', coords: [51.05, -114.07] },
  // Mexico & Caribbean
  'mexico-city':      { region: 'Mexico & Caribbean', coords: [19.43, -99.13] },
  'guadalajara':      { region: 'Mexico & Caribbean', coords: [20.67, -103.35] },
  'cancun':           { region: 'Mexico & Caribbean', coords: [21.16, -86.85] },
  'san-juan':         { region: 'Mexico & Caribbean', coords: [18.47, -66.11] },
  // South America
  'buenos-aires':     { region: 'South America', coords: [-34.60, -58.38] },
  'santiago':         { region: 'South America', coords: [-33.45, -70.67] },
  'medellin':         { region: 'South America', coords: [6.25, -75.56] },
  'rio-de-janeiro':   { region: 'South America', coords: [-22.91, -43.17] },
  // Europe
  'london':           { region: 'Europe', coords: [51.51, -0.13] },
  'edinburgh':        { region: 'Europe', coords: [55.95, -3.19] },
  'dublin':           { region: 'Europe', coords: [53.35, -6.26] },
  'paris':            { region: 'Europe', coords: [48.86, 2.35] },
  'brussels':         { region: 'Europe', coords: [50.85, 4.35] },
  'amsterdam':        { region: 'Europe', coords: [52.37, 4.90] },
  'berlin':           { region: 'Europe', coords: [52.52, 13.41] },
  'vienna':           { region: 'Europe', coords: [48.21, 16.37] },
  'prague':           { region: 'Europe', coords: [50.08, 14.44] },
  'budapest':         { region: 'Europe', coords: [47.50, 19.04] },
  'krakow':           { region: 'Europe', coords: [50.06, 19.94] },
  'stockholm':        { region: 'Europe', coords: [59.33, 18.07] },
  'copenhagen':       { region: 'Europe', coords: [55.68, 12.57] },
  'oslo':             { region: 'Europe', coords: [59.91, 10.75] },
  'norway':           { region: 'Europe', coords: [60.39, 5.32] },
  'lisbon':           { region: 'Europe', coords: [38.72, -9.14] },
  'porto':            { region: 'Europe', coords: [41.15, -8.61] },
  'madrid':           { region: 'Europe', coords: [40.42, -3.70] },
  'barcelona':        { region: 'Europe', coords: [41.39, 2.17] },
  'rome':             { region: 'Europe', coords: [41.90, 12.50] },
  'florence':         { region: 'Europe', coords: [43.77, 11.26] },
  'athens':           { region: 'Europe', coords: [37.98, 23.73] },
  'istanbul':         { region: 'Europe', coords: [41.01, 28.98] },
  'turkey':           { region: 'Europe', coords: [38.64, 34.83] },
  // Africa & Middle East
  'marrakech':        { region: 'Africa & Middle East', coords: [31.63, -8.01] },
  'cape-town':        { region: 'Africa & Middle East', coords: [-33.92, 18.42] },
  // Asia
  'tokyo':            { region: 'Asia', coords: [35.68, 139.69] },
  'kyoto':            { region: 'Asia', coords: [35.01, 135.77] },
  'osaka':            { region: 'Asia', coords: [34.69, 135.50] },
  'seoul':            { region: 'Asia', coords: [37.57, 126.98] },
  'taipei':           { region: 'Asia', coords: [25.03, 121.57] },
  'hong-kong':        { region: 'Asia', coords: [22.32, 114.17] },
  'bangkok':          { region: 'Asia', coords: [13.76, 100.50] },
  'ho-chi-minh-city': { region: 'Asia', coords: [10.78, 106.70] },
  'singapore':        { region: 'Asia', coords: [1.35, 103.82] },
  'bali':             { region: 'Asia', coords: [-8.51, 115.26] },
  // Oceania
  'sydney':           { region: 'Oceania', coords: [-33.87, 151.21] },
  'melbourne':        { region: 'Oceania', coords: [-37.81, 144.96] },
  'auckland':         { region: 'Oceania', coords: [-36.85, 174.76] },
};

// The fields the export merges into a pack's metadata. Unknown packs get no
// region (the app shows them under "More") and no coords (never Nearby).
function geoFor(packId) {
  const g = PACK_GEO[packId];
  return g ? { region: g.region, coords: g.coords } : {};
}

module.exports = { REGION_ORDER, PACK_GEO, geoFor };
