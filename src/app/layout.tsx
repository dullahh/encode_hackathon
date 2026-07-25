import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'CareRelay P0', description: 'Synthetic care handover demo' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
