const resendEndpoint = 'https://api.resend.com/emails';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function publicUrl(path) {
  const configured = String(process.env.PUBLIC_SITE_URL || '').trim();
  if (!configured) return null;
  try {
    const base = new URL(configured);
    const localHttp = base.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(base.hostname);
    if (base.protocol !== 'https:' && !localHttp) return null;
    return new URL(path, base).href;
  } catch {
    return null;
  }
}

export async function sendEmail({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { sent: false, reason: 'not-configured' };

  try {
    const response = await fetch(resendEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      console.error('Inkverelle email delivery failed:', response.status);
      return { sent: false, reason: 'delivery-failed' };
    }
    return { sent: true };
  } catch (error) {
    console.error('Inkverelle email transport failed:', error.name || 'network error');
    return { sent: false, reason: 'delivery-failed' };
  }
}

export async function sendInvitationEmail({ to, name, invitationUrl, reset = false }) {
  const absoluteUrl = publicUrl(invitationUrl);
  if (!absoluteUrl) return { sent: false, reason: 'site-url-missing' };

  const subject = reset ? 'Set a new Inkverelle password' : 'Your Inkverelle author invitation';
  const instruction = reset
    ? 'Use this one-time link to choose a new password:'
    : 'Your Inkverelle author account is ready. Use this one-time link to set your password:';
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(absoluteUrl);
  return sendEmail({
    to,
    subject,
    text: `Hello ${name},\n\n${instruction}\n${absoluteUrl}\n\nThe link expires in three days and can only be used once.`,
    html: `<p>Hello ${safeName},</p><p>${instruction}</p><p><a href="${safeUrl}">Continue to Inkverelle</a></p><p>The link expires in three days and can only be used once.</p>`
  });
}

export async function sendAccountRequestNotice() {
  const recipient = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL;
  const dashboardUrl = publicUrl('/admin/');
  if (!recipient || !dashboardUrl) return { sent: false, reason: 'not-configured' };
  const safeUrl = escapeHtml(dashboardUrl);
  return sendEmail({
    to: recipient,
    subject: 'A new Inkverelle author request is waiting',
    text: `A new author account request is waiting for review. Open the administrator dashboard: ${dashboardUrl}`,
    html: `<p>A new author account request is waiting for review.</p><p><a href="${safeUrl}">Open the administrator dashboard</a></p>`
  });
}
