import { COUNTRIES } from './data';
import GEO_ISO from './geo-iso.json';

/**
 * Bridges Natural Earth country names (GeoJSON `NAME`) to our seed country
 * list. 19/20 match exactly; only the US differs. Used by the World globe to
 * decide which countries are "playable" and to resolve a click to a seed idx.
 */

// our-name → GeoJSON NAME, only where they differ
const TO_GEO: Record<string, string> = {
  'United States': 'United States of America',
};

// GeoJSON NAME → our seed country name (reverse of the above + identity)
const FROM_GEO: Record<string, string> = Object.fromEntries(
  COUNTRIES.map(c => [TO_GEO[c] ?? c, c]),
);

/** GeoJSON NAME for one of our countries (for matching against features). */
export function geoName(country: string): string {
  return TO_GEO[country] ?? country;
}

/** Our seed country for a clicked GeoJSON feature name, or null if unseeded. */
export function seedCountry(geoNameValue: string): string | null {
  return FROM_GEO[geoNameValue] ?? null;
}

/** Index into COUNTRIES for a clicked GeoJSON feature, or -1. */
export function seedCountryIdx(geoNameValue: string): number {
  const name = seedCountry(geoNameValue);
  return name ? COUNTRIES.indexOf(name) : -1;
}

/** The set of GeoJSON NAMEs that have music (our 20). */
export const PLAYABLE_GEO_NAMES = new Set(COUNTRIES.map(geoName));

export const GEO_URL = '/geo/countries-110m.geojson';

/** ISO-3166 alpha-2 for a country name (seed name or GeoJSON name). */
export function countryISO(name: string): string | null {
  const iso = GEO_ISO as Record<string, string>;
  return iso[name] ?? iso[geoName(name)] ?? null;
}

/* ---------- nearest seed country (for unrepresented nations) ---------- */

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(s));
}

// Country label points from the GeoJSON, fetched once and cached (the file
// is already in the HTTP cache whenever the user has visited the World).
let labelCache: Promise<Map<string, { lat: number; lng: number }>> | null = null;
function labelPointsMap(): Promise<Map<string, { lat: number; lng: number }>> {
  labelCache ??= fetch(GEO_URL)
    .then(r => r.json())
    .then((g: { features: Array<{ properties: { NAME: string; LABEL_X: number; LABEL_Y: number } }> }) =>
      new Map(g.features.map(f => [f.properties.NAME, { lat: f.properties.LABEL_Y, lng: f.properties.LABEL_X }])))
    .catch(() => new Map());
  return labelCache;
}

/** Index (into COUNTRIES) of the seed country geographically nearest to the
 *  given nation, or -1 when unknown. Used to "approximate" an unrepresented
 *  country to one of the 20 wheel cards. */
export async function nearestSeedIdx(countryName: string): Promise<number> {
  const pts = await labelPointsMap();
  const from = pts.get(geoName(countryName)) ?? pts.get(countryName);
  if (!from) return -1;
  let best = -1, bestD = Infinity;
  COUNTRIES.forEach((c, i) => {
    const p = pts.get(geoName(c));
    if (!p) return;
    const d = haversineKm(from, p);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

const CONTINENT: Record<string, string> = {
  Afghanistan: 'Asia', Albania: 'Europe', Algeria: 'Africa', Angola: 'Africa',
  Argentina: 'South America', Armenia: 'Asia', Australia: 'Oceania',
  Austria: 'Europe', Azerbaijan: 'Asia', Bahamas: 'Caribbean',
  Bangladesh: 'Asia', Belarus: 'Europe', Belgium: 'Europe', Belize: 'Central America',
  Benin: 'Africa', Bhutan: 'Asia', Bolivia: 'South America',
  'Bosnia and Herz.': 'Europe', Botswana: 'Africa', Brazil: 'South America',
  Brunei: 'Asia', Bulgaria: 'Europe', 'Burkina Faso': 'Africa',
  Burundi: 'Africa', Cambodia: 'Asia', Cameroon: 'Africa', Canada: 'North America',
  'Central African Rep.': 'Africa', Chad: 'Africa', Chile: 'South America',
  China: 'Asia', Colombia: 'South America', Congo: 'Africa',
  'Costa Rica': 'Central America', Croatia: 'Europe', Cuba: 'Caribbean',
  Cyprus: 'Europe', Czechia: 'Europe', 'Côte d\'Ivoire': 'Africa',
  'Dem. Rep. Congo': 'Africa', Denmark: 'Europe',
  'Dominican Rep.': 'Caribbean', Ecuador: 'South America',
  Egypt: 'Africa', 'El Salvador': 'Central America',
  'Eq. Guinea': 'Africa', Eritrea: 'Africa', Estonia: 'Europe',
  eSwatini: 'Africa', Ethiopia: 'Africa', Fiji: 'Oceania',
  Finland: 'Europe', France: 'Europe', Gabon: 'Africa', Gambia: 'Africa',
  Georgia: 'Asia', Germany: 'Europe', Ghana: 'Africa', Greece: 'Europe',
  Guatemala: 'Central America', Guinea: 'Africa', 'Guinea-Bissau': 'Africa',
  Guyana: 'South America', Haiti: 'Caribbean', Honduras: 'Central America',
  Hungary: 'Europe', Iceland: 'Europe', India: 'Asia', Indonesia: 'Asia',
  Iran: 'Asia', Iraq: 'Asia', Ireland: 'Europe', Israel: 'Asia',
  Italy: 'Europe', Jamaica: 'Caribbean', Japan: 'Asia', Jordan: 'Asia',
  Kazakhstan: 'Asia', Kenya: 'Africa', Kosovo: 'Europe', Kuwait: 'Asia',
  Kyrgyzstan: 'Asia', Laos: 'Asia', Latvia: 'Europe', Lebanon: 'Asia',
  Lesotho: 'Africa', Liberia: 'Africa', Libya: 'Africa', Lithuania: 'Europe',
  Luxembourg: 'Europe', Macedonia: 'Europe', Madagascar: 'Africa',
  Malawi: 'Africa', Malaysia: 'Asia', Mali: 'Africa', Mauritania: 'Africa',
  Mexico: 'North America', Moldova: 'Europe', Mongolia: 'Asia',
  Montenegro: 'Europe', Morocco: 'Africa', Mozambique: 'Africa',
  Myanmar: 'Asia', Namibia: 'Africa', Nepal: 'Asia', Netherlands: 'Europe',
  'New Zealand': 'Oceania', Nicaragua: 'Central America', Niger: 'Africa',
  Nigeria: 'Africa', 'North Korea': 'Asia', Norway: 'Europe', Oman: 'Asia',
  Pakistan: 'Asia', Palestine: 'Asia', Panama: 'Central America',
  'Papua New Guinea': 'Oceania', Paraguay: 'South America', Peru: 'South America',
  Philippines: 'Asia', Poland: 'Europe', Portugal: 'Europe', 'Puerto Rico': 'Caribbean',
  Qatar: 'Asia', Romania: 'Europe', Russia: 'Europe', Rwanda: 'Africa',
  'S. Sudan': 'Africa', 'Saudi Arabia': 'Asia', Senegal: 'Africa',
  Serbia: 'Europe', 'Sierra Leone': 'Africa', Singapore: 'Asia',
  Slovakia: 'Europe', Slovenia: 'Europe', 'Solomon Is.': 'Oceania',
  Somalia: 'Africa', 'South Africa': 'Africa', 'South Korea': 'Asia',
  Spain: 'Europe', 'Sri Lanka': 'Asia', Sudan: 'Africa', Suriname: 'South America',
  Sweden: 'Europe', Switzerland: 'Europe', Syria: 'Asia', Taiwan: 'Asia',
  Tajikistan: 'Asia', Tanzania: 'Africa', Thailand: 'Asia', 'Timor-Leste': 'Asia',
  Togo: 'Africa', 'Trinidad and Tobago': 'Caribbean', Tunisia: 'Africa',
  Turkey: 'Europe', Turkmenistan: 'Asia', Uganda: 'Africa', Ukraine: 'Europe',
  'United Arab Emirates': 'Asia', 'United Kingdom': 'Europe',
  'United States': 'North America', 'United States of America': 'North America',
  Uruguay: 'South America', Uzbekistan: 'Asia', Vanuatu: 'Oceania',
  Venezuela: 'South America', Vietnam: 'Asia', 'W. Sahara': 'Africa',
  Yemen: 'Asia', Zambia: 'Africa', Zimbabwe: 'Africa',
};

/** Continent / region for a country name (seed name or GeoJSON name). */
export function countryContinent(name: string): string | null {
  return CONTINENT[name] ?? null;
}
