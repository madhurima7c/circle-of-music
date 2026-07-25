'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { GENRES } from '@/lib/data';
import GEO_ISO from '@/lib/geo-iso.json';
import { STR } from '@/lib/strings';
import { ParticleToast } from '@/components/ParticleToast';

/**
 * ContactPopup — dock ⋮ → "Contact us". TWO TABS:
 *   · Contact us — free-text note.
 *   · Add a song — Country (ALL globe nations — the World plays everywhere)
 *     + Genre (our 20) + song name, so suggestions arrive pre-tagged with
 *     the pairing they claim; the user cross-checks before adding to seeds.
 *
 * Sends through /api/contact (server relays to the private address — never
 * exposed to the browser). After a send the form dissolves and a particle
 * confirmation appears in the same box, with a "send another" button.
 * Light-mode styling; CTAs in the app accent (#1d2bdf).
 */

type Tab = 'note' | 'song';
type Phase = 'form' | 'sending' | 'sent';

export function ContactPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('note');
  const [phase, setPhase] = useState<Phase>('form');
  const [note, setNote] = useState('');
  const [country, setCountry] = useState('Argentina');
  const [genre, setGenre] = useState(GENRES[0]);
  const [song, setSong] = useState('');
  const [error, setError] = useState('');

  // Every nation on the globe (the geo-iso table covers the World's map),
  // sorted for the dropdown.
  const allCountries = useMemo(
    () => Object.keys(GEO_ISO as Record<string, string>).sort((a, b) => a.localeCompare(b)),
    [],
  );

  if (!open) return null;

  const submit = async (
    subject: string,
    message: string,
    extra?: { country: string; genre: string; song: string },
  ) => {
    setPhase('sending');
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, kind: tab, ...extra }),
      });
      if (!res.ok) throw new Error('send failed');
      setPhase('sent');
      if (tab === 'note') setNote('');
      else setSong('');
    } catch {
      setPhase('form');
      setError(STR.contact.error);
    }
  };

  const sendNote = () => {
    const text = note.trim();
    if (text) void submit(STR.contact.noteSubject, text);
  };
  const sendSong = () => {
    const name = song.trim();
    if (name) {
      void submit(
        STR.contact.songSubject(country, genre),
        `Song suggestion\n\nCountry: ${country}\nGenre: ${genre}\nSong: ${name}\n`,
        { country, genre, song: name },
      );
    }
  };

  const pickTab = (t: Tab) => {
    setTab(t);
    setPhase('form');
    setError('');
  };

  // Portaled to <body> — the page frames use `isolation: isolate`, so a card
  // rendered inside them can never paint above the root-level Spotify strip.
  return createPortal(
    <>
      <div className="dock-scrim dock-scrim--dim" onClick={onClose} />
      <div className="contact-card" role="dialog" aria-label={STR.contact.title}>
        <header className="contact-card__head">
          <nav className="contact-card__tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'note'}
              data-active={tab === 'note' ? 'true' : 'false'}
              onClick={() => pickTab('note')}
            >
              {STR.contact.title}
            </button>
            <button
              role="tab"
              aria-selected={tab === 'song'}
              data-active={tab === 'song' ? 'true' : 'false'}
              onClick={() => pickTab('song')}
            >
              {STR.contact.songTitle}
            </button>
          </nav>
          <button className="contact-card__close" onClick={onClose} aria-label={STR.contact.close}>×</button>
        </header>

        {phase === 'sent' ? (
          <div className="contact-card__sent">
            <ParticleToast
              inline
              hold
              text={tab === 'note' ? STR.contact.sentNote : STR.contact.sentSong}
            />
            <button className="contact-card__send" onClick={() => setPhase('form')}>
              {tab === 'note' ? STR.contact.againNote : STR.contact.againSong}
            </button>
          </div>
        ) : tab === 'note' ? (
          <section className="contact-card__section" data-sending={phase === 'sending' ? 'true' : 'false'}>
            <h3>{STR.contact.noteTitle}</h3>
            <p className="contact-card__hint">{STR.contact.noteHint}</p>
            <textarea
              value={note}
              rows={5}
              placeholder={STR.contact.notePlaceholder}
              onChange={(e) => setNote(e.target.value)}
              disabled={phase === 'sending'}
            />
            <button
              className="contact-card__send"
              disabled={!note.trim() || phase === 'sending'}
              onClick={sendNote}
            >
              {phase === 'sending' ? STR.contact.sending : STR.contact.send}
            </button>
          </section>
        ) : (
          <section className="contact-card__section" data-sending={phase === 'sending' ? 'true' : 'false'}>
            <p className="contact-card__hint">{STR.contact.songHint}</p>
            <div className="contact-card__row">
              <label>
                {STR.contact.songCountry}
                <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={phase === 'sending'}>
                  {allCountries.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>
                {STR.contact.songGenre}
                <select value={genre} onChange={(e) => setGenre(e.target.value)} disabled={phase === 'sending'}>
                  {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
            </div>
            <input
              type="text"
              value={song}
              placeholder={STR.contact.songPlaceholder}
              onChange={(e) => setSong(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendSong(); }}
              disabled={phase === 'sending'}
            />
            <button
              className="contact-card__send"
              disabled={!song.trim() || phase === 'sending'}
              onClick={sendSong}
            >
              {phase === 'sending' ? STR.contact.sending : STR.contact.send}
            </button>
          </section>
        )}

        {error && <p className="contact-card__error">{error}</p>}
      </div>
    </>,
    document.body,
  );
}
