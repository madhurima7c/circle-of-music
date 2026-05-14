/**
 * MusicBrainz tag mappings — used by `/api/musicbrainz` to translate the
 * wheel's country and genre values into a Lucene query MusicBrainz can
 * answer. MusicBrainz uses ISO 3166-1 alpha-2 for `country:` and free-text
 * community tags for `tag:`, so we keep these as data not code.
 */

/** Wheel country name → ISO 3166-1 alpha-2 code. */
export const COUNTRY_TO_ISO: Record<string, string> = {
  'Argentina':       'AR',
  'Brazil':          'BR',
  'Cuba':            'CU',
  'Egypt':           'EG',
  'France':          'FR',
  'Ghana':           'GH',
  'India':           'IN',
  'Iran':            'IR',
  'Jamaica':         'JM',
  'Japan':           'JP',
  'Kenya':           'KE',
  'Lebanon':         'LB',
  'Mali':            'ML',
  'Mexico':          'MX',
  'Morocco':         'MA',
  'Nigeria':         'NG',
  'Norway':          'NO',
  'Pakistan':        'PK',
  'Poland':          'PL',
  'Portugal':        'PT',
  'South Africa':    'ZA',
  'South Korea':     'KR',
  'Spain':           'ES',
  'Sweden':          'SE',
  'Turkey':          'TR',
  'United Kingdom':  'GB',
  'United States':   'US',
  'Vietnam':         'VN',
};

/**
 * Wheel genre → list of MusicBrainz tag synonyms. Multiple tags are OR'd in
 * the query: an artist matches the genre if they're tagged with *any* of
 * them. The synonyms reflect how communities actually tag (e.g. "hip hop"
 * vs "hip-hop", "indie" vs "indie rock", "classical" vs "indian classical").
 *
 * Tag list intentionally biases broader on niche genres (Afrobeats, Cumbia)
 * because tagging coverage thins out — and biases narrower on big genres
 * (Pop, Rock) to avoid noise.
 */
export const GENRE_TO_MB_TAGS: Record<string, string[]> = {
  'Afrobeats':   ['afrobeats', 'afrobeat'],
  'Ambient':     ['ambient', 'drone'],
  'Bossa Nova':  ['bossa nova', 'mpb'],
  'Classical':   ['classical', 'contemporary classical', 'indian classical', 'hindustani classical', 'carnatic'],
  'Cumbia':      ['cumbia'],
  'Disco':       ['disco', 'nu-disco'],
  'Electronic':  ['electronic', 'electronica', 'idm'],
  'Folk':        ['folk', 'singer-songwriter', 'world folk', 'traditional folk'],
  'Funk':        ['funk', 'p-funk'],
  'Hip Hop':     ['hip hop', 'hip-hop', 'rap'],
  'House':       ['house', 'deep house', 'tech house'],
  'Indie':       ['indie', 'indie rock', 'indie pop', 'alternative'],
  'Jazz':        ['jazz', 'jazz fusion', 'modal jazz', 'cool jazz'],
  'Pop':         ['pop'],
  'Punk':        ['punk', 'punk rock', 'post-punk'],
  'Reggae':      ['reggae', 'roots reggae', 'dub'],
  'Rock':        ['rock', 'classic rock', 'hard rock', 'progressive rock'],
  'Soul':        ['soul', 'neo-soul'],
  'Techno':      ['techno', 'detroit techno', 'minimal techno'],
  'World':       ['world music', 'world', 'traditional', 'folk music'],
};

/**
 * Non-Western countries where Deezer's album-level genre tags are unreliable
 * (e.g. an Indian jazz album might be tagged "World" or "Other" instead of
 * "Jazz"). For these, we relax the album-genre filter to also accept the
 * regional buckets, since MusicBrainz has already verified the artist fits
 * the pairing by community tag.
 */
export const REGIONAL_DEEZER_BUCKET_IDS = [2, 12, 16, 197];   // World, African, Asian, Latin
export const NON_WESTERN_COUNTRIES = new Set([
  'India', 'Pakistan', 'Bangladesh', 'Nigeria', 'Ghana', 'Kenya',
  'South Africa', 'Mali', 'Egypt', 'Morocco', 'Iran', 'Lebanon',
  'Turkey', 'Vietnam', 'Mexico', 'Cuba', 'Brazil', 'Argentina',
  'Japan', 'South Korea', 'Jamaica',
]);
