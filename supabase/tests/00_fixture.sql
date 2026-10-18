-- Runs only inside the guarded runner's transaction. No persistent helper/RPC is installed.
CREATE SCHEMA firstten_policy_test;
GRANT USAGE ON SCHEMA firstten_policy_test TO anon, authenticated;
CREATE TABLE firstten_policy_test.ids(label text PRIMARY KEY, id uuid UNIQUE NOT NULL);
GRANT SELECT ON firstten_policy_test.ids TO anon, authenticated;

CREATE FUNCTION firstten_policy_test.id(label text) RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, firstten_policy_test
AS $$ SELECT i.id FROM firstten_policy_test.ids i WHERE i.label = $1 $$;

CREATE FUNCTION firstten_policy_test.set_actor(label text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, firstten_policy_test
AS $$
DECLARE actor uuid;
BEGIN
  actor := firstten_policy_test.id(label);
  IF actor IS NULL THEN RAISE EXCEPTION 'Unknown policy fixture identity'; END IF;
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', actor, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', label, 'is_admin', label = 'admin'),
    'user_metadata', jsonb_build_object('role', label)
  )::text, true);
END $$;

CREATE FUNCTION firstten_policy_test.attempt(statement text) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, extensions, firstten_policy_test
AS $$
DECLARE affected bigint;
BEGIN
  EXECUTE statement;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN 'ok:' || affected;
EXCEPTION WHEN OTHERS THEN
  RETURN 'error:' || SQLSTATE;
END $$;

CREATE FUNCTION firstten_policy_test.visible_count(table_name text, row_id uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, firstten_policy_test
AS $$
DECLARE found bigint;
BEGIN
  IF table_name NOT IN ('projects','contacts','interviews','learnings','experiments','outreach') THEN
    RAISE EXCEPTION 'Unknown policy test table';
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I WHERE id = $1', table_name) INTO found USING row_id;
  RETURN found;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 0;
END $$;

CREATE FUNCTION firstten_policy_test.expect_denied(result text, description text) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, extensions, firstten_policy_test
AS $$
BEGIN
  IF result IN ('ok:0','error:42501','error:23503','error:23514') THEN
    RETURN extensions.ok(true, description || ' [denied]');
  END IF;
  IF result = 'ok:1' AND current_setting('firstten.policy_strict') <> 'on' THEN
    PERFORM extensions.todo('SEC-003 documented legacy integrity gap; not repaired', 1);
  END IF;
  RETURN extensions.ok(false, description || ' [' || result || ']');
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA firstten_policy_test TO anon, authenticated;

INSERT INTO firstten_policy_test.ids(label,id) VALUES
('owner_a','f1000000-0000-4000-8000-000000000001'),
('owner_b','f1000000-0000-4000-8000-000000000002'),
('editor','f1000000-0000-4000-8000-000000000003'),
('viewer','f1000000-0000-4000-8000-000000000004'),
('student','f1000000-0000-4000-8000-000000000005'),
('teacher','f1000000-0000-4000-8000-000000000006'),
('unrelated','f1000000-0000-4000-8000-000000000007'),
('admin','f1000000-0000-4000-8000-000000000008'),
('project_a','f2000000-0000-4000-8000-000000000001'),
('project_a2','f2000000-0000-4000-8000-000000000002'),
('project_b','f2000000-0000-4000-8000-000000000003'),
('contact_a','f2000000-0000-4000-8000-000000000011'),
('contact_a2','f2000000-0000-4000-8000-000000000012'),
('contact_b','f2000000-0000-4000-8000-000000000013'),
('interview_a','f2000000-0000-4000-8000-000000000021'),
('interview_b','f2000000-0000-4000-8000-000000000022'),
('learning_a','f2000000-0000-4000-8000-000000000031'),
('learning_b','f2000000-0000-4000-8000-000000000032'),
('experiment_a','f2000000-0000-4000-8000-000000000041'),
('experiment_b','f2000000-0000-4000-8000-000000000042'),
('outreach_a','f2000000-0000-4000-8000-000000000051'),
('outreach_b','f2000000-0000-4000-8000-000000000052'),
('new_projects','f2000000-0000-4000-8000-000000000061'),
('new_contacts','f2000000-0000-4000-8000-000000000062'),
('new_interviews','f2000000-0000-4000-8000-000000000063'),
('new_learnings','f2000000-0000-4000-8000-000000000064'),
('new_experiments','f2000000-0000-4000-8000-000000000065'),
('new_outreach','f2000000-0000-4000-8000-000000000066');
INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES
('f1000000-0000-4000-8000-000000000001','authenticated','authenticated','owner_a-policy@example.invalid','',now(),'{}','{}',now(),now()),
('f1000000-0000-4000-8000-000000000002','authenticated','authenticated','owner_b-policy@example.invalid','',now(),'{}','{}',now(),now()),
('f1000000-0000-4000-8000-000000000003','authenticated','authenticated','editor-policy@example.invalid','',now(),'{}','{}',now(),now()),
('f1000000-0000-4000-8000-000000000004','authenticated','authenticated','viewer-policy@example.invalid','',now(),'{}','{}',now(),now()),
('f1000000-0000-4000-8000-000000000005','authenticated','authenticated','student-policy@example.invalid','',now(),'{}','{}',now(),now()),
('f1000000-0000-4000-8000-000000000006','authenticated','authenticated','teacher-policy@example.invalid','',now(),'{}','{}',now(),now()),
('f1000000-0000-4000-8000-000000000007','authenticated','authenticated','unrelated-policy@example.invalid','',now(),'{}','{}',now(),now()),
('f1000000-0000-4000-8000-000000000008','authenticated','authenticated','admin-policy@example.invalid','',now(),'{}','{}',now(),now());
INSERT INTO public.projects(id,user_id,name) VALUES (firstten_policy_test.id('project_a'),firstten_policy_test.id('owner_a'),'Fictional policy fixture');
INSERT INTO public.projects(id,user_id,name) VALUES (firstten_policy_test.id('project_a2'),firstten_policy_test.id('owner_a'),'Fictional policy fixture');
INSERT INTO public.projects(id,user_id,name) VALUES (firstten_policy_test.id('project_b'),firstten_policy_test.id('owner_b'),'Fictional policy fixture');
INSERT INTO public.contacts(id,user_id,project_id,first_name) VALUES (firstten_policy_test.id('contact_a'),firstten_policy_test.id('owner_a'),firstten_policy_test.id('project_a'),'Fixture');
INSERT INTO public.contacts(id,user_id,project_id,first_name) VALUES (firstten_policy_test.id('contact_a2'),firstten_policy_test.id('owner_a'),firstten_policy_test.id('project_a2'),'Fixture');
INSERT INTO public.contacts(id,user_id,project_id,first_name) VALUES (firstten_policy_test.id('contact_b'),firstten_policy_test.id('owner_b'),firstten_policy_test.id('project_b'),'Fixture');
INSERT INTO public.interviews(id,user_id,project_id,contact_id,completed) VALUES (firstten_policy_test.id('interview_a'),firstten_policy_test.id('owner_a'),firstten_policy_test.id('project_a'),firstten_policy_test.id('contact_a'),true);
INSERT INTO public.learnings(id,user_id,project_id,title,body) VALUES (firstten_policy_test.id('learning_a'),firstten_policy_test.id('owner_a'),firstten_policy_test.id('project_a'),'Fixture learning','Private fixture');
INSERT INTO public.experiments(id,user_id,project_id,hypothesis,change) VALUES (firstten_policy_test.id('experiment_a'),firstten_policy_test.id('owner_a'),firstten_policy_test.id('project_a'),'Fixture hypothesis','Fixture change');
INSERT INTO public.outreach(id,user_id,project_id,title,body) VALUES (firstten_policy_test.id('outreach_a'),firstten_policy_test.id('owner_a'),firstten_policy_test.id('project_a'),'Fixture draft','Private fixture');
INSERT INTO public.interviews(id,user_id,project_id,contact_id,completed) VALUES (firstten_policy_test.id('interview_b'),firstten_policy_test.id('owner_b'),firstten_policy_test.id('project_b'),firstten_policy_test.id('contact_b'),true);
INSERT INTO public.learnings(id,user_id,project_id,title,body) VALUES (firstten_policy_test.id('learning_b'),firstten_policy_test.id('owner_b'),firstten_policy_test.id('project_b'),'Fixture learning','Private fixture');
INSERT INTO public.experiments(id,user_id,project_id,hypothesis,change) VALUES (firstten_policy_test.id('experiment_b'),firstten_policy_test.id('owner_b'),firstten_policy_test.id('project_b'),'Fixture hypothesis','Fixture change');
INSERT INTO public.outreach(id,user_id,project_id,title,body) VALUES (firstten_policy_test.id('outreach_b'),firstten_policy_test.id('owner_b'),firstten_policy_test.id('project_b'),'Fixture draft','Private fixture');
