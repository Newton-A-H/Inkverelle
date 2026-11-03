import { prisma } from '../lib/prisma.js';
import {
  hashPassword,
  hitRateLimit,
  isSameOrigin,
  recordRateLimit,
  termsVersion,
  tokenHash
} from '../lib/security.js';

function reply(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Method not allowed.' });
  }
  if (!isSameOrigin(req)) return reply(res, 403, { error: 'This request could not be verified.' });

  try {
    if (await hitRateLimit('activation', 'all', req)) {
      return reply(res, 429, { error: 'Too many activation attempts. Please try again in 15 minutes.' });
    }
    await recordRateLimit('activation', 'all', req, { limit: 8 });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const token = String(body.token || '');
    const password = String(body.password || '');
    if (body.termsAccepted !== true || body.termsVersion !== termsVersion) {
      return reply(res, 400, { error: 'Please review and accept the Contributor Terms to activate your account.' });
    }
    if (token.length < 40 || token.length > 100) return reply(res, 400, { error: 'This invitation link is invalid or has expired.' });
    const invite = await prisma.invitation.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!invite || invite.usedAt || invite.expiresAt <= new Date()) {
      return reply(res, 400, { error: 'This invitation link is invalid or has expired.' });
    }

    let passwordHash;
    try { passwordHash = await hashPassword(password); }
    catch (error) { return reply(res, 400, { error: error.message }); }

    await prisma.$transaction(async tx => {
      const current = await tx.invitation.findUnique({ where: { id: invite.id } });
      if (!current || current.usedAt || current.expiresAt <= new Date()) throw new Error('INVITATION_EXPIRED');
      await tx.user.update({
        where: { id: current.userId },
        data: { passwordHash, active: true, termsAcceptedAt: new Date(), termsVersion }
      });
      await tx.invitation.update({ where: { id: current.id }, data: { usedAt: new Date() } });
      await tx.session.deleteMany({ where: { userId: current.userId } });
    });

    return reply(res, 200, { activated: true });
  } catch (error) {
    if (error.message === 'INVITATION_EXPIRED') {
      return reply(res, 400, { error: 'This invitation link is invalid or has expired.' });
    }
    console.error('Inkverelle invitation activation:', error);
    return reply(res, 503, { error: 'Account activation is temporarily unavailable.' });
  }
}
