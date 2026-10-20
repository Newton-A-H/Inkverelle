# Inkverelle

Inkverelle is a responsive journal for poems, stories, and reflections. The writing lives in this repository as Markdown files. A small Node script turns them into the site. There’s no database or paid service to set up.

## Publish with GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repository, open **Settings → Pages** and set the build and deployment source to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` builds `dist/` and deploys it after each push to `main`. You can also start it from **Actions → Build and deploy Inkverelle → Run workflow**.

For a public site, GitHub Pages is available on GitHub Free when the repository is public. A Pages site is publicly viewable even when its source repository is private. Check the current GitHub Pages plan details before choosing repository visibility.

## Add or edit writing

Add a `.md` file to `content/poetry/`, `content/stories/`, or `content/reflections/`. Copy this example, fill in your details, and put the writing below the second `---` line:

```yaml
---
title: "A new poem"
slug: a-new-poem
category: poetry
date: 2026-10-19
excerpt: "A few words about this poem."
readingTime: "3 min read"
poem: true
tags: ["memory", "home"]
status: published
---

Write one line per verse.
Leave a blank line between stanzas.
```

For a poem, set `poem: true` so its lines and stanzas stay in place. To keep a piece off the site, set `status: draft`. If this repository is public, the draft file can still be seen on GitHub, so don’t put private writing here. Merge the file into `main` to publish it. GitHub keeps earlier versions if you ever need to restore an edit.

Edit `content/site.json` to change the site name, tagline, About text, contact email, social links, or featured piece. Search includes published writing. A reader’s saved list stays in their browser and doesn’t sync to other devices. The site doesn’t include a newsletter signup, private editor login, or inbox for contact messages; those need an additional service.

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

Then visit `http://localhost:8000`. The build also creates article pages, story/poetry/reflection archives, tag and category pages, About, Contact, search, a local reading list, a 404 page, `sitemap.xml`, and `robots.txt`.

## Project layout

```text
content/             Markdown articles and site settings
assets/css/          Site styles, layout, and motion
assets/js/           Search, mobile navigation, and small interactions
assets/images/       Inkverelle logo artwork
scripts/build.mjs    Static site generator
.github/workflows/   GitHub Pages deployment workflow
```
