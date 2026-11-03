import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRecoveryCodes,
  decryptTotpSecret,
  encodeBase32,
  encryptTotpSecret,
  generateTotpSecret,
  hashRecoveryCode,
  totpAt,
  verifyTotp
} from '../lib/totp.js';

const rfcSecret = encodeBase32(Buffer.from('12345678901234567890', 'ascii'));

test('TOTP matches the RFC 6238 SHA-1 six-digit test vectors', () => {
  const vectors = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130']
  ];
  for (const [seconds, expected] of vectors) {
    assert.equal(totpAt(rfcSecret, seconds * 1000), expected);
  }
});

test('TOTP accepts the adjacent 30-second time windows and rejects malformed codes', () => {
  const timestamp = 1_750_000_000_000;
  const code = totpAt(rfcSecret, timestamp);
  assert.equal(verifyTotp(rfcSecret, code, timestamp + 30_000), true);
  assert.equal(verifyTotp(rfcSecret, code, timestamp + 120_000), false);
  assert.equal(verifyTotp(rfcSecret, '12345', timestamp), false);
});

test('MFA secrets encrypt and decrypt with the session secret', () => {
  process.env.ADMIN_SESSION_SECRET = 'test-only-secret-that-is-long-enough';
  const secret = generateTotpSecret();
  assert.equal(decryptTotpSecret(encryptTotpSecret(secret)), secret);
});

test('recovery codes are unique and hash consistently with separators', () => {
  const codes = createRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.equal(hashRecoveryCode(codes[0]), hashRecoveryCode(codes[0].replaceAll('-', '')));
});
