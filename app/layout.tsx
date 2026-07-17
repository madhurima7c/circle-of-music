import type { Metadata } from 'next';
import { DM_Mono, DM_Sans } from 'next/font/google';
import { StoreProvider } from '@/lib/store';
import { GlobalPlayer } from '@/components/GlobalPlayer';
import { STR } from '@/lib/strings';
import './globals.css';

// The whole application types in DM Sans (UI/body) + DM Mono (labels,
// readouts). The old IBM Plex / Inter variables keep their names so every
// var(--font-…) reference across the app resolves to the DM pair.
const dmSans = DM_Sans({
  variable: '--font-plex-sans',
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
});

const dmMono = DM_Mono({
  variable: '--font-plex-mono',
  weight: ['300', '400', '500'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: STR.app.name,
  description: STR.app.tagline,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${dmMono.variable} ${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full">
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
