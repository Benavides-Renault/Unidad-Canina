import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { randomBytes, randomUUID } from 'node:crypto';
import { Response } from 'express';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { Db } from './db';
import { Allowed, AuthRequest, Public } from './access';
import {
  base32,
  decrypt,
  usernameSchema,
  encrypt,
  hash,
  parse,
  passwordSchema,
  publicUser,
  token,
  verifyTotp,
} from './security';
import { mailConfigured, sendMail } from './mail';
import { lock } from './business-common';
const recoveryCodes = () =>
  Array.from({ length: 8 }, () =>
    randomBytes(10)
      .toString('hex')
      .match(/.{1,5}/g)!
      .join('-'),
  );
const recoveryHash = (value: string) => hash(value.replaceAll('-', '').toLowerCase());

const loginSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(1).max(128),
    recoveryCode: z
      .string()
      .regex(/^[a-fA-F0-9-]{20,24}$/)
      .optional(),
    totp: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .strict();
export async function rateLimit(db: Db, key: string, limit: number, windowMinutes: number) {
  const now = new Date(),
    expiresAt = new Date(now.valueOf() + windowMinutes * 60000);
  await db.rateLimit.deleteMany({ where: { key, expiresAt: { lt: now } } });
  const record = await db.rateLimit.upsert({
    where: { key },
    create: { key, expiresAt },
    update: { attempts: { increment: 1 } },
  });
  if (record.attempts > limit) throw new HttpException('Demasiados intentos. Inténtalo más tarde.', 429);
}
@ApiTags('Autenticación privada')
@Controller('auth')
export class AuthController {
  constructor(@Inject(Db) private readonly db: Db) {}
  private cookies(res: Response, session: string, csrf: string, expires: Date) {
    const options = {
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'strict' as const,
      path: '/',
      expires,
    };
    res.cookie('valkyr_session', session, { ...options, httpOnly: true });
    res.cookie('valkyr_csrf', csrf, { ...options, httpOnly: false });
  }
  @Public()
  @Post('login')
  async login(@Body() body: unknown, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const data = parse(loginSchema, body);
    await rateLimit(this.db, `login-ip:${hash(req.ip || 'unknown')}`, 40, 15);
    await rateLimit(this.db, `login-user:${hash(data.username)}`, 10, 15);
    const user = await this.db.user.findUnique({ where: { username: data.username } });
    const valid = user && (await argon2.verify(user.passwordHash, data.password));
    if (!valid || !user?.active) {
      if (!user)
        await argon2.hash(data.password, {
          type: argon2.argon2id,
          memoryCost: 19456,
          timeCost: 2,
          parallelism: 1,
        });
      throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    }
    if (user.totpSecret && !data.totp && !data.recoveryCode) return { mfaRequired: true };
    const raw = token(),
      csrf = token();
    const expiresAt = new Date(Date.now() + Number(process.env.SESSION_TTL_HOURS || 12) * 3600000);
    await this.db.$transaction(async (tx) => {
      await lock(tx, `auth:${user.id}`);
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (!current.active || current.passwordHash !== user.passwordHash)
        throw new UnauthorizedException('Credenciales cambiadas. Inicia sesión otra vez.');
      if (current.totpSecret) {
        if (data.recoveryCode) {
          const codeHash = recoveryHash(data.recoveryCode);
          if (!current.recoveryHashes.includes(codeHash))
            throw new UnauthorizedException('Código de recuperación inválido o utilizado.');
          await tx.user.update({
            where: { id: user.id },
            data: { recoveryHashes: current.recoveryHashes.filter((h) => h !== codeHash) },
          });
          await tx.session.deleteMany({ where: { userId: user.id } });
          await tx.auditLog.create({
            data: {
              actorId: user.id,
              entity: 'User',
              entityId: user.id,
              action: 'MFA_RECOVERY_USED',
              summary: 'Código de recuperación consumido; otras sesiones revocadas.',
            },
          });
        } else if (!verifyTotp(decrypt(current.totpSecret), data.totp || ''))
          throw new UnauthorizedException('Código de autenticación inválido.');
      }
      await tx.session.create({
        data: { id: randomUUID(), tokenHash: hash(raw), csrfHash: hash(csrf), userId: user.id, expiresAt },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.name,
          entity: 'User',
          entityId: user.id,
          action: 'LOGIN',
          summary: 'Inicio de sesión.',
          origin: req.ip,
        },
      });
      await tx.rateLimit.deleteMany({ where: { key: `login-user:${hash(data.username)}` } });
      await tx.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    });
    this.cookies(res, raw, csrf, expiresAt);
    return { user: publicUser(user) };
  }
  @Get('me') me(@Req() req: AuthRequest) {
    return publicUser(req.user);
  }
  @Post('logout') async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.db.session.deleteMany({ where: { id: req.session.id } });
    res.clearCookie('valkyr_session', { path: '/' });
    res.clearCookie('valkyr_csrf', { path: '/' });
    return { success: true };
  }
  @Public() @Post('forgot-password') async forgot(@Body() body: unknown, @Req() req: AuthRequest) {
    const { username } = parse(z.object({ username: usernameSchema }).strict(), body);
    await rateLimit(this.db, `reset-ip:${hash(req.ip || 'unknown')}`, 10, 60);
    await rateLimit(this.db, `reset-user:${hash(username)}`, 3, 60);
    const user = await this.db.user.findUnique({ where: { username } });
    if (user?.active && user.email && mailConfigured()) {
      const raw = token();
      await this.db.passwordReset.create({
        data: { tokenHash: hash(raw), userId: user.id, expiresAt: new Date(Date.now() + 30 * 60000) },
      });
      try {
        await sendMail(
          user.email,
          'ORYX K9: recuperación de acceso',
          `Solicitaste restablecer tu contraseña. Este enlace vence en 30 minutos y se utiliza una sola vez:\n${process.env.APP_ORIGIN}/reset-password?token=${raw}\nSi no lo solicitaste, ignora este correo.`,
        );
      } catch {
        /* Respuesta uniforme; el operador debe revisar conectividad SMTP. */
      }
    }
    return { message: 'Si la cuenta existe y el correo está configurado, recibirás un enlace.' };
  }
  @Public() @Post('reset-password') async reset(@Body() body: unknown, @Req() req: AuthRequest) {
    await rateLimit(this.db, `reset-use:${hash(req.ip || 'unknown')}`, 10, 15);
    const data = parse(
      z.object({ token: z.string().min(40).max(100), password: passwordSchema }).strict(),
      body,
    );
    const passwordHash = await argon2.hash(data.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await this.db.$transaction(async (tx) => {
      const reset = await tx.passwordReset.findUnique({
        where: { tokenHash: hash(data.token) },
        include: { user: true },
      });
      if (!reset || !reset.user.active || reset.usedAt || reset.expiresAt < new Date())
        throw new BadRequestException('Enlace inválido o vencido.');
      await lock(tx, `auth:${reset.userId}`);
      const consumed = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw new BadRequestException('El enlace ya fue utilizado.');
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: reset.userId } });
      await tx.passwordReset.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: reset.userId,
          entity: 'User',
          entityId: reset.userId,
          action: 'PASSWORD_RESET',
          summary: 'Contraseña restablecida; sesiones revocadas.',
          origin: req.ip,
        },
      });
    });
    return { success: true };
  }
  @Allowed('ADMIN') @Post('mfa/setup') async setup(@Req() req: AuthRequest) {
    const secret = base32(randomBytes(20));
    await this.db.$transaction(async (tx) => {
      await lock(tx, `auth:${req.user.id}`);
      const current = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
      if (current.totpSecret) throw new BadRequestException('MFA ya está habilitado.');
      await tx.user.update({ where: { id: req.user.id }, data: { totpPendingSecret: encrypt(secret) } });
    });
    return {
      secret,
      uri: `otpauth://totp/${encodeURIComponent(`ORYX K9:${req.user.username}`)}?secret=${secret}&issuer=ORYX%20K9&algorithm=SHA1&digits=6&period=30`,
    };
  }
  @Allowed('ADMIN') @Post('mfa/enable') async enable(@Body() body: unknown, @Req() req: AuthRequest) {
    const { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/) }).strict(), body);
    await rateLimit(this.db, `mfa:${req.user.id}`, 10, 15);
    const codes = recoveryCodes();
    await this.db.$transaction(async (tx) => {
      await lock(tx, `auth:${req.user.id}`);
      const current = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
      if (
        current.totpSecret ||
        !current.totpPendingSecret ||
        !verifyTotp(decrypt(current.totpPendingSecret), code)
      )
        throw new BadRequestException('Código de autenticación inválido o MFA ya habilitado.');
      await tx.user.update({
        where: { id: req.user.id },
        data: {
          totpSecret: current.totpPendingSecret,
          totpPendingSecret: null,
          recoveryHashes: codes.map(recoveryHash),
        },
      });
      await tx.session.deleteMany({ where: { userId: req.user.id, id: { not: req.session.id } } });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          entity: 'User',
          entityId: req.user.id,
          action: 'MFA_ENABLED',
          summary: 'MFA habilitado.',
        },
      });
    });
    return { success: true, recoveryCodes: codes };
  }
  @Allowed('ADMIN') @Post('mfa/recovery-codes') async regenerate(
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const { password, code } = parse(
      z.object({ password: z.string().min(1).max(128), code: z.string().regex(/^\d{6}$/) }).strict(),
      body,
    );
    await rateLimit(this.db, `mfa:${req.user.id}`, 10, 15);
    const codes = recoveryCodes();
    await this.db.$transaction(async (tx) => {
      await lock(tx, `auth:${req.user.id}`);
      const current = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
      if (
        !current.totpSecret ||
        !verifyTotp(decrypt(current.totpSecret), code) ||
        !(await argon2.verify(current.passwordHash, password))
      )
        throw new BadRequestException('Credenciales inválidas.');
      await tx.user.update({ where: { id: current.id }, data: { recoveryHashes: codes.map(recoveryHash) } });
      await tx.session.deleteMany({ where: { userId: current.id, id: { not: req.session.id } } });
      await tx.auditLog.create({
        data: {
          actorId: current.id,
          entity: 'User',
          entityId: current.id,
          action: 'MFA_RECOVERY_REGENERATED',
          summary: 'Códigos anteriores invalidados; otras sesiones revocadas.',
        },
      });
    });
    return { recoveryCodes: codes };
  }
  @Allowed('ADMIN') @Post('mfa/disable') async disable(@Body() body: unknown, @Req() req: AuthRequest) {
    if (process.env.ADMIN_MFA_REQUIRED === 'true')
      throw new BadRequestException('La instalación exige MFA para administradores.');
    const { code, password } = parse(
      z.object({ code: z.string().regex(/^\d{6}$/), password: z.string().max(128) }).strict(),
      body,
    );
    await rateLimit(this.db, `mfa:${req.user.id}`, 10, 15);
    await this.db.$transaction(async (tx) => {
      await lock(tx, `auth:${req.user.id}`);
      const current = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
      if (
        !current.totpSecret ||
        !verifyTotp(decrypt(current.totpSecret), code) ||
        !(await argon2.verify(current.passwordHash, password))
      )
        throw new BadRequestException('Credenciales inválidas.');
      await tx.user.update({
        where: { id: req.user.id },
        data: { totpSecret: null, totpPendingSecret: null, recoveryHashes: [] },
      });
      await tx.session.deleteMany({ where: { userId: req.user.id, id: { not: req.session.id } } });
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          entity: 'User',
          entityId: req.user.id,
          action: 'MFA_DISABLED',
          summary: 'MFA deshabilitado.',
        },
      });
    });
    return { success: true };
  }
}
