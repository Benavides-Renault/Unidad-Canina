import 'dotenv/config';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// adapter-pg serializes UTC date parts without an offset. Every pooled connection
// must therefore use UTC, regardless of PostgreSQL/host timezone.
export function createDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria.');
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, options: '-c timezone=UTC' }),
  });
}
@Injectable()
export class Db extends PrismaClient implements OnModuleDestroy {
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria.');
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, options: '-c timezone=UTC' }),
    });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
