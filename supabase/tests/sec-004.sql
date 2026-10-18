-- All fictional rows and flag changes are rolled back by scripts/test-policies.mjs.
RESET ROLE;
-- Dedicated scope: SEC-003 intentionally deletes its own base project before this file.
INSERT INTO firstten_policy_test.ids(label,id) VALUES
('membership_project_a','f6100000-0000-4000-8000-000000000001'),
('membership_project_a2','f6100000-0000-4000-8000-000000000002'),
('membership_project_b','f6100000-0000-4000-8000-000000000003'),
('membership_contact_a','f6100000-0000-4000-8000-000000000004'),
('membership_interview_a','f6100000-0000-4000-8000-000000000005'),
('membership_learning_a','f6100000-0000-4000-8000-000000000006'),
('membership_experiment_a','f6100000-0000-4000-8000-000000000007'),
('membership_outreach_a','f6100000-0000-4000-8000-000000000008');
INSERT INTO public.projects(id,user_id,name,stage) VALUES(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('owner_a'),'Owner-approved membership fixture',2),(firstten_policy_test.id('membership_project_a2'),firstten_policy_test.id('owner_a'),'Separate private project',2),(firstten_policy_test.id('membership_project_b'),firstten_policy_test.id('owner_b'),'Unrelated project',2);
INSERT INTO public.contacts(id,user_id,project_id,first_name) VALUES(firstten_policy_test.id('membership_contact_a'),firstten_policy_test.id('owner_a'),firstten_policy_test.id('membership_project_a'),'Private contact');
INSERT INTO public.interviews(id,user_id,project_id,contact_id,completed) VALUES(firstten_policy_test.id('membership_interview_a'),firstten_policy_test.id('owner_a'),firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('membership_contact_a'),true);
INSERT INTO public.learnings(id,user_id,project_id,title,body) VALUES(firstten_policy_test.id('membership_learning_a'),firstten_policy_test.id('owner_a'),firstten_policy_test.id('membership_project_a'),'Private learning','Private evidence');
INSERT INTO public.experiments(id,user_id,project_id,hypothesis,change) VALUES(firstten_policy_test.id('membership_experiment_a'),firstten_policy_test.id('owner_a'),firstten_policy_test.id('membership_project_a'),'Private hypothesis','Private change');
INSERT INTO public.outreach(id,user_id,project_id,title,body) VALUES(firstten_policy_test.id('membership_outreach_a'),firstten_policy_test.id('owner_a'),firstten_policy_test.id('membership_project_a'),'Private draft','Private copy');
INSERT INTO public.marketing_plans(user_id,project_id,document,last_mutation_id,last_mutation_hash) VALUES(firstten_policy_test.id('owner_a'),firstten_policy_test.id('membership_project_a'),$doc${"schemaVersion": 1, "studentFirst": {"columns": [], "notes": [], "audience": "", "usefulAction": "", "channelIdeas": [], "completedAt": null}, "audience": {"beachhead": "", "situation": "", "usefulAction": "", "valueProposition": "", "sourceIds": [], "assumptions": [], "unknowns": []}, "sources": [], "channels": [], "selection": {"primaryId": null, "alternativeId": null, "reason": ""}, "assets": [], "resources": {"cashBudgetCents": 0, "availableMinutes": null, "existingResources": [], "limitations": [], "aiUse": "manual_only", "fallback": ""}, "test": {"state": "draft", "startOn": null, "endOn": null, "reviewOn": null, "startedAt": null, "primaryMetric": "useful_action", "baselineMeasurementId": null, "target": null, "unknownBaselineOrTarget": "", "measurementPlan": "", "repeatIf": "", "reviseIf": "", "stopIf": "", "tasks": []}, "measurements": [], "rates": [], "reflection": {"decision": null, "evidenceIds": [], "learned": "", "uncertainty": "", "nextAction": "", "reviewedOn": null}}$doc$,gen_random_uuid(),repeat('0',64));
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.project_members'::regclass),'membership RLS enabled');
SELECT ok(NOT has_table_privilege('authenticated','public.project_members','INSERT,UPDATE,DELETE'),'no direct authenticated membership mutation');
SELECT ok(NOT has_table_privilege('service_role','public.project_members','SELECT,INSERT,UPDATE,DELETE'),'no service-role membership shortcut');
SELECT ok(NOT has_column_privilege('authenticated','public.project_members','created_by','SELECT'),'grantor is absent from direct safe membership projection');
SELECT ok(NOT has_function_privilege('anon','public.set_project_member(uuid,uuid,text,bigint,uuid)','EXECUTE'),'anonymous cannot grant');
SELECT ok(NOT has_function_privilege('service_role','public.set_project_member(uuid,uuid,text,bigint,uuid)','EXECUTE'),'service role cannot bypass caller identity');
SELECT ok(NOT has_function_privilege('authenticated','firstten_private.mutate_project_member(text,uuid,uuid,text,bigint,uuid)','EXECUTE'),'internal mutation helper cannot be called directly');
SELECT ok(NOT has_table_privilege('authenticated','firstten_private.membership_operations','SELECT,INSERT,UPDATE,DELETE'),'operation journal private');
SELECT ok(NOT has_table_privilege('authenticated','firstten_private.membership_audit','SELECT,INSERT,UPDATE,DELETE'),'membership audit private');
SELECT ok((SELECT bool_and(prosecdef AND proconfig=ARRAY['search_path=pg_catalog']) FROM pg_proc WHERE oid IN ('public.set_project_member(uuid,uuid,text,bigint,uuid)'::regprocedure,'public.revoke_project_member(uuid,uuid,bigint,uuid)'::regprocedure,'public.current_project_role(uuid)'::regprocedure,'public.get_member_project_summary(uuid)'::regprocedure,'public.list_project_members(uuid,uuid)'::regprocedure)),'all access RPCs use definer and fixed search path');
SELECT firstten_policy_test.set_actor('owner_a'); SET LOCAL ROLE authenticated;
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('editor'),'editor',0,gen_random_uuid())->>'code','FEATURE_DISABLED','collaboration defaults off');
SELECT is(public.get_member_project_summary(firstten_policy_test.id('membership_project_a'))->>'code','FEATURE_DISABLED','summary surface defaults off');
SELECT is(public.current_project_role(firstten_policy_test.id('membership_project_a')),'owner','ownership is derived even with collaboration disabled');
SELECT is(firstten_policy_test.attempt('UPDATE firstten_private.project_collaboration_capability SET enabled=true'),'error:42501','owner cannot enable server capability');
RESET ROLE;
UPDATE firstten_private.project_collaboration_capability SET enabled=true;
CREATE TABLE firstten_policy_test.membership_ack(label text PRIMARY KEY,result jsonb);
GRANT SELECT,INSERT ON firstten_policy_test.membership_ack TO authenticated;
SELECT firstten_policy_test.set_actor('owner_a'); SET LOCAL ROLE authenticated;
INSERT INTO firstten_policy_test.membership_ack SELECT 'editor',public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('editor'),'editor',0,'f6000000-0000-4000-8000-000000000001');
SELECT is((SELECT result->>'ok' FROM firstten_policy_test.membership_ack WHERE label='editor'),'true','owner grants explicitly identified editor');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('editor'),'editor',0,'f6000000-0000-4000-8000-000000000001'),(SELECT result FROM firstten_policy_test.membership_ack WHERE label='editor'),'identical retry returns same saved acknowledgement');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('editor'),'viewer',0,'f6000000-0000-4000-8000-000000000001')->>'code','IDEMPOTENCY_CONFLICT','same request cannot change role');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('editor'),'editor',1,'f6000000-0000-4000-8000-000000000001')->>'code','IDEMPOTENCY_CONFLICT','expected revision included in replay payload');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('viewer'),'viewer',0,gen_random_uuid())->>'ok','true','owner grants viewer');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('owner_a'),'viewer',0,gen_random_uuid())->>'code','FORBIDDEN','owner cannot demote self');
SELECT is(public.revoke_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('owner_a'),0,gen_random_uuid())->>'code','FORBIDDEN','owner cannot revoke derived ownership');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('student'),'owner',0,gen_random_uuid())->>'code','INVALID_INPUT','owner cannot grant owner role');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('student'),'admin',0,gen_random_uuid())->>'code','INVALID_INPUT','owner cannot grant platform admin');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),'f6000000-0000-4000-8000-000000000099','viewer',0,gen_random_uuid())->>'code','NOT_FOUND','explicit nonexistent target safely denied');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_b'),firstten_policy_test.id('editor'),'viewer',0,gen_random_uuid())->>'code','NOT_FOUND','owner cannot grant another owner project');
SELECT is(jsonb_array_length(public.list_project_members(firstten_policy_test.id('membership_project_a'))->'data'->'items'),2,'owner can inspect minimal roster');
SELECT is(firstten_policy_test.attempt('SELECT created_by FROM public.project_members'),'error:42501','direct SELECT cannot include hidden creator field');
SELECT is(firstten_policy_test.attempt($case$UPDATE public.project_members SET role='editor'$case$),'error:42501','owner cannot bypass CAS with direct update');
SELECT is(firstten_policy_test.attempt('DELETE FROM public.project_members'),'error:42501','owner cannot bypass audit with direct delete');
RESET ROLE;
-- Exercise actual anonymous/subjectless calls, beyond ACL inspection.
SET LOCAL ROLE anon;
SELECT is(firstten_policy_test.attempt('SELECT id FROM public.project_members'),'error:42501','anonymous direct membership read denied');
SELECT is(firstten_policy_test.attempt($case$SELECT public.get_member_project_summary('f6100000-0000-4000-8000-000000000001')$case$),'error:42501','anonymous direct summary RPC denied');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.list_project_members(firstten_policy_test.id('membership_project_a'))->>'code','AUTH_REQUIRED','authenticated SQL role without actual identity is denied');
RESET ROLE;
-- Pagination is bounded in SQL, not just the TypeScript adapter.
INSERT INTO auth.users(id,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
SELECT ('f6300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','{}','{}',now(),now() FROM generate_series(1,51) n;
INSERT INTO public.project_members(project_id,user_id,created_by,role)
SELECT firstten_policy_test.id('membership_project_a2'),('f6300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,firstten_policy_test.id('owner_a'),'viewer' FROM generate_series(1,51) n;
SELECT firstten_policy_test.set_actor('owner_a');SET LOCAL ROLE authenticated;
INSERT INTO firstten_policy_test.membership_ack SELECT 'page',public.list_project_members(firstten_policy_test.id('membership_project_a2'));
SELECT is(jsonb_array_length((SELECT result#>'{data,items}' FROM firstten_policy_test.membership_ack WHERE label='page')),50,'owner roster first page is capped at fifty');
SELECT ok((SELECT result#>>'{data,nextCursor}' IS NOT NULL FROM firstten_policy_test.membership_ack WHERE label='page'),'full roster returns an explicit next cursor');
SELECT is(jsonb_array_length(public.list_project_members(firstten_policy_test.id('membership_project_a2'),(SELECT (result#>>'{data,nextCursor}')::uuid FROM firstten_policy_test.membership_ack WHERE label='page'))#>'{data,items}'),1,'next page contains only remaining grant');
RESET ROLE;
-- Seed a real private lesson in the same shared project; joining must not reveal it.
INSERT INTO public.teacher_plans(user_id,project_id,document,last_mutation_id,last_mutation_hash) VALUES(firstten_policy_test.id('owner_a'),firstten_policy_test.id('membership_project_a'),'{"schemaVersion":1,"className":"Private lesson","audience":"","learningObjectives":[],"assignment":"","sessionMinutes":60,"plannedLearners":null,"scheduledOn":null,"assessment":"","facilitatorNotes":"Private notes"}',gen_random_uuid(),repeat('0',64));
SELECT is((SELECT count(*) FROM public.project_members WHERE project_id=firstten_policy_test.id('membership_project_a') AND user_id=firstten_policy_test.id('owner_a')),0::bigint,'no duplicated owner membership');
SELECT is((SELECT count(*) FROM firstten_private.membership_audit WHERE project_id=firstten_policy_test.id('membership_project_a')),2::bigint,'successful grants audit atomically; retries and denials add no audit');
SELECT is((SELECT count(*) FROM firstten_private.membership_operations WHERE project_id=firstten_policy_test.id('membership_project_a')),2::bigint,'one durable operation journal entry per saved intent');
SELECT is(firstten_policy_test.attempt($case$UPDATE public.project_members SET project_id=firstten_policy_test.id('membership_project_a2'),revision=revision+1 WHERE user_id=firstten_policy_test.id('editor')$case$),'error:23514','identity trigger prevents moving grant even with elevated table access');
SELECT is(firstten_policy_test.attempt($case$UPDATE public.project_members SET created_by=firstten_policy_test.id('owner_b'),revision=revision+1 WHERE user_id=firstten_policy_test.id('editor')$case$),'error:23514','grantor immutable');
SELECT is(firstten_policy_test.attempt($case$INSERT INTO public.project_members(project_id,user_id,created_by,role) VALUES(firstten_policy_test.id('membership_project_b'),firstten_policy_test.id('student'),firstten_policy_test.id('owner_a'),'viewer')$case$),'error:23503','composite FK prevents cross-owner grantor');

RESET ROLE;SELECT firstten_policy_test.set_actor('editor');SET LOCAL ROLE authenticated;
SELECT is(firstten_policy_test.visible_count('projects',firstten_policy_test.id('membership_project_a')),0::bigint,'editor cannot read private projects');
SELECT is(firstten_policy_test.visible_count('contacts',firstten_policy_test.id('membership_contact_a')),0::bigint,'editor cannot read private contacts');
SELECT is(firstten_policy_test.visible_count('interviews',firstten_policy_test.id('membership_interview_a')),0::bigint,'editor cannot read private interviews');
SELECT is(firstten_policy_test.visible_count('learnings',firstten_policy_test.id('membership_learning_a')),0::bigint,'editor cannot read private learnings');
SELECT is(firstten_policy_test.visible_count('experiments',firstten_policy_test.id('membership_experiment_a')),0::bigint,'editor cannot read private experiments');
SELECT is(firstten_policy_test.visible_count('outreach',firstten_policy_test.id('membership_outreach_a')),0::bigint,'editor cannot read private outreach');
SELECT is((SELECT count(*) FROM public.teacher_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'editor cannot read private lesson');
SELECT is((SELECT count(*) FROM public.marketing_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'editor cannot read private marketing plan');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('editor'),'editor',1,gen_random_uuid())->>'code','NOT_FOUND','editor cannot self-promote or change grants');
SELECT is(public.revoke_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('viewer'),1,gen_random_uuid())->>'code','NOT_FOUND','editor cannot revoke another grant');
SELECT is(public.current_project_role(firstten_policy_test.id('membership_project_a')),'editor','editor resolves current actual grant');
SELECT is((SELECT count(*) FROM public.project_members WHERE project_id=firstten_policy_test.id('membership_project_a')),1::bigint,'member sees only own active grant');
SELECT is(jsonb_array_length(public.list_project_members(firstten_policy_test.id('membership_project_a'))->'data'->'items'),1,'member roster exposes self only');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(public.get_member_project_summary(firstten_policy_test.id('membership_project_a'))->'data') k),ARRAY['archivedAt','id','membershipRevision','name','role','updatedAt']::text[],'summary exposes exactly six allowlisted fields');
SELECT is(public.get_member_project_summary(firstten_policy_test.id('membership_project_a2'))->>'code','NOT_FOUND','membership never applies to another project of same owner');

RESET ROLE;SELECT firstten_policy_test.set_actor('viewer');SET LOCAL ROLE authenticated;
SELECT is(firstten_policy_test.visible_count('projects',firstten_policy_test.id('membership_project_a')),0::bigint,'viewer cannot read private projects');
SELECT is(firstten_policy_test.visible_count('contacts',firstten_policy_test.id('membership_contact_a')),0::bigint,'viewer cannot read private contacts');
SELECT is(firstten_policy_test.visible_count('interviews',firstten_policy_test.id('membership_interview_a')),0::bigint,'viewer cannot read private interviews');
SELECT is(firstten_policy_test.visible_count('learnings',firstten_policy_test.id('membership_learning_a')),0::bigint,'viewer cannot read private learnings');
SELECT is(firstten_policy_test.visible_count('experiments',firstten_policy_test.id('membership_experiment_a')),0::bigint,'viewer cannot read private experiments');
SELECT is(firstten_policy_test.visible_count('outreach',firstten_policy_test.id('membership_outreach_a')),0::bigint,'viewer cannot read private outreach');
SELECT is((SELECT count(*) FROM public.teacher_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'viewer cannot read private lesson');
SELECT is((SELECT count(*) FROM public.marketing_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'viewer cannot read private marketing plan');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('viewer'),'editor',1,gen_random_uuid())->>'code','NOT_FOUND','viewer cannot self-promote or change grants');
SELECT is(public.revoke_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('viewer'),1,gen_random_uuid())->>'code','NOT_FOUND','viewer cannot revoke another grant');
SELECT is(public.current_project_role(firstten_policy_test.id('membership_project_a')),'viewer','viewer resolves current actual grant');
SELECT is((SELECT count(*) FROM public.project_members WHERE project_id=firstten_policy_test.id('membership_project_a')),1::bigint,'member sees only own active grant');
SELECT is(jsonb_array_length(public.list_project_members(firstten_policy_test.id('membership_project_a'))->'data'->'items'),1,'member roster exposes self only');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(public.get_member_project_summary(firstten_policy_test.id('membership_project_a'))->'data') k),ARRAY['archivedAt','id','membershipRevision','name','role','updatedAt']::text[],'summary exposes exactly six allowlisted fields');
SELECT is(public.get_member_project_summary(firstten_policy_test.id('membership_project_a2'))->>'code','NOT_FOUND','membership never applies to another project of same owner');

RESET ROLE;SELECT firstten_policy_test.set_actor('student');SET LOCAL ROLE authenticated;
SELECT is(firstten_policy_test.visible_count('projects',firstten_policy_test.id('membership_project_a')),0::bigint,'student cannot read private projects');
SELECT is(firstten_policy_test.visible_count('contacts',firstten_policy_test.id('membership_contact_a')),0::bigint,'student cannot read private contacts');
SELECT is(firstten_policy_test.visible_count('interviews',firstten_policy_test.id('membership_interview_a')),0::bigint,'student cannot read private interviews');
SELECT is(firstten_policy_test.visible_count('learnings',firstten_policy_test.id('membership_learning_a')),0::bigint,'student cannot read private learnings');
SELECT is(firstten_policy_test.visible_count('experiments',firstten_policy_test.id('membership_experiment_a')),0::bigint,'student cannot read private experiments');
SELECT is(firstten_policy_test.visible_count('outreach',firstten_policy_test.id('membership_outreach_a')),0::bigint,'student cannot read private outreach');
SELECT is((SELECT count(*) FROM public.teacher_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'student cannot read private lesson');
SELECT is((SELECT count(*) FROM public.marketing_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'student cannot read private marketing plan');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('student'),'editor',1,gen_random_uuid())->>'code','NOT_FOUND','student cannot self-promote or change grants');
SELECT is(public.revoke_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('viewer'),1,gen_random_uuid())->>'code','NOT_FOUND','student cannot revoke another grant');
SELECT is(public.get_member_project_summary(firstten_policy_test.id('membership_project_a'))->>'code','NOT_FOUND','unrelated identity gets no project summary');
SELECT is((SELECT count(*) FROM public.project_members WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'unrelated identity cannot read membership roster');

RESET ROLE;SELECT firstten_policy_test.set_actor('teacher');SET LOCAL ROLE authenticated;
SELECT is(firstten_policy_test.visible_count('projects',firstten_policy_test.id('membership_project_a')),0::bigint,'teacher cannot read private projects');
SELECT is(firstten_policy_test.visible_count('contacts',firstten_policy_test.id('membership_contact_a')),0::bigint,'teacher cannot read private contacts');
SELECT is(firstten_policy_test.visible_count('interviews',firstten_policy_test.id('membership_interview_a')),0::bigint,'teacher cannot read private interviews');
SELECT is(firstten_policy_test.visible_count('learnings',firstten_policy_test.id('membership_learning_a')),0::bigint,'teacher cannot read private learnings');
SELECT is(firstten_policy_test.visible_count('experiments',firstten_policy_test.id('membership_experiment_a')),0::bigint,'teacher cannot read private experiments');
SELECT is(firstten_policy_test.visible_count('outreach',firstten_policy_test.id('membership_outreach_a')),0::bigint,'teacher cannot read private outreach');
SELECT is((SELECT count(*) FROM public.teacher_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'teacher cannot read private lesson');
SELECT is((SELECT count(*) FROM public.marketing_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'teacher cannot read private marketing plan');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('teacher'),'editor',1,gen_random_uuid())->>'code','NOT_FOUND','teacher cannot self-promote or change grants');
SELECT is(public.revoke_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('viewer'),1,gen_random_uuid())->>'code','NOT_FOUND','teacher cannot revoke another grant');
SELECT is(public.get_member_project_summary(firstten_policy_test.id('membership_project_a'))->>'code','NOT_FOUND','unrelated identity gets no project summary');
SELECT is((SELECT count(*) FROM public.project_members WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'unrelated identity cannot read membership roster');

RESET ROLE;SELECT firstten_policy_test.set_actor('unrelated');SET LOCAL ROLE authenticated;
SELECT is(firstten_policy_test.visible_count('projects',firstten_policy_test.id('membership_project_a')),0::bigint,'unrelated cannot read private projects');
SELECT is(firstten_policy_test.visible_count('contacts',firstten_policy_test.id('membership_contact_a')),0::bigint,'unrelated cannot read private contacts');
SELECT is(firstten_policy_test.visible_count('interviews',firstten_policy_test.id('membership_interview_a')),0::bigint,'unrelated cannot read private interviews');
SELECT is(firstten_policy_test.visible_count('learnings',firstten_policy_test.id('membership_learning_a')),0::bigint,'unrelated cannot read private learnings');
SELECT is(firstten_policy_test.visible_count('experiments',firstten_policy_test.id('membership_experiment_a')),0::bigint,'unrelated cannot read private experiments');
SELECT is(firstten_policy_test.visible_count('outreach',firstten_policy_test.id('membership_outreach_a')),0::bigint,'unrelated cannot read private outreach');
SELECT is((SELECT count(*) FROM public.teacher_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'unrelated cannot read private lesson');
SELECT is((SELECT count(*) FROM public.marketing_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'unrelated cannot read private marketing plan');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('unrelated'),'editor',1,gen_random_uuid())->>'code','NOT_FOUND','unrelated cannot self-promote or change grants');
SELECT is(public.revoke_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('viewer'),1,gen_random_uuid())->>'code','NOT_FOUND','unrelated cannot revoke another grant');
SELECT is(public.get_member_project_summary(firstten_policy_test.id('membership_project_a'))->>'code','NOT_FOUND','unrelated identity gets no project summary');
SELECT is((SELECT count(*) FROM public.project_members WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'unrelated identity cannot read membership roster');

RESET ROLE;SELECT firstten_policy_test.set_actor('admin');SET LOCAL ROLE authenticated;
SELECT is(firstten_policy_test.visible_count('projects',firstten_policy_test.id('membership_project_a')),0::bigint,'admin cannot read private projects');
SELECT is(firstten_policy_test.visible_count('contacts',firstten_policy_test.id('membership_contact_a')),0::bigint,'admin cannot read private contacts');
SELECT is(firstten_policy_test.visible_count('interviews',firstten_policy_test.id('membership_interview_a')),0::bigint,'admin cannot read private interviews');
SELECT is(firstten_policy_test.visible_count('learnings',firstten_policy_test.id('membership_learning_a')),0::bigint,'admin cannot read private learnings');
SELECT is(firstten_policy_test.visible_count('experiments',firstten_policy_test.id('membership_experiment_a')),0::bigint,'admin cannot read private experiments');
SELECT is(firstten_policy_test.visible_count('outreach',firstten_policy_test.id('membership_outreach_a')),0::bigint,'admin cannot read private outreach');
SELECT is((SELECT count(*) FROM public.teacher_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'admin cannot read private lesson');
SELECT is((SELECT count(*) FROM public.marketing_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'admin cannot read private marketing plan');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('admin'),'editor',1,gen_random_uuid())->>'code','NOT_FOUND','admin cannot self-promote or change grants');
SELECT is(public.revoke_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('viewer'),1,gen_random_uuid())->>'code','NOT_FOUND','admin cannot revoke another grant');
SELECT is(public.get_member_project_summary(firstten_policy_test.id('membership_project_a'))->>'code','NOT_FOUND','unrelated identity gets no project summary');
SELECT is((SELECT count(*) FROM public.project_members WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'unrelated identity cannot read membership roster');

RESET ROLE;SELECT firstten_policy_test.set_actor('owner_b');SET LOCAL ROLE authenticated;
SELECT is(firstten_policy_test.visible_count('projects',firstten_policy_test.id('membership_project_a')),0::bigint,'owner_b cannot read private projects');
SELECT is(firstten_policy_test.visible_count('contacts',firstten_policy_test.id('membership_contact_a')),0::bigint,'owner_b cannot read private contacts');
SELECT is(firstten_policy_test.visible_count('interviews',firstten_policy_test.id('membership_interview_a')),0::bigint,'owner_b cannot read private interviews');
SELECT is(firstten_policy_test.visible_count('learnings',firstten_policy_test.id('membership_learning_a')),0::bigint,'owner_b cannot read private learnings');
SELECT is(firstten_policy_test.visible_count('experiments',firstten_policy_test.id('membership_experiment_a')),0::bigint,'owner_b cannot read private experiments');
SELECT is(firstten_policy_test.visible_count('outreach',firstten_policy_test.id('membership_outreach_a')),0::bigint,'owner_b cannot read private outreach');
SELECT is((SELECT count(*) FROM public.teacher_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'owner_b cannot read private lesson');
SELECT is((SELECT count(*) FROM public.marketing_plans WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'owner_b cannot read private marketing plan');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('owner_b'),'editor',1,gen_random_uuid())->>'code','NOT_FOUND','owner_b cannot self-promote or change grants');
SELECT is(public.revoke_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('viewer'),1,gen_random_uuid())->>'code','NOT_FOUND','owner_b cannot revoke another grant');
SELECT is(public.get_member_project_summary(firstten_policy_test.id('membership_project_a'))->>'code','NOT_FOUND','unrelated identity gets no project summary');
SELECT is((SELECT count(*) FROM public.project_members WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'unrelated identity cannot read membership roster');

RESET ROLE;SELECT firstten_policy_test.set_actor('owner_a');SET LOCAL ROLE authenticated;
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('editor'),'viewer',1,'f6000000-0000-4000-8000-000000000002')->'data'->>'revision','2','owner downgrade increments once');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('editor'),'editor',1,gen_random_uuid())->>'code','REVISION_CONFLICT','stale simultaneous revision cannot overwrite downgrade');
SELECT is(public.revoke_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('editor'),1,gen_random_uuid())->>'code','REVISION_CONFLICT','stale revoke must refresh revision');
RESET ROLE;SELECT firstten_policy_test.set_actor('editor');SET LOCAL ROLE authenticated;
SELECT is(public.current_project_role(firstten_policy_test.id('membership_project_a')),'viewer','stale editor JWT resolves downgraded viewer immediately');
SELECT is(public.get_member_project_summary(firstten_policy_test.id('membership_project_a'))->'data'->>'membershipRevision','2','summary reports updated grant revision');
RESET ROLE;SELECT firstten_policy_test.set_actor('owner_a');SET LOCAL ROLE authenticated;
SELECT is(public.revoke_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('editor'),2,'f6000000-0000-4000-8000-000000000003')->'data'->>'state','revoked','owner revokes downgraded grant');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('editor'),'editor',0,'f6000000-0000-4000-8000-000000000001'),(SELECT result FROM firstten_policy_test.membership_ack WHERE label='editor'),'old intent still returns original receipt without reapplying grant');
RESET ROLE;SELECT firstten_policy_test.set_actor('editor');SET LOCAL ROLE authenticated;
SELECT is(public.current_project_role(firstten_policy_test.id('membership_project_a')),NULL::text,'revoked member immediately loses role');
SELECT is(public.get_member_project_summary(firstten_policy_test.id('membership_project_a'))->>'code','NOT_FOUND','revoked member cannot retrieve summary');
SELECT is(public.list_project_members(firstten_policy_test.id('membership_project_a'))->>'code','NOT_FOUND','revoked member cannot list even stale own grant');
SELECT is((SELECT count(*) FROM public.project_members WHERE project_id=firstten_policy_test.id('membership_project_a')),0::bigint,'revoked membership is no longer directly visible');
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('editor'),'editor',0,'f6000000-0000-4000-8000-000000000001')->>'code','NOT_FOUND','revoked actor cannot replay owner intent');
RESET ROLE;SELECT firstten_policy_test.set_actor('owner_a');SET LOCAL ROLE authenticated;
SELECT is(public.set_project_member(firstten_policy_test.id('membership_project_a'),firstten_policy_test.id('editor'),'editor',3,gen_random_uuid())->'data'->>'revision','4','owner can explicitly regrant with current revision');
RESET ROLE;
SELECT is((SELECT count(*) FROM firstten_private.membership_audit WHERE project_id=firstten_policy_test.id('membership_project_a')),5::bigint,'grant/downgrade/revoke/regrant audit matches saved operations');
SELECT is((SELECT revision FROM public.project_members WHERE project_id=firstten_policy_test.id('membership_project_a') AND user_id=firstten_policy_test.id('editor')),4::bigint,'old replay did not alter final current revision');
-- Account removal deletes only that subject grant, never the project or another grant.
DELETE FROM auth.users WHERE id=firstten_policy_test.id('editor');
SELECT is((SELECT count(*) FROM public.projects WHERE id=firstten_policy_test.id('membership_project_a')),1::bigint,'collaborator account removal preserves owner project');
SELECT is((SELECT count(*) FROM public.project_members WHERE project_id=firstten_policy_test.id('membership_project_a')),1::bigint,'collaborator account removal preserves other member');
UPDATE firstten_private.project_collaboration_capability SET enabled=false;
SELECT firstten_policy_test.set_actor('viewer');SET LOCAL ROLE authenticated;
SELECT is(public.current_project_role(firstten_policy_test.id('membership_project_a')),NULL::text,'operator kill switch removes member capability');
SELECT is(public.get_member_project_summary(firstten_policy_test.id('membership_project_a'))->>'code','FEATURE_DISABLED','disabled capability blocks direct RPC');
RESET ROLE;SELECT firstten_policy_test.set_actor('owner_a');SET LOCAL ROLE authenticated;
SELECT is(firstten_policy_test.visible_count('interviews',firstten_policy_test.id('membership_interview_a')),1::bigint,'owner private access remains available while collaboration disabled');
RESET ROLE;
-- Restore fixture account for later independent test files; the surrounding transaction rolls back everything.
INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES(firstten_policy_test.id('editor'),'authenticated','authenticated','restored-editor-policy@example.invalid','',now(),'{}','{}',now(),now());
DELETE FROM public.teacher_plans WHERE project_id=firstten_policy_test.id('membership_project_a');
