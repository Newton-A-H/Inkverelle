const form = document.querySelector('#activation-form');
const message = document.querySelector('#activation-message');
const token = new URL(location.href).searchParams.get('token') || '';

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const password = form.elements.password.value;
  if (password !== form.elements.confirmation.value) {
    message.textContent = 'Those passwords do not match.';
    message.classList.add('is-error');
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch(new URL('api/activate', document.baseURI), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password, termsAccepted: form.elements.termsAccepted.checked, termsVersion: '2026-10-31' })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The account could not be activated.');
    form.reset();
    message.textContent = 'Your account is ready. You can now sign in.';
    message.classList.remove('is-error');
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('is-error');
  } finally {
    button.disabled = false;
  }
});

if (!token && message) {
  message.textContent = 'This invitation link is missing or incomplete.';
  message.classList.add('is-error');
}
