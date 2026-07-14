import { COUNTRIES } from './data';

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
