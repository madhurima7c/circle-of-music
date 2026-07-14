import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Circle of Music',
  description: 'Country × Genre, on a circle.',
};

export default function CircleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
