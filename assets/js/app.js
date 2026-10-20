const menuButton = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('#site-nav');
menuButton?.addEventListener('click', () => {
  const expanded = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!expanded));
  menuButton.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  siteNav?.classList.toggle('open', !expanded);
});
siteNav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  siteNav.classList.remove('open');
  menuButton?.setAttribute('aria-expanded', 'false');
  menuButton?.setAttribute('aria-label', 'Open navigation');
}));

const year = document.querySelector('#year');
if (year) year.textContent = String(new Date().getFullYear());

const contactForm = document.querySelector('#contact-form');
contactForm?.addEventListener('submit', event => {
  event.preventDefault();
  const fields = new FormData(contactForm);
  const recipient = contactForm.dataset.contactEmail;
  const name = String(fields.get('name') || '').trim();
  const reply = String(fields.get('reply') || '').trim();
  const message = String(fields.get('message') || '').trim();
  const subject = `Inkverelle message from ${name}`;
  const body = `Name: ${name}\nReply email: ${reply}\n\n${message}`;
  const status = document.querySelector('#contact-form-status');
  if (status) status.textContent = 'Your email app is opening with the message ready. Review it there and send when you’re ready.';
  window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

const searchDialog = document.querySelector('#search-dialog');
const searchInput = document.querySelector('#search-input');
const searchResults = document.querySelector('#search-results');
const readingListStatus = document.querySelector('#reading-list-status');
const readingListItems = document.querySelector('#reading-list-items');
const savedKey = 'inkverelle-reading-list-v1';
let searchIndex = [];
let storageAvailable = true;

function getSavedSlugs() {
  try {
    const saved = JSON.parse(localStorage.getItem(savedKey) || '[]');
    return Array.isArray(saved) ? saved.filter(slug => typeof slug === 'string') : [];
  } catch {
    storageAvailable = false;
    return [];
  }
}

function updateBookmarkButtons() {
  const saved = new Set(getSavedSlugs());
  document.querySelectorAll('[data-bookmark-slug]').forEach(button => {
    const isSaved = saved.has(button.dataset.bookmarkSlug);
    button.setAttribute('aria-pressed', String(isSaved));
    button.textContent = isSaved ? 'Saved to reading list' : 'Save for later';
  });
}

function writeSavedSlugs(slugs) {
  try {
    localStorage.setItem(savedKey, JSON.stringify(slugs));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  updateBookmarkButtons();
  renderReadingList();
}

function renderReadingList() {
  if (!readingListItems || !readingListStatus) return;
  readingListItems.replaceChildren();
  if (!storageAvailable) {
    readingListStatus.textContent = 'Your browser isn’t allowing this reading list to be saved.';
    return;
  }
  const entries = getSavedSlugs()
    .map(slug => searchIndex.find(item => item.slug === slug))
    .filter(Boolean);
  if (!searchIndex.length) {
    readingListStatus.textContent = 'Loading your reading list…';
    return;
  }
  if (!entries.length) {
    readingListStatus.textContent = 'Nothing saved yet. Use “Save for later” on a poem, story, or reflection to add it here.';
    return;
  }
  readingListStatus.textContent = `${entries.length} ${entries.length === 1 ? 'piece' : 'pieces'} saved in this browser.`;
  for (const entry of entries) {
    const article = document.createElement('article');
    article.className = 'saved-piece';
    const link = document.createElement('a');
    link.href = entry.url;
    link.className = 'saved-piece-link';
    const meta = document.createElement('span');
    meta.className = 'saved-piece-meta';
    meta.textContent = `${entry.category} · ${entry.read}`;
    const title = document.createElement('h2');
    title.textContent = entry.title;
    const excerpt = document.createElement('p');
    excerpt.textContent = entry.excerpt;
    link.append(meta, title, excerpt);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-saved-piece';
    remove.dataset.removeSlug = entry.slug;
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${entry.title} from your reading list`);
    article.append(link, remove);
    readingListItems.append(article);
  }
}

document.addEventListener('click', event => {
  const bookmark = event.target.closest('[data-bookmark-slug]');
  if (bookmark) {
    const slug = bookmark.dataset.bookmarkSlug;
    const saved = getSavedSlugs();
    writeSavedSlugs(saved.includes(slug) ? saved.filter(item => item !== slug) : [...saved, slug]);
    if (readingListStatus && !storageAvailable) readingListStatus.textContent = 'Your browser isn’t allowing this piece to be saved.';
    return;
  }
  const remove = event.target.closest('[data-remove-slug]');
  if (remove) writeSavedSlugs(getSavedSlugs().filter(slug => slug !== remove.dataset.removeSlug));
});

document.querySelectorAll('.copy-link').forEach(button => button.addEventListener('click', async () => {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(button.dataset.copyUrl || location.href);
    button.textContent = 'Link copied';
  } catch {
    button.textContent = 'Couldn’t copy the link';
  }
  window.setTimeout(() => { button.textContent = original; }, 1800);
}));

function renderSearchResults() {
  if (!searchResults || !searchInput) return;
  const query = searchInput.value.trim().toLocaleLowerCase();
  searchResults.replaceChildren();
  if (!query) {
    searchResults.textContent = 'Search by title or try a word from the piece.';
    return;
  }
  const matches = searchIndex.filter(item =>
    [item.title, item.category, item.excerpt, ...(item.tags || [])].join(' ').toLocaleLowerCase().includes(query)
  ).slice(0, 30);
  if (!matches.length) {
    searchResults.textContent = 'Nothing came up. Try another word.';
    return;
  }
  for (const item of matches) {
    const link = document.createElement('a');
    link.className = 'search-result';
    link.href = item.url;
    const label = document.createElement('span');
    label.textContent = `${item.category} · ${item.read}`;
    const title = document.createElement('h3');
    title.textContent = item.title;
    link.append(label, title);
    searchResults.append(link);
  }
}

fetch('search-index.json')
  .then(response => {
    if (!response.ok) throw new Error('Search index unavailable');
    return response.json();
  })
  .then(data => {
    searchIndex = Array.isArray(data) ? data : [];
    updateBookmarkButtons();
    renderReadingList();
    renderSearchResults();
  })
  .catch(() => {
    if (searchResults) searchResults.textContent = 'Search isn’t available right now.';
    if (readingListStatus) readingListStatus.textContent = 'Your reading list couldn’t be loaded. Try again in a moment.';
  });

document.querySelector('.search-open')?.addEventListener('click', () => {
  searchDialog?.showModal();
  searchInput?.focus();
});
searchInput?.addEventListener('input', renderSearchResults);
document.addEventListener('keydown', event => {
  const editing = event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName));
  if ((event.key === '/' || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey))) && !editing) {
    event.preventDefault();
    if (searchDialog?.showModal && !searchDialog.open) searchDialog.showModal();
    searchInput?.focus();
  }
});

if ('IntersectionObserver' in window && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(items => items.forEach(item => {
    if (item.isIntersecting) {
      item.target.classList.add('is-visible');
      observer.unobserve(item.target);
    }
  }), { threshold: .12, rootMargin: '0px 0px -28px 0px' });
  document.querySelectorAll('.hero-copy,.hero-art,.section-heading,.writing-card,.feature-grid,.poetry-inner,.about-photo,.about-copy,.newsletter-inner').forEach((element, index) => {
    element.classList.add('reveal-on-scroll');
    element.style.setProperty('--reveal-delay', `${index % 3 * 75}ms`);
    observer.observe(element);
  });
}
