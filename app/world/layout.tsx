import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'World of Music',
  description: 'Music anchored to place, on a globe.',
};

export default function WorldLayout({ children }: { children: React.ReactNode }) {
  return children;
}
