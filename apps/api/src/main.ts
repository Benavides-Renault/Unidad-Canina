import 'reflect-metadata';
import 'dotenv/config';
import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpException,
  Inject,
  Module,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import { map } from 'rxjs';
import { serializeDates } from './serialization';
import { AccessGuard, Public } from './access';
import { AuthController } from './auth';
import { Db } from './db';
import { Domain } from './domain';
import { DogsController } from './dogs';
import { DocumentsController, Storage } from './documents';
import {
  AppointmentsController,
  AuditController,
  DashboardController,
  NotificationsController,
  TrainingController,
  UsersController,
  VaccinationsController,
} from './operations';
import { encryptionKey, hash } from './security';
import { describeApi } from './openapi';
import { ContractsController, InstitutionsController, ServicesController } from './contracts';
import { BreedingController } from './breeding';
import { FinanceController, ReservationsController } from './finance';
import { InventoryController } from './inventory';
import { SystemController } from './system';
import { FollowUpController } from './follow-up';
import { CalendarController } from './calendar';
import { RecordsController } from './records';
import { PreferencesController } from './preferences';
import { BreedsController } from './breeds';
import { TemplatesController } from './templates';
import { FinanceControlController } from './finance-control';
import { PushController } from './push';
import { PartiesController, CatalogAdminController, PortalController, TrainerController } from './portals';

@Catch()
class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) return;
    if (error instanceof HttpException)
      return response
        .status(error.getStatus())
        .json(
          typeof error.getResponse() === 'string' ? { message: error.getResponse() } : error.getResponse(),
        );
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = JSON.stringify(error.meta || {});
        const field = target.includes('pedigree')
          ? 'número de pedigrí'
          : target.includes('microchip')
            ? 'microchip'
            : target.includes('code')
              ? 'código'
              : target.includes('username')
                ? 'usuario'
                : target.includes('email')
                  ? 'correo'
                  : 'identificador';
        return response
          .status(409)
          .json({ message: `Ese ${field} ya está registrado. Utiliza uno distinto.` });
      }
      if (error.code === 'P2025') return response.status(404).json({ message: 'Registro no encontrado.' });
      if (error.code === 'P2003')
        return response.status(400).json({ message: 'La referencia a otro registro no es válida.' });
      if (error.code === 'P2034')
        return response
          .status(409)
          .json({ message: 'Otro usuario modificó el registro. Inténtalo nuevamente.' });
    }
    console.error('Error de servidor:', error instanceof Error ? error.name : 'UnknownError');
    return response
      .status(500)
      .json({ message: 'No se pudo completar la operación. Contacta al administrador.' });
  }
}
class CivilDates implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next
      .handle()
      .pipe(
        map((value) =>
          context.switchToHttp().getResponse<Response>().headersSent ? value : serializeDates(value),
        ),
      );
  }
}
@Controller('health')
class HealthController {
  constructor(@Inject(Db) private readonly db: Db) {}
  @Public() @Get() async get() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok', demoMode: process.env.DEMO_MODE === 'true' };
  }
}
@Module({
  controllers: [
    BreedsController,
    PartiesController,
    CatalogAdminController,
    PortalController,
    TrainerController,
    HealthController,
    AuthController,
    DogsController,
    DocumentsController,
    VaccinationsController,
    TrainingController,
    AppointmentsController,
    DashboardController,
    NotificationsController,
    AuditController,
    UsersController,
    InstitutionsController,
    ContractsController,
    ServicesController,
    BreedingController,
    FinanceController,
    ReservationsController,
    InventoryController,
    SystemController,
    FollowUpController,
    CalendarController,
    RecordsController,
    PreferencesController,
    TemplatesController,
    FinanceControlController,
    PushController,
  ],
  providers: [Db, Domain, Storage, { provide: APP_GUARD, useClass: AccessGuard }],
})
class AppModule {}
async function main() {
  encryptionKey();
  if (!process.env.APP_ORIGIN) throw new Error('APP_ORIGIN es obligatorio.');
  const origin = new URL(process.env.APP_ORIGIN);
  if (
    process.env.NODE_ENV === 'production' &&
    (origin.protocol !== 'https:' || process.env.COOKIE_SECURE !== 'true')
  )
    throw new Error('Producción requiere APP_ORIGIN HTTPS y COOKIE_SECURE=true.');
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn', 'log'] });
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use((_req: Request, res: Response, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.enableCors({
    origin: process.env.APP_ORIGIN,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new SafeErrors());
  app.useGlobalInterceptors(new CivilDates());
  app.enableShutdownHooks();
  const db = app.get(Db);
  app.use('/api/docs', async (req: Request, res: Response, next: () => void) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'",
    );
    const raw = req.cookies?.valkyr_session;
    if (!raw || typeof raw !== 'string' || raw.length > 100)
      return res.status(401).json({ message: 'Inicia sesión.' });
    try {
      const session = await db.session.findUnique({
        where: { tokenHash: hash(raw) },
        include: { user: true },
      });
      if (!session || session.expiresAt < new Date() || !session.user.active || session.user.role !== 'ADMIN')
        return res.status(403).json({ message: 'Acceso restringido.' });
      next();
    } catch {
      return res.status(503).json({ message: 'Servicio no disponible.' });
    }
  });
  const spec = describeApi(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('ORYX K9 Manager')
        .setDescription(
          'API privada. Las escrituras requieren cookie de sesión y cabecera x-csrf-token. Contrato detallado en docs/API_CONTRACT.md.',
        )
        .setVersion('1.0')
        .addCookieAuth('valkyr_session')
        .build(),
    ),
  );
  SwaggerModule.setup('api/docs', app, spec, {
    jsonDocumentUrl: '/api/docs/openapi.json',
    yamlDocumentUrl: '/api/docs/openapi.yaml',
    swaggerOptions: { persistAuthorization: false },
  });
  await app.listen(
    Number(process.env.API_PORT || process.env.PORT || 4000),
    process.env.API_HOST || '127.0.0.1',
  );
}
main().catch((error: unknown) => {
  console.error('No se pudo iniciar API:', error instanceof Error ? error.name : 'Error');
  process.exitCode = 1;
});
