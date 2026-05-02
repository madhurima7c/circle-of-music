import type { Track } from './data';
import { makeArt, paletteFor } from './art';

async function spotifyFetch(token: string, path: string) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`spotify ${res.status}`);
  return res.json();
}

export async function searchTracks(token: string, country: string, genre: string): Promise<Track[]> {
  const q = encodeURIComponent(`${country} ${genre}`);
  const data = await spotifyFetch(token, `/search?q=${q}&type=track&limit=12`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.tracks.items.map((t: any) => ({
    title: t.name,
    artist: t.artists.map((a: { name: string }) => a.name).join(', '),
    image: t.album.images[1]?.url || t.album.images[0]?.url,
    preview: t.preview_url,
    uri: t.uri,
  }));
}

export function mockTracks(country: string, genre: string): Track[] {
  const base: [string, string][] = [
    ['Soft Compass', 'Marin Vale'],
    ['Halfway River', 'Coba & The Bow'],
    ['Tin Roof Mornings', 'Kade Ito'],
    ['Bluebird, Bluebird', 'Norah Lin'],
    ['Echo Hill Drive', 'Sun Atlas'],
    ['Late Mango', 'Pelo de Mar'],
  ];
  return base.map(([t, a], i) => ({
    title: t,
    artist: `${a} · ${cap(country)} ${cap(genre)}`,
    image: makeArt(i * 13 + country.length + genre.length, paletteFor(i)),
    preview: null,
    uri: null,
  }));
}

function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}
