-- AN002: prospective optional owner measurement. No production collection activation.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE firstten_private.product_measurement_policy(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,
 environment text NOT NULL DEFAULT 'development' CHECK(environment IN('production','development','test')),
 instrumentation_start timestamptz,last_purge_at timestamptz,purge_schedule_verified_at timestamptz,
 purge_schedule_receipt text CHECK(purge_schedule_receipt~'^[a-f0-9]{64}$'),
 CHECK(NOT enabled OR(instrumentation_start IS NOT NULL AND purge_schedule_verified_at IS NOT NULL AND purge_schedule_receipt IS NOT NULL AND last_purge_at IS NOT NULL))
);
INSERT INTO firstten_private.product_measurement_policy(singleton)VALUES(true);
CREATE TABLE firstten_private.product_measurement_preferences(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id)ON DELETE CASCADE,
 choice text NOT NULL CHECK(choice IN('unknown','granted','withdrawn')),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991 AND(choice<>'granted'OR revision<9007199254740991)),
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Durable PRODUCT idempotency, deliberately not an analytics identity/delivery receipt.
-- Retain after project/source deletion to prevent reuse/toggle counting; account deletion cascades.
CREATE TABLE firstten_private.product_milestone_markers(
 user_id uuid NOT NULL REFERENCES auth.users(id)ON DELETE CASCADE,
 source_kind text NOT NULL CHECK(source_kind IN('project','interview')),source_id uuid NOT NULL,project_id uuid NOT NULL,
 baseline boolean NOT NULL,marked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,source_kind,source_id)
);
CREATE TABLE firstten_private.product_measurement_mappings(
 user_id uuid NOT NULL REFERENCES auth.users(id)ON DELETE CASCADE,
 entity_kind text NOT NULL CHECK(entity_kind IN('account','project','interview')),source_id uuid NOT NULL,
 ref uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 PRIMARY KEY(user_id,entity_kind,source_id),CHECK(expires_at<=created_at+interval'30 days' AND expires_at>created_at)
);
CREATE TABLE firstten_private.product_event_log(
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_name text NOT NULL CHECK(event_name IN('project_created','interview_completed')),
 schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),producer_version text NOT NULL DEFAULT 'owner-events-v1'CHECK(producer_version='owner-events-v1'),
 source_kind text NOT NULL DEFAULT 'database_transition'CHECK(source_kind='database_transition'),
 environment text NOT NULL CHECK(environment IN('production','development','test')),
 population text NOT NULL CHECK(population IN('ordinary','synthetic','operator','unknown')),
 subject_kind text NOT NULL DEFAULT 'account'CHECK(subject_kind='account'),subject_ref uuid NOT NULL,project_ref uuid NOT NULL,artifact_ref uuid,
 measurement_choice_version bigint NOT NULL CHECK(measurement_choice_version BETWEEN 1 AND 9007199254740990),
 occurred_at timestamptz NOT NULL,received_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 CHECK((event_name='project_created')=(artifact_ref IS NULL)),CHECK(received_at>=occurred_at AND expires_at<=occurred_at+interval'30 days')
);
CREATE TABLE firstten_private.product_event_delivery_receipts(
 user_id uuid NOT NULL REFERENCES auth.users(id)ON DELETE CASCADE,source_kind text NOT NULL CHECK(source_kind IN('project','interview')),source_id uuid NOT NULL,
 event_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 PRIMARY KEY(user_id,source_kind,source_id),CHECK(expires_at<=created_at+interval'30 days')
);
CREATE TABLE firstten_private.product_measurement_choice_receipts(
 user_id uuid NOT NULL REFERENCES auth.users(id)ON DELETE CASCADE,request_id uuid NOT NULL,payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 PRIMARY KEY(user_id,request_id),CHECK(expires_at<=created_at+interval'30 days')
);
CREATE INDEX product_events_expiry ON firstten_private.product_event_log(expires_at);
CREATE INDEX product_events_subject ON firstten_private.product_event_log(subject_ref);
CREATE INDEX product_events_project ON firstten_private.product_event_log(project_ref);
DO $$DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['product_measurement_policy','product_measurement_preferences','product_milestone_markers','product_measurement_mappings','product_event_log','product_event_delivery_receipts','product_measurement_choice_receipts']LOOP
 EXECUTE format('ALTER TABLE firstten_private.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('REVOKE ALL ON firstten_private.%I FROM PUBLIC,anon,authenticated,service_role',n);
END LOOP;END $$;
-- Metadata-only baseline; no historical events, inferred completion times or content read.
INSERT INTO firstten_private.product_milestone_markers(user_id,source_kind,source_id,project_id,baseline)
 SELECT p.user_id,'project',p.id,p.id,true FROM public.projects p JOIN auth.users u ON u.id=p.user_id;
INSERT INTO firstten_private.product_milestone_markers(user_id,source_kind,source_id,project_id,baseline)
 SELECT i.user_id,'interview',i.id,i.project_id,true FROM public.interviews i JOIN auth.users u ON u.id=i.user_id;
CREATE FUNCTION firstten_private.measurement_preference(p_actor uuid)RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('choice',coalesce(p.choice,'unknown'),'revision',coalesce(p.revision,0),'policyVersion',1,'collectionEnabled',g.enabled,'changedAt',p.changed_at)
 FROM firstten_private.product_measurement_policy g LEFT JOIN firstten_private.product_measurement_preferences p ON p.user_id=p_actor WHERE g.singleton
$$;
CREATE FUNCTION firstten_private.erase_product_measurement(p_actor uuid,p_project uuid DEFAULT NULL)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF p_project IS NULL THEN
  DELETE FROM firstten_private.product_event_log WHERE subject_ref IN(SELECT ref FROM firstten_private.product_measurement_mappings WHERE user_id=p_actor AND entity_kind='account');
  DELETE FROM firstten_private.product_measurement_mappings WHERE user_id=p_actor;
  DELETE FROM firstten_private.product_event_delivery_receipts WHERE user_id=p_actor;
  DELETE FROM firstten_private.product_measurement_choice_receipts WHERE user_id=p_actor;
 ELSE
  DELETE FROM firstten_private.product_event_log WHERE project_ref IN(SELECT ref FROM firstten_private.product_measurement_mappings WHERE user_id=p_actor AND entity_kind='project'AND source_id=p_project);
  -- All event references for this project are removed above. Unused artifact mappings expire normally.
  DELETE FROM firstten_private.product_measurement_mappings WHERE user_id=p_actor AND entity_kind='project'AND source_id=p_project;
 END IF;
END $$;
CREATE FUNCTION public.get_product_measurement_preference()RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF auth.uid()IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED');END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.measurement_preference(auth.uid()));END $$;
CREATE FUNCTION public.save_product_measurement_preference(p_choice text,p_expected_revision bigint,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE actor uuid:=auth.uid();p firstten_private.product_measurement_preferences;r firstten_private.product_measurement_choice_receipts;hash text;stamp timestamptz:=clock_timestamp();
BEGIN
 PERFORM 1 FROM auth.users WHERE id=actor FOR SHARE;IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED');END IF;
 IF p_choice IS NULL OR p_choice NOT IN('unknown','granted','withdrawn')OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 -- Serialize first preference creation as well as subsequent revisions.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,25001));
 SELECT * INTO p FROM firstten_private.product_measurement_preferences WHERE user_id=actor FOR UPDATE;
 hash:=encode(sha256(convert_to(jsonb_build_object('choice',p_choice,'revision',p_expected_revision)::text,'UTF8')),'hex');
 SELECT * INTO r FROM firstten_private.product_measurement_choice_receipts WHERE user_id=actor AND request_id=p_request_id AND expires_at>stamp;
 IF r.request_id IS NOT NULL THEN
  IF r.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT');END IF;
  RETURN jsonb_build_object('ok',true,'data',firstten_private.measurement_preference(actor));END IF;
 IF p.choice='withdrawn'AND p_choice='withdrawn'THEN RETURN jsonb_build_object('ok',true,'data',firstten_private.measurement_preference(actor));END IF;
 IF coalesce(p.revision,0)<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT');END IF;
 IF p_expected_revision>=9007199254740991 OR(p_choice<>'withdrawn'AND p_expected_revision>=9007199254740990)THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
 IF p_choice<>'withdrawn'AND(SELECT count(*)FROM firstten_private.product_measurement_choice_receipts WHERE user_id=actor AND expires_at>stamp)>=2000 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
 INSERT INTO firstten_private.product_measurement_preferences(user_id,choice,revision,changed_at)VALUES(actor,p_choice,1,stamp)
 ON CONFLICT(user_id)DO UPDATE SET choice=p_choice,revision=product_measurement_preferences.revision+1,changed_at=stamp;
 -- A new choice never backfills earlier milestones. Withdrawal erases attributable analytics.
 IF p_choice<>'granted'THEN PERFORM firstten_private.erase_product_measurement(actor);END IF;
 DELETE FROM firstten_private.product_measurement_choice_receipts WHERE user_id=actor AND request_id=p_request_id AND expires_at<=stamp;
 INSERT INTO firstten_private.product_measurement_choice_receipts(user_id,request_id,payload_hash,created_at,expires_at)VALUES(actor,p_request_id,hash,stamp,stamp+interval'30 days');
 RETURN jsonb_build_object('ok',true,'data',firstten_private.measurement_preference(actor));END $$;
CREATE FUNCTION firstten_private.measurement_reference(p_actor uuid,p_kind text,p_source uuid,p_until timestamptz)RETURNS firstten_private.product_measurement_mappings
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE m firstten_private.product_measurement_mappings;stamp timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO m FROM firstten_private.product_measurement_mappings WHERE user_id=p_actor AND entity_kind=p_kind AND source_id=p_source FOR UPDATE;
 IF m.ref IS NOT NULL AND m.expires_at<=stamp THEN
  DELETE FROM firstten_private.product_event_log WHERE subject_ref=m.ref OR project_ref=m.ref OR artifact_ref=m.ref;
  DELETE FROM firstten_private.product_measurement_mappings WHERE ref=m.ref;m.ref:=NULL;
 END IF;
 IF m.ref IS NULL THEN
  INSERT INTO firstten_private.product_measurement_mappings(user_id,entity_kind,source_id,created_at,expires_at)VALUES(p_actor,p_kind,p_source,stamp,least(stamp+interval'30 days',p_until))RETURNING * INTO m;
 END IF;RETURN m;END $$;
CREATE FUNCTION firstten_private.record_owner_product_milestone()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
 IF NOT g.enabled OR g.instrumentation_start IS NULL OR g.instrumentation_start>clock_timestamp()OR g.last_purge_at IS NULL OR g.last_purge_at<clock_timestamp()-interval'25 hours'THEN RETURN NEW;END IF;
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
CREATE TRIGGER product_project_created AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION firstten_private.record_owner_product_milestone();
CREATE TRIGGER product_interview_completed AFTER INSERT OR UPDATE OF completed ON public.interviews FOR EACH ROW EXECUTE FUNCTION firstten_private.record_owner_product_milestone();
CREATE FUNCTION firstten_private.erase_deleted_measurement()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_SCHEMA='auth'THEN PERFORM firstten_private.erase_product_measurement(OLD.id);
 ELSIF TG_TABLE_NAME='interviews'THEN
  DELETE FROM firstten_private.product_event_log WHERE artifact_ref IN(SELECT ref FROM firstten_private.product_measurement_mappings WHERE user_id=OLD.user_id AND entity_kind='interview'AND source_id=OLD.id);
  DELETE FROM firstten_private.product_measurement_mappings WHERE user_id=OLD.user_id AND entity_kind='interview'AND source_id=OLD.id;
  DELETE FROM firstten_private.product_event_delivery_receipts WHERE user_id=OLD.user_id AND source_kind='interview'AND source_id=OLD.id;
 ELSE PERFORM firstten_private.erase_product_measurement(OLD.user_id,OLD.id);END IF;RETURN OLD;END $$;
CREATE TRIGGER product_account_deleted BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION firstten_private.erase_deleted_measurement();
CREATE TRIGGER product_interview_deleted BEFORE DELETE ON public.interviews FOR EACH ROW EXECUTE FUNCTION firstten_private.erase_deleted_measurement();
CREATE TRIGGER product_project_deleted BEFORE DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION firstten_private.erase_deleted_measurement();
CREATE FUNCTION public.purge_expired_product_measurement(p_limit integer DEFAULT 1000)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE stamp timestamptz:=clock_timestamp();n integer;removed integer:=0;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION'Invalid purge bound'USING ERRCODE='22023';END IF;
 DELETE FROM firstten_private.product_event_log WHERE event_id IN(SELECT event_id FROM firstten_private.product_event_log WHERE expires_at<=stamp ORDER BY expires_at,event_id LIMIT p_limit);GET DIAGNOSTICS n=ROW_COUNT;removed:=removed+n;
 DELETE FROM firstten_private.product_measurement_mappings WHERE ref IN(SELECT ref FROM firstten_private.product_measurement_mappings m WHERE expires_at<=stamp AND NOT EXISTS(SELECT 1 FROM firstten_private.product_event_log e WHERE e.subject_ref=m.ref OR e.project_ref=m.ref OR e.artifact_ref=m.ref)ORDER BY expires_at,ref LIMIT p_limit);GET DIAGNOSTICS n=ROW_COUNT;removed:=removed+n;
 DELETE FROM firstten_private.product_event_delivery_receipts WHERE(user_id,source_kind,source_id)IN(SELECT user_id,source_kind,source_id FROM firstten_private.product_event_delivery_receipts WHERE expires_at<=stamp ORDER BY expires_at,user_id,source_kind,source_id LIMIT p_limit);GET DIAGNOSTICS n=ROW_COUNT;removed:=removed+n;
 DELETE FROM firstten_private.product_measurement_choice_receipts WHERE(user_id,request_id)IN(SELECT user_id,request_id FROM firstten_private.product_measurement_choice_receipts WHERE expires_at<=stamp ORDER BY expires_at,user_id,request_id LIMIT p_limit);GET DIAGNOSTICS n=ROW_COUNT;removed:=removed+n;
 UPDATE firstten_private.product_measurement_policy SET last_purge_at=stamp WHERE singleton;
 RETURN jsonb_build_object('removedRows',removed,'checkedAt',stamp);END $$;
CREATE FUNCTION public.get_product_measurement_retention_health(p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g firstten_private.product_measurement_policy;n bigint;oldest timestamptz;status text;receipt uuid;
BEGIN
 PERFORM 1 FROM firstten_private.platform_admins WHERE user_id=auth.uid()AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION'Admin access denied'USING ERRCODE='42501';END IF;
 SELECT * INTO g FROM firstten_private.product_measurement_policy WHERE singleton;
 SELECT count(*),min(expires_at)INTO n,oldest FROM(SELECT expires_at FROM firstten_private.product_event_log UNION ALL SELECT expires_at FROM firstten_private.product_measurement_mappings UNION ALL SELECT expires_at FROM firstten_private.product_event_delivery_receipts UNION ALL SELECT expires_at FROM firstten_private.product_measurement_choice_receipts)x WHERE expires_at<=clock_timestamp();
 status:=CASE WHEN NOT g.enabled THEN'disabled'WHEN n>0 OR g.last_purge_at IS NULL OR g.last_purge_at<clock_timestamp()-interval'25 hours'THEN'overdue'ELSE'healthy'END;
 receipt:=public.record_platform_admin_action('funnel_snapshot',CASE WHEN status='overdue'THEN'partial'ELSE'ready'END,p_request_id);
 RETURN jsonb_build_object('collectionEnabled',g.enabled,'instrumentationStart',g.instrumentation_start,'lastPurgeAt',g.last_purge_at,'expiredRows',n,'oldestExpiredAt',oldest,'status',status,'producerVersion','owner-events-v1');END $$;
DO $$DECLARE r record;BEGIN FOR r IN SELECT p.oid::regprocedure signature,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE(n.nspname='firstten_private'AND p.proname IN('measurement_preference','erase_product_measurement','measurement_reference','record_owner_product_milestone','erase_deleted_measurement'))OR(n.nspname='public'AND p.proname IN('get_product_measurement_preference','save_product_measurement_preference','purge_expired_product_measurement','get_product_measurement_retention_health'))LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature);
 IF r.nspname='public'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',r.signature,CASE WHEN r.proname='purge_expired_product_measurement'THEN'service_role'ELSE'authenticated'END);END IF;
END LOOP;END $$;
COMMENT ON TABLE firstten_private.product_milestone_markers IS 'Durable product first-occurrence/idempotency metadata, not an analytics identity/event/delivery receipt. Source deletion/recreation and future opt-in cannot backfill a milestone. Existing rows are legacy baseline only. No evidence text. Retained to account deletion, which cascades. Separate lifecycle from at-most30-day optional measurement.';
COMMENT ON TABLE firstten_private.product_event_log IS 'Disabled-by-default prospective optional owner milestones only. No raw source IDs/content, signup/visit/session/acceptance/guest/funnel or AI charges. At-most30-day lifetime; source mappings may shorten coverage. Operator must wire and verify daily purge before activation.';
COMMIT;
