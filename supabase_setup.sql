-- ============================================================================
-- supabase_setup.sql
--
-- GENERATED FILE -- do not edit by hand.
-- Built from supabase/migrations/ (the source of truth) by scripts/build-schema.mjs.
-- To stand up a fresh database, paste this whole file into the Supabase SQL editor.
-- To regenerate after adding a migration: npm run build:schema
-- ============================================================================

-- >>> supabase/migrations/20260608000000_initial_schema.sql

-- Strategic Execution Platform, Supabase SQL setup.
-- Paste this entire file into Supabase > SQL Editor > Run.

-- 1. USERS TABLE (extends Supabase auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'direct_report', 'admin')),
  -- IANA timezone (e.g. 'America/Chicago'); reminder emails fire at 4pm local.
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add timezone to users if an earlier version of this schema was already run.
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- 2. STRATEGIC OBJECTIVES
CREATE TABLE IF NOT EXISTS strategic_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. SUB-OBJECTIVES
CREATE TABLE IF NOT EXISTS sub_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id UUID NOT NULL REFERENCES strategic_objectives(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. WEEKLY CHECK-INS
CREATE TABLE IF NOT EXISTS weekly_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_objective_id UUID NOT NULL REFERENCES sub_objectives(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES users(id),
  week_start DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not_started', 'on_track', 'at_risk', 'off_track', 'on_hold', 'completed')),
  progress_this_week TEXT,
  support_needed TEXT,
  comments TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(sub_objective_id, week_start)
);

-- Row level security (RLS)

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_checkins ENABLE ROW LEVEL SECURITY;

-- Helper: is the caller a manager or admin? SECURITY DEFINER so it can be used
-- inside the users policy below without the policy recursively evaluating itself
-- (a SELECT policy on users that queries users would otherwise loop).
CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('manager', 'admin')
  );
$$;

-- Users: a user reads their own row; managers and admins read the whole team
-- (the dashboard needs it). This stops one report from reading everyone else's
-- email address.
DROP POLICY IF EXISTS "users_select_all" ON users;
DROP POLICY IF EXISTS "users_select" ON users;
CREATE POLICY "users_select" ON users FOR SELECT USING (
  id = (select auth.uid()) OR (select public.is_manager_or_admin())
);

-- A user may update their own row, but the role column is guarded by the trigger
-- below so a report can't promote themselves to admin.
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users FOR UPDATE
  USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

-- Block self-service role changes. A service-role/SQL context (auth.uid() IS
-- NULL, e.g. the Supabase Table Editor) and existing managers/admins are
-- unaffected, so the documented "set a user's role in the Table Editor" flow
-- still works.
CREATE OR REPLACE FUNCTION public.enforce_user_role_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'Only an admin can change a user role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_role_guard ON public.users;
CREATE TRIGGER users_role_guard
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_user_role_guard();

-- The trigger function is never called directly; triggers fire regardless of
-- EXECUTE grants, so keep it off the exposed PostgREST RPC surface. (The helper
-- is_manager_or_admin stays callable because the users SELECT policy evaluates
-- it as the querying role; it only ever returns the caller's own role flag.)
REVOKE EXECUTE ON FUNCTION public.enforce_user_role_guard() FROM PUBLIC, anon, authenticated;

-- Objectives: manager/admin can see all; direct reports see their own
CREATE POLICY "objectives_select" ON strategic_objectives FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
  OR owner_id = (select auth.uid())
);
CREATE POLICY "objectives_insert_admin" ON strategic_objectives FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
);
CREATE POLICY "objectives_update_admin" ON strategic_objectives FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
);
CREATE POLICY "objectives_delete_admin" ON strategic_objectives FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
);

-- Sub-objectives: same pattern
CREATE POLICY "subs_select" ON sub_objectives FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
  OR EXISTS (
    SELECT 1 FROM strategic_objectives o
    WHERE o.id = objective_id AND o.owner_id = (select auth.uid())
  )
);
CREATE POLICY "subs_insert_admin" ON sub_objectives FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
);
CREATE POLICY "subs_update_admin" ON sub_objectives FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
);
CREATE POLICY "subs_delete_admin" ON sub_objectives FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
);

-- Check-ins: manager sees all; direct reports see/edit their own.
-- Insert must be self-submitted AND against a sub-objective the user owns
-- (or the user is an admin), so a report can't write onto someone else's goal.
CREATE POLICY "checkins_select" ON weekly_checkins FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
  OR submitted_by = (select auth.uid())
);
CREATE POLICY "checkins_insert_own" ON weekly_checkins FOR INSERT WITH CHECK (
  submitted_by = (select auth.uid())
  AND (
    EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
    OR EXISTS (
      SELECT 1 FROM sub_objectives s
      JOIN strategic_objectives o ON o.id = s.objective_id
      WHERE s.id = sub_objective_id AND o.owner_id = (select auth.uid())
    )
  )
);
CREATE POLICY "checkins_update_own" ON weekly_checkins FOR UPDATE USING (submitted_by = (select auth.uid()));

-- Trigger: auto-create user profile on signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'direct_report')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Pending users: people added before they have accounts.
-- Run this if you already ran the original setup.
CREATE TABLE IF NOT EXISTS pending_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE pending_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pending_admin_only" ON pending_users FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
);

-- Add sort_order to strategic_objectives if not present
ALTER TABLE strategic_objectives ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add short_title to sub_objectives (abbreviated name for dashboard tiles)
ALTER TABLE sub_objectives ADD COLUMN IF NOT EXISTS short_title TEXT;

-- Add short_title to strategic_objectives (abbreviated name for dashboard tiles)
ALTER TABLE strategic_objectives ADD COLUMN IF NOT EXISTS short_title TEXT;

-- Add discuss_in_meeting flag to weekly_checkins
ALTER TABLE weekly_checkins ADD COLUMN IF NOT EXISTS discuss_in_meeting BOOLEAN DEFAULT FALSE;

-- Pending objectives: objectives assigned before a user signs up.
-- Run this if you already ran the original setup.
CREATE TABLE IF NOT EXISTS pending_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pending_sub_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_objective_id UUID NOT NULL REFERENCES pending_objectives(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE pending_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_sub_objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_obj_admin_only" ON pending_objectives FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
);
CREATE POLICY "pending_sub_admin_only" ON pending_sub_objectives FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
);

-- Updated trigger: auto-create user profile and migrate pending objectives.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_pending_obj RECORD;
  v_new_obj_id UUID;
BEGIN
  -- 1. Create the users record (existing behavior)
  INSERT INTO public.users (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'direct_report')
  );

  -- 2. Migrate pending objectives for this email
  FOR v_pending_obj IN
    SELECT * FROM pending_objectives WHERE lower(pending_user_email) = lower(NEW.email)
  LOOP
    INSERT INTO strategic_objectives (owner_id, title, description, target_date, is_active, sort_order, created_at)
    VALUES (NEW.id, v_pending_obj.title, v_pending_obj.description, v_pending_obj.target_date, true, v_pending_obj.sort_order, v_pending_obj.created_at)
    RETURNING id INTO v_new_obj_id;

    INSERT INTO sub_objectives (objective_id, title, sort_order, is_active, created_at)
    SELECT v_new_obj_id, ps.title, ps.sort_order, true, ps.created_at
    FROM pending_sub_objectives ps
    WHERE ps.pending_objective_id = v_pending_obj.id;

    DELETE FROM pending_sub_objectives WHERE pending_objective_id = v_pending_obj.id;
  END LOOP;

  -- 3. Clean up pending records
  DELETE FROM pending_objectives WHERE lower(pending_user_email) = lower(NEW.email);
  DELETE FROM pending_users WHERE lower(email) = lower(NEW.email);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 1:1 meeting notes (collaborative, real-time).
CREATE TABLE IF NOT EXISTS meeting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  UNIQUE(user_id, week_start)
);

ALTER TABLE meeting_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_notes_select" ON meeting_notes FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
  OR user_id = (select auth.uid())
);
CREATE POLICY "meeting_notes_insert" ON meeting_notes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
  OR user_id = (select auth.uid())
);
CREATE POLICY "meeting_notes_update" ON meeting_notes FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
  OR user_id = (select auth.uid())
);

-- Meeting attachments: files and links for 1:1 meetings.
CREATE TABLE IF NOT EXISTS meeting_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('file', 'link')),
  file_path TEXT,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE meeting_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_select" ON meeting_attachments FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
  OR user_id = (select auth.uid())
);
CREATE POLICY "attachments_insert_own" ON meeting_attachments FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "attachments_update_own" ON meeting_attachments FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "attachments_delete_own" ON meeting_attachments FOR DELETE USING (user_id = (select auth.uid()));

-- Storage bucket for meeting files (run in Supabase Dashboard > Storage > New Bucket)
-- Name: meeting-files, Public: false, File size limit: 10MB
-- Or run: INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('meeting-files', 'meeting-files', false, 10485760);

-- Storage policies (run in SQL Editor):
-- CREATE POLICY "meeting_files_upload" ON storage.objects FOR INSERT WITH CHECK (
--   bucket_id = 'meeting-files' AND auth.role() = 'authenticated'
--   AND (storage.foldername(name))[1] = auth.uid()::text
-- );
-- CREATE POLICY "meeting_files_select" ON storage.objects FOR SELECT USING (
--   bucket_id = 'meeting-files' AND (
--     (storage.foldername(name))[1] = auth.uid()::text
--     OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('manager', 'admin'))
--   )
-- );
-- CREATE POLICY "meeting_files_delete" ON storage.objects FOR DELETE USING (
--   bucket_id = 'meeting-files' AND (storage.foldername(name))[1] = auth.uid()::text
-- );

-- 8. Bug reports table.
CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page TEXT NOT NULL,
  description TEXT NOT NULL,
  screenshot_path TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Users can insert their own bug reports
CREATE POLICY "bug_reports_insert_own" ON bug_reports
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- Users can read their own bug reports
CREATE POLICY "bug_reports_select_own" ON bug_reports
  FOR SELECT USING (user_id = (select auth.uid()));

-- manager/admin can read all bug reports
CREATE POLICY "bug_reports_select_admin" ON bug_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
  );

-- manager/admin can update bug report status
CREATE POLICY "bug_reports_update_admin" ON bug_reports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
  );

-- 9. Microsoft tokens table, for OAuth calendar/OneNote integration.
CREATE TABLE IF NOT EXISTS microsoft_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE microsoft_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role should access this table (server-side API routes)
-- No client-side RLS policies needed; tokens are managed server-side only

-- 10. Reminder log table, prevents duplicate email sends.
CREATE TABLE IF NOT EXISTS reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  email_type TEXT NOT NULL DEFAULT 'reminder',
  meeting_subject TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;

-- Only service role should access this table (server-side cron only)

-- Bug screenshot storage policies (create bucket 'bug-screenshots' in Dashboard first, private, 5MB limit)
-- CREATE POLICY "bug_screenshots_insert" ON storage.objects FOR INSERT WITH CHECK (
--   bucket_id = 'bug-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text
-- );
-- CREATE POLICY "bug_screenshots_select" ON storage.objects FOR SELECT USING (
--   bucket_id = 'bug-screenshots' AND (
--     (storage.foldername(name))[1] = auth.uid()::text
--     OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('manager', 'admin'))
--   )
-- );
-- CREATE POLICY "bug_screenshots_delete" ON storage.objects FOR DELETE USING (
--   bucket_id = 'bug-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Opportunity-tracking objectives, e.g. "land 6 proof-of-concept trials", "7 programs >$500k".
-- opportunity_target NULL = standard objective; >0 = progress is (#rows / target)
ALTER TABLE strategic_objectives ADD COLUMN IF NOT EXISTS opportunity_target INTEGER;

-- Implicit sub-objective = auto-created so an objective with no real sub-objectives
-- still gets the normal weekly check-in line. The UI hides its title.
ALTER TABLE sub_objectives ADD COLUMN IF NOT EXISTS is_implicit BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS objective_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id UUID NOT NULL REFERENCES strategic_objectives(id) ON DELETE CASCADE,
  customer TEXT,
  project_description TEXT,
  segment TEXT,
  estimated_value_text TEXT,
  estimated_value_number NUMERIC,
  status TEXT DEFAULT 'Completed',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_objective_opportunities_obj ON objective_opportunities(objective_id);

ALTER TABLE objective_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opp_select" ON objective_opportunities FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager','admin'))
  OR EXISTS (SELECT 1 FROM strategic_objectives o WHERE o.id = objective_id AND o.owner_id = (select auth.uid()))
);
CREATE POLICY "opp_insert" ON objective_opportunities FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager','admin'))
  OR EXISTS (SELECT 1 FROM strategic_objectives o WHERE o.id = objective_id AND o.owner_id = (select auth.uid()))
);
CREATE POLICY "opp_update" ON objective_opportunities FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager','admin'))
  OR EXISTS (SELECT 1 FROM strategic_objectives o WHERE o.id = objective_id AND o.owner_id = (select auth.uid()))
);
CREATE POLICY "opp_delete" ON objective_opportunities FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager','admin'))
  OR EXISTS (SELECT 1 FROM strategic_objectives o WHERE o.id = objective_id AND o.owner_id = (select auth.uid()))
);

-- Backfill: one implicit sub for every active objective with no active sub-objectives
INSERT INTO sub_objectives (objective_id, title, sort_order, is_active, is_implicit)
SELECT o.id, o.title, 0, true, true
FROM strategic_objectives o
WHERE o.is_active = true
  AND NOT EXISTS (SELECT 1 FROM sub_objectives s WHERE s.objective_id = o.id AND s.is_active = true);

-- Smartsheet snapshots: per-week capture of Other Topics for historical views.
CREATE TABLE IF NOT EXISTS smartsheet_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  external_id TEXT NOT NULL,
  topic TEXT,
  description TEXT,
  status TEXT,
  previous_status TEXT,
  latest_update TIMESTAMPTZ,
  snapshot_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, week_start, external_id)
);

CREATE INDEX IF NOT EXISTS idx_smartsheet_snapshots_user_week ON smartsheet_snapshots(user_id, week_start);

ALTER TABLE smartsheet_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "smartsheet_select" ON smartsheet_snapshots FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
  OR user_id = (select auth.uid())
);
CREATE POLICY "smartsheet_insert" ON smartsheet_snapshots FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
  OR user_id = (select auth.uid())
);
CREATE POLICY "smartsheet_update" ON smartsheet_snapshots FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
  OR user_id = (select auth.uid())
);

-- AI weekly briefings: one cached, generated briefing per week.
-- Written server-side via the service role; cost/usage stored for accounting.
CREATE TABLE IF NOT EXISTS ai_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL UNIQUE,
  content JSONB NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_tokens INTEGER,
  cost_cents INTEGER,
  latency_ms INTEGER,
  generated_by UUID REFERENCES users(id),
  generated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_briefings ENABLE ROW LEVEL SECURITY;

-- manager/admin may read briefings directly; the API route writes via service role.
CREATE POLICY "briefings_select" ON ai_briefings FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = (select auth.uid()) AND role IN ('manager', 'admin'))
);

-- Indexes on the foreign keys and hot query paths. Postgres does not index FKs
-- automatically, and every dashboard load filters on these columns.
CREATE INDEX IF NOT EXISTS idx_objectives_owner ON strategic_objectives(owner_id);
CREATE INDEX IF NOT EXISTS idx_sub_objectives_obj ON sub_objectives(objective_id);
CREATE INDEX IF NOT EXISTS idx_checkins_submitted_by ON weekly_checkins(submitted_by);
CREATE INDEX IF NOT EXISTS idx_meeting_attachments_user_week ON meeting_attachments(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_reminder_log_user_sent ON reminder_log(user_id, sent_at);

-- >>> supabase/migrations/20260609000000_checkins_submitted_by_cascade.sql

-- weekly_checkins.submitted_by referenced users(id) with no ON DELETE action,
-- so deleting a user who had submitted a check-in failed the foreign key. Every
-- other users(id) reference in the schema cascades; bring this one in line.
ALTER TABLE weekly_checkins
  DROP CONSTRAINT IF EXISTS weekly_checkins_submitted_by_fkey;

ALTER TABLE weekly_checkins
  ADD CONSTRAINT weekly_checkins_submitted_by_fkey
    FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE;

-- >>> supabase/migrations/20260609000001_handle_new_user_revoke_execute.sql

-- handle_new_user is a trigger function (fires on auth.users insert regardless
-- of EXECUTE grants), so it never needs to be callable directly. Revoke EXECUTE
-- to keep it off the exposed PostgREST RPC surface, matching enforce_user_role_guard.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
