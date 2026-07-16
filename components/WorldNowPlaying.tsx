'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { GENRES, formatDuration } from '@/lib/data';
import { trackLinks } from '@/lib/links';
import { STR } from '@/lib/strings';
import { toggleFind, useIsFind } from '@/lib/library';
import { storyFor, releaseYear } from '@/lib/stories';
import { originFor } from '@/lib/origins';
import { ProgressBar, BrandIcon } from '@/components/Overlay';

/**
 * WorldNowPlaying — the World's single compact now-playing card
 * (bottom-right). There is no queue list here: the globe IS the queue —
 * dots and countries drive what plays next. LEARN MORE reveals the
 * "listen to full song in" deep links.
 */
export function WorldNowPlaying() {
  const {
    tracks, trackIdx, status, isPlaying, autoplayBlocked,
    togglePlay, nextTrack, prevTrack, shuffleTracks, countryName, genreIdx,
  } = useStore();
  const track = tracks[trackIdx];
  const [more, setMore] = useState(false);
  const saved = useIsFind(track?.id);

  if (status === 'empty') return null;
  const pending = status === 'populating' || status === 'error';
  const links = track ? trackLinks(track.artist, track.title, track.id) : null;
  const genre = GENRES[genreIdx] ?? '';

  return (
    <div
      className="wnp"
      data-main-card=""
      data-playing={isPlaying ? 'true' : 'false'}
      data-autoplay-blocked={autoplayBlocked ? 'true' : 'false'}
      role="region"
      aria-label={STR.player.nowPlaying}
    >
      {pending || !track ? (
        <div className="wnp__pending">
          {status === 'error' ? STR.card.noResults : STR.card.populating}
        </div>
      ) : (
        <>
          <div className="wnp__now">
            {track.image
              ? <img className="wnp__cover" src={track.image} alt="" />
              : <div className="wnp__cover" />}
            <div className="wnp__meta">
              <div className="wnp__title">{track.title}</div>
              <div className="wnp__album">{track.album} — {track.artist}</div>
              <div className="wnp__about">
                {/* Story if curated; else where the artist is actually from
                    (dot chains roam the planet — the store's pairing country
                    would often be wrong here). */}
                {storyFor(track.artist, countryName, genre)
                  ?? STR.world.fromLine(
                       originFor(track.artist)?.country ?? null,
                       releaseYear(track.releaseDate),
                     )}
              </div>
            </div>
            <button
              className="center__heart"
              data-saved={saved ? 'true' : 'false'}
              onClick={() => toggleFind({
                id: track.id, title: track.title, artist: track.artist,
                album: track.album, image: track.image, preview: track.preview,
                country: countryName, genre, savedAt: Date.now(),
                releaseDate: track.releaseDate ?? null,
                duration: track.duration ?? null,
              })}
              title={saved ? STR.card.unsave : STR.card.save}
              aria-label={saved ? STR.card.unsave : STR.card.save}
              aria-pressed={saved}
            >
              <svg viewBox="0 0 24 24" width="15" height="15"
                fill={saved ? 'currentColor' : 'none'}
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
              </svg>
            </button>
          </div>

          <ProgressBar trackDuration={track.duration ?? null} />

          <div className="wnp__controls">
            <button className="ctrl ctrl--shuffle" onClick={() => shuffleTracks(true)} title={STR.card.shuffle} aria-label={STR.card.shuffle}>
              <svg className="ctrl__icon-shuffle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" />
                <line x1="15" y1="15" x2="21" y2="21" />
                <line x1="4" y1="4" x2="9" y2="9" />
              </svg>
            </button>
            <button className="ctrl" onClick={prevTrack} title={STR.card.prev} aria-label={STR.card.prev}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 6v12" />
                <path d="M19 6L9 12l10 6V6z" />
              </svg>
            </button>
            <button className="ctrl ctrl--lg" onClick={togglePlay} title={STR.card.playPause} aria-label={STR.card.playPause}>
              <svg className="ctrl__play" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 7.5v9L16 12 9.5 7.5z" /></svg>
              <svg className="ctrl__pause" viewBox="0 0 24 24" fill="currentColor"><path d="M8 7h3v10H8zm5 0h3v10h-3z" /></svg>
            </button>
            <button className="ctrl" onClick={nextTrack} title={STR.card.next} aria-label={STR.card.next}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 6l10 6-10 6V6z" />
                <path d="M19 6v12" />
              </svg>
            </button>
          </div>

          {more && links && (
            <div className="wnp__links" role="menu" aria-label={STR.card.listenIn}>
              <a role="menuitem" href={links.spotify} target="_blank" rel="noreferrer" title="Spotify"><BrandIcon kind="spotify" /></a>
              <a role="menuitem" href={links.appleMusic} target="_blank" rel="noreferrer" title="Apple Music"><BrandIcon kind="apple" /></a>
              <a role="menuitem" href={links.youtube} target="_blank" rel="noreferrer" title="Youtube"><BrandIcon kind="youtube" /></a>
              <a role="menuitem" href={links.deezer} target="_blank" rel="noreferrer" title="Deezer"><BrandIcon kind="deezer" /></a>
              <span className="wnp__links-label">{formatDuration(track.duration)}</span>
            </div>
          )}

          <button className="wnp__learn" onClick={() => setMore(m => !m)} aria-expanded={more}>
            {STR.world.learnMore}
          </button>
        </>
      )}
    </div>
  );
}
