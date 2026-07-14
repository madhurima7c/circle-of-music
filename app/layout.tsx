import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Inter } from 'next/font/google';
import { StoreProvider } from '@/lib/store';
import { GlobalPlayer } from '@/components/GlobalPlayer';
import { STR } from '@/lib/strings';
import './globals.css';

// Maddy's center card renders in Inter (see src/style.css --font-ui on the
// Maddy branch); loaded here so the ported card matches typographically.
const inter = Inter({
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  weight: ['300', '400', '500'],
  subsets: ['latin'],
});

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  weight: ['300', '400', '500'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: STR.app.name,
  description: STR.app.tagline,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plexMono.variable} ${plexSans.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        {/* Mounted once: the SVG filter every glass strip references. */}
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
          <defs>
            <filter
              id="liquid"
              x="-10%"
              y="-10%"
              width="120%"
              height="120%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.011 0.022"
                numOctaves={2}
                seed={4}
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  dur="22s"
                  values="0.011 0.022; 0.013 0.018; 0.010 0.024; 0.011 0.022"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={22}
                xChannelSelector="R"
                yChannelSelector="G"
                result="r"
              />
              <feColorMatrix
                in="r"
                type="matrix"
                values="1 0 0 0 0   0 0 0 0 0   0 0 0 0 0   0 0 0 1 0"
                result="rOnly"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={18}
                xChannelSelector="R"
                yChannelSelector="G"
                result="g"
              />
              <feColorMatrix
                in="g"
                type="matrix"
                values="0 0 0 0 0   0 1 0 0 0   0 0 0 0 0   0 0 0 1 0"
                result="gOnly"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={14}
                xChannelSelector="R"
                yChannelSelector="G"
                result="b"
              />
              <feColorMatrix
                in="b"
                type="matrix"
                values="0 0 0 0 0   0 0 0 0 0   0 0 1 0 0   0 0 0 1 0"
                result="bOnly"
              />
              <feBlend in="rOnly" in2="gOnly" mode="screen" result="rg" />
              <feBlend in="rg" in2="bOnly" mode="screen" result="rgb" />
              <feGaussianBlur in="rgb" stdDeviation="0.4" />
            </filter>
          </defs>
        </svg>
        {/* Store lives at the root so selection + playback state survives
            client-side navigation between /circle, /world, and the hub.
            GlobalPlayer owns the one <audio> element for the same reason. */}
        <StoreProvider>
          {children}
          <GlobalPlayer />
        </StoreProvider>
      </body>
    </html>
  );
}
