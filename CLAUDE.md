# Likha: project guide

Likha (likha.in) is a kundli-first dating and matchmaking PWA for India. Tagline: "Jo likha hai, woh milega." Launch city: Jaipur.
Design source of truth: the "Likha App Screens" design canvas (screen ids like O4, D1, I24). Copy source of truth: `docs/likha-strings.en.json`.

## Repo layout
| Folder | What | Run / test |
|---|---|---|
| `app/` | Member PWA, Next.js 16 + React 19 + TypeScript. Onboarding O1–O15, tour T1–T3, and the bottom-nav app (H1, H2, D1–D6, M1–M5, C1–C5, Q1, E1–E14, K1–K2, A1, N1; public landings L1–L2 at /k and /g) in `src/app/(app)/`. | `npm run dev` · `npm run build` · `npm run test:e2e` · `npm run check:db` |
| `supabase/schema/` | Postgres schema in 12 parts, concatenated into `likha_schema.sql`. | `supabase/test/*.sql` (456 checks) |
| `admin/` | Team console, Next.js 16. Sign-in with email code + authenticator (MFA). Built so far: Dashboard, Users, Moderation, Selfie review, Support, Grievances, Data requests, Payments and refunds, Readings, AI spend, Cities, Be a Cupid, Rishta Maasi picks, Fraud, System health, Team and audit, Keys & live mode, AI models, AI CEO + rules, and the Settings pages (pricing, features, comms, onboarding, content, payments, general and legal, security). A setting nothing reads yet must be listed in `private.unused_settings()` (and `UNUSED` in `admin/src/lib/demo-settings.ts`) or marked `unused: true` on its field, so Admin says so. Settings change only through `admin_set_settings` (note required, versioned in `setting_versions`); the shared `SettingsForm` component does this. Every admin action is a `public.admin_*` function that checks a permission and writes the audit log. | `npm run dev` (port 3100) · `npm run build` · `npm run test:e2e` |
| `supabase/functions/` | Edge Functions: ai-gateway, kundli-worker, kick-batch, cupid-redirect, payout-worker, create-order, razorpay-webhook, safety-worker, reading-worker, admin-keys, admin-ops. | `deno test tests/` · `deno check` |
| `kundli/` | Python FastAPI kundli service (NASA JPL DE421 via Skyfield, Lahiri, Ashtakoota rules `ak-2.0`). | `pytest tests` |

## How the pieces talk
- App → Supabase directly (auth by phone OTP, RLS on every table). All app data calls live in `app/src/lib/api/supabase.ts`, behind the `Api` interface in `types.ts`.
- `NEXT_PUBLIC_DEMO=1` swaps in `demo.ts`: no backend, OTP 123456, selfie always passes. Use it for design review and e2e tests.
- Sensitive writes are SQL functions (`security definer`). Server-only functions are named `svc_*` and refuse anything but the service role.
- Birth details and full charts live in the `private` schema; the app only ever gets `kundli_summary` and the member's own chart via `my_chart()`.
- AI never computes astrology. The kundli service computes; the gateway explains, then number-checks every score and sign before anyone sees it.

## Rules (do not break)
1. No fake profiles, testimonials, popups or false claims. Demo accounts are flagged `is_demo` and never mix with real users.
2. Member-facing copy never says "AI". Saathi says "virtual companion, not a real person". Images say "imagined, not a real photo".
3. No guarantees ("100% accurate", "guaranteed match"), no predictions of death/illness/divorce, no paid remedies, no caste. Manglik is shown, never a filter.
4. Consent boxes start unticked (DPDP). Birth details lock once saved; corrections only through support.
5. Every credit change goes through `private.add_credits` / `consume_credits` with an idempotency key. Never update balances directly.
6. Be a Cupid is single-level only. Nobody earns from their referrals' referrals.
7. Provider keys live only in Supabase Vault, set through Admin > Keys (write-only, owner, audited). Never in code, ordinary tables, logs or the app bundle. Functions read them with `key()` / `mustKey()` from `_shared/keys.ts`. Only browser-safe keys (Maps browser key, Razorpay key id) reach the app, via `public_settings`.

## Conventions
- One screen = one route folder in `app/src/app/<route>/page.tsx`, with the design id in the first comment (`// O7 Photos`).
- Styles: design tokens and classes in `app/src/app/globals.css`; shared pieces in `app/src/components/ui.tsx`. Match the canvas; screenshot-compare before merging.
- Any new database call: add it to `supabase.ts` and `demo.ts`, then run `npm run check:db` and add a step to `supabase/test/40_app_onboarding.sql` / `50_app_screens.sql` (or a new file).
- App screens (bottom nav) live in `src/app/(app)/`; shared pieces in `src/components/app.tsx` (`useApp()` gives Home data, the member's prices and a toast). Never hard-code prices: use `price(prices, key, fallback)`.
- Demo mode uses `src/lib/api/samples.ts`: sample profiles, always shown with a SAMPLE PROFILE tag and a demo banner. Never ship samples to the real backend.
- Money: credits only move through `spend_on` / `add_credits`; real money only through `create-order` and `razorpay-webhook` (price always read from our tables, never from the app).
- Times of day (sunrise, Rahu Kaal, horas, Golden Hours) come from `src/lib/panchang.ts`; the same file is copied to `supabase/functions/_shared/panchang.ts`. Change both together.
- Schema changes: new numbered part file in `supabase/schema/parts/`, rebuild `likha_schema.sql`, run all four test files on a fresh database.
- Hinglish, playful copy; sentence case; short.

## Commands
```
# database tests (Postgres 16 locally)
cat supabase/schema/parts/*.sql > supabase/schema/likha_schema.sql
psql -f supabase/test/00_supabase_stub.sql -f supabase/schema/likha_schema.sql -f supabase/schema/guna_lookup.sql -f supabase/test/50_app_screens.sql
# app
cd app && cp .env.example .env.local && npm i && npm run dev
NEXT_PUBLIC_DEMO=1 npm run build && npm start & npm run test:e2e   # onboarding (23) + member app (36) + chat and companions (25) + wallet and store (33) + account and safety (37) + couples and growth (61)
node --experimental-strip-types --test tests/unit/*.test.ts         # panchang maths
```


## Security rules
- Every migration ends with `select private.lockdown();` (apply live with `deploy/1-database.sh --part FILE`) (closes new functions to visitors, server-only functions to members).
- The team changes data only through `admin_*` functions (permission + validation + audit). Never add direct-write RLS policies for the team.
- Member-writable tables need a guard trigger for any column a member must not set (see part 20).
- `supabase/test/B0_security.sql` must pass; it runs against a stub with Supabase's real default grants.
- Read SECURITY.md before changing auth, storage, payments or keys.
- Every new Edge Function needs an entry in `supabase/config.toml` (verify_jwt true for member/team calls, false for cron/webhooks that check a secret or signature); `deploy/2-functions.sh` refuses to deploy one that's missing.
