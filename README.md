# Likha: build and launch plan

## Status (21 Oct 2026)
| Area | Status |
|---|---|
| Design canvas (105 app + 25 admin screens) | Done |
| Database (16 parts, 713 checks passing) | Done |
| Kundli engine (NASA JPL, final rules ak-2.0) | Done |
| AI gateway, spend caps, Claude/Gemini/GPT switch | Done |
| Be a Cupid (referrals, payouts, TDS) | Done |
| **Member app: onboarding O1–O15 + tour** | **Done, tested end to end in demo mode (23 checks)** |
| **Member app batch 1: Home, Daily Kick, Discover, Profile, Filters, Compatibility report, Likes, Match + Golden Hours, Menu, Chats list** | **Done, 34 end-to-end checks in demo mode** |
| **Member app batch 2: Chats list, live chat with voice notes and Cupid openers, Golden Hours, Guru Ji, Saathi (setup, chat, stepping back)** | **Done, 25 end-to-end checks** |
| **Member app batch 3: wallet, Razorpay checkout and payment status, tiers, Astro Store, Check With Anyone, Why It Didn't Work, Gift a Reading, My Kundli + Who Suits Me, Rishta Maasi, readings** | **Done, 32 end-to-end checks** |
| **Member app batch 4: Me and edit profile, settings, privacy, trusted contacts, Share my date + check-in, SOS + live location, unmatch/block/report, inbox, plans and invoices, help (tickets, grievances), account status and appeals, toolkit, delete with OTP** | **Done, 37 end-to-end checks** |
| **Member app batch 5: Our Universe (partner says yes first), partner consent, Seven Questions, Imagine Us (labelled pictures), Couple Mode + Plus, Our Story, 30/90/180-day check-ins, Boost, Travel Mode, Invite, Be a Cupid + payouts, /k /g /i landing pages, reading worker, invite and Cupid attached at sign-up** | **Done, 61 end-to-end checks** |
| **Admin: sign-in with authenticator (MFA), Keys & live mode (all provider keys, encrypted, write-only, test buttons, test/live payments switch), AI models (10 picture models for Imagine Us across Google, OpenAI and fal.ai; text feature routing; model list and prices)** | **Done, 36 end-to-end checks** |
| **Admin batch A, daily work: Dashboard, Users (search by phone/#ID/name, credits, tier override, suspend/ban, birth-details reveal), Moderation + appeals (reported chat, logged), Selfie review (keyboard), Payments and refunds (Razorpay re-check, two-person bank refunds), Readings (rewrite/refund), Support inbox (agent drafts sent by a person), Grievances (24 h / 15 day, monthly report), Data requests (export, erase with proof), Rishta Maasi picks, crush/gift link lookup** | **Done, 43 end-to-end checks** |
| **Admin batch B: Cities and waitlist (readiness, scheduled unlock, members told in the app), Be a Cupid (review signals, KYC, payouts, partners, rates, TDS export), AI spend and limits (caps, pause free AI, member limits, call log), Fraud (hourly scan, decide cases), System health (measured from own records, jobs, incidents), Team and roles (invite, role changes, permission matrix, audit log); settings publish with a note and version history** | **Done, 41 end-to-end checks** |
| **Admin batch C: Pricing (whole catalog published with a note, versions, restore), Features (switches by city and rollout; the app hides switched-off screens), matching (chart rules locked), safety (report priority, test a message), Notifications, Saathi and AI (AI emergency stop), Onboarding (step credits must add up to the bonus), Content (Home banner, Kick templates, feature of the day, prompts, interests, app text), Payments and tax, General and legal (maintenance, new document versions that members re-accept), Security and data, AI CEO console (approvals, undo, pause) and rules. Settings nothing reads yet are tagged "Not used by the app yet"** | **Done, 39 admin + 13 member end-to-end checks** |
| **Settings take effect: every Admin setting is read by the code (free Cosmic Likes, inactive and age limits, photo and prompt limits, gender options and colours, birth-correction limit, auto-suspend, check-in alert time, refund rules, automatic payment re-check, GST rate, plan reminders, part-month refunds, free day after long outages, retention, admin idle sign-out, app version check, reading length and rewrites, Daily Kick time, Saathi break nudge). Selfie and push rules are ready for when those are connected** | **Done, 58 database checks** |
| **Verification switch: selfie and photo checks set to auto-approve (for now), team review, or call an API (address + key in Admin, test call, request/reply format shown). Auto-approved members get no Verified badge; photo review queue and spot checks of auto-approved photos; honest member wording in each mode** | **Done, 40 database + 17 admin + 6 member checks** |
| **Security audit and hardening (see SECURITY.md): 15 findings fixed (function access for visitors, like/plan/photo tampering, team edits skipping audits, storage by job, hidden profile fields, headers); attack tests run against a Supabase-identical setup; live Security checks in Admin** | **Done, 46 security checks** |
| AI agent service (does the work behind the AI CEO console) | Not started: rules, approvals and undo are ready in the database |
| Razorpay payments (create-order + signed webhook) | Built and tested; paste live keys in Admin > Keys, test, then Go live |
| A real selfie and photo check service (plug into Verification > Call an API), OneSignal push, MSG91 OTP in Supabase auth, Sentry/PostHog | Not started (selfie, photo and push rules already in the database) |

## First-time setup (half a day)
1. Create a Supabase project in **Mumbai (ap-south-1)**. Enable phone auth, using MSG91 or Twilio for SMS and WhatsApp OTP.
2. Run `supabase/schema/likha_schema.sql`, then `supabase/schema/guna_lookup.sql`. Enable `pg_cron` and `pg_net`.
3. Make yourself Owner. The command is at the bottom of `parts/04_seed.sql`.
4. Deploy the kundli service from `kundli/Dockerfile` to a Mumbai host. Set `LIKHA_KUNDLI_KEY`.
5. Deploy the Edge Functions and set the four function secrets listed in `supabase/README.md`.
6. Deploy `admin/` (e.g. admin.likha.in), sign in, set up your authenticator, then paste every provider key in **Keys and integrations** and press Test on each.
7. Set up the app: copy `app/.env.example` to `.env.local`, fill in the Supabase URL and anon key (the Maps key comes from Admin). Then run `npm run dev`.

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
