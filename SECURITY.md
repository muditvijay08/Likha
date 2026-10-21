# Likha security

How the platform is protected, what the October 2026 audit found and fixed, and what must be done on the live accounts before launch.

## How it is protected

| Layer | Rule |
|---|---|
| Database (Supabase Postgres) | Every table has row-level security. Members see only their own rows and the public fields of people they can see. Private data (birth details, charts, keys) lives in the `private` schema, which apps cannot reach at all. |
| Functions | Signed-out visitors can call six functions only (public website and share links). Server-only functions (`svc_*`) can't be called from the apps. Admin functions (`admin_*`) check a permission, need two-step sign-in (MFA), and write the audit log. |
| Team | Admin needs an authenticator app (aal2) for every request. Roles have only the permissions they need. The team changes data only through audited functions, never by editing tables. |
| Money | Prices come from the database, never the app. Razorpay webhooks are signature-checked in constant time. Credits move only through the ledger with idempotency keys. Bank refunds need a second person. Live payments need the owner, all live keys tested, and typing LIVE. |
| Keys | Provider keys are in Supabase Vault, write-only from Admin (last 4 shown), owner only, audited. Never in code, logs or the app. |
| Files | All buckets are private. Members read approved photos of people they can see, and chat files only in their own matches. The team sees chat files only for reported chats; selfies only while reviewing, then they're deleted. |
| Web apps | Content Security Policy listing only the services used, no framing (clickjacking), HSTS, nosniff, camera/mic/location limited to the app itself. Admin is never indexed and has no camera/mic/location. |
| Server functions | Member calls need a valid sign-in; scheduled jobs need a 32+ character shared secret compared in constant time. The verification API address must be a public https name (no IP addresses or internal hosts). |

## Audit, October 2026: found and fixed

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Critical | Supabase grants every new function to signed-out visitors. 121 functions were callable without signing in (most had their own checks, but nothing guaranteed it). | `private.lockdown()`: visitors get 6 functions; server-only functions closed to members; new functions are closed by default. |
| 2 | Critical | Members could rewrite who liked them, then match with someone who never liked them back. | Removed the direct update rule; `mark_likes_seen()` only. |
| 3 | Critical | Members could move their own plan end date. | Removed; `cancel_subscription()` only. |
| 4 | Critical | Members could approve their own photos, or point a photo at someone else's picture. | Photo guard: new photos always wait for review; no edits to status; files must be in your own folder. |
| 5 | High | Members could set their own tier override (a real tier, with discounts, at the monthly recompute) and switch city past the waitlist. | Profile guard covers tier override, city and activity time. |
| 6 | High | Team members could edit settings, prices, roles, the Guna table and refunds directly, skipping validation, the second approver and the audit log (e.g. switch payments to live without the owner). | All direct team write rules removed; admin functions only. |
| 7 | High | Any team member with "see members" could open every chat photo and voice note, support attachments and selfies. | Storage rules by job: chats only when reported (and with that permission), support for support, selfies for reviewers. |
| 8 | Medium | Members could read others' hidden company and religion (and other private flags) from the profiles table. | Column grants: only public profile fields; hidden fields only through functions that respect the member's choice. |
| 9 | Medium | Rejected or unapproved photo files were readable by other members who had the path. | Storage requires an approved photo row. |
| 10 | Medium | `permission_labels` had no row-level security. | Enabled; team read only. |
| 11 | Low | Members could read AI writer templates and agent rules. | Team only. |
| 12 | Low | Messages could be inserted pre-marked as read or not held; attachments could point at others' files. | Message guard. |
| 13 | Low | Shared-secret and RazorpayX signature checks used plain comparison. | Constant-time compare; secret must be 32+ characters. |
| 14 | Low | Verification API address could point at internal addresses; repeated selfie calls could flood the review queue. | Public https names only; one waiting selfie per member. |
| 15 | Low | No security headers on either app. | CSP, no framing, HSTS, nosniff, permissions policy. |

Checked and fine: MFA enforced for the team (aal2 in every permission check); 18+ enforced when birth details are saved; Razorpay webhook signature (constant time); Cupid redirect can't send people off likha.in; SOS share links use 96-bit random tokens; no secrets in either app bundle; every privileged function pins its `search_path`; no SQL built from user text.

Tests: `supabase/test/B0_security.sql` tries each attack above against a database set up exactly like Supabase (same default grants) and checks the invariants. Admin > Settings > Security and data runs the same checks live ("Security checks").

**Rule for every new migration:** end it with `select private.lockdown();`.

## Before launch (on the live accounts)

1. **Supabase:** turn on MFA for every dashboard member; enable Point-in-Time Recovery backups; set Auth rate limits for OTP (SMS and WhatsApp); disable email sign-ups except for the team; keep the service-role key only in function secrets.
2. **Function secrets:** `LIKHA_INTERNAL_SECRET` at least 32 random characters; `LIKHA_SITE` and `LIKHA_ADMIN_SITE` set (otherwise CORS falls back to any site).
3. **Razorpay:** webhook secret set and tested; enable 2FA on the Razorpay and RazorpayX dashboards; restrict RazorpayX payouts to approved accounts.
4. **Google Maps key:** restrict to likha.in (HTTP referrer) and to Places API only.
5. **Waitlist and sign-up spam:** add Cloudflare Turnstile (or similar) to the public waitlist form; it has no rate limit of its own.
6. **Admin site:** put it behind Cloudflare Access or an IP allow-list as a second door in front of MFA.
7. **Monitoring:** Sentry with personal-data scrubbing (no message text, phone numbers or birth details in error reports).
8. **External test:** a short penetration test before public launch, then yearly; rotate provider keys yearly or when someone leaves the team.
9. **DPDP:** name the Grievance Officer, publish the final Terms/Privacy after legal review, and keep consent versions current (Admin > General and legal).
