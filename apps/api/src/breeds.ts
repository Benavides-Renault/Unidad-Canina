import { Body, Controller, Get, Post, Patch, Param, Req, Inject, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import { Allowed, AuthRequest } from './access';
import { Db } from './db';
import { Domain } from './domain';
import { idSchema, parse, requiredText, optionalText } from './security';

const schema = z.object({ name: requiredText, group: optionalText, notes: optionalText }).strict();
@Allowed('ADMIN', 'TRAINER')
@Controller('breeds')
export class BreedsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Domain) private domain: Domain,
  ) {}
  @Get() async list() {
    return this.db.breed.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' } });
  }
  @Allowed('ADMIN') @Post() async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(schema, body);
    return this.db.$transaction(async (tx) => {
      if (await tx.breed.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' } } }))
        throw new ConflictException('Esta raza ya está registrada en el catálogo.');
      const row = await tx.breed.create({ data });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Breed', row.id, 'CREATE', 'Raza añadida al catálogo.'),
      });
      return row;
    });
  }
  @Allowed('ADMIN') @Patch(':id') async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const data = parse(schema.partial().extend({ archived: z.boolean().optional() }), body);
    const { archived, ...details } = data;
    return this.db.$transaction(async (tx) => {
      const row = await tx.breed.update({
        where: { id },
        data: { ...details, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Breed',
          id,
          'UPDATE',
          'Catálogo actualizado; los expedientes conservan su raza registrada.',
        ),
      });
      return row;
    });
  }
}
