import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { Db } from './db';
import { Storage } from './documents';
import { hash, idSchema, pagination, parse } from './security';

// Only fields deliberately approved for commercial publication belong here.
export const identity = {
  id: true,
  code: true,
  name: true,
  registeredName: true,
  birthDate: true,
  sex: true,
  breed: true,
  coat: true,
  photoId: true,
  workStatus: true,
  reproductiveStatus: true,
  availability: true,
  specialties: true,
  availableForSale: true,
  availableForBreeding: true,
  publicDescription: true,
  achievements: true,
  trainingSummary: true,
  functionalities: true,
  healthSummary: true,
  pedigreeSummary: true,
} as const;
export const saleWhere: Prisma.DogWhereInput = {
  archivedAt: null,
  salePublished: true,
  availableForSale: true,
  availability: 'AVAILABLE',
  administrativeStatus: { notIn: ['SOLD', 'DECEASED', 'RETIRED'] },
};
export const breedingParentWhere: Prisma.DogWhereInput = {
  archivedAt: null,
  isPuppy: false,
  availableForBreeding: true,
  availability: 'AVAILABLE',
  reproductiveStatus: { not: 'RETIRED' },
  administrativeStatus: { notIn: ['SOLD', 'DECEASED', 'RETIRED'] },
};
export const crossWhere: Prisma.BreedingPlanWhereInput = {
  published: true,
  OR: [
    {
      status: { in: ['PLANNED', 'MATED', 'CONFIRMED'] },
      dam: breedingParentWhere,
      sire: breedingParentWhere,
    },
    // A completed birth remains visible only while published puppies are available.
    {
      status: 'COMPLETED',
      dam: { archivedAt: null },
      sire: { archivedAt: null },
      litter: { puppies: { some: saleWhere } },
    },
  ],
};
export const catalogPhotoWhere: Prisma.DocumentWhereInput = {
  category: 'PHOTO',
  mainPhotoFor: {
    some: {
      OR: [saleWhere, { OR: [{ damPlans: { some: crossWhere } }, { sirePlans: { some: crossWhere } }] }],
    },
  },
};
const crossSelect = {
  id: true,
  publicTitle: true,
  publicDescription: true,
  plannedDate: true,
  matingDate: true,
  expectedBirthDate: true,
  expectedDeliveryDate: true,
  windowStart: true,
  windowEnd: true,
  status: true,
  puppyPrice: true,
  currency: true,
  contact: true,
  dam: { select: identity },
  sire: { select: identity },
  litter: {
    select: {
      birthDate: true,
      puppies: {
        where: saleWhere,
        select: { ...identity, salePrice: true, saleCurrency: true, saleContact: true },
        orderBy: { name: 'asc' as const },
      },
    },
  },
} as const;
@Injectable()
export class CatalogReader {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Storage) private readonly storage: Storage,
  ) {}
  async dogs(query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.DogWhereInput = {
      ...saleWhere,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search.slice(0, 200), mode: 'insensitive' } },
              { breed: { contains: query.search.slice(0, 200), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.dog.findMany({
        where,
        select: { ...identity, salePrice: true, saleCurrency: true, saleContact: true },
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
      this.db.dog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  async dog(id: string) {
    parse(idSchema, id);
    const dog = await this.db.dog.findFirst({
      where: { id, ...saleWhere },
      select: { ...identity, salePrice: true, saleCurrency: true, saleContact: true },
    });
    if (!dog) throw new NotFoundException('Publicación no disponible.');
    return dog;
  }
  async crosses(query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const [items, total] = await Promise.all([
      this.db.breedingPlan.findMany({
        where: crossWhere,
        select: crossSelect,
        orderBy: { plannedDate: 'asc' },
        skip,
        take: pageSize,
      }),
      this.db.breedingPlan.count({ where: crossWhere }),
    ]);
    return { items, total, page, pageSize };
  }
  async cross(id: string) {
    parse(idSchema, id);
    const cross = await this.db.breedingPlan.findFirst({ where: { id, ...crossWhere }, select: crossSelect });
    if (!cross) throw new NotFoundException('Camada no disponible.');
    return cross;
  }
  async photo(id: string, res: Response) {
    parse(idSchema, id);
    const file = await this.db.document.findFirst({ where: { id, archivedAt: null, ...catalogPhotoWhere } });
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.mimeType))
      throw new NotFoundException('Fotografía no disponible.');
    const bytes = await this.storage.get(file.storageKey);
    if (hash(bytes) !== file.checksum) throw new BadRequestException('No se pudo verificar la fotografía.');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    return res.type(file.mimeType).send(bytes);
  }
}
