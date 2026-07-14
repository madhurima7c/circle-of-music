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
  volume: number;          // 0..100
  hoverLeft:  HoverTarget;
  hoverRight: HoverTarget;
  toast: GestureToast | null;
  /** Locked wheels ignore all spin input (drag, scroll, gestures, ladder). */
  lockedLeft:  boolean;
  lockedRight: boolean;
  /** Hand tracking is a delight layer, not a gate — OFF by default,
   *  toggled by the user, persisted in localStorage. */
  handMode: boolean;
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
  /** keepCurrent: re-order the queue but keep playing the same track (Maddy's shuffle button). */
  shuffleTracks: (keepCurrent?: boolean) => void;
  setVolume:   (v: number) => void;
  setHover:    (left: HoverTarget, right: HoverTarget) => void;
  flashToast:  (t: GestureToast) => void;
  toggleLockLeft:  () => void;
  toggleLockRight: () => void;
  toggleHandMode:  () => void;
  setAutoplayBlocked: (b: boolean) => void;
  /** "Surprise me": random new pairing, respecting locked wheels. If both
   *  wheels are locked, reshuffles the current playlist instead. */
  surprise: () => void;
  /** Play an arbitrary queue (used by the finds library) from startIdx. */
  loadQueue: (queue: Track[], startIdx: number) => void;
};

const Store = createContext<StoreShape | null>(null);

/* ---------- Deezer → app Track shape ---------- */
function toTrack(d: DeezerTrack): Track {
  return {
    id: d.id,
    title: d.title,
    artist: d.artist?.name ?? '',
    artistId: d.artist?.id ?? 0,
    album: d.album?.title ?? '',
    releaseDate: d.release_date ?? null,
    image:
      d.album?.cover_xl ||
      d.album?.cover_big ||
      d.album?.cover_medium ||
      d.album?.cover ||
      '',
    preview: d.preview ?? null,
  };
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
  const [volume,     setVolume]     = useState(70);
  const [hoverLeft,  setHoverLeftState]  = useState<HoverTarget>(null);
  const [hoverRight, setHoverRightState] = useState<HoverTarget>(null);
  const [toast,      setToast]      = useState<GestureToast | null>(null);
  const [lockedLeft,  setLockedLeft]  = useState(false);
  const [lockedRight, setLockedRight] = useState(false);
  // Starts false on server AND first client render (hydration-safe), then
  // syncs from localStorage after mount.
  const [handMode, setHandMode] = useState(false);
  useEffect(() => {
    if (window.localStorage.getItem('handMode') === 'on') setHandMode(true);
  }, []);
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

  const commit = useCallback(async () => {
    const gen = ++populateGen.current;
    setStatus('populating');
    setTracks([]);
    setTrackIdx(0);
    setIsPlaying(false);

    const country = COUNTRIES[countryIdxRef.current];
    const genre   = GENRES[genreIdxRef.current];

    try {
      const raw = await buildPlaylist({ country, genre, seeds: SEEDS });
      if (gen !== populateGen.current) return;
      const mapped = raw.map(toTrack);
      setTracks(mapped);
      setStatus(mapped.length ? 'ready' : 'error');
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

  const spinLeft = useCallback((dir: number) => {
    if (lockedLeftRef.current) return;       // locked country wheel ignores input
    const next = (countryIdxRef.current + dir + COUNTRIES.length) % COUNTRIES.length;
    countryIdxRef.current = next;
    setCountryIdx(next);
    setStatus('empty');
    scheduleAutoCommit();
  }, [scheduleAutoCommit]);

  const spinRight = useCallback((dir: number) => {
    if (lockedRightRef.current) return;      // locked genre wheel ignores input
    const next = (genreIdxRef.current + dir + GENRES.length) % GENRES.length;
    genreIdxRef.current = next;
    setGenreIdx(next);
    setStatus('empty');
    scheduleAutoCommit();
  }, [scheduleAutoCommit]);

  const setCountry = useCallback((i: number) => {
    if (lockedLeftRef.current) return;
    const next = ((i % COUNTRIES.length) + COUNTRIES.length) % COUNTRIES.length;
    countryIdxRef.current = next;
    setCountryIdx(next);
    setStatus('empty');
    scheduleAutoCommit();
  }, [scheduleAutoCommit]);

  const setGenre = useCallback((i: number) => {
    if (lockedRightRef.current) return;
    const next = ((i % GENRES.length) + GENRES.length) % GENRES.length;
    genreIdxRef.current = next;
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

  const toggleHandMode = useCallback(() => {
    setHandMode(prev => {
      const next = !prev;
      window.localStorage.setItem('handMode', next ? 'on' : 'off');
      return next;
    });
  }, []);

  // NOTE: the initial auto-commit (first playlist fetch) now lives in the
  // Circle page, not here — the store mounts at the root layout for all
  // routes, and the hub/world routes shouldn't fetch music on load.

  /* ---------- playback ---------- */
  const togglePlay = useCallback(() => {
    setIsPlaying(p => !p);
  }, []);

  const nextTrack = useCallback(() => {
    setTrackIdx(i => {
      if (tracks.length === 0) return i;
      return (i + 1) % tracks.length;
    });
  }, [tracks.length]);

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
    }
    if (!right) {
      const g = pickDifferent(GENRES.length, genreIdxRef.current);
      genreIdxRef.current = g;
      setGenreIdx(g);
    }
    setStatus('empty');
    scheduleAutoCommit();
  }, [scheduleAutoCommit, shuffleTracks]);

  const loadQueue = useCallback((queue: Track[], startIdx: number) => {
    if (!queue.length) return;
    // Bump the generation so any in-flight pairing fetch can't overwrite this.
    populateGen.current++;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setTracks(queue);
    setTrackIdx(Math.max(0, Math.min(startIdx, queue.length - 1)));
    setStatus('ready');
    setIsPlaying(true);
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
    countryIdx, genreIdx, status, tracks, trackIdx, isPlaying, volume,
    hoverLeft, hoverRight, toast, lockedLeft, lockedRight, handMode,
    autoplayBlocked,
    spinLeft, spinRight, setCountry, setGenre, commit, setTrackIdx,
    togglePlay, setIsPlaying, nextTrack, prevTrack, shuffleTracks,
    setVolume: setVolumeClamped, setHover, flashToast,
    toggleLockLeft, toggleLockRight, toggleHandMode, setAutoplayBlocked,
    surprise, loadQueue,
  }), [countryIdx, genreIdx, status, tracks, trackIdx, isPlaying, volume,
       hoverLeft, hoverRight, toast, lockedLeft, lockedRight, handMode,
       autoplayBlocked,
       spinLeft, spinRight, setCountry, setGenre, commit,
       togglePlay, nextTrack, prevTrack, shuffleTracks,
       setVolumeClamped, setHover, flashToast,
       toggleLockLeft, toggleLockRight, toggleHandMode, surprise, loadQueue]);

  return <Store.Provider value={value}>{children}</Store.Provider>;
}

export function useStore() {
  const v = useContext(Store);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}
