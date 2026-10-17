import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { serializeDates } from '../apps/api/src/serialization';
import {
  civilDate,
  csvCell,
  encrypt,
  decrypt,
  fileType,
  hash,
  base32,
  totp,
  verifyTotp,
  checkRoles,
  pagination,
  usernameSchema,
} from '../apps/api/src/security';

test('date serialization preserves civil dates, instants, weights and decimal precision', () => {
  const when = new Date('2026-10-16T14:30:00.000Z');
  assert.deepEqual(
    serializeDates({
      expectedBirthDate: when,
      expectedDeliveryDate: when,
      createdAt: when,
      amount: new Prisma.Decimal('12.50'),
      weights: [{ date: when, kg: 20 }],
    }),
    {
      expectedBirthDate: '2026-10-16',
      expectedDeliveryDate: '2026-10-16',
      createdAt: '2026-10-16T14:30:00.000Z',
      amount: '12.5',
      weights: [{ date: '2026-10-16', kg: 20 }],
    },
  );
});

test('date serialization leaves cyclic response objects and binary downloads untouched', () => {
  class FileResponse {
    self = this;
  }
  const response = new FileResponse(),
    bytes = Buffer.from([0, 255, 12]);
  assert.equal(serializeDates(response), response);
  assert.equal(serializeDates(bytes), bytes);
});

test('usernames normalize case and reject emails, spaces and invalid names', () => {
  assert.equal(usernameSchema.parse('  Socio.Juan_1  '), 'socio.juan_1');
  for (const invalid of ['ab', 'socio juan', 'juan@example.com', '_juan', 'josé', 'a'.repeat(41)])
    assert.equal(usernameSchema.safeParse(invalid).success, false);
});

test('civil dates reject overflow and retain date without timezone shifts', () => {
  assert.equal(civilDate.parse('2024-02-29').toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(civilDate.safeParse('2025-02-29').success, false);
  assert.equal(civilDate.safeParse('2026-13-01').success, false);
});
test('CSV neutralizes spreadsheet expressions and escapes quoted values', () => {
  for (const formula of ['=HYPERLINK("evil")', '+1', '-1', '@SUM(A1)', '\t=2'])
    assert.ok(csvCell(formula).startsWith('"\''));
  assert.equal(csvCell('Luna "Norte"'), '"Luna ""Norte"""');
});
test('MFA secrets use randomized authenticated encryption', () => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const secret = 'ONLY-A-SYNTHETIC-TEST-SECRET';
  const a = encrypt(secret),
    b = encrypt(secret);
  assert.notEqual(a, b);
  assert.equal(decrypt(a), secret);
  const pieces = a.split('.');
  const bytes = Buffer.from(pieces[2], 'base64url');
  bytes[0] ^= 1;
  pieces[2] = bytes.toString('base64url');
  assert.throws(() => decrypt(pieces.join('.')));
});
test('TOTP matches RFC6238 SHA1 test vector (six digits)', () => {
  const secret = base32(Buffer.from('12345678901234567890'));
  assert.equal(totp(secret, 59_000), '287082');
  assert.equal(totp(secret, 1_111_111_109_000), '081804');
  assert.equal(verifyTotp(secret, 'abcdef'), false);
});
test('uploads reject spoofed extension contents and identify allowed magic', () => {
  assert.equal(fileType(Buffer.from('<script>bad.png</script>')), null);
  assert.equal(fileType(Buffer.from('%PDF-1.7\ncontent')), 'application/pdf');
  assert.equal(fileType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
});
test('authorization and pagination reject forbidden roles and oversized lists', () => {
  assert.throws(() => checkRoles('TRAINER', ['ADMIN']));
  assert.throws(() => checkRoles('CLIENT', ['ADMIN', 'TRAINER']));
  assert.throws(() => pagination({ pageSize: 101 }));
  assert.throws(() => pagination({ page: -1 }));
  assert.deepEqual(pagination({ page: '2', pageSize: '10' }), { page: 2, pageSize: 10, skip: 10 });
  assert.equal(hash('a').length, 64);
});
