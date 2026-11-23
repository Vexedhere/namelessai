import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Nameless Labs AI | Mythical Studios',
  description: 'Next-generation AI workspace powered by NamelessAI and custom model tiers.',
};

export const viewport: Viewport = {
  themeColor: '#06080c',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-100">{children}</body>
    </html>
  );
}
