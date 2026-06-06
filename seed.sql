-- Strategic Tracker demo seed data (development/demo only).
-- Run after supabase_setup.sql. Builds a fictional 8-person org with several
-- weeks of history so the dashboard, analytics, briefing, and 1:1 views are full.
--
-- Everyone here is invented. All emails are @example.com.
-- Demo password for every account: demo1234
--
-- Part A creates the login accounts (writes to auth.users directly, which works
-- on hosted Supabase). If Part A errors on your version, create the accounts via
-- Supabase Dashboard, Authentication, Add user with the same emails, then run
-- Part B on its own. It matches users by email.

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
  ('noah.kim@example.com',       'Noah Kim',       'direct_report'),
  ('aisha.khan@example.com',     'Aisha Khan',     'direct_report'),
  ('liam.obrien@example.com',    'Liam O''Brien',  'direct_report'),
  ('yuki.tanaka@example.com',    'Yuki Tanaka',    'direct_report')
) AS d(email, full_name, role)
ON CONFLICT (email) DO NOTHING;

UPDATE users SET timezone = 'America/Chicago'    WHERE email IN ('jordan.hayes@example.com', 'morgan.reed@example.com', 'dana.whitfield@example.com');
UPDATE users SET timezone = 'Asia/Kolkata'       WHERE email = 'priya.nair@example.com';
UPDATE users SET timezone = 'America/Mexico_City' WHERE email = 'mateo.alvarez@example.com';
UPDATE users SET timezone = 'Europe/Berlin'      WHERE email = 'sofia.costa@example.com';
UPDATE users SET timezone = 'Asia/Singapore'     WHERE email = 'noah.kim@example.com';
UPDATE users SET timezone = 'Europe/London'      WHERE email = 'aisha.khan@example.com';
UPDATE users SET timezone = 'America/New_York'   WHERE email = 'liam.obrien@example.com';
UPDATE users SET timezone = 'Asia/Tokyo'         WHERE email = 'yuki.tanaka@example.com';

-- Part B: objectives, sub-objectives, and check-ins.
-- Two helpers keep this readable: _seed_obj creates an objective and returns its
-- id; _seed_sub creates a sub-objective plus a run of weekly check-ins. The
-- status array runs oldest to newest and ends on the current week, so a
-- three-element array fills the last three weeks.
CREATE OR REPLACE FUNCTION _seed_obj(p_owner uuid, p_title text, p_short text, p_sort int, p_opp int DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO strategic_objectives (owner_id, title, short_title, sort_order, is_active, opportunity_target)
  VALUES (p_owner, p_title, p_short, p_sort, true, p_opp)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION _seed_sub(p_obj uuid, p_owner uuid, p_title text, p_short text, p_sort int,
                                     p_statuses text[], p_comment text DEFAULT NULL,
                                     p_support text DEFAULT NULL, p_discuss boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_sub uuid;
  v_wk0 date := date_trunc('week', now())::date;
  n int := array_length(p_statuses, 1);
  i int;
BEGIN
  INSERT INTO sub_objectives (objective_id, title, short_title, sort_order, is_active)
  VALUES (p_obj, p_title, p_short, p_sort, true) RETURNING id INTO v_sub;
  FOR i IN 1..n LOOP
    INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status,
                                 progress_this_week, comments, support_needed, discuss_in_meeting)
    VALUES (
      v_sub, p_owner, v_wk0 - (n - i) * 7, p_statuses[i],
      CASE WHEN p_statuses[i] IN ('on_track','at_risk','completed') THEN 'Yes' ELSE 'No' END,
      CASE WHEN i = n THEN p_comment ELSE NULL END,
      CASE WHEN i = n THEN p_support ELSE NULL END,
      CASE WHEN i = n THEN p_discuss ELSE false END
    );
  END LOOP;
END $$;

DO $$
DECLARE
  ceo uuid;
  u uuid;
  o uuid;
  s uuid;
  wk0 date := date_trunc('week', now())::date;
  wk1 date := wk0 - 7;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'dana.whitfield@example.com') THEN
    RAISE NOTICE 'Demo accounts not found, create them first, then re-run Part B.';
    RETURN;
  END IF;

  SELECT id INTO ceo FROM users WHERE email = 'jordan.hayes@example.com';
  DELETE FROM meeting_notes WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@example.com');
  DELETE FROM strategic_objectives WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@example.com');

  -- Dana Whitfield, Product
  SELECT id INTO u FROM users WHERE email = 'dana.whitfield@example.com';
  o := _seed_obj(u, 'Launch the EU self-serve onboarding flow', 'EU onboarding', 1);
  PERFORM _seed_sub(o, u, 'Ship the guided setup wizard', 'Setup wizard', 1,
                    ARRAY['not_started','on_track','on_track','at_risk','on_track'], 'Unblocked, build underway.');
  PERFORM _seed_sub(o, u, 'Localize billing for EUR', 'EUR billing', 2,
                    ARRAY['on_hold','on_hold','at_risk'], 'Need a vendor pick by Friday.', 'Decision on the payments vendor.');
  o := _seed_obj(u, 'Cut activation drop-off below 30%', 'Activation', 2);
  PERFORM _seed_sub(o, u, 'Instrument the activation funnel', 'Funnel events', 1,
                    ARRAY['on_track','completed'], 'Dashboard live, baseline is 41%.', NULL, true);
  PERFORM _seed_sub(o, u, 'Redesign the empty states', 'Empty states', 2,
                    ARRAY['not_started','on_track'], 'First pass in design review.');
  o := _seed_obj(u, 'Ship the mobile app beta', 'Mobile beta', 3);
  PERFORM _seed_sub(o, u, 'Get the iOS build into TestFlight', 'TestFlight', 1,
                    ARRAY['on_track','on_track','at_risk'], 'Apple review kicked it back once.');
  PERFORM _seed_sub(o, u, 'Wire up push notifications', 'Push notifs', 2,
                    ARRAY['not_started','not_started'], 'Starts after TestFlight.');

  -- Priya Nair, Engineering
  SELECT id INTO u FROM users WHERE email = 'priya.nair@example.com';
  o := _seed_obj(u, 'Cut p95 API latency below 200ms', 'API latency', 1);
  PERFORM _seed_sub(o, u, 'Add read replicas for reporting queries', 'Read replicas', 1,
                    ARRAY['on_track','on_track','on_track','completed'], 'Live in production, p95 at 180ms.');
  PERFORM _seed_sub(o, u, 'Cache the dashboard aggregate endpoints', 'Cache aggregates', 2,
                    ARRAY['not_started'], 'Starts once the replica work lands.', NULL, true);
  o := _seed_obj(u, 'Adopt a typed API client across services', 'Typed client', 2);
  PERFORM _seed_sub(o, u, 'Generate the client from the OpenAPI spec', 'Codegen client', 1,
                    ARRAY['at_risk','on_track'], 'Codegen runs in CI now.');
  PERFORM _seed_sub(o, u, 'Migrate the first three services', 'Migrate 3 svcs', 2,
                    ARRAY['not_started','on_track'], 'Billing service migrated first.');
  o := _seed_obj(u, 'Get CI under 8 minutes', 'Fast CI', 3);
  PERFORM _seed_sub(o, u, 'Parallelize the test suite', 'Parallel tests', 1,
                    ARRAY['on_track','on_track'], 'Down from 19 to 11 minutes.');
  PERFORM _seed_sub(o, u, 'Cache Docker layers in the pipeline', 'Layer cache', 2,
                    ARRAY['on_hold','on_hold'], 'Waiting on the runner upgrade.');

  -- Mateo Alvarez, Sales (one objective is opportunity-tracked)
  SELECT id INTO u FROM users WHERE email = 'mateo.alvarez@example.com';
  o := _seed_obj(u, 'Close 5 enterprise pilots in LATAM', 'LATAM pilots', 1, 5);
  INSERT INTO sub_objectives (objective_id, title, sort_order, is_active, is_implicit)
  VALUES (o, 'Close 5 enterprise pilots in LATAM', 0, true, true) RETURNING id INTO s;
  INSERT INTO weekly_checkins (sub_objective_id, submitted_by, week_start, status, progress_this_week, comments) VALUES
    (s, u, wk1, 'on_track', 'Yes', 'Third signed; fourth verbal.'),
    (s, u, wk0, 'on_track', 'Yes', 'Fourth signed this week.');
  INSERT INTO objective_opportunities (objective_id, customer, project_description, segment, estimated_value_text, status, sort_order) VALUES
    (o, 'Andes Logistics', 'Fleet routing pilot',     'Transportation', '$120k', 'Signed', 1),
    (o, 'Cafe del Sur',    'Inventory forecasting',   'Retail',         '$85k',  'Signed', 2),
    (o, 'Patagonia Foods', 'Demand planning rollout', 'CPG',            '$210k', 'Signed', 3),
    (o, 'Lima Health',     'Capacity planning pilot', 'Healthcare',     '$140k', 'Signed', 4);
  o := _seed_obj(u, 'Stand up the partner reseller channel', 'Reseller channel', 2);
  PERFORM _seed_sub(o, u, 'Sign the first two resellers', 'First resellers', 1,
                    ARRAY['at_risk','at_risk'], 'A nudge to legal would unblock the contract.', 'Legal review of the partner agreement.');
  PERFORM _seed_sub(o, u, 'Build the partner portal', 'Partner portal', 2,
                    ARRAY['not_started','on_track'], 'Scoped with product.');
  o := _seed_obj(u, 'Lift the new-logo win rate to 25%', 'Win rate', 3);
  PERFORM _seed_sub(o, u, 'Refresh the pitch deck', 'Pitch deck', 1,
                    ARRAY['on_track','completed'], 'New deck shipped to the team.');
  PERFORM _seed_sub(o, u, 'Write competitive battlecards', 'Battlecards', 2,
                    ARRAY['on_track','on_track'], 'Three of five competitors covered.');

  -- Sofia Costa, Marketing (recent week intentionally missing on one item)
  SELECT id INTO u FROM users WHERE email = 'sofia.costa@example.com';
  o := _seed_obj(u, 'Rebuild the demand-gen funnel', 'Demand gen', 1);
  PERFORM _seed_sub(o, u, 'Replatform the marketing site', 'Site replatform', 1,
                    ARRAY['off_track','off_track','at_risk'], 'New vendor onboarded, catching up.');
  PERFORM _seed_sub(o, u, 'Launch the lifecycle email program', 'Lifecycle email', 2,
                    ARRAY['on_track','on_track'], 'First three flows live.');
  o := _seed_obj(u, 'Launch the customer story program', 'Customer stories', 2);
  PERFORM _seed_sub(o, u, 'Publish three case studies', 'Case studies', 1,
                    ARRAY['on_track','on_track'], 'Two published, third in review.');
  PERFORM _seed_sub(o, u, 'Produce a video testimonial', 'Video story', 2,
                    ARRAY['not_started','on_hold'], 'Customer scheduling is slow.');
  o := _seed_obj(u, 'Grow organic traffic 40%', 'Organic growth', 3);
  PERFORM _seed_sub(o, u, 'Run a technical SEO audit', 'SEO audit', 1,
                    ARRAY['on_track','completed'], 'Audit done, 30 fixes filed.');
  PERFORM _seed_sub(o, u, 'Stand up a content calendar', 'Content calendar', 2,
                    ARRAY['on_track','on_track'], 'Booked out two months ahead.');

  -- Noah Kim, Operations
  SELECT id INTO u FROM users WHERE email = 'noah.kim@example.com';
  o := _seed_obj(u, 'Cut cloud spend 20% by end of quarter', 'Cloud spend', 1);
  PERFORM _seed_sub(o, u, 'Rightsize over-provisioned compute', 'Rightsize compute', 1,
                    ARRAY['on_track','on_track','on_track'], 'Prod resized, 12% saved so far.');
  PERFORM _seed_sub(o, u, 'Negotiate committed-use discounts', 'Committed-use', 2,
                    ARRAY['on_hold','at_risk'], 'Need sign-off on the annual commitment.', 'Finance approval on a 1-year commit.');
  o := _seed_obj(u, 'Reach SOC 2 Type II readiness', 'SOC 2', 2);
  PERFORM _seed_sub(o, u, 'Finalize the security policies', 'Policies', 1,
                    ARRAY['on_track','on_track'], 'Eight of twelve policies approved.');
  PERFORM _seed_sub(o, u, 'Automate evidence collection', 'Evidence', 2,
                    ARRAY['not_started','on_track'], 'Connected the first three systems.');
  o := _seed_obj(u, 'Cut new-hire setup time in half', 'Onboarding ops', 3);
  PERFORM _seed_sub(o, u, 'Write the IT provisioning playbook', 'IT playbook', 1,
                    ARRAY['on_track','completed'], 'Playbook published.');
  PERFORM _seed_sub(o, u, 'Automate account access grants', 'Access automation', 2,
                    ARRAY['not_started','on_track'], 'SSO groups mapped.');

  -- Aisha Khan, Customer Success
  SELECT id INTO u FROM users WHERE email = 'aisha.khan@example.com';
  o := _seed_obj(u, 'Lift net revenue retention to 115%', 'NRR', 1);
  PERFORM _seed_sub(o, u, 'Build the at-risk account playbook', 'At-risk playbook', 1,
                    ARRAY['on_track','on_track'], 'Playbook in pilot with two CSMs.');
  PERFORM _seed_sub(o, u, 'Set a quarterly business review cadence', 'QBR cadence', 2,
                    ARRAY['not_started','on_track'], 'Top 20 accounts scheduled.');
  o := _seed_obj(u, 'Cut time-to-first-value under 7 days', 'Time to value', 2);
  PERFORM _seed_sub(o, u, 'Ship a guided onboarding checklist', 'Onboarding checklist', 1,
                    ARRAY['on_track','at_risk'], 'Blocked on the product flag.', 'A product flag to gate the checklist.');
  PERFORM _seed_sub(o, u, 'Write success plans for new accounts', 'Success plans', 2,
                    ARRAY['on_track','on_track'], 'Template adopted by the team.');
  o := _seed_obj(u, 'Launch the customer health score', 'Health score', 3);
  PERFORM _seed_sub(o, u, 'Define the health-score inputs', 'Score inputs', 1,
                    ARRAY['on_track','completed'], 'Inputs agreed with data.');
  PERFORM _seed_sub(o, u, 'Roll the score into the CRM', 'CRM rollout', 2,
                    ARRAY['not_started','on_track'], 'Field live in staging.');

  -- Liam O'Brien, Finance
  SELECT id INTO u FROM users WHERE email = 'liam.obrien@example.com';
  o := _seed_obj(u, 'Close the monthly books in 5 days', 'Fast close', 1);
  PERFORM _seed_sub(o, u, 'Automate bank reconciliations', 'Auto recon', 1,
                    ARRAY['on_track','on_track'], 'Two of three accounts automated.');
  PERFORM _seed_sub(o, u, 'Standardize the close checklist', 'Close checklist', 2,
                    ARRAY['on_track','completed'], 'Checklist live in the tracker.');
  o := _seed_obj(u, 'Roll out the FY budget model', 'Budget model', 2);
  PERFORM _seed_sub(o, u, 'Build department templates', 'Dept templates', 1,
                    ARRAY['on_track','at_risk'], 'Three departments still not back.', 'A nudge to dept heads on inputs.');
  PERFORM _seed_sub(o, u, 'Add scenario planning', 'Scenarios', 2,
                    ARRAY['not_started','on_track'], 'Base and downside cases drafted.');
  o := _seed_obj(u, 'Stand up SaaS metrics reporting', 'SaaS metrics', 3);
  PERFORM _seed_sub(o, u, 'Build the ARR and churn dashboard', 'ARR dashboard', 1,
                    ARRAY['on_track','on_track'], 'ARR live, churn next.');
  PERFORM _seed_sub(o, u, 'Automate the monthly board pack', 'Board pack', 2,
                    ARRAY['on_hold','on_hold'], 'Waiting on the dashboard to finish.');

  -- Yuki Tanaka, Design
  SELECT id INTO u FROM users WHERE email = 'yuki.tanaka@example.com';
  o := _seed_obj(u, 'Ship design system v2', 'Design system', 1);
  PERFORM _seed_sub(o, u, 'Tokenize color and spacing', 'Design tokens', 1,
                    ARRAY['on_track','completed'], 'Tokens shipped to engineering.');
  PERFORM _seed_sub(o, u, 'Rebuild the component library', 'Components', 2,
                    ARRAY['on_track','on_track','at_risk'], 'Behind on the data-table component.');
  o := _seed_obj(u, 'Redesign the onboarding flow', 'Onboarding UX', 2);
  PERFORM _seed_sub(o, u, 'Synthesize the user research', 'Research', 1,
                    ARRAY['on_track','completed'], 'Five themes shared with product.');
  PERFORM _seed_sub(o, u, 'Build high-fidelity prototypes', 'Prototypes', 2,
                    ARRAY['not_started','on_track'], 'First two screens prototyped.');
  o := _seed_obj(u, 'Raise the usability score above 85', 'Usability', 3);
  PERFORM _seed_sub(o, u, 'Fix the top ten friction points', 'Top friction', 1,
                    ARRAY['on_track','on_track'], 'Six of ten fixed.');
  PERFORM _seed_sub(o, u, 'Set a monthly usability-testing cadence', 'Test cadence', 2,
                    ARRAY['not_started','on_track'], 'First session booked.');

  -- A handful of 1:1 notes so the meeting view has content.
  INSERT INTO meeting_notes (user_id, week_start, notes, updated_by) VALUES
    ((SELECT id FROM users WHERE email = 'dana.whitfield@example.com'), wk0,
     E'- EUR billing: pick the vendor by Friday.\n- Wizard demo looked good, ship to beta next week.', ceo),
    ((SELECT id FROM users WHERE email = 'priya.nair@example.com'), wk0,
     E'- Latency goal hit early, nice work.\n- Timebox the cache work.', ceo),
    ((SELECT id FROM users WHERE email = 'mateo.alvarez@example.com'), wk0,
     E'- 4 of 5 pilots signed.\n- I will ping legal about the reseller agreement.', ceo),
    ((SELECT id FROM users WHERE email = 'aisha.khan@example.com'), wk0,
     E'- NRR trending up.\n- Unblock the onboarding checklist with a product flag.', ceo);
END $$;

DROP FUNCTION IF EXISTS _seed_sub(uuid, uuid, text, text, int, text[], text, text, boolean);
DROP FUNCTION IF EXISTS _seed_obj(uuid, text, text, int, int);

-- Sign in with any address above and password: demo1234
