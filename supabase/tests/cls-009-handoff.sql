-- Source-only genuine growth handoff fixture. Entire suite is inside outer ROLLBACK.
RESET ROLE;
CREATE TABLE firstten_policy_test.gh_results(label text PRIMARY KEY,result jsonb);
GRANT SELECT,INSERT,UPDATE ON firstten_policy_test.gh_results TO authenticated,service_role;
CREATE FUNCTION firstten_policy_test.gh_id(n integer)RETURNS uuid LANGUAGE sql IMMUTABLE AS $$SELECT('f2800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
CREATE FUNCTION firstten_policy_test.gh_session(who text DEFAULT'a')RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT encode(sha256(convert_to('fictional-growth-handoff-'||who,'UTF8')),'hex')$$;
CREATE FUNCTION firstten_policy_test.gh_doc(kind text)RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT replace(replace(replace(document::text,'f2700000-0000-4000-8000-000000000101',firstten_policy_test.gh_id(101)::text),'f2700000-0000-4000-8000-000000000102',firstten_policy_test.gh_id(102)::text),'f2700000-0000-4000-8000-000000000103',firstten_policy_test.gh_id(103)::text)::jsonb FROM firstten_policy_test.gg_docs WHERE label=kind$$;
CREATE FUNCTION firstten_policy_test.gh_kind(n integer)RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT(ARRAY['learning','experiment','pipeline_contact','survey','referral','onboarding'])[n]$$;
CREATE FUNCTION firstten_policy_test.gh_spec(n integer,request uuid DEFAULT gen_random_uuid())RETURNS jsonb LANGUAGE sql STABLE AS $$
SELECT jsonb_build_object('artifactId',firstten_policy_test.gh_id(100+n),'expectedRevision',2,'assignmentId',firstten_policy_test.gh_id(9),'threadId',firstten_policy_test.gh_id(200+n),'requestId',request,'selections',CASE n WHEN 4 THEN jsonb_build_array(jsonb_build_object('kind','survey','section','question','questionId','f2700000-0000-4000-8000-000000000201'))WHEN 6 THEN jsonb_build_array(jsonb_build_object('kind','onboarding','section','question','questionId','f2700000-0000-4000-8000-000000000204'))ELSE jsonb_build_array(jsonb_build_object('kind',firstten_policy_test.gh_kind(n),'section',(ARRAY['observations','plan','fit','introduction','draft','goal'])[n]))END,'redactions',jsonb_build_array('PATTERN_OBSERVATION'),'reflection',jsonb_build_object('title','Fictional reviewed '||firstten_policy_test.gh_kind(n),'interpretation','Authored reasoning, not observed customer proof','uncertainty','No independently observed customer test','decision','Revise','nextAction','One small permitted test'))$$;
CREATE FUNCTION firstten_policy_test.gh_confirm(label text,request uuid DEFAULT gen_random_uuid())RETURNS jsonb LANGUAGE sql AS $$SELECT public.confirm_guest_growth_submission(firstten_policy_test.gh_session(),(SELECT(result#>>'{data,id}')::uuid FROM firstten_policy_test.gh_results r WHERE r.label=$1),(SELECT result#>>'{data,hash}'FROM firstten_policy_test.gh_results r WHERE r.label=$1),request,true)$$;
CREATE FUNCTION firstten_policy_test.gh_snapshot(label text)RETURNS uuid LANGUAGE sql STABLE AS $$SELECT(result#>>'{data,id}')::uuid FROM firstten_policy_test.gh_results r WHERE r.label=$1$$;
GRANT EXECUTE ON FUNCTION firstten_policy_test.gh_id(integer),firstten_policy_test.gh_session(text),firstten_policy_test.gh_doc(text),firstten_policy_test.gh_kind(integer),firstten_policy_test.gh_spec(integer,uuid),firstten_policy_test.gh_confirm(text,uuid),firstten_policy_test.gh_snapshot(text)TO authenticated,service_role;
INSERT INTO public.classes(id,user_id,name,mode,access_expires_at)VALUES(firstten_policy_test.gh_id(1),firstten_policy_test.id('owner_a'),'Fictional growth review','class',clock_timestamp()+interval'1 day');
INSERT INTO public.class_teams(id,class_id,issued_by,alias)VALUES(firstten_policy_test.gh_id(2),firstten_policy_test.gh_id(1),firstten_policy_test.id('owner_a'),'Fictional growth team');
INSERT INTO public.class_guest_principals(id,class_id,team_id,issued_by,alias)VALUES(firstten_policy_test.gh_id(3),firstten_policy_test.gh_id(1),firstten_policy_test.gh_id(2),firstten_policy_test.id('owner_a'),'Fictional author'),(firstten_policy_test.gh_id(4),firstten_policy_test.gh_id(1),firstten_policy_test.gh_id(2),firstten_policy_test.id('owner_a'),'Fictional buddy');
INSERT INTO firstten_private.class_guest_sessions(class_id,team_id,principal_id,token_hash,expires_at)SELECT firstten_policy_test.gh_id(1),firstten_policy_test.gh_id(2),firstten_policy_test.gh_id(n),firstten_private.guest_hash(firstten_policy_test.gh_session(CASE n WHEN 3 THEN'a'ELSE'buddy'END)),clock_timestamp()+interval'1 hour'FROM generate_series(3,4)n;
INSERT INTO public.assignments(id,class_id,user_id,last_editor_id,title,state)VALUES(firstten_policy_test.gh_id(9),firstten_policy_test.gh_id(1),firstten_policy_test.id('owner_a'),firstten_policy_test.id('owner_a'),'Fictional selected review','published');
SELECT ok(NOT EXISTS(SELECT 1 FROM auth.users WHERE id IN(firstten_policy_test.gh_id(3),firstten_policy_test.gh_id(4))),'guest principals are not fake auth users');
SELECT ok(NOT has_table_privilege(role,table_name,'SELECT,INSERT,UPDATE,DELETE'),'closed growth handoff table '||role||' '||table_name)FROM unnest(ARRAY['anon','authenticated','service_role'])role CROSS JOIN unnest(ARRAY['firstten_private.growth_submission_choices','firstten_private.growth_submission_threads','firstten_private.growth_submission_previews','firstten_private.growth_submission_versions','firstten_private.growth_submission_grants','firstten_private.growth_submission_operations','firstten_private.growth_submission_audit'])table_name;
SELECT ok(NOT has_function_privilege('service_role','public.get_teacher_guest_growth_submission(uuid,uuid)','EXECUTE'),'guest cannot impersonate teacher');
SELECT ok(NOT has_function_privilege('authenticated','public.confirm_guest_growth_submission(text,uuid,text,uuid,boolean)','EXECUTE'),'teacher bearer cannot impersonate guest');
SELECT ok(NOT has_function_privilege('anon','public.get_guest_growth_handoff_sources(text,uuid,integer)','EXECUTE'),'anonymous cannot call source roster');
SET LOCAL ROLE service_role;
DO $$DECLARE n integer;j integer;r jsonb;BEGIN FOR n IN 1..6 LOOP FOR j IN 0..1 LOOP r:=public.save_guest_growth_artifact(firstten_policy_test.gh_session(),firstten_policy_test.gh_id(100+n),'principal_private',j,gen_random_uuid(),false,firstten_policy_test.gh_doc(firstten_policy_test.gh_kind(n)));IF r->>'ok'IS DISTINCT FROM'true'THEN RAISE EXCEPTION 'Real growth source setup failed: %,%,%',n,j,r->>'code';END IF;END LOOP;END LOOP;END $$;
SELECT is(public.get_guest_growth_sharing_choice(firstten_policy_test.gh_session(),firstten_policy_test.gh_id(101))#>>'{data,choice}','unknown','historical choice unknown by default');
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_spec(1))->>'code','SHARING_REQUIRED','preview needs reported choice, not automatic sharing');
SELECT is(public.get_guest_growth_sharing_choice(firstten_policy_test.gh_session('buddy'),firstten_policy_test.gh_id(101))->>'code','NOT_FOUND','teammate cannot read private source choice');
SELECT is(public.save_guest_growth_sharing_choice(firstten_policy_test.gh_session(),firstten_policy_test.gh_id(101),'granted',0,firstten_policy_test.gh_id(501))->>'ok','true','explicit publisher report for actual source');
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_spec(2))->>'code','SHARING_REQUIRED','each dependency and root choice required');
SELECT is(public.save_guest_growth_sharing_choice(firstten_policy_test.gh_session(),firstten_policy_test.gh_id(100+n),'granted',0,firstten_policy_test.gh_id(500+n))->>'ok','true','grant authored source choice '||n)FROM generate_series(2,6)n;
INSERT INTO firstten_policy_test.gh_results SELECT'roster',public.get_guest_growth_handoff_sources(firstten_policy_test.gh_session(),firstten_policy_test.gh_id(104),2);
SELECT is((SELECT jsonb_array_length(result#>'{data,sources}')FROM firstten_policy_test.gh_results WHERE label='roster'),3,'survey roster resolves exact survey/experiment/learning graph');
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_spec(1)||'{"projectId":"f2800000-0000-4000-8000-000000000001"}')->>'code','INVALID_INPUT','no account namespace widening');
INSERT INTO firstten_policy_test.gh_results SELECT'preview_'||firstten_policy_test.gh_kind(n),public.preview_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_spec(n,firstten_policy_test.gh_id(600+n)))FROM generate_series(1,6)n;
SELECT is(result->>'ok','true','actual selected preview: '||label)FROM firstten_policy_test.gh_results WHERE label LIKE'preview_%';
SELECT ok(NOT (result#>'{data,payload}')::text~'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}','teacher body never includes source/question/reference IDs: '||label)FROM firstten_policy_test.gh_results WHERE label LIKE'preview_%';
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_spec(1,firstten_policy_test.gh_id(601)))#>>'{data,id}',(SELECT result#>>'{data,id}'FROM firstten_policy_test.gh_results WHERE label='preview_learning'),'exact preview retry preserves original ID');
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_spec(1)||jsonb_build_object('threadId',firstten_policy_test.gh_id(999)))->>'code','CHANGED','different supplied existing thread ID is rejected');
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_spec(1)||jsonb_build_object('selections',jsonb_build_array(jsonb_build_object('kind','learning','section','observations','excerpt','invented quote'))))->>'code','INVALID_INPUT','literal excerpt must be from selected exact source section');
SELECT is(public.confirm_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_snapshot('preview_learning'),repeat('0',64),gen_random_uuid(),true)->>'code','CHANGED','changed preview hash denied');
INSERT INTO firstten_policy_test.gh_results SELECT'copy_'||firstten_policy_test.gh_kind(n),firstten_policy_test.gh_confirm('preview_'||firstten_policy_test.gh_kind(n),firstten_policy_test.gh_id(700+n))FROM generate_series(1,6)n;
SELECT is(result->>'ok','true','exact confirmed selected copy '||label)FROM firstten_policy_test.gh_results WHERE label LIKE'copy_%';
SELECT is(firstten_policy_test.gh_confirm('preview_learning',firstten_policy_test.gh_id(701))#>>'{data,id}',firstten_policy_test.gh_snapshot('copy_learning')::text,'exact submit retry does not duplicate payload');
SELECT is(public.get_guest_growth_submission(firstten_policy_test.gh_session('buddy'),firstten_policy_test.gh_snapshot('copy_learning'))->>'code','NOT_FOUND','team membership grants no author copy access');
SELECT is(public.save_guest_growth_artifact(firstten_policy_test.gh_session(),firstten_policy_test.gh_id(101),'principal_private',2,gen_random_uuid(),false,firstten_policy_test.gh_doc('learning')||'{"title":"Later ordinary edit","observations":"NEW_SELECTED_OBSERVATION_MUST_NOT_REWRITE_OLD_COPY"}')->>'ok','true','ordinary source edits remain possible');
INSERT INTO firstten_policy_test.gh_results SELECT'author',public.get_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_snapshot('copy_learning'));
RESET ROLE;SELECT firstten_policy_test.set_actor('owner_a');SET LOCAL ROLE authenticated;
INSERT INTO firstten_policy_test.gh_results SELECT'teacher',public.get_teacher_guest_growth_submission(firstten_policy_test.gh_id(1),firstten_policy_test.gh_snapshot('copy_learning'));
SELECT is((SELECT result->>'ok'FROM firstten_policy_test.gh_results WHERE label='teacher'),'true','ordinary later edit preserves exact teacher copy');
SELECT is((SELECT result#>'{data,payload}'FROM firstten_policy_test.gh_results WHERE label='teacher'),(SELECT result#>'{data,payload}'FROM firstten_policy_test.gh_results WHERE label='copy_learning'),'selected observations stay exactly immutable after changing that selected source field');
SELECT ok(NOT (SELECT (result#>'{data,payload}')::text LIKE'%NEW_SELECTED_OBSERVATION_MUST_NOT_REWRITE_OLD_COPY%'FROM firstten_policy_test.gh_results WHERE label='teacher'),'teacher never substitutes current selected source body');
INSERT INTO firstten_policy_test.gh_results SELECT'teacher_list',public.list_teacher_guest_growth_submissions(firstten_policy_test.gh_id(1));
SELECT is((SELECT jsonb_array_length(result#>'{data,items}')FROM firstten_policy_test.gh_results WHERE label='teacher_list'),6,'teacher sees only six deliberate selected copies');
RESET ROLE;SELECT firstten_policy_test.set_actor('owner_b');SET LOCAL ROLE authenticated;
SELECT is(public.list_teacher_guest_growth_submissions(firstten_policy_test.gh_id(1))->>'code','NOT_FOUND','unrelated account cannot list copies');
RESET ROLE;SET LOCAL ROLE service_role;
SELECT is(public.save_guest_growth_sharing_choice(firstten_policy_test.gh_session(),firstten_policy_test.gh_id(101),'withdrawn',1,firstten_policy_test.gh_id(801))#>>'{data,revision}','2','first dependency privacy reduction');
SELECT is(public.get_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_snapshot('copy_survey'))#>>'{data,recipientEligible}','false','transitive dependency withdrawal ends teacher eligibility');
SELECT is(public.save_guest_growth_sharing_choice(firstten_policy_test.gh_session(),firstten_policy_test.gh_id(101),'granted',2,firstten_policy_test.gh_id(802))->>'ok','true','new source choice is separate intent');
SELECT is(public.get_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_snapshot('copy_learning'))#>>'{data,recipientEligible}','false','regrant cannot revive old copy');
INSERT INTO firstten_policy_test.gh_results SELECT'withdrawn',public.withdraw_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_snapshot('copy_referral'),firstten_policy_test.gh_id(803));
SELECT is((SELECT result#>>'{data,grantState}'FROM firstten_policy_test.gh_results WHERE label='withdrawn'),'withdrawn','snapshot grant withdrawal distinct from choice');
SELECT is(public.get_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_snapshot('copy_referral'))->>'ok','true','author private copy survives recipient withdrawal');
INSERT INTO firstten_policy_test.gh_results SELECT'preview_survey_fresh',public.preview_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_spec(4,firstten_policy_test.gh_id(880)));
INSERT INTO firstten_policy_test.gh_results SELECT'copy_survey_fresh',firstten_policy_test.gh_confirm('preview_survey_fresh',firstten_policy_test.gh_id(881));
SELECT is((SELECT result#>>'{data,recipientEligible}'FROM firstten_policy_test.gh_results WHERE label='copy_survey_fresh'),'true','fresh survey copy eligible after deliberate new dependency choices');
RESET ROLE;
-- All ordinary caps are materialized in test-owned rows. Monotone reductions allocate no rows.
INSERT INTO firstten_private.growth_submission_operations(principal_id,operation,request_id,payload_hash,target_id)SELECT firstten_policy_test.gh_id(3),'choice',gen_random_uuid(),repeat('a',64),firstten_policy_test.gh_id(101)FROM generate_series(1,2000-(SELECT count(*)FROM firstten_private.growth_submission_operations WHERE principal_id=firstten_policy_test.gh_id(3)));
INSERT INTO firstten_private.growth_submission_audit(principal_id,class_id,operation,request_id)SELECT firstten_policy_test.gh_id(3),firstten_policy_test.gh_id(1),'choice',gen_random_uuid()FROM generate_series(1,5000-(SELECT count(*)FROM firstten_private.growth_submission_audit WHERE principal_id=firstten_policy_test.gh_id(3)));
UPDATE firstten_private.guest_learning_buckets SET window_start=date_trunc('minute',clock_timestamp()),attempts=120 WHERE principal_id=firstten_policy_test.gh_id(3);
SET LOCAL ROLE service_role;
SELECT is(public.save_guest_growth_sharing_choice(firstten_policy_test.gh_session(),firstten_policy_test.gh_id(103),'withdrawn',1,firstten_policy_test.gh_id(804))->>'ok','true','source withdrawal available at receipt/audit/rate caps');
SELECT is(public.withdraw_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_snapshot('copy_pipeline_contact'),firstten_policy_test.gh_id(805))->>'ok','true','snapshot withdrawal available at all ordinary caps');
DO $$DECLARE n integer;r jsonb;BEGIN FOR n IN 1..20 LOOP r:=public.withdraw_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_snapshot('copy_pipeline_contact'),gen_random_uuid());IF r->>'ok'IS DISTINCT FROM'true'THEN RAISE EXCEPTION 'Repeated withdrawal failed';END IF;END LOOP;END $$;
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM firstten_private.growth_submission_operations WHERE principal_id=firstten_policy_test.gh_id(3)),2000,'repeated reductions never grow receipts');
SELECT is((SELECT count(*)::integer FROM firstten_private.growth_submission_audit WHERE principal_id=firstten_policy_test.gh_id(3)),5000,'repeated reductions never grow audits');
DELETE FROM firstten_private.guest_learning_buckets WHERE principal_id=firstten_policy_test.gh_id(3);
-- Actual source deletion leaves surviving dependent versions but denies their teacher metadata eligibility.
DELETE FROM firstten_private.guest_growth_artifacts WHERE id=firstten_policy_test.gh_id(102);
SET LOCAL ROLE service_role;
SELECT is(public.get_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_snapshot('copy_survey_fresh'))#>>'{data,recipientEligible}','false','missing exact retained dependency cannot pass teacher eligibility');
SELECT is(public.get_guest_growth_submission(firstten_policy_test.gh_session(),firstten_policy_test.gh_snapshot('copy_survey_fresh'))->>'ok','true','source deletion denies recipients while retaining private author copy of surviving root');
RESET ROLE;
-- New audit relation allows legitimate DELETE/cascades; old24 incompatibility is not modified.
DELETE FROM firstten_private.growth_submission_audit WHERE principal_id=firstten_policy_test.gh_id(3);
SELECT is((SELECT count(*)::integer FROM firstten_private.growth_submission_audit WHERE principal_id=firstten_policy_test.gh_id(3)),0,'new audit DELETE does not reproduce inherited cascade trap');
-- Independent capacity class: never changes the original survey/deletion fixture.
RESET ROLE;
INSERT INTO public.classes(id,user_id,name,mode,access_expires_at)VALUES(firstten_policy_test.gh_id(10000),firstten_policy_test.id('owner_a'),'Fictional capacity recovery','class',clock_timestamp()+interval'1 day');
INSERT INTO public.class_teams(id,class_id,issued_by,alias)VALUES(firstten_policy_test.gh_id(10001),firstten_policy_test.gh_id(10000),firstten_policy_test.id('owner_a'),'Fictional capacity team');
INSERT INTO public.assignments(id,class_id,user_id,last_editor_id,title,state)VALUES(firstten_policy_test.gh_id(10002),firstten_policy_test.gh_id(10000),firstten_policy_test.id('owner_a'),firstten_policy_test.id('owner_a'),'Fictional capacity review','published');
INSERT INTO public.class_guest_principals(id,class_id,team_id,issued_by,alias)SELECT firstten_policy_test.gh_id(10010+n),firstten_policy_test.gh_id(10000),firstten_policy_test.gh_id(10001),firstten_policy_test.id('owner_a'),'Fictional capacity author '||n FROM generate_series(1,14)n;
INSERT INTO firstten_private.class_guest_sessions(class_id,team_id,principal_id,token_hash,expires_at)SELECT firstten_policy_test.gh_id(10000),firstten_policy_test.gh_id(10001),firstten_policy_test.gh_id(10010+n),firstten_private.guest_hash(firstten_policy_test.gh_session('cap-'||n)),clock_timestamp()+interval'1 hour'FROM generate_series(1,14)n;
CREATE FUNCTION firstten_policy_test.gh_cap_spec(artifact integer,thread integer)RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT firstten_policy_test.gh_spec(3)||jsonb_build_object('artifactId',firstten_policy_test.gh_id(artifact),'expectedRevision',1,'threadId',firstten_policy_test.gh_id(thread),'assignmentId',firstten_policy_test.gh_id(10002))$$;
-- Isolate storage-cap behavior from rate limits using only these test-owned principals.
CREATE FUNCTION firstten_policy_test.gh_cap_reset_rate(n integer)RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$DELETE FROM firstten_private.guest_learning_buckets WHERE principal_id=firstten_policy_test.gh_id(10010+n)$$;
GRANT EXECUTE ON FUNCTION firstten_policy_test.gh_cap_spec(integer,integer),firstten_policy_test.gh_cap_reset_rate(integer)TO service_role;
SET LOCAL ROLE service_role;
DO $$DECLARE n integer;r jsonb;s text;BEGIN FOR n IN 1..14 LOOP
 s:=firstten_policy_test.gh_session('cap-'||n);
 r:=public.save_guest_growth_artifact(s,firstten_policy_test.gh_id(11000+n),'principal_private',0,gen_random_uuid(),false,firstten_policy_test.gh_doc('pipeline_contact'));
 IF r->>'ok'IS DISTINCT FROM'true'THEN RAISE EXCEPTION 'Capacity source setup failed: %',r->>'code';END IF;
 r:=public.save_guest_growth_sharing_choice(s,firstten_policy_test.gh_id(11000+n),'granted',0,gen_random_uuid());
 IF r->>'ok'IS DISTINCT FROM'true'THEN RAISE EXCEPTION 'Capacity choice setup failed: %',r->>'code';END IF;
END LOOP;END $$;
-- Twenty actual immutable versions, followed by refusal and a still-available reduction.
DO $$DECLARE n integer;p jsonb;r jsonb;s text:=firstten_policy_test.gh_session('cap-1');BEGIN FOR n IN 1..20 LOOP
 p:=public.preview_guest_growth_submission(s,firstten_policy_test.gh_cap_spec(11001,12001));
 IF p->>'ok'IS DISTINCT FROM'true'THEN RAISE EXCEPTION 'Version preview % failed: %',n,p->>'code';END IF;
 r:=public.confirm_guest_growth_submission(s,(p#>>'{data,id}')::uuid,p#>>'{data,hash}',gen_random_uuid(),true);
 IF r->>'ok'IS DISTINCT FROM'true'OR(r#>>'{data,version}')::integer<>n THEN RAISE EXCEPTION 'Version % failed: %',n,r->>'code';END IF;
END LOOP;
 INSERT INTO firstten_policy_test.gh_results VALUES('cap_version_last',r);
END $$;
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session('cap-1'),firstten_policy_test.gh_cap_spec(11001,12001))->>'code','CAPACITY','twenty real versions refuse a twenty-first');
SELECT is(public.withdraw_guest_growth_submission(firstten_policy_test.gh_session('cap-1'),firstten_policy_test.gh_snapshot('cap_version_last'),gen_random_uuid())->>'ok','true','version capacity preserves explicit recipient withdrawal');
SELECT is(public.save_guest_growth_sharing_choice(firstten_policy_test.gh_session('cap-1'),firstten_policy_test.gh_id(11001),'withdrawn',1,gen_random_uuid())->>'ok','true','version capacity preserves source reduction');
-- Fifty actual previews: same-request recovery works; a new preview is refused.
DO $$DECLARE n integer;p jsonb;spec jsonb;s text:=firstten_policy_test.gh_session('cap-2');BEGIN FOR n IN 1..50 LOOP
 spec:=firstten_policy_test.gh_cap_spec(11002,12002);p:=public.preview_guest_growth_submission(s,spec);
 IF p->>'ok'IS DISTINCT FROM'true'THEN RAISE EXCEPTION 'Preview % failed: %',n,p->>'code';END IF;
END LOOP;
 INSERT INTO firstten_policy_test.gh_results VALUES('cap_preview_spec',spec),('cap_preview_last',p);
END $$;
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session('cap-2'),(SELECT result FROM firstten_policy_test.gh_results WHERE label='cap_preview_spec'))#>>'{data,id}',firstten_policy_test.gh_snapshot('cap_preview_last')::text,'fifty real previews retain exact-request recovery');
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session('cap-2'),firstten_policy_test.gh_cap_spec(11002,12002))->>'code','CAPACITY','fifty real previews refuse a fifty-first');
INSERT INTO firstten_policy_test.gh_results SELECT'cap_preview_confirm',public.confirm_guest_growth_submission(firstten_policy_test.gh_session('cap-2'),firstten_policy_test.gh_snapshot('cap_preview_last'),(SELECT result#>>'{data,hash}'FROM firstten_policy_test.gh_results WHERE label='cap_preview_last'),gen_random_uuid(),true);
SELECT is((SELECT result->>'ok'FROM firstten_policy_test.gh_results WHERE label='cap_preview_confirm'),'true','preview capacity still permits confirmation of existing preview');
SELECT is(public.save_guest_growth_sharing_choice(firstten_policy_test.gh_session('cap-2'),firstten_policy_test.gh_id(11002),'withdrawn',1,gen_random_uuid())->>'ok','true','preview capacity preserves source reduction');
-- Fifty actual artifact/assignment threads, each admitted through the actual RPC.
DO $$DECLARE n integer;r jsonb;s text:=firstten_policy_test.gh_session('cap-3');BEGIN FOR n IN 1..51 LOOP
 PERFORM firstten_policy_test.gh_cap_reset_rate(3);
 r:=public.save_guest_growth_artifact(s,firstten_policy_test.gh_id(13000+n),'principal_private',0,gen_random_uuid(),false,firstten_policy_test.gh_doc('pipeline_contact'));
 IF r->>'ok'IS DISTINCT FROM'true'THEN RAISE EXCEPTION 'Thread source % failed: %',n,r->>'code';END IF;
 r:=public.save_guest_growth_sharing_choice(s,firstten_policy_test.gh_id(13000+n),'granted',0,gen_random_uuid());
 IF r->>'ok'IS DISTINCT FROM'true'THEN RAISE EXCEPTION 'Thread choice % failed: %',n,r->>'code';END IF;
 r:=public.preview_guest_growth_submission(s,firstten_policy_test.gh_cap_spec(13000+n,14000+n));
 IF n<=50 AND r->>'ok'IS DISTINCT FROM'true'THEN RAISE EXCEPTION 'Thread % failed: %',n,r->>'code';END IF;
 IF n=51 AND r->>'code'IS DISTINCT FROM'CAPACITY'THEN RAISE EXCEPTION 'Thread51 not refused';END IF;
END LOOP;END $$;
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session('cap-3'),firstten_policy_test.gh_cap_spec(13001,14001))->>'ok','true','fifty real threads allow another preview on an existing thread');
SELECT is(public.save_guest_growth_sharing_choice(firstten_policy_test.gh_session('cap-3'),firstten_policy_test.gh_id(13001),'withdrawn',1,gen_random_uuid())->>'ok','true','thread capacity preserves source reduction');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM firstten_private.growth_submission_versions v JOIN firstten_private.growth_submission_threads t ON t.id=v.thread_id WHERE t.principal_id=firstten_policy_test.gh_id(10011)),20,'twenty real versions were stored');
SELECT is((SELECT count(*)::integer FROM firstten_private.growth_submission_previews p JOIN firstten_private.growth_submission_threads t ON t.id=p.thread_id WHERE t.principal_id=firstten_policy_test.gh_id(10012)),50,'fifty real previews were stored');
SELECT is((SELECT count(*)::integer FROM firstten_private.growth_submission_threads WHERE principal_id=firstten_policy_test.gh_id(10013)),50,'fifty real threads were stored without orphan51');
-- A refused first preview must not create an orphan thread at the audit capacity.
INSERT INTO firstten_private.growth_submission_audit(principal_id,class_id,operation,request_id)SELECT firstten_policy_test.gh_id(10014),firstten_policy_test.gh_id(10000),'choice',gen_random_uuid()FROM generate_series(1,5000-(SELECT count(*)FROM firstten_private.growth_submission_audit WHERE principal_id=firstten_policy_test.gh_id(10014)));
SET LOCAL ROLE service_role;
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session('cap-4'),firstten_policy_test.gh_cap_spec(11004,12004))->>'code','CAPACITY','first preview refuses full audit capacity');
SELECT is(public.save_guest_growth_sharing_choice(firstten_policy_test.gh_session('cap-4'),firstten_policy_test.gh_id(11004),'withdrawn',1,gen_random_uuid())->>'ok','true','audit capacity preserves source reduction');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM firstten_private.growth_submission_threads WHERE principal_id=firstten_policy_test.gh_id(10014)),0,'refused first preview leaves no orphan thread');

-- UTF8 storage limits use test-owned filler rows, never claimed as RPC-produced DTOs.
-- Every field respects the authored reflection length limits. Real final RPCs prove refusal.
RESET ROLE;
CREATE FUNCTION firstten_policy_test.gh_cap_bytes(n integer DEFAULT NULL)RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 WITH stored AS(SELECT t.principal_id,octet_length(p.payload::text)+octet_length(p.manifest::text)+octet_length(p.specification::text)bytes FROM firstten_private.growth_submission_previews p JOIN firstten_private.growth_submission_threads t ON t.id=p.thread_id WHERE t.class_id=firstten_policy_test.gh_id(10000)
 UNION ALL SELECT t.principal_id,octet_length(v.payload::text)+octet_length(v.manifest::text)+octet_length(v.authority::text)FROM firstten_private.growth_submission_versions v JOIN firstten_private.growth_submission_threads t ON t.id=v.thread_id WHERE t.class_id=firstten_policy_test.gh_id(10000))
 SELECT coalesce(sum(bytes),0)::bigint FROM stored WHERE n IS NULL OR principal_id=firstten_policy_test.gh_id(10010+n)
$$;
CREATE FUNCTION firstten_policy_test.gh_cap_fill(n integer,target bigint)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE template firstten_private.growth_submission_previews;spec jsonb;payload jsonb;empty_spec jsonb;empty_payload jsonb;f text;slot integer;limit_chars integer;delta bigint;take integer;base bigint;remaining bigint;rows integer;i integer;desired bigint;pad text;
BEGIN
 IF n NOT BETWEEN 5 AND 12 OR target>2097152 OR target<0 THEN RAISE EXCEPTION 'Fixture-only bounds';END IF;
 SELECT p.* INTO STRICT template FROM firstten_private.growth_submission_previews p JOIN firstten_private.growth_submission_threads t ON t.id=p.thread_id WHERE t.principal_id=firstten_policy_test.gh_id(10010+n)ORDER BY p.id LIMIT 1;
 empty_spec:=template.specification;empty_payload:=template.payload;
 FOREACH f IN ARRAY ARRAY['interpretation','uncertainty','decision','nextAction']LOOP
  empty_spec:=jsonb_set(empty_spec,ARRAY['reflection',f],'""');empty_payload:=jsonb_set(empty_payload,ARRAY[f],'""');
 END LOOP;
 base:=octet_length(empty_spec::text)+octet_length(empty_payload::text)+octet_length(template.manifest::text);
 remaining:=target-firstten_policy_test.gh_cap_bytes(n);
 rows:=ceil(remaining::numeric/(base+54000))::integer;
 IF rows NOT BETWEEN 1 AND 49 OR remaining<rows*base THEN RAISE EXCEPTION 'Invalid filler partition';END IF;
 FOR i IN 1..rows LOOP
  desired:=remaining/(rows-i+1);delta:=desired-base;spec:=empty_spec;payload:=empty_payload;
  FOR slot IN 1..8 LOOP
   f:=(ARRAY['interpretation','uncertainty','decision','nextAction'])[(slot-1)%4+1];limit_chars:=CASE WHEN f='interpretation'THEN 3000 ELSE 2000 END;
   take:=least(delta,limit_chars*3)::integer;pad:=repeat('界',take/3)||repeat('x',take%3);delta:=delta-take;
   IF slot<=4 THEN spec:=jsonb_set(spec,ARRAY['reflection',f],to_jsonb(pad));ELSE payload:=jsonb_set(payload,ARRAY[f],to_jsonb(pad));END IF;
  END LOOP;
  IF delta<>0 OR octet_length(spec::text)+octet_length(payload::text)+octet_length(template.manifest::text)<>desired THEN RAISE EXCEPTION 'Exact UTF8 partition failed';END IF;
  -- Spec request IDs retain the same textual UUID width; these are storage rows only.
  spec:=jsonb_set(spec,'{requestId}',to_jsonb(gen_random_uuid()::text));
  INSERT INTO firstten_private.growth_submission_previews(thread_id,request_id,specification,binding_hash,manifest,payload,expected_version,expires_at)VALUES(template.thread_id,gen_random_uuid(),spec,repeat('c',64),template.manifest,payload,0,clock_timestamp()+interval'10 minutes');
  remaining:=remaining-desired;
 END LOOP;
 IF remaining<>0 OR firstten_policy_test.gh_cap_bytes(n)<>target THEN RAISE EXCEPTION 'Exact publisher byte target not reached';END IF;
END $$;
-- Create the first genuine preview, then materialize the publisher's exact 2MiB.
INSERT INTO firstten_policy_test.gh_results SELECT'cap_bytes_first',public.preview_guest_growth_submission(firstten_policy_test.gh_session('cap-5'),firstten_policy_test.gh_cap_spec(11005,12005));
SELECT is((SELECT result->>'ok'FROM firstten_policy_test.gh_results WHERE label='cap_bytes_first'),'true','positive byte-cap setup uses real preview');
SELECT firstten_policy_test.gh_cap_fill(5,2097152-(SELECT octet_length(p.payload::text)+octet_length(p.manifest::text)+octet_length(p.specification::text)FROM firstten_private.growth_submission_previews p WHERE p.id=firstten_policy_test.gh_snapshot('cap_bytes_first')));
SET LOCAL ROLE service_role;
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session('cap-5'),firstten_policy_test.gh_cap_spec(11005,12005))->>'ok','true','real preview fills exact final publisher headroom');
RESET ROLE;
SELECT is(firstten_policy_test.gh_cap_bytes(5),2097152::bigint,'publisher storage is exactly2MiB UTF8');
SELECT ok(firstten_private.growth_publication_bytes(firstten_policy_test.gh_id(10015),firstten_policy_test.gh_id(10000),0)AND NOT firstten_private.growth_publication_bytes(firstten_policy_test.gh_id(10015),firstten_policy_test.gh_id(10000),1),'publisher exact-byte boundary admits zero and refuses one byte');
SET LOCAL ROLE service_role;
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session('cap-5'),firstten_policy_test.gh_cap_spec(11005,12005))->>'code','CAPACITY','real new preview refuses full publisher bytes');
SELECT is(public.confirm_guest_growth_submission(firstten_policy_test.gh_session('cap-5'),firstten_policy_test.gh_snapshot('cap_bytes_first'),(SELECT result#>>'{data,hash}'FROM firstten_policy_test.gh_results WHERE label='cap_bytes_first'),gen_random_uuid(),true)->>'code','CAPACITY','real confirmation refuses full publisher bytes');
SELECT is(public.save_guest_growth_sharing_choice(firstten_policy_test.gh_session('cap-5'),firstten_policy_test.gh_id(11005),'withdrawn',1,gen_random_uuid())->>'ok','true','publisher byte cap preserves source reduction');
RESET ROLE;
-- Fill six more publishers to2MiB and the eighth to the exact class remainder.
DO $$DECLARE n integer;p jsonb;target bigint;BEGIN FOR n IN 6..12 LOOP
 p:=public.preview_guest_growth_submission(firstten_policy_test.gh_session('cap-'||n),firstten_policy_test.gh_cap_spec(11000+n,12000+n));
 IF p->>'ok'IS DISTINCT FROM'true'THEN RAISE EXCEPTION 'Class byte positive preview failed: %',p->>'code';END IF;
 target:=least(2097152,16777216-firstten_policy_test.gh_cap_bytes()+firstten_policy_test.gh_cap_bytes(n)-(SELECT octet_length(p.payload::text)+octet_length(p.manifest::text)+octet_length(p.specification::text)FROM firstten_private.growth_submission_previews p WHERE p.id=firstten_policy_test.gh_snapshot('cap_bytes_first')));
 PERFORM firstten_policy_test.gh_cap_fill(n,target);
END LOOP;END $$;
SET LOCAL ROLE service_role;
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session('cap-13'),firstten_policy_test.gh_cap_spec(11013,12013))->>'ok','true','real first preview fills exact final class headroom');
RESET ROLE;
SELECT is(firstten_policy_test.gh_cap_bytes(),16777216::bigint,'class storage is exactly16MiB UTF8');
SELECT ok(firstten_private.growth_publication_bytes(firstten_policy_test.gh_id(10024),firstten_policy_test.gh_id(10000),0)AND NOT firstten_private.growth_publication_bytes(firstten_policy_test.gh_id(10024),firstten_policy_test.gh_id(10000),1),'class exact-byte boundary with independent publisher headroom');
SET LOCAL ROLE service_role;
SELECT is(public.preview_guest_growth_submission(firstten_policy_test.gh_session('cap-14'),firstten_policy_test.gh_cap_spec(11014,12014))->>'code','CAPACITY','real first preview refuses full class bytes');
SELECT is(public.save_guest_growth_sharing_choice(firstten_policy_test.gh_session('cap-14'),firstten_policy_test.gh_id(11014),'withdrawn',1,gen_random_uuid())->>'ok','true','class byte cap preserves source reduction');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM firstten_private.growth_submission_threads WHERE principal_id=firstten_policy_test.gh_id(10024)),0,'class byte refusal leaves no orphan thread');

SELECT 'GUEST_GROWTH_HANDOFF_DTO:'||(SELECT jsonb_object_agg(label,result)FROM firstten_policy_test.gh_results WHERE label IN('roster','preview_learning','preview_experiment','preview_pipeline_contact','preview_survey','preview_referral','preview_onboarding','copy_learning','copy_experiment','copy_pipeline_contact','copy_survey','copy_referral','copy_onboarding','author','teacher','teacher_list','withdrawn'))::text;
-- Parent identities remain until outer rollback; no deletion-service promise or old audit bypass.
