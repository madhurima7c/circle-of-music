/**
 * Genre-label → wheel-genre mapping, shared by every build script.
 *
 * Extracted from `scripts/build-world-seeds.ts` (which owned the only copy)
 * so the world-seeds builder and the Kaggle chart miner can never drift into
 * bucketing the same artist differently — a drift the user would experience
 * as the platform putting one artist in two contradictory genres.
 *
 * Inputs are free-text genre labels from wherever we can get them: Wikidata
 * P136, MusicBrainz tags, Every Noise, and the Kaggle sets' `playlist_genre`
 * / `playlist_subgenre`. Output is zero or more of the 20 wheel genres.
 */

// Keep in sync with lib/stories.ts normKey (Unicode-aware + fold table).
const FOLD: Record<string, string> = {
  'ı': 'i', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ß': 'ss',
  'æ': 'ae', 'œ': 'oe', 'ð': 'd', 'þ': 'th',
};

export function normName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[ıøłđßæœðþ]/g, (c) => FOLD[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/* ---------- genre label → wheel genre ----------
 * Ordered: first match wins; an artist can land in several buckets. */
export const GENRE_RULES: Array<[string, string[]]> = [
  ['Bossa Nova', ['bossa']],
  ['Cumbia',     ['cumbia']],
  ['Afrobeats',  ['afrobeats', 'afropop', 'afro-pop', 'afro pop', 'afrofusion', 'afroswing', 'azonto']],
  ['Reggae',     ['reggae', 'dancehall', 'ska', 'ragga', 'dub music', 'rocksteady', 'riddim']],
  ['Punk',       ['punk', 'hardcore punk', 'post-hardcore', 'emo', 'screamo', 'oi!']],
  ['Techno',     ['techno', 'acid house', 'minimal']],
  ['House',      ['house', 'amapiano', 'gqom', 'uk garage', 'garage house', 'kwaito']],
  ['Disco',      ['disco', 'boogie', 'city pop', 'italo', 'eurodance', 'eurobeat']],
  ['Ambient',    ['ambient', 'new age', 'new-age', 'drone', 'lo-fi beats']],
  ['Hip Hop',    ['hip hop', 'hip-hop', 'rap', 'grime', 'drill', 'trap', 'crunk', 'boom bap']],
  ['Jazz',       ['jazz', 'swing', 'bebop', 'big band']],
  ['Classical',  ['classical', 'opera', 'baroque', 'symphon*', 'orchestr*', 'concerto', 'chamber music', 'choral', 'requiem', 'lied', 'oratorio']],
  ['Electronic', ['electronic', 'electronica', 'synth', 'idm', 'downtempo', 'trip hop', 'trip-hop', 'edm', 'electro', 'dubstep', 'drum and bass', 'chillwave', 'vaporwave', 'breakbeat', 'glitch', 'future bass']],
  ['Funk',       ['funk', 'afrobeat', 'go-go']],
  ['Soul',       ['soul', 'r&b', 'rhythm and blues', 'rhythm & blues', 'motown', 'gospel', 'blues', 'neo soul', 'doo-wop', 'quiet storm']],
  ['Rock',       ['rock', 'metal', 'grunge', 'psychedel*', 'shoegaze', 'krautrock', 'new wave', 'britpop', 'post-rock']],
  ['Indie',      ['indie', 'dream pop', 'jangle', 'twee', 'bedroom pop']],
  ['Folk',       ['folk', 'singer-songwriter', 'americana', 'country music', 'country pop', 'bluegrass', 'acoustic', 'trova', 'nueva cancion', 'bard']],
  ['World',      ['world', 'traditional', 'flamenco', 'fado', 'tango', 'salsa', 'merengue', 'bachata', 'mariachi', 'ranchera', 'norteno', 'klezmer', 'qawwali', 'ghazal', 'rai', 'gnawa', 'chaabi', 'arabesque', 'anatolian', 'rebetiko', 'laiko', 'schlager', 'chanson', 'samba', 'mpb', 'forro', 'sertanejo', 'axe', 'pagode', 'highlife', 'juju music', 'fuji music', 'mbalax', 'soukous', 'rumba', 'zouk', 'makossa', 'bikutsi', 'morna', 'mbaqanga', 'isicathamiya', 'maskandi', 'bhangra', 'filmi', 'bollywood', 'carnatic', 'hindustani', 'gamelan', 'dangdut', 'enka', "min'yo", 'trot', 'luk thung', 'morlam', 'cai luong', 'calypso', 'soca', 'reggaeton', 'mento', 'celtic', 'polka', 'turbo-folk', 'turbofolk', 'sevdalinka', 'fanfare', 'manele', 'chalga', 'joik', 'throat singing', 'khoomei']],
  ['Pop',        ['pop', 'idol', 'boy band', 'girl group', 'dance music', 'europop', 'ballad']],
];

/**
 * Coarse Kaggle `playlist_genre` / `playlist_subgenre` values that the
 * keyword rules above cannot resolve on their own — either because the label
 * is a market rather than a sound ("brazilian", "turkish"), or because the
 * keyword is buried without a word boundary ("mandopop" → "pop").
 *
 * Deliberately conservative: a label that does not describe a SOUND we can
 * place on the wheel maps to nothing rather than guessing. "gaming",
 * "korean" and bare "latin" are absent for exactly that reason — a wrong
 * bucket here is the failure mode that costs us the listener's trust.
 */
export const COARSE_LABEL_MAP: Record<string, string[]> = {
  'african music': ['World'],
  'metalcore': ['Rock'],
  'deathcore': ['Rock'],
  'electropop': ['Pop'],
  'synthpop': ['Pop'],
  'dreampop': ['Indie'],
  'lofi': ['Ambient'],
  'lo-fi': ['Ambient'],
  'wellness': ['Ambient'],
  'mandopop': ['Pop'],
  'cantopop': ['Pop'],
  'indian': ['World'],
  'arabic': ['World'],
  'turkish': ['World'],
  'brazilian': ['World'],
  'country': ['Folk'],
  'latin pop': ['Pop'],
  'latin hip hop': ['Hip Hop'],
  'tropical': ['World'],
  'permanent wave': ['Rock'],
  'album rock': ['Rock'],
  'classic rock': ['Rock'],
  'hard rock': ['Rock'],
  'urban contemporary': ['Soul'],
  'neo soul': ['Soul'],
  'post-teen pop': ['Pop'],
  'dance pop': ['Pop'],
  'indie poptimism': ['Indie'],
  'hip pop': ['Hip Hop'],
  'southern hip hop': ['Hip Hop'],
  'gangster rap': ['Hip Hop'],
  'progressive electro house': ['House'],
  'big room': ['House'],
  'pop edm': ['Electronic'],
  'electro house': ['House'],
  'hardstyle': ['Electronic'],
  'tropical house': ['House'],
};

/**
 * Does `label` contain `key` as a whole word?
 *
 * Word boundaries are the DEFAULT, not a special case for short keys. Bare
 * substring matching silently produced wrong genres: "reggaeton" contains
 * "reggae", so a Chilean reggaeton artist was bucketed as Reggae, and
 * "hardcore hip hop" contains "hardcore", so a Hungarian rapper was bucketed
 * as Punk. Both are the kind of error a listener notices immediately.
 *
 * A key ending in `*` is an explicit prefix match, for the handful of stems
 * where that is what we mean ("symphon*" → symphony, symphonic).
 */
export function keyMatches(label: string, key: string): boolean {
  if (key.endsWith('*')) return label.includes(key.slice(0, -1));
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}($|[^a-z])`).test(label);
}

/** Free-text genre labels → zero or more wheel genres. */
export function bucketsFor(genreLabels: string[]): string[] {
  const out = new Set<string>();
  const joined = genreLabels.map((g) => g.toLowerCase().trim()).filter(Boolean);
  for (const label of joined) {
    for (const wheel of COARSE_LABEL_MAP[label] ?? []) out.add(wheel);
  }
  for (const [wheel, keys] of GENRE_RULES) {
    if (joined.some((g) => keys.some((k) => keyMatches(g, k)))) out.add(wheel);
  }
  return [...out];
}

/** A genre label carrying how much we trust the source it came from. */
export type WeightedLabel = { label: string; weight: number };

/**
 * Weighted bucketing, for when several sources disagree.
 *
 * `bucketsFor` treats one stray tag as equal to a hundred votes, which is how
 * a Nigerian rapper ends up tagged Ambient. This sums the weight of every
 * label that maps to a wheel genre and returns only the genres that clear
 * `minScore`, strongest first, capped at `max`. Callers decide the weights:
 * a voted MusicBrainz genre deserves more than a folksonomy tag, and a label
 * inferred from a playlist's name deserves almost nothing.
 */
export function bucketsScored(
  labels: WeightedLabel[],
  { minScore = 2, max = 3 }: { minScore?: number; max?: number } = {},
): Array<{ genre: string; score: number }> {
  const score = new Map<string, number>();
  for (const { label, weight } of labels) {
    const l = label.toLowerCase().trim();
    if (!l) continue;
    const hits = new Set<string>(COARSE_LABEL_MAP[l] ?? []);
    for (const [wheel, keys] of GENRE_RULES) {
      if (keys.some((k) => keyMatches(l, k))) hits.add(wheel);
    }
    for (const wheel of hits) score.set(wheel, (score.get(wheel) || 0) + weight);
  }
  return [...score.entries()]
    .filter(([, s]) => s >= minScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([genre, s]) => ({ genre, score: s }));
}
