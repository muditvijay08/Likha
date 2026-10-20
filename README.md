# Likha: build and launch plan

## Status (20 Oct 2026)
| Area | Status |
|---|---|
| Design canvas (105 app + 25 admin screens) | Done |
| Database (9 parts, 320 checks passing) | Done |
| Kundli engine (NASA JPL, final rules ak-2.0) | Done |
| AI gateway, spend caps, Claude/Gemini/GPT switch | Done |
| Be a Cupid (referrals, payouts, TDS) | Done |
| **Member app: onboarding O1–O15 + tour** | **Done, tested end to end in demo mode (23 checks)** |
| **Member app batch 1: Home, Daily Kick, Discover, Profile, Filters, Compatibility report, Likes, Match + Golden Hours, Menu, Chats list** | **Done, 34 end-to-end checks in demo mode** |
| Member app batch 2: chat (realtime), Guru Ji, Saathi | Next |
| Admin web app | Not started |
| Selfie liveness (AWS), Razorpay payments, OneSignal | Not started |

## First-time setup (half a day)
1. Create a Supabase project in **Mumbai (ap-south-1)**. Enable phone auth, using MSG91 or Twilio for SMS and WhatsApp OTP.
2. Run `supabase/schema/likha_schema.sql`, then `supabase/schema/guna_lookup.sql`. Enable `pg_cron` and `pg_net`.
3. Make yourself Owner. The command is at the bottom of `parts/04_seed.sql`.
4. Deploy the kundli service from `kundli/Dockerfile` to a Mumbai host. Set `LIKHA_KUNDLI_KEY`.
5. Deploy the Edge Functions and set their secrets. The full list is in `supabase/README.md`.
6. Set up the app: copy `app/.env.example` to `.env.local`, fill in the Supabase URL, anon key and Google Maps key. Then run `npm run dev`.

## Week-by-week plan (2 developers)
| Week | Build | Done when |
|---|---|---|
| 1 | Real Supabase + kundli service + onboarding against them; `selfie-check` Edge Function with AWS Face Liveness (Amplify `FaceLivenessDetector`) | A real phone signs up in Jaipur, sees their real kundli, gets the 150/70 bonus |
| 2 | Home (H1), Daily Kick (H2), Discover (D1–D6), full profile and compatibility report | Two test members see each other with the correct Jodi Score |
| 3 | Likes (free), match, chat with realtime, Golden Hours, Saathi and Guru Ji through the gateway | Two members match and chat; Saathi replies; caps stop free overuse |
| 4 | Wallet, Razorpay checkout and webhook (`record_payment`), Store, readings, Check With Anyone, gifts | ₹1 test payment credits the wallet; a paid reading arrives or refunds |
| 5 | Menu, profile, settings, privacy, safety (report, block, SOS, share date), Be a Cupid screens | All Menu links work; a report reaches the admin queue |
| 6 | Admin web app (I1–I25) on the same database with aal2 login | Team can moderate, refund, approve payouts, change settings |
| 7 | Hindi strings, push notifications, performance, security review, 50-couple astrology spot-check | Lighthouse PWA pass; review sign-off |
| 8 | Closed beta in Jaipur (Founding Members), fix list, launch | 200 real members, no P1 bugs |

## Before launch (people, not code)
- **CA:** confirm TDS on Cupid payouts, GST on credit packs, and the invoice format.
- **Lawyer:** Terms, Privacy, Cupid terms and the disclaimer. The pages in the app carry the canvas drafts, marked "Draft for legal review".
- **Grievance Officer:** name and email. The app shows `[NAME]` until this is filled in.
- **Business accounts:** Razorpay and RazorpayX KYC, MSG91 sender ID registration, and the likha.in domain plus a trademark filing.
