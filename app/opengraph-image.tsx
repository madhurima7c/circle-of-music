import { ImageResponse } from 'next/og';
import { circleMarkDataUri } from '@/lib/brand';
import { STR } from '@/lib/strings';

/**
 * The card that unfurls wherever a link is shared — iMessage, WhatsApp,
 * Slack, X, Discord. Next wires the og:image / twitter:image tags to this
 * automatically; `twitter-image` falls back to it too.
 *
 * Deliberately the Circle of Music mark on the app's own light stage, so the
 * preview looks like the thing you land on.
 */
export const alt = `${STR.app.shareTitle} — ${STR.app.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#efefee',
          padding: '0 96px',
          textAlign: 'center',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={circleMarkDataUri()} width={188} height={188} alt="" />

        <div
          style={{
            marginTop: 44,
            fontSize: 82,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: '#0a0a0a',
          }}
        >
          {STR.app.shareTitle}
        </div>

        <div
          style={{
            marginTop: 22,
            fontSize: 30,
            lineHeight: 1.45,
            color: 'rgba(10,10,10,0.62)',
            maxWidth: 900,
          }}
        >
          {STR.app.shareDescription}
        </div>
      </div>
    ),
    { ...size },
  );
}
