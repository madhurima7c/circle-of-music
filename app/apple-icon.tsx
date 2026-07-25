import { ImageResponse } from 'next/og';
import { circleMarkDataUri } from '@/lib/brand';

/**
 * Apple touch icon — the home-screen / iMessage tile on iOS.
 *
 * Generated rather than shipped as a flat PNG because iOS composites touch
 * icons onto BLACK when they have transparency; this paints the app's own
 * light stage colour behind the mark so it reads the same as the site.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#efefee',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={circleMarkDataUri()} width={124} height={124} alt="" />
      </div>
    ),
    { ...size },
  );
}
