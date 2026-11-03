const loginPanel = document.querySelector('#admin-login-panel');
const dashboard = document.querySelector('#admin-dashboard');
const loginForm = document.querySelector('#admin-login-form');
const writingForm = document.querySelector('#writing-form');
const message = document.querySelector('#admin-message');
const writingList = document.querySelector('#managed-writing');
const saveButton = document.querySelector('#save-writing');
const postIdField = document.querySelector('#post-id');
const csrfHeader = 'X-CSRF-Token';
let csrfToken = '';
let currentUser = null;
let idleTimer = null;
let lastSessionCheck = 0;
const idleTimeoutMs = 15 * 60 * 1000;

function signOutForInactivity() {
  if (!currentUser) return;
  api('api/auth', { method: 'DELETE' }).catch(() => {});
  window.clearTimeout(idleTimer);
  dashboard.hidden = true;
  loginPanel.hidden = false;
  currentUser = null;
  csrfToken = '';
  showMessage('You were signed out after 15 minutes without activity.');
}

function resetIdleTimer() {
  if (!currentUser) return;
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(signOutForInactivity, idleTimeoutMs);

  const now = Date.now();
  if (now - lastSessionCheck < 60_000) return;
  lastSessionCheck = now;
  api('api/auth').then(state => {
    if (!state.authenticated) signOutForInactivity();
  }).catch(() => {});
}

['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(type => {
  document.addEventListener(type, resetIdleTimer, { passive: true });
});

function showMessage(text, error = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle('is-error', error);
}

async function api(path, options = {}) {
  const response = await fetch(new URL(path, document.baseURI), {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { [csrfHeader]: csrfToken } : {}),
      ...options.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'The request could not be completed.');
    error.mfaRequired = data.mfaRequired === true;
    throw error;
  }
  if (data.csrfToken) csrfToken = data.csrfToken;
  return data;
}

function dateForInput() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function actionButton(label, action, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener('click', action);
  return button;
}

function appendInviteResult(container, invitationUrl) {
  const result = document.createElement('div');
  result.className = 'invite-result';
  const note = document.createElement('p');
  note.textContent = 'Copy this invitation link and send it to the author. It works once and expires in three days.';
  const link = document.createElement('input');
  link.type = 'text';
  link.readOnly = true;
  link.value = new URL(invitationUrl, document.baseURI).href;
  link.setAttribute('aria-label', 'One-time author invitation link');
  const copy = actionButton('Copy invitation link', async () => {
    await navigator.clipboard.writeText(link.value);
    copy.textContent = 'Copied';
  });
  result.append(note, link, copy);
  container.prepend(result);
}

function reportInvitation(container, result, type = 'invitation') {
  if (result.emailSent) {
    showMessage(type === 'reset' ? 'Password reset email sent.' : 'Activation email sent.');
    return;
  }
  if (result.invitationUrl) {
    appendInviteResult(container, result.invitationUrl);
    showMessage(`Email could not be sent. Copy the ${type === 'reset' ? 'reset' : 'activation'} link and send it manually.`, true);
    return;
  }
  showMessage('The email could not be sent and no link was created. Please try again.', true);
}

async function reviewPost(post, decision) {
  let note = '';
  if (decision === 'reject') {
    const response = window.prompt('Optional note for the author about this decision:');
    if (response === null) return;
    note = response.trim();
  }
  try {
    await api('api/posts', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'review', postId: post.id, decision, note })
    });
    showMessage(decision === 'approve' ? 'Writing approved and now available to everyone.' : 'Writing rejected. The author can revise and resubmit it.');
    await refreshWriting();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function deletePost(post) {
  if (!window.confirm(`Delete “${post.title}”?`)) return;
  try {
    await api('api/posts', { method: 'DELETE', body: JSON.stringify({ postId: post.id }) });
    if (postIdField.value === post.id) resetForm();
    showMessage('The piece has been deleted.');
    await refreshWriting();
  } catch (error) {
    showMessage(error.message, true);
  }
}

function fillForm(post) {
  writingForm.elements.title.value = post.title;
  writingForm.elements.category.value = post.category;
  writingForm.elements.date.value = post.date;
  writingForm.elements.excerpt.value = post.excerpt;
  writingForm.elements.tags.value = (post.tags || []).join(', ');
  writingForm.elements.status.value = post.status;
  writingForm.elements.body.value = post.body;
  postIdField.value = post.id;
  saveButton.textContent = 'Save changes';
  document.querySelector('#writing-form-title').textContent = 'Edit your writing';
  writingForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
  writingForm.reset();
  writingForm.elements.date.value = dateForInput();
  writingForm.elements.status.value = 'PENDING_REVIEW';
  postIdField.value = '';
  saveButton.textContent = 'Send for review';
  document.querySelector('#writing-form-title').textContent = 'Submit a poem, story, or reflection';
}

function renderWriting(posts) {
  writingList.replaceChildren();
  if (!posts.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'Your writing will appear here after you save it.';
    writingList.append(empty);
    return;
  }

  for (const post of posts) {
    const row = document.createElement('article');
    row.className = 'managed-piece';
    const details = document.createElement('div');
    const meta = document.createElement('p');
    meta.className = 'eyebrow';
    meta.textContent = `${post.category} · ${post.status.replaceAll('_', ' ').toLowerCase()}${currentUser.role === 'ADMIN' ? ` · ${post.author}` : ''}`;
    const title = document.createElement('h3');
    title.textContent = post.title;
    const date = document.createElement('p');
    date.className = 'managed-date';
    date.textContent = post.date;
    details.append(meta, title, date);
    if (post.rejectionNote) {
      const note = document.createElement('p');
      note.className = 'managed-date';
      note.textContent = `Editor’s note: ${post.rejectionNote}`;
      details.append(note);
    }

    const actions = document.createElement('div');
    actions.className = 'managed-actions';
    actions.append(actionButton('Edit', () => fillForm(post)));
    if (currentUser.role === 'ADMIN' && post.status === 'PENDING_REVIEW') {
      actions.append(actionButton('Approve', () => reviewPost(post, 'approve')));
      actions.append(actionButton('Reject', () => reviewPost(post, 'reject'), 'remove-writing'));
    }
    actions.append(actionButton('Delete', () => deletePost(post), 'remove-writing'));
    row.append(details, actions);
    writingList.append(row);
  }
}

async function refreshWriting() {
  const { posts } = await api('api/posts?manage=1');
  renderWriting(posts);
}

function renderAdminList(target, records, emptyText, createRow) {
  target.replaceChildren();
  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = emptyText;
    target.append(empty);
    return;
  }
  for (const record of records) target.append(createRow(record));
}

async function refreshAccounts() {
  const { requests, authors } = await api('api/admin-accounts');
  renderAdminList(document.querySelector('#account-requests'), requests, 'There are no account requests to review.', request => {
    const row = document.createElement('article');
    row.className = 'managed-piece';
    const details = document.createElement('div');
    const meta = document.createElement('p');
    meta.className = 'eyebrow';
    meta.textContent = `${request.status.toLowerCase()} · ${new Date(request.requestedAt).toLocaleDateString()}`;
    const name = document.createElement('h3');
    name.textContent = `${request.name} · ${request.email}`;
    const reason = document.createElement('p');
    reason.textContent = request.reason;
    details.append(meta, name, reason);
    const actions = document.createElement('div');
    actions.className = 'managed-actions';
    if (request.status === 'PENDING') {
      actions.append(actionButton('Approve', async () => {
        try {
          const result = await api('api/admin-accounts', {
            method: 'PATCH',
            body: JSON.stringify({ action: 'review-request', requestId: request.id, decision: 'approve' })
          });
          reportInvitation(document.querySelector('#admin-tools'), result);
          await refreshAccounts();
        } catch (error) { showMessage(error.message, true); }
      }));
      actions.append(actionButton('Reject', async () => {
        try {
          await api('api/admin-accounts', {
            method: 'PATCH',
            body: JSON.stringify({ action: 'review-request', requestId: request.id, decision: 'reject' })
          });
          showMessage('The account request was declined.');
          await refreshAccounts();
        } catch (error) { showMessage(error.message, true); }
      }, 'remove-writing'));
    }
    row.append(details, actions);
    return row;
  });

  renderAdminList(document.querySelector('#author-accounts'), authors, 'There are no author accounts yet.', author => {
    const row = document.createElement('article');
    row.className = 'managed-piece';
    const details = document.createElement('div');
    const meta = document.createElement('p');
    meta.className = 'eyebrow';
    meta.textContent = author.active ? 'active account' : 'invitation pending';
    const name = document.createElement('h3');
    name.textContent = `${author.name} · ${author.email}`;
    details.append(meta, name);
    const actions = document.createElement('div');
    actions.className = 'managed-actions';
    if (!author.active) {
      actions.append(actionButton('Create new invitation link', async () => {
        try {
          const result = await api('api/admin-accounts', {
            method: 'PATCH',
            body: JSON.stringify({ action: 'resend-invitation', userId: author.id })
          });
          reportInvitation(row, result);
        } catch (error) { showMessage(error.message, true); }
      }));
    } else {
      actions.append(actionButton('Create password reset link', async () => {
        try {
          const result = await api('api/admin-accounts', {
            method: 'PATCH',
            body: JSON.stringify({ action: 'password-reset', userId: author.id })
          });
          reportInvitation(document.querySelector('#admin-tools'), result, 'reset');
        } catch (error) { showMessage(error.message, true); }
      }));
    }
    actions.append(actionButton(author.active ? 'Suspend' : 'Reactivate', async () => {
      try {
        await api('api/admin-accounts', {
          method: 'PATCH',
          body: JSON.stringify({ action: 'toggle-author', userId: author.id, active: !author.active })
        });
        await refreshAccounts();
      } catch (error) { showMessage(error.message, true); }
    }));
    row.append(details, actions);
    return row;
  });
}

async function setupAdminMfa() {
  const panel = document.querySelector('#mfa-setup-panel');
  const dashboard = document.querySelector('#admin-dashboard');
  const error = document.querySelector('#mfa-setup-error');
  panel.hidden = false;
  dashboard.dataset.mfaSetup = 'true';
  try {
    const setup = await api('api/mfa', { method: 'POST', body: JSON.stringify({ action: 'begin' }) });
    document.querySelector('#mfa-secret').textContent = setup.secret;
  } catch (reason) {
    error.textContent = reason.message;
  }
}

async function openDashboard(user, state = {}) {
  currentUser = user;
  lastSessionCheck = Date.now();
  resetIdleTimer();
  loginPanel.hidden = true;
  dashboard.hidden = false;
  if (user.role === 'ADMIN' && state.mfaSetupRequired) {
    await setupAdminMfa();
    return;
  }
  dashboard.dataset.mfaSetup = 'false';
  document.querySelector('#mfa-setup-panel').hidden = true;
  document.querySelector('#signed-in-as').textContent = `${user.name} · ${user.role.toLowerCase()}`;
  const admin = user.role === 'ADMIN';
  document.querySelector('#admin-tools').hidden = !admin;
  document.querySelector('#managed-writing-heading').textContent = admin ? 'Writing and submissions' : 'Your writing';
  document.querySelector('#writing-status-label').hidden = admin;
  saveButton.textContent = 'Send for review';
  try {
    await refreshWriting();
    if (admin) await refreshAccounts();
    showMessage(admin ? 'Review submissions and manage author accounts here.' : 'Your drafts stay private until you submit them and the editor approves them.');
  } catch (error) {
    showMessage(error.message, true);
  }
}

loginForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await api('api/auth', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(loginForm)))
    });
    loginForm.reset();
    await openDashboard(result.user, result);
  } catch (error) {
    if (error.mfaRequired) document.querySelector('#admin-totp-label').hidden = false;
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});

writingForm?.addEventListener('submit', async event => {
  event.preventDefault();
  saveButton.disabled = true;
  const payload = Object.fromEntries(new FormData(writingForm));
  payload.tags = String(payload.tags || '').split(',').map(tag => tag.trim()).filter(Boolean);
  payload.postId = postIdField.value;
  try {
    await api('api/posts', {
      method: postIdField.value ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    showMessage(payload.status === 'DRAFT' ? 'Draft saved.' : 'Sent to the editor for review.');
    resetForm();
    await refreshWriting();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    saveButton.disabled = false;
  }
});

document.querySelector('#invite-author-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await api('api/admin-accounts', {
      method: 'POST',
      body: JSON.stringify({ action: 'invite-author', ...Object.fromEntries(new FormData(form)) })
    });
    form.reset();
    reportInvitation(document.querySelector('#admin-tools'), result);
    await refreshAccounts();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#cancel-edit')?.addEventListener('click', resetForm);
document.querySelector('#mfa-enable')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  const error = document.querySelector('#mfa-setup-error');
  button.disabled = true;
  try {
    const result = await api('api/mfa', {
      method: 'POST',
      body: JSON.stringify({ action: 'enable', code: document.querySelector('#mfa-setup-code').value })
    });
    document.querySelector('#mfa-recovery-codes').textContent = result.recoveryCodes.join('\n');
    document.querySelector('#mfa-recovery-panel').hidden = false;
    document.querySelector('#mfa-secret').parentElement.hidden = true;
    document.querySelector('#mfa-setup-code').parentElement.hidden = true;
    button.hidden = true;
    error.textContent = 'MFA is enabled.';
  } catch (reason) {
    error.textContent = reason.message;
  } finally {
    button.disabled = false;
  }
});
document.querySelector('#mfa-continue')?.addEventListener('click', async () => {
  const state = await api('api/auth');
  if (state.authenticated) await openDashboard(state.user, state);
});
document.querySelector('#admin-sign-out')?.addEventListener('click', async () => {
  window.clearTimeout(idleTimer);
  try {
    await api('api/auth', { method: 'DELETE' });
  } finally {
    dashboard.hidden = true;
    loginPanel.hidden = false;
    currentUser = null;
    csrfToken = '';
    showMessage('You are signed out.');
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  if (!loginPanel) return;
  try {
    const state = await api('api/auth');
    if (state.authenticated) await openDashboard(state.user, state);
  } catch (error) {
    showMessage(error.message, true);
  }
  if (writingForm?.elements.date) writingForm.elements.date.value = dateForInput();
});
