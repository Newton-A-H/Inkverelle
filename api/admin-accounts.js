import { prisma } from '../lib/prisma.js';
import { sendInvitationEmail } from '../lib/email.js';
import {
  createInvitation,
  getAdminSession,
  isSameOrigin,
  normalizeEmail,
  requireCsrf
} from '../lib/security.js';

function reply(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

function bodyOf(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
}

export default async function handler(req, res) {
  try {
    const session = await getAdminSession(req);
    if (!session) return reply(res, 401, { error: 'Administrator access with verified MFA is required.' });

    if (req.method === 'GET') {
      const [requests, users] = await Promise.all([
        prisma.accountRequest.findMany({
          orderBy: { requestedAt: 'desc' },
          include: { user: { select: { id: true, active: true, email: true } } }
        }),
        prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          select: { id: true, email: true, name: true, role: true, active: true, createdAt: true }
        })
      ]);
      return reply(res, 200, { requests, users });
    }

    if (!['POST', 'PATCH'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, PATCH');
      return reply(res, 405, { error: 'Method not allowed.' });
    }
    if (!isSameOrigin(req) || !await requireCsrf(req, session)) {
      return reply(res, 403, { error: 'This request could not be verified.' });
    }

    const body = bodyOf(req);
    if (req.method === 'PATCH' && body.action === 'review-request') {
      const request = await prisma.accountRequest.findUnique({ where: { id: String(body.requestId || '') } });
      if (!request || request.status !== 'PENDING') return reply(res, 404, { error: 'That request is no longer waiting for review.' });

      if (body.decision === 'reject') {
        await prisma.accountRequest.update({
          where: { id: request.id },
          data: { status: 'REJECTED', reviewedAt: new Date(), reviewerId: session.userId, userId: null }
        });
        return reply(res, 200, { reviewed: true });
      }
      if (body.decision !== 'approve') return reply(res, 400, { error: 'Choose approve or reject.' });
      const existing = await prisma.user.findUnique({ where: { email: request.email } });
      if (existing && existing.role !== 'READER') {
        return reply(res, 409, { error: 'An account already uses that email address.' });
      }

      const userId = await prisma.$transaction(async tx => {
        const user = existing
          ? await tx.user.update({
            where: { id: existing.id },
            data: {
              name: request.name,
              role: 'AUTHOR',
              active: false,
              passwordHash: null,
              termsAcceptedAt: request.requestedAt,
              termsVersion: request.termsVersion
            }
          })
          : await tx.user.create({
            data: {
              email: request.email,
              name: request.name,
              role: 'AUTHOR',
              active: false,
              termsAcceptedAt: request.requestedAt,
              termsVersion: request.termsVersion
            }
          });
        await tx.accountRequest.update({
          where: { id: request.id },
          data: { status: 'APPROVED', reviewedAt: new Date(), reviewerId: session.userId, userId: user.id }
        });
        if (existing) await tx.session.deleteMany({ where: { userId: existing.id } });
        return user.id;
      });
      const token = await createInvitation(userId);
      const invitationUrl = `/activate/?token=${encodeURIComponent(token)}`;
      const delivery = await sendInvitationEmail({ to: request.email, name: request.name, invitationUrl });
      return reply(res, 200, {
        reviewed: true,
        emailSent: delivery.sent,
        invitationUrl: delivery.sent ? null : invitationUrl
      });
    }

    if (req.method === 'POST' && body.action === 'invite-author') {
      const email = normalizeEmail(body.email);
      const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 100);
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || name.length < 2) {
        return reply(res, 400, { error: 'Enter a name and valid email address.' });
      }
      if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
        return reply(res, 409, { error: 'An account already uses that email address.' });
      }
      const user = await prisma.user.create({ data: { email, name, role: 'AUTHOR', active: false } });
      const token = await createInvitation(user.id);
      const invitationUrl = `/activate/?token=${encodeURIComponent(token)}`;
      const delivery = await sendInvitationEmail({ to: email, name, invitationUrl });
      return reply(res, 201, {
        created: true,
        emailSent: delivery.sent,
        invitationUrl: delivery.sent ? null : invitationUrl
      });
    }

    if (req.method === 'PATCH' && body.action === 'toggle-user') {
      const user = await prisma.user.findFirst({ where: { id: String(body.userId || ''), role: { not: 'ADMIN' } } });
      if (!user) return reply(res, 404, { error: 'That user account could not be found.' });
      const active = body.active === true;
      await prisma.user.update({ where: { id: user.id }, data: { active } });
      if (!active) await prisma.session.deleteMany({ where: { userId: user.id } });
      return reply(res, 200, { updated: true });
    }

    if (req.method === 'PATCH' && ['resend-invitation', 'password-reset'].includes(body.action)) {
      const user = await prisma.user.findFirst({ where: { id: String(body.userId || ''), role: 'AUTHOR' } });
      if (!user || (body.action === 'resend-invitation' && user.active) || (body.action === 'password-reset' && !user.active)) {
        return reply(res, 404, { error: 'That account could not be found for this action.' });
      }
      const token = await createInvitation(user.id);
      const invitationUrl = `/activate/?token=${encodeURIComponent(token)}`;
      const delivery = await sendInvitationEmail({
        to: user.email,
        name: user.name,
        invitationUrl,
        reset: body.action === 'password-reset'
      });
      return reply(res, 200, {
        emailSent: delivery.sent,
        invitationUrl: delivery.sent ? null : invitationUrl
      });
    }

    return reply(res, 400, { error: 'Choose a valid account action.' });
  } catch (error) {
    if (error.code === 'P2002') return reply(res, 409, { error: 'An account already uses that email address.' });
    if (error.message === 'Invalid URL') return reply(res, 400, { error: 'The request could not be processed.' });
    console.error('Inkverelle account administration:', error);
    return reply(res, 503, { error: 'Account management is temporarily unavailable.' });
  }
}
