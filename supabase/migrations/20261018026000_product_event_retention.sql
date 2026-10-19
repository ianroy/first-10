-- AN003: closed scheduled retention, disabled telemetry remains disabled.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE INDEX product_mapping_expiry ON firstten_private.product_measurement_mappings(expires_at);
CREATE INDEX product_delivery_expiry ON firstten_private.product_event_delivery_receipts(expires_at);
CREATE INDEX product_choice_expiry ON firstten_private.product_measurement_choice_receipts(expires_at);
CREATE TABLE firstten_private.product_retention_state(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 job_id bigint CHECK(job_id BETWEEN 1 AND 9007199254740991),job_name text CHECK(job_name='firstten-owner-measurement-retention-v1'),
 job_schedule text CHECK(job_schedule IN('*/5 * * * *','5 seconds')),job_database text,job_username text,
 last_run_id bigint CHECK(last_run_id BETWEEN 1 AND 9007199254740991),last_attempt_at timestamptz,last_drained_at timestamptz,
 last_outcome text NOT NULL DEFAULT 'unverified'CHECK(last_outcome IN('unverified','drained','backlog','failed')),
 removed_rows integer NOT NULL DEFAULT 0 CHECK(removed_rows BETWEEN 0 AND 8000),
 CHECK((job_id IS NULL)=(job_name IS NULL)),CHECK((job_id IS NULL)=(job_schedule IS NULL)),
 CHECK((job_id IS NULL)=(job_database IS NULL)),CHECK((job_id IS NULL)=(job_username IS NULL))
);
INSERT INTO firstten_private.product_retention_state(singleton)VALUES(true);
ALTER TABLE firstten_private.product_retention_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.product_retention_state FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION firstten_private.retention_job_command()RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT $command$SET statement_timeout='20s';SELECT firstten_private.run_product_measurement_retention();$command$::text
$$;
CREATE FUNCTION firstten_private.product_retention_backlog()RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH due AS(
 (SELECT expires_at FROM firstten_private.product_event_log WHERE expires_at<=clock_timestamp()ORDER BY expires_at LIMIT 10001)
 UNION ALL(SELECT expires_at FROM firstten_private.product_measurement_mappings WHERE expires_at<=clock_timestamp()ORDER BY expires_at LIMIT 10001)
 UNION ALL(SELECT expires_at FROM firstten_private.product_event_delivery_receipts WHERE expires_at<=clock_timestamp()ORDER BY expires_at LIMIT 10001)
 UNION ALL(SELECT expires_at FROM firstten_private.product_measurement_choice_receipts WHERE expires_at<=clock_timestamp()ORDER BY expires_at LIMIT 10001))
 SELECT jsonb_build_object('expiredRowsCapped',least(count(*),10000),'countCapped',count(*)>10000,'oldestExpiredAt',min(expires_at))FROM(SELECT expires_at FROM due ORDER BY expires_at LIMIT 10001)bounded
$$;
CREATE FUNCTION firstten_private.product_retention_schedule_proof()RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s firstten_private.product_retention_state;j jsonb;r jsonb;
BEGIN
 SELECT * INTO s FROM firstten_private.product_retention_state WHERE singleton;
 IF s.job_id IS NULL OR to_regclass('cron.job')IS NULL OR to_regclass('cron.job_run_details')IS NULL THEN RETURN jsonb_build_object('configured',false,'active',false,'matches',false,'runId',NULL,'succeeded',false,'startedAt',NULL,'completedAt',NULL);END IF;
 EXECUTE 'SELECT to_jsonb(j)FROM cron.job j WHERE jobid=$1'INTO j USING s.job_id;
 IF j IS NULL THEN RETURN jsonb_build_object('configured',false,'active',false,'matches',false,'runId',NULL,'succeeded',false,'startedAt',NULL,'completedAt',NULL);END IF;
 EXECUTE 'SELECT to_jsonb(r)FROM cron.job_run_details r WHERE jobid=$1 AND end_time IS NOT NULL ORDER BY runid DESC LIMIT 1'INTO r USING s.job_id;
 RETURN jsonb_build_object('configured',true,'active',coalesce((j->>'active')::boolean,false),
 'matches',j->>'jobname'=s.job_name AND j->>'schedule'=s.job_schedule AND j->>'command'=firstten_private.retention_job_command()AND j->>'database'=s.job_database AND s.job_database=current_database()AND j->>'username'=s.job_username,
 'runId',(r->>'runid')::bigint,'succeeded',coalesce(r->>'status'='succeeded',false),'startedAt',(r->>'start_time')::timestamptz,'completedAt',(r->>'end_time')::timestamptz);
END $$;
CREATE FUNCTION firstten_private.product_retention_history_backlog()RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE id bigint;r jsonb;
BEGIN
 SELECT job_id INTO id FROM firstten_private.product_retention_state WHERE singleton;
 IF id IS NULL OR to_regclass('cron.job_run_details')IS NULL THEN RETURN jsonb_build_object('rowsCapped',0,'countCapped',false,'oldestAt',NULL);END IF;
 EXECUTE 'SELECT jsonb_build_object(''rowsCapped'',least(count(*),500),''countCapped'',count(*)>500,''oldestAt'',min(end_time))FROM(SELECT end_time FROM cron.job_run_details WHERE jobid=$1 AND end_time<clock_timestamp()-interval''7 days''ORDER BY end_time LIMIT 501)x'INTO r USING id;
 RETURN r;END $$;
CREATE FUNCTION firstten_private.product_retention_ready()RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s firstten_private.product_retention_state;proof jsonb;
BEGIN
 SELECT * INTO s FROM firstten_private.product_retention_state WHERE singleton;
 IF s.last_outcome IS DISTINCT FROM'drained'OR s.last_attempt_at IS NULL OR s.last_attempt_at<clock_timestamp()-interval'10 minutes'OR s.last_attempt_at>clock_timestamp()OR s.last_drained_at<s.last_attempt_at OR s.last_drained_at IS NULL OR s.last_drained_at<clock_timestamp()-interval'10 minutes'OR s.last_drained_at>clock_timestamp()THEN RETURN false;END IF;
 proof:=firstten_private.product_retention_schedule_proof();
 IF proof->>'configured'IS DISTINCT FROM'true'OR proof->>'active'IS DISTINCT FROM'true'OR proof->>'matches'IS DISTINCT FROM'true'OR proof->>'succeeded'IS DISTINCT FROM'true'OR(proof->>'runId')::bigint IS DISTINCT FROM s.last_run_id OR(proof->>'startedAt')IS NULL OR(proof->>'completedAt')IS NULL OR(proof->>'completedAt')::timestamptz<clock_timestamp()-interval'10 minutes'OR(proof->>'completedAt')::timestamptz>clock_timestamp()OR(proof->>'startedAt')::timestamptz>(proof->>'completedAt')::timestamptzTHEN RETURN false;END IF;
 IF(firstten_private.product_retention_history_backlog()->>'rowsCapped')::integer>0 THEN RETURN false;END IF;
 RETURN NOT(EXISTS(SELECT 1 FROM firstten_private.product_event_log WHERE expires_at<=clock_timestamp())OR EXISTS(SELECT 1 FROM firstten_private.product_measurement_mappings WHERE expires_at<=clock_timestamp())OR EXISTS(SELECT 1 FROM firstten_private.product_event_delivery_receipts WHERE expires_at<=clock_timestamp())OR EXISTS(SELECT 1 FROM firstten_private.product_measurement_choice_receipts WHERE expires_at<=clock_timestamp()));
END $$;
-- Operator-only preparation: no extension/configuration change and no active job creation.
CREATE FUNCTION firstten_private.prepare_product_retention_job(p_schedule text DEFAULT '*/5 * * * *')RETURNS bigint
LANGUAGE plpgsql SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE s firstten_private.product_retention_state;j jsonb;id bigint;
BEGIN
 IF p_schedule IS NULL OR p_schedule NOT IN('*/5 * * * *','5 seconds')OR current_database()<>'postgres'OR to_regclass('cron.job')IS NULL THEN RAISE EXCEPTION'Retention scheduler prerequisites unavailable'USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM firstten_private.product_measurement_policy WHERE singleton AND NOT enabled)THEN RAISE EXCEPTION'Pause collection before scheduler changes'USING ERRCODE='22023';END IF;
 IF current_setting('cron.timezone',true)IS NULL OR current_setting('cron.timezone',true)NOT IN('GMT','UTC','Etc/UTC')THEN RAISE EXCEPTION'Retention requires a verified UTC scheduler'USING ERRCODE='22023';END IF;
 SELECT * INTO s FROM firstten_private.product_retention_state WHERE singleton FOR UPDATE;
 EXECUTE 'SELECT to_jsonb(j)FROM cron.job j WHERE jobname=$1 LIMIT 1'INTO j USING 'firstten-owner-measurement-retention-v1';
 IF j IS NOT NULL THEN
  IF s.job_id IS NULL OR(j->>'jobid')::bigint<>s.job_id OR j->>'database'<>current_database()OR j->>'username'<>current_user OR j->>'command'<>firstten_private.retention_job_command()OR j->>'schedule'<>p_schedule THEN RAISE EXCEPTION'Retention job identity conflict'USING ERRCODE='22023';END IF;
  RETURN s.job_id;
 END IF;
 EXECUTE 'SELECT cron.schedule_in_database($1,$2,$3,$4,$5,false)'INTO id USING 'firstten-owner-measurement-retention-v1',p_schedule,firstten_private.retention_job_command(),current_database(),current_user::text;
 EXECUTE 'CREATE INDEX firstten_measurement_retention_history_expiry ON cron.job_run_details(jobid,end_time,runid)';
 UPDATE firstten_private.product_retention_state SET job_id=id,job_name='firstten-owner-measurement-retention-v1',job_schedule=p_schedule,job_database=current_database(),job_username=current_user,last_run_id=NULL,last_attempt_at=NULL,last_drained_at=NULL,last_outcome='unverified',removed_rows=0 WHERE singleton;
 RETURN id;
END $$;
CREATE FUNCTION firstten_private.run_product_measurement_retention()RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='2s' AS $$
DECLARE s firstten_private.product_retention_state;run_id bigint;stamp timestamptz:=clock_timestamp();n integer:=0;batch jsonb;backlog jsonb;
BEGIN
 -- Only a real matching currently running cron invocation can advance scheduled health.
 IF NOT pg_try_advisory_xact_lock(25003,1)THEN RETURN;END IF;
 SELECT * INTO s FROM firstten_private.product_retention_state WHERE singleton FOR UPDATE;
 IF s.job_id IS NULL OR to_regclass('cron.job_run_details')IS NULL THEN RAISE EXCEPTION'Scheduled retention invocation required'USING ERRCODE='42501';END IF;
 EXECUTE 'SELECT runid FROM cron.job_run_details WHERE jobid=$1 AND job_pid=$2 AND status=''running'' AND end_time IS NULL ORDER BY runid DESC LIMIT 1'INTO run_id USING s.job_id,pg_backend_pid();
 IF run_id IS NULL OR(firstten_private.product_retention_schedule_proof()->>'matches')IS DISTINCT FROM'true'OR(firstten_private.product_retention_schedule_proof()->>'active')IS DISTINCT FROM'true'THEN RAISE EXCEPTION'Scheduled retention invocation required'USING ERRCODE='42501';END IF;
 BEGIN
  FOR i IN 1..4 LOOP
   EXIT WHEN clock_timestamp()>stamp+interval'12 seconds';
   batch:=public.purge_expired_product_measurement(500);n:=n+(batch->>'removedRows')::integer;
   EXIT WHEN(batch->>'removedRows')::integer=0;
  END LOOP;
  -- Bound history cleanup to this exact owned job; never touch another job's details.
  EXECUTE 'DELETE FROM cron.job_run_details WHERE runid IN(SELECT runid FROM cron.job_run_details WHERE jobid=$1 AND end_time<clock_timestamp()-interval''7 days''ORDER BY end_time,runid LIMIT 500)'USING s.job_id;
  backlog:=firstten_private.product_retention_backlog();
  UPDATE firstten_private.product_retention_state SET last_run_id=run_id,last_attempt_at=stamp,removed_rows=n,
   last_outcome=CASE WHEN(backlog->>'expiredRowsCapped')::integer=0 AND(firstten_private.product_retention_history_backlog()->>'rowsCapped')::integer=0 THEN'drained'ELSE'backlog'END,
   last_drained_at=CASE WHEN(backlog->>'expiredRowsCapped')::integer=0 AND(firstten_private.product_retention_history_backlog()->>'rowsCapped')::integer=0 THEN clock_timestamp()ELSE last_drained_at END WHERE singleton;
 EXCEPTION WHEN OTHERS THEN
  UPDATE firstten_private.product_retention_state SET last_run_id=run_id,last_attempt_at=stamp,last_outcome='failed',removed_rows=0 WHERE singleton;
 END;
END $$;
CREATE FUNCTION public.get_product_measurement_retention_health_v2(p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s firstten_private.product_retention_state;proof jsonb;b jsonb;history jsonb;status text;ready boolean;collection_on boolean;receipt uuid;
BEGIN
 PERFORM 1 FROM firstten_private.platform_admins WHERE user_id=auth.uid()AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION'Admin access denied'USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM firstten_private.product_retention_state WHERE singleton;
 SELECT p.enabled INTO collection_on FROM firstten_private.product_measurement_policy p WHERE singleton;
 proof:=firstten_private.product_retention_schedule_proof();b:=firstten_private.product_retention_backlog();history:=firstten_private.product_retention_history_backlog();ready:=firstten_private.product_retention_ready();
 status:=CASE WHEN proof->>'configured'IS DISTINCT FROM'true'THEN'unscheduled'WHEN proof->>'active'IS DISTINCT FROM'true'THEN'inactive'WHEN proof->>'matches'IS DISTINCT FROM'true'THEN'unverified'WHEN s.last_outcome='failed'OR(proof->>'runId'IS NOT NULL AND proof->>'succeeded'IS DISTINCT FROM'true')THEN'failed'WHEN(b->>'expiredRowsCapped')::integer>0 OR(history->>'rowsCapped')::integer>0 OR s.last_outcome='backlog'THEN'backlog'WHEN ready THEN'healthy'WHEN s.last_attempt_at IS NULL THEN'unverified'ELSE'overdue'END;
 receipt:=public.record_platform_admin_action('funnel_snapshot',CASE WHEN ready THEN'ready'ELSE'partial'END,p_request_id);
 RETURN jsonb_build_object('producerVersion','owner-retention-v1','collectionEnabled',collection_on,'retentionStatus',status,'retentionReady',ready,'jobConfigured',(proof->>'configured')::boolean,'jobActive',(proof->>'active')::boolean,'lastScheduledStart',proof->'startedAt','lastScheduledEnd',proof->'completedAt','lastAttemptAt',s.last_attempt_at,'lastDrainedAt',s.last_drained_at,'expiredRowsCapped',(b->>'expiredRowsCapped')::integer,'countCapped',(b->>'countCapped')::boolean,'oldestExpiredAt',b->'oldestExpiredAt','historyExpiredRowsCapped',(history->>'rowsCapped')::integer,'historyCountCapped',(history->>'countCapped')::boolean,'historyOldestFinishedAt',history->'oldestAt');
END $$;

-- Preserve25 producer semantics; scheduled/drained proof adds an admission gate.
CREATE OR REPLACE FUNCTION firstten_private.record_owner_product_milestone()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=NEW.user_id;source text;inserted integer;pid uuid;g firstten_private.product_measurement_policy;p firstten_private.product_measurement_preferences;
 subject firstten_private.product_measurement_mappings;project firstten_private.product_measurement_mappings;artifact firstten_private.product_measurement_mappings;stamp timestamptz;population text;meta jsonb;eid uuid;
BEGIN
 source:=CASE WHEN TG_TABLE_NAME='projects'THEN'project'ELSE'interview'END;
 IF source='interview'THEN
  IF NOT NEW.completed OR(TG_OP='UPDATE'AND OLD.completed)THEN RETURN NEW;END IF;
  pid:=NEW.project_id;
 ELSE pid:=NEW.id;END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor)THEN RETURN NEW;END IF;
 INSERT INTO firstten_private.product_milestone_markers(user_id,source_kind,source_id,project_id,baseline)
 VALUES(actor,source,NEW.id,pid,false)ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 OR auth.uid()IS DISTINCT FROM actor THEN RETURN NEW;END IF;
 SELECT * INTO g FROM firstten_private.product_measurement_policy WHERE singleton FOR SHARE;
 IF NOT g.enabled OR g.instrumentation_start IS NULL OR g.instrumentation_start>clock_timestamp()OR NOT firstten_private.product_retention_ready()THEN RETURN NEW;END IF;
 SELECT * INTO p FROM firstten_private.product_measurement_preferences WHERE user_id=actor FOR SHARE;
 IF p.choice IS DISTINCT FROM'granted'THEN RETURN NEW;END IF;
 -- Serialize mapping creation without ever reading source text.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,25002));
 stamp:=clock_timestamp();subject:=firstten_private.measurement_reference(actor,'account',actor,stamp+interval'30 days');
 project:=firstten_private.measurement_reference(actor,'project',pid,subject.expires_at);
 IF source='interview'THEN artifact:=firstten_private.measurement_reference(actor,'interview',NEW.id,subject.expires_at);END IF;
 SELECT raw_app_meta_data INTO meta FROM auth.users WHERE id=actor;
 population:=CASE WHEN meta @> '{"synthetic":true}'OR meta @> '{"firstten_demo_admin":true}'THEN'synthetic'
 WHEN EXISTS(SELECT 1 FROM firstten_private.platform_admins WHERE user_id=actor AND enabled)THEN'operator'
 WHEN meta->>'firstten_measurement_population'='ordinary'THEN'ordinary'ELSE'unknown'END;
 INSERT INTO firstten_private.product_event_log(event_name,environment,population,subject_ref,project_ref,artifact_ref,measurement_choice_version,occurred_at,received_at,expires_at)
 VALUES(CASE WHEN source='project'THEN'project_created'ELSE'interview_completed'END,g.environment,population,subject.ref,project.ref,artifact.ref,p.revision,stamp,clock_timestamp(),least(subject.expires_at,project.expires_at,coalesce(artifact.expires_at,subject.expires_at)))RETURNING event_id INTO eid;
 INSERT INTO firstten_private.product_event_delivery_receipts(user_id,source_kind,source_id,event_id,created_at,expires_at)VALUES(actor,source,NEW.id,eid,stamp,stamp+interval'30 days');
 RETURN NEW;END $$;
DO $$DECLARE r record;BEGIN FOR r IN SELECT p.oid::regprocedure signature,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE(n.nspname='firstten_private'AND p.proname IN('retention_job_command','product_retention_backlog','product_retention_schedule_proof','product_retention_ready','product_retention_history_backlog','prepare_product_retention_job','run_product_measurement_retention','record_owner_product_milestone'))OR(n.nspname='public'AND p.proname='get_product_measurement_retention_health_v2')LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature);
 IF r.nspname='public'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.signature);END IF;
END LOOP;END $$;
COMMENT ON TABLE firstten_private.product_retention_state IS 'Safe operational scheduler metadata only. Attempt is distinct from full drain; only matching actual running cron jobs update scheduled state. No installation or activation occurs in this migration. Collection remains independently disabled. Scheduler run history is retained at most7days subject to bounded cleanup and observed backlog, not a guaranteed physical deletion deadline.';
COMMIT;
