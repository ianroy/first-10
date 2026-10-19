-- Operator-only activation for First Ten project hdwnnuvqqkkpontcdbwa.
-- Requires successful additive27 preparation and independent inactive-job inspection.
-- Enables only the exact registered cleanup job. Optional collection remains disabled.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
DO $guard$
DECLARE s firstten_private.product_retention_state; proof jsonb;
BEGIN
  IF current_database() IS DISTINCT FROM 'postgres' OR current_user IS DISTINCT FROM 'postgres'
     OR NOT EXISTS (SELECT 1 FROM firstten_private.product_measurement_policy WHERE singleton AND NOT enabled)
     OR NOT EXISTS (SELECT 1 FROM firstten_private.ai_usage_global_policy WHERE singleton AND global_stop)
     OR current_setting('cron.database_name', true) IS DISTINCT FROM 'postgres'
     OR current_setting('cron.log_run', true) IS DISTINCT FROM 'on'
     OR current_setting('cron.timezone', true) IS NULL
     OR current_setting('cron.timezone', true) NOT IN ('GMT', 'UTC', 'Etc/UTC')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron' AND extversion = '1.6.4')
     OR has_schema_privilege('anon', 'cron', 'USAGE')
     OR has_schema_privilege('authenticated', 'cron', 'USAGE') THEN
    RAISE EXCEPTION 'Verified First Ten retention prerequisites required';
  END IF;
  SELECT * INTO s FROM firstten_private.product_retention_state WHERE singleton FOR UPDATE;
  proof := firstten_private.product_retention_schedule_proof();
  IF s.job_id IS NULL OR s.job_name IS DISTINCT FROM 'firstten-owner-measurement-retention-v1'
     OR s.job_schedule IS DISTINCT FROM '*/5 * * * *'
     OR s.job_database IS DISTINCT FROM current_database() OR s.job_username IS DISTINCT FROM current_user
     OR proof->>'matches' IS DISTINCT FROM 'true'
     OR proof->>'active' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Exact inactive prepared job required; inspect before activation';
  END IF;
  PERFORM cron.alter_job(s.job_id, active := true);
  proof := firstten_private.product_retention_schedule_proof();
  IF proof->>'matches' IS DISTINCT FROM 'true' OR proof->>'active' IS DISTINCT FROM 'true'
     OR NOT EXISTS (SELECT 1 FROM firstten_private.product_measurement_policy WHERE singleton AND NOT enabled)
     OR NOT EXISTS (SELECT 1 FROM firstten_private.ai_usage_global_policy WHERE singleton AND global_stop) THEN
    RAISE EXCEPTION 'Cleanup-only activation verification failed';
  END IF;
END
$guard$;
COMMIT;
-- Re-read in a new request after commit; a configured job is not a successful run.
SELECT jsonb_build_object(
  'proof', firstten_private.product_retention_schedule_proof(),
  'ready', firstten_private.product_retention_ready(),
  'collectionEnabled', (SELECT enabled FROM firstten_private.product_measurement_policy WHERE singleton),
  'aiStopped', (SELECT global_stop FROM firstten_private.ai_usage_global_policy WHERE singleton)
) AS retention_activation;
