/**
 * Deep links out — "continue this find in your own app."
 *
 * Originally planned around the Odesli/song.link API, but its anonymous
 * tier (2026) no longer returns Spotify / Apple Music / YouTube matches at
 * all (only the query's source platform + secondary services), so exact
 * cross-platform resolution is dead without a key. Search deep links are
 * the pragmatic replacement: built locally from artist + title, they need
 * no API, no quota, no cache, and work for 100% of tracks — the target
 * app opens on a search whose first hit is essentially always the track.
 * Deezer stays an exact link since tracks come from Deezer IDs.
 */

export type TrackLinks = {
  spotify:    string;
  appleMusic: string;
  youtube:    string;
  deezer:     string;
};

export function trackLinks(artist: string, title: string, deezerId: number): TrackLinks {
  const q = encodeURIComponent(`${artist} ${title}`.trim());
  return {
    spotify:    `https://open.spotify.com/search/${q}`,
    appleMusic: `https://music.apple.com/search?term=${q}`,
    youtube:    `https://www.youtube.com/results?search_query=${q}`,
    deezer:     `https://www.deezer.com/track/${deezerId}`,
  };
}
