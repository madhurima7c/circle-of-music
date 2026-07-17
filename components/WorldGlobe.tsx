'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useStore, toTrack } from '@/lib/store';
import { GENRES, SEEDS, type Track } from '@/lib/data';
import { GEO_URL, PLAYABLE_GEO_NAMES, geoName, seedCountry, seedCountryIdx } from '@/lib/geo';
import { searchArtistTracksStrict, jsonp, type DeezerTrack } from '@/lib/deezer';
import { originFor, type ArtistOrigin } from '@/lib/origins';
import { originForLive } from '@/lib/origins-live';
import { normKey, releaseYear } from '@/lib/stories';
import { STR } from '@/lib/strings';
import { genreColor, genreInk } from '@/lib/genre-colors';
import GEO_ISO from '@/lib/geo-iso.json';

type Feature = {
  properties: { NAME: string; LABEL_X: number; LABEL_Y: number; [k: string]: unknown };
  [k: string]: unknown;
};

/** One song dot. Dataset dots carry a real Deezer track (id + title);
 *  fallback dots carry only an artist and resolve their song on click. */
type SongDot = {
  id: string;
  genreIdx: number;
  geoKey: string;      // GeoJSON NAME — what selecting highlights
  country: string;     // display name
  artist: string;
  title?: string;
  trackId?: number;
  lat: number;
  lng: number;
};

/** public/world-songs/<slug>.json — built by `npm run world-songs`. */
type GenreSongFile = Record<string, Array<{ i: number; t: string; a: string; la: number; ln: number }> | string[]>;

type WorldEntry = { top: string[]; featured: string[]; genres: Record<string, string[]> };

/** Up to five simultaneously-selected genres. Every genre owns a FIXED
 *  color (lib/genre-colors.ts — anchored to everynoise.com), so a dot's
 *  color identifies its genre no matter what else is selected. */
export const MAX_GENRES = 5;

// Stylized, non-satellite palette (matches the app's ink/accent).
const COL = {
  playable:      'rgba(31, 43, 214, 0.55)',   // accent — hand-curated wheel country
  world:         'rgba(31, 43, 214, 0.26)',   // world-seeds coverage (all nations pipeline)
  playableSel:   'rgba(120, 130, 255, 0.95)',
  dim:           'rgba(120, 120, 130, 0.10)',  // no data yet — still tappable (MusicBrainz tier)
  hover:         'rgba(205, 208, 220, 0.38)',  // light grey hover, both kinds
  dimHover:      'rgba(205, 208, 220, 0.22)',
  side:          'rgba(20, 20, 30, 0.45)',
  stroke:        'rgba(255, 255, 255, 0.18)',
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- true 2D dot sprites ----------
 * The built-in points layer extrudes cylinders — even hair-thin ones show
 * side walls at glancing angles. Sprites are camera-facing billboards: a
 * flat circle from every viewpoint, radio.garden style. One shared circle
 * texture; one material per genre color. */
let dotTexture: THREE.Texture | null = null;
function getDotTexture(): THREE.Texture {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}
const dotMaterials = new Map<string, THREE.SpriteMaterial>();
function dotMaterial(color: string): THREE.SpriteMaterial {
  let m = dotMaterials.get(color);
  if (!m) {
    m = new THREE.SpriteMaterial({
      map: getDotTexture(),
      color,
      transparent: true,
      depthWrite: false,
    });
    dotMaterials.set(color, m);
  }
  return m;
}
const DOT_SCALE = 0.3;       // world units (globe radius = 100) ≈ tiny flat dot
const DOT_ALTITUDE = 0.012;  // a hair above the 0.01 country caps

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Deterministic small hash for jittering dots that only have a country. */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Great-circle distance (km) — drives the "nearest dot" auto-advance. */
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(s));
}

export default function WorldGlobe() {
  const {
    status, tracks, trackIdx,
    playPlace, playPlaceNamed, loadQueue, appendTracks,
  } = useStore();
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [features, setFeatures] = useState<Feature[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedGeo, setSelectedGeo] = useState<string | null>(null);
  const selectedGeoRef = useRef(selectedGeo);
  selectedGeoRef.current = selectedGeo;

  // Up to MAX_GENRES selected at once — none by default. Each genre keeps
  // its own fixed color from lib/genre-colors.ts.
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const selectedGenresRef = useRef(selectedGenres);
  selectedGenresRef.current = selectedGenres;
  const colorFor = (genreIdx: number) => genreColor(GENRES[genreIdx] ?? '');

  const [worldSeeds, setWorldSeeds] = useState<Record<string, WorldEntry> | null>(null);
  useEffect(() => {
    import('@/lib/world-seeds.json')
      .then((m) => setWorldSeeds((m.default ?? m) as unknown as Record<string, WorldEntry>))
      .catch(() => {});
  }, []);
  const worldCovered = useMemo(
    () => new Set(worldSeeds ? Object.keys(worldSeeds).filter((k) => worldSeeds[k].top.length > 0) : []),
    [worldSeeds],
  );

  /* ---------- world-songs dataset: one file per genre, fetched lazily.
   * undefined = not requested · null = missing (fall back to artist dots) */
  const [songFiles, setSongFiles] = useState<Record<number, GenreSongFile | null>>({});
  useEffect(() => {
    for (const gi of selectedGenres) {
      if (songFiles[gi] !== undefined) continue;
      setSongFiles((prev) => ({ ...prev, [gi]: prev[gi] ?? null }));
      fetch(`/world-songs/${slugify(GENRES[gi])}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<GenreSongFile>) : null))
        .catch(() => null)
        .then((d) => setSongFiles((prev) => ({ ...prev, [gi]: d })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenres]);

  /* ---------- load country polygons ---------- */
  useEffect(() => {
    let alive = true;
    fetch(GEO_URL)
      .then(r => r.json())
      .then((g: { features: Feature[] }) => { if (alive) setFeatures(g.features); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  /* ---------- responsive sizing ---------- */
  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  /* ---------- stylized globe material (no satellite texture) ---------- */
  const globeMaterial = useMemo(() => {
    const m = new THREE.MeshPhongMaterial({ color: '#0e0f1a', shininess: 6 });
    m.transparent = true;
    return m;
  }, []);

  /* ---------- constrain controls; set the opening viewpoint ONCE ----------
   * The initial pointOfView must never re-run on status changes — that was
   * snapping the camera back out right after a country fly-in. */
  const povInitialised = useRef(false);
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !size.w) return;
    const controls = g.controls();
    controls.enablePan = false;
    controls.minDistance = 120;   // allow the close country zoom
    controls.maxDistance = 520;
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.autoRotateSpeed = 0.35;
    if (!povInitialised.current) {
      povInitialised.current = true;
      g.pointOfView({ altitude: 2.4 }, 0);
    }
  }, [size.w]);

  /* gentle auto-spin only until the first pick */
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !size.w) return;
    g.controls().autoRotate = status === 'empty';
  }, [status, size.w]);

  /* =====================================================================
   *  Song dots — every selected genre lights up its songs worldwide in
   *  its own color. Dataset songs (public/world-songs) carry real titles
   *  and Deezer ids; countries the build hasn't reached yet fall back to
   *  artist dots from world-seeds + the wheel seeds.
   * ===================================================================== */
  const labelPoints = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    features.forEach(f =>
      map.set(f.properties.NAME, { lat: f.properties.LABEL_Y, lng: f.properties.LABEL_X }));
    return map;
  }, [features]);

  const dots = useMemo<SongDot[]>(() => {
    if (!selectedGenres.length || !labelPoints.size) return [];
    const out: SongDot[] = [];

    for (const gi of selectedGenres) {
      const genreName = GENRES[gi];
      const file = songFiles[gi];
      const covered = new Set<string>();

      // 1. Dataset songs — real titles + track ids, popularity-ordered.
      if (file) {
        for (const [geoKey, entry] of Object.entries(file)) {
          if (geoKey === '__done') {
            (entry as string[]).forEach((c) => covered.add(c));
            continue;
          }
          covered.add(geoKey);
          for (const s of entry as Array<{ i: number; t: string; a: string; la: number; ln: number }>) {
            out.push({
              id: `${gi}|s|${s.i}`,
              genreIdx: gi,
              geoKey,
              country: seedCountry(geoKey) ?? geoKey,
              artist: s.a,
              title: s.t,
              trackId: s.i,
              lat: s.la,
              lng: s.ln,
            });
          }
        }
      }

      // 2. Fallback artist dots for countries the build hasn't reached.
      const pushArtist = (artist: string, geoKey: string) => {
        if (covered.has(geoKey)) return;
        const k = normKey(artist);
        if (!k) return;
        const o = originFor(artist);
        let lat: number, lng: number;
        if (o) {
          lat = o.lat; lng = o.lng;
        } else {
          const lp = labelPoints.get(geoKey);
          if (!lp) return;
          const h = hashCode(k);
          lat = lp.lat + ((h % 100) / 100 - 0.5) * 3.2;
          lng = lp.lng + (((h >> 7) % 100) / 100 - 0.5) * 3.2;
        }
        out.push({
          id: `${gi}|a|${geoKey}|${k}`,
          genreIdx: gi,
          geoKey,
          country: seedCountry(geoKey) ?? geoKey,
          artist,
          lat, lng,
        });
      };
      const seedArtists = SEEDS.artists as Record<string, Record<string, string[]>>;
      for (const country of Object.keys(seedArtists)) {
        (seedArtists[country][genreName] ?? []).forEach(a => pushArtist(a, geoName(country)));
      }
      if (worldSeeds) {
        for (const [country, entry] of Object.entries(worldSeeds)) {
          (entry.genres?.[genreName] ?? []).forEach(a => pushArtist(a, country));
        }
      }
    }
    return out;
  }, [selectedGenres, songFiles, worldSeeds, labelPoints]);
  const dotsRef = useRef(dots);
  dotsRef.current = dots;

  /* =====================================================================
   *  Dot playback chain — click a dot, its song plays and its country
   *  highlights; when a song ends the chain advances to the nearest
   *  unplayed dot IN THE SAME COUNTRY first (any selected genre), then
   *  radiates outward. Rolling prefetch keeps the next song queued.
   * ===================================================================== */
  const chainActive = useRef(false);
  const playedDots = useRef(new Set<string>());
  const lastDot = useRef<SongDot | null>(null);
  const dotByQueueIdx = useRef<(SongDot | null)[]>([]);
  const prefetching = useRef(false);
  const songCache = useRef(new Map<string, Track | null>());

  const fetchSongForDot = async (dot: SongDot): Promise<Track | null> => {
    if (songCache.current.has(dot.id)) return songCache.current.get(dot.id) ?? null;
    let track: Track | null = null;
    if (dot.trackId) {
      // Dataset dot: one lookup for full metadata + a fresh preview URL.
      const full = await jsonp<DeezerTrack>(`https://api.deezer.com/track/${dot.trackId}`)
        .catch(() => null);
      if (full?.preview) track = toTrack(full);
    }
    if (!track) {
      const raw = await searchArtistTracksStrict(dot.artist, GENRES[dot.genreIdx] ?? null, 3)
        .catch(() => [] as DeezerTrack[]);
      const first = raw.find(t => t.preview) ?? null;
      track = first ? toTrack(first) : null;
    }
    songCache.current.set(dot.id, track);
    return track;
  };

  /** Nearest unplayed dot — same country as `from` first, then anywhere. */
  const nearestUnplayed = (from: SongDot): SongDot | null => {
    let bestHome: SongDot | null = null, bestHomeD = Infinity;
    let bestAway: SongDot | null = null, bestAwayD = Infinity;
    for (const d of dotsRef.current) {
      if (playedDots.current.has(d.id)) continue;
      const dist = haversine(from, d);
      if (d.geoKey === from.geoKey) {
        if (dist < bestHomeD) { bestHomeD = dist; bestHome = d; }
      } else if (dist < bestAwayD) {
        bestAwayD = dist; bestAway = d;
      }
    }
    return bestHome ?? bestAway;
  };

  /** Prefetch the next dot's song and append it to the queue — called when
   *  a dot starts and again as playback reaches the end of the queue.
   *  Skips dots with no playable preview and keeps hunting outward. */
  const prefetchNext = async () => {
    if (!chainActive.current || prefetching.current) return;
    prefetching.current = true;
    try {
      for (;;) {
        const from = lastDot.current;
        if (!from) return;
        const next = nearestUnplayed(from);
        if (!next) return;
        playedDots.current.add(next.id);
        const t = await fetchSongForDot(next);
        if (!chainActive.current) return;
        if (t) {
          lastDot.current = next;
          dotByQueueIdx.current.push(next);
          appendTracks([t]);
          return;
        }
      }
    } finally {
      prefetching.current = false;
    }
  };
  const prefetchNextRef = useRef(prefetchNext);
  prefetchNextRef.current = prefetchNext;

  // Rolling window: as playback reaches the last known track, top it up.
  useEffect(() => {
    if (!chainActive.current) return;
    if (trackIdx >= tracks.length - 1) void prefetchNextRef.current();
  }, [trackIdx, tracks.length]);

  // The highlight follows the MUSIC: whenever the playing song's dot sits
  // in a different country, that country becomes the selection (which in
  // turn glides the camera to it — see the fly-to effect below).
  useEffect(() => {
    const dot = dotByQueueIdx.current[trackIdx];
    if (dot && dot.geoKey !== selectedGeoRef.current) setSelectedGeo(dot.geoKey);
  }, [trackIdx, tracks.length]);

  const playDot = async (dot: SongDot) => {
    chainActive.current = true;
    playedDots.current = new Set([dot.id]);
    lastDot.current = dot;
    setSelectedGeo(dot.geoKey);       // picking a song highlights its country
    const t = await fetchSongForDot(dot);
    if (!chainActive.current) return;
    if (!t) {
      // Dead dot (no playable preview) — hop straight to its neighbor.
      const next = nearestUnplayed(dot);
      if (next) return playDot(next);
      return;
    }
    dotByQueueIdx.current = [dot];
    loadQueue([t], 0);
    void prefetchNextRef.current();
  };
  const playDotRef = useRef(playDot);
  playDotRef.current = playDot;

  /* ---------- selection = zoom: whenever a NEW country becomes selected
   * (tapped, dot-clicked, or reached by the playing chain), the camera
   * glides in and centers it. ---------- */
  useEffect(() => {
    if (!selectedGeo) return;
    const f = features.find(x => x.properties.NAME === selectedGeo);
    if (!f) return;
    globeRef.current?.pointOfView(
      { lat: f.properties.LABEL_Y, lng: f.properties.LABEL_X, altitude: 0.7 },
      1000,
    );
  }, [selectedGeo, features]);

  /** Clicking country space (not a dot): highlight it and SHUFFLE its songs
   *  — a random in-country dot starts the chain when genres are selected;
   *  otherwise the country's pipeline queue plays (genre-less = its best). */
  const onClick = (feat: object) => {
    const f = feat as Feature;
    const name = f.properties.NAME;
    const local = dotsRef.current.filter(d => d.geoKey === name);
    if (local.length) {
      setSelectedGeo(name);
      void playDotRef.current(local[Math.floor(Math.random() * local.length)]);
      return;
    }
    // Re-clicking the loaded country (e.g. a double-click while zooming)
    // must not refetch — that emptied the queue and stripped the dots.
    if (name === selectedGeo && status !== 'error' && status !== 'empty') return;
    chainActive.current = false;           // country queue replaces the dot chain
    dotByQueueIdx.current = [];
    setSelectedGeo(name);
    const gi = selectedGenresRef.current[0] ?? null;   // null = no genre → country's best
    const idx = seedCountryIdx(name);
    if (idx >= 0) playPlace(idx, gi);
    else playPlaceNamed(name, gi);
  };

  // Spin to a random curated country and play it (the radio.garden moment).
  // Triggered from the shared dock's shuffle button via a window event.
  const shuffle = () => {
    const playable = features.filter(f => PLAYABLE_GEO_NAMES.has(f.properties.NAME));
    if (!playable.length) return;
    onClick(playable[Math.floor(Math.random() * playable.length)]);
  };
  const shuffleRef = useRef(shuffle);
  shuffleRef.current = shuffle;
  useEffect(() => {
    const onShuffle = () => shuffleRef.current();
    window.addEventListener('world:shuffle', onShuffle);
    return () => window.removeEventListener('world:shuffle', onShuffle);
  }, []);

  /* Dev-only: the headless preview can't raycast canvas clicks (no rAF in
   * hidden tabs), so expose the tap actions for scripted verification. */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as Record<string, unknown>).__world = {
      select: (name: string, gi?: number | null) => {
        setSelectedGeo(name);
        const idx = seedCountryIdx(name);
        if (idx >= 0) playPlace(idx, gi);
        else playPlaceNamed(name, gi);
      },
      toggleGenre: (i: number) => toggleGenre(i),
      clearGenres: () => setSelectedGenres([]),
      dots: () => dotsRef.current,
      playDot: (i: number) => { const d = dotsRef.current[i]; if (d) void playDotRef.current(d); },
      hover: (i: number | null) => onDotHover(i == null ? null : dotsRef.current[i] ?? null),
      selectedGeo: () => selectedGeoRef.current,
      screenXY: (i: number) => {
        const d = dotsRef.current[i];
        if (!d) return null;
        const g = globeRef.current as unknown as {
          getScreenCoords?: (lat: number, lng: number, alt: number) => { x: number; y: number };
        };
        return g?.getScreenCoords?.(d.lat, d.lng, DOT_ALTITUDE) ?? null;
      },
      tapCountry: (name: string) => {
        const f = features.find(x => x.properties.NAME === name);
        if (f) onClick(f);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playPlace, playPlaceNamed, features]);

  /* ---------- genre rail: multi-select, max five ---------- */
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleGenre = (i: number) => {
    const cur = selectedGenresRef.current;
    if (!cur.includes(i) && cur.length >= MAX_GENRES) {
      // Cap hit — tell the wanderer instead of silently ignoring the tap.
      setToast(STR.world.maxGenres);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 2200);
      return;
    }
    setSelectedGenres(prev =>
      prev.includes(i) ? prev.filter(g => g !== i)
      : prev.length >= MAX_GENRES ? prev   // same-tick burst guard (ref lags a render)
      : [...prev, i]);
  };

  /* ---------- song-dot hover card — a mini now-playing preview ----------
   * The globe.gl string tooltip can't hold async artwork, so hovering a
   * dot renders our own card at the dot's screen position: cover (fetched
   * lazily, cached with the click path's songCache), title, album and the
   * "A <genre> find from <country>" line. */
  /* ---------- delayed country hover tooltip ----------
   * Only show the country pill after the cursor has rested on the same
   * country for ~1.5s — prevents overstimulation when sweeping across
   * the globe or exploring song dots. */
  const [delayedHover, setDelayedHover] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const onPolyHover = useCallback((f: object | null) => {
    const name = f ? (f as Feature).properties.NAME : null;
    setHovered(name);
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    if (!name) { setDelayedHover(null); return; }
    hoverTimerRef.current = setTimeout(() => setDelayedHover(name), 900);
  }, []);

  useEffect(() => () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }, []);

  const onGlobeMouseMove = useCallback((e: React.MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const [hoverDot, setHoverDot] = useState<SongDot | null>(null);
  const [hoverTrack, setHoverTrack] = useState<Track | null>(null);
  const [hoverXY, setHoverXY] = useState<{ x: number; y: number } | null>(null);
  const hoverIdRef = useRef<string | null>(null);

  // Playing marker hover — same card style as song dots.
  type MarkerInfo = { img: string; title: string; artist: string; album: string; place: string; genreIdx: number; releaseDate: string | null; lat: number; lng: number };
  const [markerHover, setMarkerHover] = useState<MarkerInfo | null>(null);
  const onDotHover = (d: object | null) => {
    const dot = (d as SongDot | null) ?? null;
    hoverIdRef.current = dot?.id ?? null;
    setHoverDot(dot);
    setHoverTrack(null);
    if (dot) {
      setDelayedHover(null);
      setMarkerHover(null);
      if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    }
    if (!dot) return;
    const g = globeRef.current as unknown as {
      getScreenCoords?: (lat: number, lng: number, alt: number) => { x: number; y: number };
    };
    const xy = g?.getScreenCoords?.(dot.lat, dot.lng, DOT_ALTITUDE);
    if (xy) setHoverXY(xy);
    void fetchSongForDot(dot).then((t) => {
      if (hoverIdRef.current === dot.id) setHoverTrack(t);
    });
  };

  /* ---------- country paint ---------- */
  const capColor = (feat: object) => {
    const name = (feat as Feature).properties.NAME;
    const playable = PLAYABLE_GEO_NAMES.has(name);
    if (name === selectedGeo) return COL.playableSel;
    if (name === hovered) return playable || worldCovered.has(name) ? COL.hover : COL.dimHover;
    if (playable) return COL.playable;
    return worldCovered.has(name) ? COL.world : COL.dim;
  };

  /* ---------- the playing marker: avatar + sonar ring ---------- */
  const track = tracks[trackIdx];
  // Country-queue tracks have no dot — resolve the artist's origin live.
  const [liveOrigin, setLiveOrigin] = useState<ArtistOrigin | null>(null);
  useEffect(() => {
    const artist = track?.artist;
    if (!artist || dotByQueueIdx.current[trackIdx]) { setLiveOrigin(null); return; }
    let alive = true;
    setLiveOrigin(originFor(artist));
    if (!originFor(artist)) {
      originForLive(artist).then((o) => { if (alive && o) setLiveOrigin(o); });
    }
    return () => { alive = false; };
  }, [track?.artist, trackIdx]);

  const playingMarker = useMemo(() => {
    if (status !== 'ready' || !track) return null;
    const dot = dotByQueueIdx.current[trackIdx];
    const pos = dot ?? liveOrigin;
    if (!pos) return null;
    return {
      lat: pos.lat,
      lng: pos.lng,
      img: track.image || '',
      title: track.title,
      artist: track.artist,
      album: track.album || '',
      place: dot ? dot.country : (liveOrigin?.place || liveOrigin?.country || ''),
      genreIdx: dot?.genreIdx ?? -1,
      releaseDate: track.releaseDate ?? null,
    };
  }, [status, track, trackIdx, liveOrigin]);
  const htmlMarkers = useMemo(() => (playingMarker ? [playingMarker] : []), [playingMarker]);
  const playingMarkerRef = useRef(playingMarker);
  playingMarkerRef.current = playingMarker;

  const makeMarkerEl = (d: object) => {
    const m = d as NonNullable<typeof playingMarker>;
    const el = document.createElement('div');
    el.className = 'origin-marker';
    el.dataset.playing = 'true';
    el.dataset.kind = m.img ? 'avatar' : 'dot';
    el.innerHTML = m.img
      ? `<img class="origin-marker__img" src="${esc(m.img)}" alt="" draggable="false"/>`
      : `<span class="origin-marker__dot"></span>`;
    el.addEventListener('mouseenter', () => {
      const pm = playingMarkerRef.current;
      if (!pm) return;
      setDelayedHover(null);
      setHoverDot(null);
      hoverIdRef.current = null;
      if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
      setMarkerHover(pm);
      const g = globeRef.current as unknown as {
        getScreenCoords?: (lat: number, lng: number, alt: number) => { x: number; y: number };
      };
      const xy = g?.getScreenCoords?.(pm.lat, pm.lng, 0.019);
      if (xy) setHoverXY(xy);
    });
    el.addEventListener('mouseleave', () => setMarkerHover(null));
    return el;
  };

  return (
    <div ref={wrapRef} className="world-globe" onMouseMove={onGlobeMouseMove}>
      {size.w > 0 && (
        <Globe
          ref={globeRef}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeMaterial={globeMaterial}
          showAtmosphere
          atmosphereColor="#4455ff"
          atmosphereAltitude={0.18}
          polygonsData={features}
          polygonCapColor={capColor}
          polygonSideColor={() => COL.side}
          polygonStrokeColor={() => COL.stroke}
          /* CONSTANT altitude — the old hover extrusion (0.03) lifted the
             country cap ABOVE the song dots, so the polygon swallowed
             every dot click. Dots must always sit on top. */
          polygonAltitude={0.01}
          polygonLabel={() => ''}
          onPolygonHover={onPolyHover}
          onPolygonClick={onClick}
          polygonsTransitionDuration={220}
          /* song dots — camera-facing sprites: genuinely 2D circles from
             every angle (the built-in points layer extrudes cylinders). */
          customLayerData={dots}
          customThreeObject={(d: object) => {
            const dot = d as SongDot;
            const sprite = new THREE.Sprite(dotMaterial(colorFor(dot.genreIdx)));
            sprite.scale.set(DOT_SCALE, DOT_SCALE, 1);
            return sprite;
          }}
          customThreeObjectUpdate={(obj: object, d: object) => {
            const dot = d as SongDot;
            const g = globeRef.current as unknown as {
              getCoords?: (lat: number, lng: number, alt: number) => { x: number; y: number; z: number };
            };
            const pos = g?.getCoords?.(dot.lat, dot.lng, DOT_ALTITUDE);
            if (pos) (obj as THREE.Sprite).position.set(pos.x, pos.y, pos.z);
            (obj as THREE.Sprite).material = dotMaterial(colorFor(dot.genreIdx));
          }}
          onCustomLayerHover={onDotHover}
          onCustomLayerClick={(d: object) => { void playDotRef.current(d as SongDot); }}
          /* the playing song — avatar + sonar ring */
          htmlElementsData={htmlMarkers}
          htmlLat={(d: object) => (d as { lat: number }).lat}
          htmlLng={(d: object) => (d as { lng: number }).lng}
          htmlAltitude={0.019}
          htmlElement={makeMarkerEl}
          htmlElementVisibilityModifier={(el: HTMLElement, visible: boolean) => {
            el.style.opacity = visible ? '1' : '0';
            el.style.pointerEvents = visible ? 'auto' : 'none';
          }}
          ringsData={htmlMarkers}
          ringLat={(d: object) => (d as { lat: number }).lat}
          ringLng={(d: object) => (d as { lng: number }).lng}
          ringAltitude={0.016}
          ringColor={() => (t: number) => `rgba(150, 160, 255, ${Math.max(0, 0.8 * (1 - t))})`}
          ringMaxRadius={2.2}
          ringPropagationSpeed={1.4}
          ringRepeatPeriod={1300}
        />
      )}

      {/* Genre rail — multi-select (max five). Every genre shows its own
          fixed color as a swatch; selecting fills the chip with it. */}
      <div className="world-genres" role="listbox" aria-label="Genre" aria-multiselectable="true">
        {GENRES.map((g, i) => {
          const active = selectedGenres.includes(i);
          const full = !active && selectedGenres.length >= MAX_GENRES;
          return (
            <button
              key={g}
              role="option"
              aria-selected={active}
              data-active={active ? 'true' : 'false'}
              className="world-genre-chip"
              style={{
                ['--chip-c' as string]: genreColor(g),
                ['--chip-ink' as string]: genreInk(g),
              } as React.CSSProperties}
              title={full ? STR.world.maxGenres : g}
              onClick={() => toggleGenre(i)}
            >
              {g}
            </button>
          );
        })}
      </div>

      {toast && <div className="world-toast" role="status">{toast}</div>}

      {/* Country hover — delayed pill. Hidden when any song/marker card is
          showing so the two hovers never overlap. */}
      {delayedHover && !hoverDot && !markerHover && (() => {
        const hasMusic = PLAYABLE_GEO_NAMES.has(delayedHover) || worldCovered.has(delayedHover);
        const iso = (GEO_ISO as Record<string, string>)[delayedHover];
        return (
          <div
            className="geo-tip-wrap"
            style={{ left: mouseRef.current.x, top: mouseRef.current.y }}
          >
            <div className="geo-tip" data-playable={String(hasMusic)}>
              {iso
                ? <img className="geo-tip__flag" src={`https://flagcdn.com/w80/${iso.toLowerCase()}.png`} alt="" />
                : <span className="geo-tip__flag geo-tip__flag--none" />}
              <span className="geo-tip__name">{delayedHover}</span>
            </div>
          </div>
        );
      })()}

      {/* Song/marker hover — same card for both dot hovers and the playing
          marker. Shows cover art, title, album, genre/country/year line. */}
      {(() => {
        const isDot = !!(hoverDot && hoverXY);
        const isMarker = !!(markerHover && hoverXY);
        if (!isDot && !isMarker) return null;
        const coverImg = isDot ? hoverTrack?.image : markerHover!.img;
        const title = isDot ? (hoverDot!.title ?? hoverDot!.artist) : markerHover!.title;
        const album = isDot ? (hoverTrack?.album ?? hoverDot!.artist) : markerHover!.album;
        const genreName = isDot ? (GENRES[hoverDot!.genreIdx] ?? '') : (GENRES[markerHover!.genreIdx] ?? '');
        const country = isDot ? hoverDot!.country : markerHover!.place;
        const date = isDot ? hoverTrack?.releaseDate : markerHover!.releaseDate;
        return (
          <div
            className="song-hover"
            style={{
              left: Math.min(Math.max(hoverXY!.x, 132), Math.max(size.w - 132, 132)),
              top: Math.max(hoverXY!.y, 96),
            }}
          >
            {coverImg
              ? <img className="song-hover__cover" src={coverImg} alt="" />
              : <div className="song-hover__cover" />}
            <div className="song-hover__meta">
              <strong className="song-hover__title">{title}</strong>
              <span className="song-hover__album">{album}</span>
              <span className="song-hover__about">
                {STR.card.aboutFallback(genreName, country, releaseYear(date))}
              </span>
            </div>
          </div>
        );
      })()}

      {status === 'empty' && (
        <div className="world-hint">{STR.world.tapHint}</div>
      )}
    </div>
  );
}
