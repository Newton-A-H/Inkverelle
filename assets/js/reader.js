const readerGrid = document.querySelector('#reader-writing');
const readerStatus = document.querySelector('#reader-message');
let articles = [];
let savedSlugs = new Set();
let categoryFilter = 'all';
let view = 'all';
let csrf = '';
let idleTimer;
let lastCheck = 0;

async function readerApi(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.method ? { 'X-CSRF-Token': csrf } : {}), ...(options.headers || {}) };
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'That request could not be completed.');
  return result;
}

function idleCheck() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await readerApi('api/auth', { method: 'DELETE' }).catch(() => {});
    window.location.assign('login/');
  }, 15 * 60 * 1000);
  if (Date.now() - lastCheck > 60_000) {
    lastCheck = Date.now();
    readerApi('api/auth').then(state => { if (!state.authenticated) window.location.assign('login/'); }).catch(() => {});
  }
}
['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(type => document.addEventListener(type, idleCheck, { passive: true }));

function render() {
  const visible = articles.filter(article => (categoryFilter === 'all' || article.category === categoryFilter)
    && (view !== 'favorites' || savedSlugs.has(article.slug)));
  readerGrid.replaceChildren();
  if (!visible.length) {
    const note = document.createElement('p');
    note.className = 'archive-empty';
    note.textContent = view === 'favorites' ? 'You haven’t saved anything here yet.' : 'There’s nothing in this section just yet.';
    readerGrid.append(note);
    return;
  }
  for (const article of visible) {
    const card = document.createElement('article');
    card.className = 'writing-card';
    const link = document.createElement('a');
    link.className = 'writing-card-link';
    link.href = article.url;
    const category = document.createElement('p');
    category.className = 'eyebrow';
    category.textContent = article.category;
    const title = document.createElement('h2');
    title.textContent = article.title;
    const excerpt = document.createElement('p');
    excerpt.textContent = article.excerpt || '';
    const author = document.createElement('p');
    author.className = 'card-author';
    author.textContent = `By ${article.author || 'Inkverelle'}`;
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'reader-save-button';
    save.textContent = savedSlugs.has(article.slug) ? 'Saved to favorites' : 'Save for later';
    save.setAttribute('aria-pressed', String(savedSlugs.has(article.slug)));
    save.addEventListener('click', async () => {
      const wasSaved = savedSlugs.has(article.slug);
      try {
        await readerApi('api/favorites', { method: wasSaved ? 'DELETE' : 'POST', body: JSON.stringify({ slug: article.slug }) });
        wasSaved ? savedSlugs.delete(article.slug) : savedSlugs.add(article.slug);
        render();
      } catch (error) { readerStatus.textContent = error.message; }
    });
    link.append(category, title, excerpt, author);
    card.append(link, save);
    readerGrid.append(card);
  }
}

document.querySelectorAll('[data-reader-view]').forEach(button => button.addEventListener('click', () => {
  view = button.dataset.readerView;
  document.querySelectorAll('[data-reader-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  render();
}));
document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
  categoryFilter = button.dataset.category;
  document.querySelectorAll('[data-category]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  render();
}));

document.querySelector('#reader-signout')?.addEventListener('click', async () => {
  await readerApi('api/auth', { method: 'DELETE' }).catch(() => {});
  window.location.assign('login/');
});

async function startReader() {
  const state = await readerApi('api/auth');
  if (!state.authenticated) return window.location.replace('login/');
  if (state.user.role !== 'READER') return window.location.replace(state.user.role === 'ADMIN' ? 'admin/' : 'author-dashboard/');
  csrf = state.csrfToken || '';
  document.querySelector('#reader-welcome').textContent = `Welcome, ${state.user.name}. Browse the journal and keep the pieces you want to revisit.`;
  const [staticResponse, dynamicResponse, favorites] = await Promise.all([
    fetch('search-index.json').then(response => response.json()),
    readerApi('api/posts'),
    readerApi('api/favorites')
  ]);
  const dynamicPosts = (dynamicResponse.posts || []).filter(post => post.status === 'APPROVED').map(post => ({ ...post, category: post.category[0].toUpperCase() + post.category.slice(1), url: `read/?slug=${encodeURIComponent(post.slug)}` }));
  articles = [...staticResponse, ...dynamicPosts];
  savedSlugs = new Set(favorites.favorites || []);
  render();
  idleCheck();
}
startReader().catch(error => { readerStatus.textContent = error.message; });
