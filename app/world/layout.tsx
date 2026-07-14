import type { Metadata } from 'next';
import { STR } from '@/lib/strings';

export const metadata: Metadata = {
  title: STR.world.title,
  description: STR.world.description,
};

export default function WorldLayout({ children }: { children: React.ReactNode }) {
  return children;
}
