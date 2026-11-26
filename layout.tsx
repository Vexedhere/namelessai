import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Michroma } from 'next/font/google';
import './globals.css';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import { APP_VERSION_LABEL } from '@/lib/version';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });
// wide technical display face for the voice HUD (name, telemetry)
const hud = Michroma({ subsets: ['latin'], weight: '400', variable: '--font-hud', display: 'swap' });

export const metadata: Metadata = {
  title: `Nameless Labs AI ${APP_VERSION_LABEL} | Mythical Studios`,
  description: 'Next-generation AI workspace powered by NamelessAI and custom model tiers.',
};

export const viewport: Viewport = {
  themeColor: '#080614',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${hud.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-100">{children}</body>
    </html>
  );
}
