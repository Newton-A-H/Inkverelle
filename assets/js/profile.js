const profileStatus = document.querySelector('#profile-message');
const csrf = () => decodeURIComponent(document.cookie.split('; ').find(value => value.startsWith('inkverelle_csrf='))?.split('=').slice(1).join('=') || '');
let signedInUser = null;
let idleTimer;
let lastCheck = 0;

async function profileApi(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.method ? { 'X-CSRF-Token': csrf() } : {}), ...(options.headers || {}) } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Your account could not be updated.');
  return result;
}

function armIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await profileApi('api/auth', { method: 'DELETE' }).catch(() => {});
    window.location.assign('login/');
  }, 15 * 60 * 1000);
  if (Date.now() - lastCheck > 60_000) {
    lastCheck = Date.now();
    profileApi('api/auth').then(state => { if (!state.authenticated) window.location.assign('login/'); }).catch(() => {});
  }
}
['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(event => document.addEventListener(event, armIdleTimer, { passive: true }));

async function start() {
  const { user } = await profileApi('api/profile');
  signedInUser = user;
  document.querySelector('#profile-summary').textContent = `${user.role.toLowerCase()} account · Created ${new Date(user.createdAt).toLocaleDateString()}`;
  document.querySelector('#profile-email').textContent = user.email;
  document.querySelector('#profile-name').value = user.name;
  document.querySelector('#profile-return').href = user.role === 'ADMIN' ? 'admin/' : user.role === 'AUTHOR' ? 'author-dashboard/' : 'reader/';
  armIdleTimer();
}

document.querySelector('#profile-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const result = await profileApi('api/profile', { method: 'PATCH', body: JSON.stringify({ action: 'update-profile', name: document.querySelector('#profile-name').value }) });
    document.querySelector('#profile-summary').textContent = `${result.user.role.toLowerCase()} account`;
    profileStatus.textContent = 'Your profile has been updated.';
  } catch (error) { profileStatus.textContent = error.message; }
});

document.querySelector('#password-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const values = Object.fromEntries(new FormData(event.currentTarget));
    values.action = 'change-password';
    await profileApi('api/profile', { method: 'PATCH', body: JSON.stringify(values) });
    event.currentTarget.reset();
    profileStatus.textContent = 'Your password has been changed. Other signed-in sessions have been closed.';
  } catch (error) { profileStatus.textContent = error.message; }
});

document.querySelector('#profile-signout')?.addEventListener('click', async () => {
  await profileApi('api/auth', { method: 'DELETE' }).catch(() => {});
  window.location.assign('login/');
});

start().catch(() => window.location.replace('login/'));
