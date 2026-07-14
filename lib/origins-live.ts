/**
 * Runtime artist-origin resolution — the client-side sibling of
 * scripts/build-origins.ts.
 *
 * Build-time origins.json only covers seeds.json artists, but queues also
 * contain MusicBrainz-discovered artists (especially on unseeded globe
 * countries). This module resolves those on the fly against the Wikidata
 * public API (CORS-enabled via origin=*) and caches every answer —
 * including misses — in localStorage so each artist costs the network
 * exactly once per browser.
 */

import { normKey } from './stories';
import { originFor, type ArtistOrigin } from './origins';

const CACHE_KEY = 'liveOrigins.v1';
const API = 'https://www.wikidata.org/w/api.php';

type Cache = Record<string, ArtistOrigin | null>;

function readCache(): Cache {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) || '{}') as Cache;
  } catch {
    return {};
  }
}

function writeCache(cache: Cache): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* quota — live without the cache */ }
}

async function wd(params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...params, format: 'json', origin: '*' });
  try {
    const res = await fetch(`${API}?${qs}`);
    return res.ok ? ((await res.json()) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

type Claims = Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;
type Entity = { claims?: Claims; labels?: Record<string, { value?: string }> };

function firstItemId(claims: Claims | undefined, prop: string): string | null {
  const v = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value as { id?: string } | undefined;
  return v?.id ?? null;
}

function coords(claims: Claims | undefined): { lat: number; lng: number } | null {
  const v = claims?.P625?.[0]?.mainsnak?.datavalue?.value as
    | { latitude?: number; longitude?: number }
    | undefined;
  return typeof v?.latitude === 'number' && typeof v?.longitude === 'number'
    ? { lat: v.latitude, lng: v.longitude }
    : null;
}

async function getEntities(ids: string[]): Promise<Record<string, Entity>> {
  if (!ids.length) return {};
  const data = (await wd({
    action: 'wbgetentities',
    ids: ids.slice(0, 50).join('|'),
    props: 'claims|labels',
    languages: 'en',
  })) as { entities?: Record<string, Entity> };
  return data.entities ?? {};
}

function looksMusical(claims: Claims | undefined): boolean {
  if (!claims) return false;
  return !!(claims.P136?.length || claims.P106?.length || claims.P264?.length);
}

async function resolveViaWikidata(name: string): Promise<ArtistOrigin | null> {
  const search = (await wd({
    action: 'wbsearchentities',
    search: name,
    language: 'en',
    type: 'item',
    limit: '5',
  })) as { search?: Array<{ id: string }> };
  const candidates = (search.search ?? []).map((s) => s.id);
  if (!candidates.length) return null;

  const entities = await getEntities(candidates);
  // Runtime is stricter than the build script: only musical entities, so a
  // stray name collision can't paint a wrong dot mid-session.
  let pick: Entity | null = null;
  let originQ: string | null = null;
  for (const id of candidates) {
    const e = entities[id];
    if (!looksMusical(e?.claims)) continue;
    const hit =
      firstItemId(e?.claims, 'P740') ?? firstItemId(e?.claims, 'P19') ??
      firstItemId(e?.claims, 'P495') ?? firstItemId(e?.claims, 'P27');
    if (hit) { pick = e; originQ = hit; break; }
  }
  if (!pick || !originQ) return null;

  const isCity = originQ === (firstItemId(pick.claims, 'P740') ?? firstItemId(pick.claims, 'P19'));
  const countryQ = firstItemId(pick.claims, 'P495') ?? firstItemId(pick.claims, 'P27');
  const places = await getEntities([originQ, ...(countryQ && countryQ !== originQ ? [countryQ] : [])]);
  const originEnt = places[originQ];
  const countryEnt = countryQ ? places[countryQ] : undefined;

  let pt = coords(originEnt?.claims);
  let precision: ArtistOrigin['precision'] = isCity ? 'city' : 'country';
  if (!pt && countryEnt) { pt = coords(countryEnt.claims); precision = 'country'; }
  if (!pt) return null;

  return {
    name,
    lat: Math.round(pt.lat * 1000) / 1000,
    lng: Math.round(pt.lng * 1000) / 1000,
    place: precision === 'city' ? originEnt?.labels?.en?.value ?? '' : '',
    country: countryEnt?.labels?.en?.value ?? originEnt?.labels?.en?.value ?? '',
    precision,
  };
}

const inFlight = new Map<string, Promise<ArtistOrigin | null>>();

/** Static table first, then localStorage, then one live Wikidata lookup. */
export function originForLive(artist: string): Promise<ArtistOrigin | null> {
  const key = normKey(artist);
  if (!key) return Promise.resolve(null);
  const known = originFor(artist);
  if (known) return Promise.resolve(known);

  const cache = readCache();
  if (key in cache) return Promise.resolve(cache[key]);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const p = resolveViaWikidata(artist)
    .then((o) => {
      const c = readCache();
      c[key] = o;
      writeCache(c);
      inFlight.delete(key);
      return o;
    })
    .catch(() => {
      inFlight.delete(key);
      return null;
    });
  inFlight.set(key, p);
  return p;
}
