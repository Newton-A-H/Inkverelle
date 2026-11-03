import { prisma } from '../lib/prisma.js';
import {
  createSession,
  hitRateLimit,
  isSameOrigin,
  normalizeEmail,
  recordRateLimit,
  hashPassword
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
  if (String(process.env.ADMIN_SESSION_SECRET || '').length < 32) {
    return reply(res, 503, { error: 'Account sign-up is not available right now.' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Method not allowed.' });
  }
  if (!isSameOrigin(req)) return reply(res, 403, { error: 'This request could not be verified.' });

  try {
    const body = requestBody(req);
    if (String(body.website || '').trim()) return reply(res, 201, { created: true });

    const email = normalizeEmail(body.email);
    const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
      return reply(res, 400, { error: 'Enter a valid email address.' });
    }
    if (name.length < 2) return reply(res, 400, { error: 'Enter the name you’d like to use.' });
    if (body.privacyAccepted !== true || body.privacyVersion !== '2026-11-03') {
      return reply(res, 400, { error: 'Please review and accept the Privacy Notice to create an account.' });
    }
    if (password.length < 12 || password.length > 128) {
      return reply(res, 400, { error: 'Use a password with 12–128 characters.' });
    }
    if (await hitRateLimit('reader-registration', email, req)
      || await hitRateLimit('reader-registration-ip', 'all', req)) {
      return reply(res, 429, { error: 'Too many account attempts. Please try again in 15 minutes.' });
    }
    await recordRateLimit('reader-registration', email, req);
    await recordRateLimit('reader-registration-ip', 'all', req, { limit: 8 });

    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      return reply(res, 409, { error: 'An account already uses that email. Try signing in instead.' });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: 'READER',
        active: true,
        privacyAcceptedAt: new Date(),
        privacyVersion: '2026-11-03'
      }
    });
    const session = await createSession(req, user.id);
    res.setHeader('Set-Cookie', session.cookies);
    return reply(res, 201, {
      authenticated: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      csrfToken: session.cookies[1].split(';')[0].split('=').slice(1).join('=')
    });
  } catch (error) {
    if (error.code === 'P2002') return reply(res, 409, { error: 'An account already uses that email. Try signing in instead.' });
    if (error.message.startsWith('Use 12')) return reply(res, 400, { error: error.message });
    console.error('Inkverelle reader registration:', error);
    return reply(res, 503, { error: 'We couldn’t create your account just now. Please try again later.' });
  }
}
