'use client';

import { useState } from 'react';
import { COUNTRIES, GENRES } from '@/lib/data';
import { STR } from '@/lib/strings';

/**
 * ContactPopup — dock ⋮ → "Contact us". Two sections:
 *   1. Send us a note — free-text message / feature request.
 *   2. Add a song — Country + Genre dropdowns + song name, so suggestions
 *      arrive pre-tagged with the pairing they belong to. That tag is what
 *      the verification pass (the enrich/audit pipeline) checks the song
 *      against before it joins the combination playlists.
 *
 * Transport: composes a structured email via mailto for now — the submit
 * path is isolated in send() so a real API route (e.g. /api/contact with
 * an email provider) can replace it without touching the UI.
 */
export function ContactPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [genre, setGenre] = useState(GENRES[0]);
  const [song, setSong] = useState('');
  const [notice, setNotice] = useState('');

  if (!open) return null;

  const send = (subject: string, body: string) => {
    window.location.href =
      `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setNotice(STR.contact.sent);
    setTimeout(() => setNotice(''), 2600);
  };

  const sendNote = () => {
    const text = note.trim();
    if (!text) return;
    send(STR.contact.noteSubject, text);
    setNote('');
  };

  const sendSong = () => {
    const name = song.trim();
    if (!name) return;
    send(
      STR.contact.songSubject(country, genre),
      `Song suggestion\n\nCountry: ${country}\nGenre: ${genre}\nSong: ${name}\n`,
    );
    setSong('');
  };

  return (
    <>
      <div className="dock-scrim" onClick={onClose} />
      <div className="contact-card" role="dialog" aria-label={STR.contact.title}>
        <header className="contact-card__head">
          <h2>{STR.contact.title}</h2>
          <button className="liked__close" onClick={onClose} aria-label={STR.contact.close}>×</button>
        </header>

        {/* 1 — free-text note */}
        <section className="contact-card__section">
          <h3>{STR.contact.noteTitle}</h3>
          <p className="contact-card__hint">{STR.contact.noteHint}</p>
          <textarea
            value={note}
            rows={4}
            placeholder={STR.contact.notePlaceholder}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="contact-card__send" disabled={!note.trim()} onClick={sendNote}>
            {STR.contact.send}
          </button>
        </section>

        {/* 2 — song suggestion, pre-tagged with its pairing */}
        <section className="contact-card__section">
          <h3>{STR.contact.songTitle}</h3>
          <p className="contact-card__hint">{STR.contact.songHint}</p>
          <div className="contact-card__row">
            <label>
              {STR.contact.songCountry}
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              {STR.contact.songGenre}
              <select value={genre} onChange={(e) => setGenre(e.target.value)}>
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
          />
          <button className="contact-card__send" disabled={!song.trim()} onClick={sendSong}>
            {STR.contact.send}
          </button>
        </section>

        {notice && <p className="contact-card__notice">{notice}</p>}
      </div>
    </>
  );
}
