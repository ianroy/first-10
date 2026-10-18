-- CLS008: explicit teacher-only reviewed Marketing Lab copies; no account/learning facade.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE firstten_private.guest_marketing_plans ADD CONSTRAINT guest_marketing_scope_unique UNIQUE(id,class_id,team_id);
CREATE TABLE firstten_private.marketing_submission_choices(
 plan_id uuid NOT NULL,class_id uuid NOT NULL,team_id uuid NOT NULL,principal_id uuid NOT NULL,
 choice text NOT NULL CHECK(choice IN('unknown','granted','withdrawn')),revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740990),
 PRIMARY KEY(plan_id,principal_id),
 FOREIGN KEY(plan_id,class_id,team_id)REFERENCES firstten_private.guest_marketing_plans(id,class_id,team_id)ON DELETE CASCADE,
 FOREIGN KEY(principal_id,class_id,team_id)REFERENCES public.class_guest_principals(id,class_id,team_id)ON DELETE CASCADE
);
CREATE TABLE firstten_private.marketing_submission_threads(
 id uuid PRIMARY KEY,class_id uuid NOT NULL,team_id uuid NOT NULL,principal_id uuid NOT NULL,plan_id uuid NOT NULL,assignment_id uuid NOT NULL,
 last_version integer NOT NULL DEFAULT 0 CHECK(last_version BETWEEN 0 AND 20),
 UNIQUE(principal_id,plan_id,assignment_id),
 FOREIGN KEY(plan_id,class_id,team_id)REFERENCES firstten_private.guest_marketing_plans(id,class_id,team_id)ON DELETE CASCADE,
 FOREIGN KEY(principal_id,class_id,team_id)REFERENCES public.class_guest_principals(id,class_id,team_id)ON DELETE CASCADE,
 FOREIGN KEY(assignment_id,class_id)REFERENCES public.assignments(id,class_id)ON DELETE CASCADE
);
CREATE TABLE firstten_private.marketing_submission_previews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),thread_id uuid NOT NULL REFERENCES firstten_private.marketing_submission_threads(id)ON DELETE CASCADE,
 request_id uuid NOT NULL,specification jsonb NOT NULL CHECK(octet_length(specification::text)<=65536),binding_hash text NOT NULL CHECK(binding_hash~'^[a-f0-9]{64}$'),
 manifest jsonb NOT NULL CHECK(octet_length(manifest::text)<=40000),payload jsonb NOT NULL CHECK(octet_length(payload::text)<=40000),expected_version integer NOT NULL CHECK(expected_version BETWEEN 0 AND 19),
 expires_at timestamptz NOT NULL,consumed_snapshot_id uuid,UNIQUE(thread_id,request_id)
);
CREATE TABLE firstten_private.marketing_submission_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),thread_id uuid NOT NULL REFERENCES firstten_private.marketing_submission_threads(id)ON DELETE CASCADE,
 version integer NOT NULL CHECK(version BETWEEN 1 AND 20),author_label text NOT NULL CHECK(char_length(author_label)BETWEEN 1 AND 80),
 payload jsonb NOT NULL CHECK(octet_length(payload::text)<=40000),manifest jsonb NOT NULL CHECK(octet_length(manifest::text)<=40000),authority jsonb NOT NULL CHECK(octet_length(authority::text)<=4000),
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(thread_id,version)
);
ALTER TABLE firstten_private.marketing_submission_previews ADD CONSTRAINT marketing_consumed_exists FOREIGN KEY(consumed_snapshot_id)REFERENCES firstten_private.marketing_submission_versions(id);
CREATE TABLE firstten_private.marketing_submission_grants(
 snapshot_id uuid PRIMARY KEY REFERENCES firstten_private.marketing_submission_versions(id)ON DELETE CASCADE,
 state text NOT NULL DEFAULT'active'CHECK(state IN('active','withdrawn')),revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740990),withdrawn_at timestamptz,
 CHECK((state='withdrawn')=(withdrawn_at IS NOT NULL))
);
CREATE TABLE firstten_private.marketing_submission_operations(
 principal_id uuid NOT NULL REFERENCES public.class_guest_principals(id)ON DELETE CASCADE,operation text NOT NULL CHECK(operation IN('choice','submit','withdraw')),request_id uuid NOT NULL,
 payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),target_id uuid NOT NULL,result_snapshot_id uuid REFERENCES firstten_private.marketing_submission_versions(id)ON DELETE CASCADE,
 PRIMARY KEY(principal_id,operation,request_id)
);
CREATE TABLE firstten_private.marketing_submission_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),principal_id uuid NOT NULL REFERENCES public.class_guest_principals(id)ON DELETE CASCADE,class_id uuid NOT NULL,thread_id uuid REFERENCES firstten_private.marketing_submission_threads(id)ON DELETE CASCADE,
 snapshot_id uuid REFERENCES firstten_private.marketing_submission_versions(id)ON DELETE CASCADE,operation text NOT NULL CHECK(operation IN('choice','preview','submit','withdraw')),request_id uuid NOT NULL
);
CREATE INDEX marketing_submission_class ON firstten_private.marketing_submission_threads(class_id,assignment_id,id);
CREATE INDEX marketing_submission_author ON firstten_private.marketing_submission_threads(principal_id,id);
DO $$DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['marketing_submission_choices','marketing_submission_threads','marketing_submission_previews','marketing_submission_versions','marketing_submission_grants','marketing_submission_operations','marketing_submission_audit']LOOP
 EXECUTE format('ALTER TABLE firstten_private.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON firstten_private.%I FROM PUBLIC,anon,authenticated,service_role',n);END LOOP;END $$;
CREATE FUNCTION firstten_private.marketing_handoff_identity()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='marketing_submission_versions'THEN RAISE EXCEPTION 'Reviewed marketing content is immutable' USING ERRCODE='42501';
 ELSIF TG_TABLE_NAME='marketing_submission_threads'THEN
  IF(to_jsonb(NEW)-'last_version')IS DISTINCT FROM(to_jsonb(OLD)-'last_version')OR NEW.last_version<>OLD.last_version+1 THEN RAISE EXCEPTION 'Thread identity is immutable' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='marketing_submission_choices'THEN
  IF(to_jsonb(NEW)-ARRAY['choice','revision'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['choice','revision'])OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Choice identity is immutable' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='marketing_submission_grants'THEN
  IF NEW.snapshot_id<>OLD.snapshot_id OR OLD.state<>'active'OR NEW.state<>'withdrawn'OR NEW.revision<>OLD.revision+1 OR NEW.withdrawn_at IS NULL THEN RAISE EXCEPTION 'Grant only reduces' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='marketing_submission_previews'THEN
  IF(to_jsonb(NEW)-'consumed_snapshot_id')IS DISTINCT FROM(to_jsonb(OLD)-'consumed_snapshot_id')OR OLD.consumed_snapshot_id IS NOT NULL OR NEW.consumed_snapshot_id IS NULL OR NOT EXISTS(SELECT 1 FROM firstten_private.marketing_submission_versions WHERE id=NEW.consumed_snapshot_id AND thread_id=OLD.thread_id)THEN RAISE EXCEPTION 'Preview is immutable' USING ERRCODE='42501';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER marketing_version_immutable BEFORE UPDATE ON firstten_private.marketing_submission_versions FOR EACH ROW EXECUTE FUNCTION firstten_private.marketing_handoff_identity();
CREATE TRIGGER marketing_thread_identity BEFORE UPDATE ON firstten_private.marketing_submission_threads FOR EACH ROW EXECUTE FUNCTION firstten_private.marketing_handoff_identity();
CREATE TRIGGER marketing_choice_identity BEFORE UPDATE ON firstten_private.marketing_submission_choices FOR EACH ROW EXECUTE FUNCTION firstten_private.marketing_handoff_identity();
CREATE TRIGGER marketing_grant_reduces BEFORE UPDATE ON firstten_private.marketing_submission_grants FOR EACH ROW EXECUTE FUNCTION firstten_private.marketing_handoff_identity();
CREATE TRIGGER marketing_preview_identity BEFORE UPDATE ON firstten_private.marketing_submission_previews FOR EACH ROW EXECUTE FUNCTION firstten_private.marketing_handoff_identity();
CREATE TRIGGER marketing_audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON firstten_private.marketing_submission_audit FOR EACH STATEMENT EXECUTE FUNCTION firstten_private.deny_admin_audit_change();
CREATE FUNCTION firstten_private.marketing_choice_view(p_plan uuid,p_principal uuid)RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('planId',p_plan,'choice',coalesce(c.choice,'unknown'),'revision',coalesce(c.revision,0))FROM(VALUES(1))x LEFT JOIN firstten_private.marketing_submission_choices c ON c.plan_id=p_plan AND c.principal_id=p_principal
$$;
CREATE FUNCTION firstten_private.marketing_publication_bytes(p_principal uuid,p_class uuid,p_add bigint)RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 WITH stored AS(
 SELECT t.principal_id,t.class_id,octet_length(p.payload::text)+octet_length(p.manifest::text)+octet_length(p.specification::text) AS bytes FROM firstten_private.marketing_submission_previews p JOIN firstten_private.marketing_submission_threads t ON t.id=p.thread_id WHERE t.class_id=p_class
 UNION ALL SELECT t.principal_id,t.class_id,octet_length(v.payload::text)+octet_length(v.manifest::text)+octet_length(v.authority::text) FROM firstten_private.marketing_submission_versions v JOIN firstten_private.marketing_submission_threads t ON t.id=v.thread_id WHERE t.class_id=p_class)
 SELECT coalesce(sum(bytes)FILTER(WHERE principal_id=p_principal),0)+p_add<=2097152 AND coalesce(sum(bytes),0)+p_add<=16777216 FROM stored
$$;
CREATE FUNCTION public.get_guest_marketing_sharing_choice(p_session text,p_plan_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_marketing_plans;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 SELECT * INTO a FROM firstten_private.guest_marketing_plans WHERE id=p_plan_id;
 IF NOT firstten_private.guest_marketing_access(a,p)OR(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.marketing_choice_view(a.id,p.id));
END $$;
CREATE FUNCTION public.save_guest_marketing_sharing_choice(p_session text,p_plan_id uuid,p_choice text,p_expected_revision bigint,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_marketing_plans;c firstten_private.marketing_submission_choices;op firstten_private.marketing_submission_operations;hash text;n integer;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 -- Restrictive choices are not blocked by rate/storage capacity.
 IF p_choice IS NULL OR p_choice NOT IN('unknown','granted','withdrawn')OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740989 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 IF p_choice<>'withdrawn'AND NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 SELECT * INTO a FROM firstten_private.guest_marketing_plans WHERE id=p_plan_id FOR SHARE;
 IF NOT firstten_private.guest_marketing_access(a,p)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 hash:=encode(sha256(convert_to(jsonb_build_object('plan',p_plan_id,'choice',p_choice,'revision',p_expected_revision)::text,'UTF8')),'hex');
 SELECT * INTO op FROM firstten_private.marketing_submission_operations WHERE principal_id=p.id AND operation='choice'AND request_id=p_request_id;
 SELECT * INTO c FROM firstten_private.marketing_submission_choices WHERE plan_id=a.id AND principal_id=p.id FOR UPDATE;
 IF op.request_id IS NOT NULL THEN
  IF op.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
 ELSE
  IF c.choice='withdrawn'AND p_choice='withdrawn'THEN RETURN jsonb_build_object('ok',true,'data',firstten_private.marketing_choice_view(a.id,p.id));END IF;
  IF coalesce(c.revision,0)<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT','currentRevision',coalesce(c.revision,0));END IF;
  IF p_choice<>'withdrawn'AND c.revision>=9007199254740989 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  IF p_choice<>'withdrawn'AND(SELECT count(*)FROM firstten_private.marketing_submission_operations WHERE principal_id=p.id)>=2000 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  INSERT INTO firstten_private.marketing_submission_choices(plan_id,class_id,team_id,principal_id,choice,revision)VALUES(a.id,p.class_id,p.team_id,p.id,p_choice,1)
  ON CONFLICT(plan_id,principal_id)DO UPDATE SET choice=p_choice,revision=marketing_submission_choices.revision+1;
  INSERT INTO firstten_private.marketing_submission_operations(principal_id,operation,request_id,payload_hash,target_id)VALUES(p.id,'choice',p_request_id,hash,a.id);
  INSERT INTO firstten_private.marketing_submission_audit(principal_id,class_id,operation,request_id)VALUES(p.id,p.class_id,'choice',p_request_id);
 END IF;
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RAISE EXCEPTION 'Guest expired during choice' USING ERRCODE='PGX02';END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.marketing_choice_view(a.id,p.id));
EXCEPTION WHEN SQLSTATE'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');WHEN invalid_parameter_value OR invalid_text_representation OR check_violation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END $$;
CREATE FUNCTION firstten_private.build_marketing_publication(a firstten_private.guest_marketing_plans,p public.class_guest_principals,spec jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE c firstten_private.marketing_submission_choices;item jsonb;source jsonb;phrase jsonb;k text;f text;body text;payload jsonb:='{"schemaVersion":1}';excerpts jsonb:='[]';manifest jsonb;seen text[]:='{}';n integer:=0;
BEGIN
 IF NOT firstten_private.guest_marketing_access(a,p)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF a.revision IS DISTINCT FROM(spec->>'expectedPlanRevision')::bigint THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
 SELECT * INTO c FROM firstten_private.marketing_submission_choices WHERE plan_id=a.id AND principal_id=p.id;
 IF c.choice IS DISTINCT FROM'granted'THEN RETURN jsonb_build_object('ok',false,'code','SHARING_REQUIRED');END IF;
 IF jsonb_typeof(spec->'selections')IS DISTINCT FROM'array'OR jsonb_array_length(spec->'selections')NOT BETWEEN 1 AND 12 OR jsonb_typeof(spec->'redactions')IS DISTINCT FROM'array'OR jsonb_array_length(spec->'redactions')>30 OR jsonb_typeof(spec->'reflection')IS DISTINCT FROM'object'OR(SELECT count(*)FROM jsonb_object_keys(spec->'reflection'))<>5 OR NOT(spec->'reflection')?&ARRAY['title','interpretation','uncertainty','decision','nextAction']THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 FOR phrase IN SELECT value FROM jsonb_array_elements(spec->'redactions')LOOP IF jsonb_typeof(phrase)IS DISTINCT FROM'string'OR char_length(btrim(phrase#>>'{}'))NOT BETWEEN 1 AND 200 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;END LOOP;
 FOREACH f IN ARRAY ARRAY['title','interpretation','uncertainty','decision','nextAction']LOOP
  body:=spec->'reflection'->>f;
  IF jsonb_typeof(spec->'reflection'->f)IS DISTINCT FROM'string'OR char_length(body)>(CASE WHEN f='title'THEN 120 WHEN f='interpretation'THEN 3000 ELSE 2000 END)OR(f='title'AND btrim(body)='')THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  FOR phrase IN SELECT value FROM jsonb_array_elements(spec->'redactions')LOOP body:=replace(body,phrase#>>'{}','[Redacted]');END LOOP;
  body:=firstten_private.submission_scrub(body);
  IF char_length(body)>(CASE WHEN f='title'THEN 120 WHEN f='interpretation'THEN 3000 ELSE 2000 END)OR(f='title'AND btrim(body)='')THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  payload:=payload||jsonb_build_object(f,body);
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(spec->'selections')LOOP
  IF jsonb_typeof(item)IS DISTINCT FROM'object'OR NOT item?&ARRAY['kind','recordId']OR EXISTS(SELECT 1 FROM jsonb_object_keys(item)x WHERE x NOT IN('kind','recordId','excerpt'))OR jsonb_typeof(item->'kind')IS DISTINCT FROM'string'OR jsonb_typeof(item->'recordId')IS DISTINCT FROM'string'OR(item->>'recordId')::uuid IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  k:=item->>'kind';source:=NULL;
  IF k IN('thinking','audience','resources','test','reflection')AND(item->>'recordId')::uuid=a.id THEN
   source:=a.document->k;IF k='test'THEN source:=source-'tasks';END IF;
  ELSIF k IN('channel','content','outreach','task','measurement')THEN
   source:=firstten_private.marketing_find(CASE k WHEN'channel'THEN a.document->'channels'WHEN'content'THEN a.document->'content'WHEN'outreach'THEN a.document->'outreach'WHEN'task'THEN a.document#>'{test,tasks}'ELSE a.document->'measurements'END,item->>'recordId');
  END IF;
  IF source IS NULL OR(k||':'||(item->>'recordId'))=ANY(seen)THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  seen:=array_append(seen,k||':'||(item->>'recordId'));body:=source::text;
  IF item?'excerpt'THEN
   IF jsonb_typeof(item->'excerpt')IS DISTINCT FROM'string'OR char_length(item->>'excerpt')NOT BETWEEN 1 AND 6000 OR strpos(body,item->>'excerpt')=0 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;body:=item->>'excerpt';
  END IF;
  IF char_length(body)NOT BETWEEN 1 AND 6000 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  FOR phrase IN SELECT value FROM jsonb_array_elements(spec->'redactions')LOOP body:=replace(body,phrase#>>'{}','[Redacted]');END LOOP;
  body:=firstten_private.submission_scrub(body);IF char_length(body)NOT BETWEEN 1 AND 6000 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  n:=n+1;excerpts:=excerpts||jsonb_build_array(jsonb_build_object('key','excerpt.'||n,'label','Marketing Lab - '||k,'text',body,'sourceKind','guest_marketing','evidenceLabel','Student-authored / student-reported; not verified customer evidence'));
 END LOOP;
 payload:=payload||jsonb_build_object('excerpts',excerpts);
 manifest:=jsonb_build_object('planId',a.id,'sourceAudience',a.audience,'sourceAuthor',a.author_principal_id,'planRevision',a.revision,'planHash',encode(sha256(convert_to(a.document::text,'UTF8')),'hex'),'choiceRevision',c.revision,'publisher',p.id);
 IF octet_length(payload::text)>40000 OR payload::text~*'-----BEGIN [A-Z ]*PRIVATE KEY-----|(sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9._-]{16,}'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 RETURN jsonb_build_object('ok',true,'payload',payload,'manifest',manifest);
END $$;
CREATE FUNCTION public.preview_guest_marketing_submission(p_session text,p_document jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_marketing_plans;t firstten_private.marketing_submission_threads;preview firstten_private.marketing_submission_previews;authority jsonb;built jsonb;binding text;tid uuid;rid uuid;aid uuid;pid uuid;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 IF p_document IS NULL OR jsonb_typeof(p_document)IS DISTINCT FROM'object'OR octet_length(p_document::text)>65536 OR(SELECT count(*)FROM jsonb_object_keys(p_document))<>8 OR NOT p_document?&ARRAY['planId','expectedPlanRevision','assignmentId','threadId','requestId','selections','redactions','reflection']OR jsonb_typeof(p_document->'expectedPlanRevision')IS DISTINCT FROM'number'OR(p_document->>'expectedPlanRevision')::numeric NOT BETWEEN 1 AND 9007199254740990 OR(p_document->>'expectedPlanRevision')::numeric<>trunc((p_document->>'expectedPlanRevision')::numeric)THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 tid:=(p_document->>'threadId')::uuid;rid:=(p_document->>'requestId')::uuid;aid:=(p_document->>'assignmentId')::uuid;pid:=(p_document->>'planId')::uuid;
 IF tid IS NULL OR rid IS NULL OR aid IS NULL OR pid IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 authority:=firstten_private.guest_publication_authority(p,aid);IF authority IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;IF authority?'invalidLabel'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 SELECT * INTO a FROM firstten_private.guest_marketing_plans WHERE id=pid FOR SHARE;
 built:=firstten_private.build_marketing_publication(a,p,p_document);IF built->>'ok'<>'true'THEN RETURN built;END IF;
 IF EXISTS(SELECT 1 FROM firstten_private.marketing_submission_threads WHERE id=tid AND(principal_id<>p.id OR plan_id<>pid OR class_id<>p.class_id OR team_id<>p.team_id OR assignment_id<>aid))THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO t FROM firstten_private.marketing_submission_threads WHERE principal_id=p.id AND plan_id=pid AND assignment_id=aid FOR UPDATE;
 IF t.id IS NULL THEN
  IF(SELECT count(*)FROM firstten_private.marketing_submission_threads WHERE principal_id=p.id)>=50 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  INSERT INTO firstten_private.marketing_submission_threads(id,class_id,team_id,principal_id,plan_id,assignment_id)VALUES(tid,p.class_id,p.team_id,p.id,pid,aid)RETURNING * INTO t;
 END IF;
 binding:=encode(sha256(convert_to(jsonb_build_object('authority',authority,'manifest',built->'manifest','payload',built->'payload','version',t.last_version)::text,'UTF8')),'hex');
 SELECT * INTO preview FROM firstten_private.marketing_submission_previews WHERE thread_id=t.id AND request_id=rid;
 IF preview.id IS NOT NULL THEN
  IF preview.specification<>p_document THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
  IF preview.expires_at<=clock_timestamp()OR preview.consumed_snapshot_id IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','EXPIRED');END IF;
  IF preview.binding_hash<>binding THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
 ELSE
  IF t.last_version>=20 OR(SELECT count(*)FROM firstten_private.marketing_submission_previews WHERE thread_id=t.id)>=50 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  binding:=encode(sha256(convert_to(jsonb_build_object('authority',authority,'manifest',built->'manifest','payload',built->'payload','version',t.last_version)::text,'UTF8')),'hex');
  IF NOT firstten_private.marketing_publication_bytes(p.id,p.class_id,octet_length((built->'payload')::text)+octet_length((built->'manifest')::text)+octet_length(p_document::text))THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  INSERT INTO firstten_private.marketing_submission_previews(thread_id,request_id,specification,binding_hash,manifest,payload,expected_version,expires_at)VALUES(t.id,rid,p_document,binding,built->'manifest',built->'payload',t.last_version,least(clock_timestamp()+interval'10 minutes',(authority->>'accessExpiresAt')::timestamptz))RETURNING * INTO preview;
  INSERT INTO firstten_private.marketing_submission_audit(principal_id,class_id,thread_id,operation,request_id)VALUES(p.id,p.class_id,t.id,'preview',rid);
 END IF;
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RAISE EXCEPTION'Guest expired during preview'USING ERRCODE='PGX02';END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('id',preview.id,'hash',preview.binding_hash,'threadId',t.id,'expiresAt',preview.expires_at,'audience','teacher','payload',preview.payload));
EXCEPTION WHEN SQLSTATE'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');WHEN invalid_parameter_value OR invalid_text_representation OR check_violation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END $$;
CREATE FUNCTION firstten_private.marketing_publication_allowed(p_snapshot uuid)RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v firstten_private.marketing_submission_versions;t firstten_private.marketing_submission_threads;
BEGIN
 SELECT * INTO v FROM firstten_private.marketing_submission_versions WHERE id=p_snapshot;
 SELECT * INTO t FROM firstten_private.marketing_submission_threads WHERE id=v.thread_id;
 IF t.id IS NULL OR NOT EXISTS(SELECT 1 FROM firstten_private.marketing_submission_grants WHERE snapshot_id=v.id AND state='active')THEN RETURN false;END IF;
 -- Metadata only: ordinary later plan edits never rewrite or revoke the immutable copy.
 RETURN EXISTS(SELECT 1 FROM public.classes WHERE id=t.class_id AND revision=(v.authority->>'classRevision')::bigint AND archived_at IS NULL AND access_expires_at=(v.authority->>'accessExpiresAt')::timestamptz AND access_expires_at>clock_timestamp())
 AND EXISTS(SELECT 1 FROM public.assignments WHERE id=t.assignment_id AND class_id=t.class_id AND state='published'AND revision=(v.authority->>'assignmentRevision')::bigint)
 AND EXISTS(SELECT 1 FROM public.class_teams WHERE id=t.team_id AND class_id=t.class_id AND archived_at IS NULL AND access_revision=(v.authority->>'teamGeneration')::bigint)
 AND EXISTS(SELECT 1 FROM public.class_guest_principals WHERE id=t.principal_id AND class_id=t.class_id AND team_id=t.team_id AND revoked_at IS NULL AND access_revision=(v.authority->>'principalGeneration')::bigint)
 AND EXISTS(SELECT 1 FROM firstten_private.guest_marketing_plans WHERE id=t.plan_id AND class_id=t.class_id AND team_id=t.team_id AND audience=v.manifest->>'sourceAudience'AND author_principal_id=(v.manifest->>'sourceAuthor')::uuid AND(audience='team_shared'OR author_principal_id=t.principal_id))
 AND EXISTS(SELECT 1 FROM firstten_private.marketing_submission_choices WHERE plan_id=t.plan_id AND principal_id=t.principal_id AND choice='granted'AND revision=(v.manifest->>'choiceRevision')::bigint);
END $$;
CREATE FUNCTION firstten_private.marketing_submission_view(v firstten_private.marketing_submission_versions,include_payload boolean DEFAULT true)RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',v.id,'threadId',t.id,'classId',t.class_id,'assignmentId',t.assignment_id,'sourceType','guest_marketing','version',v.version,'audience','teacher','authorLabel',v.author_label,'submittedAt',v.submitted_at,'grantState',g.state,'grantRevision',g.revision,'recipientEligible',firstten_private.marketing_publication_allowed(v.id),'title',v.payload->>'title')||CASE WHEN include_payload THEN jsonb_build_object('payload',v.payload)ELSE'{}'::jsonb END FROM firstten_private.marketing_submission_threads t JOIN firstten_private.marketing_submission_grants g ON g.snapshot_id=v.id WHERE t.id=v.thread_id
$$;
CREATE FUNCTION public.confirm_guest_marketing_submission(p_session text,p_preview_id uuid,p_preview_hash text,p_request_id uuid,p_confirmed boolean)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_marketing_plans;t firstten_private.marketing_submission_threads;preview firstten_private.marketing_submission_previews;v firstten_private.marketing_submission_versions;op firstten_private.marketing_submission_operations;authority jsonb;built jsonb;binding text;hash text;target uuid;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 IF p_confirmed IS DISTINCT FROM true OR p_preview_id IS NULL OR p_request_id IS NULL OR p_preview_hash IS NULL OR p_preview_hash!~'^[a-f0-9]{64}$'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 SELECT thread_id INTO target FROM firstten_private.marketing_submission_previews WHERE id=p_preview_id;
 SELECT * INTO t FROM firstten_private.marketing_submission_threads WHERE id=target AND principal_id=p.id AND class_id=p.class_id AND team_id=p.team_id FOR UPDATE;
 IF t.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO preview FROM firstten_private.marketing_submission_previews WHERE id=p_preview_id AND thread_id=t.id FOR UPDATE;
 IF preview.binding_hash IS DISTINCT FROM p_preview_hash THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
 hash:=encode(sha256(convert_to(jsonb_build_object('preview',p_preview_id,'hash',p_preview_hash,'confirmed',p_confirmed)::text,'UTF8')),'hex');
 SELECT * INTO op FROM firstten_private.marketing_submission_operations WHERE principal_id=p.id AND operation='submit'AND request_id=p_request_id;
 IF op.request_id IS NOT NULL THEN
  IF op.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
  SELECT * INTO v FROM firstten_private.marketing_submission_versions WHERE id=op.result_snapshot_id;
 ELSE
  IF(SELECT count(*)FROM firstten_private.marketing_submission_operations WHERE principal_id=p.id)>=2000 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  IF preview.consumed_snapshot_id IS NOT NULL THEN SELECT * INTO v FROM firstten_private.marketing_submission_versions WHERE id=preview.consumed_snapshot_id;
  ELSE
   IF preview.expires_at<=clock_timestamp()THEN RETURN jsonb_build_object('ok',false,'code','EXPIRED');END IF;
   IF t.last_version<>preview.expected_version THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
   authority:=firstten_private.guest_publication_authority(p,t.assignment_id);IF authority IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;IF authority?'invalidLabel'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
   SELECT * INTO a FROM firstten_private.guest_marketing_plans WHERE id=t.plan_id FOR SHARE;
   built:=firstten_private.build_marketing_publication(a,p,preview.specification);IF built->>'ok'<>'true'THEN RETURN built;END IF;
   binding:=encode(sha256(convert_to(jsonb_build_object('authority',authority,'manifest',built->'manifest','payload',built->'payload','version',t.last_version)::text,'UTF8')),'hex');
   IF binding<>preview.binding_hash THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
   IF(SELECT count(*)FROM firstten_private.marketing_submission_operations WHERE principal_id=p.id)>=2000 OR NOT firstten_private.marketing_publication_bytes(p.id,p.class_id,octet_length(preview.payload::text)+octet_length(preview.manifest::text)+octet_length(authority::text))THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
   INSERT INTO firstten_private.marketing_submission_versions(thread_id,version,author_label,payload,manifest,authority)VALUES(t.id,t.last_version+1,authority->>'label',preview.payload,preview.manifest,authority)RETURNING * INTO v;
   INSERT INTO firstten_private.marketing_submission_grants(snapshot_id)VALUES(v.id);
   UPDATE firstten_private.marketing_submission_threads SET last_version=last_version+1 WHERE id=t.id;
   UPDATE firstten_private.marketing_submission_previews SET consumed_snapshot_id=v.id WHERE id=preview.id;
   INSERT INTO firstten_private.marketing_submission_audit(principal_id,class_id,thread_id,snapshot_id,operation,request_id)VALUES(p.id,p.class_id,t.id,v.id,'submit',p_request_id);
  END IF;
  INSERT INTO firstten_private.marketing_submission_operations(principal_id,operation,request_id,payload_hash,target_id,result_snapshot_id)VALUES(p.id,'submit',p_request_id,hash,p_preview_id,v.id);
 END IF;
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RAISE EXCEPTION'Guest expired during confirmation'USING ERRCODE='PGX02';END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.marketing_submission_view(v));
EXCEPTION WHEN SQLSTATE'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');WHEN invalid_parameter_value OR invalid_text_representation OR check_violation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END $$;
CREATE FUNCTION public.get_guest_marketing_submission(p_session text,p_snapshot_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;v firstten_private.marketing_submission_versions;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 SELECT s.* INTO v FROM firstten_private.marketing_submission_versions s JOIN firstten_private.marketing_submission_threads t ON t.id=s.thread_id WHERE s.id=p_snapshot_id AND t.principal_id=p.id AND t.class_id=p.class_id AND t.team_id=p.team_id;
 IF v.id IS NULL OR(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.marketing_submission_view(v));END $$;
CREATE FUNCTION public.list_guest_marketing_submissions(p_session text,p_cursor uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;items jsonb;next_id uuid;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 SELECT coalesce(jsonb_agg(firstten_private.marketing_submission_view(v,false)ORDER BY v.id),'[]')INTO items FROM(SELECT s.* FROM firstten_private.marketing_submission_versions s JOIN firstten_private.marketing_submission_threads t ON t.id=s.thread_id WHERE t.principal_id=p.id AND t.class_id=p.class_id AND t.team_id=p.team_id AND(p_cursor IS NULL OR s.id>p_cursor)ORDER BY s.id LIMIT 50)v;
 IF jsonb_array_length(items)=50 THEN next_id:=(items->49->>'id')::uuid;END IF;
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_id));END $$;
CREATE FUNCTION public.withdraw_guest_marketing_submission(p_session text,p_snapshot_id uuid,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;v firstten_private.marketing_submission_versions;g firstten_private.marketing_submission_grants;own_thread firstten_private.marketing_submission_threads;op firstten_private.marketing_submission_operations;hash text;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF p_snapshot_id IS NULL OR p_request_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 SELECT s.* INTO v FROM firstten_private.marketing_submission_versions s JOIN firstten_private.marketing_submission_threads t ON t.id=s.thread_id WHERE s.id=p_snapshot_id AND t.principal_id=p.id AND t.class_id=p.class_id AND t.team_id=p.team_id;
 IF v.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO g FROM firstten_private.marketing_submission_grants WHERE snapshot_id=v.id FOR UPDATE;
 hash:=encode(sha256(convert_to(p_snapshot_id::text,'UTF8')),'hex');
 SELECT * INTO op FROM firstten_private.marketing_submission_operations WHERE principal_id=p.id AND operation='withdraw'AND request_id=p_request_id;
 IF op.request_id IS NOT NULL AND op.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
 IF g.state='active'THEN
  UPDATE firstten_private.marketing_submission_grants SET state='withdrawn',revision=revision+1,withdrawn_at=clock_timestamp()WHERE snapshot_id=v.id;
  SELECT * INTO own_thread FROM firstten_private.marketing_submission_threads WHERE id=v.thread_id;
  INSERT INTO firstten_private.marketing_submission_audit(principal_id,class_id,thread_id,snapshot_id,operation,request_id)VALUES(p.id,p.class_id,own_thread.id,v.id,'withdraw',p_request_id);
  INSERT INTO firstten_private.marketing_submission_operations(principal_id,operation,request_id,payload_hash,target_id,result_snapshot_id)VALUES(p.id,'withdraw',p_request_id,hash,v.id,v.id);
 END IF;
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RAISE EXCEPTION'Guest expired during withdrawal'USING ERRCODE='PGX02';END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.marketing_submission_view(v,false));
EXCEPTION WHEN SQLSTATE'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END $$;
CREATE FUNCTION public.get_teacher_guest_marketing_submission(p_class_id uuid,p_snapshot_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE v firstten_private.marketing_submission_versions;r text;
BEGIN
 IF auth.uid()IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 PERFORM 1 FROM public.classes WHERE id=p_class_id FOR SHARE;r:=firstten_private.class_role(p_class_id,false);
 SELECT s.* INTO v FROM firstten_private.marketing_submission_versions s JOIN firstten_private.marketing_submission_threads t ON t.id=s.thread_id WHERE s.id=p_snapshot_id AND t.class_id=p_class_id;
 IF r IS NULL OR r NOT IN('owner','teacher')OR v.id IS NULL OR NOT firstten_private.marketing_publication_allowed(v.id)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.marketing_submission_view(v));END $$;
CREATE FUNCTION public.list_teacher_guest_marketing_submissions(p_class_id uuid,p_assignment_id uuid DEFAULT NULL,p_cursor uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE items jsonb;next_id uuid;r text;
BEGIN
 IF auth.uid()IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 PERFORM 1 FROM public.classes WHERE id=p_class_id FOR SHARE;r:=firstten_private.class_role(p_class_id,false);
 IF r IS NULL OR r NOT IN('owner','teacher')THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT coalesce(jsonb_agg(firstten_private.marketing_submission_view(v,false)ORDER BY v.id),'[]')INTO items FROM(SELECT s.* FROM firstten_private.marketing_submission_versions s JOIN firstten_private.marketing_submission_threads t ON t.id=s.thread_id WHERE t.class_id=p_class_id AND(p_assignment_id IS NULL OR t.assignment_id=p_assignment_id)AND(p_cursor IS NULL OR s.id>p_cursor)AND firstten_private.marketing_publication_allowed(s.id)ORDER BY s.id LIMIT 50)v;
 IF jsonb_array_length(items)=50 THEN next_id:=(items->49->>'id')::uuid;END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_id));END $$;
DO $$DECLARE r record;BEGIN FOR r IN SELECT p.oid::regprocedure signature,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE(n.nspname='firstten_private'AND p.proname IN('marketing_handoff_identity','marketing_choice_view','marketing_publication_bytes','build_marketing_publication','marketing_publication_allowed','marketing_submission_view'))OR(n.nspname='public'AND p.proname IN('get_guest_marketing_sharing_choice','save_guest_marketing_sharing_choice','preview_guest_marketing_submission','confirm_guest_marketing_submission','get_guest_marketing_submission','list_guest_marketing_submissions','withdraw_guest_marketing_submission','get_teacher_guest_marketing_submission','list_teacher_guest_marketing_submissions'))LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature);IF r.nspname='public'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',r.signature,CASE WHEN r.proname IN('get_teacher_guest_marketing_submission','list_teacher_guest_marketing_submissions')THEN'authenticated'ELSE'service_role'END);END IF;END LOOP;END $$;
COMMENT ON TABLE firstten_private.marketing_submission_choices IS 'Publisher-reported eligibility for selected authored marketing material, not verified participant consent and not an audience access grant. Explicit confirmation creates the separate grant.';
COMMENT ON TABLE firstten_private.marketing_submission_versions IS 'Immutable teacher-only selected and redacted authored copies; no raw-plan teacher access. Ordinary edits do not rewrite the copy. Permission/scope generations invalidate without revival. Previously downloaded copies cannot be recalled; guest expiry ends private author access.';
COMMIT;
