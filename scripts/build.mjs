import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const basePath = normalizeBase(process.env.SITE_BASE_PATH || '/');
const siteUrl = (process.env.SITE_URL || 'http://localhost:8000').replace(/\/$/, '');
const repository = process.env.GITHUB_REPOSITORY || '';
const repositoryUrl = /^[-\w.]+\/[-\w.]+$/.test(repository) ? `https://github.com/${repository}` : '';
const site = JSON.parse(fs.readFileSync(path.join(root, 'content/site.json'), 'utf8'));
const facebookSearchUrl = site.facebookName
  ? `https://www.facebook.com/search/top/?q=${encodeURIComponent(site.facebookName)}`
  : 'https://www.facebook.com/';
const footerSocialLinks = `<div class="footer-social" aria-label="Contact and social links"><a href="mailto:${escapeAttribute(site.contactEmail || '')}">Email ↗</a><a href="${escapeAttribute(facebookSearchUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Search Facebook for ${escapeAttribute(site.facebookName || site.name)}">Facebook · ${escapeHTML(site.facebookName || site.name)} ↗</a></div>`;
const posts = loadPosts().filter(post => post.status === 'published' && post.date <= today());
if (!posts.length) throw new Error('No published writing found in content/');
const duplicateSlugs = duplicates(posts.map(post => post.slug));
if (duplicateSlugs.length) throw new Error(`Duplicate slugs: ${duplicateSlugs.join(', ')}`);
const allRoutes = new Set(['', 'stories/', 'poetry/', 'reflections/', 'about/', 'contact/', 'search/', 'reading-list/', 'admin/', 'privacy/']);
for (const post of posts) allRoutes.add(`${post.slug}/`);
for (const category of new Set(posts.map(post => post.category))) allRoutes.add(`category/${slugify(category)}/`);
for (const tag of new Set(posts.flatMap(post => post.tags))) allRoutes.add(`tag/${slugify(tag)}/`);

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
fs.writeFileSync(path.join(output, '.nojekyll'), '');

const cardsByCategory = Object.fromEntries(['stories', 'poetry', 'reflections'].map(category => [category,
  posts.filter(post => post.category === category).map((post, index) => card(post, index)).join('') || `<p class="archive-empty">No ${category} here yet. Check back soon.</p>`
]));
const countsByCategory = Object.fromEntries(['stories', 'poetry', 'reflections'].map(category => [category, posts.filter(post => post.category === category).length]));
const latestList = [...posts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(post =>
  `<a class="latest-item" href="${url(`${post.slug}/`)}"><span class="latest-category">${escapeHTML(capitalize(post.category))}</span><strong>${escapeHTML(post.title)}</strong><time datetime="${escapeAttribute(post.date)}">${formatDate(post.date)}</time></a>`
).join('');
const homePath = path.join(root, 'index.html');
let home = fs.readFileSync(homePath, 'utf8');
const featured = posts.find(post => post.slug === site.featuredSlug) || posts[0];
home = home
  .replace('<base href="{{BASE_PATH}}">', `<base href="${escapeAttribute(basePath)}">`)
  .replace('content="Inkverelle is a quiet home for stories, poems, and notes on being human."', `content="${escapeAttribute(site.description)}"`)
  .replace('<title>Inkverelle — A quiet home for words</title>', `<title>${escapeHTML(site.name)} — ${escapeHTML(site.tagline)}</title>`)
  .replace('id="stories-grid">{{STORIES}}', `id="stories-grid">${cardsByCategory.stories}`)
  .replace('id="poetry-grid">{{POETRY}}', `id="poetry-grid">${cardsByCategory.poetry}`)
  .replace('id="reflections-grid">{{REFLECTIONS}}', `id="reflections-grid">${cardsByCategory.reflections}`)
  .replace('{{STORY_COUNT}}', String(countsByCategory.stories))
  .replace('{{POETRY_COUNT}}', String(countsByCategory.poetry))
  .replace('{{REFLECTION_COUNT}}', String(countsByCategory.reflections))
  .replace('{{LATEST_LIST}}', latestList)
  .replace('{{ABOUT_SHORT}}', escapeHTML((site.aboutParagraphs?.[0] || 'A place for poems, stories, and reflections.').slice(0, 220)))
  .replaceAll('{{CONTACT_EMAIL}}', escapeAttribute(site.contactEmail || ''))
  .replaceAll('{{FACEBOOK_NAME}}', escapeHTML(site.facebookName || ''))
  .replaceAll('{{FACEBOOK_URL}}', escapeAttribute(facebookSearchUrl))
  .replace('{{ABOUT_HEADING}}', escapeHTML(site.aboutHeading || 'About Inkverelle'))
  .replace('{{ABOUT_PARAGRAPHS}}', (site.aboutParagraphs || []).map(text => `<p>${escapeHTML(text)}</p>`).join(''))
  .replace('href="admin/"', `href="${url('admin/')}"`)
  .replace('href="contact/"', `href="${url('contact/')}"`)
  .replace('href="reading-list/"', `href="${url('reading-list/')}"`)
  .replace('href="the-knight-who-chose-peace/"', `href="${url(featured.slug + '/')}"`)
  .replace('href="#article/the-art-of-paying-attention"', `href="${url(featured.slug + '/')}"`)
  .replace('<h2 id="featured-title">The art of<br>paying attention</h2>', `<h2 id="featured-title">${escapeHTML(featured.title)}</h2>`)
  .replace('aria-label="Read The art of paying attention"', `aria-label="Read ${escapeAttribute(featured.title)}"`)
  .replace('<span>6 min read</span>', `<span>${escapeHTML(featured.read)}</span>`)
  .replace('class="eyebrow">Featured <span>·</span> Reflection</p>', `class="eyebrow">Featured <span>·</span> ${escapeHTML(capitalize(featured.category))}</p>`)
  .replace('An original poem · 14 min read', `${escapeHTML(capitalize(featured.category))} · ${escapeHTML(featured.read)}`)
  .replace('On noticing what the day leaves at your doorstep: light on the kitchen floor, the neighbor\'s lavender, a thought that finally found its way home.', escapeHTML(featured.excerpt))
  .replace('He was born beneath a blood-red sky,<br>Where mothers learned too young to cry,<br>Where fathers left with swords held high,<br>And children watched them disappear into the night.', escapeHTML(featured.poem ? featured.body[0] : featured.excerpt).replace(/\r?\n/g, '<br>'))
  .replace('href="#stories">Stories</a><a href="#poetry">Poetry', `href="${url('stories/')}">Stories</a><a href="${url('poetry/')}">Poetry`)
  .replace('href="#reflections">Reflections', `href="${url('reflections/')}">Reflections`)
  .replace('href="#about">About', `href="${url('about/')}">About`)
  .replace('</div><span>An independent journal from Nairobi.</span></div></footer>', `</div><a href="${url('contact/')}">Contact</a><a href="${url('feed.xml')}">RSS</a>${footerSocialLinks}<span>Based in ${escapeHTML(site.authorLocation || 'Nairobi')}.</span></div></footer>`)
  .replace('</head>', `${headMetadata('', site.name, site.description)}</head>`);
fs.writeFileSync(path.join(output, 'index.html'), home);

const archiveDescriptions = {
  stories: 'Short stories from Inkverelle.',
  poetry: 'Poems from Inkverelle.',
  reflections: 'Reflections and essays from Inkverelle.'
};
for (const category of ['stories', 'poetry', 'reflections']) {
  const route = `${category}/`;
  writePage(route, `${capitalize(category)} — ${site.name}`, archiveDescriptions[category], `<main class="section-wrap collection-page"><p class="eyebrow">FROM INKVERELLE</p><h1>${capitalize(category)}</h1><p class="collection-intro">${escapeHTML(archiveDescriptions[category])}</p><div class="writing-grid">${cardsByCategory[category]}</div></main>`);
}
for (const category of new Set(posts.map(post => post.category))) {
  const route = `category/${slugify(category)}/`;
  const matching = posts.filter(post => post.category === category);
  writePage(route, `${capitalize(category)} — ${site.name}`, `Read ${capitalize(category).toLowerCase()} from Inkverelle.`, `<main class="section-wrap collection-page"><p class="eyebrow">BROWSE BY CATEGORY</p><h1>${capitalize(category)}</h1><div class="writing-grid">${matching.map(card).join('')}</div></main>`);
}
const tagSet = new Set(posts.flatMap(post => post.tags));
for (const tag of tagSet) {
  const route = `tag/${slugify(tag)}/`;
  const matching = posts.filter(post => post.tags.some(item => slugify(item) === slugify(tag)));
  writePage(route, `“${tag}” — ${site.name}`, `Writing tagged ${tag}.`, `<main class="section-wrap collection-page"><p class="eyebrow">BROWSE BY TAG</p><h1>${escapeHTML(tag)}</h1><div class="writing-grid">${matching.map(card).join('')}</div></main>`);
}
for (const [index, post] of posts.entries()) {
  const categoryUrl = url(`category/${slugify(post.category)}/`);
  const tags = post.tags.map(tag => `<a class="article-tag" href="${url(`tag/${slugify(tag)}/`)}">${escapeHTML(tag)}</a>`).join('');
  const related = posts.filter(other => other.category === post.category && other.slug !== post.slug).slice(0, 3);
  const body = post.poem
    ? `<div class="article-body poetry-body">${post.body.map(stanza => `<p class="poem-stanza">${escapeHTML(stanza)}</p>`).join('')}</div>`
    : `<div class="article-body">${post.body.map(paragraph => renderParagraph(paragraph)).join('')}</div>`;
  const articleData = {
    '@context': 'https://schema.org', '@type': post.poem ? 'Poem' : 'Article', headline: post.title,
    description: post.excerpt, datePublished: post.date, author: { '@type': 'Organization', name: site.authorName },
    publisher: { '@type': 'Organization', name: site.name }, mainEntityOfPage: canonical(`${post.slug}/`)
  };
  const article = `<main class="article-page"><article class="reading-column"><a class="back-link" href="${url(post.category + '/')}">← Back to ${escapeHTML(post.category)}</a><p class="eyebrow article-category"><a href="${categoryUrl}">${escapeHTML(post.category)}</a> · ${formatDate(post.date)}</p><h1>${escapeHTML(post.title)}</h1><p class="article-subtitle">${escapeHTML(post.excerpt)}</p><div class="article-byline">${escapeHTML(site.authorName)} <span>·</span> ${escapeHTML(post.read)}</div>${body}<div class="article-actions"><button type="button" class="bookmark-toggle" data-bookmark-slug="${escapeAttribute(post.slug)}" aria-pressed="false">Save for later</button><button type="button" class="copy-link" data-copy-url="${escapeAttribute(canonical(`${post.slug}/`))}">Copy link</button><a href="${url(post.category + '/')}">More ${escapeHTML(post.category)} ↗</a></div><nav class="article-taxonomy" aria-label="Article categories and tags"><a href="${categoryUrl}">${escapeHTML(post.category)}</a>${tags}</nav></article></main><section class="related-section section-wrap"><p class="eyebrow">MORE TO READ</p><h2>More from Inkverelle</h2><div class="writing-grid">${related.map(card).join('') || `<a class="text-link" href="${url(post.category + '/')}">See all ${escapeHTML(post.category)} <span>↗</span></a>`}</div></section><script type="application/ld+json">${safeJson(articleData)}</script>`;
  writePage(`${post.slug}/`, `${post.title} — ${site.name}`, post.excerpt, article, { type: 'article', image: post.coverImage || '' });
}

const aboutContent = `<main class="section-wrap static-page"><p class="eyebrow">ABOUT INKVERELLE</p><h1>${escapeHTML(site.aboutHeading || 'About Inkverelle')}</h1>${(site.aboutParagraphs || []).map(text => `<p>${escapeHTML(text)}</p>`).join('')}<h2>What you’ll find here</h2><p>Poems, stories, and reflections by Inkverelle and its contributors.</p>${(site.socialLinks || []).map(link => `<p><a href="${escapeAttribute(link.url)}" rel="me noopener">${escapeHTML(link.label)}</a></p>`).join('')}</main>`;
writePage('about/', `About — ${site.name}`, `About ${site.name} and its writing.`, aboutContent);
const contactContent = site.contactEmail
  ? `<main class="section-wrap static-page contact-page"><p class="eyebrow">GET IN TOUCH</p><h1>Get in touch.</h1><p class="contact-intro">Have a question or something you’d like to share? Send me a note.</p><section class="contact-box" aria-label="Contact Inkverelle"><div class="contact-box-details"><p class="contact-box-label">EMAIL</p><a class="contact-email" href="mailto:${escapeAttribute(site.contactEmail)}">${escapeHTML(site.contactEmail)} <span>↗</span></a><a class="contact-social-link" href="${escapeAttribute(facebookSearchUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Search Facebook for ${escapeAttribute(site.facebookName || site.name)}"><span>FACEBOOK</span><strong>${escapeHTML(site.facebookName || 'Inkverelle')} ↗</strong></a><p class="contact-response-note">Your email app will open with your message ready. You can review it before sending.</p></div><form class="contact-form" id="contact-form" data-contact-email="${escapeAttribute(site.contactEmail)}"><label for="contact-name">Your name<input id="contact-name" name="name" autocomplete="name" required></label><label for="contact-reply">Your email<input id="contact-reply" name="reply" type="email" autocomplete="email" required></label><label for="contact-message">Your message<textarea id="contact-message" name="message" rows="5" required></textarea></label><button class="contact-submit" type="submit">Open email <span>↗</span></button><p class="contact-form-status" id="contact-form-status" role="status" aria-live="polite">Your email app will open with this message ready to send.</p></form></section></main>`
  : `<main class="section-wrap static-page"><p class="eyebrow">GET IN TOUCH</p><h1>Contact</h1><p>Contact details will appear here when an email address is added to <code>content/site.json</code>.</p></main>`;
writePage('contact/', `Contact — ${site.name}`, `Get in touch with ${site.name}.`, contactContent);
writePage('search/', `Search — ${site.name}`, `Search stories, poems, and reflections from ${site.name}.`, `<main class="section-wrap static-page search-page"><p class="eyebrow">SEARCH</p><h1>Find something to read</h1><label for="search-input">Search by title, poem, story, or phrase</label><input id="search-input" type="search" placeholder="Start typing…"><div id="search-results" class="search-results" role="status" aria-live="polite"></div></main>`);
writePage('reading-list/', `Reading list — ${site.name}`, `Writing you have saved to read later.`, `<main class="section-wrap static-page reading-list-page"><p class="eyebrow">SAVED FOR LATER</p><h1>Reading list</h1><p>Anything you save will be kept in this browser.</p><p id="reading-list-status" class="reading-list-status" role="status" aria-live="polite">Loading your reading list…</p><div id="reading-list-items" class="reading-list-items"></div></main>`);
writePage('admin/', `Publishing guide — ${site.name}`, `How to add writing to ${site.name}.`, publishingGuide(repositoryUrl));
writePage('privacy/', `Privacy — ${site.name}`, `Privacy information for ${site.name}.`, `<main class="section-wrap static-page"><p class="eyebrow">YOUR PRIVACY</p><h1>Privacy</h1><p>You can read and search the writing without signing in. If you save something to your reading list, that list stays in this browser on this device and isn’t sent to Inkverelle.</p><p>The site uses Google Fonts to display its type. The contact form opens your email app; it doesn’t collect or send messages itself.</p></main>`);
writePage('404.html', `Page not found — ${site.name}`, `The requested page could not be found.`, `<main class="section-wrap static-page"><p class="eyebrow">404</p><h1>We couldn’t find that page.</h1><p>Check the address or head back to the journal.</p><a class="text-link" href="${url('')}">Back to Inkverelle <span>↗</span></a></main>`);

const searchIndex = posts.map(post => ({ title: post.title, slug: post.slug, category: capitalize(post.category), excerpt: post.excerpt, read: post.read, date: post.date, tags: post.tags, url: url(`${post.slug}/`) }));
fs.writeFileSync(path.join(output, 'search-index.json'), JSON.stringify(searchIndex));
fs.writeFileSync(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${canonical('sitemap.xml')}\n`);
fs.writeFileSync(path.join(output, 'sitemap.xml'), sitemap([...allRoutes, 'feed.xml', 'search-index.json']));
fs.writeFileSync(path.join(output, 'feed.xml'), rss(posts.slice(0, 30)));
console.log(`Built ${posts.length} published articles and ${allRoutes.size} routes into dist/`);

function loadPosts() {
  const dir = path.join(root, 'content');
  const files = walk(dir).filter(file => file.endsWith('.md'));
  return files.map(file => {
    const relative = path.relative(dir, file).split(path.sep);
    const { meta, body } = parseMarkdown(fs.readFileSync(file, 'utf8'));
    const post = {
      title: String(meta.title || ''), slug: String(meta.slug || path.basename(file, '.md')),
      category: String(meta.category || relative[0] || '').toLowerCase(), date: String(meta.date || ''),
      excerpt: String(meta.excerpt || ''), read: String(meta.readingTime || readingTime(body)),
      poem: meta.poem === true, tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
      status: String(meta.status || 'published').toLowerCase(), coverImage: String(meta.coverImage || ''),
      body: splitParagraphs(body)
    };
    if (!post.title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)) throw new Error(`Invalid title or slug in ${file}`);
    if (!['stories', 'poetry', 'reflections'].includes(post.category)) throw new Error(`Unsupported category in ${file}: ${post.category}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date)) throw new Error(`Use YYYY-MM-DD for date in ${file}`);
    if (!post.excerpt || !post.body.length) throw new Error(`Add an excerpt and body to ${file}`);
    for (const tag of post.tags) if (!tag.trim()) throw new Error(`Empty tag in ${file}`);
    return post;
  });
}
function parseMarkdown(source) {
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('Each Markdown article needs YAML front matter.');
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':'); if (colon < 1) continue;
    const key = line.slice(0, colon).trim(); const value = line.slice(colon + 1).trim();
    if (value === 'true') meta[key] = true;
    else if (value === 'false') meta[key] = false;
    else if (value.startsWith('[') || value.startsWith('"')) meta[key] = JSON.parse(value);
    else meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}
function splitParagraphs(body) { return body.split(/\r?\n\s*\r?\n/).map(value => value.trim()).filter(Boolean); }
function renderParagraph(text) {
  if (text.startsWith('## ')) return `<h2>${escapeHTML(text.slice(3))}</h2>`;
  if (text.startsWith('### ')) return `<h3>${escapeHTML(text.slice(4))}</h3>`;
  if (text.startsWith('> ')) return `<blockquote>${escapeHTML(text.slice(2))}</blockquote>`;
  return `<p>${escapeHTML(text).replace(/\r?\n/g, '<br>')}</p>`;
}
function card(post, index = 0) {
  const art = `art-${index % 6 + 1}`;
  return `<article class="writing-card"><a class="writing-card-link" href="${url(`${post.slug}/`)}" aria-label="Read ${escapeAttribute(post.title)}"><div class="card-art ${art}"><span class="art-tag">${escapeHTML(capitalize(post.category))}</span></div><div class="card-info"><span class="card-date">${formatDate(post.date)}</span><h3>${escapeHTML(post.title)}</h3><p>${escapeHTML(post.excerpt)}</p><div class="card-footer"><span>${escapeHTML(post.read)}</span><span>READ ↗</span></div></div></a></article>`;
}
function renderLayout(route, title, description, content, options = {}) {
  const searchDialog = route === 'search/' ? '' : `<dialog class="search-dialog" id="search-dialog"><form method="dialog"><button class="dialog-close" aria-label="Close search">×</button></form><p class="eyebrow">WHAT WOULD YOU LIKE TO READ?</p><label class="search-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"></circle><path d="m16 16 4.2 4.2"></path></svg><input id="search-input" type="search" placeholder="Search poems, stories, and reflections…"></label><div id="search-results" class="search-results" role="status" aria-live="polite"></div><span class="search-hint">Press / or Ctrl/⌘ K to search · Esc to close</span></dialog>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="${escapeAttribute(basePath)}"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#1e302b"><meta name="description" content="${escapeAttribute(description)}"><title>${escapeHTML(title)}</title>${headMetadata(route, title, description, options)}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="assets/css/styles.css"><link rel="stylesheet" href="assets/css/brand.css"><link rel="stylesheet" href="assets/css/archive.css"><link rel="stylesheet" href="assets/css/professional.css"><link rel="stylesheet" href="assets/css/motion-responsive.css"><link rel="stylesheet" href="assets/css/publishing.css"><link rel="stylesheet" href="assets/css/editorial.css"><link rel="stylesheet" href="assets/css/wireframe.css"></head><body><a class="skip-link" href="#main">Skip to content</a><header id="top" class="site-header"><a class="wordmark" href="${url('')}" aria-label="Inkverelle home"><img src="assets/images/inkverelle-wordmark.png" alt="Inkverelle — Where words become worlds"></a><button class="menu-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="Open navigation"><span></span><span></span></button><nav id="site-nav" class="site-nav" aria-label="Main navigation"><a class="nav-link" href="${url('')}">Home</a><a class="nav-link" href="${url('stories/')}">Stories</a><a class="nav-link" href="${url('poetry/')}">Poetry</a><a class="nav-link" href="${url('reflections/')}">Reflections</a><a class="nav-link" href="${url('about/')}">About</a><a class="nav-link" href="${url('contact/')}">Contact</a><button class="search-open" aria-label="Search Inkverelle"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"></circle><path d="m16 16 4.2 4.2"></path></svg></button></nav></header><div id="main" tabindex="-1">${content}</div><footer class="site-footer"><div class="footer-top"><a class="wordmark" href="${url('')}" aria-label="Inkverelle home"><img src="assets/images/inkverelle-wordmark.png" alt="Inkverelle — Where words become worlds"></a><p>Poems, stories, and reflections from Nairobi.</p><a href="#top" class="back-top">Back to top ↑</a></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} ${escapeHTML(site.name)}</span><div><a href="${url('stories/')}">Stories</a><a href="${url('poetry/')}">Poetry</a><a href="${url('reflections/')}">Reflections</a><a href="${url('about/')}">About</a><a href="${url('reading-list/')}">Reading list</a><a href="${url('contact/')}">Contact</a><a href="${url('feed.xml')}">RSS</a></div><span>Based in ${escapeHTML(site.authorLocation || 'Nairobi')}.</span></div></footer>${searchDialog}<script src="assets/js/app.js" defer></script></body></html>`;
}
function writePage(route, title, description, content, options = {}) {
  const dest = path.join(output, route);
  const file = route.endsWith('.html') ? dest : path.join(dest, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const footerMarker = `</div><span>Based in ${escapeHTML(site.authorLocation || 'Nairobi')}.</span></div></footer>`;
  const footerWithSocials = `</div>${footerSocialLinks}<span>Based in ${escapeHTML(site.authorLocation || 'Nairobi')}.</span></div></footer>`;
  const html = renderLayout(route, title, description, content, options)
    .replace(footerMarker, footerWithSocials)
    .replaceAll('inkverelle-wordmark.png', 'inkverelle-wordmark.png')
    .replaceAll('assets/css/wireframe.css', 'assets/css/wireframe.css?v=20261020-footer-green');
  fs.writeFileSync(file, html);
}
function publishingGuide(repoUrl) {
  const editLink = repoUrl ? `${repoUrl}/tree/main/content` : 'https://github.com/';
  const example = `---\ntitle: "A new poem"\nslug: a-new-poem\ncategory: poetry\ndate: ${today()}\nexcerpt: "A few words about this poem."\nreadingTime: "3 min read"\npoem: true\ntags: ["memory", "home"]\nstatus: published\n---\n\nWrite one line per verse.\nLeave a blank line between stanzas.`;
  return `<main class="section-wrap static-page publishing-guide"><p class="eyebrow">ADD YOUR WRITING</p><h1>Share a poem, story, or reflection.</h1><p>Adding something to Inkverelle only takes a few minutes. Open the writing folder, add a Markdown file, and the site will update after your change is merged.</p><p><a class="contact-email" href="${escapeAttribute(editLink)}">Open the writing folder ↗</a></p><ol><li>Open <code>content/poetry/</code>, <code>content/stories/</code>, or <code>content/reflections/</code>, depending on what you’re adding.</li><li>Create a file with a short, lowercase name and hyphens between words, such as <code>a-new-poem.md</code>.</li><li>Copy the example below. Replace the title, date, introduction, tags, and writing with your own. For a poem, keep <code>poem: true</code> so its lines and stanzas appear as you wrote them.</li><li>Save your change to the main branch, or open a pull request. Once it’s merged, the new writing will appear on the site.</li></ol><pre><code>${escapeHTML(example)}</code></pre><h2>About drafts</h2><p>Set <code>status: draft</code> to keep a piece off the website. If this repository is public, the Markdown file can still be seen on GitHub, so don’t store private writing here.</p><h2>Change site details</h2><p>Edit <code>content/site.json</code> to update the site description, About text, contact email, social links, or featured piece.</p></main>`;
}
function headMetadata(route, title, description, options = {}) {
  const url = canonical(route);
  const type = options.type === 'article' ? 'article' : 'website';
  const image = options.image ? `\n<meta property="og:image" content="${escapeAttribute(new URL(options.image, siteUrl).href)}">` : '';
  return `\n<link rel="canonical" href="${escapeAttribute(url)}"><meta property="og:type" content="${type}"><meta property="og:title" content="${escapeAttribute(title)}"><meta property="og:description" content="${escapeAttribute(description)}"><meta property="og:url" content="${escapeAttribute(url)}">${image}`;
}
function sitemap(routes) {
  const unique = [...new Set(routes)].filter(route => route !== 'search-index.json');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${unique.map(route => `<url><loc>${xmlEscape(canonical(route))}</loc></url>`).join('')}</urlset>`;
}
function rss(items) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xmlEscape(site.name)}</title><link>${xmlEscape(canonical(''))}</link><description>${xmlEscape(site.description)}</description>${items.map(post => `<item><title>${xmlEscape(post.title)}</title><link>${xmlEscape(canonical(`${post.slug}/`))}</link><guid>${xmlEscape(canonical(`${post.slug}/`))}</guid><pubDate>${new Date(`${post.date}T12:00:00Z`).toUTCString()}</pubDate><description>${xmlEscape(post.excerpt)}</description><category>${xmlEscape(post.category)}</category></item>`).join('')}</channel></rss>`;
}
function normalizeBase(value) { const clean = value.startsWith('/') ? value : `/${value}`; return clean.endsWith('/') ? clean : `${clean}/`; }
function url(route) { return `${basePath}${route.replace(/^\//, '')}`; }
function canonical(route) { return new URL(url(route), `${siteUrl}/`).href; }
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
function slugify(value) { return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function capitalize(value) { return String(value).charAt(0).toUpperCase() + String(value).slice(1); }
function readingTime(body) { return `${Math.max(1, Math.ceil(body.split(/\s+/).length / 200))} min read`; }
function formatDate(value) { return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
function duplicates(values) { return values.filter((value, index) => values.indexOf(value) !== index); }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function escapeAttribute(value) { return escapeHTML(value); }
function xmlEscape(value) { return escapeHTML(value); }
function safeJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
