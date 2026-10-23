import type { Metadata, Viewport } from 'next';
import { WhatsAppFloat } from '@/components/whatsapp-float';
import './globals.css';
import './oryx.css';
import './public-site.css';

export const metadata: Metadata = {
  title: 'ORYX K9 · Unidad Canina',
  description:
    'Perros disponibles, camadas y contacto con ORYX K9 Unidad Canina. Acceso privado para clientes y equipo.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/oryx-logo.png', apple: '/oryx-logo.png' },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'ORYX K9', statusBarStyle: 'default' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#181c1b' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CR" data-scroll-behavior="smooth">
      <body>
        {children}
        <WhatsAppFloat />
      </body>
    </html>
  );
}
