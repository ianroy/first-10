-- CLS008 continuation: manual account-free Marketing Lab. No account project/auth facade.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION firstten_private.normalize_guest_marketing(doc jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE d jsonb;ids text[];item jsonb;asset jsonb;
BEGIN
 IF doc IS NULL OR octet_length(doc::text)>262144 THEN RAISE EXCEPTION 'Invalid guest plan size' USING ERRCODE='22023'; END IF;
 d:=firstten_private.marketing_normalize(doc,'{"type":"object","properties":{"schemaVersion":{"type":"integer","const":1},"title":{"type":"string","maxLength":120},"thinking":{"type":"object","properties":{"observations":{"type":"string","maxLength":3000},"reachableAudience":{"type":"string","maxLength":1500},"usefulAction":{"type":"string","maxLength":1000},"channelIdeas":{"type":"string","maxLength":2000},"completedAt":{"type":"string","format":"instant","maxLength":35,"nullable":true}}},"audience":{"type":"object","properties":{"beachhead":{"type":"string","maxLength":1500},"situation":{"type":"string","maxLength":1500},"valueProposition":{"type":"string","maxLength":2000},"assumptions":{"type":"string","maxLength":2000},"sourceNotes":{"type":"string","maxLength":3000}}},"channels":{"type":"array","maxItems":12,"items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","maxLength":36},"name":{"type":"string","maxLength":120},"medium":{"type":"string","enum":["physical","digital"]},"place":{"type":"string","maxLength":500},"observation":{"type":"string","maxLength":2000},"fitReason":{"type":"string","maxLength":1000},"access":{"type":"string","enum":["unknown","needs_permission","requested","allowed","not_required","denied"]},"rules":{"type":"string","maxLength":1500},"sourceNote":{"type":"string","maxLength":1500},"checkedOn":{"type":"string","format":"day","maxLength":10,"nullable":true},"estimatedMinutes":{"type":"integer","minimum":0,"maximum":1000000,"nullable":true},"unknowns":{"type":"string","maxLength":1000}}}},"primaryChannelId":{"type":"string","format":"uuid","maxLength":36,"nullable":true},"alternativeChannelId":{"type":"string","format":"uuid","maxLength":36,"nullable":true},"selectionReason":{"type":"string","maxLength":1500},"content":{"type":"array","maxItems":20,"items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","maxLength":36},"channelId":{"type":"string","format":"uuid","maxLength":36},"format":{"type":"string","enum":["community_post","organizer_email","dm","social_caption","flyer","demo_script"]},"hook":{"type":"string","maxLength":1000},"truthfulSupport":{"type":"string","maxLength":2000},"body":{"type":"string","maxLength":6000},"builderDisclosure":{"type":"string","maxLength":1000},"callToAction":{"type":"string","maxLength":1000},"destination":{"type":"string","maxLength":1000},"firstUsefulAction":{"type":"string","maxLength":1000},"review":{"type":"object","properties":{"truthful":{"type":"boolean"},"builderDisclosed":{"type":"boolean"},"accessChecked":{"type":"boolean"},"destinationChecked":{"type":"boolean"}}},"walkthrough":{"type":"object","properties":{"mode":{"type":"string","enum":["unknown","self","peer"]},"understoodAudience":{"type":"string","maxLength":1000},"actionObserved":{"type":"string","maxLength":1500},"hesitation":{"type":"string","maxLength":1000},"revision":{"type":"string","maxLength":1500}}}}}},"outreach":{"type":"array","maxItems":20,"items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","maxLength":36},"channelId":{"type":"string","format":"uuid","maxLength":36},"recipientRole":{"type":"string","maxLength":200},"purpose":{"type":"string","enum":["permission","interview","product_test","follow_up"]},"subject":{"type":"string","maxLength":300},"body":{"type":"string","maxLength":4000},"respectfulExit":{"type":"string","maxLength":1000},"status":{"type":"string","enum":["draft","reviewed","manually_sent","replied","declined"]},"observation":{"type":"string","maxLength":1500}}}},"resources":{"type":"object","properties":{"cashBudgetCents":{"type":"integer","const":0},"availableMinutes":{"type":"integer","minimum":0,"maximum":1000000,"nullable":true},"existingResources":{"type":"string","maxLength":1500},"limitations":{"type":"string","maxLength":1500},"fallback":{"type":"string","maxLength":1500}}},"test":{"type":"object","properties":{"hypothesis":{"type":"string","maxLength":2000},"state":{"type":"string","enum":["draft","ready_to_review","running","reviewed"]},"primaryMetric":{"type":"string","enum":["relevant_reach","visits","useful_action","return","referral"]},"baseline":{"type":"integer","minimum":0,"maximum":1000000,"nullable":true},"target":{"type":"integer","minimum":0,"maximum":1000000,"nullable":true},"unknowns":{"type":"string","maxLength":1500},"measurementPlan":{"type":"string","maxLength":2000},"repeatIf":{"type":"string","maxLength":1000},"reviseIf":{"type":"string","maxLength":1000},"stopIf":{"type":"string","maxLength":1000},"startOn":{"type":"string","format":"day","maxLength":10,"nullable":true},"endOn":{"type":"string","format":"day","maxLength":10,"nullable":true},"reviewOn":{"type":"string","format":"day","maxLength":10,"nullable":true},"tasks":{"type":"array","maxItems":30,"items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","maxLength":36},"title":{"type":"string","maxLength":200},"ownerAlias":{"type":"string","maxLength":120},"dueOn":{"type":"string","format":"day","maxLength":10,"nullable":true},"prerequisite":{"type":"string","maxLength":1000},"doneMeans":{"type":"string","maxLength":1000},"status":{"type":"string","enum":["todo","doing","done","blocked"]},"completionNote":{"type":"string","maxLength":1500}}}}}},"measurements":{"type":"array","maxItems":40,"items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","maxLength":36},"channelId":{"type":"string","format":"uuid","maxLength":36},"assetId":{"type":"string","format":"uuid","maxLength":36,"nullable":true},"metric":{"type":"string","enum":["relevant_reach","visits","useful_action","return","referral"]},"cohort":{"type":"string","enum":["peer_test","classmate","external","automated","mixed_unknown"]},"from":{"type":"string","format":"day","maxLength":10},"to":{"type":"string","format":"day","maxLength":10},"unit":{"type":"string","enum":["unique_people","sessions","events"]},"count":{"type":"integer","minimum":0,"maximum":1000000,"nullable":true},"source":{"type":"string","maxLength":1500},"recordedOn":{"type":"string","format":"day","maxLength":10},"limitations":{"type":"string","maxLength":2000}}}},"reflection":{"type":"object","properties":{"decision":{"type":"string","enum":["unknown","repeat","revise","stop"]},"evidenceIds":{"type":"array","maxItems":40,"items":{"type":"string","format":"uuid","maxLength":36}},"learned":{"type":"string","maxLength":3000},"uncertainty":{"type":"string","maxLength":2000},"nextAction":{"type":"string","maxLength":2000}}}}}'::jsonb);
 SELECT array_agg(value->>'id')INTO ids FROM(SELECT value FROM jsonb_array_elements(d->'channels')UNION ALL SELECT value FROM jsonb_array_elements(d->'content')UNION ALL SELECT value FROM jsonb_array_elements(d->'outreach')UNION ALL SELECT value FROM jsonb_array_elements(d#>'{test,tasks}')UNION ALL SELECT value FROM jsonb_array_elements(d->'measurements'))x;
 IF cardinality(ids)<>(SELECT count(DISTINCT x)FROM unnest(ids)x)THEN RAISE EXCEPTION 'Duplicate plan ids' USING ERRCODE='22023';END IF;
 IF (d->'primaryChannelId'<>'null'::jsonb AND firstten_private.marketing_find(d->'channels',d->>'primaryChannelId')IS NULL)OR(d->'alternativeChannelId'<>'null'::jsonb AND firstten_private.marketing_find(d->'channels',d->>'alternativeChannelId')IS NULL)OR(d->'primaryChannelId'<>'null'::jsonb AND d->'primaryChannelId'=d->'alternativeChannelId')THEN RAISE EXCEPTION 'Invalid channel selection' USING ERRCODE='22023';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'content')UNION ALL SELECT value FROM jsonb_array_elements(d->'outreach')UNION ALL SELECT value FROM jsonb_array_elements(d->'measurements') LOOP
  IF firstten_private.marketing_find(d->'channels',item->>'channelId')IS NULL THEN RAISE EXCEPTION 'Invalid plan channel' USING ERRCODE='22023';END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'measurements')LOOP
  asset:=firstten_private.marketing_find(d->'content',item->>'assetId');
  IF item->>'from'>item->>'to'OR(item->'assetId'<>'null'::jsonb AND(asset IS NULL OR asset->'channelId'IS DISTINCT FROM item->'channelId'))THEN RAISE EXCEPTION 'Invalid measurement scope' USING ERRCODE='22023';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(d#>'{reflection,evidenceIds}')x WHERE firstten_private.marketing_find(d->'measurements',x.value#>>'{}')IS NULL)THEN RAISE EXCEPTION 'Invalid reflection reference' USING ERRCODE='22023';END IF;
 IF d#>'{test,startOn}'<>'null'::jsonb AND d#>'{test,endOn}'<>'null'::jsonb AND d#>>'{test,startOn}'>d#>>'{test,endOn}'THEN RAISE EXCEPTION 'Invalid test dates' USING ERRCODE='22023';END IF;
 IF d#>'{thinking,completedAt}'<>'null'::jsonb AND (d#>>'{thinking,observations}'=''OR d#>>'{thinking,reachableAudience}'=''OR d#>>'{thinking,usefulAction}'=''OR d#>>'{thinking,channelIdeas}'='')THEN RAISE EXCEPTION 'Record initial thinking first' USING ERRCODE='22023';END IF;
 IF d::text~*'-----BEGIN [A-Z ]*PRIVATE KEY-----|(sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9._-]{16,}'THEN RAISE EXCEPTION 'Remove credentials' USING ERRCODE='22023';END IF;
 RETURN d;
END $$;
CREATE TABLE firstten_private.guest_marketing_plans(
 id uuid PRIMARY KEY,class_id uuid NOT NULL,team_id uuid NOT NULL,author_principal_id uuid NOT NULL,
 audience text NOT NULL CHECK(audience IN('principal_private','team_shared')),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 document jsonb NOT NULL CHECK(document=firstten_private.normalize_guest_marketing(document)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(author_principal_id,class_id,team_id) REFERENCES public.class_guest_principals(id,class_id,team_id)ON DELETE CASCADE
);
CREATE INDEX guest_marketing_team_lookup ON firstten_private.guest_marketing_plans(class_id,team_id,id);
CREATE INDEX guest_marketing_private_lookup ON firstten_private.guest_marketing_plans(author_principal_id,id)WHERE audience='principal_private';
CREATE TABLE firstten_private.guest_marketing_operations(
 principal_id uuid NOT NULL REFERENCES public.class_guest_principals(id)ON DELETE CASCADE,
 request_id uuid NOT NULL,payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),
 target_id uuid NOT NULL REFERENCES firstten_private.guest_marketing_plans(id)ON DELETE CASCADE,
 saved_revision bigint NOT NULL CHECK(saved_revision BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(principal_id,request_id)
);
ALTER TABLE firstten_private.guest_marketing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.guest_marketing_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.guest_marketing_plans,firstten_private.guest_marketing_operations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION firstten_private.guest_marketing_identity()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF(NEW.id,NEW.class_id,NEW.team_id,NEW.author_principal_id,NEW.audience,NEW.created_at)IS DISTINCT FROM(OLD.id,OLD.class_id,OLD.team_id,OLD.author_principal_id,OLD.audience,OLD.created_at)OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Guest plan scope is immutable' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guest_marketing_identity BEFORE UPDATE ON firstten_private.guest_marketing_plans FOR EACH ROW EXECUTE FUNCTION firstten_private.guest_marketing_identity();
CREATE FUNCTION firstten_private.guest_marketing_access(a firstten_private.guest_marketing_plans,p public.class_guest_principals)RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$SELECT a.id IS NOT NULL AND a.class_id=p.class_id AND a.team_id=p.team_id AND(a.audience='team_shared'OR a.author_principal_id=p.id)$$;
CREATE FUNCTION firstten_private.guest_marketing_record(a firstten_private.guest_marketing_plans,include_document boolean DEFAULT true)RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$SELECT jsonb_build_object('id',a.id,'classId',a.class_id,'teamId',a.team_id,'authorPrincipalId',a.author_principal_id,'audience',a.audience,'revision',a.revision,'savedAt',a.updated_at,'aiEnabled',false)||CASE WHEN include_document THEN jsonb_build_object('document',a.document)ELSE '{}'::jsonb END$$;
CREATE FUNCTION public.list_guest_marketing_plans(p_session text)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;items jsonb;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 SELECT coalesce(jsonb_agg(firstten_private.guest_marketing_record(a,false)ORDER BY a.id),'[]')INTO items FROM firstten_private.guest_marketing_plans a WHERE a.class_id=p.class_id AND a.team_id=p.team_id AND(a.audience='team_shared'OR a.author_principal_id=p.id);
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'data',items);
END $$;
CREATE FUNCTION public.load_guest_marketing_plan(p_session text,p_plan_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_marketing_plans;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 SELECT * INTO a FROM firstten_private.guest_marketing_plans WHERE id=p_plan_id;
 IF NOT firstten_private.guest_marketing_access(a,p)OR(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.guest_marketing_record(a));
END $$;
CREATE FUNCTION public.save_guest_marketing_plan(p_session text,p_plan_id uuid,p_audience text,p_expected_revision bigint,p_mutation_id uuid,p_shared_confirmed boolean,p_document jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_marketing_plans;op firstten_private.guest_marketing_operations;d jsonb;hash text;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 IF p_plan_id IS NULL OR p_mutation_id IS NULL OR p_audience IS NULL OR p_audience NOT IN('principal_private','team_shared')OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 d:=firstten_private.normalize_guest_marketing(p_document);
 hash:=encode(sha256(convert_to(jsonb_build_object('plan',p_plan_id,'audience',p_audience,'revision',p_expected_revision,'sharedConfirmed',p_shared_confirmed,'document',d)::text,'UTF8')),'hex');
 SELECT * INTO op FROM firstten_private.guest_marketing_operations WHERE principal_id=p.id AND request_id=p_mutation_id;
 SELECT * INTO a FROM firstten_private.guest_marketing_plans WHERE id=p_plan_id FOR UPDATE;
 IF a.id IS NOT NULL AND(NOT firstten_private.guest_marketing_access(a,p)OR a.audience<>p_audience)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF op.request_id IS NOT NULL THEN
  IF op.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
  IF NOT firstten_private.guest_marketing_access(a,p)OR(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('record',firstten_private.guest_marketing_record(a),'savedRevision',op.saved_revision,'replayed',true));
 END IF;
 IF coalesce(a.revision,0)<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT','currentRevision',coalesce(a.revision,0));END IF;
 IF(SELECT count(*)FROM firstten_private.guest_marketing_operations WHERE principal_id=p.id)>=2000 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
 IF a.id IS NULL THEN
  IF p_audience='team_shared'AND p_shared_confirmed IS DISTINCT FROM true THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  IF(p_audience='principal_private'AND(SELECT count(*)FROM firstten_private.guest_marketing_plans WHERE author_principal_id=p.id AND audience='principal_private')>=3)OR(p_audience='team_shared'AND(SELECT count(*)FROM firstten_private.guest_marketing_plans WHERE team_id=p.team_id AND audience='team_shared')>=5)THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  INSERT INTO firstten_private.guest_marketing_plans(id,class_id,team_id,author_principal_id,audience,revision,document)VALUES(p_plan_id,p.class_id,p.team_id,p.id,p_audience,1,d)RETURNING * INTO a;
 ELSE
  IF a.document#>'{thinking,completedAt}'<>'null'::jsonb AND a.document->'thinking'IS DISTINCT FROM d->'thinking'THEN RETURN jsonb_build_object('ok',false,'code','PRESERVED_VERSION');END IF;
  UPDATE firstten_private.guest_marketing_plans SET revision=revision+1,document=d,updated_at=clock_timestamp()WHERE id=a.id RETURNING * INTO a;
 END IF;
 INSERT INTO firstten_private.guest_marketing_operations(principal_id,request_id,payload_hash,target_id,saved_revision)VALUES(p.id,p_mutation_id,hash,a.id,a.revision);
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RAISE EXCEPTION 'Guest expired during plan save' USING ERRCODE='PGX02';END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('record',firstten_private.guest_marketing_record(a),'savedRevision',a.revision,'replayed',false));
EXCEPTION WHEN SQLSTATE 'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');WHEN invalid_parameter_value OR invalid_text_representation OR check_violation OR numeric_value_out_of_range OR datetime_field_overflow THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END $$;
DO $$DECLARE r record;BEGIN FOR r IN SELECT p.oid::regprocedure signature,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE(n.nspname='firstten_private'AND p.proname IN('normalize_guest_marketing','guest_marketing_identity','guest_marketing_access','guest_marketing_record'))OR(n.nspname='public'AND p.proname IN('list_guest_marketing_plans','load_guest_marketing_plan','save_guest_marketing_plan'))LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature);IF r.nspname='public'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature);END IF;END LOOP;END $$;
COMMIT;
