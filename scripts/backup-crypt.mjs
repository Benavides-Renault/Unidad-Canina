import { root, loadEnv } from './env.mjs';
import { sealBackup, openBackup } from '../infra/backup/encryption.mjs';
import { args } from '../infra/backup/common.mjs';
loadEnv();
process.chdir(root);
if (!args.source || !args.output || Boolean(args.encrypt) === Boolean(args.decrypt))
  throw new Error('Usa --encrypt o --decrypt, --source=carpeta --output=carpeta_nueva.');
const result = await (args.encrypt ? sealBackup : openBackup)(String(args.source), String(args.output));
console.log(`Respaldo ${args.encrypt ? 'cifrado' : 'descifrado y verificado'}: ${result.destination}`);
