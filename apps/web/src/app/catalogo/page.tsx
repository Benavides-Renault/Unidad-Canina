import { redirect } from 'next/navigation';
import { catalogHref, readCatalogRoute, type PublicQuery } from '@/lib/public-routes';

export default async function CatalogAlias({ searchParams }: { searchParams: Promise<PublicQuery> }) {
  redirect(catalogHref(readCatalogRoute(await searchParams)));
}
