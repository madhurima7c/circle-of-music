'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useStore } from '@/lib/store';
import { GENRES } from '@/lib/data';
import { GEO_URL, PLAYABLE_GEO_NAMES, seedCountryIdx } from '@/lib/geo';
import { originFor, type ArtistOrigin } from '@/lib/origins';
import { originForLive } from '@/lib/origins-live';
import { storyFor, releaseYear, normKey } from '@/lib/stories';
import { STR } from '@/lib/strings';

type Feature = {
  properties: { NAME: string; LABEL_X: number; LABEL_Y: number; [k: string]: unknown };
  [k: string]: unknown;
};

/** What the flat map markers represent — toggled by the filter button. */
type DotMode = 'artists' | 'songs';

/** One flat marker on the globe (artist or song, depending on mode). */
type Marker = {
  lat: number;
  lng: number;
  id: string;
  playing: boolean;
  img: string;          // avatar (artist mode) — '' renders a plain dot
  firstIdx: number;     // queue index a click jumps to
  popupHtml: string;    // prebuilt, escaped hover popup content
};

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

export default function WorldGlobe() {
  const {
    genreIdx, status, tracks, trackIdx, countryName,
    playPlace, playPlaceNamed, setGenre, setTrackIdx, setIsPlaying,
  } = useStore();
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const genresRef = useRef<HTMLDivElement | null>(null);

  const [features, setFeatures] = useState<Feature[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedGeo, setSelectedGeo] = useState<string | null>(null);
  const [dotMode, setDotMode] = useState<DotMode>('artists');
  // Countries the world-seeds pipeline has verified artists for.
  const [worldCovered, setWorldCovered] = useState<Set<string>>(new Set());

  useEffect(() => {
    import('@/lib/world-seeds.json')
      .then((m) => {
        const data = (m.default ?? m) as unknown as Record<string, { top: string[] }>;
        setWorldCovered(new Set(Object.keys(data).filter((k) => data[k].top.length > 0)));
      })
      .catch(() => {});
  }, []);

  // Dot mode lives in the shared dock's More menu now — read the saved
  // choice on mount and follow menu changes via a window event.
  useEffect(() => {
    const saved = window.localStorage.getItem('worldDots');
    if (saved === 'songs' || saved === 'artists') setDotMode(saved);
    const onDots = (e: Event) => {
      const mode = (e as CustomEvent).detail;
      if (mode === 'songs' || mode === 'artists') setDotMode(mode);
    };
    window.addEventListener('world:dots', onDots);
    return () => window.removeEventListener('world:dots', onDots);
  }, []);

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

  /* ---------- keep the active genre visible in the rail ---------- */
  useEffect(() => {
    genresRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [genreIdx]);

  /* Dev-only: the headless preview can't raycast canvas clicks (no rAF in
   * hidden tabs), so expose the tap actions for scripted verification. */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as Record<string, unknown>).__world = {
      select: (name: string, gi?: number) => {
        setSelectedGeo(name);
        const idx = seedCountryIdx(name);
        if (idx >= 0) playPlace(idx, gi);
        else playPlaceNamed(name, gi);
      },
    };
  }, [playPlace, playPlaceNamed]);

  // Country-level zoom: close enough that the country fills the view (the
  // globe may overflow the frame — users zoom/rotate out freely).
  const flyTo = (f: Feature) => {
    globeRef.current?.pointOfView(
      { lat: f.properties.LABEL_Y, lng: f.properties.LABEL_X, altitude: 0.7 },
      1000,
    );
  };

  // Any nation plays: seeded countries use the curated pipeline, the rest
  // go through the world-seeds/MusicBrainz tiers.
  const onClick = (feat: object) => {
    const f = feat as Feature;
    const name = f.properties.NAME;
    flyTo(f);
    // Re-clicking the loaded country (e.g. a double-click while zooming)
    // must not refetch — that emptied the queue and stripped the dots.
    if (name === selectedGeo && status !== 'error' && status !== 'empty') return;
    setSelectedGeo(name);
    const idx = seedCountryIdx(name);
    if (idx >= 0) playPlace(idx, genreIdx);
    else playPlaceNamed(name, genreIdx);
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

  /* ---------- flat markers: artists (avatars) or songs (dots) ---------- */
  const playingArtist = tracks[trackIdx]?.artist ?? null;
  const genre = GENRES[genreIdx] ?? '';

  // Origins for artists outside the build-time table (MusicBrainz finds on
  // unseeded countries) resolve live against Wikidata and stream in.
  const [liveOrigins, setLiveOrigins] = useState<Record<string, ArtistOrigin>>({});
  useEffect(() => {
    if (!tracks.length) return;
    let alive = true;
    [...new Set(tracks.map(t => t.artist).filter(Boolean))].forEach((a) => {
      if (originFor(a)) return;
      originForLive(a).then((o) => {
        if (!alive || !o) return;
        setLiveOrigins(prev =>
          prev[normKey(a)] ? prev : { ...prev, [normKey(a)]: o });
      });
    });
    return () => { alive = false; };
  }, [tracks]);
  const lookupOrigin = (artist: string): ArtistOrigin | null =>
    originFor(artist) ?? liveOrigins[normKey(artist)] ?? null;

  const markers = useMemo<Marker[]>(() => {
    // Dots belong to the zoomed-country moment: nothing until a pick lands.
    if (!selectedGeo || status !== 'ready' || !tracks.length) return [];

    if (dotMode === 'artists') {
      const seen = new Map<string, Marker>();
      tracks.forEach((t, i) => {
        if (!t.artist || seen.has(t.artist)) return;
        const o = lookupOrigin(t.artist);
        if (!o) return;
        const where = o.place && o.place !== o.country ? `${o.place}, ${o.country}` : o.place || o.country;
        const songs = tracks.filter(x => x.artist === t.artist).slice(0, 3).map(x => x.title);
        const story = storyFor(t.artist, countryName, genre);
        const playing = t.artist === playingArtist;
        seen.set(t.artist, {
          lat: o.lat, lng: o.lng, id: `a:${t.artist}`,
          // Reference style: a field of small uniform dots; only the playing
          // marker carries artwork (avatar + sonar ring).
          img: playing ? t.image || '' : '',
          playing, firstIdx: i,
          popupHtml:
            `<strong>${esc(t.artist)}</strong>` +
            `<span class="origin-pop__where">${esc(where)}</span>` +
            `<span class="origin-pop__songs">${esc(songs.join(' · '))}</span>` +
            (story ? `<span class="origin-pop__story">${esc(story)}</span>` : '') +
            `<span class="origin-pop__cta">${STR.world.dotCta}</span>`,
        });
      });
      return [...seen.values()];
    }

    // songs mode: one dot per track, fanned out around the artist's origin
    // so same-city songs stay individually hoverable.
    const perSpot = new Map<string, number>();
    const out: Marker[] = [];
    tracks.forEach((t, i) => {
      if (!t.artist) return;
      const o = lookupOrigin(t.artist);
      if (!o) return;
      const spotKey = `${o.lat}|${o.lng}`;
      const n = perSpot.get(spotKey) ?? 0;
      perSpot.set(spotKey, n + 1);
      const jLat = n === 0 ? 0 : 0.55 * Math.cos(n * 2.4);
      const jLng = n === 0 ? 0 : 0.55 * Math.sin(n * 2.4);
      const where = o.place && o.place !== o.country ? `${o.place}, ${o.country}` : o.place || o.country;
      const year = releaseYear(t.releaseDate);
      const story = storyFor(t.artist, countryName, genre);
      const playing = i === trackIdx;
      out.push({
        lat: o.lat + jLat, lng: o.lng + jLng, id: `s:${t.id}`,
        img: playing ? t.image || '' : '',
        playing, firstIdx: i,
        popupHtml:
          `<strong>${esc(t.title)}</strong>` +
          `<span class="origin-pop__where">${esc(t.artist)}${year ? ` · ${year}` : ''}${t.album ? ` · ${esc(t.album)}` : ''}</span>` +
          `<span class="origin-pop__songs">${esc(where)}</span>` +
          (story ? `<span class="origin-pop__story">${esc(story)}</span>` : '') +
          `<span class="origin-pop__cta">${STR.world.dotCta}</span>`,
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lookupOrigin is stable per (tracks, liveOrigins)
  }, [selectedGeo, status, tracks, dotMode, playingArtist, trackIdx, countryName, genre, liveOrigins]);

  // Keep the sonar ring on the active spot — sound radiates from there.
  const playingMarker = useMemo(() => markers.find(m => m.playing) ?? null, [markers]);
  const rings = useMemo(() => (playingMarker ? [playingMarker] : []), [playingMarker]);

  const jumpTo = useRef((idx: number) => { setTrackIdx(idx); setIsPlaying(true); });
  jumpTo.current = (idx: number) => { setTrackIdx(idx); setIsPlaying(true); };

  const makeMarkerEl = (d: object) => {
    const m = d as Marker;
    const el = document.createElement('div');
    el.className = 'origin-marker';
    el.dataset.playing = m.playing ? 'true' : 'false';
    el.dataset.kind = m.img ? 'avatar' : 'dot';
    el.innerHTML =
      (m.img
        ? `<img class="origin-marker__img" src="${esc(m.img)}" alt="" draggable="false"/>`
        : `<span class="origin-marker__dot"></span>`) +
      `<div class="origin-pop">${m.popupHtml}</div>`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      jumpTo.current(m.firstIdx);
    });
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
          htmlElementsData={markers}
          htmlLat={(d: object) => (d as Marker).lat}
          htmlLng={(d: object) => (d as Marker).lng}
          htmlAltitude={0.015}
          htmlElement={makeMarkerEl}
          htmlElementVisibilityModifier={(el: HTMLElement, visible: boolean) => {
            el.style.opacity = visible ? '1' : '0';
            el.style.pointerEvents = visible ? 'auto' : 'none';
          }}
          ringsData={rings}
          ringLat={(d: object) => (d as Marker).lat}
          ringLng={(d: object) => (d as Marker).lng}
          ringAltitude={0.016}
          ringColor={() => (t: number) => `rgba(150, 160, 255, ${Math.max(0, 0.8 * (1 - t))})`}
          ringMaxRadius={2.2}
          ringPropagationSpeed={1.4}
          ringRepeatPeriod={1300}
        />
      )}

      {/* Genre rail — vertical list, separator lines, gradient fill on the
          active row; the genre used on a country tap. */}
      <div className="world-genres" role="listbox" aria-label="Genre" ref={genresRef}>
        {GENRES.map((g, i) => (
          <button
            key={g}
            role="option"
            aria-selected={i === genreIdx}
            data-active={i === genreIdx ? 'true' : 'false'}
            className="world-genre-chip"
            onClick={() => {
              setGenre(i);
              // if a country is already chosen, re-play it in the new genre
              if (!selectedGeo) return;
              const idx = seedCountryIdx(selectedGeo);
              if (idx >= 0) playPlace(idx, i);
              else playPlaceNamed(selectedGeo, i);
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
