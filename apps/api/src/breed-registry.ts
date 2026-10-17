import { Tx } from './domain';
export async function rememberBreed(tx: Tx, name: string) {
  await tx.$executeRaw`INSERT INTO "Breed" (name, notes) VALUES (${name.trim()}, 'Registrada al crear o actualizar un expediente.') ON CONFLICT DO NOTHING`;
}
