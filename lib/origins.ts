/**
 * Artist origin lookup — client side of the build-time pipeline in
 * scripts/build-origins.ts (npm run origins). Where an artist began:
 * birthplace for people, formation place for groups, country centroid
 * when that's all Wikidata knows.
 */

import origins from './origins.json';
import { normKey } from './stories';

export type ArtistOrigin = {
  name: string;
  lat: number;
  lng: number;
  place: string;    // '' when precision is 'country'
  country: string;
  precision: 'city' | 'country';
};

const table = origins as Record<string, ArtistOrigin | null>;

export function originFor(artist: string): ArtistOrigin | null {
  return table[normKey(artist)] ?? null;
}
