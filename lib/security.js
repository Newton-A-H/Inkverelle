import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';
import { prisma } from './prisma.js';

const scrypt = promisify(nodeScrypt);
const sessionDurationMs = 1000 * 60 * 60 * 12;
const invitationDurationMs = 1000 * 60 * 60 * 24 * 3;
const passwordPattern = /^(?=.{12,128}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).*$/;

export const termsVersion = '2026-10-31';

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function safeEqual(left, right) {
  const leftHash = createHash('sha256').update(String(left || '')).digest();
  const rightHash = createHash('sha256').update(String(right || '')).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export async function hashPassword(password) {
  if (!passwordPattern.test(String(password))) {
    throw new Error('Use 12–128 characters with upper- and lowercase letters, a number, and a symbol.');
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  return `scrypt$131072$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof encoded !== 'string') {
    await scrypt(String(password || ''), Buffer.alloc(16), 64, { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
    return false;
  }
  const [algorithm, cost, blockSize, parallelism, saltValue, hashValue] = encoded.split('$');
  if (algorithm !== 'scrypt' || cost !== '131072' || blockSize !== '8' || parallelism !== '1') return false;
  const salt = Buffer.from(saltValue || '', 'base64url');
  const expected = Buffer.from(hashValue || '', 'base64url');
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await scrypt(String(password || ''), salt, expected.length, {
    N: 1 << 17,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024
  });
  return timingSafeEqual(actual, expected);
}

export function tokenHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function createToken() {
  return randomBytes(32).toString('base64url');
}

export function cookieValue(req, name) {
  const cookieHeader = String(req.headers.cookie || '');
  for (const segment of cookieHeader.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 0) continue;
    if (segment.slice(0, separator).trim() === name) {
      return decodeURIComponent(segment.slice(separator + 1).trim());
    }
  }
  return '';
}

export function secureCookies(req) {
  return requestProtocol(req) === 'https' ? '; Secure' : '';
}

export function makeSessionCookies(req, sessionToken, csrfToken) {
  const secure = secureCookies(req);
  return [
    `inkverelle_session=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure}`,
    `inkverelle_csrf=${csrfToken}; Path=/; SameSite=Strict; Max-Age=43200${secure}`
  ];
}

export function clearSessionCookies(req) {
  const secure = secureCookies(req);
  return [
    `inkverelle_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
    `inkverelle_csrf=; Path=/; SameSite=Strict; Max-Age=0${secure}`
  ];
}

export function isSameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  return origin === `${requestProtocol(req)}://${host}`;
}

function requestProtocol(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (forwarded === 'http' || forwarded === 'https') return forwarded;
  const host = String(req.headers.host || '').toLowerCase();
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(host) ? 'http' : 'https';
}

export async function getSession(req) {
  const token = cookieValue(req, 'inkverelle_session');
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true }
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
  return session;
}

export async function requireCsrf(req, session) {
  if (!isSameOrigin(req)) return false;
  const cookie = cookieValue(req, 'inkverelle_csrf');
  const header = String(req.headers['x-csrf-token'] || '');
  if (!cookie || !header || !safeEqual(cookie, header)) return false;
  return safeEqual(tokenHash(cookie), session.csrfTokenHash);
}

export async function createSession(req, userId, mfaVerified = false) {
  const sessionToken = createToken();
  const csrfToken = createToken();
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  await prisma.session.create({
    data: {
      tokenHash: tokenHash(sessionToken),
      csrfTokenHash: tokenHash(csrfToken),
      userId,
      expiresAt,
      mfaVerifiedAt: mfaVerified ? new Date() : null
    }
  });
  return { cookies: makeSessionCookies(req, sessionToken, csrfToken), expiresAt };
}

export async function getAdminSession(req) {
  const session = await getSession(req);
  if (!session || session.user.role !== 'ADMIN' || !session.mfaVerifiedAt) return null;
  return session;
}

export async function createInvitation(userId) {
  const token = createToken();
  await prisma.invitation.upsert({
    where: { userId },
    update: {
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + invitationDurationMs),
      usedAt: null
    },
    create: {
      tokenHash: tokenHash(token),
      userId,
      expiresAt: new Date(Date.now() + invitationDurationMs)
    }
  });
  return token;
}

function rateLimitHash(scope, value, req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const key = createHmac('sha256', process.env.ADMIN_SESSION_SECRET || 'inkverelle-local')
    .update(`${scope}\0${normalizeEmail(value)}\0${forwarded}`)
    .digest('hex');
  return key;
}

export async function hitRateLimit(scope, value, req) {
  const key = rateLimitHash(scope, value, req);
  const current = await prisma.loginRateLimit.findUnique({ where: { keyHash: key } });
  if (current?.blockedUntil && current.blockedUntil > new Date()) return true;
  return false;
}

export async function recordRateLimit(scope, value, req) {
  const key = rateLimitHash(scope, value, req);
  const now = new Date();
  const windowStart = new Date(now.getTime() - 15 * 60 * 1000);
  await prisma.$executeRaw`
    INSERT INTO "LoginRateLimit" ("keyHash", "attempts", "windowStartedAt", "blockedUntil", "updatedAt")
    VALUES (${key}, 1, ${now}, NULL, ${now})
    ON CONFLICT ("keyHash") DO UPDATE SET
      "attempts" = CASE WHEN "LoginRateLimit"."windowStartedAt" < ${windowStart} THEN 1 ELSE "LoginRateLimit"."attempts" + 1 END,
      "windowStartedAt" = CASE WHEN "LoginRateLimit"."windowStartedAt" < ${windowStart} THEN ${now} ELSE "LoginRateLimit"."windowStartedAt" END,
      "blockedUntil" = CASE WHEN "LoginRateLimit"."attempts" >= 4 AND "LoginRateLimit"."windowStartedAt" >= ${windowStart} THEN ${new Date(now.getTime() + 15 * 60 * 1000)} ELSE NULL END,
      "updatedAt" = ${now}
  `;
}
