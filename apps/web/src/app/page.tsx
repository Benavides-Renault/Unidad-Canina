import { PublicLanding } from '@/components/public-site';
import { redirect } from 'next/navigation';
import { catalogHref, readCatalogRoute, type PublicQuery } from '@/lib/public-routes';

export default async function Home({ searchParams }: { searchParams: Promise<PublicQuery> }) {
  const query = await searchParams;
  if (query.tipo || query.id) redirect(catalogHref(readCatalogRoute(query)));
  return <PublicLanding />;
}
