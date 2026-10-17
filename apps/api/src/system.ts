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
