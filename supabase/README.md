# Likha: kundli engine, AI gateway, spend caps, Be a Cupid

Everything here was run and tested on 20 Oct 2026.

| Part | Folder | Tests |
|---|---|---|
| Kundli engine (Python, NASA JPL data) | `kundli/` | 31 pass (incl. Python = Postgres for all 11,664 Guna pairs) |
| Database (full schema, 7 parts) | `schema/` | 62 + 80 + 98 checks pass |
| AI gateway + workers (Supabase Edge Functions) | `gateway/` | 17 pass, all 5 functions type-check |

## 1. Kundli engine (`kundli/`)
- **Positions:** NASA JPL DE421 (via Skyfield, free for commercial use, 1900–2049). Lahiri ayanamsa, mean Rahu, whole-sign houses.
  - Checked against an independent ephemeris at 400 random moments and places (1925–2045). Worst error: Moon 1.7 arc-seconds, everything else under 0.3″. One pada is 12,000″ wide.
  - Makar Sankranti 2024 lands within ±3 minutes of the published time.
- **Also computed:** Vimshottari dasha down to antardasha, Manglik with exceptions, the full 36-point Guna Milan, the Jodi Score, the ±5-minute borderline flag, and historic time zones (1942–45 war time, daylight saving).
- **Final rules `ak-2.0`** (`likha_kundli/rules.py`, every decision commented):
  - **Varna:** Brahmin = water signs, Kshatriya = fire, Vaishya = earth, Shudra = air. 1 point if the groom's varna is equal or higher.
  - **Vashya:** groups split at 15° in Sagittarius and Capricorn. Each cell is the majority of three published tables. Lion vs quadruped scores 0, from the classical "prey" relation.
  - **Tara:** counted both ways; 3rd, 5th and 7th are bad; 1.5 points for each good direction.
  - **Yoni:** same as PyJHora's table (the open-source port of Jagannatha Hora). The 7 sworn-enemy pairs score 0, and Horse–Deer scores 1.
  - **Graha Maitri:** Parashara's natural friendships.
  - **Gana:** depends on who is the bride and who is the groom.
    - Deva groom with Manushya bride: 5; Manushya groom with Deva bride: 6.
    - Deva groom with Rakshasa bride: 1; Rakshasa groom with Deva bride: 0.
  - **Bhakoot:** 2/12, 5/9 and 6/8 score 0. The dosha is cancelled when both Moon signs share a lord or the lords are mutual friends.
  - **Nadi:** same Nadi scores 0. The dosha is cancelled for same nakshatra with a different sign, same sign with a different nakshatra, or same nakshatra with a different pada (Jyotirnibandha).
  - **Manglik:** Mars in houses 1, 2, 4, 7, 8 or 12 from the Lagna; "high" if also from the Moon. Cancelled (B.V. Raman):
    - Mars in its own or exaltation sign, or in Leo or Aquarius
    - one of the classical house-and-sign pairs
    - Jupiter with Mars or aspecting it
    - Cancer or Leo Lagna
- **Run:** `pip install -r requirements.txt && LIKHA_KUNDLI_KEY=<secret> uvicorn app:app --port 8080` (or use the Dockerfile; host in Mumbai).
- **Endpoints:**
  - `POST /v1/chart`
  - `POST /v1/pair` (people not on Likha; nothing is stored)
  - `GET /v1/guna-lookup.sql`
- **Load the Guna table once:** `psql -f schema/guna_lookup.sql`

## 2. Database (`schema/likha_schema.sql`, new part `parts/07_engine_ai_cupid.sql`)
- **Kundli:** saving birth details queues a job. The worker saves the chart (birth details and the full chart stay private) and then computes Gunas and the Jodi Score against everyone in one SQL pass.
- **AI caps:** every model call first reserves its estimated cost.
  - Global caps: ₹4,000 a day and ₹90,000 a month. Paid answers can go 25% over the cap. At 85% of the daily cap, a cheaper model is used. The owner is alerted at 80%.
  - Per-member caps on free use: ₹3 a day and ₹30 a month. Paying members get 5×.
  - Paid readings are never blocked by per-member caps. If a paid reading can't be written, the member is refunded automatically.
  - Team can block or raise a member's limit; a reason is required and it is audited.
- **Be a Cupid:**
  - Links: `likha.in/c/<code>`, with deep links. Clicks are de-duplicated and IPs are stored only as salted hashes.
  - One referrer per person. Same device, face or payment method as the Cupid means blocked.
  - Earnings: ₹20 per verified sign-up, plus the friend gets 20 credits. ₹50 per new paying member, capped at 40% of Likha's net from that payment.
  - Holds and limits: 30-day hold; the member must still be active; 100 paid sign-ups a month per Cupid; review queue above 25 sign-ups a day.
  - Refunds after payout are clawed back from the next payout.
  - Payouts: minimum ₹500, PAN plus UPI required, India residents only for cash.
  - TDS: 2% once a person's year total passes ₹20,000. Section 393 of the Income-tax Act 2025 (was 194H); 20% without PAN.
  - **Single level only:** nobody earns from their referrals' referrals.
- **New team permissions:** `ai.view`, `ai.limits`, `cupid.manage`, `payouts.manage`.

## 3. Edge Functions (`gateway/supabase/functions/`)
| Function | Called by | Job |
|---|---|---|
| `ai-gateway` | app (member token) / internal | Readings, Saathi, Guru Ji, Cupid openers |
| `kundli-worker` | cron, every minute | Build queued kundlis |
| `kick-batch` | cron every 15 min: `tick` (submits at the time set in Admin, `ai.kick_batch_ist`, then collects) | Daily Kicks: scores and times computed (kundli `/v1/day` + panchang), words via Batches API (half price) |
| `cupid-redirect` | public `likha.in/c/*` | Log click, set cookie, redirect |
| `payout-worker` | cron hourly + RazorpayX webhook | UPI payouts |
| `create-order` | app (member token) | Razorpay order for a credit pack or one prepaid month of a plan; price from our tables |
| `admin-ops` | Admin buttons | Re-check a payment with Razorpay (credits land if captured); send an approved bank refund; invite a team member by email. Team only, MFA, `LIKHA_ADMIN_SITE` for CORS |
| `admin-keys` | Admin buttons | Test a key (one read-only call) or a model (one short answer or one labelled picture). Team only, MFA |
| `reading-worker` | cron every minute | Writes paid readings still waiting (app closed, gift opened, crush joined, both finished Seven Questions, partner said yes). A 3-minute lease stops double writing; refunds after 5 tries |
| `safety-worker` | cron every 5 min | Share my date: reminds at check-in time, then SMS-alerts trusted contacts after the minutes set in Admin (`date_checkin_alert_minutes`, MSG91 DLT template) |
| `payment-recheck` | cron every 15 min | Orders still unpaid after the hours set in Admin (`refunds.auto_credit_after_hours`) get one automatic look at Razorpay; captured ones are credited like the webhook would |
| `selfie-check` | app (member token) | Selfie step. Follows Admin > Settings > Verification: auto (let in, no Verified badge), team review (the frame is kept in the private `selfies` bucket until someone decides, then the safety worker deletes it), or the selfie API you set (any failure goes to the team) |
| `photo-check` | app after each upload | Photos: auto-approved or waiting for the team is decided in the database; in API mode the photo service answers here. Failures wait for the team |
| `razorpay-webhook` | Razorpay (deploy with `--no-verify-jwt`) | Checks the signature, records the payment, credits the wallet once (`svc_record_payment`) |

**Payments:** plans (Kick Pass, Rishta Maasi, Couple Mode) are sold as prepaid months for now; they don't auto-renew. UPI autopay needs Razorpay Subscriptions with an e-mandate, which is a later step. In the Razorpay dashboard add the webhook URL with events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`.

**Links on likha.in:** `/c/*` Cupid referrals (cupid-redirect), `/k/*` Check With Anyone invites, `/g/*` gifts, `/s/*` SOS live location (no login, only while sharing).

**Switching AI company (Claude, Gemini, GPT):** each feature has a model in Admin › AI spend and limits (`ai_features.model`). Pick any model in the price list (`ai_models`: Claude Sonnet/Haiku 5.5, Gemini 3.1 Pro / 3.8 Flash / 3.5 Flash-Lite, GPT-6.1 Sol / GPT-6 Luna). It takes effect on the next call, with no release needed. The adapter (`_shared/llm.ts`) handles each company's API.
- Prompts, checks, caps, costs and refunds stay identical across all three.
- Daily Kicks use Claude's half-price batches; on Gemini or GPT they are written live, 300 members per run.
- Confirm the Gemini and OpenAI model ids on their pricing pages before switching.

**Every answer is checked before a member sees it:**
- Every score, sign and nakshatra must match the chart facts exactly.
- Banned: guarantees, death, divorce or health predictions, paid remedies, and the word "AI".
- A failed answer is rewritten once. If it fails again, the member is refunded.
- Saathi crisis messages (English and Hinglish) never reach the model. The member gets Tele-MANAS 14416 and Safety is flagged.

**Keys.** Provider keys are set in **Admin > Keys** (encrypted in Supabase Vault, write-only, owner only, every change audited). Functions read them through `_shared/keys.ts` (cached one minute). Razorpay and RazorpayX keys have test and live slots; the payments switch on the same page picks which pair is used, and going live needs every live key set, a passing test of the live secret and "LIVE" typed in.

In Admin > Keys: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `FAL_KEY`, `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` (test and live), `RAZORPAYX_KEY_ID` / `RAZORPAYX_KEY_SECRET` / `RAZORPAYX_ACCOUNT_NUMBER` / `RAZORPAYX_WEBHOOK_SECRET` (test and live), `MSG91_AUTH_KEY`, `MSG91_SAFETY_TEMPLATE_ID`, `KUNDLI_URL`, `KUNDLI_KEY`, `GOOGLE_MAPS_BROWSER_KEY` (served to the app through `public_settings`), `LIKHA_ALERT_WEBHOOK`.

**Function secrets** (Supabase > Edge Functions > Secrets), the few the functions need before they can read Admin: `LIKHA_INTERNAL_SECRET`, `LIKHA_HASH_SALT` (never change after launch: it would break saved phone hashes), `LIKHA_SITE` (member app address, CORS) and `LIKHA_ADMIN_SITE` (admin address, CORS for `admin-keys`). `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase. Any provider key also set here acts only as a fallback while Admin is empty.

**Picture models** for Imagine Us are chosen in Admin > AI models: Google Nano Banana 2.1 (default), Nano Banana 2 Lite, Nano Banana Pro, OpenAI GPT Image 2 and 2.5 Flare, and through fal.ai FLUX.2 [max], GPT Image 2 and Seedream 5.0 Pro (off until its endpoint id is confirmed). Any fal.ai image-edit endpoint can be added there. Press Test (one labelled picture from stand-in portraits, cost logged) before switching.

**Cron** (put the internal secret in Supabase Vault as `likha_internal`):
```sql
select cron.schedule('kundli-worker', '* * * * *', $$
  select net.http_post(url := 'https://<project>.supabase.co/functions/v1/kundli-worker',
    headers := jsonb_build_object('x-likha-internal', (select decrypted_secret from vault.decrypted_secrets where name = 'likha_internal')),
    body := '{}'::jsonb) $$);
select cron.schedule('kick-tick',    '*/15 * * * *',   $$ select net.http_post(url := 'https://<project>.supabase.co/functions/v1/kick-batch', headers := jsonb_build_object('x-likha-internal', (select decrypted_secret from vault.decrypted_secrets where name = 'likha_internal')), body := '{"step":"tick"}'::jsonb) $$);   -- writes Daily Kicks at the time set in Admin
select cron.schedule('payment-recheck', '*/15 * * * *', $$ select net.http_post(url := 'https://<project>.supabase.co/functions/v1/payment-recheck', headers := jsonb_build_object('x-likha-internal', (select decrypted_secret from vault.decrypted_secrets where name = 'likha_internal')), body := '{}'::jsonb) $$);
select cron.schedule('payouts',      '0 * * * *',      $$ select net.http_post(url := 'https://<project>.supabase.co/functions/v1/payout-worker', headers := jsonb_build_object('x-likha-internal', (select decrypted_secret from vault.decrypted_secrets where name = 'likha_internal')), body := '{}'::jsonb) $$);
select cron.schedule('tiers',        '0 0 1 * *',      $$ select private.recompute_tiers() $$);          -- 1st of the month, 05:30 IST
select cron.schedule('readings',     '* * * * *',      $$ select net.http_post(url := 'https://<project>.supabase.co/functions/v1/reading-worker', headers := jsonb_build_object('x-likha-internal', (select decrypted_secret from vault.decrypted_secrets where name = 'likha_internal')), body := '{}'::jsonb) $$);
select cron.schedule('safety',       '*/5 * * * *',    $$ select net.http_post(url := 'https://<project>.supabase.co/functions/v1/safety-worker', headers := jsonb_build_object('x-likha-internal', (select decrypted_secret from vault.decrypted_secrets where name = 'likha_internal')), body := '{}'::jsonb) $$);
select cron.schedule('lift-suspensions', '*/30 * * * *', $$ select private.lift_suspensions() $$);
select cron.schedule('city-unlocks', '*/5 * * * *',    $$ select private.run_city_unlocks() $$);        -- scheduled city unlocks (Admin > Cities)
select cron.schedule('fraud-scan',   '7 * * * *',      $$ select private.scan_fraud() $$);              -- linked accounts, held messages, invite farming, refund patterns, copied bios
select cron.schedule('crush-expiry', '0 21 * * *',     $$ select private.expire_crush_checks() $$);      -- 02:30 IST: unclaimed Check With Anyone links refunded
select cron.schedule('plan-reminders', '20 * * * *',   $$ select private.run_plan_reminders() $$);      -- "your plan ends soon" (Admin: subscriptions.reminder_hours)
select cron.schedule('retention',    '30 21 * * *',    $$ select private.run_retention() $$);           -- 03:00 IST: erase deleted accounts, drop old logs (Admin: retention)
```

## 4. Before launch (needs people, not code)
1. Spot-check 50 real couples against AstroSage or Jagannatha Hora. Expect small differences where they use other Vashya or Gana tables.
2. CA: confirm Cupid payments are commission under section 393 (TDS, quarterly returns, certificates). Also confirm that GST does not apply to individual Cupids.
3. Lawyer: Cupid terms (the draft is in `consent_versions.cupid_terms`). ASCI requires Cupids to label posts as referral or ad.
4. Turn on RazorpayX and complete its business KYC.

## Settings that take effect (part 18)
Every setting in Admin is read by the database, the functions or the apps, except two that are tagged "Not used by the app yet":
`booth_bonus` (no booth sign-up flow) and `scam_hold_score` (no AI scam check). Two more are ready and wait for their provider:
- **Selfie** (`selfie.pass_score`, `max_tries`): the selfie-check function calls `svc_selfie_result(user, score, liveness)`; the database decides pass, retry or manual review.
- **Push** (`push`, `push_types`, member notification settings): the push sender takes `svc_push_outbox()` (quiet hours, offers opt-in, one offer a day, switched-off types held) and marks sent with `svc_push_sent(ids)`.
Retention erases database rows; photo files in Storage are removed by the same job once Storage cleanup is added.

## Verification (part 19)
Admin > Settings > Verification sets each check (selfie, photos) to **Auto-approve for now**, **Team reviews**, or **Call an API**.
- Auto-approved members get in but never get the Verified badge until a real check passes (`profiles.selfie_auto`). Auto-approved photos are marked and listed for spot checks in Selfie and photo review > Photos.
- API mode needs an https address (saved in the setting) and a key on Keys (`SELFIE_API_KEY`, `PHOTO_API_KEY`). The request and reply format is shown on the Verification page and in `functions/_shared/verify.ts`. "Send a test call" sends one labelled sample with no member data.
- Starts on auto-approve for both. Switch to API mode when your check service (or an adapter in front of AWS Face Liveness / Sightengine) is ready.
