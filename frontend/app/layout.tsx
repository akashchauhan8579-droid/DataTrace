import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DataTrace — Evidence-centred Case Tool',
  description: 'DataTrace turns fragmented privacy-related evidence into structured, deterministically verified findings.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-paper text-ink min-h-screen flex flex-col font-sans antialiased selection:bg-amber/20 selection:text-ink">
        {children}
      </body>
    </html>
  );
}
