import type { Metadata } from 'next';
import { STR } from '@/lib/strings';

/* Only the browser-tab title is route-specific (the root layout's template
 * appends the brand). Description and all og:/twitter: tags stay global so a
 * shared link always previews as "Discover Music", whichever route it points
 * at — including the / redirect, which lands crawlers on /circle. */
export const metadata: Metadata = {
  title: STR.world.title,
};

export default function WorldLayout({ children }: { children: React.ReactNode }) {
  return children;
}
