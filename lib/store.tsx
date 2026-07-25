'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { COUNTRIES, GENRES, SEEDS, type Track } from './data';
import { buildPlaylist, type DeezerTrack } from './deezer';

type Status = 'empty' | 'populating' | 'ready' | 'error';

/**
 * Used by the gesture system to surface what just fired so a transient
 * on-screen toast can show "Pause", "Next", etc. Cleared after a moment.
 */
export type GestureToast =
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'next' }
  | { kind: 'prev' }
  | { kind: 'shuffle' }
  | { kind: 'lock-left' }
  | { kind: 'lock-right' }
  | { kind: 'unlock-left' }
  | { kind: 'unlock-right' }
  | { kind: 'select-left' }
  | { kind: 'select-right' };

/** Which interactive element the cursor is currently over (per hand). */
export type HoverTarget =
  | 'left-wheel'
  | 'right-wheel'
  | 'play-pause'
  | 'volume-knob'
  | null;

type StoreShape = {
  countryIdx: number;
  genreIdx: number;
  status: Status;
  tracks: Track[];
  trackIdx: number;
  isPlaying: boolean;
  /** Shuffle toggle (the controls-panel button, NOT the dock's surprise). ON
   *  → next/auto-advance plays a random not-yet-played track (Spotify-style,
   *  no repeats until the whole list is heard); the visible list never
   *  reorders. OFF → plain linear advance from the current track. */
  shuffle: boolean;
  volume: number;          // 0..100
  hoverLeft:  HoverTarget;
  hoverRight: HoverTarget;
  toast: GestureToast | null;
  /** Locked wheels ignore all spin input (drag, scroll, gestures, ladder). */
  lockedLeft:  boolean;
  lockedRight: boolean;
  /** True when the browser refused autoplay — the play button pulses
   *  until the user clicks once. Owned by GlobalPlayer, read by the card. */
  autoplayBlocked: boolean;

  spinLeft:  (dir: number) => void;
  spinRight: (dir: number) => void;
  setCountry: (i: number) => void;
  setGenre:   (i: number) => void;
  commit:    () => void;
  setTrackIdx: (i: number) => void;
  togglePlay:  () => void;
  setIsPlaying:(p: boolean) => void;
  nextTrack:   () => void;
  prevTrack:   () => void;
  /** keepCurrent: re-order the queue but keep playing the same track. Used by
   *  the library loop + the both-wheels-locked surprise (NOT the shuffle
   *  toggle, which no longer reorders). */
  shuffleTracks: (keepCurrent?: boolean) => void;
  /** Flip the shuffle toggle. */
  toggleShuffle: () => void;
  /** The sounding track ended — advance honoring the shuffle toggle, or hand
   *  off to endOfQueue when the run is exhausted. Called by GlobalPlayer. */
  trackEnded: () => void;
  setVolume:   (v: number) => void;
  setHover:    (left: HoverTarget, right: HoverTarget) => void;
  flashToast:  (t: GestureToast) => void;
  toggleLockLeft:  () => void;
  toggleLockRight: () => void;
  setAutoplayBlocked: (b: boolean) => void;
  /** "Surprise me": random new pairing, respecting locked wheels. If both
   *  wheels are locked, reshuffles the current playlist instead. */
  surprise: () => void;
  /** Play an arbitrary queue from startIdx. kind tells end-of-queue what to
   *  do: 'chain' (the World's dot chain) advances to the next genre like a
   *  pairing; 'library' (liked songs) just loops. */
  loadQueue: (queue: Track[], startIdx: number, kind?: 'chain' | 'library') => void;
  /** The queue reached its end — pairing/chain queues flip to the NEXT GENRE
   *  (same country) and rebuild; the library reshuffles and loops. */
  endOfQueue: () => void;
  /** Arriving on the Circle with an unrepresented (non-seed) country playing:
   *  flip the wheels to the given seed country NOW, let the current song
   *  finish, and swap everything after it for that country's pipeline queue
   *  in the current genre. Returns the labels for the divert toast. */
  divertAfterCurrent: (seedIdx: number) => { to: string; genre: string | null };
  /** The active custom (non-seed) globe country, if one is playing. */
  customCountry: string | null;
  /** Append tracks to the current queue without resetting playback — the
   *  World's dot-chain feeds the next nearest song in as a rolling window. */
  appendTracks: (extra: Track[]) => void;
  /** Set a pairing and fetch it immediately (no settle debounce) — the World
   *  globe wants instant audio on a country tap. genreIdx optional (keeps
   *  the current genre when omitted); null = NO genre (the World's default
   *  state) → the pipeline plays the country's notable songs across genres. */
  playPlace: (countryIdx: number, genreIdx?: number | null) => void;
  /** Like playPlace but for a country OUTSIDE the seed wheel (any globe
   *  nation). Playlist comes from the MusicBrainz/LLM tiers only. */
  playPlaceNamed: (countryName: string, genreIdx?: number | null) => void;
  /** Reflect the CURRENTLY-PLAYING origin (country + genre) in the store's
   *  displayed state WITHOUT refetching a pipeline or touching the queue.
   *  The World's dot chain calls this every time the sounding dot changes,
   *  so the "FROM" banner and — on the Circle — the country/genre cards
   *  follow the music. A seed country flips its wheel card; a non-seed
   *  nation (e.g. Taiwan) shows as a custom place. */
  setNowPlayingOrigin: (country: string, genreIdx: number) => void;
  /** Display name of the active country — a custom globe country when one
   *  is playing, else COUNTRIES[countryIdx]. */
  countryName: string;
};

const Store = createContext<StoreShape | null>(null);

/* ---------- Deezer → app Track shape ---------- */
export function toTrack(d: DeezerTrack): Track {
  return {
    id: d.id,
    title: d.title,
    artist: d.artist?.name ?? '',
    artistId: d.artist?.id ?? 0,
    album: d.album?.title ?? '',
    releaseDate: d.release_date ?? null,
    duration: d.duration ?? null,
    image:
      d.album?.cover_xl ||
      d.album?.cover_big ||
      d.album?.cover_medium ||
      d.album?.cover ||
      '',
    preview: d.preview ?? null,
  };
}

/** Fisher–Yates in place. */
function shuffleInPlace<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const artistKey = (t: Track) => (t.artistId ? String(t.artistId) : t.artist.toLowerCase());

/**
 * Curate a pairing playlist into a pleasant fixed order:
 *  - shuffled (each run is different — not the artist-clustered order Deezer
 *    returns), but
 *  - spread so the SAME artist never lands back-to-back when it can be
 *    avoided (greedy "most-remaining-first" interleave, provably minimal
 *    adjacency; if one artist dominates the pool, its unavoidable repeats are
 *    still spaced as far apart as possible).
 * The result is stable — it does NOT change as tracks play; playback just
 * moves a highlight down it (Spotify-style).
 */
export function curatePlaylist(tracks: Track[]): Track[] {
  if (tracks.length < 3) return shuffleInPlace([...tracks]);

  // Bucket by artist; shuffle within each bucket and the bucket order so ties
  // break randomly (that's where the run-to-run variety comes from).
  const byArtist = new Map<string, Track[]>();
  for (const t of tracks) {
    const k = artistKey(t);
    (byArtist.get(k) ?? byArtist.set(k, []).get(k)!).push(t);
  }
  const buckets = shuffleInPlace(
    [...byArtist.entries()].map(([key, items]) => ({ key, items: shuffleInPlace(items) })),
  );

  const out: Track[] = [];
  let lastKey: string | null = null;
  while (out.length < tracks.length) {
    // Largest remaining bucket whose artist isn't the one we just placed;
    // fall back to the largest if the only tracks left are that same artist.
    let best: (typeof buckets)[number] | null = null;
    for (const b of buckets) {
      if (!b.items.length) continue;
      if (b.key === lastKey) continue;
      if (!best || b.items.length > best.items.length) best = b;
    }
    if (!best) best = buckets.find(b => b.items.length > 0) ?? null;
    if (!best) break;
    out.push(best.items.shift()!);
    lastKey = best.key;
  }
  return out;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // Default seeds: pick something with rich curated artists so the first
  // playlist call returns real music.
  const defaultCountry = Math.max(0, COUNTRIES.indexOf('India'));
  const defaultGenre   = Math.max(0, GENRES.indexOf('Jazz'));
  const [countryIdx, setCountryIdx] = useState(defaultCountry);
  const [genreIdx,   setGenreIdx]   = useState(defaultGenre);
  const [status,     setStatus]     = useState<Status>('empty');
  const [tracks,     setTracks]     = useState<Track[]>([]);
  const [trackIdx,   setTrackIdx]   = useState(0);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [shuffle,    setShuffle]    = useState(false);
  const [volume,     setVolume]     = useState(70);
  const [hoverLeft,  setHoverLeftState]  = useState<HoverTarget>(null);
  const [hoverRight, setHoverRightState] = useState<HoverTarget>(null);
  const [toast,      setToast]      = useState<GestureToast | null>(null);
  const [lockedLeft,  setLockedLeft]  = useState(false);
  const [lockedRight, setLockedRight] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Refs mirror the lock state so the spin guards always read the latest
  // value without forcing every spin/set callback to be recreated on toggle.
  const lockedLeftRef  = useRef(false);
  const lockedRightRef = useRef(false);

  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Generation counter — stale playlist requests check this before applying.
  // Without it, a slow request from the previous selection can overwrite the
  // results of a fresh one.
  const populateGen = useRef(0);

  // Refs mirror the wheel indices so `commit` always reads the CURRENT
  // selection. Reading the state vars directly had a stale-closure bug: the
  // debounced auto-commit timer captured the `commit` from the render BEFORE
  // the index update, so the fetched playlist lagged the displayed pairing
  // (e.g. UI saying Brazil|Funk while playing the previous pairing's music).
  const countryIdxRef = useRef(countryIdx);
  const genreIdxRef   = useRef(genreIdx);

  // A globe country outside the seed wheel ("custom place"). Cleared by any
  // wheel interaction — the wheels always mean COUNTRIES[countryIdx].
  const [customCountry, setCustomCountry] = useState<string | null>(null);
  const customCountryRef = useRef<string | null>(null);

  // The World's genre-less state: a country tapped with NO genre selected
  // plays its notable songs across genres. Cleared by any wheel/genre action.
  const anyGenreRef = useRef(false);

  // How the current queue was built. 'pairing' = a country×genre playlist
  // from commit(); 'chain' = the World's dot chain; 'library' = liked songs.
  // End-of-queue: pairing/chain advance to the NEXT GENRE (same country);
  // only the library loops — repeating a finished run was the old bug.
  const queueKindRef = useRef<'pairing' | 'chain' | 'library'>('library');

  // Mirror of trackIdx for async queue surgery (divertAfterCurrent swaps the
  // tail while whatever is CURRENTLY sounding keeps playing).
  const trackIdxRef = useRef(0);
  useEffect(() => { trackIdxRef.current = trackIdx; }, [trackIdx]);

  // Shuffle plumbing. Refs so the advance logic (fired from an <audio> ended
  // event, well outside React's render) always reads the live values without
  // rebuilding callbacks — the same discipline as the wheel-index refs.
  const shuffleRef = useRef(false);
  const tracksRef  = useRef<Track[]>([]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  // Indices already heard in the CURRENT shuffle cycle. A track joins it when
  // we advance away from it; when nothing's left the cycle is complete (loop
  // or advance genre). Reset on every new queue and on toggling shuffle.
  const playedRef = useRef<Set<number>>(new Set());
  const resetPlayed = () => { playedRef.current = new Set(); };

  // Pick a random index not yet played and not the current one; -1 when the
  // shuffle cycle is exhausted.
  const pickShuffleNext = (fromIdx: number, len: number): number => {
    playedRef.current.add(fromIdx);
    const remaining: number[] = [];
    for (let i = 0; i < len; i++) {
      if (i !== fromIdx && !playedRef.current.has(i)) remaining.push(i);
    }
    return remaining.length ? remaining[Math.floor(Math.random() * remaining.length)] : -1;
  };

  const commit = useCallback(async () => {
    const gen = ++populateGen.current;
    queueKindRef.current = 'pairing';
    setStatus('populating');
    setTracks([]);
    setTrackIdx(0);
    setIsPlaying(false);
    resetPlayed();

    const country = customCountryRef.current ?? COUNTRIES[countryIdxRef.current];
    const genre   = anyGenreRef.current ? null : GENRES[genreIdxRef.current];

    try {
      let raw = await buildPlaylist({ country, genre, seeds: SEEDS });
      // Deezer's anonymous JSONP flakes under transient rate limits — an
      // empty result for a seeded pairing is almost always noise, so retry
      // once before showing the "no results" card.
      if (raw.length === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        if (gen !== populateGen.current) return;
        raw = await buildPlaylist({ country, genre, seeds: SEEDS });
      }
      if (gen !== populateGen.current) return;
      // Curate into a fixed, artist-spread order (Spotify-style — the list
      // then stays put; playback only moves a highlight down it).
      const mapped = curatePlaylist(raw.map(toTrack));
      setTracks(mapped);
      resetPlayed();
      setStatus(mapped.length ? 'ready' : 'error');
      if (mapped.length) setIsPlaying(true);
    } catch (e) {
      console.warn('Deezer playlist fetch failed:', e);
      if (gen !== populateGen.current) return;
      setTracks([]);
      setStatus('error');
    }
  }, []);

  const scheduleAutoCommit = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => { commit(); }, 1200);
  }, [commit]);

  const clearCustomCountry = useCallback(() => {
    customCountryRef.current = null;
    setCustomCountry(null);
  }, []);

  const spinLeft = useCallback((dir: number) => {
    if (lockedLeftRef.current) return;       // locked country wheel ignores input
    const next = (countryIdxRef.current + dir + COUNTRIES.length) % COUNTRIES.length;
    countryIdxRef.current = next;
    setCountryIdx(next);
    clearCustomCountry();
    setStatus('empty');
    scheduleAutoCommit();
  }, [scheduleAutoCommit, clearCustomCountry]);

  const spinRight = useCallback((dir: number) => {
    if (lockedRightRef.current) return;      // locked genre wheel ignores input
    const next = (genreIdxRef.current + dir + GENRES.length) % GENRES.length;
    genreIdxRef.current = next;
    anyGenreRef.current = false;
    setGenreIdx(next);
    setStatus('empty');
    scheduleAutoCommit();
  }, [scheduleAutoCommit]);

  const setCountry = useCallback((i: number) => {
    if (lockedLeftRef.current) return;
    const next = ((i % COUNTRIES.length) + COUNTRIES.length) % COUNTRIES.length;
    countryIdxRef.current = next;
    setCountryIdx(next);
    clearCustomCountry();
    setStatus('empty');
    scheduleAutoCommit();
  }, [scheduleAutoCommit, clearCustomCountry]);

  const setGenre = useCallback((i: number) => {
    if (lockedRightRef.current) return;
    const next = ((i % GENRES.length) + GENRES.length) % GENRES.length;
    genreIdxRef.current = next;
    anyGenreRef.current = false;
    setGenreIdx(next);
    setStatus('empty');
    scheduleAutoCommit();
  }, [scheduleAutoCommit]);

  const toggleLockLeft = useCallback(() => {
    const next = !lockedLeftRef.current;
    lockedLeftRef.current = next;   // update synchronously so the guard sees it immediately
    setLockedLeft(next);
  }, []);

  const toggleLockRight = useCallback(() => {
    const next = !lockedRightRef.current;
    lockedRightRef.current = next;
    setLockedRight(next);
  }, []);

  // NOTE: the initial auto-commit (first playlist fetch) now lives in the
  // Circle page, not here — the store mounts at the root layout for all
  // routes, and the hub/world routes shouldn't fetch music on load.

  /* ---------- playback ---------- */
  const togglePlay = useCallback(() => {
    setIsPlaying(p => !p);
  }, []);

  const nextTrack = useCallback(() => {
    const len = tracksRef.current.length;
    if (len === 0) return;
    const cur = trackIdxRef.current;
    if (shuffleRef.current && len > 1) {
      let nxt = pickShuffleNext(cur, len);
      if (nxt < 0) {
        // Cycle done — the manual Next button loops (never jumps genre), so
        // start a fresh cycle and pick any other track.
        resetPlayed();
        const pool: number[] = [];
        for (let i = 0; i < len; i++) if (i !== cur) pool.push(i);
        nxt = pool.length ? pool[Math.floor(Math.random() * pool.length)] : cur;
      }
      setTrackIdx(nxt);
      return;
    }
    setTrackIdx((cur + 1) % len);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle(prev => {
      const next = !prev;
      shuffleRef.current = next;
      resetPlayed();   // either direction starts a clean cycle from here
      return next;
    });
  }, []);

  const prevTrack = useCallback(() => {
    setTrackIdx(i => {
      if (tracks.length === 0) return i;
      return (i - 1 + tracks.length) % tracks.length;
    });
  }, [tracks.length]);

  const shuffleTracks = useCallback((keepCurrent = false) => {
    if (tracks.length < 2) return;
    const current = tracks[trackIdx];
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setTracks(shuffled);
    setTrackIdx(keepCurrent ? Math.max(0, shuffled.indexOf(current)) : 0);
  }, [tracks, trackIdx]);

  // Called by GlobalPlayer when the queue reaches its end. One full cycle
  // played → advance to the NEXT GENRE (same country) and rebuild — never
  // repeat the finished run. That holds for pairing playlists AND the
  // World's dot chain (whose own in-country flip is the fast path; this is
  // the guarantee when it can't extend in time). Only the liked-songs
  // library loops, reshuffled.
  const endOfQueue = useCallback(() => {
    resetPlayed();
    if (queueKindRef.current === 'library') {
      shuffleTracks();
      return;
    }
    if (queueKindRef.current === 'chain') {
      // The pipeline takes over — a mounted World must stop its chain so a
      // late dot append can't land on top of the new pairing queue.
      window.dispatchEvent(new Event('world:chain-superseded'));
    }
    const g = (genreIdxRef.current + 1) % GENRES.length;
    genreIdxRef.current = g;
    anyGenreRef.current = false;   // a genre-less run now has a concrete genre
    setGenreIdx(g);
    commit();                      // rebuild this country × the next genre
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, shuffleTracks]);

  // The sounding preview/track ended. Shuffle ON → next unplayed track, or
  // hand off to endOfQueue when the whole list has been heard. Shuffle OFF →
  // linear advance, endOfQueue at the tail. (GlobalPlayer handles the
  // single-track replay case before calling this.)
  const trackEnded = useCallback(() => {
    const len = tracksRef.current.length;
    if (len === 0) return;
    const cur = trackIdxRef.current;
    if (shuffleRef.current && len > 1) {
      const nxt = pickShuffleNext(cur, len);
      if (nxt >= 0) { setTrackIdx(nxt); setIsPlaying(true); }
      else endOfQueue();   // shuffle cycle complete → advance genre / loop
      return;
    }
    if (cur >= len - 1) { endOfQueue(); return; }
    setTrackIdx(cur + 1);
    setIsPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endOfQueue]);

  // World→Circle divert for unrepresented countries: flip the wheels to the
  // nearest seed NOW (label returned for the toast), keep the current song
  // sounding, and replace everything AFTER it with the seed country's
  // pipeline queue in the current genre once it arrives.
  const divertAfterCurrent = useCallback((seedIdx: number): { to: string; genre: string | null } => {
    const ci = ((seedIdx % COUNTRIES.length) + COUNTRIES.length) % COUNTRIES.length;
    const to = COUNTRIES[ci];
    const genreLabel = anyGenreRef.current ? null : GENRES[genreIdxRef.current];
    countryIdxRef.current = ci;
    setCountryIdx(ci);
    customCountryRef.current = null;
    setCustomCountry(null);
    window.dispatchEvent(new Event('world:chain-superseded'));  // chain is done
    const gen = ++populateGen.current;
    queueKindRef.current = 'pairing';
    if (settleTimer.current) clearTimeout(settleTimer.current);
    void (async () => {
      const raw = await buildPlaylist({
        country: to,
        genre: genreLabel,
        seeds: SEEDS,
      }).catch(() => [] as DeezerTrack[]);
      if (gen !== populateGen.current || !raw.length) return;
      const mapped = raw.map(toTrack);
      const curIdx = trackIdxRef.current;
      setTracks(prev => {
        const cur = prev[curIdx];
        if (!cur) return mapped;
        // The sounding track stays put as the head; the new pairing queue
        // becomes its Up Next (minus a duplicate of itself, if matched).
        return [cur, ...curatePlaylist(mapped.filter(t => t.id !== cur.id))];
      });
      resetPlayed();
      setTrackIdx(0);
      setStatus('ready');
    })();
    return { to, genre: genreLabel };
  }, []);

  const surprise = useCallback(() => {
    // Pick a fresh index different from the current one so it always moves.
    const pickDifferent = (len: number, cur: number) => {
      if (len <= 1) return cur;
      let n = cur;
      while (n === cur) n = Math.floor(Math.random() * len);
      return n;
    };
    const left  = lockedLeftRef.current;
    const right = lockedRightRef.current;
    // Guided: both wheels held → reshuffle the current pool for new music.
    if (left && right) { shuffleTracks(); return; }
    if (!left) {
      const c = pickDifferent(COUNTRIES.length, countryIdxRef.current);
      countryIdxRef.current = c;
      setCountryIdx(c);
      clearCustomCountry();
    }
    if (!right) {
      const g = pickDifferent(GENRES.length, genreIdxRef.current);
      genreIdxRef.current = g;
      setGenreIdx(g);
    }
    setStatus('empty');
    scheduleAutoCommit();
  }, [scheduleAutoCommit, shuffleTracks, clearCustomCountry]);

  const loadQueue = useCallback((queue: Track[], startIdx: number, kind: 'chain' | 'library' = 'library') => {
    if (!queue.length) return;
    // Bump the generation so any in-flight pairing fetch can't overwrite this.
    populateGen.current++;
    queueKindRef.current = kind;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setTracks(queue);
    resetPlayed();
    setTrackIdx(Math.max(0, Math.min(startIdx, queue.length - 1)));
    setStatus('ready');
    setIsPlaying(true);
  }, []);

  const appendTracks = useCallback((extra: Track[]) => {
    if (!extra.length) return;
    setTracks(prev => [...prev, ...extra]);
  }, []);

  /** gi: number = play in that genre; null = NO genre (country's notable
   *  songs across genres); undefined = keep the current genre. */
  const applyGenreChoice = (gi: number | null | undefined) => {
    if (gi === null) {
      anyGenreRef.current = true;
    } else if (gi !== undefined) {
      anyGenreRef.current = false;
      const g = ((gi % GENRES.length) + GENRES.length) % GENRES.length;
      genreIdxRef.current = g;
      setGenreIdx(g);
    }
  };

  const playPlace = useCallback((ci: number, gi?: number | null) => {
    const c = ((ci % COUNTRIES.length) + COUNTRIES.length) % COUNTRIES.length;
    countryIdxRef.current = c;
    setCountryIdx(c);
    clearCustomCountry();
    applyGenreChoice(gi);
    if (settleTimer.current) clearTimeout(settleTimer.current);  // skip the debounce
    commit();  // reads the refs just set — fetches this pairing right away
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, clearCustomCountry]);

  const playPlaceNamed = useCallback((countryName: string, gi?: number | null) => {
    customCountryRef.current = countryName;
    setCustomCountry(countryName);
    applyGenreChoice(gi);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    commit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit]);

  const setNowPlayingOrigin = useCallback((country: string, gi: number) => {
    // Seed country → flip its wheel card and drop any custom place; a
    // non-seed nation shows as a custom place (no matching wheel card).
    const seedIdx = COUNTRIES.indexOf(country);
    if (seedIdx >= 0) {
      countryIdxRef.current = seedIdx;
      setCountryIdx(seedIdx);
      customCountryRef.current = null;
      setCustomCountry(null);
    } else {
      customCountryRef.current = country;
      setCustomCountry(country);
    }
    const g = ((gi % GENRES.length) + GENRES.length) % GENRES.length;
    anyGenreRef.current = false;
    genreIdxRef.current = g;
    setGenreIdx(g);
    // NO commit / no queue change — the dot chain owns the queue.
  }, []);

  /* ---------- transient toast for gesture confirmation ---------- */
  const flashToast = useCallback((t: GestureToast) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1100);
  }, []);

  /* ---------- hover targets (for highlighting) ---------- */
  const setHover = useCallback((left: HoverTarget, right: HoverTarget) => {
    setHoverLeftState(prev => (prev === left ? prev : left));
    setHoverRightState(prev => (prev === right ? prev : right));
  }, []);

  const setVolumeClamped = useCallback((v: number) => {
    setVolume(Math.max(0, Math.min(100, Math.round(v))));
  }, []);

  const value = useMemo<StoreShape>(() => ({
    countryIdx, genreIdx, status, tracks, trackIdx, isPlaying, shuffle, volume,
    hoverLeft, hoverRight, toast, lockedLeft, lockedRight,
    autoplayBlocked,
    spinLeft, spinRight, setCountry, setGenre, commit, setTrackIdx,
    togglePlay, setIsPlaying, nextTrack, prevTrack, shuffleTracks,
    toggleShuffle, trackEnded,
    setVolume: setVolumeClamped, setHover, flashToast,
    toggleLockLeft, toggleLockRight, setAutoplayBlocked,
    surprise, loadQueue, appendTracks, playPlace, playPlaceNamed,
    setNowPlayingOrigin, endOfQueue, divertAfterCurrent,
    customCountry,
    countryName: customCountry ?? COUNTRIES[countryIdx],
  }), [countryIdx, genreIdx, status, tracks, trackIdx, isPlaying, shuffle, volume,
       hoverLeft, hoverRight, toast, lockedLeft, lockedRight,
       autoplayBlocked, customCountry,
       spinLeft, spinRight, setCountry, setGenre, commit,
       togglePlay, nextTrack, prevTrack, shuffleTracks, toggleShuffle, trackEnded,
       setVolumeClamped, setHover, flashToast,
       toggleLockLeft, toggleLockRight, surprise, loadQueue,
       appendTracks, playPlace, playPlaceNamed, setNowPlayingOrigin, endOfQueue,
       divertAfterCurrent]);

  return <Store.Provider value={value}>{children}</Store.Provider>;
}

export function useStore() {
  const v = useContext(Store);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}
