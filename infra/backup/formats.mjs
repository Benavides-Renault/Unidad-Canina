// Read compatibility for existing backups. New backups always use the ORYX formats.
export const BACKUP_FORMAT = 'oryx-backup-v1';
export const ENCRYPTED_FORMAT = 'oryx-encrypted-v1';
export const ENCRYPTED_MAGIC = Buffer.from('ORYXK901');
export function supportsBackupFormat(format) {
  return [BACKUP_FORMAT, 'valkyr-backup-v1'].includes(format);
}
export function encryptedMagic(format) {
  if (format === ENCRYPTED_FORMAT) return ENCRYPTED_MAGIC;
  if (format === 'valkyr-encrypted-v1') return Buffer.from('VALKYR01');
  return null;
}
// Keep the lock stable while an older backup worker may still be running during an update.
export const ONLINE_BACKUP_LOCK = 'valkyr-online-backup';
