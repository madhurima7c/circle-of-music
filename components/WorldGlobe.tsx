'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useStore, toTrack } from '@/lib/store';
import { GENRES, SEEDS, type Track } from '@/lib/data';
import { GEO_URL, PLAYABLE_GEO_NAMES, geoName, seedCountry, seedCountryIdx } from '@/lib/geo';
import { searchArtistTracksStrict } from '@/lib/deezer';
import { originFor, type ArtistOrigin } from '@/lib/origins';
import { originForLive } from '@/lib/origins-live';
import { normKey } from '@/lib/stories';
import { STR } from '@/lib/strings';

type Feature = {
  properties: { NAME: string; LABEL_X: number; LABEL_Y: number; [k: string]: unknown };
  [k: string]: unknown;
};

/** One song dot on the globe: an artist in the selected genre, placed at
 *  their origin (curated coords) or near their country's label point. */
type SongDot = {
  id: string;
  artist: string;
  country: string;
  lat: number;
  lng: number;
};

type WorldEntry = { top: string[]; featured: string[]; genres: Record<string, string[]> };

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
  dot:           'rgba(60, 224, 128, 0.9)',    // song dots — radio.garden green
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
  // The World's own genre selection — null by default (nothing lit up).
  const [genreSel, setGenreSel] = useState<number | null>(null);
  const genreSelRef = useRef(genreSel);
  genreSelRef.current = genreSel;
  // Countries the world-seeds pipeline has verified artists for.
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
   *  Song dots — pick a genre and its songs light up around the world.
   *  One dot per artist in that genre (world-seeds for every nation +
   *  the hand-curated wheel seeds). Precise coords where the origins
   *  pipeline knows them; otherwise near the country's label point with
   *  a deterministic jitter so dots don't stack.
   * ===================================================================== */
  const labelPoints = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    features.forEach(f =>
      map.set(f.properties.NAME, { lat: f.properties.LABEL_Y, lng: f.properties.LABEL_X }));
    return map;
  }, [features]);

  const dots = useMemo<SongDot[]>(() => {
    if (genreSel == null || !worldSeeds || !labelPoints.size) return [];
    const genreName = GENRES[genreSel];
    const out: SongDot[] = [];
    const seen = new Set<string>();

    const push = (artist: string, geoNameKey: string) => {
      const k = normKey(artist);
      if (!k || seen.has(k)) return;
      seen.add(k);
      const o = originFor(artist);
      let lat: number, lng: number;
      if (o) {
        lat = o.lat; lng = o.lng;
      } else {
        const lp = labelPoints.get(geoNameKey);
        if (!lp) return;
        const h = hashCode(k);
        lat = lp.lat + ((h % 100) / 100 - 0.5) * 3.2;
        lng = lp.lng + (((h >> 7) % 100) / 100 - 0.5) * 3.2;
      }
      out.push({
        id: `${geoNameKey}|${k}`,
        artist,
        country: seedCountry(geoNameKey) ?? geoNameKey,
        lat, lng,
      });
    };

    // Hand-curated wheel seeds (precise origins for most).
    const seedArtists = SEEDS.artists as Record<string, Record<string, string[]>>;
    for (const country of Object.keys(seedArtists)) {
      (seedArtists[country][genreName] ?? []).forEach(a => push(a, geoName(country)));
    }
    // Every nation's verified artists in this genre.
    for (const [country, entry] of Object.entries(worldSeeds)) {
      (entry.genres?.[genreName] ?? []).forEach(a => push(a, country));
    }
    return out;
  }, [genreSel, worldSeeds, labelPoints]);
  const dotsRef = useRef(dots);
  dotsRef.current = dots;

  /* =====================================================================
   *  Dot playback chain — click a dot, its song plays; when a song ends
   *  the chain advances to the geographically NEAREST unplayed dot.
   *  Implemented as a rolling window: the next song is prefetched and
   *  appended to the queue before the current one finishes, so the
   *  player's normal advance lands on it seamlessly.
   * ===================================================================== */
  const chainActive = useRef(false);
  const playedDots = useRef(new Set<string>());
  const lastDot = useRef<SongDot | null>(null);
  const dotByQueueIdx = useRef<(SongDot | null)[]>([]);
  const prefetching = useRef(false);
  const songCache = useRef(new Map<string, Track | null>());

  const fetchSongForDot = async (dot: SongDot): Promise<Track | null> => {
    const genreName = genreSelRef.current != null ? GENRES[genreSelRef.current] : null;
    const key = `${genreName ?? 'any'}|${normKey(dot.artist)}`;
    if (songCache.current.has(key)) return songCache.current.get(key) ?? null;
    const raw = await searchArtistTracksStrict(dot.artist, genreName, 3).catch(() => []);
    const first = raw.find(t => t.preview) ?? null;
    const track = first ? toTrack(first) : null;
    songCache.current.set(key, track);
    return track;
  };

  const nearestUnplayed = (from: { lat: number; lng: number }): SongDot | null => {
    let best: SongDot | null = null;
    let bestD = Infinity;
    for (const d of dotsRef.current) {
      if (playedDots.current.has(d.id)) continue;
      const dist = haversine(from, d);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    return best;
  };

  /** Prefetch the next-nearest dot's song and append it to the queue —
   *  called right after a dot starts and again as playback reaches the
   *  end of the known queue. Skips dots whose artist has no playable
   *  preview and keeps hunting outward. */
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

  const playDot = async (dot: SongDot) => {
    chainActive.current = true;
    playedDots.current = new Set([dot.id]);
    lastDot.current = dot;
    setSelectedGeo(null);
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

  /* ---------- country taps: the country's songs start playing ---------- */
  const flyTo = (f: Feature) => {
    globeRef.current?.pointOfView(
      { lat: f.properties.LABEL_Y, lng: f.properties.LABEL_X, altitude: 0.7 },
      1000,
    );
  };

  const onClick = (feat: object) => {
    const f = feat as Feature;
    const name = f.properties.NAME;
    flyTo(f);
    // Re-clicking the loaded country (e.g. a double-click while zooming)
    // must not refetch — that emptied the queue and stripped the dots.
    if (name === selectedGeo && status !== 'error' && status !== 'empty') return;
    chainActive.current = false;           // country queue replaces the dot chain
    dotByQueueIdx.current = [];
    setSelectedGeo(name);
    const idx = seedCountryIdx(name);
    const gi = genreSelRef.current;        // null = no genre selected → country's best
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
      pickGenre: (i: number | null) => setGenreSel(i),
      dots: () => dotsRef.current,
      playDot: (i: number) => { const d = dotsRef.current[i]; if (d) void playDotRef.current(d); },
    };
  }, [playPlace, playPlaceNamed]);

  /* ---------- country paint ---------- */
  const capColor = (feat: object) => {
    const name = (feat as Feature).properties.NAME;
    const playable = PLAYABLE_GEO_NAMES.has(name);
    if (name === selectedGeo) return COL.playableSel;
    if (name === hovered) return playable || worldCovered.has(name) ? COL.hover : COL.dimHover;
    if (playable) return COL.playable;
    return worldCovered.has(name) ? COL.world : COL.dim;
  };

  const label = (feat: object) => {
    const name = (feat as Feature).properties.NAME;
    const hasMusic = PLAYABLE_GEO_NAMES.has(name) || worldCovered.has(name);
    return `<div class="globe-tip" data-playable="${hasMusic}">${esc(name)}${hasMusic ? '' : STR.world.exploreSuffix}</div>`;
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
      place: dot ? dot.country : (liveOrigin?.place || liveOrigin?.country || ''),
    };
  }, [status, track, trackIdx, liveOrigin]);
  const htmlMarkers = useMemo(() => (playingMarker ? [playingMarker] : []), [playingMarker]);

  const makeMarkerEl = (d: object) => {
    const m = d as NonNullable<typeof playingMarker>;
    const el = document.createElement('div');
    el.className = 'origin-marker';
    el.dataset.playing = 'true';
    el.dataset.kind = m.img ? 'avatar' : 'dot';
    el.innerHTML =
      (m.img
        ? `<img class="origin-marker__img" src="${esc(m.img)}" alt="" draggable="false"/>`
        : `<span class="origin-marker__dot"></span>`) +
      `<div class="origin-pop">` +
        `<strong>${esc(m.title)}</strong>` +
        `<span class="origin-pop__where">${esc(m.artist)}</span>` +
        (m.place ? `<span class="origin-pop__songs">${esc(m.place)}</span>` : '') +
      `</div>`;
    return el;
  };

  return (
    <div ref={wrapRef} className="world-globe">
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
          polygonAltitude={(f: object) =>
            (f as Feature).properties.NAME === hovered ? 0.03 : 0.012}
          polygonLabel={label}
          onPolygonHover={(f: object | null) =>
            setHovered(f ? (f as Feature).properties.NAME : null)}
          onPolygonClick={onClick}
          polygonsTransitionDuration={220}
          /* song dots — WebGL points, cheap even at 1000 dots */
          pointsData={dots}
          pointLat={(d: object) => (d as SongDot).lat}
          pointLng={(d: object) => (d as SongDot).lng}
          pointColor={() => COL.dot}
          pointAltitude={0.016}
          pointRadius={0.22}
          pointsMerge={false}
          pointLabel={(d: object) => {
            const s = d as SongDot;
            return `<div class="globe-tip" data-playable="true">${esc(s.artist)} · ${esc(s.country)}</div>`;
          }}
          onPointClick={(d: object) => { void playDotRef.current(d as SongDot); }}
          pointsTransitionDuration={400}
          /* the playing song — avatar + sonar ring */
          htmlElementsData={htmlMarkers}
          htmlLat={(d: object) => (d as { lat: number }).lat}
          htmlLng={(d: object) => (d as { lng: number }).lng}
          htmlAltitude={0.017}
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

      {/* Genre rail — none selected by default; picking one lights up its
          songs worldwide. Clicking the active genre clears the selection. */}
      <div className="world-genres" role="listbox" aria-label="Genre">
        {GENRES.map((g, i) => (
          <button
            key={g}
            role="option"
            aria-selected={i === genreSel}
            data-active={i === genreSel ? 'true' : 'false'}
            className="world-genre-chip"
            onClick={() => {
              const next = i === genreSel ? null : i;
              setGenreSel(next);
              // if a country is already chosen, re-play it under the new pick
              if (!selectedGeo || next === null) return;
              const idx = seedCountryIdx(selectedGeo);
              if (idx >= 0) playPlace(idx, next);
              else playPlaceNamed(selectedGeo, next);
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {status === 'empty' && (
        <div className="world-hint">{STR.world.tapHint}</div>
      )}
    </div>
  );
}
