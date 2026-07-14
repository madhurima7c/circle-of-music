'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useStore } from '@/lib/store';
import { GENRES } from '@/lib/data';
import { GEO_URL, PLAYABLE_GEO_NAMES, seedCountryIdx } from '@/lib/geo';
import { originFor } from '@/lib/origins';
import { storyFor, releaseYear } from '@/lib/stories';
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
  playable:      'rgba(31, 43, 214, 0.55)',   // accent — has curated music
  playableSel:   'rgba(120, 130, 255, 0.95)',
  dim:           'rgba(120, 120, 130, 0.10)',  // unseeded — still tappable (MusicBrainz tier)
  hover:         'rgba(205, 208, 220, 0.38)',  // light grey hover, both kinds
  dimHover:      'rgba(205, 208, 220, 0.22)',
  side:          'rgba(20, 20, 30, 0.45)',
  stroke:        'rgba(255, 255, 255, 0.18)',
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default function WorldGlobe() {
  const {
    genreIdx, status, tracks, trackIdx, countryName, handMode, toggleHandMode,
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

  useEffect(() => {
    const saved = window.localStorage.getItem('worldDots');
    if (saved === 'songs' || saved === 'artists') setDotMode(saved);
  }, []);
  const toggleDotMode = () => {
    setDotMode((m) => {
      const next = m === 'artists' ? 'songs' : 'artists';
      window.localStorage.setItem('worldDots', next);
      return next;
    });
  };

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

  /* ---------- constrain controls + gentle auto-spin until first pick ---------- */
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !size.w) return;
    const controls = g.controls();
    controls.enablePan = false;
    controls.minDistance = 120;   // allow the close country zoom
    controls.maxDistance = 520;
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.autoRotate = status === 'empty';
    controls.autoRotateSpeed = 0.35;
    g.pointOfView({ altitude: 2.4 }, 0);
  }, [size.w, status]);

  /* ---------- keep the active genre visible in the rail ---------- */
  useEffect(() => {
    genresRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [genreIdx]);

  // Country-level zoom: close enough that the country fills the view (the
  // globe may overflow the frame — users zoom/rotate out freely).
  const flyTo = (f: Feature) => {
    globeRef.current?.pointOfView(
      { lat: f.properties.LABEL_Y, lng: f.properties.LABEL_X, altitude: 0.7 },
      1000,
    );
  };

  // Any nation plays: seeded countries use the curated pipeline, the rest
  // go through the MusicBrainz tier (thin but real).
  const onClick = (feat: object) => {
    const f = feat as Feature;
    const name = f.properties.NAME;
    setSelectedGeo(name);
    flyTo(f);
    const idx = seedCountryIdx(name);
    if (idx >= 0) playPlace(idx, genreIdx);
    else playPlaceNamed(name, genreIdx);
  };

  // Spin to a random curated country and play it (the radio.garden moment).
  const shuffle = () => {
    const playable = features.filter(f => PLAYABLE_GEO_NAMES.has(f.properties.NAME));
    if (!playable.length) return;
    onClick(playable[Math.floor(Math.random() * playable.length)]);
  };

  const capColor = (feat: object) => {
    const name = (feat as Feature).properties.NAME;
    const playable = PLAYABLE_GEO_NAMES.has(name);
    if (name === selectedGeo) return COL.playableSel;
    if (name === hovered) return playable ? COL.hover : COL.dimHover;
    return playable ? COL.playable : COL.dim;
  };

  const label = (feat: object) => {
    const name = (feat as Feature).properties.NAME;
    const playable = PLAYABLE_GEO_NAMES.has(name);
    return `<div class="globe-tip" data-playable="${playable}">${esc(name)}${playable ? '' : STR.world.exploreSuffix}</div>`;
  };

  /* ---------- flat markers: artists (avatars) or songs (dots) ---------- */
  const playingArtist = tracks[trackIdx]?.artist ?? null;
  const genre = GENRES[genreIdx] ?? '';

  const markers = useMemo<Marker[]>(() => {
    // Dots belong to the zoomed-country moment: nothing until a pick lands.
    if (!selectedGeo || status !== 'ready' || !tracks.length) return [];

    if (dotMode === 'artists') {
      const seen = new Map<string, Marker>();
      tracks.forEach((t, i) => {
        if (!t.artist || seen.has(t.artist)) return;
        const o = originFor(t.artist);
        if (!o) return;
        const where = o.place && o.place !== o.country ? `${o.place}, ${o.country}` : o.place || o.country;
        const songs = tracks.filter(x => x.artist === t.artist).slice(0, 3).map(x => x.title);
        const story = storyFor(t.artist, countryName, genre);
        seen.set(t.artist, {
          lat: o.lat, lng: o.lng, id: `a:${t.artist}`, img: t.image || '',
          playing: t.artist === playingArtist, firstIdx: i,
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
      const o = originFor(t.artist);
      if (!o) return;
      const spotKey = `${o.lat}|${o.lng}`;
      const n = perSpot.get(spotKey) ?? 0;
      perSpot.set(spotKey, n + 1);
      const jLat = n === 0 ? 0 : 0.55 * Math.cos(n * 2.4);
      const jLng = n === 0 ? 0 : 0.55 * Math.sin(n * 2.4);
      const where = o.place && o.place !== o.country ? `${o.place}, ${o.country}` : o.place || o.country;
      const year = releaseYear(t.releaseDate);
      const story = storyFor(t.artist, countryName, genre);
      out.push({
        lat: o.lat + jLat, lng: o.lng + jLng, id: `s:${t.id}`, img: '',
        playing: i === trackIdx, firstIdx: i,
        popupHtml:
          `<strong>${esc(t.title)}</strong>` +
          `<span class="origin-pop__where">${esc(t.artist)}${year ? ` · ${year}` : ''}${t.album ? ` · ${esc(t.album)}` : ''}</span>` +
          `<span class="origin-pop__songs">${esc(where)}</span>` +
          (story ? `<span class="origin-pop__story">${esc(story)}</span>` : '') +
          `<span class="origin-pop__cta">${STR.world.dotCta}</span>`,
      });
    });
    return out;
  }, [selectedGeo, status, tracks, dotMode, playingArtist, trackIdx, countryName, genre]);

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

      {/* Fab stack, bottom-right: hand toggle · dot filter · shuffle. */}
      <button
        className="world-fab world-fab--hand"
        data-active={handMode ? 'true' : 'false'}
        onClick={toggleHandMode}
        title={STR.world.handToggle}
        aria-label={STR.world.handToggle}
        aria-pressed={handMode}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 11V6a2 2 0 0 0-4 0v5" /><path d="M14 10V4a2 2 0 0 0-4 0v2" />
          <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
          <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
        </svg>
      </button>
      <button
        className="world-fab world-fab--filter"
        onClick={toggleDotMode}
        title={dotMode === 'artists' ? STR.world.filterToSongs : STR.world.filterToArtists}
        aria-label={dotMode === 'artists' ? STR.world.filterToSongs : STR.world.filterToArtists}
      >
        {dotMode === 'artists' ? (
          // person glyph — dots currently show artists
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
          </svg>
        ) : (
          // note glyph — dots currently show songs
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
        )}
      </button>
      <button className="world-fab world-fab--shuffle" onClick={shuffle} title={STR.world.surprise} aria-label={STR.world.surprise}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" />
        </svg>
      </button>
    </div>
  );
}
