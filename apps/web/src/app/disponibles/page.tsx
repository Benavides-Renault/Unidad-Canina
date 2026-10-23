import { PublicLanding } from '@/components/public-site';
import { readCatalogRoute, type PublicQuery } from '@/lib/public-routes';

export const metadata = { title: 'Perros disponibles y camadas · ORYX K9' };

export default async function AvailablePage({ searchParams }: { searchParams: Promise<PublicQuery> }) {
  return <PublicLanding view="catalog" route={readCatalogRoute(await searchParams)} />;
}
