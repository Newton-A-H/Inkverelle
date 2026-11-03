import { timingSafeEqual } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  const authorization = String(req.headers.authorization || '');
  if (!secret || !safeEqual(authorization, `Bearer ${secret}`)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
    const result = await prisma.accountRequest.deleteMany({
      where: { status: 'REJECTED', reviewedAt: { lt: cutoff } }
    });
    const rateLimitCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rateLimits = await prisma.loginRateLimit.deleteMany({
      where: { updatedAt: { lt: rateLimitCutoff } }
    });
    const now = new Date();
    const idleCutoff = new Date(now.getTime() - 15 * 60 * 1000);
    await prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { lastSeenAt: { lt: idleCutoff } }] }
    });
    return res.status(200).json({
      deletedRejectedRequests: result.count,
      deletedRateLimitRecords: rateLimits.count
    });
  } catch (error) {
    console.error('Inkverelle rejected-request retention:', error);
    return res.status(503).json({ error: 'Retention cleanup failed.' });
  }
}
