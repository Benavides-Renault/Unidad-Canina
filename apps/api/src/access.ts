import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { User, Session } from '@prisma/client';
import { Db } from './db';
import { checkRoles, equal, hash, Role } from './security';
export const Public = () => SetMetadata('public', true);
export const Allowed = (...roles: Role[]) => SetMetadata('roles', roles);
export type AuthRequest = Request & { user: User; session: Session };
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const origin = req.get('origin');
    if (origin && origin !== process.env.APP_ORIGIN && !['GET', 'HEAD', 'OPTIONS'].includes(req.method))
      throw new ForbiddenException('Origen no permitido.');
    if (this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()]))
      return true;
    const raw = req.cookies?.valkyr_session;
    if (typeof raw !== 'string' || raw.length > 100)
      throw new UnauthorizedException('Inicia sesión para continuar.');
    const session = await this.db.session.findUnique({
      where: { tokenHash: hash(raw) },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.active)
      throw new UnauthorizedException('La sesión venció. Inicia sesión nuevamente.');
    req.user = session.user;
    req.session = session;
    if (
      process.env.ADMIN_MFA_REQUIRED === 'true' &&
      req.user.role === 'ADMIN' &&
      !req.user.totpSecret &&
      ![
        '/api/v1/auth/me',
        '/api/v1/auth/logout',
        '/api/v1/auth/mfa/setup',
        '/api/v1/auth/mfa/enable',
      ].includes(req.path)
    )
      throw new ForbiddenException('Configura MFA antes de acceder a la instalación.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrf = req.get('x-csrf-token');
      const cookie = req.cookies?.valkyr_csrf;
      if (!csrf || typeof cookie !== 'string' || !equal(csrf, cookie) || !equal(hash(csrf), session.csrfHash))
        throw new ForbiddenException('Verificación CSRF fallida. Actualiza la página.');
    }
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles) checkRoles(req.user.role, roles);
    return true;
  }
}
