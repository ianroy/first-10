-- Operator-only preparation for First Ten project hdwnnuvqqkkpontcdbwa.
-- Diagnostic only: every extension/ACL write below rolls back. Creates no job.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
DO $guard$
BEGIN
  IF current_database() IS DISTINCT FROM 'postgres' OR current_user IS DISTINCT FROM 'postgres'
     OR to_regclass('firstten_private.product_retention_state') IS NULL
     OR NOT EXISTS (SELECT 1 FROM firstten_private.product_measurement_policy WHERE singleton AND NOT enabled)
     OR NOT EXISTS (SELECT 1 FROM firstten_private.ai_usage_global_policy WHERE singleton AND global_stop)
     OR current_setting('cron.database_name', true) IS DISTINCT FROM 'postgres'
     OR current_setting('cron.log_run', true) IS DISTINCT FROM 'on'
     OR current_setting('cron.timezone', true) NOT IN ('GMT', 'UTC', 'Etc/UTC')
     OR current_setting('cron.timezone', true) IS NULL THEN
    RAISE EXCEPTION 'Verified First Ten retention prerequisites required';
  END IF;
  IF to_regnamespace('cron') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'Unrecognized cron namespace; inspect before preparation';
  END IF;
END
$guard$;
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron' AND extversion = '1.6.4')
     OR has_schema_privilege('anon', 'cron', 'USAGE')
     OR has_schema_privilege('authenticated', 'cron', 'USAGE') THEN
    RAISE EXCEPTION 'Scheduler package or role boundary differs from reviewed preparation';
  END IF;
END
$guard$;
SELECT jsonb_build_object(
 'extensionOwner', (SELECT pg_get_userbyid(extowner) FROM pg_extension WHERE extname='pg_cron'),
 'jobOwner', (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='cron.job'::regclass),
 'historyOwner', (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='cron.job_run_details'::regclass),
 'operatorOwnsHistory', (SELECT relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) FROM pg_class WHERE oid='cron.job_run_details'::regclass),
 'operatorCanUseJobOwner', (SELECT pg_has_role(current_user,relowner,'USAGE') FROM pg_class WHERE oid='cron.job'::regclass),
 'operatorCanUseHistoryOwner', (SELECT pg_has_role(current_user,relowner,'USAGE') FROM pg_class WHERE oid='cron.job_run_details'::regclass),
 'operatorCanInsertJobs', has_table_privilege(current_user,'cron.job','INSERT'),
 'operatorCanSelectJobs', has_table_privilege(current_user,'cron.job','SELECT'),
 'operatorCanDeleteHistory', has_table_privilege(current_user,'cron.job_run_details','DELETE'),
 'jobCount', (SELECT count(*) FROM cron.job),
 'collectionEnabled', (SELECT enabled FROM firstten_private.product_measurement_policy WHERE singleton),
 'aiStopped', (SELECT global_stop FROM firstten_private.ai_usage_global_policy WHERE singleton)
) AS uncommitted_cron_diagnostic;
ROLLBACK;
