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
import { COUNTRIES, GENRES, type Track } from './data';
import { searchTracks, mockTracks } from './spotify';

type Status = 'empty' | 'populating' | 'ready';

type StoreShape = {
  countryIdx: number;
  genreIdx: number;
  status: Status;
  tracks: Track[];
  trackIdx: number;
  spotifyToken: string;

  spinLeft:  (dir: number) => void;
  spinRight: (dir: number) => void;
  setCountry: (i: number) => void;
  setGenre:   (i: number) => void;
  commit:    () => void;
  setTrackIdx: (i: number) => void;
  setSpotifyToken: (t: string) => void;
};

const Store = createContext<StoreShape | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [countryIdx, setCountryIdx] = useState(COUNTRIES.indexOf('united kingdom'));
  const [genreIdx,   setGenreIdx]   = useState(GENRES.indexOf('jungle'));
  const [status,     setStatus]     = useState<Status>('empty');
  const [tracks,     setTracks]     = useState<Track[]>([]);
  const [trackIdx,   setTrackIdx]   = useState(0);
  const [spotifyToken, _setSpotifyToken] = useState('');

  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hydrate token from localStorage on mount
  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('spotify_token') : null;
    if (t) _setSpotifyToken(t);
  }, []);

  const setSpotifyToken = useCallback((t: string) => {
    _setSpotifyToken(t);
    if (typeof window !== 'undefined') {
      if (t) localStorage.setItem('spotify_token', t);
      else   localStorage.removeItem('spotify_token');
    }
  }, []);

  const commit = useCallback(async () => {
    setStatus('populating');
    setTracks([]);
    setTrackIdx(0);
    const country = COUNTRIES[countryIdx];
    const genre   = GENRES[genreIdx];
    let next: Track[];
    try {
      if (spotifyToken) next = await searchTracks(spotifyToken, country, genre);
      else { await new Promise(r => setTimeout(r, 700)); next = mockTracks(country, genre); }
    } catch (e) {
      console.warn('falling back to mock:', e);
      next = mockTracks(country, genre);
    }
    setTracks(next);
    setStatus('ready');
  }, [countryIdx, genreIdx, spotifyToken]);

  const scheduleAutoCommit = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => { commit(); }, 1200);
  }, [commit]);

  const spinLeft = useCallback((dir: number) => {
    setCountryIdx(i => (i + dir + COUNTRIES.length) % COUNTRIES.length);
    setStatus('empty');
    scheduleAutoCommit();
  }, [scheduleAutoCommit]);

  const spinRight = useCallback((dir: number) => {
    setGenreIdx(i => (i + dir + GENRES.length) % GENRES.length);
    setStatus('empty');
    scheduleAutoCommit();
  }, [scheduleAutoCommit]);

  const setCountry = useCallback((i: number) => {
    setCountryIdx(((i % COUNTRIES.length) + COUNTRIES.length) % COUNTRIES.length);
    setStatus('empty');
    scheduleAutoCommit();
  }, [scheduleAutoCommit]);

  const setGenre = useCallback((i: number) => {
    setGenreIdx(((i % GENRES.length) + GENRES.length) % GENRES.length);
    setStatus('empty');
    scheduleAutoCommit();
  }, [scheduleAutoCommit]);

  // first auto-commit after first paint so the ready state actually populates
  useEffect(() => {
    const t = setTimeout(commit, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<StoreShape>(() => ({
    countryIdx, genreIdx, status, tracks, trackIdx, spotifyToken,
    spinLeft, spinRight, setCountry, setGenre, commit, setTrackIdx, setSpotifyToken,
  }), [countryIdx, genreIdx, status, tracks, trackIdx, spotifyToken,
       spinLeft, spinRight, setCountry, setGenre, commit, setSpotifyToken]);

  return <Store.Provider value={value}>{children}</Store.Provider>;
}

export function useStore() {
  const v = useContext(Store);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}
