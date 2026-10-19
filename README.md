# Inkverelle

Inkverelle is a responsive literary journal for poetry, stories, and reflections. Its content is stored as Markdown in this repository; a small Node build script generates a static site for GitHub Pages. No database, paid service, or build dependency is required.

## Publish with GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repository, open **Settings → Pages** and set the build and deployment source to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` builds `dist/` and deploys it after each push to `main`. You can also start it from **Actions → Build and deploy Inkverelle → Run workflow**.

For a public site, GitHub Pages is available on GitHub Free when the repository is public. A Pages site is publicly viewable even when its source repository is private. Check the current GitHub Pages plan details before choosing repository visibility.

## Add or edit writing

Create a `.md` file in `content/poetry/`, `content/stories/`, or `content/reflections/`. Copy this front matter, then write your article below the second `---` line:

```yaml
---
title: "A new poem"
slug: a-new-poem
category: poetry
date: 2026-10-19
excerpt: "A short introduction for the archive."
readingTime: "3 min read"
poem: true
tags: ["memory", "home"]
status: published
---

Write one line per verse.
Leave a blank line between stanzas.
```

Set `poem: true` for poems. For unpublished work, set `status: draft`; drafts are excluded from the generated site. On a public source repository, draft files are still visible in the repository, so do not put private writing there. Push or merge the file to `main` to publish it. GitHub keeps the revision history and lets you restore earlier edits.

Edit `content/site.json` to update the site name, tagline, about copy, contact email, social links, and featured article. The homepage search and RSS feed are generated from published writing. Search runs in each visitor's browser. Real newsletter subscriptions, private editor login, and form-delivered email need a separate service; this static site does not pretend to provide those.

## Preview locally

Install Node.js 20 or newer, then run:

```sh
npm run build
```

To preview the generated `dist/` folder, run a static server from that folder, for example:

```sh
cd dist
python -m http.server 8000
```

Then visit `http://localhost:8000`. The build also creates article pages, story/poetry/reflection archives, tag and category pages, About, Contact, search, a 404 page, `sitemap.xml`, `robots.txt`, and `feed.xml`.

## Project layout

```text
content/             Markdown articles and site settings
assets/css/          Site styles, layout, and motion
assets/js/           Search, mobile navigation, and small interactions
assets/images/       Inkverelle logo artwork
scripts/build.mjs    Static site generator
.github/workflows/   GitHub Pages deployment workflow
```
