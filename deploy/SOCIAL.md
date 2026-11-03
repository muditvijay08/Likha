# Social media: setup

Likha plans one post a day for the week ahead, every Sunday at 10:00 IST: Monday *Aaj ka panchang*, Tuesday *Rashi jodi*, Wednesday *Kundli 101*, Thursday a feature, Friday *Myth vs fact*, Saturday weekend *Golden Hours*, Sunday *Likha diaries*.
- **Facts** are computed: panchang and Golden Hours from `panchang.ts`, pairs and kootas from the website's rashi rules, features from `lib/about.ts`.
- **Words** are written in Hinglish by the model set for "Social posts" in Admin > AI models. Every number must come from the facts, and the house rules apply: no "AI", no guarantees, no caste, no made-up numbers, no testimonials. A post that fails the checks gets plain template words instead.
- **Cards** are drawn by `app/src/app/social-card/[id]` and turned into a JPEG and a 10-second vertical video by the kundli service (`/v1/media/jpeg`, `/v1/media/short`).
- **Posting**: you approve each post in **Admin > Social media**. Nothing goes out unapproved, or while posting is switched off.

## Switch it on
1. Connect the platforms you want (below) in **Admin > Keys and integrations > Social**, and press **Test** on each one.
2. In **Admin > Social media**, press **Write this week now** to see a week of drafts. Edit, approve or drop them.
3. In the Social settings at the bottom of that page, tick **Post approved posts**.

## Connect each platform
All keys go only into Admin > Keys. They are stored in Supabase Vault and can't be read back.

**Instagram and Facebook (Meta)**
1. You need an Instagram Business or Creator account linked to the Likha Facebook Page.
2. Create an app at developers.facebook.com (type Business). Add *Facebook Login for Business* and *Instagram Graph API*. Admins of the app can post without App Review.
3. In Graph API Explorer, get a User token with `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic` and `instagram_content_publish`.
4. Exchange it for a long-lived token, then call `/me/accounts` to get the **Page access token**. A Page token made from a long-lived token does not expire.
5. Keys:
   - `META_PAGE_TOKEN`
   - `META_PAGE_ID`
   - `META_IG_USER_ID` (from `/{page-id}?fields=instagram_business_account`)

**LinkedIn**
- To post as the founder, which is easiest: create an app at linkedin.com/developers, add *Share on LinkedIn* (scope `w_member_social`), and get a token. The author is `urn:li:person:<id>`.
- To post as the company page: add *Community Management API*, which LinkedIn has to approve (scope `w_organization_social`). The author is `urn:li:organization:<id>`.
- Keys: `LINKEDIN_TOKEN` and `LINKEDIN_AUTHOR_URN`. **Tokens last 60 days**, so renew the token before then.

**X**
1. At developer.x.com, create a project and app. Set user authentication to **Read and write**.
2. Generate the API key and secret, and an access token and secret for the @Likha account.
3. Keys: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`.
4. X's free tier caps posts per month, so check your plan covers one post a day.

**YouTube Shorts**
1. In Google Cloud, enable *YouTube Data API v3*. Create an OAuth client (Web), and add `https://developers.google.com/oauthplayground` as a redirect.
2. In the OAuth Playground, using your own client, authorise the scope `https://www.googleapis.com/auth/youtube.upload` as the Likha channel. Exchange the code for a **refresh token**.
3. Keys: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`.
4. **Google keeps uploads from unaudited API projects private.** Shorts go up as *private* (Admin setting) until you pass the YouTube API audit (a form in Google Cloud). Until then, make each Short public from YouTube Studio.

## What runs where
| Piece | Where |
| --- | --- |
| Plan, render, publish | `supabase/functions/social-worker` (cron: `social-plan` hourly, acting on the planning day; `social-publish` every 10 minutes) |
| Card images | `app/src/app/social-card/[id]` (needs the post's own token) |
| Facts for the planner | `app/src/app/social/bank.json` |
| JPEG and video | kundli service `/v1/media/*` (needs ffmpeg; the Dockerfile installs it) |
| Posts, checks, approvals | `supabase/schema/parts/28_social.sql` (permission `social.manage`, audited) |
| Images and videos | public storage bucket `social` (marketing images only, never member data) |
