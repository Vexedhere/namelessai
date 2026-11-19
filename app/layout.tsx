import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nameless Labs AI | Mythical Studios',
  description: 'Next-generation AI workspace powered by NamelessAI and custom model tiers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
