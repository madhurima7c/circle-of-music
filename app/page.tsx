import { redirect } from 'next/navigation';

/**
 * The two instruments own symmetrical routes — `/circle` and `/world` — so the
 * root just forwards to the Circle. Temporary (307) on purpose: browsers cache
 * permanent redirects hard, and `/` should stay free for a real landing page
 * later without users being stuck on a stale 308.
 */
export default function Home() {
  redirect('/circle');
}
