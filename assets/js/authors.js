const loginForm = document.querySelector('#author-login-form');
const requestForm = document.querySelector('#account-request-form');
const message = document.querySelector('#author-message');
let csrfToken = '';

function showMessage(text, error = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle('is-error', error);
}

async function send(url, options = {}) {
  const response = await fetch(new URL(url, document.baseURI), {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'The request could not be completed.');
    error.mfaRequired = data.mfaRequired === true;
    throw error;
  }
  return data;
}

loginForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const data = await send('api/auth', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(loginForm)))
    });
    csrfToken = data.csrfToken;
    location.href = new URL(data.user.role === 'ADMIN' ? 'admin/' : 'author-dashboard/', document.baseURI).href;
  } catch (error) {
    if (error.mfaRequired) document.querySelector('#author-totp-label').hidden = false;
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});

requestForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = requestForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const request = Object.fromEntries(new FormData(requestForm));
    request.termsAccepted = requestForm.elements.termsAccepted.checked;
    await send('api/account-requests', {
      method: 'POST',
      body: JSON.stringify(request)
    });
    requestForm.reset();
    showMessage('Thanks. Your request is with the editor for review.');
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});
