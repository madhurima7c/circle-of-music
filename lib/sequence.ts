/**
 * Playlist sequencing — putting a fetched pairing into an order that feels
 * chosen rather than dumped.
 *
 * WHY IT IS BUILT THIS WAY
 * The obvious approach is to sequence on Spotify audio features (tempo, key,
 * energy) from the Kaggle dump. Measured against real Deezer playlists, that
 * data covers 33% of tracks overall — but the spread is the problem, not the
 * average: 80% for United Kingdom × Rock and 2% for Brazil × Bossa Nova. A
 * sequencer that leans on features would flow beautifully for Anglophone rock
 * and fall back to noise for exactly the music this product exists to
 * surface. That is worse than being uniformly decent.
 *
 * So the spine is built from signals EVERY Deezer track carries — artist,
 * popularity rank, release year — and audio features are a refinement layer
 * that improves the ordering where it happens to exist and is silently absent
 * where it does not. A pairing with zero feature coverage still gets a
 * familiar opener, artists spread apart, and eras interleaved.
 *
 * The ordering is a greedy walk: start from an opener, then repeatedly pick
 * the next track that costs least to follow the current one. Costs are
 * additive penalties, and any term whose data is missing contributes nothing
 * — that is what makes the degradation graceful rather than lopsided.
 */

import type { Track } from './data';

export type AudioFeatures = {
  tempo?: number;         // BPM
  energy?: number;        // 0..1
  valence?: number;       // 0..1
  danceability?: number;  // 0..1
  acousticness?: number;  // 0..1
  key?: number;           // Spotify pitch class 0..11, -1 = unknown
  mode?: number;          // 1 major, 0 minor
};

/** Returns features for a track, or undefined when we simply do not know. */
export type FeatureLookup = (track: Track) => AudioFeatures | undefined;

const artistKey = (t: Track) => (t.artistId ? String(t.artistId) : t.artist.toLowerCase());

function year(t: Track): number | null {
  const y = Number(String(t.releaseDate ?? '').slice(0, 4));
  return Number.isFinite(y) && y > 1900 ? y : null;
}

/* ---------- tuning ---------- */
const P_ARTIST_NEAR = 40;     // same artist within the last few tracks
const ARTIST_WINDOW = 3;
const P_BACKLOG = 25;         // favours artists with the most tracks still unplaced
const P_TEMPO = 12;           // per 8 BPM beyond the tolerance
const TEMPO_TOLERANCE = 8;
const P_ENERGY_STEP = 25;     // abrupt loud→quiet jumps
const P_ARC = 30;             // distance from the intended energy shape
const P_KEY_CLASH = 10;       // harmonically unrelated neighbours
const P_SAME_DECADE = 6;
const P_DECADE_RUN = 14;      // three in a row from one decade
const JITTER = 3;             // keeps repeat spins of the same pairing from being identical
const TOP_K = 3;              // choose randomly among the K cheapest

/**
 * The energy shape of the set: open inviting rather than flat-out, build to a
 * peak about two thirds through, then come down. It is the arc a DJ or a
 * Spotify editorial playlist walks, and it is what stops a long queue from
 * feeling like a pile.
 */
function arcTarget(index: number, total: number): number {
  if (total <= 1) return 0.6;
  const x = index / (total - 1);
  const PEAK = 0.65;
  return x <= PEAK
    ? 0.45 + (0.80 - 0.45) * (x / PEAK)
    : 0.80 - (0.80 - 0.50) * ((x - PEAK) / (1 - PEAK));
}

/**
 * Harmonic distance on the circle of fifths, the rule DJs mix by: the same
 * key, a neighbouring key, or the relative major/minor all sit together
 * without clashing. Returns 0 for compatible, 1 for not.
 */
function keyClash(a: AudioFeatures, b: AudioFeatures): number {
  if (a.key == null || b.key == null || a.key < 0 || b.key < 0) return 0;
  if (a.mode == null || b.mode == null) return 0;
  // Position on the circle of fifths (7 semitones per step).
  const fifth = (k: number) => (k * 7) % 12;
  const step = Math.abs(fifth(a.key) - fifth(b.key));
  const around = Math.min(step, 12 - step);
  if (a.mode === b.mode) return around <= 1 ? 0 : 1;
  // Relative major/minor: 3 semitones apart.
  const semis = Math.abs(a.key - b.key);
  return Math.min(semis, 12 - semis) === 3 ? 0 : 1;
}

/**
 * Repair pass: fix any same-artist neighbours the greedy walk left behind.
 *
 * A one-step-lookahead walk occasionally paints itself into a corner and ends
 * up placing two tracks by one artist together even when a valid interleaving
 * existed. Rather than complicate the cost function further, the sequence is
 * swept afterwards and each offending track is swapped with the nearest one
 * that fits in both places. Cheap, and it restores the hard guarantee that
 * the previous implementation provided.
 *
 * Genuinely impossible cases — one artist holding more than half the list —
 * are left alone; nothing can fix those.
 */
function repairAdjacency(seq: Track[]): Track[] {
  const at = (i: number) => artistKey(seq[i]);

  /** Try to move the track at `pos` somewhere it fits, without breaking the
   *  place it lands in. Returns true if a swap happened. Neighbour checks skip
   *  the other end of the swap, since that track is moving too. */
  const relocate = (pos: number): boolean => {
    const moving = at(pos);
    for (let d = 1; d < seq.length; d++) {
      for (const j of [pos - d, pos + d]) {
        if (j < 0 || j >= seq.length || j === pos) continue;
        const partner = at(j);
        if (partner === moving) continue;
        const partnerFits =
          (pos === 0 || pos - 1 === j || at(pos - 1) !== partner) &&
          (pos === seq.length - 1 || pos + 1 === j || at(pos + 1) !== partner);
        if (!partnerFits) continue;
        const weFit =
          (j === 0 || j - 1 === pos || at(j - 1) !== moving) &&
          (j === seq.length - 1 || j + 1 === pos || at(j + 1) !== moving);
        if (!weFit) continue;
        [seq[pos], seq[j]] = [seq[j], seq[pos]];
        return true;
      }
    }
    return false;
  };

  for (let i = 1; i < seq.length; i++) {
    if (at(i) !== at(i - 1)) continue;
    // Either member of the pair can be the one that moves.
    if (!relocate(i)) relocate(i - 1);
  }
  return seq;
}

function shuffleInPlace<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Order `tracks` into a sequence that reads as curated.
 *
 * Guarantees, in priority order:
 *   1. the same artist never lands back-to-back while any alternative exists
 *      (this was the pre-existing contract and is preserved exactly);
 *   2. a recognisable track opens the set;
 *   3. eras are interleaved rather than clumped;
 *   4. where audio features exist, tempo and key move smoothly and energy
 *      follows the arc above.
 */
export function sequencePlaylist(
  tracks: Track[],
  options: { features?: FeatureLookup } = {},
): Track[] {
  if (tracks.length < 3) return shuffleInPlace([...tracks]);
  const feat = options.features ?? (() => undefined);
  const total = tracks.length;

  const remaining = shuffleInPlace([...tracks]);

  /* Opener: one of the most recognisable tracks, chosen at random among them
   * so the same pairing does not always start identically. Deezer's `rank` is
   * the only popularity signal we get for free; without it, any track will do
   * and the shuffle above has already randomised the order. */
  const ranked = [...remaining].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  const opener = ranked.slice(0, Math.min(5, ranked.length))[
    Math.floor(Math.random() * Math.min(5, ranked.length))
  ];
  remaining.splice(remaining.indexOf(opener), 1);

  const out: Track[] = [opener];

  /* How many tracks each artist still has waiting. The predecessor to this
   * function always drained the LARGEST remaining artist first, which is what
   * spread a dominant artist evenly instead of leaving them stacked at the
   * end; a pure nearest-neighbour walk loses that and finishes on eight
   * consecutive João Gilberto tracks. `P_BACKLOG` restores it. */
  const backlog = new Map<string, number>();
  for (const t of remaining) backlog.set(artistKey(t), (backlog.get(artistKey(t)) || 0) + 1);

  while (remaining.length) {
    const prev = out[out.length - 1];
    const prevF = feat(prev);
    const position = out.length;
    const target = arcTarget(position, total);

    const recentArtists = new Set(
      out.slice(-ARTIST_WINDOW).map(artistKey),
    );
    const lastTwoDecades = out.slice(-2).map((t) => {
      const y = year(t);
      return y == null ? null : Math.floor(y / 10);
    });

    const bestIdx: number[] = [];
    const bestCost: number[] = [];

    /* Artist spread is a HARD constraint, not a penalty. Scoring it as a large
     * cost was not enough: once few artists remained, a same-artist track
     * could still be among the K cheapest and get picked, which broke the
     * never-back-to-back contract this function inherited. So same-artist
     * candidates are excluded from consideration outright, and only allowed
     * back when the entire remainder is that one artist. */
    const differentArtist = remaining.some((c) => artistKey(c) !== artistKey(prev));
    const maxBacklog = Math.max(1, ...backlog.values());

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      if (differentArtist && artistKey(c) === artistKey(prev)) continue;
      let cost = Math.random() * JITTER;

      /* Prefer not to revisit an artist within ARTIST_WINDOW — but only when
       * there is room to. An artist holding 14 of 45 tracks needs to reappear
       * every ~3 tracks; charging them a penalty for it just strands their
       * backlog at the end of the list, which is the clumping this whole
       * function exists to prevent. So the penalty applies only when the
       * spacing it demands is actually achievable. */
      const key = artistKey(c);
      const left = backlog.get(key) ?? 1;
      const roomPerTrack = remaining.length / left;
      if (roomPerTrack > ARTIST_WINDOW && recentArtists.has(key)) cost += P_ARTIST_NEAR;
      cost += (1 - left / maxBacklog) * P_BACKLOG;

      /* era spread */
      const cy = year(c);
      if (cy != null) {
        const dec = Math.floor(cy / 10);
        if (lastTwoDecades[lastTwoDecades.length - 1] === dec) cost += P_SAME_DECADE;
        if (lastTwoDecades.length === 2 && lastTwoDecades.every((d) => d === dec)) cost += P_DECADE_RUN;
      }

      /* audio-feature refinement — every term here is skipped when unknown */
      const cf = feat(c);
      if (cf) {
        if (cf.energy != null) cost += Math.abs(cf.energy - target) * P_ARC;
        if (prevF) {
          if (cf.tempo != null && prevF.tempo != null) {
            const jump = Math.abs(cf.tempo - prevF.tempo);
            if (jump > TEMPO_TOLERANCE) cost += ((jump - TEMPO_TOLERANCE) / 8) * P_TEMPO;
          }
          if (cf.energy != null && prevF.energy != null) {
            cost += Math.abs(cf.energy - prevF.energy) * P_ENERGY_STEP;
          }
          cost += keyClash(prevF, cf) * P_KEY_CLASH;
        }
      }

      /* keep the K cheapest */
      let at = bestCost.findIndex((v) => cost < v);
      if (at === -1) at = bestCost.length;
      if (at < TOP_K) {
        bestCost.splice(at, 0, cost);
        bestIdx.splice(at, 0, i);
        if (bestCost.length > TOP_K) { bestCost.pop(); bestIdx.pop(); }
      }
    }

    /* bestIdx is only empty if every remaining track is the previous artist
     * AND the guard above let none through — impossible, but a queue must
     * never stall, so fall back to the first remaining track. */
    const pick = bestIdx.length
      ? bestIdx[Math.floor(Math.random() * bestIdx.length)]
      : 0;
    const chosen = remaining[pick];
    out.push(chosen);
    remaining.splice(pick, 1);
    const left = (backlog.get(artistKey(chosen)) ?? 1) - 1;
    if (left > 0) backlog.set(artistKey(chosen), left);
    else backlog.delete(artistKey(chosen));
  }

  return repairAdjacency(out);
}
