# Putting Likha live

About half a day once the accounts exist (MSG91 DLT approval takes a few days: start it first).
Run the scripts from a Mac or Linux machine with this repository. Every script can be tried first with `DRY_RUN=1`,
which prints what it would do and changes nothing. All scripts are safe to run again.

```
deploy/0-secrets.sh     create deploy/.env, generate the three internal secrets
deploy/1-database.sh    schema, Guna table, Vault secret, 15 scheduled jobs
deploy/2-functions.sh   function secrets + all 16 Edge Functions
deploy/3-kundli.sh      (on your server) kundli engine behind HTTPS
deploy/4-web.sh         member app and admin on Vercel (Mumbai)
deploy/5-owner.sh       first Owner for the admin
deploy/6-smoke.sh       checks everything, changes nothing (run after every deploy)
```

## A. Accounts (you)

| Account | What to set up | You'll need |
|---|---|---|
| **Supabase** | New project, region **Mumbai (ap-south-1)**, Pro plan with Point-in-Time Recovery. | project ref, database URL, anon key, access token |
| **Vercel** | Account or team. | token, team slug |
| **Server for the kundli engine** | Any Ubuntu VPS in Mumbai (2 GB RAM is plenty) with Docker. | its IP address |
| **Domain** | DNS for likha.in. | |
| **MSG91** | Sender ID and **DLT** registration; two templates (below). | auth key, 2 template ids |
| **Razorpay + RazorpayX** | KYC; test keys first. | keys, webhook secrets |
| **OneSignal** | Web push app for likha.in (settings below). | app id, REST API key |
| **AI** | Anthropic and/or Google Gemini / OpenAI keys. | keys |
| **Google Cloud** | Maps JavaScript + Places API (New); browser key restricted to likha.in. | key |

MSG91 templates to register on DLT:
- Login code (variable `otp`): `Your Likha login code is ##otp##. It expires in 5 minutes. Do not share it with anyone.`
- Date safety alert (variables `name`, `member`, `place`, `time`): the text in `supabase/functions/_shared/sms.ts` (`alertText`).

## B. Run the steps

**1. Secrets and settings**
```bash
./deploy/0-secrets.sh            # creates deploy/.env with 3 random secrets
# then fill deploy/.env: SUPABASE_*, LIKHA_SITE, LIKHA_ADMIN_SITE, KUNDLI_DOMAIN, VERCEL_*, OWNER_*
```
Put the database URL in single quotes. Save deploy/.env in your password manager; never commit it.

**2. Database**
```bash
./deploy/1-database.sh
```

**3. Login codes by SMS (Supabase dashboard)**
Supabase can't send through MSG91 by itself, so Likha's `sms-hook` function does it:
1. Authentication > Sign In / Providers > **Phone**: enable. (If it asks for an SMS provider, pick any: the hook below replaces it.)
2. Authentication > **Hooks** > Send SMS hook > HTTPS > `https://<ref>.supabase.co/functions/v1/sms-hook` > Generate secret.
3. Copy the secret (`v1,whsec_…`) into deploy/.env as `SEND_SMS_HOOK_SECRET`.
4. Authentication > Sign In / Providers > **Email**: enabled (the admin signs in with an email code). Authentication > Multi-Factor: **TOTP on**.
5. Authentication > URL Configuration: Site URL `https://likha.in`; redirect URLs `https://likha.in/**`, `https://admin.likha.in/**`.
6. Authentication > Rate Limits: SMS sent per hour around 30 per number, OTP verifications per hour 30.

The WhatsApp option on the phone screen stays hidden (codes go by SMS). It only appears if `otp_whatsapp` is set on the `app` setting, which you should do only after WhatsApp login codes are set up.

**4. Edge Functions**
```bash
./deploy/2-functions.sh
```

**5. Kundli engine (on your server)**
Point `kundli.likha.in` (DNS A record) at the server, copy the repository there, then:
```bash
KUNDLI_DOMAIN=kundli.likha.in LIKHA_KUNDLI_KEY=<from deploy/.env> ./deploy/3-kundli.sh
```
The engine runs read-only behind Caddy, which gets the HTTPS certificate by itself.

**6. Member app and admin**
```bash
./deploy/4-web.sh
```
Then in Vercel add the domains: likha.in (+ www) to `likha-app`, admin.likha.in to `likha-admin`, and set the DNS records Vercel shows.
Recommended: put admin.likha.in behind Cloudflare Access (or Vercel password protection) as well.

**7. First owner**
Add `SUPABASE_SERVICE_ROLE_KEY` to deploy/.env for this step only, then:
```bash
./deploy/5-owner.sh              # then delete SUPABASE_SERVICE_ROLE_KEY from deploy/.env
```
Open admin.likha.in, sign in with the email code, scan the QR with an authenticator app.

## C. In the admin (you, about 30 minutes)

1. **Keys and integrations**: paste each key and press **Test** on every one:
   AI keys · Razorpay **test** keys + webhook secret · RazorpayX test keys · MSG91 auth key, login-code template id, safety template id ·
   `KUNDLI_URL` = `https://kundli.likha.in` and `KUNDLI_KEY` = `LIKHA_KUNDLI_KEY` · Google Maps browser key · OneSignal app id + REST API key · team alert webhook.
2. **Razorpay dashboard** > Webhooks: `https://<ref>.supabase.co/functions/v1/razorpay-webhook`, events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, the same secret as in Admin.
   **RazorpayX** > Webhooks: `https://<ref>.supabase.co/functions/v1/payout-worker`, payout events.
3. **OneSignal** > Settings > Web: site `https://likha.in`, Custom Code, service worker path `push/onesignal/OneSignalSDKWorker.js`, scope `/push/onesignal/`.
4. **Settings > General and legal**: company details, grievance officer, legal documents (after legal review).
5. **Settings > Verification**: stays on auto-approve until a check service is connected.
6. **Team and audit**: invite the team (each sets up their authenticator on first sign-in).

## D. Check, test money, go live

```bash
./deploy/6-smoke.sh              # every line should be ✓
```
Then on a phone: sign up with your own number (SMS code arrives), finish the profile, see your kundli, buy the smallest pack with a Razorpay **test** card, see the credits land, turn on notifications and receive one.
When that works: Admin > Keys > paste the **live** Razorpay keys, Test, then **Go live** (owner only, type LIVE). Make one real ₹99 purchase and refund it.

## Updating later

- New database part: `./deploy/1-database.sh --part supabase/schema/parts/NN_name.sql` (re-locks functions automatically).
- Functions: `./deploy/2-functions.sh`. Web: `./deploy/4-web.sh`. Kundli: `./deploy/3-kundli.sh` on the server.
- After any of these: `./deploy/6-smoke.sh`.

Before launch also read `SECURITY.md` (backups, MFA on every dashboard, CAPTCHA on the waitlist, external test).
