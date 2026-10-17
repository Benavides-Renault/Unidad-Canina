import { Body, Controller, Get, Patch, Req, Inject } from '@nestjs/common';
import { z } from 'zod';
import { AuthRequest } from './access';
import { Db } from './db';
import { parse } from './security';
const preferenceSchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    calendarView: z.enum(['day', 'week', 'month']).optional(),
    calendarType: z
      .enum([
        'ALL',
        'APPOINTMENT',
        'VACCINATION',
        'TRAINING_PLAN',
        'CERTIFICATION',
        'BREEDING',
        'CONTRACT',
        'RESERVATION',
        'ACCOUNT',
      ])
      .optional(),
  })
  .strict();
@Controller('preferences')
export class PreferencesController {
  constructor(@Inject(Db) private db: Db) {}
  @Get() async get(@Req() req: AuthRequest) {
    return (
      (await this.db.userPreference.findUnique({ where: { userId: req.user.id } })) || {
        emailEnabled: true,
        pushEnabled: false,
        calendarView: 'month',
        calendarType: 'ALL',
      }
    );
  }
  @Patch() async save(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(preferenceSchema, body);
    return this.db.userPreference.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, ...data },
      update: data,
    });
  }
}
