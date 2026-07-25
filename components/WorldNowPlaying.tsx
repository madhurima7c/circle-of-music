'use client';

import { useState, useSyncExternalStore } from 'react';
import { useStore } from '@/lib/store';
import { GENRES } from '@/lib/data';
import { trackLinks } from '@/lib/links';
import { STR } from '@/lib/strings';
import { toggleFind, useIsFind } from '@/lib/library';
import { storyFor, releaseYear } from '@/lib/stories';
import { originFor } from '@/lib/origins';
import { countryISO, countryContinent } from '@/lib/geo';
import {
  spotifyEnabled, subscribeSpotify, isSpotifyConnected,
  connectSpotify, disconnectSpotify,
} from '@/lib/spotify';
import { ProgressBar, BrandIcon, useEmbedActive, RoundPlay } from '@/components/Overlay';

/**
 * WorldNowPlaying — the World's single compact now-playing card
 * (bottom-right). There is no queue list here: the globe IS the queue —
 * dots and countries drive what plays next. LEARN MORE reveals the
 * "listen to song in" deep links.
 */
export function WorldNowPlaying() {
  const {
    tracks, trackIdx, status, isPlaying, autoplayBlocked,
    togglePlay, nextTrack, prevTrack, shuffle, toggleShuffle, countryName, genreIdx,
  } = useStore();
  const track = tracks[trackIdx];
  const [more, setMore] = useState(false);
  const saved = useIsFind(track?.id);
  const spotifyOn = useSyncExternalStore(subscribeSpotify, isSpotifyConnected, () => false);
  const embedActive = useEmbedActive();
  // Embed sounding → it IS the now-playing header; ours steps aside.
  const embedMode = spotifyOn && embedActive;

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
          {/* "FROM 🇮🇳 NIGERIA, AFRICA" origin banner — uses the store's
              country (what the user selected/tapped), not the artist-origin
              lookup which can disagree for diaspora artists. */}
          {(() => {
            const place = countryName;
            const iso = countryISO(place);
            const continent = countryContinent(place);
            if (!place) return null;
            return (
              <div className="wnp__from">
                <span className="wnp__from-label">FROM</span>
                {iso && (
                  <img
                    className="wnp__from-flag"
                    src={`https://flagcdn.com/w40/${iso.toLowerCase()}.png`}
                    alt=""
                  />
                )}
                <span className="wnp__from-name">
                  {place.toUpperCase()}{continent ? `, ${continent.toUpperCase()}` : ''}
                </span>
              </div>
            );
          })()}
          {!embedMode && (
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
            {/* Play sits where the ♥ used to; the ♥ is now the center of
                the control strip (identical in both Spotify states). */}
            <RoundPlay playing={isPlaying} onClick={togglePlay} blocked={autoplayBlocked} />
          </div>

          <ProgressBar trackDuration={track.duration ?? null} />
          </>
          )}

          <div className="wnp__controls">
            <button
              className="ctrl ctrl--shuffle"
              data-active={shuffle ? 'true' : 'false'}
              aria-pressed={shuffle}
              onClick={toggleShuffle}
              title={shuffle ? STR.card.shuffleOn : STR.card.shuffleOff}
              aria-label={shuffle ? STR.card.shuffleOn : STR.card.shuffleOff}
            >
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
            {/* ♥ is the center of the strip — like it here, or save it to
                Spotify from the embed. Playback lives in the round button. */}
            <button
              className="ctrl ctrl--lg ctrl--heart"
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
              <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
              </svg>
            </button>
            <button className="ctrl" onClick={nextTrack} title={STR.card.next} aria-label={STR.card.next}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 6l10 6-10 6V6z" />
                <path d="M19 6v12" />
              </svg>
            </button>
            {/* Share — same 5th control as the Circle, so both cards read the
                same. Opens the "listen in" links (and the Connect entry). */}
            <button
              className="ctrl"
              onClick={() => setMore(m => !m)}
              title={STR.card.share}
              aria-label={STR.card.share}
              aria-expanded={more}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15V4" />
                <path d="M8 8l4-4 4 4" />
                <path d="M5 13v6h14v-6" />
              </svg>
            </button>
          </div>

          {/* The embed IS the now-playing header while it sounds (CSS order),
              carrying art, title, scrubber, play and "Save on Spotify". */}
          {embedMode && (
            <div className="spotify-slot" data-spotify-slot aria-hidden />
          )}

          {more && links && (
            <>
              <div className="wnp__links" role="menu" aria-label={STR.card.listenIn}>
                <a role="menuitem" href={links.spotify} target="_blank" rel="noreferrer" title="Spotify"><BrandIcon kind="spotify" /></a>
                <a role="menuitem" href={links.appleMusic} target="_blank" rel="noreferrer" title="Apple Music"><BrandIcon kind="apple" /></a>
                <a role="menuitem" href={links.youtube} target="_blank" rel="noreferrer" title="Youtube"><BrandIcon kind="youtube" /></a>
                <a role="menuitem" href={links.deezer} target="_blank" rel="noreferrer" title="Deezer"><BrandIcon kind="deezer" /></a>
              </div>
              {spotifyEnabled && (
                <button
                  className="listen-menu__connect wnp__connect"
                  data-connected={spotifyOn ? 'true' : 'false'}
                  onClick={() => (spotifyOn ? disconnectSpotify() : connectSpotify())}
                >
                  {spotifyOn ? STR.spotify.connected : STR.spotify.connect}
                </button>
              )}
            </>
          )}

        </>
      )}
    </div>
  );
}
