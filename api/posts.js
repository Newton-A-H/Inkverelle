import { prisma } from '../lib/prisma.js';
import { getAdminSession, getSession, isSameOrigin, requireCsrf } from '../lib/security.js';

const categories = new Set(['poetry', 'stories', 'reflections']);

function reply(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

function cleanPost(input) {
  const title = String(input?.title || '').trim().slice(0, 140);
  const category = String(input?.category || '').toLowerCase();
  const body = String(input?.body || '').replace(/\r\n?/g, '\n').trim();
  const excerpt = String(input?.excerpt || '').trim().slice(0, 320);
  const slug = String(input?.slug || title)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
  const date = String(input?.date || '');
  const parsedDate = new Date(`${date}T00:00:00Z`);
  const status = input?.status === 'DRAFT' || input?.status === 'draft' ? 'DRAFT' : 'PENDING_REVIEW';
  const tags = (Array.isArray(input?.tags) ? input.tags : String(input?.tags || '').split(','))
    .map(tag => String(tag).trim().toLowerCase().slice(0, 32))
    .filter(Boolean)
    .slice(0, 8);

  if (title.length < 2) throw new Error('Add a title with at least two characters.');
  if (!categories.has(category)) throw new Error('Choose poetry, stories, or reflections.');
  if (!body || body.length > 50000) throw new Error('Add the writing (up to 50,000 characters).');
  if (excerpt.length < 8) throw new Error('Add a short description.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('The title needs at least one letter or number.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) throw new Error('Choose a valid date.');

  return {
    title,
    slug,
    category: category.toUpperCase(),
    date: new Date(`${date}T00:00:00.000Z`),
    excerpt,
    status,
    tags,
    body
  };
}

function parseBody(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body || {};
}

function presentPost(post) {
  return {
    ...post,
    category: String(post.category).toLowerCase(),
    date: new Date(post.date).toISOString().slice(0, 10),
    poem: post.category === 'POETRY',
    read: `${Math.max(1, Math.ceil(post.body.trim().split(/\s+/).length / 210))} min read`,
    author: post.author?.name || 'Inkverelle',
    authorEmail: post.author?.email || undefined
  };
}

async function adminWrite(req, res, session) {
  if (!isSameOrigin(req) || !await requireCsrf(req, session)) {
    return reply(res, 403, { error: 'This request could not be verified.' });
  }
  let input;
  try { input = parseBody(req); }
  catch { return reply(res, 400, { error: 'The writing could not be read. Please try again.' }); }

  if (req.method === 'PATCH') {
    if (session.user.role !== 'ADMIN' || !session.mfaVerifiedAt || input.action !== 'review') {
      return reply(res, 403, { error: 'Only an administrator can review writing.' });
    }
    const status = input.decision === 'approve' ? 'APPROVED' : input.decision === 'reject' ? 'REJECTED' : null;
    if (!status) return reply(res, 400, { error: 'Choose approve or reject.' });
    const post = await prisma.post.update({
      where: { id: String(input.postId || '') },
      data: {
        status,
        rejectionNote: status === 'REJECTED' ? String(input.note || '').trim().slice(0, 1000) || null : null,
        reviewedAt: new Date(),
        reviewedById: session.userId
      },
      include: { author: { select: { name: true, email: true } } }
    });
    return reply(res, 200, { post: presentPost(post) });
  }

  if (req.method === 'DELETE') {
    const post = await prisma.post.findUnique({ where: { id: String(input.postId || '') } });
    if (!post) return reply(res, 404, { error: 'That piece could not be found.' });
    if (session.user.role !== 'ADMIN' && post.authorId !== session.userId) {
      return reply(res, 403, { error: 'You can only remove your own writing.' });
    }
    await prisma.post.delete({ where: { id: post.id } });
    return reply(res, 200, { deleted: true });
  }

  let post;
  try {
    post = cleanPost(input);
  } catch (error) {
    return reply(res, 400, { error: error.message });
  }

  if (req.method === 'POST') {
    const created = await prisma.post.create({
      data: { ...post, authorId: session.userId },
      include: { author: { select: { name: true, email: true } } }
    });
    return reply(res, 201, { post: presentPost(created) });
  }

  if (req.method === 'PUT') {
    const current = await prisma.post.findUnique({ where: { id: String(input.postId || '') } });
    if (!current) return reply(res, 404, { error: 'That piece could not be found.' });
    if (session.user.role !== 'ADMIN' && current.authorId !== session.userId) {
      return reply(res, 403, { error: 'You can only edit your own writing.' });
    }
    const updated = await prisma.post.update({
      where: { id: current.id },
      data: {
        ...post,
        status: post.status === 'DRAFT' ? 'DRAFT' : 'PENDING_REVIEW',
        rejectionNote: null,
        reviewedAt: null,
        reviewedById: null
      },
      include: { author: { select: { name: true, email: true } } }
    });
    return reply(res, 200, { post: presentPost(updated) });
  }

  return reply(res, 405, { error: 'Method not allowed.' });
}

export default async function handler(req, res) {
  try {
    const session = await getSession(req);
    if (req.method === 'GET') {
      if (session?.user.role === 'ADMIN' && !await getAdminSession(req) && String(req.query?.manage || '') === '1') {
        return reply(res, 401, { error: 'Administrator access with verified MFA is required.' });
      }
      if (req.query?.manage === '1') {
        if (!session) return reply(res, 401, { error: 'Sign in to manage writing.' });
        const where = session.user.role === 'ADMIN' ? {} : { authorId: session.userId };
        const posts = await prisma.post.findMany({
          where,
          include: { author: { select: { name: true, email: true } } },
          orderBy: { updatedAt: 'desc' }
        });
        return reply(res, 200, { posts: posts.map(presentPost) });
      }
      const posts = await prisma.post.findMany({
        where: { status: 'APPROVED', date: { lte: new Date(new Date().toISOString().slice(0, 10)) }, author: { active: true } },
        include: { author: { select: { name: true } } },
        orderBy: { date: 'desc' }
      });
      return reply(res, 200, { posts: posts.map(presentPost) });
    }
    if (!session) return reply(res, 401, { error: 'Sign in to manage writing.' });
    if (session.user.role === 'ADMIN' && !session.mfaVerifiedAt) {
      return reply(res, 401, { error: 'Administrator access with verified MFA is required.' });
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return await adminWrite(req, res, session);
    res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE');
    return reply(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    console.error('Inkverelle writing API:', error);
    if (error.code === 'P2002') return reply(res, 409, { error: 'A piece with that title already exists. Change its title to make it unique.' });
    return reply(res, 503, { error: 'Writing is temporarily unavailable. Please try again later.' });
  }
}
