import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Nameless Labs AI | Mythical Studios',
  description: 'Agentic AI workspace by Mythical Studios: chat, voice, research, tasks, memory and actions.',
};

export const viewport: Viewport = {
  themeColor: '#0c0809',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="sunset" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('nameless-labs-ai:theme');if(t&&/^(sunset|nebula|matrix|ocean)$/.test(t))document.documentElement.setAttribute('data-theme',t)}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-100">{children}</body>
    </html>
  );
}
