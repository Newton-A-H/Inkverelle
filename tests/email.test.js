import test from 'node:test';
import assert from 'node:assert/strict';
import { sendAccountRequestNotice, sendEmail, sendInvitationEmail } from '../lib/email.js';

function withEnvironment(values, callback) {
  const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve().then(callback).finally(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = originalFetch;
  });
}

test('invitation emails use the configured site URL and escape the display name', async () => {
  await withEnvironment({
    RESEND_API_KEY: 're_test_key',
    EMAIL_FROM: 'Inkverelle <test@example.com>',
    PUBLIC_SITE_URL: 'https://inkverelle.example/'
  }, async () => {
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ id: 'email-test' }), { status: 200 });
    };

    const result = await sendInvitationEmail({
      to: 'author@example.com',
      name: '<Author>',
      invitationUrl: '/activate/?token=one-time-secret'
    });

    assert.equal(result.sent, true);
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.options.headers.Authorization, 'Bearer re_test_key');
    const payload = JSON.parse(request.options.body);
    assert.deepEqual(payload.to, ['author@example.com']);
    assert.match(payload.html, /&lt;Author&gt;/);
    assert.doesNotMatch(payload.html, /<p><Author><\/p>/);
    assert.match(payload.text, /https:\/\/inkverelle\.example\/activate\/\?token=one-time-secret/);
  });
});

test('email sending returns a manual-fallback result when configuration is missing', async () => {
  await withEnvironment({ RESEND_API_KEY: undefined, EMAIL_FROM: undefined }, async () => {
    globalThis.fetch = async () => { throw new Error('Email should not be sent'); };
    const result = await sendEmail({ to: 'x@example.com', subject: 'Test', text: 'Test', html: '<p>Test</p>' });
    assert.deepEqual(result, { sent: false, reason: 'not-configured' });
  });
});

test('failed provider delivery leaves invitation delivery available for the manual-link fallback', async () => {
  await withEnvironment({
    RESEND_API_KEY: 're_test_key',
    EMAIL_FROM: 'Inkverelle <test@example.com>',
    PUBLIC_SITE_URL: 'https://inkverelle.example'
  }, async () => {
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    const result = await sendInvitationEmail({
      to: 'author@example.com',
      name: 'Author',
      invitationUrl: '/activate/?token=one-time-secret'
    });
    assert.deepEqual(result, { sent: false, reason: 'delivery-failed' });
  });
});

test('admin request notices contain a dashboard link without applicant details', async () => {
  await withEnvironment({
    RESEND_API_KEY: 're_test_key',
    EMAIL_FROM: 'Inkverelle <test@example.com>',
    ADMIN_NOTIFICATION_EMAIL: 'editor@example.com',
    PUBLIC_SITE_URL: 'https://inkverelle.example'
  }, async () => {
    let payload;
    globalThis.fetch = async (_url, options) => {
      payload = JSON.parse(options.body);
      return new Response('{}', { status: 200 });
    };
    const result = await sendAccountRequestNotice();
    assert.equal(result.sent, true);
    assert.deepEqual(payload.to, ['editor@example.com']);
    assert.match(payload.text, /https:\/\/inkverelle\.example\/admin\//);
    assert.doesNotMatch(payload.text, /author@example\.com/);
  });
});
