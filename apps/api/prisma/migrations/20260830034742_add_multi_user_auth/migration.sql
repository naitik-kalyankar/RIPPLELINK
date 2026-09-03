-- Multi-user auth: adds userId (Supabase auth.users.id) to every owned table, a profiles
-- table mirroring auth.users, and Row Level Security as defense-in-depth alongside apps/api's
-- own userId-scoped queries (the primary enforcement — see lib/auth.ts / every routes/*.ts
-- file). Intended for a FRESH Supabase Postgres database — running this against a database
-- that already has rows in these tables will fail on the NOT NULL columns below; existing data
-- must be migrated separately (see scripts/migrate-local-data-to-supabase.ts) before or instead
-- of applying this migration to it.

-- DropIndex
DROP INDEX "clipping_bounties_name_key";

-- DropIndex
DROP INDEX "creator_aliases_detectedIdentifier_key";

-- DropIndex
DROP INDEX "creators_detectedIdentifier_key";

-- AlterTable
ALTER TABLE "activity_logs" ADD COLUMN     "userId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "clipping_accounts" ADD COLUMN     "userId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "clipping_bounties" ADD COLUMN     "userId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "clipping_submissions" ADD COLUMN     "userId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "creator_aliases" ADD COLUMN     "userId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "creators" ADD COLUMN     "userId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "instagram_accounts" ADD COLUMN     "userId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "reels" ADD COLUMN     "userId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "submission_attempts" ADD COLUMN     "userId" UUID NOT NULL;

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionTier" TEXT,
    "subscriptionStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_logs_userId_idx" ON "activity_logs"("userId");

-- CreateIndex
CREATE INDEX "clipping_accounts_userId_idx" ON "clipping_accounts"("userId");

-- CreateIndex
CREATE INDEX "clipping_bounties_userId_idx" ON "clipping_bounties"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "clipping_bounties_userId_name_key" ON "clipping_bounties"("userId", "name");

-- CreateIndex
CREATE INDEX "clipping_submissions_userId_idx" ON "clipping_submissions"("userId");

-- CreateIndex
CREATE INDEX "creator_aliases_userId_idx" ON "creator_aliases"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "creator_aliases_userId_detectedIdentifier_key" ON "creator_aliases"("userId", "detectedIdentifier");

-- CreateIndex
CREATE INDEX "creators_userId_idx" ON "creators"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "creators_userId_detectedIdentifier_key" ON "creators"("userId", "detectedIdentifier");

-- CreateIndex
CREATE INDEX "instagram_accounts_userId_idx" ON "instagram_accounts"("userId");

-- CreateIndex
CREATE INDEX "reels_userId_idx" ON "reels"("userId");

-- CreateIndex
CREATE INDEX "submission_attempts_userId_idx" ON "submission_attempts"("userId");


-- ============================================================================
-- Foreign keys to auth.users — not expressed in schema.prisma (Prisma doesn't
-- manage Supabase's auth schema), added here by hand instead.
-- ============================================================================

ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey"
  FOREIGN KEY ("id") REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "clipping_accounts" ADD CONSTRAINT "clipping_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "clipping_bounties" ADD CONSTRAINT "clipping_bounties_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "clipping_submissions" ADD CONSTRAINT "clipping_submissions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "creator_aliases" ADD CONSTRAINT "creator_aliases_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "creators" ADD CONSTRAINT "creators_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "reels" ADD CONSTRAINT "reels_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "submission_attempts" ADD CONSTRAINT "submission_attempts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;


-- ============================================================================
-- profiles: auto-created on signup (standard Supabase pattern) so app code never
-- has to create this row itself.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, "updatedAt")
  VALUES (new.id, new.email, now());
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- Row Level Security — defense-in-depth. apps/api's own Prisma connection uses a
-- trusted role and scopes every query by userId itself (the primary enforcement);
-- these policies protect against a direct call to Supabase's public REST/GraphQL
-- endpoint using a user's own anon-key + JWT, which would otherwise bypass
-- apps/api entirely.
-- ============================================================================

-- SECURITY DEFINER + a fixed search_path so this can't be tricked by a caller-
-- controlled search_path, and so profiles' own RLS policies (below) don't
-- recurse into themselves when checking is_admin.
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT COALESCE((SELECT "isAdmin" FROM public.profiles WHERE id = auth.uid()), false);
$$;

-- profiles
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON "profiles" FOR SELECT
  USING (auth.uid() = id OR public.current_user_is_admin());
CREATE POLICY "profiles_update_own" ON "profiles" FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- No insert/delete policy: profiles rows are only ever created by the
-- on_auth_user_created trigger and never deleted directly by a user.

-- Every owned table below: same four policies, same shape. Admin gets read
-- access only (see current_user_is_admin) — never write access to another
-- user's data, matching "do not weaken normal user security."
CREATE POLICY "instagram_accounts_select" ON "instagram_accounts" FOR SELECT
  USING (auth.uid() = "userId" OR public.current_user_is_admin());
CREATE POLICY "instagram_accounts_insert" ON "instagram_accounts" FOR INSERT
  WITH CHECK (auth.uid() = "userId");
CREATE POLICY "instagram_accounts_update" ON "instagram_accounts" FOR UPDATE
  USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");
CREATE POLICY "instagram_accounts_delete" ON "instagram_accounts" FOR DELETE
  USING (auth.uid() = "userId");
ALTER TABLE "instagram_accounts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clipping_accounts_select" ON "clipping_accounts" FOR SELECT
  USING (auth.uid() = "userId" OR public.current_user_is_admin());
CREATE POLICY "clipping_accounts_insert" ON "clipping_accounts" FOR INSERT
  WITH CHECK (auth.uid() = "userId");
CREATE POLICY "clipping_accounts_update" ON "clipping_accounts" FOR UPDATE
  USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");
CREATE POLICY "clipping_accounts_delete" ON "clipping_accounts" FOR DELETE
  USING (auth.uid() = "userId");
ALTER TABLE "clipping_accounts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creators_select" ON "creators" FOR SELECT
  USING (auth.uid() = "userId" OR public.current_user_is_admin());
CREATE POLICY "creators_insert" ON "creators" FOR INSERT
  WITH CHECK (auth.uid() = "userId");
CREATE POLICY "creators_update" ON "creators" FOR UPDATE
  USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");
CREATE POLICY "creators_delete" ON "creators" FOR DELETE
  USING (auth.uid() = "userId");
ALTER TABLE "creators" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator_aliases_select" ON "creator_aliases" FOR SELECT
  USING (auth.uid() = "userId" OR public.current_user_is_admin());
CREATE POLICY "creator_aliases_insert" ON "creator_aliases" FOR INSERT
  WITH CHECK (auth.uid() = "userId");
CREATE POLICY "creator_aliases_update" ON "creator_aliases" FOR UPDATE
  USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");
CREATE POLICY "creator_aliases_delete" ON "creator_aliases" FOR DELETE
  USING (auth.uid() = "userId");
ALTER TABLE "creator_aliases" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reels_select" ON "reels" FOR SELECT
  USING (auth.uid() = "userId" OR public.current_user_is_admin());
CREATE POLICY "reels_insert" ON "reels" FOR INSERT
  WITH CHECK (auth.uid() = "userId");
CREATE POLICY "reels_update" ON "reels" FOR UPDATE
  USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");
CREATE POLICY "reels_delete" ON "reels" FOR DELETE
  USING (auth.uid() = "userId");
ALTER TABLE "reels" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clipping_bounties_select" ON "clipping_bounties" FOR SELECT
  USING (auth.uid() = "userId" OR public.current_user_is_admin());
CREATE POLICY "clipping_bounties_insert" ON "clipping_bounties" FOR INSERT
  WITH CHECK (auth.uid() = "userId");
CREATE POLICY "clipping_bounties_update" ON "clipping_bounties" FOR UPDATE
  USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");
CREATE POLICY "clipping_bounties_delete" ON "clipping_bounties" FOR DELETE
  USING (auth.uid() = "userId");
ALTER TABLE "clipping_bounties" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clipping_submissions_select" ON "clipping_submissions" FOR SELECT
  USING (auth.uid() = "userId" OR public.current_user_is_admin());
CREATE POLICY "clipping_submissions_insert" ON "clipping_submissions" FOR INSERT
  WITH CHECK (auth.uid() = "userId");
CREATE POLICY "clipping_submissions_update" ON "clipping_submissions" FOR UPDATE
  USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");
CREATE POLICY "clipping_submissions_delete" ON "clipping_submissions" FOR DELETE
  USING (auth.uid() = "userId");
ALTER TABLE "clipping_submissions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "submission_attempts_select" ON "submission_attempts" FOR SELECT
  USING (auth.uid() = "userId" OR public.current_user_is_admin());
CREATE POLICY "submission_attempts_insert" ON "submission_attempts" FOR INSERT
  WITH CHECK (auth.uid() = "userId");
CREATE POLICY "submission_attempts_update" ON "submission_attempts" FOR UPDATE
  USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");
CREATE POLICY "submission_attempts_delete" ON "submission_attempts" FOR DELETE
  USING (auth.uid() = "userId");
ALTER TABLE "submission_attempts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs_select" ON "activity_logs" FOR SELECT
  USING (auth.uid() = "userId" OR public.current_user_is_admin());
CREATE POLICY "activity_logs_insert" ON "activity_logs" FOR INSERT
  WITH CHECK (auth.uid() = "userId");
CREATE POLICY "activity_logs_update" ON "activity_logs" FOR UPDATE
  USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");
CREATE POLICY "activity_logs_delete" ON "activity_logs" FOR DELETE
  USING (auth.uid() = "userId");
ALTER TABLE "activity_logs" ENABLE ROW LEVEL SECURITY;
