-- Fictional rollback-only metadata/event fixtures. Production collection stays disabled.
RESET ROLE;
-- BEGIN_AN003_TEST_ONLY_READINESS_SETUP
-- Fake unscheduled metadata for policy-unit assertions, never runtime scheduler proof.
DO $fixture$
BEGIN
 IF to_regclass('firstten_private.product_retention_state')IS NOT NULL THEN
  IF to_regnamespace('cron')IS NOT NULL THEN RAISE EXCEPTION'AN003 policy fixture refuses existing cron namespace';END IF;
  CREATE TEMP TABLE an003_retention_original ON COMMIT PRESERVE ROWS AS SELECT * FROM firstten_private.product_retention_state;
  CREATE SCHEMA cron;
  COMMENT ON SCHEMA cron IS 'FIRSTTEN_AN003_TEST_ONLY_UNSCHEDULED_METADATA';
  CREATE TABLE cron.job(jobid bigint PRIMARY KEY,jobname text,schedule text,command text,database text,username text,active boolean);
  CREATE TABLE cron.job_run_details(jobid bigint,runid bigint PRIMARY KEY,job_pid integer,status text,start_time timestamptz,end_time timestamptz);
  INSERT INTO cron.job VALUES(1,'firstten-owner-measurement-retention-v1','*/5 * * * *',firstten_private.retention_job_command(),current_database(),current_user,true);
  INSERT INTO cron.job_run_details VALUES(1,1,NULL,'succeeded',clock_timestamp()-interval'1 second',clock_timestamp());
  UPDATE firstten_private.product_retention_state SET job_id=1,job_name='firstten-owner-measurement-retention-v1',job_schedule='*/5 * * * *',job_database=current_database(),job_username=current_user,last_run_id=1,last_attempt_at=clock_timestamp()-interval'1 second',last_drained_at=clock_timestamp(),last_outcome='drained',removed_rows=0;
 END IF;
END $fixture$;
-- END_AN003_TEST_ONLY_READINESS_SETUP
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)VALUES('c2500000-0000-4000-8000-000000000001','authenticated','authenticated','measurement-fixture@example.invalid','{"synthetic":true}','{}'),('c2500000-0000-4000-8000-000000000002','authenticated','authenticated','measurement-other@example.invalid','{}','{}');
INSERT INTO firstten_policy_test.ids(label,id)VALUES('an_owner','c2500000-0000-4000-8000-000000000001'),('an_other','c2500000-0000-4000-8000-000000000002');
SELECT ok(NOT(SELECT enabled FROM firstten_private.product_measurement_policy),'measurement begins disabled');
SELECT ok(NOT has_table_privilege('authenticated','firstten_private.product_event_log','SELECT,INSERT,UPDATE,DELETE'),'owner cannot read or forge event rows');
SELECT ok(NOT has_table_privilege('service_role','firstten_private.product_event_log','SELECT,INSERT,UPDATE,DELETE'),'service key has no raw event table shortcut');
SELECT ok(NOT has_function_privilege('anon','public.save_product_measurement_preference(text,bigint,uuid)','EXECUTE'),'anonymous cannot change account measurement');
SELECT ok(NOT has_function_privilege('authenticated','public.purge_expired_product_measurement(integer)','EXECUTE'),'owner cannot invoke privileged purge');
SELECT ok(NOT has_function_privilege('service_role','firstten_private.record_owner_product_milestone()','EXECUTE'),'no generic authoritative ingestion function');
SET LOCAL ROLE authenticated;SELECT firstten_policy_test.set_actor('an_owner');
SELECT is(public.get_product_measurement_preference()#>>'{data,choice}','unknown','historical absent choice remains unknown');
SELECT is(public.save_product_measurement_preference('granted',0,'c2500000-0000-4000-8000-000000000101')#>>'{data,revision}','1','explicit grant has CAS revision');
SELECT is(public.save_product_measurement_preference('granted',0,'c2500000-0000-4000-8000-000000000101')#>>'{data,revision}','1','identical preference retry does not create another revision');
SELECT is(public.save_product_measurement_preference('withdrawn',0,'c2500000-0000-4000-8000-000000000101')->>'code','CONFLICT','changed payload cannot reuse a request');
INSERT INTO public.projects(id,user_id,name,questions)VALUES('c2500000-0000-4000-8000-000000000011',auth.uid(),'PRIVATE_MEASUREMENT_SENTINEL','["PRIVATE_QUESTION_SENTINEL"]');
RESET ROLE;
SELECT is((SELECT count(*)FROM firstten_private.product_event_log),0::bigint,'preference grant never activates collection');
SELECT is((SELECT count(*)FROM firstten_private.product_milestone_markers WHERE user_id='c2500000-0000-4000-8000-000000000001'),1::bigint,'disabled source gets only durable operation marker');
UPDATE firstten_private.product_measurement_policy SET enabled=true,environment='test',instrumentation_start=clock_timestamp(),last_purge_at=clock_timestamp(),purge_schedule_verified_at=clock_timestamp(),purge_schedule_receipt=repeat('a',64);
SET LOCAL ROLE authenticated;SELECT firstten_policy_test.set_actor('an_owner');
INSERT INTO public.projects(id,user_id,name,questions)VALUES('c2500000-0000-4000-8000-000000000012',auth.uid(),'PRIVATE_SECOND_IDEA','["What happened?"]');
INSERT INTO public.interviews(id,user_id,project_id,completed,answers)VALUES('c2500000-0000-4000-8000-000000000021',auth.uid(),'c2500000-0000-4000-8000-000000000012',false,'[{"q":"PRIVATE_QUESTION_SENTINEL","note":"PRIVATE_NOTE_SENTINEL","quote":"PRIVATE_QUOTE_SENTINEL"}]');
UPDATE public.interviews SET completed=true WHERE id='c2500000-0000-4000-8000-000000000021';
UPDATE public.interviews SET completed=false WHERE id='c2500000-0000-4000-8000-000000000021';
UPDATE public.interviews SET completed=true WHERE id='c2500000-0000-4000-8000-000000000021';
RESET ROLE;
SELECT is((SELECT count(*)FROM firstten_private.product_event_log),2::bigint,'direct legacy writes produce one project and one first completion');
SELECT is((SELECT count(DISTINCT subject_ref)FROM firstten_private.product_event_log),1::bigint,'two projects never become two account subjects');
SELECT ok((SELECT bool_and(population='synthetic'AND environment='test')FROM firstten_private.product_event_log),'trusted synthetic classification never becomes ordinary adoption');
SELECT ok((SELECT jsonb_agg(to_jsonb(e))::text NOT LIKE'%PRIVATE_%'FROM firstten_private.product_event_log e),'events contain no source names questions notes or quotes');
SELECT ok((SELECT bool_and(expires_at<=occurred_at+interval'30 days')FROM firstten_private.product_event_log),'event lifetime is fixed at most30 days');
SELECT ok((SELECT bool_and(expires_at<=created_at+interval'30 days')FROM firstten_private.product_measurement_mappings),'mapping lifetime does not renew with actions');
-- Canonical draft completion is captured at the same table boundary as legacy writes.
SET LOCAL ROLE authenticated;SELECT firstten_policy_test.set_actor('an_owner');
SELECT is(public.create_interview_draft('c2500000-0000-4000-8000-000000000012','c2500000-0000-4000-8000-000000000031',NULL,'["What happened?"]',NULL,'granted')->>'ok','true','canonical draft can start with independent note choice');
SELECT is(public.complete_interview_draft('c2500000-0000-4000-8000-000000000012','c2500000-0000-4000-8000-000000000031',1)->>'replayed','false','canonical finalization completes once');
SELECT is(public.complete_interview_draft('c2500000-0000-4000-8000-000000000012','c2500000-0000-4000-8000-000000000031',1)->>'replayed','true','canonical completion retry returns receipt');
RESET ROLE;
SELECT is((SELECT count(*)FROM firstten_private.product_event_log WHERE event_name='interview_completed'),2::bigint,'canonical receipt replay creates no event');
-- A failed business transaction cannot leave success measurement or source marker.
CREATE FUNCTION firstten_policy_test.an_fault()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION'Fictional measurement rollback';END $$;
CREATE TRIGGER zz_an_fault AFTER INSERT ON public.projects FOR EACH ROW WHEN(NEW.id='c2500000-0000-4000-8000-000000000014')EXECUTE FUNCTION firstten_policy_test.an_fault();
SET LOCAL ROLE authenticated;
SELECT throws_ok($$INSERT INTO public.projects(id,user_id,name)VALUES('c2500000-0000-4000-8000-000000000014',auth.uid(),'not committed')$$,'P0001','Fictional measurement rollback','failed transaction rolls back event');
RESET ROLE;DROP TRIGGER zz_an_fault ON public.projects;
SELECT is((SELECT count(*)FROM firstten_private.product_milestone_markers WHERE source_id='c2500000-0000-4000-8000-000000000014'),0::bigint,'failed source marker is rolled back');
SELECT is((SELECT count(*)FROM firstten_private.product_event_log),3::bigint,'failed business write leaves no success event');
-- Withdrawal is a separate product-measurement decision, not participant consent.
SET LOCAL ROLE authenticated;SELECT firstten_policy_test.set_actor('an_owner');
SELECT is(public.save_product_measurement_preference('withdrawn',1,'c2500000-0000-4000-8000-000000000102')#>>'{data,choice}','withdrawn','explicit withdrawal saves');
RESET ROLE;
SELECT is((SELECT count(*)FROM firstten_private.product_event_log),0::bigint,'withdrawal removes attributable events');
SELECT is((SELECT count(*)FROM firstten_private.product_measurement_mappings WHERE user_id='c2500000-0000-4000-8000-000000000001'),0::bigint,'withdrawal removes identity mappings');
SELECT ok(EXISTS(SELECT 1 FROM firstten_private.product_milestone_markers WHERE source_id='c2500000-0000-4000-8000-000000000021'),'durable product marker remains separate from erased analytics');
SET LOCAL ROLE authenticated;SELECT firstten_policy_test.set_actor('an_owner');
SELECT is(public.save_product_measurement_preference('granted',2,'c2500000-0000-4000-8000-000000000103')->>'ok','true','future opt-in is deliberate');
UPDATE public.interviews SET completed=false WHERE id='c2500000-0000-4000-8000-000000000021';
UPDATE public.interviews SET completed=true WHERE id='c2500000-0000-4000-8000-000000000021';
DELETE FROM public.interviews WHERE id='c2500000-0000-4000-8000-000000000021';
INSERT INTO public.interviews(id,user_id,project_id,completed)VALUES('c2500000-0000-4000-8000-000000000021',auth.uid(),'c2500000-0000-4000-8000-000000000012',true);
RESET ROLE;
SELECT is((SELECT count(*)FROM firstten_private.product_event_log),0::bigint,'withdrawal regrant and source deletion/recreation cannot backfill');
-- Unknown measurement choice for another owner stays independent.
SET LOCAL ROLE authenticated;SELECT firstten_policy_test.set_actor('an_other');
INSERT INTO public.projects(id,user_id,name)VALUES('c2500000-0000-4000-8000-000000000015',auth.uid(),'No opt-in');
SELECT is(public.get_product_measurement_preference()#>>'{data,choice}','unknown','other owner never adopts first owner choice');
SELECT throws_ok($$SELECT public.get_product_measurement_retention_health(gen_random_uuid())$$,'42501','Admin access denied','ordinary owner cannot inspect retention health');
RESET ROLE;
SELECT is((SELECT count(*)FROM firstten_private.product_event_log),0::bigint,'unknown choice creates no events');
-- Real expiry, bounded purge and source-marker replay defense survive expired receipts.
SET LOCAL ROLE authenticated;SELECT firstten_policy_test.set_actor('an_owner');
INSERT INTO public.projects(id,user_id,name)VALUES('c2500000-0000-4000-8000-000000000016',auth.uid(),'Expire measurement only');
RESET ROLE;
UPDATE firstten_private.product_event_log SET occurred_at=statement_timestamp()-interval'31 days',received_at=statement_timestamp()-interval'31 days',expires_at=statement_timestamp()-interval'1 day';
UPDATE firstten_private.product_measurement_mappings SET created_at=statement_timestamp()-interval'31 days',expires_at=statement_timestamp()-interval'1 day';
UPDATE firstten_private.product_event_delivery_receipts SET created_at=statement_timestamp()-interval'31 days',expires_at=statement_timestamp()-interval'1 day';
UPDATE firstten_private.product_measurement_choice_receipts SET created_at=statement_timestamp()-interval'31 days',expires_at=statement_timestamp()-interval'1 day';
SET LOCAL ROLE service_role;
SELECT ok((public.purge_expired_product_measurement(1000)->>'removedRows')::integer>0,'bounded purge removes expired measurement rows');
SELECT is(public.purge_expired_product_measurement(1000)->>'removedRows','0','purge is repeat-safe');
RESET ROLE;
SELECT is((SELECT count(*)FROM firstten_private.product_event_log),0::bigint,'expired event bytes removed, not only mapping');
SELECT is((SELECT count(*)FROM firstten_private.product_measurement_mappings),0::bigint,'expired mappings removed');
SELECT is((SELECT count(*)FROM firstten_private.product_event_delivery_receipts),0::bigint,'expired delivery receipts removed');
SELECT is((SELECT count(*)FROM firstten_private.product_measurement_choice_receipts),0::bigint,'expired preference receipts removed');
SELECT ok(EXISTS(SELECT 1 FROM firstten_private.product_milestone_markers WHERE source_id='c2500000-0000-4000-8000-000000000016'),'expiry never removes durable source idempotency');
SELECT firstten_private.set_platform_admin('c2500000-0000-4000-8000-000000000002',true,0,'an002-fictional-test');
SET LOCAL ROLE authenticated;SELECT firstten_policy_test.set_actor('an_other');
SELECT is(public.get_product_measurement_retention_health('c2500000-0000-4000-8000-000000000104')->>'status','healthy','fresh platform admin receives only audited retention health');
SELECT 'AN002_DTO:'||jsonb_build_object('preference',public.get_product_measurement_preference(),'health',public.get_product_measurement_retention_health('c2500000-0000-4000-8000-000000000105'))::text;
RESET ROLE;
SELECT ok(EXISTS(SELECT 1 FROM firstten_private.admin_audit WHERE request_id='c2500000-0000-4000-8000-000000000105'AND operation='funnel_snapshot'),'health response has an authoritative admin audit receipt');
UPDATE firstten_private.product_measurement_policy SET last_purge_at=clock_timestamp()-interval'26 hours';
DO $$BEGIN IF to_regclass('firstten_private.product_retention_state')IS NOT NULL THEN UPDATE firstten_private.product_retention_state SET last_drained_at=clock_timestamp()-interval'11 minutes';END IF;END $$;
SET LOCAL ROLE authenticated;SELECT firstten_policy_test.set_actor('an_owner');
INSERT INTO public.projects(id,user_id,name)VALUES('c2500000-0000-4000-8000-000000000017',auth.uid(),'Overdue collection is skipped');
RESET ROLE;
SELECT is((SELECT count(*)FROM firstten_private.product_event_log),0::bigint,'overdue cleanup stops new optional measurement');
UPDATE firstten_private.product_measurement_policy SET last_purge_at=clock_timestamp();
DO $$BEGIN IF to_regclass('firstten_private.product_retention_state')IS NOT NULL THEN UPDATE firstten_private.product_retention_state SET last_attempt_at=clock_timestamp()-interval'1 second',last_drained_at=clock_timestamp();END IF;END $$;
SET LOCAL ROLE authenticated;SELECT firstten_policy_test.set_actor('an_owner');
DELETE FROM public.projects WHERE id='c2500000-0000-4000-8000-000000000016';
INSERT INTO public.projects(id,user_id,name)VALUES('c2500000-0000-4000-8000-000000000016',auth.uid(),'Recreated source after receipt expiry');
RESET ROLE;
SELECT is((SELECT count(*)FROM firstten_private.product_event_log),0::bigint,'expired delivery receipts cannot permit source recreation backfill');
SET LOCAL ROLE authenticated;SELECT firstten_policy_test.set_actor('an_owner');
INSERT INTO public.projects(id,user_id,name)VALUES('c2500000-0000-4000-8000-000000000018',auth.uid(),'Deletion removes event bytes');
RESET ROLE;
SELECT is((SELECT count(*)FROM firstten_private.product_event_log),1::bigint,'fresh post-choice source emits prospective event');
INSERT INTO firstten_private.product_measurement_choice_receipts(user_id,request_id,payload_hash,expires_at)
 SELECT 'c2500000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),clock_timestamp()+interval'1 day'FROM generate_series(1,2000);
SET LOCAL ROLE authenticated;
SELECT is(public.save_product_measurement_preference('granted',3,gen_random_uuid())->>'code','CAPACITY','ordinary receipt history cannot grow beyond cap');
SELECT is(public.save_product_measurement_preference('withdrawn',3,'c2500000-0000-4000-8000-000000000106')->>'ok','true','withdrawal remains available at ordinary receipt cap');
RESET ROLE;
SELECT is((SELECT count(*)FROM firstten_private.product_event_log),0::bigint,'withdrawal at capacity still erases event bytes');
UPDATE firstten_private.product_measurement_preferences SET revision=9007199254740990,choice='granted'WHERE user_id='c2500000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT is(public.save_product_measurement_preference('withdrawn',9007199254740990,'c2500000-0000-4000-8000-000000000107')#>>'{data,revision}','9007199254740991','terminal revision is reserved for withdrawal');
SELECT is(public.save_product_measurement_preference('granted',9007199254740991,gen_random_uuid())->>'code','CAPACITY','terminal preference cannot re-enable measurement');
RESET ROLE;
-- Account deletion deliberately cascades minimal operation markers as well.
DELETE FROM public.projects WHERE user_id='c2500000-0000-4000-8000-000000000001';
DELETE FROM auth.users WHERE id='c2500000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*)FROM firstten_private.product_milestone_markers WHERE user_id='c2500000-0000-4000-8000-000000000001'),0::bigint,'account deletion removes durable operation markers');
SELECT is((SELECT count(*)FROM firstten_private.product_measurement_preferences WHERE user_id='c2500000-0000-4000-8000-000000000001'),0::bigint,'account deletion removes separate preference');
DELETE FROM public.projects WHERE user_id='c2500000-0000-4000-8000-000000000002';
DELETE FROM auth.users WHERE id='c2500000-0000-4000-8000-000000000002';
UPDATE firstten_private.product_measurement_policy SET enabled=false,environment='development',instrumentation_start=NULL,purge_schedule_verified_at=NULL,purge_schedule_receipt=NULL;
-- BEGIN_AN003_TEST_ONLY_READINESS_CLEANUP
DO $fixture$
BEGIN
 IF to_regclass('pg_temp.an003_retention_original')IS NOT NULL THEN
  IF obj_description(to_regnamespace('cron'),'pg_namespace')IS DISTINCT FROM'FIRSTTEN_AN003_TEST_ONLY_UNSCHEDULED_METADATA'OR EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron')THEN RAISE EXCEPTION'AN003 policy fixture refuses foreign cron cleanup';END IF;
  DROP SCHEMA cron CASCADE;
  DELETE FROM firstten_private.product_retention_state;
  INSERT INTO firstten_private.product_retention_state SELECT * FROM pg_temp.an003_retention_original;
  DROP TABLE pg_temp.an003_retention_original;
 END IF;
END $fixture$;
-- END_AN003_TEST_ONLY_READINESS_CLEANUP
