import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  base32,
  civilDate,
  csvCell,
  decrypt,
  encrypt,
  equal,
  fileType,
  parse,
  totp,
  verifyTotp,
} from './security';
test('TOTP follows RFC 6238 SHA1 vector (six digits)', () => {
  const secret = base32(Buffer.from('12345678901234567890'));
  assert.equal(totp(secret, 59000), '287082');
  assert.equal(verifyTotp(secret, 'abcdef'), false);
});
test('AES-GCM encrypts secrets and rejects tampering', () => {
  process.env.APP_ENCRYPTION_KEY = '12'.repeat(32);
  const encrypted = encrypt('secret-for-test');
  assert.notEqual(encrypted, 'secret-for-test');
  assert.equal(decrypt(encrypted), 'secret-for-test');
  const parts = encrypted.split('.');
  parts[2] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => decrypt(parts.join('.')));
});
test('CSRF equality compares equal byte lengths safely', () => {
  assert.equal(equal('abc', 'abc'), true);
  assert.equal(equal('abc', 'abcd'), false);
  assert.equal(equal('abc', 'abd'), false);
});
test('CSV cells neutralize spreadsheet formulas and escape quotes', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('Can, K9'), '"Can, K9"');
});
test('file signatures reject renamed executables and accept PNG PDF', () => {
  assert.equal(fileType(Buffer.from('MZ_fake.pdf')), null);
  assert.equal(fileType(Buffer.from('%PDF-1.7\n')), 'application/pdf');
  assert.equal(fileType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
});
test('civil dates reject normalized invalid calendar days', () => {
  assert.throws(() => parse(civilDate, '2026-02-31'));
  assert.equal(parse(civilDate, '2024-02-29').toISOString(), '2024-02-29T00:00:00.000Z');
});
