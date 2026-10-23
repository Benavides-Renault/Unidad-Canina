import { PublicLanding } from '@/components/public-site';
import type { PublicQuery } from '@/lib/public-routes';

export const metadata = { title: 'Contacto · ORYX K9' };

export default async function ContactPage({ searchParams }: { searchParams: Promise<PublicQuery> }) {
  const query = await searchParams;
  return (
    <PublicLanding
      key={query.solicitud === 'cuenta' ? 'account' : 'contact'}
      view="contact"
      requestAccount={query.solicitud === 'cuenta'}
    />
  );
}
