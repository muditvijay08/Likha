-- =====================================================================
-- SEED DATA: current values from the admin settings pages.
-- Change them later in admin, not here.
-- =====================================================================

-- ---- Team permissions (Admin > Team and roles) ----------------------
insert into public.role_permissions (role, permission)
select r::public.team_role_t, p from (values
  ('owner','users.read'),('owner','users.moderate'),('owner','birth.reveal'),('owner','credits.adjust'),('owner','refunds.small'),
  ('owner','refunds.large'),('owner','settings.write'),('owner','cities.unlock'),('owner','reports.read_chats'),('owner','ai.approve'),
  ('owner','data.manage'),('owner','support.reply'),('owner','grievances.manage'),('owner','fraud.manage'),('owner','team.manage'),
  ('owner','payments.read'),('owner','audit.read'),('owner','campaigns.manage'),
  ('admin','users.read'),('admin','users.moderate'),('admin','refunds.small'),('admin','cities.unlock'),('admin','reports.read_chats'),
  ('admin','data.manage'),('admin','support.reply'),('admin','grievances.manage'),('admin','fraud.manage'),('admin','payments.read'),
  ('admin','audit.read'),('admin','campaigns.manage'),
  ('safety','users.read'),('safety','users.moderate'),('safety','reports.read_chats'),('safety','grievances.manage'),('safety','fraud.manage'),
  ('support','users.read'),('support','refunds.small'),('support','support.reply'),
  ('finance','users.read'),('finance','refunds.small'),('finance','refunds.large'),('finance','payments.read'),('finance','credits.adjust'),
  ('viewer','users.read')
) v(r, p);

-- ---- Cities (Admin > Cities and waitlist) ---------------------------
insert into public.cities (slug, name, state, country, status, unlock_threshold, min_women_share_pct, lat, lng, timezone, unlocked_at) values
  ('jaipur',    'Jaipur',    'Rajasthan',   'IN', 'live',     1000, 40, 26.91240, 75.78730, 'Asia/Kolkata', now()),
  ('pune',      'Pune',      'Maharashtra', 'IN', 'waitlist', 1000, 40, 18.52040, 73.85670, 'Asia/Kolkata', null),
  ('ahmedabad', 'Ahmedabad', 'Gujarat',     'IN', 'waitlist', 1000, 40, 23.02250, 72.57140, 'Asia/Kolkata', null),
  ('dubai',     'Dubai',     null,          'AE', 'waitlist',  800, 40, 25.20480, 55.27080, 'Asia/Dubai',   null),
  ('udaipur',   'Udaipur',   'Rajasthan',   'IN', 'locked',    600, 40, 24.58540, 73.71250, 'Asia/Kolkata', null);

-- ---- Credit packs (prices include GST) ------------------------------
insert into public.credit_packs (id, label, price_paise, credits, bonus_pct, sort) values
  ('starter', 'Starter',    9900,  100,  0, 1),
  ('popular', 'Popular',    24900, 275, 10, 2),
  ('best',    'Best value', 49900, 600, 20, 3),
  ('big',     'Big',        99900, 1300, 30, 4);

-- ---- Feature prices in credits (tier discount applies where marked) --
insert into public.price_list (key, label, credits, tier_discount) values
  ('daily_kick',        'Daily Kick (one day)',          10, false),
  ('golden_hours',      'Golden Hours (per match)',      19, true),
  ('check_anyone',      'Check With Anyone',             29, true),
  ('check_anyone_5',    'Check With Anyone 5-pack',     119, true),
  ('full_report',       'Full compatibility report',     29, true),
  ('cosmic_like',       'Cosmic Like',                    9, false),
  ('cupid_opener',      'Cupid opener',                  15, false),
  ('boost',             'Boost (30 min)',                29, true),
  ('travel_mode',       'Travel Mode (per trip)',        29, true),
  ('top_matches_india', 'Top matches across India (week)', 49, true),
  ('why_not',           'Why It Didn''t Work',           79, false),
  ('gift',              'Gift a Reading',                99, false),
  ('who_suits_me',      'Who Suits Me',                  49, false),
  ('our_stars',         'Our Stars',                     49, true),
  ('our_alignment',     'Our Alignment',                 49, true),
  ('imagine_us',        'Imagine Us (2 images)',         49, true),
  ('guru_20',           'Guru Ji (20 messages)',         29, true),
  ('seven_questions',   'Seven Questions',               39, true),
  ('saathi_50',         'Saathi top-up (50 messages)',   25, false);

insert into public.subscription_plans (key, label, price_paise, interval, trial_note) values
  ('kick_pass',      'Kick Pass',           19900, 'month', null),
  ('rishta_maasi',   'Rishta Maasi',        29900, 'month', 'First Sunday free'),
  ('couple_mode',    'Couple Mode',         14900, 'month', 'One pays, both get it'),
  ('next_12_months', 'Our Next 12 Months',  49900, 'year',  null);

insert into public.tiers (key, label, discount_pct, min_conversations, min_streak_days, sort) values
  ('none',  'No tier', 0,  0,  0, 0),
  ('tara',  'Tara',    5,  0,  0, 1),
  ('graha', 'Graha',  10,  5,  7, 2),
  ('surya', 'Surya',  20, 15, 21, 3);

-- ---- App settings ---------------------------------------------------
insert into public.app_settings (key, value, category, description, is_public) values
  ('app',                     '{"name":"Likha","tagline":"Jo likha hai, woh milega.","support_email":"support@likha.in","support_whatsapp":"[NUMBER]","website":"likha.in","maintenance":false,"maintenance_message":"Back in 30 minutes. The stars are recharging.","min_app_version":"1.0.0","default_language":"hinglish","languages":["en","hinglish"]}', 'general', 'Brand, support and app status', true),
  ('company',                 '{"legal_name":"[COMPANY NAME] Private Limited","gstin":"[GSTIN]","cin":"[CIN]","address":"[ADDRESS], Jaipur, Rajasthan"}', 'general', 'Legal entity', true),
  ('grievance_officer',       '{"name":"[NAME]","email":"grievance@likha.in","phone":"[NUMBER]","ack_hours":24,"resolve_days":15}', 'general', 'Shown in app and website', true),
  ('min_age',                 '18', 'onboarding', 'Minimum age (locked)', true),
  ('max_age_filter',          '60', 'onboarding', 'Oldest age in filters', true),
  ('gender_options',          '["woman","man"]', 'onboarding', 'Options on the first screen', true),
  ('gender_theme',            '{"woman":"#E0457B","man":"#2F6FE0"}', 'onboarding', 'Accent colour by gender', true),
  ('onboarding_step_credits', '{"woman":[19,19,18,19,19,18,19,19],"man":[9,9,8,9,9,8,9,9]}', 'onboarding', 'Credit slider per step; must add up to the welcome bonus', true),
  ('photos',                  '{"min":2,"max":6,"face_required":true,"block_group_only":true,"block_celebrity_stock":true,"block_children":true}', 'onboarding', 'Photo rules', true),
  ('prompts',                 '{"required":2,"max_length":300,"voice_intro":true,"voice_max_seconds":30,"interests_min":3,"interests_max":10}', 'onboarding', 'Prompts and voice', true),
  ('birth_corrections_free',  '1', 'onboarding', 'Free birth detail corrections via support', false),
  ('welcome_bonus',           '{"woman":150,"man":70,"other":150,"expiry_days":90}', 'pricing', 'Paid at 100% profile + selfie passed', true),
  ('toolkit_reward',          '5', 'pricing', 'Credits for first try of a feature', true),
  ('invite_rewards',          '{"inviter":20,"friend":20,"max_per_month":10}', 'pricing', 'Invite rewards', true),
  ('booth_bonus',             '20', 'growth', 'Booth sign-up bonus credits', false),
  ('likes_per_day',           '{"woman":50,"man":25,"other":50}', 'matching', 'Free likes a day', true),
  ('cosmic_likes_free_week',  '1', 'matching', 'Free Cosmic Likes per week', true),
  ('reshow_passed_days',      '30', 'matching', 'Show passed profiles again after', false),
  ('hide_inactive_days',      '30', 'matching', 'Hide profiles inactive for', false),
  ('matching',                '{"ayanamsa":"lahiri","node":"mean","system":"ashtakoota_north","rules_version":"ak-2.0","borderline_minutes":5,"jodi_weights":{"gunas":70,"manglik":15,"moon_venus":15},"one_sided_manglik":0.4,"manglik_filter":false}', 'matching', 'Astrology rules (locked fields need a release)', false),
  ('selfie',                  '{"pass_score":0.85,"manual_below":0.85,"max_tries":3}', 'safety', 'Selfie thresholds', false),
  ('auto_suspend',            '{"upheld_reports":3,"days":7}', 'safety', 'Auto-suspend rule', false),
  ('block_links_first_messages', '10', 'safety', 'Hold links and phone numbers in the first N messages', false),
  ('blocked_phrases',         '["paytm me bhejo","invest karo","crypto","telegram pe aao","gift card","otp batao","send money","bitcoin"]', 'safety', 'Messages with these are held', false),
  ('scam_hold_score',         '0.90', 'safety', 'AI scam score that holds messages', false),
  ('date_checkin_alert_minutes', '15', 'safety', 'Alert trusted contact after', false),
  ('appeal_window_days',      '30', 'safety', 'Appeal window', true),
  ('tier_pause_days',         '90', 'safety', 'Upheld report pauses tier for', false),
  ('waitlist_jump_per_invite','50', 'growth', 'Places jumped per joined friend', true),
  ('public_counter_min',      '100', 'growth', 'Show city counter after N members', false),
  ('crush_links_per_day',     '5', 'growth', 'Crush links per person per day', false),
  ('gift_links_per_day',      '3', 'growth', 'Gift links per person per day', false),
  ('push',                    '{"marketing_per_day":1,"quiet_start":"23:00","quiet_end":"07:00","kick_default":"07:00","streak_reminder":"21:00","feature_of_day":"12:30"}', 'notifications', 'Push limits and timings', false),
  ('saathi',                  '{"characters":["chandni","dhruv"],"free_messages_per_day":30,"topup_messages":50,"topup_credits":25,"step_back_after_days":3,"max_session_minutes":45}', 'saathi', 'Saathi limits', true),
  ('ai',                      '{"max_words":350,"number_check":true,"refund_on_failure":true,"max_regenerations":1,"daily_cap_paise":400000,"monthly_cap_paise":9000000,"paid_overflow_pct":125,"degrade_at_pct":85,"alert_at_pct":80,"user_daily_paise":300,"user_monthly_paise":3000,"paid_user_multiplier":5,"usd_inr":88,"kick_batch_ist":"05:00"}', 'ai', 'AI gateway: global caps, per-user caps for free use, number check', false),
  ('ai_ceo',                  '{"ad_spend_per_day_paise":500000,"refund_per_case_paise":20000,"refunds_per_day_paise":300000,"approval_expiry_hours":24,"briefing_ist":"08:30"}', 'ai', 'AI CEO limits', false),
  ('invoice',                 '{"prefix":"LKH/26-27/","gst_pct":18,"prices_include_gst":true,"sac":"[SAC]"}', 'payments', 'GST invoices', false),
  ('refunds',                 '{"auto_credit_after_hours":2,"pack_refund_days":7,"second_approver_above_paise":50000,"max_per_user_month":3}', 'payments', 'Refund rules', false),
  ('subscriptions',           '{"reminder_hours":24,"grace_days":3,"refund_part_month":false,"outage_refund_hours":24}', 'payments', 'Subscription rules', false),
  ('data_request_days',       '7', 'security', 'Target to complete data requests', false),
  ('retention',               '{"deleted_accounts_days":30,"safety_reports_years":3,"audit_years":3,"app_logs_days":90}', 'security', 'How long data is kept', false),
  ('admin_session_minutes',   '30', 'security', 'Admin session timeout', false);

-- ---- Feature switches (Admin > Matching, safety, features) ----------
insert into public.feature_flags (key, enabled, rollout_pct, city_slugs, description) values
  ('daily_kick',      true, 100, '{}',         'Daily Kick'),
  ('golden_hours',    true, 100, '{}',         'Golden Hours'),
  ('check_anyone',    true, 100, '{}',         'Check With Anyone'),
  ('saathi',          true,  50, '{jaipur}',   'Saathi virtual companion'),
  ('rishta_maasi',    true, 100, '{jaipur}',   'Rishta Maasi'),
  ('imagine_us',      true, 100, '{jaipur}',   'Imagine Us'),
  ('couple_mode',     true, 100, '{}',         'Couple Mode'),
  ('travel_mode',     true, 100, '{}',         'Travel Mode'),
  ('live_toast',      true, 100, '{jaipur}',   'Live activity toast (real events only)'),
  ('love_stories',    false,  0, '{}',         'Opt-in love stories, on after 10 approved'),
  ('hindi',           false, 10, '{}',         'Hindi language'),
  ('porutham',        false,  0, '{}',         'South Indian Porutham matching');

-- ---- Reference content ---------------------------------------------
insert into public.prompt_bank (key, label, sort) values
  ('about_you', 'About you', 1), ('fond_of', 'What are you fond of?', 2),
  ('planets_right', 'The planets got me right about…', 3), ('sunday', 'My Sunday looks like…', 4);

insert into public.interests (slug, label) values
  ('travel','Travel'),('chai','Chai'),('architecture','Architecture'),('cricket','Cricket'),('indie_music','Indie music'),
  ('trekking','Trekking'),('cooking','Cooking'),('movies','Movies'),('books','Books'),('fitness','Fitness'),
  ('photography','Photography'),('art','Art'),('dance','Dance'),('startups','Startups'),('spirituality','Spirituality');

insert into public.consent_versions (key, version, title, body, required) values
  ('terms_privacy',  '1.0', 'Terms and Privacy Policy', 'I agree to the Terms of use and Privacy policy.', true),
  ('birth_matching', '1.0', 'Birth details for matching', 'Use my birth details to build my kundli and matches. Never shown on my profile.', true),
  ('selfie',         '1.0', 'Selfie for verification', 'Use my photos and selfie to keep Likha real. The selfie is deleted after the check.', true),
  ('marketing',      '1.0', 'Offers on WhatsApp and email', 'Send me offers on WhatsApp and email.', false);

insert into public.integration_health (service, provider) values
  ('otp_sms','MSG91'),('otp_whatsapp','MSG91'),('phone_auth_backup','Firebase'),('payments','Razorpay'),('places','Google Places'),
  ('kundli','Likha Ephemeris'),('ai','Claude API'),('push','OneSignal'),('selfie','AWS Face Liveness'),
  ('photo_moderation','Sightengine'),('analytics','PostHog'),('email','Resend'),('errors','Sentry');

-- Make yourself Owner after signing in to the admin once:
--   insert into public.team_members (user_id, name, role) values ('<your auth user id>', 'Mudit Dudhoria', 'owner');
