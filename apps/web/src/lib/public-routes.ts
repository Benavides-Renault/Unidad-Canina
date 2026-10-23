export type CatalogRoute = {
  kind: 'dogs' | 'crosses';
  id?: string;
  page: number;
  parent?: 'dam' | 'sire';
};
export type PublicQuery = Record<string, string | string[] | undefined>;

export function readCatalogRoute(query: PublicQuery): CatalogRoute {
  const page = Number(query.pagina);
  const kind = query.tipo === 'crosses' ? 'crosses' : 'dogs';
  return {
    kind,
    id: typeof query.id === 'string' && query.id ? query.id : undefined,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    parent:
      kind === 'crosses' && (query.progenitor === 'dam' || query.progenitor === 'sire')
        ? query.progenitor
        : undefined,
  };
}

export function catalogHref(route: Partial<CatalogRoute> = {}) {
  const query = new URLSearchParams();
  if (route.kind || route.id) query.set('tipo', route.kind || 'dogs');
  if (route.id) query.set('id', route.id);
  if (route.page && route.page > 1) query.set('pagina', String(route.page));
  if (route.kind === 'crosses' && route.id && route.parent) query.set('progenitor', route.parent);
  return `/disponibles${query.size ? `?${query}` : ''}`;
}
