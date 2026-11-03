import { prisma } from '../lib/prisma.js';
import { decryptTotpSecret, hashRecoveryCode, verifyTotp } from '../lib/totp.js';
import {
  clearSessionCookies,
  cookieValue,
  createSession,
  getSession,
  hashPassword,
  hitRateLimit,
  isSameOrigin,
  normalizeEmail,
  recordRateLimit,
  safeEqual,
  tokenHash,
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
  if (String(process.env.ADMIN_SESSION_SECRET || '').length < 32) {
    return reply(res, 503, { error: 'Authentication is not configured. Add an ADMIN_SESSION_SECRET of at least 32 characters.' });
  }
  try {
    if (req.method === 'GET') {
      const token = cookieValue(req, 'inkverelle_csrf');
      const sessionToken = cookieValue(req, 'inkverelle_session');
      const session = sessionToken ? await getSession(req) : null;
      const valid = Boolean(session);
      return reply(res, 200, {
        authenticated: Boolean(valid),
        user: valid ? { id: session.user.id, email: session.user.email, name: session.user.name, role: session.user.role } : null,
        csrfToken: valid ? token : null,
        mfaSetupRequired: Boolean(valid && session.user.role === 'ADMIN' && !session.user.mfaEnabledAt),
        mfaVerified: Boolean(valid && session.user.role === 'ADMIN' && session.mfaVerifiedAt)
      });
    }

    if (req.method === 'POST') {
      if (!isSameOrigin(req)) return reply(res, 403, { error: 'This request could not be verified.' });
      let body;
      try { body = requestBody(req); }
      catch { return reply(res, 400, { error: 'Enter your email and password, then try again.' }); }

      const email = normalizeEmail(body.email);
      const password = typeof body.password === 'string' ? body.password : '';
      if (!/^\S+@\S+\.\S+$/.test(email) || password.length > 128) {
        return reply(res, 400, { error: 'Enter your email and password, then try again.' });
      }
      if (await hitRateLimit('login', email, req)) {
        return reply(res, 429, { error: 'Too many sign-in attempts. Try again in 15 minutes.' });
      }

      let user = await prisma.user.findUnique({ where: { email } });
      const bootstrapEmail = normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL);
      if (!user && bootstrapEmail && email === bootstrapEmail && process.env.BOOTSTRAP_ADMIN_PASSWORD) {
        const passwordHash = await hashPassword(process.env.BOOTSTRAP_ADMIN_PASSWORD);
        user = await prisma.user.create({
          data: { email, name: process.env.BOOTSTRAP_ADMIN_NAME || 'Inkverelle Administrator', role: 'ADMIN', active: true, passwordHash }
        });
      }

      const valid = await verifyPassword(password, user?.passwordHash);
      if (!valid || !user?.active) {
        await recordRateLimit('login', email, req);
        return reply(res, 401, { error: 'We couldn’t sign you in with those details.' });
      }

      let mfaVerified = false;
      if (user.role === 'ADMIN' && user.mfaEnabledAt) {
        const code = String(body.totpCode || '').trim();
        let verified = false;
        try {
          verified = verifyTotp(decryptTotpSecret(user.mfaSecretEncrypted), code);
        } catch { verified = false; }
        if (!verified) {
          const digest = hashRecoveryCode(code);
          const recovery = user.totpRecoveryHashes || [];
          const matching = /^[-\s\da-f]+$/i.test(code) ? recovery.find(value => safeEqual(value, digest)) : null;
          if (matching) {
            const consumed = await prisma.user.updateMany({
              where: { id: user.id, totpRecoveryHashes: { equals: recovery } },
              data: { totpRecoveryHashes: { set: recovery.filter(value => !safeEqual(value, matching)) } }
            });
            mfaVerified = consumed.count === 1;
          }
        } else {
          mfaVerified = true;
        }
        if (!mfaVerified) {
          await recordRateLimit('login', email, req);
          return reply(res, 401, { error: 'We couldn’t sign you in with those details.', mfaRequired: true });
        }
      }

      const session = await createSession(req, user.id, mfaVerified);
      res.setHeader('Set-Cookie', session.cookies);
      return reply(res, 200, {
        authenticated: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        mfaSetupRequired: user.role === 'ADMIN' && !user.mfaEnabledAt,
        csrfToken: session.cookies[1].split(';')[0].split('=').slice(1).join('=')
      });
    }

    if (req.method === 'DELETE') {
      if (!isSameOrigin(req)) return reply(res, 403, { error: 'This request could not be verified.' });
      const token = cookieValue(req, 'inkverelle_session');
      if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
      res.setHeader('Set-Cookie', clearSessionCookies(req));
      return reply(res, 200, { authenticated: false });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return reply(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    console.error('Inkverelle authentication:', error);
    return reply(res, 503, { error: 'Sign-in is temporarily unavailable.' });
  }
}
