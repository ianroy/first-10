-- Run inside the isolated AN003 cluster only. Assertions are rolled back.
SAVEPOINT an003_fixture;
CREATE SCHEMA an003_test;
CREATE FUNCTION an003_test.assert(p boolean,message text)RETURNS void LANGUAGE plpgsql AS $$BEGIN IF p IS DISTINCT FROM true THEN RAISE EXCEPTION'AN003 assertion failed: %',message;END IF;END $$;
SELECT an003_test.assert(NOT(SELECT enabled FROM firstten_private.product_measurement_policy),'migration must not enable collection');
SELECT an003_test.assert(NOT firstten_private.product_retention_ready(),'unscheduled is never ready');
SELECT public.purge_expired_product_measurement(500);
SELECT an003_test.assert(NOT firstten_private.product_retention_ready(),'legacy manual purge cannot satisfy scheduled readiness');
SELECT an003_test.assert(NOT has_function_privilege('authenticated','firstten_private.run_product_measurement_retention()','EXECUTE'),'owner cannot forge scheduled attempt');
SELECT an003_test.assert(NOT has_function_privilege('service_role','firstten_private.prepare_product_retention_job(text)','EXECUTE'),'service cannot prepare scheduler');
SELECT an003_test.assert(NOT has_table_privilege('authenticated','firstten_private.product_retention_state','SELECT,INSERT,UPDATE,DELETE'),'scheduler state closed');
DO $$BEGIN
 BEGIN PERFORM firstten_private.run_product_measurement_retention();RAISE EXCEPTION'expected denial';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
-- More than one relation's old per-relation limit must still report capped truthfully.
INSERT INTO firstten_private.product_event_log(event_name,environment,population,subject_ref,project_ref,measurement_choice_version,occurred_at,received_at,expires_at)
 SELECT'project_created','test','synthetic',gen_random_uuid(),gen_random_uuid(),1,statement_timestamp()-interval'31 days',statement_timestamp()-interval'31 days',statement_timestamp()-interval'1 day'FROM generate_series(1,10002);
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)VALUES('c2600000-0000-4000-8000-000000000001','authenticated','authenticated','retention-synthetic@example.invalid','{"synthetic":true}','{}');
INSERT INTO firstten_private.product_measurement_choice_receipts(user_id,request_id,payload_hash,created_at,expires_at)VALUES('c2600000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),statement_timestamp()-interval'31 days',statement_timestamp()-interval'2 days');
SELECT an003_test.assert((firstten_private.product_retention_backlog()->>'expiredRowsCapped')::integer=10000 AND(firstten_private.product_retention_backlog()->>'countCapped')::boolean,'single relation truncation must be explicit');
SELECT an003_test.assert((firstten_private.product_retention_backlog()->>'oldestExpiredAt')::timestamptz<clock_timestamp()-interval'47 hours','oldest expiry includes later union relations');
SELECT an003_test.assert((public.purge_expired_product_measurement(1)->>'removedRows')::integer=2,'legacy purge remains bounded per relation');
SELECT an003_test.assert(NOT firstten_private.product_retention_ready(),'batch timestamp cannot hide remaining backlog');
DO $$BEGIN
 BEGIN PERFORM public.get_product_measurement_retention_health_v2(gen_random_uuid());RAISE EXCEPTION'expected denial';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT firstten_private.set_platform_admin('c2600000-0000-4000-8000-000000000001',true,0,'an003-fictional-test');
SELECT set_config('request.jwt.claim.sub','c2600000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT 'AN003_DTO:'||public.get_product_measurement_retention_health_v2('c2600000-0000-4000-8000-000000000002')::text;
RESET ROLE;
SELECT an003_test.assert(EXISTS(SELECT 1 FROM firstten_private.admin_audit WHERE request_id='c2600000-0000-4000-8000-000000000002'AND operation='funnel_snapshot'),'health delivery audited');
SELECT firstten_private.set_platform_admin('c2600000-0000-4000-8000-000000000001',false,1,'an003-fictional-withdrawal');
DO $$BEGIN
 BEGIN PERFORM public.get_product_measurement_retention_health_v2(gen_random_uuid());RAISE EXCEPTION'expected denial';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT an003_test.assert(NOT(SELECT enabled FROM firstten_private.product_measurement_policy),'test never enables collection');
ROLLBACK TO SAVEPOINT an003_fixture;
RELEASE SAVEPOINT an003_fixture;
