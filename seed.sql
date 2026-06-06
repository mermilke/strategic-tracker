-- Strategic Tracker demo seed data (development/demo only).
-- Run after supabase_setup.sql. Populates a fictional team so the
-- dashboard, analytics, weekly briefing, and 1:1 views have plenty to show.
--
-- Everyone here is invented. All emails are @example.com.
-- Demo password for every account: demo1234
--
-- Part A creates the login accounts. It writes to auth.users directly,
-- which works on hosted Supabase but can be sensitive to auth-schema
-- changes between versions. If Part A errors, create the accounts
-- instead via Supabase Dashboard, Authentication, Add user (use the
-- same emails), then run Part B on its own. It matches users by email.

-- Part A: demo accounts.
INSERT INTO auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change_token_new, email_change)
SELECT
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
  'authenticated', d.email, crypt('demo1234', gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('full_name', d.full_name, 'role', d.role),
  '', '', '', ''
FROM (VALUES
  ('jordan.hayes@example.com',   'Jordan Hayes',   'ceo'),
  ('morgan.reed@example.com',    'Morgan Reed',    'admin'),
  ('dana.whitfield@example.com', 'Dana Whitfield', 'direct_report'),
  ('priya.nair@example.com',     'Priya Nair',     'direct_report'),
  ('mateo.alvarez@example.com',  'Mateo Alvarez',  'direct_report'),
  ('sofia.costa@example.com',    'Sofia Costa',    'direct_report'),
  ('noah.kim@example.com',       'Noah Kim',       'direct_report')
) AS d(email, full_name, role)
ON CONFLICT (email) DO NOTHING;

-- The on_auth_user_created trigger creates the matching public.users rows.
-- Give each direct report a timezone so reminders fire at 4pm local.
UPDATE users SET timezone = 'America/Chicago'    WHERE email IN ('jordan.hayes@example.com', 'morgan.reed@example.com', 'dana.whitfield@example.com');
UPDATE users SET timezone = 'Asia/Kolkata'       WHERE email = 'priya.nair@example.com';
UPDATE users SET timezone = 'America/Mexico_City' WHERE email = 'mateo.alvarez@example.com';
UPDATE users SET timezone = 'Europe/Berlin'      WHERE email = 'sofia.costa@example.com';
UPDATE users SET timezone = 'Asia/Singapore'     WHERE email = 'noah.kim@example.com';

-- Part B: objectives, sub-objectives, check-ins, opportunities, and 1:1 notes.
-- Matches users by email, so it also works if you created the accounts by hand.
-- Five weeks of history (wk0 = current Monday) give the charts something to plot.
DO $$
DECLARE
  wk0 date := date_trunc('week', now())::date;
  wk1 date := wk0 - 7;
  wk2 date := wk0 - 14;
  wk3 date := wk0 - 21;
  wk4 date := wk0 - 28;
  ceo uuid;
  u uuid;
  obj uuid;
  sub uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'dana.whitfield@example.com') THEN
    RAISE NOTICE 'Demo accounts not found, create them first, then re-run Part B.';
    RETURN;
  END IF;

  SELECT id INTO ceo FROM users WHERE email = 'jordan.hayes@example.com';

  -- Wipe any previous demo content so the seed can be re-run safely.
  DELETE FROM meeting_notes WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@example.com');
  DELETE FROM strategic_objectives WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@example.com');

  -- Dana Whitfield, Product
  SELECT id INTO u FROM users WHERE email = 'dana.whitfield@example.com';

  INSERT INTO strategic_objectives (owner_id, title, short_title, sort_order, is_active, target_date)
  VALUES (u, 'Launch the EU self-serve onboarding flow', 'EU onboarding', 1, true, wk0 + 35) RETURNING id INTO obj;

  INSERT INTO sub_objectives (objective_id, title, short_title, sort_order, is_active)
  VALUES (obj, 'Ship the guided setup wizard', 'Setup wizard', 1, true) RETURNING id INTO sub;
  INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status, progress_this_week, comments) VALUES
    (sub, u, wk4, 'not_started', 'No',  'Scoping with design.'),
    (sub, u, wk3, 'on_track',    'Yes', 'Wireframes signed off.'),
    (sub, u, wk2, 'on_track',    'Yes', 'First two steps built.'),
    (sub, u, wk1, 'at_risk',     'Yes', 'Held up waiting on design QA.'),
    (sub, u, wk0, 'on_track',    'Yes', 'Unblocked, build underway.');

  INSERT INTO sub_objectives (objective_id, title, short_title, sort_order, is_active)
  VALUES (obj, 'Localize billing for EUR', 'EUR billing', 2, true) RETURNING id INTO sub;
  INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status, progress_this_week, support_needed, comments) VALUES
    (sub, u, wk2, 'on_hold',  'No',  NULL, 'Blocked on a payments-vendor decision.'),
    (sub, u, wk1, 'on_hold',  'No',  NULL, 'Same blocker as last week.'),
    (sub, u, wk0, 'at_risk',  'No',  'Need a vendor pick by Friday to stay on date.', 'Escalating the vendor choice.');

  INSERT INTO strategic_objectives (owner_id, title, short_title, sort_order, is_active)
  VALUES (u, 'Cut activation drop-off to under 30%', 'Activation', 2, true) RETURNING id INTO obj;
  INSERT INTO sub_objectives (objective_id, title, short_title, sort_order, is_active)
  VALUES (obj, 'Instrument the activation funnel', 'Funnel events', 1, true) RETURNING id INTO sub;
  INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status, progress_this_week, discuss_in_meeting, comments) VALUES
    (sub, u, wk1, 'on_track',  'Yes', false, 'Events landing in the warehouse.'),
    (sub, u, wk0, 'completed', 'Yes', true,  'Dashboard live; baseline is 41%.');

  -- Priya Nair, Engineering
  SELECT id INTO u FROM users WHERE email = 'priya.nair@example.com';

  INSERT INTO strategic_objectives (owner_id, title, short_title, sort_order, is_active, target_date)
  VALUES (u, 'Cut p95 API latency below 200ms', 'API latency', 1, true, wk0 + 14) RETURNING id INTO obj;
  INSERT INTO sub_objectives (objective_id, title, short_title, sort_order, is_active)
  VALUES (obj, 'Add read replicas for reporting queries', 'Read replicas', 1, true) RETURNING id INTO sub;
  INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status, progress_this_week, comments) VALUES
    (sub, u, wk3, 'on_track',  'Yes', 'Replica provisioned in staging.'),
    (sub, u, wk2, 'on_track',  'Yes', 'Cut p95 from 480ms to 320ms.'),
    (sub, u, wk1, 'on_track',  'Yes', 'Down to 260ms after index work.'),
    (sub, u, wk0, 'completed', 'Yes', 'Live in production, p95 at 180ms.');
  INSERT INTO sub_objectives (objective_id, title, short_title, sort_order, is_active)
  VALUES (obj, 'Cache the dashboard aggregate endpoints', 'Cache aggregates', 2, true) RETURNING id INTO sub;
  INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status, progress_this_week, discuss_in_meeting, comments) VALUES
    (sub, u, wk0, 'not_started', 'No', true, 'Starts once the replica work lands.');

  INSERT INTO strategic_objectives (owner_id, title, short_title, sort_order, is_active)
  VALUES (u, 'Adopt a typed API client across services', 'Typed client', 2, true) RETURNING id INTO obj;
  INSERT INTO sub_objectives (objective_id, title, short_title, sort_order, is_active)
  VALUES (obj, 'Generate the client from the OpenAPI spec', 'Codegen client', 1, true) RETURNING id INTO sub;
  INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status, progress_this_week, comments) VALUES
    (sub, u, wk1, 'at_risk',  'Yes', 'Spec has gaps; auth endpoints undocumented.'),
    (sub, u, wk0, 'on_track', 'Yes', 'Filled the gaps, codegen runs in CI now.');

  -- Mateo Alvarez, Sales
  SELECT id INTO u FROM users WHERE email = 'mateo.alvarez@example.com';

  INSERT INTO strategic_objectives (owner_id, title, short_title, sort_order, is_active, opportunity_target)
  VALUES (u, 'Close 5 enterprise pilots in LATAM', 'LATAM pilots', 1, true, 5) RETURNING id INTO obj;
  INSERT INTO sub_objectives (objective_id, title, sort_order, is_active, is_implicit)
  VALUES (obj, 'Close 5 enterprise pilots in LATAM', 0, true, true) RETURNING id INTO sub;
  INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status, progress_this_week, comments) VALUES
    (sub, u, wk2, 'on_track', 'Yes', 'Two signed, two in legal.'),
    (sub, u, wk1, 'on_track', 'Yes', 'Third signed; fourth verbal.'),
    (sub, u, wk0, 'on_track', 'Yes', 'Fourth signed this week.');
  INSERT INTO objective_opportunities (objective_id, customer, project_description, segment, estimated_value_text, status, sort_order) VALUES
    (obj, 'Andes Logistics', 'Fleet routing pilot',       'Transportation', '$120k', 'Signed', 1),
    (obj, 'Cafe del Sur',    'Inventory forecasting',     'Retail',         '$85k',  'Signed', 2),
    (obj, 'Patagonia Foods', 'Demand planning rollout',   'CPG',            '$210k', 'Signed', 3),
    (obj, 'Lima Health',     'Capacity planning pilot',   'Healthcare',     '$140k', 'Signed', 4);

  INSERT INTO strategic_objectives (owner_id, title, short_title, sort_order, is_active)
  VALUES (u, 'Stand up the partner reseller channel', 'Reseller channel', 2, true) RETURNING id INTO obj;
  INSERT INTO sub_objectives (objective_id, title, short_title, sort_order, is_active)
  VALUES (obj, 'Sign the first two resellers', 'First resellers', 1, true) RETURNING id INTO sub;
  INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status, progress_this_week, support_needed, comments) VALUES
    (sub, u, wk1, 'at_risk', 'No',  NULL, 'Legal turnaround on the partner agreement is slow.'),
    (sub, u, wk0, 'at_risk', 'Yes', 'A nudge to legal would help unblock the contract.', 'Still waiting on the template.');

  -- Sofia Costa, Marketing (recent week intentionally missing)
  SELECT id INTO u FROM users WHERE email = 'sofia.costa@example.com';

  INSERT INTO strategic_objectives (owner_id, title, short_title, sort_order, is_active)
  VALUES (u, 'Rebuild the demand-gen funnel', 'Demand gen', 1, true) RETURNING id INTO obj;
  INSERT INTO sub_objectives (objective_id, title, short_title, sort_order, is_active)
  VALUES (obj, 'Replatform the marketing site', 'Site replatform', 1, true) RETURNING id INTO sub;
  INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status, progress_this_week, comments) VALUES
    (sub, u, wk3, 'off_track', 'No',  'Agency missed the first milestone.'),
    (sub, u, wk2, 'off_track', 'No',  'Still behind; considering a new vendor.'),
    (sub, u, wk1, 'at_risk',   'Yes', 'New vendor onboarded, catching up.');
  -- no wk0 check-in here on purpose, so Sofia shows as a missing submission
  INSERT INTO sub_objectives (objective_id, title, short_title, sort_order, is_active)
  VALUES (obj, 'Launch the lifecycle email program', 'Lifecycle email', 2, true) RETURNING id INTO sub;
  INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status, progress_this_week, comments) VALUES
    (sub, u, wk1, 'on_track', 'Yes', 'First three flows drafted.');

  -- Noah Kim, Operations
  SELECT id INTO u FROM users WHERE email = 'noah.kim@example.com';

  INSERT INTO strategic_objectives (owner_id, title, short_title, sort_order, is_active, target_date)
  VALUES (u, 'Cut cloud spend 20% by end of quarter', 'Cloud spend', 1, true, wk0 + 49) RETURNING id INTO obj;
  INSERT INTO sub_objectives (objective_id, title, short_title, sort_order, is_active)
  VALUES (obj, 'Rightsize over-provisioned compute', 'Rightsize compute', 1, true) RETURNING id INTO sub;
  INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status, progress_this_week, comments) VALUES
    (sub, u, wk2, 'on_track', 'Yes', 'Found 30% idle in the staging fleet.'),
    (sub, u, wk1, 'on_track', 'Yes', 'Resized staging; prod next.'),
    (sub, u, wk0, 'on_track', 'Yes', 'Prod resized, 12% saved so far.');
  INSERT INTO sub_objectives (objective_id, title, short_title, sort_order, is_active)
  VALUES (obj, 'Negotiate committed-use discounts', 'Committed-use', 2, true) RETURNING id INTO sub;
  INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status, progress_this_week, support_needed, comments) VALUES
    (sub, u, wk1, 'on_hold', 'No',  NULL, 'Waiting on finance to approve a 1-year commit.'),
    (sub, u, wk0, 'at_risk', 'No',  'Need sign-off on the annual commitment.', 'Finance review pending.');

  -- A few 1:1 notes so the meeting view isn't empty.
  INSERT INTO meeting_notes (user_id, week_start, notes, updated_by) VALUES
    ((SELECT id FROM users WHERE email = 'dana.whitfield@example.com'), wk0,
     E'- EUR billing: agreed to pick the vendor by Friday.\n- Wizard demo looked good, ship to beta next week.', ceo),
    ((SELECT id FROM users WHERE email = 'dana.whitfield@example.com'), wk1,
     E'- Design QA bottleneck; Dana to pair with design on Tuesday.', ceo),
    ((SELECT id FROM users WHERE email = 'priya.nair@example.com'), wk0,
     E'- Latency goal hit early, nice.\n- Start the cache work, but timebox it.', ceo),
    ((SELECT id FROM users WHERE email = 'mateo.alvarez@example.com'), wk0,
     E'- 4 of 5 pilots signed.\n- I will ping legal about the reseller agreement.', ceo);
END $$;

-- Sign in with any address above and password: demo1234
