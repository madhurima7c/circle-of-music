import type { Metadata } from 'next';
import { STR } from '@/lib/strings';

export const metadata: Metadata = {
  title: STR.circle.title,
  description: STR.circle.description,
};

export default function CircleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
