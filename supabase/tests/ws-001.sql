-- Dedicated fictional fixtures. Run only in the coordinator's rolled-back suite.
RESET ROLE;
INSERT INTO firstten_policy_test.ids(label,id) VALUES
('lifecycle_project','f9100000-0000-4000-8000-000000000001'),
('lifecycle_other','f9100000-0000-4000-8000-000000000002'),
('lifecycle_created','f9100000-0000-4000-8000-000000000003');
INSERT INTO public.projects(id,user_id,name,description,audience,problem,stage,checklist,questions,survey)
VALUES(firstten_policy_test.id('lifecycle_project'),firstten_policy_test.id('owner_a'),'Retained idea','Original description','Original audience','Original problem',3,'{"manual":true,"metrics":{"active":0}}','[{"question":"Original?"}]','[{"question":"Original survey?"}]'),
(firstten_policy_test.id('lifecycle_other'),firstten_policy_test.id('owner_b'),'Other owner','Other','Other','Other',1,'{}','[]','[]');
INSERT INTO public.contacts(id,user_id,project_id,first_name) VALUES('f9100000-0000-4000-8000-000000000011',firstten_policy_test.id('owner_a'),firstten_policy_test.id('lifecycle_project'),'Fictional participant');
INSERT INTO public.interviews(user_id,project_id,contact_id,answers,tags,completed) VALUES(firstten_policy_test.id('owner_a'),firstten_policy_test.id('lifecycle_project'),'f9100000-0000-4000-8000-000000000011','[{"q":"Question","note":"Original notes","quote":"Original words"}]',ARRAY['has problem'],true);
INSERT INTO public.learnings(user_id,project_id,title,body) VALUES(firstten_policy_test.id('owner_a'),firstten_policy_test.id('lifecycle_project'),'Original learning','Unchanged evidence');
INSERT INTO public.experiments(user_id,project_id,hypothesis,change) VALUES(firstten_policy_test.id('owner_a'),firstten_policy_test.id('lifecycle_project'),'Original hypothesis','Original test');
INSERT INTO public.outreach(user_id,project_id,title,body) VALUES(firstten_policy_test.id('owner_a'),firstten_policy_test.id('lifecycle_project'),'Original outreach','Unsent draft');
CREATE TABLE firstten_policy_test.lifecycle_before AS SELECT to_jsonb(p)-ARRAY['archived_at','lifecycle_revision','updated_at'] AS document FROM public.projects p WHERE id=firstten_policy_test.id('lifecycle_project');
CREATE TABLE firstten_policy_test.lifecycle_children_before AS SELECT jsonb_build_object(
'contacts',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.contacts c WHERE project_id=firstten_policy_test.id('lifecycle_project')),
'interviews',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.interviews c WHERE project_id=firstten_policy_test.id('lifecycle_project')),
'learnings',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.learnings c WHERE project_id=firstten_policy_test.id('lifecycle_project')),
'experiments',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.experiments c WHERE project_id=firstten_policy_test.id('lifecycle_project')),
'outreach',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.outreach c WHERE project_id=firstten_policy_test.id('lifecycle_project'))) AS document;
CREATE TABLE firstten_policy_test.lifecycle_ack(label text PRIMARY KEY,result jsonb);
GRANT SELECT ON firstten_policy_test.lifecycle_before,firstten_policy_test.lifecycle_children_before TO authenticated;
GRANT SELECT,INSERT ON firstten_policy_test.lifecycle_ack TO authenticated;
SELECT ok((SELECT archived_at IS NULL AND lifecycle_revision=0 FROM public.projects WHERE id=firstten_policy_test.id('lifecycle_project')),'legacy/default project starts active at revision zero');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='firstten_private.project_lifecycle_operations'::regclass),'retry journal has RLS');
SELECT ok(NOT has_table_privilege('authenticated','firstten_private.project_lifecycle_operations','SELECT,INSERT,UPDATE,DELETE'),'owner has no direct journal access');
SELECT ok(NOT has_table_privilege('service_role','firstten_private.project_lifecycle_operations','SELECT,INSERT,UPDATE,DELETE'),'service role has no direct journal access');
SELECT ok(NOT has_function_privilege('authenticated','firstten_private.enforce_project_lifecycle()','EXECUTE'),'owner cannot call lifecycle trigger directly');
SELECT ok(NOT has_function_privilege('anon','public.create_owned_project(uuid,uuid,text,text,text,text,text)','EXECUTE'),'anonymous cannot create private projects');
SELECT ok(NOT has_function_privilege('anon','public.set_owned_project_archived(uuid,boolean,bigint,uuid)','EXECUTE'),'anonymous cannot archive private projects');
SELECT ok(NOT has_function_privilege('service_role','public.set_owned_project_archived(uuid,boolean,bigint,uuid)','EXECUTE'),'service role cannot invoke owner archive shortcut');
SELECT ok((SELECT bool_and(prosecdef AND proconfig=ARRAY['search_path=pg_catalog']) FROM pg_proc WHERE oid IN ('public.create_owned_project(uuid,uuid,text,text,text,text,text)'::regprocedure,'public.set_owned_project_archived(uuid,boolean,bigint,uuid)'::regprocedure)),'owner RPCs have fixed definer search paths');
SELECT firstten_policy_test.set_actor('owner_a'); SET LOCAL ROLE authenticated;
INSERT INTO firstten_policy_test.lifecycle_ack SELECT 'archive',public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),true,0,'f9100000-0000-4000-8000-000000000021');
SELECT is((SELECT result->>'ok' FROM firstten_policy_test.lifecycle_ack WHERE label='archive'),'true','owner archives project');
SELECT ok((SELECT result#>>'{data,archivedAt}' IS NOT NULL FROM firstten_policy_test.lifecycle_ack WHERE label='archive'),'archive returns actual timestamp');
SELECT is((SELECT result#>>'{data,lifecycleRevision}' FROM firstten_policy_test.lifecycle_ack WHERE label='archive'),'1','archive advances lifecycle revision once');
SELECT is((SELECT count(*) FROM jsonb_object_keys((SELECT result->'data' FROM firstten_policy_test.lifecycle_ack WHERE label='archive'))),5::bigint,'lifecycle projection contains only five approved fields');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),true,0,'f9100000-0000-4000-8000-000000000021'),(SELECT result FROM firstten_policy_test.lifecycle_ack WHERE label='archive'),'identical archive retry returns original acknowledgement');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),true,1,'f9100000-0000-4000-8000-000000000021')->>'code','IDEMPOTENCY_CONFLICT','request cannot be reused with a new expected revision');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),false,0,gen_random_uuid())->>'code','REVISION_CONFLICT','stale tab cannot restore a newly archived project');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),true,0,gen_random_uuid())->>'currentRevision','1','CAS denial returns only owner current revision');
SELECT is((SELECT to_jsonb(p)-ARRAY['archived_at','lifecycle_revision','updated_at'] FROM public.projects p WHERE id=firstten_policy_test.id('lifecycle_project')),(SELECT document FROM firstten_policy_test.lifecycle_before),'archive preserves stage checklist questions survey and original project identity/content');
SELECT is(jsonb_build_object(
'contacts',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.contacts c WHERE project_id=firstten_policy_test.id('lifecycle_project')),
'interviews',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.interviews c WHERE project_id=firstten_policy_test.id('lifecycle_project')),
'learnings',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.learnings c WHERE project_id=firstten_policy_test.id('lifecycle_project')),
'experiments',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.experiments c WHERE project_id=firstten_policy_test.id('lifecycle_project')),
'outreach',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.outreach c WHERE project_id=firstten_policy_test.id('lifecycle_project'))),(SELECT document FROM firstten_policy_test.lifecycle_children_before),'archive preserves every private child byte for byte');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_other'),true,0,gen_random_uuid())->>'code','NOT_FOUND','owner cannot archive another owner project');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_other'),false,0,gen_random_uuid())->>'code','NOT_FOUND','owner cannot restore another owner project');
SELECT is(public.set_owned_project_archived('f9100000-0000-4000-8000-000000000099',true,0,gen_random_uuid())->>'code','NOT_FOUND','missing and foreign projects have same denial');
SELECT is(firstten_policy_test.attempt($case$UPDATE public.projects SET user_id=firstten_policy_test.id('owner_b') WHERE id=firstten_policy_test.id('lifecycle_project')$case$),'error:42501','archive does not permit owner reassignment');
SELECT is(firstten_policy_test.attempt($case$UPDATE public.projects SET lifecycle_revision=99 WHERE id=firstten_policy_test.id('lifecycle_project')$case$),'error:23514','owner cannot forge a lifecycle revision');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),NULL,1,gen_random_uuid())->>'code','INVALID_INPUT','null archive intent rejected');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),false,-1,gen_random_uuid())->>'code','INVALID_INPUT','negative revision rejected');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),false,9007199254740991,gen_random_uuid())->>'code','INVALID_INPUT','unsafe revision rejected');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),false,1,NULL)->>'code','INVALID_INPUT','missing request id rejected');
INSERT INTO firstten_policy_test.lifecycle_ack SELECT 'restore',public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),false,1,'f9100000-0000-4000-8000-000000000022');
SELECT is((SELECT result->>'ok' FROM firstten_policy_test.lifecycle_ack WHERE label='restore'),'true','owner restores archived project');
SELECT is((SELECT result#>>'{data,lifecycleRevision}' FROM firstten_policy_test.lifecycle_ack WHERE label='restore'),'2','restore advances lifecycle revision once');
SELECT ok((SELECT archived_at IS NULL FROM public.projects WHERE id=firstten_policy_test.id('lifecycle_project')),'restored project is active again');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),false,1,'f9100000-0000-4000-8000-000000000022'),(SELECT result FROM firstten_policy_test.lifecycle_ack WHERE label='restore'),'restore retry is idempotent');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),true,0,'f9100000-0000-4000-8000-000000000021'),(SELECT result FROM firstten_policy_test.lifecycle_ack WHERE label='archive'),'late original retry returns original acknowledgement without rearchiving');
SELECT ok((SELECT archived_at IS NULL AND lifecycle_revision=2 FROM public.projects WHERE id=firstten_policy_test.id('lifecycle_project')),'late retry cannot undo a newer explicit restore');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),false,2,gen_random_uuid())#>>'{data,lifecycleRevision}','2','same desired state acknowledgement makes no extra revision');
SELECT is(firstten_policy_test.attempt($case$UPDATE public.projects SET name='Retained idea' WHERE id=firstten_policy_test.id('lifecycle_project')$case$),'ok:1','normal legacy owner metadata writes still work');
SELECT is((SELECT lifecycle_revision FROM public.projects WHERE id=firstten_policy_test.id('lifecycle_project')),2::bigint,'ordinary content update does not create false lifecycle conflict');
INSERT INTO firstten_policy_test.lifecycle_ack SELECT 'create',public.create_owned_project(firstten_policy_test.id('lifecycle_created'),'f9100000-0000-4000-8000-000000000023',' Second idea ',' New description ',' New audience ',' New problem ',' https://example.invalid ');
SELECT is((SELECT result->>'ok' FROM firstten_policy_test.lifecycle_ack WHERE label='create'),'true','owner creates a separate idea');
SELECT is((SELECT name FROM public.projects WHERE id=firstten_policy_test.id('lifecycle_created')),'Second idea','create normalizes bounded profile text');
SELECT is((SELECT user_id FROM public.projects WHERE id=firstten_policy_test.id('lifecycle_created')),firstten_policy_test.id('owner_a'),'project owner comes from verified database subject');
SELECT ok((SELECT stage=1 AND archived_at IS NULL AND lifecycle_revision=0 FROM public.projects WHERE id=firstten_policy_test.id('lifecycle_created')),'new idea begins at default stage and active lifecycle');
SELECT is(public.create_owned_project(firstten_policy_test.id('lifecycle_created'),'f9100000-0000-4000-8000-000000000023','Second idea','New description','New audience','New problem','https://example.invalid'),(SELECT result FROM firstten_policy_test.lifecycle_ack WHERE label='create'),'create retry returns same saved result without duplicate project');
SELECT is(public.create_owned_project(firstten_policy_test.id('lifecycle_created'),'f9100000-0000-4000-8000-000000000023','Changed','New description','New audience','New problem','https://example.invalid')->>'code','IDEMPOTENCY_CONFLICT','retry cannot replace original idea fields');
SELECT is(public.create_owned_project(firstten_policy_test.id('lifecycle_created'),gen_random_uuid(),'Second idea','New description','New audience','New problem','https://example.invalid')->>'code','IDEMPOTENCY_CONFLICT','new request cannot silently adopt or replace an existing idea');
SELECT is(public.create_owned_project(firstten_policy_test.id('lifecycle_other'),gen_random_uuid(),'Attempt','Description','Audience','Problem','')->>'code','NOT_FOUND','create cannot hijack a foreign project id');
SELECT is(public.create_owned_project(gen_random_uuid(),gen_random_uuid(),'   ','Description','Audience','Problem','')->>'code','INVALID_INPUT','blank project name rejected');
SELECT is(public.create_owned_project(gen_random_uuid(),gen_random_uuid(),repeat('x',201),'Description','Audience','Problem','')->>'code','INVALID_INPUT','oversized project name rejected');
SELECT is(public.create_owned_project(gen_random_uuid(),gen_random_uuid(),'Name',NULL,'Audience','Problem','')->>'code','INVALID_INPUT','missing description rejected');
SELECT is(public.create_owned_project(gen_random_uuid(),gen_random_uuid(),'Name','Description','Audience','Problem',repeat('x',2049))->>'code','INVALID_INPUT','oversized optional link rejected');
SELECT is((SELECT to_jsonb(p)-ARRAY['archived_at','lifecycle_revision','updated_at'] FROM public.projects p WHERE id=firstten_policy_test.id('lifecycle_project')),(SELECT document FROM firstten_policy_test.lifecycle_before),'create and restore preserve previous idea and all saved activity');
RESET ROLE;
UPDATE firstten_private.project_collaboration_capability SET enabled=true;
SELECT firstten_policy_test.set_actor('owner_a'); SET LOCAL ROLE authenticated;
SELECT is(public.set_project_member(firstten_policy_test.id('lifecycle_project'),firstten_policy_test.id('editor'),'editor',0,gen_random_uuid())->>'ok','true','explicit editor grant for lifecycle boundary test');
SELECT is(public.set_project_member(firstten_policy_test.id('lifecycle_project'),firstten_policy_test.id('viewer'),'viewer',0,gen_random_uuid())->>'ok','true','explicit viewer grant for lifecycle boundary test');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),true,2,gen_random_uuid())->>'ok','true','owner archives explicitly shared summary');
RESET ROLE; SELECT firstten_policy_test.set_actor('editor'); SET LOCAL ROLE authenticated;
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),false,3,gen_random_uuid())->>'code','NOT_FOUND','editor cannot restore owner private project');
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),true,3,gen_random_uuid())->>'code','NOT_FOUND','editor cannot archive owner private project');
SELECT ok(public.get_member_project_summary(firstten_policy_test.id('lifecycle_project'))#>>'{data,archivedAt}' IS NOT NULL,'safe member summary reports real archived state');
SELECT is((SELECT count(*) FROM jsonb_object_keys(public.get_member_project_summary(firstten_policy_test.id('lifecycle_project'))->'data')),6::bigint,'member summary retains exactly six fields');
SELECT is(firstten_policy_test.attempt($case$UPDATE public.projects SET archived_at=NULL WHERE id=firstten_policy_test.id('lifecycle_project')$case$),'ok:0','editor cannot bypass lifecycle RPC using direct table update');
SELECT is(firstten_policy_test.attempt($case$DELETE FROM public.projects WHERE id=firstten_policy_test.id('lifecycle_project')$case$),'ok:0','editor cannot delete archived owner project');
SELECT is(firstten_policy_test.visible_count('contacts','f9100000-0000-4000-8000-000000000011'),0::bigint,'archive does not grant editor access to private participant data');
RESET ROLE; SELECT firstten_policy_test.set_actor('viewer'); SET LOCAL ROLE authenticated;
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),false,3,gen_random_uuid())->>'code','NOT_FOUND','viewer cannot restore owner project');
SELECT is(firstten_policy_test.attempt($case$DELETE FROM public.projects WHERE id=firstten_policy_test.id('lifecycle_project')$case$),'ok:0','viewer cannot delete archived owner project');
RESET ROLE; SELECT firstten_policy_test.set_actor('owner_b'); SET LOCAL ROLE authenticated;
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),true,0,'f9100000-0000-4000-8000-000000000021')->>'code','NOT_FOUND','foreign actor cannot replay owner acknowledgement');
SELECT is(firstten_policy_test.attempt($case$DELETE FROM public.projects WHERE id=firstten_policy_test.id('lifecycle_project')$case$),'ok:0','unrelated owner cannot delete archived project');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true); SET LOCAL ROLE authenticated;
SELECT is(public.set_owned_project_archived(firstten_policy_test.id('lifecycle_project'),false,3,gen_random_uuid())->>'code','AUTH_REQUIRED','subjectless authenticated role cannot restore');
SELECT is(public.create_owned_project(gen_random_uuid(),gen_random_uuid(),'Name','Description','Audience','Problem','')->>'code','AUTH_REQUIRED','subjectless authenticated role cannot create');
RESET ROLE; SET LOCAL ROLE anon;
SELECT is(firstten_policy_test.attempt($case$SELECT public.set_owned_project_archived('f9100000-0000-4000-8000-000000000001',false,3,gen_random_uuid())$case$),'error:42501','actual anonymous role cannot execute lifecycle RPC');
RESET ROLE;
SELECT is((SELECT count(*) FROM firstten_private.project_lifecycle_operations WHERE project_id=firstten_policy_test.id('lifecycle_created')),1::bigint,'create retry records one durable acknowledgement');
SELECT is((SELECT count(*) FROM public.projects WHERE id IN (firstten_policy_test.id('lifecycle_project'),firstten_policy_test.id('lifecycle_other'),firstten_policy_test.id('lifecycle_created'))),3::bigint,'all three ideas remain intact after lifecycle and denied deletion operations');
