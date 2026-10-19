-- Operator-only preparation for First Ten project hdwnnuvqqkkpontcdbwa.
-- Run with the explicitly verified project ref. Creates no active job and never enables collection.
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
SELECT firstten_private.prepare_product_retention_job('*/5 * * * *') AS prepared_inactive_job;
DO $guard$
BEGIN
  IF firstten_private.product_retention_schedule_proof()->>'matches' IS DISTINCT FROM 'true'
     OR firstten_private.product_retention_schedule_proof()->>'active' IS DISTINCT FROM 'false'
     OR firstten_private.product_retention_ready()
     OR NOT EXISTS (SELECT 1 FROM firstten_private.product_measurement_policy WHERE singleton AND NOT enabled)
     OR NOT EXISTS (SELECT 1 FROM firstten_private.ai_usage_global_policy WHERE singleton AND global_stop) THEN
    RAISE EXCEPTION 'Inactive preparation verification failed';
  END IF;
END
$guard$;
COMMIT;
SELECT jsonb_build_object(
  'prepared', true,
  'active', false,
  'collectionEnabled', (SELECT enabled FROM firstten_private.product_measurement_policy WHERE singleton),
  'aiStopped', (SELECT global_stop FROM firstten_private.ai_usage_global_policy WHERE singleton),
  'exactJobMatches', firstten_private.product_retention_schedule_proof()->'matches'
) AS retention_preparation;
