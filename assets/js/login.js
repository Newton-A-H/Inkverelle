const signInForm = document.querySelector('#shared-login-form');
const registerForm = document.querySelector('#reader-register-form');
const status = document.querySelector('#login-message');
const mfaWrap = document.querySelector('#login-totp-wrap');

async function send(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (result.mfaRequired) mfaWrap.hidden = false;
    throw new Error(result.error || 'That request could not be completed.');
  }
  return result;
}

function dashboardFor(role) {
  return role === 'ADMIN' ? 'admin/' : role === 'AUTHOR' ? 'author-dashboard/' : 'reader/';
}

async function redirectIfSignedIn() {
  const state = await send('api/auth');
  if (state.authenticated && (state.user.role !== 'ADMIN' || state.mfaVerified || state.mfaSetupRequired)) {
    window.location.replace(dashboardFor(state.user.role));
  }
}

signInForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = signInForm.querySelector('[type="submit"]');
  button.disabled = true;
  status.textContent = '';
  try {
    const result = await send('api/auth', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(signInForm))) });
    window.location.assign(dashboardFor(result.user.role));
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});

registerForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = registerForm.querySelector('[type="submit"]');
  button.disabled = true;
  status.textContent = '';
  const data = Object.fromEntries(new FormData(registerForm));
  data.privacyAccepted = registerForm.elements.privacyAccepted.checked;
  try {
    await send('api/register', { method: 'POST', body: JSON.stringify(data) });
    window.location.assign('reader/');
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});

redirectIfSignedIn().catch(() => {});
