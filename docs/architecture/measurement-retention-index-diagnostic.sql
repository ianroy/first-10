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
CREATE TEMP TABLE firstten_cron_index_diagnostic(outcome text) ON COMMIT DROP;
DO $diagnostic$
BEGIN
  CREATE INDEX firstten_measurement_retention_history_expiry ON cron.job_run_details(jobid,end_time,runid);
  INSERT INTO firstten_cron_index_diagnostic VALUES ('created_in_rolled_back_transaction');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO firstten_cron_index_diagnostic VALUES ('managed_history_owner_required');
END
$diagnostic$;
SELECT jsonb_build_object('indexOutcome',(SELECT outcome FROM firstten_cron_index_diagnostic),'jobCount',(SELECT count(*) FROM cron.job),'collectionEnabled',(SELECT enabled FROM firstten_private.product_measurement_policy WHERE singleton),'aiStopped',(SELECT global_stop FROM firstten_private.ai_usage_global_policy WHERE singleton)) AS uncommitted_index_diagnostic;
ROLLBACK;
