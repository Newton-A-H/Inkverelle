import { prisma } from '../lib/prisma.js';
import { sendAccountRequestNotice } from '../lib/email.js';
import {
  hitRateLimit,
  isSameOrigin,
  normalizeEmail,
  recordRateLimit,
  termsVersion
} from '../lib/security.js';

function reply(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (String(process.env.ADMIN_SESSION_SECRET || '').length < 32) {
    return reply(res, 503, { error: 'Account requests are not available right now.' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Method not allowed.' });
  }
  if (!isSameOrigin(req)) return reply(res, 403, { error: 'This request could not be verified.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (String(body.website || '').trim()) return reply(res, 201, { received: true });

    const email = normalizeEmail(body.email);
    const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const reason = String(body.reason || '').trim().slice(0, 1000);
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
      return reply(res, 400, { error: 'Enter a valid email address.' });
    }
    if (name.length < 2) return reply(res, 400, { error: 'Enter the name you’d like shown with your writing.' });
    if (reason.length < 10) return reply(res, 400, { error: 'Please tell us a little about the writing you hope to share.' });
    if (body.termsAccepted !== true || body.termsVersion !== termsVersion) {
      return reply(res, 400, { error: 'Please review and accept the contributor terms before requesting an account.' });
    }
    if (await hitRateLimit('account-request', email, req)) {
      return reply(res, 429, { error: 'Too many requests. Please try again in 15 minutes.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) return reply(res, 200, { received: true });

    const pending = await prisma.accountRequest.findFirst({ where: { email, status: 'PENDING' } });
    if (!pending) {
      await prisma.accountRequest.create({
        data: { email, name, reason, termsVersion }
      });
      const notification = await sendAccountRequestNotice({ name, email });
      if (!notification.sent) {
        console.warn('Inkverelle admin request notification was not delivered:', notification.reason);
      }
    }
    await recordRateLimit('account-request', email, req);
    return reply(res, 201, { received: true });
  } catch (error) {
    console.error('Inkverelle account request:', error);
    return reply(res, 503, { error: 'We couldn’t receive your request just now. Please try again later.' });
  }
}
