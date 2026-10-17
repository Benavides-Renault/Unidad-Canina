import type { Metadata, Viewport } from 'next';
import './globals.css';
import './oryx.css';

export const metadata: Metadata = {
  title: 'ORYX K9 · Unidad Canina',
  description: 'Plataforma privada de gestión de ORYX K9 Unidad Canina.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/oryx-logo.png', apple: '/oryx-logo.png' },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'ORYX K9', statusBarStyle: 'default' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#181c1b' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CR">
      <body>{children}</body>
    </html>
  );
}
