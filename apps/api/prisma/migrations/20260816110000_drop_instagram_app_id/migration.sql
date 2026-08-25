-- appId was never used to make any Instagram Graph API request (only accessToken is) —
-- confirmed unused, dropping it.
ALTER TABLE "instagram_accounts" DROP COLUMN "appId";
