# SMLQUIZ Pro

Web app React + TypeScript + Vite, connected to the existing Supabase project.

## Start locally

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env.local`.
3. Set the public Supabase URL and publishable/anon key.
4. Run `npm install` and `npm run dev`.

Never put a Supabase service-role key, Stripe secret key, or webhook secret in browser variables or source files.

## Cloudflare Pages

- Build command: `npm run build`
- Output folder: `dist`
- Root directory: `/`
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build environment variables.
- Optional later: `VITE_TURNSTILE_SITE_KEY`, `VITE_ADSENSE_CLIENT`, `VITE_APP_URL`.

## Existing Supabase project

Project: `fgrwwauwnxvrcgqqpksp` (SML QUIZ, eu-west-2).

The frontend uses the existing tables `facolta`, `materie`, `domande`, and their existing relations. Auth is Supabase Auth. The existing `quiz-cache` Edge Function is intentionally left unchanged.

## Current implementation status

The first frontend foundation is committed:
- Responsive dark OLED/glass interface and navigation.
- Supabase Auth sign-in, sign-up, sign-out and password reset.
- Live faculty, subject and year filters from the existing database.
- Four-answer quiz flow, explanations, scoring (+1 / -0.25), timer, keyboard controls and audio feedback.
- Local autosave, local attempt history, TXT export, WhatsApp sharing.
- Weighted grade calculator, language selector foundation, font zoom, fullscreen, offline indicator and PWA shell.
- Basic settings and legal-information placeholders.
- Automatic GitHub Actions production build check.

## Not enabled yet

Do not treat the site as commercially ready. The following need additional backend work, configuration, real testing, or owner-provided legal/business information:
- Server-enforced daily free credits, paid-credit consumption, coupon redemption and anti-abuse rules.
- Secure Stripe Checkout and webhook credit fulfillment. Existing live prices are referenced in the UI, but checkout is deliberately disabled and no live payment is performed.
- Cloudflare Turnstile verification, AdSense approval/placement and cookie-consent integration.
- Persistent quiz history, streaks, badges, weak-topic analytics, leaderboard, transaction receipts and account deletion workflow.
- Full six-language translation of every screen.
- Complete legal texts, fiscal identity, PEC, support contact and reviewed refund/withdrawal terms.
- Automated security/performance testing and end-to-end testing.

A browser-only implementation must never be trusted to grant or consume credits. These checks belong on authenticated server-side endpoints and database transactions.
