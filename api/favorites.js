import { prisma } from '../lib/prisma.js';
import { getSession, isSameOrigin, requireCsrf } from '../lib/security.js';

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
    if (!session || session.user.role !== 'READER') {
      return reply(res, 401, { error: 'Sign in with a reader account to manage favorites.' });
    }
    if (req.method === 'GET') {
      const favorites = await prisma.favorite.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        select: { slug: true }
      });
      return reply(res, 200, { favorites: favorites.map(item => item.slug) });
    }
    if (!['POST', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, DELETE');
      return reply(res, 405, { error: 'Method not allowed.' });
    }
    if (!isSameOrigin(req) || !await requireCsrf(req, session)) {
      return reply(res, 403, { error: 'This request could not be verified.' });
    }

    const body = requestBody(req);
    const slug = String(body.slug || '').trim().toLowerCase();
    if (slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return reply(res, 400, { error: 'Choose a valid piece to save.' });
    }
    if (req.method === 'POST') {
      await prisma.favorite.upsert({
        where: { userId_slug: { userId: session.userId, slug } },
        create: { userId: session.userId, slug },
        update: {}
      });
      return reply(res, 200, { saved: true });
    }
    await prisma.favorite.deleteMany({ where: { userId: session.userId, slug } });
    return reply(res, 200, { saved: false });
  } catch (error) {
    console.error('Inkverelle reader favorites:', error);
    return reply(res, 503, { error: 'Your favorites are temporarily unavailable.' });
  }
}
