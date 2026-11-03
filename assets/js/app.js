// A small copying deterrent on public reading pages. Browser tools can still bypass it.
if (!/(?:^|\/)admin(?:\/|$)/i.test(window.location.pathname)) {
  document.addEventListener('contextmenu', event => event.preventDefault());
}

document.querySelectorAll('[data-password-toggle]').forEach(button => {
  const input = document.getElementById(button.getAttribute('aria-controls'));
  if (!input) return;

  button.addEventListener('click', () => {
    const showPassword = input.type === 'password';
    input.type = showPassword ? 'text' : 'password';
    button.textContent = showPassword ? 'Hide' : 'Show';
    button.setAttribute('aria-label', `${showPassword ? 'Hide' : 'Show'} password`);
    button.setAttribute('aria-pressed', String(showPassword));
  });
});

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

document.addEventListener('click', async event => {
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
  const copy = event.target.closest('.copy-link');
  if (copy) {
    const original = copy.textContent;
    try {
      await navigator.clipboard.writeText(copy.dataset.copyUrl || location.href);
      copy.textContent = 'Link copied';
    } catch {
      copy.textContent = 'Couldn’t copy the link';
    }
    window.setTimeout(() => { copy.textContent = original; }, 1800);
  }
});

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

function readDate(value) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(parsed);
}

function tagSlug(value) {
  return String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function appendInlineWriting(target, text) {
  for (const part of String(text).split(/(\*\*[^*]+\*\*)/g)) {
    if (part.startsWith('**') && part.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      target.append(strong);
    } else target.append(document.createTextNode(part));
  }
}

function makeWritingCard(item, index) {
  const card = document.createElement('article');
  card.className = 'writing-card';
  const link = document.createElement('a');
  link.className = 'writing-card-link';
  link.href = item.dynamic
    ? new URL(`read/?slug=${encodeURIComponent(item.slug)}`, document.baseURI).href
    : new URL(item.url, document.baseURI).href;
  link.setAttribute('aria-label', `Read ${item.title}`);
  const art = document.createElement('div');
  art.className = `card-art art-${index % 6 + 1}`;
  const tag = document.createElement('span');
  tag.className = 'art-tag';
  tag.textContent = item.category;
  art.append(tag);
  const info = document.createElement('div');
  info.className = 'card-info';
  const date = document.createElement('span');
  date.className = 'card-date';
  date.textContent = readDate(item.date);
  const title = document.createElement('h3');
  title.textContent = item.title;
  const author = document.createElement('span');
  author.className = 'card-author';
  author.textContent = `By ${item.author || 'Newton Hinga'}`;
  const excerpt = document.createElement('p');
  excerpt.textContent = item.excerpt;
  const footer = document.createElement('div');
  footer.className = 'card-footer';
  const duration = document.createElement('span');
  duration.textContent = item.read || '1 min read';
  const read = document.createElement('span');
  read.textContent = 'READ ↗';
  footer.append(duration, read);
  info.append(date, title, author, excerpt, footer);
  link.append(art, info);
  card.append(link);
  return card;
}

function renderDynamicArticle(posts, allSearchItems) {
  const target = document.querySelector('#dynamic-article');
  if (!target) return;
  const slug = new URL(location.href).searchParams.get('slug');
  const post = posts.find(item => item.slug === slug);
  target.replaceChildren();
  if (!post) {
    const missing = document.createElement('div');
    missing.className = 'section-wrap static-page';
    const title = document.createElement('h1');
    title.textContent = 'This piece is not available.';
    const back = document.createElement('a');
    back.className = 'text-link';
    back.href = new URL('./', document.baseURI).href;
    back.textContent = 'Back to Inkverelle ↗';
    missing.append(title, back);
    target.append(missing);
    return;
  }

  document.title = `${post.title} — Inkverelle`;
  const descriptionMeta = document.querySelector('meta[name="description"]');
  if (descriptionMeta) descriptionMeta.content = post.excerpt;
  const canonicalLink = document.querySelector('link[rel="canonical"]');
  if (canonicalLink) canonicalLink.href = location.href;
  const article = document.createElement('article');
  article.className = 'reading-column';
  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = new URL(`${post.category}/`, document.baseURI).href;
  back.textContent = `← Back to ${post.category}`;
  const label = document.createElement('p');
  label.className = 'eyebrow article-category';
  label.textContent = `${post.category} · ${readDate(post.date)}`;
  const title = document.createElement('h1');
  title.textContent = post.title;
  const excerpt = document.createElement('p');
  excerpt.className = 'article-subtitle';
  excerpt.textContent = post.excerpt;
  const byline = document.createElement('div');
  byline.className = 'article-byline';
  byline.textContent = `By ${post.author || 'Newton Hinga'} · ${post.read}`;
  const body = document.createElement('div');
  body.className = `article-body${post.poem ? ' poetry-body' : ''}`;
  for (const paragraph of String(post.body || '').trim().split(/\n\s*\n/).filter(Boolean)) {
    const block = document.createElement('p');
    if (post.poem) block.className = 'poem-stanza';
    paragraph.split('\n').forEach((line, index) => {
      if (index) block.append(document.createElement('br'));
      appendInlineWriting(block, line);
    });
    body.append(block);
  }
  const actions = document.createElement('div');
  actions.className = 'article-actions';
  const bookmark = document.createElement('button');
  bookmark.type = 'button';
  bookmark.className = 'bookmark-toggle';
  bookmark.dataset.bookmarkSlug = post.slug;
  bookmark.setAttribute('aria-pressed', 'false');
  bookmark.textContent = 'Save for later';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'copy-link';
  copy.dataset.copyUrl = location.href;
  copy.textContent = 'Copy link';
  const more = document.createElement('a');
  more.href = back.href;
  more.textContent = `More ${post.category} ↗`;
  actions.append(bookmark, copy, more);
  const taxonomy = document.createElement('nav');
  taxonomy.className = 'article-taxonomy';
  taxonomy.setAttribute('aria-label', 'Article categories and tags');
  for (const tag of [post.category, ...(post.tags || [])]) {
    const chip = document.createElement('a');
    chip.className = 'article-tag';
    chip.textContent = tag;
    chip.href = new URL(`${tag === post.category ? `${post.category}/` : `tag/${tagSlug(tag)}/`}`, document.baseURI).href;
    taxonomy.append(chip);
  }
  article.append(back, label, title, excerpt, byline, body, actions, taxonomy);
  target.append(article);

  const relatedSection = document.querySelector('#dynamic-related-section');
  const relatedGrid = document.querySelector('#dynamic-related');
  const related = allSearchItems.filter(item => item.slug !== post.slug && String(item.category).toLowerCase() === post.category).slice(0, 3);
  if (relatedSection && relatedGrid && related.length) {
    relatedGrid.replaceChildren(...related.map((item, index) => makeWritingCard(item, index)));
    relatedSection.hidden = false;
  }
}

function renderDynamicCards(posts, allSearchItems) {
  const homeTargets = { stories: '#stories-grid', poetry: '#poetry-grid', reflections: '#reflections-grid' };
  const path = decodeURIComponent(location.pathname).replace(/\/$/, '').split('/').filter(Boolean).pop() || '';
  const archiveCategory = ['stories', 'poetry', 'reflections'].includes(path) ? path : null;
  const categoryPage = location.pathname.includes('/category/') ? path.toLowerCase() : archiveCategory;
  const tagPage = location.pathname.includes('/tag/') ? path : null;

  for (const post of posts) {
    const homeGrid = document.querySelector(homeTargets[post.category]);
    if (homeGrid) homeGrid.append(makeWritingCard({ ...post, dynamic: true }, homeGrid.children.length));
  }

  if (categoryPage) {
    const grid = document.querySelector('.collection-page .writing-grid');
    const matching = posts.filter(post => post.category === categoryPage);
    if (grid && matching.length) {
      grid.querySelector('.archive-empty')?.remove();
      matching.forEach(post => grid.append(makeWritingCard({ ...post, dynamic: true }, grid.children.length)));
    }
  }

  if (tagPage) {
    const grid = document.querySelector('.collection-page .writing-grid');
    const matching = posts.filter(post => (post.tags || []).some(tag => tagSlug(tag) === tagPage));
    if (grid && matching.length) {
      grid.querySelector('.archive-empty')?.remove();
      matching.forEach(post => grid.append(makeWritingCard({ ...post, dynamic: true }, grid.children.length)));
    }
  }

  const latest = document.querySelector('.latest-list');
  if (latest) {
    const current = posts.slice(0, 5).map(post => {
      const link = document.createElement('a');
      link.className = 'latest-item';
      link.href = new URL(`read/?slug=${encodeURIComponent(post.slug)}`, document.baseURI).href;
      const category = document.createElement('span');
      category.className = 'latest-category';
      category.textContent = post.category;
      const title = document.createElement('strong');
      title.textContent = post.title;
      const date = document.createElement('time');
      date.dateTime = post.date;
      date.textContent = readDate(post.date);
      link.append(category, title, date);
      return link;
    });
    latest.prepend(...current);
    while (latest.children.length > 5) latest.lastElementChild.remove();
  }
}

fetch(new URL('search-index.json', document.baseURI))
  .then(response => {
    if (!response.ok) throw new Error('Search index unavailable');
    return response.json();
  })
  .then(async data => {
    const staticItems = Array.isArray(data) ? data : [];
    let dynamicPosts = [];
    try {
      const response = await fetch(new URL('api/posts', document.baseURI), { headers: { Accept: 'application/json' } });
      if (response.ok) {
        const payload = await response.json();
        dynamicPosts = Array.isArray(payload.posts)
          ? payload.posts.filter(post => ['approved', 'published'].includes(String(post.status).toLowerCase()))
          : [];
      }
    } catch { /* The static GitHub Pages version has no dynamic API. */ }
    const dynamicItems = dynamicPosts.map(post => ({ ...post, dynamic: true, category: post.category, url: `read/?slug=${encodeURIComponent(post.slug)}` }));
    searchIndex = [...staticItems, ...dynamicItems];
    renderDynamicCards(dynamicPosts, searchIndex);
    renderDynamicArticle(dynamicPosts, searchIndex);
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
