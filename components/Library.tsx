'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/lib/store';
import { formatDuration } from '@/lib/data';
import {
  useFinds, usePlaylists, removeFind, findToTrack, exportFinds, importFinds,
  createPlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist,
  type Find,
} from '@/lib/library';
import { trackLinks } from '@/lib/links';
import { STR } from '@/lib/strings';
import { BrandIcon } from '@/components/Overlay';

/**
 * LikedSongs — the ♥ popup opened from the dock (Spotify-style IA):
 * a sidebar with "All liked" + user playlists (+ create), and a song list
 * on the right. Songs drag-and-drop onto playlists in the sidebar; a
 * playlist view lets you remove songs from it. Clicking a song plays the
 * current view as a queue from that point. All local (localStorage).
 */
export function LikedSongs({ open, onClose }: { open: boolean; onClose: () => void }) {
  const finds = useFinds();
  const playlists = usePlaylists();
  const { loadQueue } = useStore();

  const [view, setView] = useState<'all' | string>('all');   // 'all' | playlist id
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  // Per-row "listen in" popover — same menu as the player's share button.
  // `down` flips it below the button when the row is too close to the top.
  const [share, setShare] = useState<{ find: Find; x: number; y: number; down: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const activePlaylist = view === 'all' ? null : playlists.find(p => p.id === view) ?? null;
  const byId = new Map(finds.map(f => [f.id, f]));
  const rows: Find[] = activePlaylist
    ? activePlaylist.trackIds.map(id => byId.get(id)).filter((f): f is Find => !!f)
    : finds;

  const playFrom = (idx: number) => {
    if (!rows.length) return;
    loadQueue(rows.map(findToTrack), idx);
  };

  const submitCreate = () => {
    const name = newName.trim();
    if (name) {
      const pl = createPlaylist(name);
      setView(pl.id);
    }
    setNewName('');
    setCreating(false);
  };

  const doExport = () => {
    const blob = new Blob([exportFinds()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'music-exploration-finds.json';
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

  /* CSV of the ACTIVE view (all liked or one playlist) — the format the
   * playlist-transfer tools (TuneMyMusic, Soundiiz) ingest to build a real
   * Spotify/Apple/YouTube playlist in the user's own account. */
  const doExportCsv = () => {
    const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
    const csv = [
      'Title,Artist,Album',
      ...rows.map(f => [esc(f.title), esc(f.artist), esc(f.album)].join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activePlaylist?.name ?? 'liked-songs').toLowerCase().replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="dock-scrim" onClick={onClose} />
      <div className="liked" role="dialog" aria-label={STR.playlists.title}>
        {/* Sidebar: All liked + playlists (drop targets) + create. */}
        <aside className="liked__side">
          <div className="liked__side-title">{STR.playlists.title}</div>

          <button
            className="liked__pl"
            data-active={view === 'all' ? 'true' : 'false'}
            onClick={() => setView('all')}
          >
            <span className="liked__pl-icon" aria-hidden>♥</span>
            {STR.playlists.all}
            <span className="liked__pl-count tabular">{finds.length}</span>
          </button>

          {playlists.length > 0 && (
            <div className="liked__side-sub">{STR.playlists.yourPlaylists}</div>
          )}
          {playlists.map(pl => (
            <button
              key={pl.id}
              className="liked__pl"
              data-active={view === pl.id ? 'true' : 'false'}
              data-dragover={dragOver === pl.id ? 'true' : 'false'}
              onClick={() => setView(pl.id)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(pl.id); }}
              onDragLeave={() => setDragOver(d => (d === pl.id ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = Number(e.dataTransfer.getData('text/x-track-id'));
                if (id) addToPlaylist(pl.id, id);
              }}
            >
              <span className="liked__pl-icon" aria-hidden>♪</span>
              <span className="liked__pl-name">{pl.name}</span>
              <span className="liked__pl-count tabular">{pl.trackIds.length}</span>
            </button>
          ))}

          {creating ? (
            <div className="liked__new">
              <input
                autoFocus
                value={newName}
                placeholder={STR.playlists.namePlaceholder}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitCreate();
                  if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                }}
              />
              <button onClick={submitCreate}>{STR.playlists.create}</button>
            </div>
          ) : (
            <button className="liked__pl liked__pl--new" onClick={() => setCreating(true)}>
              <span className="liked__pl-icon" aria-hidden>＋</span>
              {STR.playlists.newPlaylist}
            </button>
          )}

          <div className="liked__side-foot">
            {notice
              ? <span className="liked__notice">{notice}</span>
              : <span className="liked__hint">{STR.playlists.dragHint}</span>}
            <div className="liked__side-actions">
              <button onClick={doExport} disabled={!finds.length}>{STR.library.export}</button>
              <button onClick={() => fileRef.current?.click()}>{STR.library.import}</button>
              <button onClick={doExportCsv} disabled={!rows.length} title={STR.library.exportCsvHint}>
                {STR.library.exportCsv}
              </button>
              <input
                ref={fileRef} type="file" accept="application/json" hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }}
              />
            </div>
          </div>
        </aside>

        {/* Song list for the active view. */}
        <section className="liked__main">
          <header className="liked__head">
            <span className="liked__head-title">
              {activePlaylist ? activePlaylist.name : STR.playlists.all}
            </span>
            {activePlaylist && (
              <button
                className="liked__delete"
                onClick={() => { deletePlaylist(activePlaylist.id); setView('all'); }}
                title={STR.playlists.deletePlaylist}
              >
                {STR.playlists.deletePlaylist}
              </button>
            )}
            <button className="liked__close" onClick={onClose} aria-label={STR.library.close}>×</button>
          </header>

          {rows.length === 0 ? (
            <p className="liked__empty">
              {activePlaylist ? STR.playlists.emptyPlaylist : STR.playlists.emptyAll}
            </p>
          ) : (
            <ul className="liked__list">
              {rows.map((f, i) => (
                <li
                  key={f.id}
                  className="liked__row"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/x-track-id', String(f.id));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <button className="liked__row-main" onClick={() => playFrom(i)}>
                    {f.image ? <img src={f.image} alt="" loading="lazy" /> : <span className="liked__row-ph" />}
                    <span className="liked__row-meta">
                      <span className="liked__row-title">{f.title}</span>
                      <span className="liked__row-artist">{f.artist}</span>
                    </span>
                    <span className="liked__row-ctx">{f.country} · {f.genre}</span>
                    <span className="liked__row-dur tabular">{formatDuration(f.duration)}</span>
                  </button>
                  <button
                    className="liked__row-share"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const down = r.top < 220; // no headroom → open below
                      setShare(s => (s?.find.id === f.id
                        ? null
                        : { find: f, x: r.left + r.width / 2, y: down ? r.bottom + 8 : r.top - 8, down }));
                    }}
                    title={STR.card.listenIn}
                    aria-label={STR.card.listenIn}
                    aria-expanded={share?.find.id === f.id}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 15V4" />
                      <path d="M8 8l4-4 4 4" />
                      <path d="M5 13v6h14v-6" />
                    </svg>
                  </button>
                  <button
                    className="liked__row-remove"
                    onClick={() =>
                      activePlaylist
                        ? removeFromPlaylist(activePlaylist.id, f.id)
                        : removeFind(f.id)
                    }
                    title={activePlaylist ? STR.playlists.removeFromPlaylist : STR.library.remove}
                    aria-label={activePlaylist ? STR.playlists.removeFromPlaylist : STR.library.remove}
                  >×</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Row share — the player's "listen in" menu, anchored to the row's
          share button (body portal so the popup can never clip it). */}
      {share && typeof document !== 'undefined' && (() => {
        const links = trackLinks(share.find.artist, share.find.title, share.find.id);
        return createPortal(
          <>
            <div className="listen-scrim" onClick={() => setShare(null)} />
            <div
              className={`listen-menu listen-menu--overlay${share.down ? ' listen-menu--down' : ''}`}
              role="menu"
              aria-label={STR.card.listenIn}
              style={{ left: share.x, top: share.y }}
            >
              <div className="listen-menu__head">{STR.card.listenIn.toUpperCase()}</div>
              <a role="menuitem" href={links.spotify} target="_blank" rel="noreferrer"><BrandIcon kind="spotify" />Spotify</a>
              <a role="menuitem" href={links.appleMusic} target="_blank" rel="noreferrer"><BrandIcon kind="apple" />Apple Music</a>
              <a role="menuitem" href={links.youtube} target="_blank" rel="noreferrer"><BrandIcon kind="youtube" />Youtube</a>
              <a role="menuitem" href={links.deezer} target="_blank" rel="noreferrer"><BrandIcon kind="deezer" />Deezer</a>
            </div>
          </>,
          document.body,
        );
      })()}
    </>
  );
}
