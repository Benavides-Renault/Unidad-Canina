import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VALKYR Manager · Unidad Canina',
  description: 'Plataforma privada de gestión de VALKYR Unidad Canina.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/valkyr-logo-original.png', apple: '/valkyr-logo-original.png' },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'VALKYR', statusBarStyle: 'default' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#181c1b' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CR">
      <body>{children}</body>
    </html>
  );
}
