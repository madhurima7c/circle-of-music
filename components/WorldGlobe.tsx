'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useStore } from '@/lib/store';
import { GENRES } from '@/lib/data';
import { GEO_URL, PLAYABLE_GEO_NAMES, seedCountryIdx } from '@/lib/geo';
import { STR } from '@/lib/strings';

type Feature = {
  properties: { NAME: string; LABEL_X: number; LABEL_Y: number; [k: string]: unknown };
  [k: string]: unknown;
};

// Stylized, non-satellite palette (matches the app's ink/accent).
const COL = {
  playable:      'rgba(31, 43, 214, 0.55)',   // accent — has music
  playableHover: 'rgba(31, 43, 214, 0.9)',
  playableSel:   'rgba(120, 130, 255, 0.95)',
  dim:           'rgba(120, 120, 130, 0.10)',  // unseeded countries
  dimHover:      'rgba(120, 120, 130, 0.22)',
  side:          'rgba(20, 20, 30, 0.45)',
  stroke:        'rgba(255, 255, 255, 0.18)',
};

export default function WorldGlobe() {
  const { countryIdx, genreIdx, status, playPlace, setGenre } = useStore();
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement | null>(null);

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

  const flyTo = (f: Feature) => {
    globeRef.current?.pointOfView(
      { lat: f.properties.LABEL_Y, lng: f.properties.LABEL_X, altitude: 1.6 },
      900,
    );
  };

  const onClick = (feat: object) => {
    const f = feat as Feature;
    const idx = seedCountryIdx(f.properties.NAME);
    if (idx < 0) return;  // no music for this country yet
    setSelectedGeo(f.properties.NAME);
    flyTo(f);
    playPlace(idx, genreIdx);  // instant audio, current genre
  };

  // Spin to a random playable country and play it (the radio.garden moment).
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
    return `<div class="globe-tip" data-playable="${playable}">${name}${playable ? '' : ' · no music yet'}</div>`;
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
        />
      )}

      {/* Genre chips — the genre used when you tap a country. */}
      <div className="world-genres" role="listbox" aria-label="Genre">
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
              if (countryIdx >= 0 && selectedGeo) playPlace(countryIdx, i);
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
