import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { root } from './env.mjs';
const action = process.argv[2];
if (!['stop', 'restart', 'status'].includes(action)) throw new Error('Usar stop, restart o status.');
const data = path.join(root, '.local/postgres');
if (!existsSync(path.join(data, 'PG_VERSION'))) throw new Error('No hay base portátil inicializada.');
const platform = process.platform === 'win32' ? 'windows' : process.platform;
const { pg_ctl } = await import(`@embedded-postgres/${platform}-${process.arch}`);
const args = ['-D', data, action];
if (action !== 'status') args.push('-m', 'fast', '-w', '-t', '20');
if (action === 'restart')
  args.push('-o', '-h 127.0.0.1 -p 55432', '-l', path.join(root, '.local/postgres.log'));
const result = spawnSync(pg_ctl, args, { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
