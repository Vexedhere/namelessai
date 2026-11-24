import type { Metadata, Viewport } from 'next';
import './globals.css';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';


export const metadata: Metadata = {
  title: 'Nameless Labs AI | Mythical Studios',
  description: 'Next-generation AI workspace powered by NamelessAI and custom model tiers.',
};

export const viewport: Viewport = {
  themeColor: '#080614',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-100">{children}</body>
    </html>
  );
}
