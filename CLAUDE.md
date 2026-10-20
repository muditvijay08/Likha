# Likha: project guide

Likha (likha.in) is a kundli-first dating and matchmaking PWA for India. Tagline: "Jo likha hai, woh milega." Launch city: Jaipur.
Design source of truth: the "Likha App Screens" design canvas (screen ids like O4, D1, I24). Copy source of truth: `docs/likha-strings.en.json`.

## Repo layout
| Folder | What | Run / test |
|---|---|---|
| `app/` | Member PWA, Next.js 16 + React 19 + TypeScript. Onboarding O1–O15 + tour T1–T3 done. | `npm run dev` · `npm run build` · `npm run test:e2e` · `npm run check:db` |
| `supabase/schema/` | Postgres schema in 8 parts, concatenated into `likha_schema.sql`. | `supabase/test/*.sql` (274 checks) |
| `supabase/functions/` | Edge Functions: ai-gateway, kundli-worker, kick-batch, cupid-redirect, payout-worker. | `deno test tests/` · `deno check` |
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
7. API keys never go in the database or the app bundle. Only `NEXT_PUBLIC_*` values reach the browser.

## Conventions
- One screen = one route folder in `app/src/app/<route>/page.tsx`, with the design id in the first comment (`// O7 Photos`).
- Styles: design tokens and classes in `app/src/app/globals.css`; shared pieces in `app/src/components/ui.tsx`. Match the canvas; screenshot-compare before merging.
- Any new database call: add it to `supabase.ts` and `demo.ts`, then run `npm run check:db` and add a step to `supabase/test/40_app_onboarding.sql` (or a new file).
- Schema changes: new numbered part file in `supabase/schema/parts/`, rebuild `likha_schema.sql`, run all four test files on a fresh database.
- Hinglish, playful copy; sentence case; short.

## Commands
```
# database tests (Postgres 16 locally)
cat supabase/schema/parts/0*.sql > supabase/schema/likha_schema.sql
psql -f supabase/test/00_supabase_stub.sql -f supabase/schema/likha_schema.sql -f supabase/schema/guna_lookup.sql -f supabase/test/40_app_onboarding.sql
# app
cd app && cp .env.example .env.local && npm i && npm run dev
NEXT_PUBLIC_DEMO=1 npm run build && npm start & npm run test:e2e
```
