import { prisma } from '../lib/prisma.js';
import {
  getAdminSession,
  getSession,
  hashPassword,
  isSameOrigin,
  requireCsrf,
  verifyPassword
} from '../lib/security.js';

function reply(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

function requestBody(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body || {};
}

export default async function handler(req, res) {
  try {
    const session = await getSession(req);
    if (!session) return reply(res, 401, { error: 'Sign in to view your profile.' });
    if (session.user.role === 'ADMIN' && !await getAdminSession(req)) {
      return reply(res, 401, { error: 'Administrator access with verified MFA is required.' });
    }

    if (req.method === 'GET') {
      return reply(res, 200, {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: session.user.role,
          createdAt: session.user.createdAt
        }
      });
    }
    if (req.method !== 'PATCH') {
      res.setHeader('Allow', 'GET, PATCH');
      return reply(res, 405, { error: 'Method not allowed.' });
    }
    if (!isSameOrigin(req) || !await requireCsrf(req, session)) {
      return reply(res, 403, { error: 'This request could not be verified.' });
    }

    const body = requestBody(req);
    if (body.action === 'update-profile') {
      const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 100);
      if (name.length < 2) return reply(res, 400, { error: 'Enter a name with at least two characters.' });
      const user = await prisma.user.update({ where: { id: session.userId }, data: { name } });
      return reply(res, 200, { user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    }

    if (body.action === 'change-password') {
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      const confirmation = typeof body.confirmation === 'string' ? body.confirmation : '';
      if (!await verifyPassword(currentPassword, session.user.passwordHash)) {
        return reply(res, 400, { error: 'Your current password does not match.' });
      }
      if (newPassword !== confirmation) return reply(res, 400, { error: 'The new passwords do not match.' });
      if (newPassword === currentPassword) return reply(res, 400, { error: 'Choose a password you haven’t used for this account.' });

      let passwordHash;
      try { passwordHash = await hashPassword(newPassword); }
      catch (error) { return reply(res, 400, { error: error.message }); }

      await prisma.$transaction([
        prisma.user.update({ where: { id: session.userId }, data: { passwordHash } }),
        prisma.session.deleteMany({ where: { userId: session.userId, id: { not: session.id } } })
      ]);
      return reply(res, 200, { passwordChanged: true });
    }

    return reply(res, 400, { error: 'Choose a valid profile action.' });
  } catch (error) {
    console.error('Inkverelle profile:', error);
    return reply(res, 503, { error: 'Your profile is temporarily unavailable.' });
  }
}
