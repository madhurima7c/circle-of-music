'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/lib/store';
import { formatDuration } from '@/lib/data';
import {
  useFinds, usePlaylists, removeFind, findToTrack,
  createPlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist,
  removeFinds, addBulkToPlaylist, removeBulkFromPlaylist,
  type Find,
} from '@/lib/library';
import { trackLinks } from '@/lib/links';
import { STR } from '@/lib/strings';
import { BrandIcon } from '@/components/Overlay';

export function LikedSongs({ open, onClose }: { open: boolean; onClose: () => void }) {
  const finds = useFinds();
  const playlists = usePlaylists();
  const { loadQueue } = useStore();

  const [view, setView] = useState<'all' | string>('all');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [share, setShare] = useState<{ find: Find; x: number; y: number; down: boolean } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

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

  const switchView = (v: string) => {
    setView(v);
    setSelected(new Set());
    setMoveOpen(false);
  };

  const submitCreate = () => {
    const name = newName.trim();
    if (name) {
      const pl = createPlaylist(name);
      switchView(pl.id);
    }
    setNewName('');
    setCreating(false);
  };

  /* ---- selection ---- */
  const allSelected = rows.length > 0 && rows.every(f => selected.has(f.id));
  const someSelected = selected.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map(f => f.id)));
  };

  const toggleSelect = (id: number) => {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearSelected = () => {
    const ids = [...selected];
    if (activePlaylist) {
      removeBulkFromPlaylist(activePlaylist.id, ids);
    } else {
      removeFinds(ids);
    }
    setSelected(new Set());
  };

  const moveSelectedTo = (plId: string) => {
    const n = selected.size;
    addBulkToPlaylist(plId, [...selected]);
    setSelected(new Set());
    setMoveOpen(false);
    setNotice(`Added ${n} song${n === 1 ? '' : 's'}`);
    setTimeout(() => setNotice(''), 2600);
  };

  /* ---- export (respects active view) ---- */
  const viewLabel = (activePlaylist?.name ?? 'liked-songs').toLowerCase().replace(/\s+/g, '-');

  const doExportJson = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${viewLabel}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

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
    a.download = `${viewLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  // Portaled to <body>: the page frames set `isolation: isolate`, which traps
  // anything rendered inside them below the root-level Spotify strip no matter
  // their z-index. At body level the z-index applies as intended.
  return createPortal(
    <>
      <div className="dock-scrim liked-scrim" onClick={onClose} />
      <div className="liked" role="dialog" aria-label={STR.playlists.title}>
        {/* Sidebar */}
        <aside className="liked__side">
          <div className="liked__side-title">{STR.playlists.title}</div>

          <button
            className="liked__pl"
            data-active={view === 'all' ? 'true' : 'false'}
            onClick={() => switchView('all')}
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
              onClick={() => switchView(pl.id)}
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
            <div className="liked__export-wrap">
              <button
                className="liked__export-btn"
                onClick={() => setExportOpen(o => !o)}
                disabled={!rows.length}
              >
                {STR.library.export}
                <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 5l3 3 3-3" />
                </svg>
              </button>
              {exportOpen && (
                <div className="liked__export-menu">
                  <button onClick={doExportCsv}>
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M8 10V2" /><path d="M5 7l3 3 3-3" /><path d="M3 12h10" />
                    </svg>
                    CSV
                  </button>
                  <button onClick={doExportJson}>
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M8 10V2" /><path d="M5 7l3 3 3-3" /><path d="M3 12h10" />
                    </svg>
                    JSON
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Song list */}
        <section className="liked__main">
          <header className="liked__head">
            <input
              type="checkbox"
              className="liked__check"
              checked={allSelected}
              onChange={toggleSelectAll}
              title={allSelected ? STR.library.deselectAll : STR.library.selectAll}
              disabled={!rows.length}
            />
            <span className="liked__head-title">
              {activePlaylist ? activePlaylist.name : STR.playlists.all}
            </span>
            {someSelected && (
              <>
                <span className="liked__sel-count">{selected.size}</span>
                <button className="liked__bulk-clear" onClick={clearSelected}>
                  {STR.library.clearSelected}
                </button>
                {playlists.length > 0 && !activePlaylist && (
                  <div className="liked__bulk-move">
                    <button className="liked__bulk-move-btn" onClick={() => setMoveOpen(o => !o)}>
                      {STR.library.addToPlaylist}
                      <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M3 5l3 3 3-3" />
                      </svg>
                    </button>
                    {moveOpen && (
                      <div className="liked__bulk-move-menu">
                        {playlists.map(pl => (
                          <button key={pl.id} onClick={() => moveSelectedTo(pl.id)}>
                            {pl.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {activePlaylist && !someSelected && (
              <button
                className="liked__delete"
                onClick={() => { deletePlaylist(activePlaylist.id); switchView('all'); }}
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
                  data-selected={selected.has(f.id) ? 'true' : 'false'}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/x-track-id', String(f.id));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <input
                    type="checkbox"
                    className="liked__check"
                    checked={selected.has(f.id)}
                    onChange={() => toggleSelect(f.id)}
                  />
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
                      const down = r.top < 220;
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

      {/* Compact listen-in — icons only, horizontal */}
      {share && typeof document !== 'undefined' && (() => {
        const links = trackLinks(share.find.artist, share.find.title, share.find.id);
        return createPortal(
          <>
            <div className="listen-scrim" onClick={() => setShare(null)} />
            <div
              className={`listen-menu listen-menu--compact listen-menu--overlay${share.down ? ' listen-menu--down' : ''}`}
              role="menu"
              aria-label={STR.card.listenIn}
              style={{ left: share.x, top: share.y }}
            >
              <a role="menuitem" href={links.spotify} target="_blank" rel="noreferrer" title="Spotify"><BrandIcon kind="spotify" /></a>
              <a role="menuitem" href={links.appleMusic} target="_blank" rel="noreferrer" title="Apple Music"><BrandIcon kind="apple" /></a>
              <a role="menuitem" href={links.youtube} target="_blank" rel="noreferrer" title="YouTube"><BrandIcon kind="youtube" /></a>
              <a role="menuitem" href={links.deezer} target="_blank" rel="noreferrer" title="Deezer"><BrandIcon kind="deezer" /></a>
            </div>
          </>,
          document.body,
        );
      })()}
    </>,
    document.body,
  );
}
