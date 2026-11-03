import { prisma } from '../lib/prisma.js';
import { getSession, hitRateLimit, isSameOrigin, recordRateLimit, requireCsrf } from '../lib/security.js';
import {
  createRecoveryCodes,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  hashRecoveryCode,
  totpUri,
  verifyTotp
} from '../lib/totp.js';

function reply(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  try {
    const session = await getSession(req);
    if (!session || session.user.role !== 'ADMIN') return reply(res, 401, { error: 'Administrator sign-in is required.' });
    if (session.user.mfaEnabledAt || session.mfaVerifiedAt) return reply(res, 409, { error: 'MFA is already enabled for this account.' });
    if (await hitRateLimit('mfa-setup', session.userId, req)) {
      return reply(res, 429, { error: 'Too many authenticator setup attempts. Please try again in 15 minutes.' });
    }
    if (req.method !== 'POST' || !isSameOrigin(req) || !await requireCsrf(req, session)) {
      return reply(res, req.method === 'POST' ? 403 : 405, { error: 'This request could not be verified.' });
    }

    await recordRateLimit('mfa-setup', session.userId, req, { limit: 10 });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (body.action === 'begin') {
      const secret = generateTotpSecret();
      await prisma.user.update({ where: { id: session.userId }, data: { mfaSecretEncrypted: encryptTotpSecret(secret) } });
      return reply(res, 200, { secret, uri: totpUri(secret, session.user.email) });
    }

    if (body.action === 'enable') {
      if (!session.user.mfaSecretEncrypted) return reply(res, 400, { error: 'Start MFA setup first.' });
      let valid = false;
      try { valid = verifyTotp(decryptTotpSecret(session.user.mfaSecretEncrypted), body.code); }
      catch { valid = false; }
      if (!valid) return reply(res, 400, { error: 'That code did not match. Check your authenticator and try again.' });
      const recoveryCodes = createRecoveryCodes();
      const enabledAt = new Date();
      await prisma.$transaction([
        prisma.user.update({
          where: { id: session.userId },
          data: { mfaEnabledAt: enabledAt, totpRecoveryHashes: recoveryCodes.map(hashRecoveryCode) }
        }),
        prisma.session.update({ where: { id: session.id }, data: { mfaVerifiedAt: enabledAt } })
      ]);
      return reply(res, 200, { enabled: true, recoveryCodes });
    }
    return reply(res, 400, { error: 'Choose a valid MFA setup action.' });
  } catch (error) {
    console.error('Inkverelle administrator MFA:', error);
    return reply(res, 503, { error: 'MFA setup is temporarily unavailable.' });
  }
}
