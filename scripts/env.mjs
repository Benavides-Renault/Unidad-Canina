import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function loadEnv() {
  for (const file of ['.env', '.local/local.env']) {
    const envPath = path.join(root, file);
    if (existsSync(envPath)) dotenv.config({ path: envPath, quiet: true });
  }
}
