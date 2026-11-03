# Inkverelle

Inkverelle is a literary journal for poems, stories, and reflections. Anyone can read approved work without an account. Authors can request access, submit writing for editorial review, and see the status of their submissions. The editor can approve or reject account requests and writing.

## How publishing works

1. A prospective author requests an account at `/authors/` and accepts the contributor terms.
2. An administrator reviews the request. Approving it creates an inactive account and a one-time invitation link that expires after three days.
3. The administrator can send an invitation from the dashboard. If email is not configured or delivery fails, the dashboard provides a one-time link to send manually.
4. The author sets a password and signs in at `/authors/`.
5. New submissions are private drafts or wait for editorial review. Only writing an administrator approves is available publicly.

The original Markdown writing in `content/` remains public site content. Each current piece credits Newton Hinga. Add an `author` field to future Markdown front matter to credit another author.

## Vercel and PostgreSQL setup

Use a managed PostgreSQL database connected to the Vercel project, such as Prisma Postgres or Neon through the Vercel Marketplace.

Set the following environment variables in Vercel:

- `DATABASE_URL`: direct PostgreSQL connection string. Prisma CLI uses this for migrations.
- `DATABASE_URL_POOLED`: pooled connection string for Vercel Functions.
- `BOOTSTRAP_ADMIN_EMAIL`: email address for the first administrator.
- `BOOTSTRAP_ADMIN_NAME`: display name for the first administrator.
- `BOOTSTRAP_ADMIN_PASSWORD`: unique password for the first administrator. Use 12–128 characters with uppercase and lowercase letters, a number, and a symbol.
- `ADMIN_SESSION_SECRET`: at least 32 random bytes, encoded as text.
- `CRON_SECRET`: a unique secret used to authorize the daily retention job.
- `RESEND_API_KEY`: Resend sending-only API key, restricted to the verified sender domain.
- `EMAIL_FROM`: verified sender address, for example `Inkverelle <hello@your-domain.example>`.
- `ADMIN_NOTIFICATION_EMAIL`: email address for new account-request notices.
- `PUBLIC_SITE_URL`: canonical HTTPS origin used to build invitation links.

The first successful sign-in using the bootstrap email and password creates the administrator account. Keep these bootstrap credentials private. Once that account exists, change or remove the bootstrap password environment variable; do not use it as an ongoing shared login.

## Email delivery

Inkverelle sends account-request notices to `ADMIN_NOTIFICATION_EMAIL` (or the bootstrap admin address), and sends account invitations and password reset links to authors using Resend. Create a Resend sending-only API key restricted to your verified sender domain, then configure `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL`, and `PUBLIC_SITE_URL` in the production environment. Verify the sender domain's DNS records in Resend before testing delivery. If any setting is missing or Resend is unavailable, invitation and reset flows return a manual one-time link instead.

Resend receives recipient email addresses and the one-time invitation or reset URL for those messages. The privacy page describes this transfer; review Resend's current [privacy policy](https://resend.com/legal/privacy-policy), [data processing addendum](https://resend.com/legal/dpa), and subprocessors before launch.

The Vercel production build runs `npm run db:deploy` before generating the static pages, using the database connection configured for Production. Confirm that the connected database is scoped to Production before deploying.

```sh
npm install
npm run db:deploy
npm run build
```

For local manual migrations, use a direct connection. Neon’s Vercel integration provides `DATABASE_URL` for pooled connections and `DATABASE_URL_UNPOOLED` for direct migrations; Prisma’s config prefers the unpooled URL when it is available. The application uses `DATABASE_URL_POOLED` when set, otherwise it uses `DATABASE_URL`.

For local development, copy `.env.example` to `.env`, fill in development database credentials and unique local secrets, then run:

```sh
npm install
npm run db:migrate
npm run vercel:dev
```

`npm run vercel:dev` runs Vercel's local Functions server and requires the Vercel CLI login and a linked Vercel project. The Vercel Development Command is `npm run dev`, which builds the static pages and starts their local server; it does not launch Vercel again. For a static-only preview without API routes, run `npm run dev` directly. Do not use production credentials for local development. `npm run db:studio` opens Prisma Studio for inspecting the connected database; treat that access as privileged.

## Security and account operations

Passwords are hashed with scrypt and a per-password random salt. Sessions use random, database-backed tokens stored only as hashes, HttpOnly and SameSite cookies, CSRF checks, role-based authorization, and rate limits on sign-in, account requests, invitation activation, and administrator MFA setup. Sessions expire after 15 minutes without activity, enforced by the server and dashboard. Account invitations are stored as hashes, expire after three days, and can only be used once. The database migration is in `prisma/migrations/`.

Public reading pages suppress the browser context menu as a light copying deterrent. This cannot prevent screenshots, developer tools, or copying through other browser and operating-system features; web pages cannot reliably block those actions.

Administrators must enroll an authenticator app the first time they sign in. MFA uses time-based one-time passwords, encrypts the secret with a key derived from `ADMIN_SESSION_SECRET`, and generates single-use recovery codes. Store recovery codes securely. Keep `ADMIN_SESSION_SECRET` stable: changing it requires MFA to be set up again after a controlled database reset. Admin account and moderation endpoints require both a valid session and completed MFA.

Rejected account requests are automatically deleted after 12 months from their review date. A daily Vercel Cron invokes `/api/cron/retention`; set a unique `CRON_SECRET` in the Vercel project before deployment. The job leaves pending and approved requests untouched, and clears old rate-limit records and expired sessions. Vercel Cron jobs run only on production deployments.

Email delivery uses Resend when its environment variables are configured. Invitation and reset links remain available in the dashboard whenever delivery fails or is not configured.

Run the dependency-free security helper tests with `npm test`. These cover the TOTP algorithm and recovery-code utilities; they do not replace deployment testing against a configured PostgreSQL database.

Administrators sign in at `/admin/`. They can review account requests, create invitations, suspend authors, and approve or reject submissions. Authors sign in at `/authors/` and manage their own writing at `/author-dashboard/`.

The contributor terms record agreement to a free-to-read, non-exclusive publishing permission; contributors retain their copyright. No wording can guarantee protection from every lawsuit or override rights that cannot legally be waived. The terms and privacy notice are a starting point and should be reviewed by a Kenyan lawyer before relying on them. The privacy notice should also be checked against the actual database provider, data location, retention practices, and applicable registration obligations.

## GitHub Pages

GitHub Pages can publish the static site, but it cannot run the account, moderation, or database APIs. Use the Vercel deployment for author accounts and reviewed publishing. Source files and Markdown content in a public GitHub repository are public.

## Project layout

```text
content/                 Site settings and original Markdown writing
assets/css/              Site styles and responsive layouts
assets/js/               Public interactions and account dashboards
api/                     Vercel authentication, accounts, and writing APIs
lib/                     Prisma, password, session, and security helpers
prisma/schema.prisma     Relational data model
prisma/migrations/       PostgreSQL schema migration
scripts/build.mjs        Static page generator
admin/                   Administrator dashboard page
authors/                 Author sign-in and account request page
activation/              One-time invitation activation page
vercel.json              Vercel output and security headers
```
