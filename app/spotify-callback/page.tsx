'use client';

import { useEffect, useState } from 'react';
import { exchangeSpotifyCode } from '@/lib/spotify';
import { STR } from '@/lib/strings';

/**
 * /spotify-callback — the single redirect URI the Spotify app whitelists.
 *
 * Opened as a POPUP by connectSpotify(): Spotify sends the user here with
 * ?code=…, we exchange it for tokens (PKCE verifier is in localStorage,
 * shared with the opener — same origin), nudge the opener, and close.
 * If the popup was blocked and the full page navigated here instead
 * (redirect fallback), we walk back to the hub after the exchange.
 */
export default function SpotifyCallback() {
  const [msg, setMsg] = useState<string>(STR.spotify.connecting);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    // Strip the code from the URL immediately so a re-render can't reuse it.
    window.history.replaceState(null, '', window.location.pathname);

    const finish = (ok: boolean) => {
      setMsg(ok ? STR.spotify.connectDone : STR.spotify.connectFail);
      if (!ok) return; // leave the error on screen
      try { window.opener?.postMessage({ type: 'spotify-connected' }, window.location.origin); } catch { /* opener gone */ }
      if (window.opener) {
        window.close();
      } else {
        // Redirect-fallback path: this IS the main window — go home.
        window.location.replace('/');
      }
    };

    if (!code) { finish(false); return; }
    void exchangeSpotifyCode(code).then(finish);
  }, []);

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: '#0b0b12',
        color: 'rgba(228, 233, 255, 0.85)',
        fontFamily: 'var(--font-plex-mono), monospace',
        fontSize: 13,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        textAlign: 'center',
        padding: 24,
      }}
    >
      {msg}
    </main>
  );
}
