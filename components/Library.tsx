'use client';

import { useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import {
  useFinds, removeFind, findToTrack, exportFinds, importFinds,
} from '@/lib/library';
import { STR } from '@/lib/strings';

/**
 * Library — top-right ♥ button with a saved-count badge, plus a slide-in
 * drawer of your finds. Clicking a find plays your whole library as a queue
 * from that point; export/import move the library as JSON (no account).
 */
export function Library() {
  const finds = useFinds();
  const { loadQueue } = useStore();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const playFrom = (idx: number) => {
    loadQueue(finds.map(findToTrack), idx);
  };

  const doExport = () => {
    const blob = new Blob([exportFinds()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'circle-of-music-finds.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = (file: File) => {
    file.text().then(text => {
      const n = importFinds(text);
      setNotice(STR.library.imported(n));
      setTimeout(() => setNotice(''), 2600);
    });
  };

  return (
    <>
      <button
        className="library-btn"
        onClick={() => setOpen(o => !o)}
        title={STR.library.open}
        aria-label={STR.library.open}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill={finds.length ? 'currentColor' : 'none'}
          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
        {finds.length > 0 && <span className="library-btn__count">{finds.length}</span>}
      </button>

      {open && (
        <>
          <div className="library-scrim" onClick={() => setOpen(false)} />
          <aside className="library-drawer" role="dialog" aria-label={STR.library.title}>
            <header className="library-drawer__head">
              <span className="library-drawer__title">{STR.library.title} ({finds.length})</span>
              <button className="library-drawer__close" onClick={() => setOpen(false)} aria-label={STR.library.close}>×</button>
            </header>

            {finds.length === 0 ? (
              <p className="library-drawer__empty">{STR.library.empty}</p>
            ) : (
              <ul className="library-list">
                {finds.map((f, i) => (
                  <li key={f.id} className="library-item">
                    <button className="library-item__play" onClick={() => playFrom(i)} title={STR.card.playPause}>
                      {f.image
                        ? <img src={f.image} alt="" />
                        : <span className="library-item__ph" />}
                      <span className="library-item__play-icon">▶</span>
                    </button>
                    <div className="library-item__meta" onClick={() => playFrom(i)}>
                      <div className="library-item__title">{f.title}</div>
                      <div className="library-item__sub">{f.artist}</div>
                      <div className="library-item__ctx">{f.country} · {f.genre}</div>
                    </div>
                    <button className="library-item__remove" onClick={() => removeFind(f.id)} aria-label={STR.library.remove} title={STR.library.remove}>×</button>
                  </li>
                ))}
              </ul>
            )}

            <footer className="library-drawer__foot">
              {notice && <span className="library-drawer__notice">{notice}</span>}
              <button className="library-drawer__action" onClick={doExport} disabled={!finds.length}>{STR.library.export}</button>
              <button className="library-drawer__action" onClick={() => fileRef.current?.click()}>{STR.library.import}</button>
              <input
                ref={fileRef} type="file" accept="application/json" hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }}
              />
            </footer>
          </aside>
        </>
      )}
    </>
  );
}
