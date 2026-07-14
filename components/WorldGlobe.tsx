'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useStore } from '@/lib/store';
import { GENRES } from '@/lib/data';
import { GEO_URL, PLAYABLE_GEO_NAMES, seedCountryIdx } from '@/lib/geo';
import { originFor } from '@/lib/origins';
import { storyFor } from '@/lib/stories';
import { STR } from '@/lib/strings';

type Feature = {
  properties: { NAME: string; LABEL_X: number; LABEL_Y: number; [k: string]: unknown };
  [k: string]: unknown;
};

/** One artist-origin dot on the globe, tied to a track in the queue. */
type OriginPt = {
  lat: number;
  lng: number;
  artist: string;
  place: string;
  country: string;
  precision: 'city' | 'country';
  firstIdx: number;   // first queue index by this artist — dot click jumps here
};

// Stylized, non-satellite palette (matches the app's ink/accent).
const COL = {
  playable:      'rgba(31, 43, 214, 0.55)',   // accent — has curated music
  playableHover: 'rgba(31, 43, 214, 0.9)',
  playableSel:   'rgba(120, 130, 255, 0.95)',
  dim:           'rgba(120, 120, 130, 0.10)',  // unseeded — still tappable (MusicBrainz tier)
  dimHover:      'rgba(120, 120, 130, 0.28)',
  side:          'rgba(20, 20, 30, 0.45)',
  stroke:        'rgba(255, 255, 255, 0.18)',
  dot:           'rgba(140, 150, 255, 0.75)',
  dotPlaying:    '#c3cbff',
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
    controls.minDistance = 180;
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

  const flyTo = (f: Feature) => {
    globeRef.current?.pointOfView(
      { lat: f.properties.LABEL_Y, lng: f.properties.LABEL_X, altitude: 1.6 },
      900,
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
    if (name === hovered) return playable ? COL.playableHover : COL.dimHover;
    return playable ? COL.playable : COL.dim;
  };

  const label = (feat: object) => {
    const name = (feat as Feature).properties.NAME;
    const playable = PLAYABLE_GEO_NAMES.has(name);
    return `<div class="globe-tip" data-playable="${playable}">${esc(name)}${playable ? '' : STR.world.exploreSuffix}</div>`;
  };

  /* ---------- artist-origin dots for the current queue ---------- */
  const points = useMemo<OriginPt[]>(() => {
    const byArtist = new Map<string, OriginPt>();
    tracks.forEach((t, i) => {
      if (!t.artist || byArtist.has(t.artist)) return;
      const o = originFor(t.artist);
      if (!o) return;
      byArtist.set(t.artist, {
        lat: o.lat, lng: o.lng,
        artist: t.artist, place: o.place, country: o.country,
        precision: o.precision, firstIdx: i,
      });
    });
    return [...byArtist.values()];
  }, [tracks]);

  const playingArtist = tracks[trackIdx]?.artist ?? null;
  const playingPt = useMemo(
    () => points.find(p => p.artist === playingArtist) ?? null,
    [points, playingArtist],
  );
  const rings = useMemo(() => (playingPt ? [playingPt] : []), [playingPt]);

  const originLabel = (d: object) => {
    const p = d as OriginPt;
    // Some Wikidata entries resolve place and country to the same label —
    // "Kumasi, Kumasi" reads broken, so collapse those.
    const where =
      p.place && p.place !== p.country ? `${p.place}, ${p.country}` : p.place || p.country;
    const story = storyFor(p.artist, countryName, GENRES[genreIdx]);
    return `<div class="globe-tip globe-tip--origin">
      <strong>${esc(p.artist)}</strong>
      <span class="globe-tip__where">${esc(where)}</span>
      ${story ? `<span class="globe-tip__story">${esc(story)}</span>` : ''}
      <span class="globe-tip__cta">${STR.world.dotCta}</span>
    </div>`;
  };

  const onPointClick = (d: object) => {
    const p = d as OriginPt;
    setTrackIdx(p.firstIdx);
    setIsPlaying(true);
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
            (f as Feature).properties.NAME === hovered ? 0.06 : 0.012}
          polygonLabel={label}
          onPolygonHover={(f: object | null) =>
            setHovered(f ? (f as Feature).properties.NAME : null)}
          onPolygonClick={onClick}
          polygonsTransitionDuration={220}
          pointsData={points}
          pointLat={(d: object) => (d as OriginPt).lat}
          pointLng={(d: object) => (d as OriginPt).lng}
          pointColor={(d: object) =>
            (d as OriginPt).artist === playingArtist ? COL.dotPlaying : COL.dot}
          pointAltitude={(d: object) =>
            (d as OriginPt).artist === playingArtist ? 0.09 : 0.035}
          pointRadius={(d: object) =>
            (d as OriginPt).precision === 'city' ? 0.32 : 0.55}
          pointLabel={originLabel}
          onPointClick={onPointClick}
          pointsTransitionDuration={400}
          ringsData={rings}
          ringLat={(d: object) => (d as OriginPt).lat}
          ringLng={(d: object) => (d as OriginPt).lng}
          ringColor={() => (t: number) => `rgba(150, 160, 255, ${Math.max(0, 0.8 * (1 - t))})`}
          ringMaxRadius={2.4}
          ringPropagationSpeed={1.4}
          ringRepeatPeriod={1300}
        />
      )}

      {/* Genre rail — vertical, left-docked; the genre used on a country tap. */}
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

      <button className="world-shuffle" onClick={shuffle} title={STR.world.surprise} aria-label={STR.world.surprise}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" />
        </svg>
      </button>
    </div>
  );
}
