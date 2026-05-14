/**
 * Track-overrides loader. For pairings where artist-level discovery
 * (MusicBrainz, seeds.json, LLM) still produces poor results, you can
 * manually pin specific Deezer track IDs in `track-overrides.json`.
 *
 * At runtime we re-fetch each ID via `/track/{id}` so we get current
 * preview URLs + full album metadata (cover image, etc.) — the JSON
 * file only needs to store the ID + a label for our own readability.
 */

import overrides from './track-overrides.json';
import type { DeezerTrack } from './deezer';
import { jsonp } from './jsonp';

type OverrideEntry = { id: number; title?: string; artist?: string };

const TABLE: Record<string, OverrideEntry[]> = Object.fromEntries(
  Object.entries(overrides).filter(([k]) => !k.startsWith('_')),
) as Record<string, OverrideEntry[]>;

/** Returns hand-curated Deezer track IDs for a pairing, or [] if none. */
export function getOverrideTrackIds(country: string, genre: string): number[] {
  const key = `${country}|${genre}`;
  const list = TABLE[key];
  if (!Array.isArray(list)) return [];
  return list.map((e) => e.id).filter((n): n is number => typeof n === 'number');
}

/** Resolve override IDs into full DeezerTrack objects, dropping any that
 *  fail to load or have no preview audio. */
export async function fetchOverrideTracks(
  country: string,
  genre: string,
): Promise<DeezerTrack[]> {
  const ids = getOverrideTrackIds(country, genre);
  if (ids.length === 0) return [];

  // Deezer doesn't support CORS, so we use the shared JSONP helper.
  const results = await Promise.all(
    ids.map((id) =>
      jsonp<DeezerTrack & { error?: unknown }>(`https://api.deezer.com/track/${id}`)
        .then((d) => (d?.error || !d?.preview ? null : (d as DeezerTrack)))
        .catch(() => null),
    ),
  );

  return results.filter((t): t is DeezerTrack => t !== null);
}
