import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { access, readFile, statfs } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { Allowed } from './access';
import { Db } from './db';
import { ADMINS, hash } from './security';
import { mailConfigured } from './mail';
import { directoryBytes, quarantineDirectory } from './upload-policy';
import { pushConfigured } from './push';
@ApiTags('Estado operativo')
@Allowed(...ADMINS)
@Controller('system')
export class SystemController {
  constructor(@Inject(Db) private readonly db: Db) {}
  @Get('audit') async audit() {
    const checks: { name: string; issues: number; detail: string }[] = [];
    for (const field of ['code', 'microchip', 'pedigreeNumber'] as const) {
      // The column comes exclusively from this fixed whitelist, never request input.
      const normal =
        field === 'code'
          ? `upper(btrim("${field}"))`
          : `upper(regexp_replace("${field}", '[[:space:]-]', '', 'g'))`;
      const result = await this.db.$queryRawUnsafe<{ total: bigint }[]>(
        `SELECT count(*) AS total FROM (SELECT ${normal} FROM "Dog" WHERE nullif(${normal}, '') IS NOT NULL GROUP BY ${normal} HAVING count(*) > 1) duplicates`,
      );
      checks.push({
        name:
          field === 'code'
            ? 'Códigos únicos'
            : field === 'microchip'
              ? 'Microchips únicos'
              : 'Pedigríes únicos',
        issues: Number(result[0].total),
        detail: 'Incluye expedientes archivados y variantes de mayúsculas o separadores.',
      });
    }
    checks.push({
      name: 'Fechas de nacimiento',
      issues: await this.db.dog.count({ where: { birthDate: { gt: new Date() } } }),
      detail: 'Los nacimientos registrados deben corresponder a fechas transcurridas.',
    });
    checks.push({
      name: 'Publicaciones de venta',
      issues: await this.db.dog.count({
        where: {
          salePublished: true,
          archivedAt: null,
          OR: [{ availableForSale: false }, { salePrice: null }, { saleContact: null }, { saleContact: '' }],
        },
      }),
      detail: 'Cada publicación debe tener disponibilidad para venta, precio y contacto.',
    });
    const stock = await this.db.$queryRaw<
      { total: bigint }[]
    >`SELECT count(*) AS total FROM "StockLot" WHERE quantity < 0`;
    checks.push({
      name: 'Existencias del inventario',
      issues: Number(stock[0].total),
      detail: 'Ningún lote puede tener saldo negativo.',
    });
    const dates = await this.db.$queryRaw<
      { total: bigint }[]
    >`SELECT count(*) AS total FROM "BreedingPlan" WHERE "expectedBirthDate" <= COALESCE("matingDate", "plannedDate") OR "expectedDeliveryDate" <= "expectedBirthDate"`;
    checks.push({
      name: 'Fechas de crianza',
      issues: Number(dates[0].total),
      detail: 'El nacimiento previsto debe seguir al cruce y la entrega al nacimiento.',
    });
    return { checkedAt: new Date(), checks };
  }
  @Get('status') async status() {
    const [heartbeat, pending, failed, overdue] = await Promise.all([
      this.db.serviceHeartbeat.findUnique({ where: { name: 'reminder-worker' } }),
      this.db.reminder.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
      this.db.reminder.count({ where: { status: 'FAILED' } }),
      this.db.reminder.count({
        where: { status: 'PENDING', dueAt: { lt: new Date(Date.now() - 5 * 60000) } },
      }),
    ]);
    let storageWritable: boolean | null = null,
      freeMiB: number | null = null;
    if ((process.env.STORAGE_DRIVER || 'local') === 'local') {
      const directory = path.resolve(process.env.STORAGE_PATH || '.private-files');
      try {
        await access(directory, constants.W_OK);
        storageWritable = true;
        const disk = await statfs(directory);
        freeMiB = Math.floor((disk.bavail * disk.bsize) / 1048576);
      } catch {
        storageWritable = false;
      }
    }
    const workerHealthy = !!heartbeat && heartbeat.pulsedAt.valueOf() > Date.now() - 120000;
    const backupEnabled = process.env.BACKUP_ENABLED === 'true';
    let backupLastSuccess: string | null = null,
      backupHealthy = false,
      backupEncrypted = false;
    if (backupEnabled) {
      try {
        const state = JSON.parse(
          await readFile(path.resolve(process.env.BACKUP_STATUS_PATH || '.local/backup-status.json'), 'utf8'),
        );
        const url = new URL(process.env.DATABASE_URL!);
        if (state.databaseKey === hash(`${url.hostname}:${url.port}${url.pathname}`)) {
          backupLastSuccess = typeof state.lastSuccess === 'string' ? state.lastSuccess : null;
          backupEncrypted = state.encrypted === true;
          backupHealthy =
            state.ok === true &&
            !!backupLastSuccess &&
            new Date(backupLastSuccess).valueOf() > Date.now() - 26 * 3600000;
        }
      } catch {
        /* Missing or invalid status remains visibly unhealthy. */
      }
    }
    return {
      backupEnabled,
      backupLastSuccess,
      backupHealthy,
      backupEncrypted,
      database: 'ok',
      workerHealthy,
      workerLastSeen: heartbeat?.pulsedAt || null,
      pendingReminders: pending,
      failedReminders: failed,
      overdueReminders: overdue,
      storageDriver: process.env.STORAGE_DRIVER || 'local',
      storageWritable,
      freeMiB,
      emailConfigured: mailConfigured(),
      pushConfigured: pushConfigured(),
      scannerConfigured: Boolean(process.env.UPLOAD_SCANNER_PATH),
      quarantineMiB: Math.ceil((await directoryBytes(quarantineDirectory())) / 1048576),
      storageQuotaMiB: Number(process.env.STORAGE_QUOTA_MIB || 10240),
      checkedAt: new Date(),
    };
  }
}
