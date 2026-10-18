-- CLS008. Genuine guest resources; no invented auth user or project. AI stays disabled.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION firstten_private.normalize_guest_learning(doc jsonb)RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE d jsonb;core jsonb;i jsonb;r jsonb;script jsonb;ids text[];k text;
BEGIN
 IF doc IS NULL OR jsonb_typeof(doc)<>'object' OR octet_length(doc::text)>262144 OR (SELECT count(*)FROM jsonb_object_keys(doc))<>4 OR NOT doc?&ARRAY['schemaVersion','discovery','interviews','permissions'] OR doc->'schemaVersion'IS DISTINCT FROM'1'::jsonb THEN RAISE EXCEPTION 'Invalid guest activity' USING ERRCODE='22023';END IF;
 core:=firstten_private.normalize_discovery(doc->'discovery');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(core->'people')x WHERE x->'contactId'<>'null'::jsonb)THEN RAISE EXCEPTION 'No account contact links' USING ERRCODE='22023';END IF;
 d:=firstten_private.marketing_normalize(doc-'discovery','{"type":"object","properties":{"schemaVersion":{"type":"integer","const":1},"interviews":{"type":"array","maxItems":20,"items":{"type":"object","properties":{"id":{"type":"string","format":"uuid","maxLength":36},"alias":{"type":"string","maxLength":120},"scriptId":{"type":"string","format":"uuid","maxLength":36},"capturedAt":{"type":"string","format":"instant","maxLength":35},"completed":{"type":"boolean"},"answers":{"type":"array","minItems":1,"maxItems":20,"items":{"type":"object","properties":{"q":{"type":"string","maxLength":1000},"note":{"type":"string","maxLength":4000},"quote":{"type":"string","maxLength":2000}}}},"choices":{"type":"object","properties":{"note":{"type":"string","enum":["unknown","granted","withdrawn"]},"ai":{"type":"string","enum":["unknown","granted","withdrawn"]},"sharing":{"type":"string","enum":["unknown","granted","withdrawn"]},"revision":{"type":"integer","minimum":1,"maximum":9007199254740991}}}}}},"permissions":{"type":"object","properties":{"ai":{"type":"string","enum":["unknown","granted","withdrawn"]},"sharing":{"type":"string","enum":["unknown","granted","withdrawn"]},"revision":{"type":"integer","minimum":1,"maximum":9007199254740991}}}}}'::jsonb)||jsonb_build_object('discovery',core);
 SELECT array_agg(value->>'id')INTO ids FROM(SELECT value FROM jsonb_array_elements(core->'hypotheses')UNION ALL SELECT value FROM jsonb_array_elements(core->'people')UNION ALL SELECT value FROM jsonb_array_elements(core->'scripts')UNION ALL SELECT value FROM jsonb_array_elements(core->'contexts')UNION ALL SELECT value FROM jsonb_array_elements(core->'results')UNION ALL SELECT value FROM jsonb_array_elements(d->'interviews'))x;
 IF cardinality(ids)<>(SELECT count(DISTINCT x)FROM unnest(ids)x)THEN RAISE EXCEPTION 'Duplicate guest activity ids' USING ERRCODE='22023';END IF;
 FOR i IN SELECT value FROM jsonb_array_elements(d->'interviews')LOOP
  script:=firstten_private.marketing_find(core->'scripts',i->>'scriptId');
  IF jsonb_array_length(i->'answers')=0 OR script IS NULL OR script->'questions'IS DISTINCT FROM(SELECT jsonb_agg(a->'q' ORDER BY n)FROM jsonb_array_elements(i->'answers')WITH ORDINALITY x(a,n))THEN RAISE EXCEPTION 'Exact guest script required' USING ERRCODE='22023';END IF;
  IF ((i->>'completed')::boolean OR EXISTS(SELECT 1 FROM jsonb_array_elements(i->'answers')a WHERE a->>'note'<>'' OR a->>'quote'<>''))AND i#>>'{choices,note}'<>'granted'THEN RAISE EXCEPTION 'Note permission required' USING ERRCODE='22023';END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(core->'results')LOOP
  IF r->'interviewId'<>'null'::jsonb THEN
   i:=firstten_private.marketing_find(d->'interviews',r->>'interviewId');
   IF i IS NULL OR i->>'completed'<>'true' OR i#>>'{choices,note}'<>'granted' OR r->'scriptId'IS DISTINCT FROM i->'scriptId'THEN RAISE EXCEPTION 'Invalid guest interview source' USING ERRCODE='22023';END IF;
  END IF;
 END LOOP;
 IF d::text~*'-----BEGIN [A-Z ]*PRIVATE KEY-----|(sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9._-]{16,}'THEN RAISE EXCEPTION 'Remove credentials' USING ERRCODE='22023';END IF;
 RETURN d;
END $$;
CREATE TABLE firstten_private.guest_learning_activities(
 id uuid PRIMARY KEY,class_id uuid NOT NULL,team_id uuid NOT NULL,author_principal_id uuid NOT NULL,
 audience text NOT NULL CHECK(audience IN('principal_private','team_shared')),
 activity_kind text NOT NULL DEFAULT 'discovery' CHECK(activity_kind='discovery'),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 document jsonb NOT NULL CHECK(document=firstten_private.normalize_guest_learning(document)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(author_principal_id,class_id,team_id)REFERENCES public.class_guest_principals(id,class_id,team_id)ON DELETE CASCADE,
 CHECK(audience='principal_private' OR(document->'interviews'='[]'::jsonb AND NOT jsonb_path_exists(document,'$.discovery.results[*] ? (@.interviewId != null || @.quote != "")')))
);
CREATE TABLE firstten_private.guest_learning_operations(
 principal_id uuid NOT NULL REFERENCES public.class_guest_principals(id)ON DELETE CASCADE,
 operation text NOT NULL CHECK(operation IN('save','submit','withdraw')),request_id uuid NOT NULL,payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),
 target_id uuid NOT NULL,saved_revision bigint,result_snapshot_id uuid REFERENCES firstten_private.class_submission_versions(id)ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(principal_id,operation,request_id)
);
CREATE TABLE firstten_private.guest_learning_buckets(
 principal_id uuid NOT NULL REFERENCES public.class_guest_principals(id)ON DELETE CASCADE,
 window_start timestamptz NOT NULL,attempts integer NOT NULL CHECK(attempts BETWEEN 1 AND 120),PRIMARY KEY(principal_id)
);
DO $$DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['guest_learning_activities','guest_learning_operations','guest_learning_buckets']LOOP
 EXECUTE format('ALTER TABLE firstten_private.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON firstten_private.%I FROM PUBLIC,anon,authenticated,service_role',n);
END LOOP;END $$;
CREATE FUNCTION firstten_private.guest_learning_identity()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF(NEW.id,NEW.class_id,NEW.team_id,NEW.author_principal_id,NEW.audience,NEW.activity_kind,NEW.created_at)IS DISTINCT FROM(OLD.id,OLD.class_id,OLD.team_id,OLD.author_principal_id,OLD.audience,OLD.activity_kind,OLD.created_at)OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Guest scope is immutable' USING ERRCODE='42501';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guest_learning_identity BEFORE UPDATE ON firstten_private.guest_learning_activities FOR EACH ROW EXECUTE FUNCTION firstten_private.guest_learning_identity();
-- All guest RPCs use the existing opaque session, and serialize with closure/revocation/recovery.
CREATE FUNCTION firstten_private.lock_guest_learning(p_session text)RETURNS public.class_guest_principals
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;cid uuid;
BEGIN
 IF p_session IS NULL OR p_session!~'^[a-f0-9]{64}$'THEN RETURN NULL;END IF;
 SELECT class_id INTO cid FROM firstten_private.class_guest_sessions WHERE token_hash=firstten_private.guest_hash(p_session);
 IF cid IS NULL THEN RETURN NULL;END IF;
 PERFORM 1 FROM public.classes WHERE id=cid FOR UPDATE;
 p:=firstten_private.resolve_guest(p_session);IF p.id IS NULL THEN RETURN NULL;END IF;
 PERFORM 1 FROM public.class_teams WHERE id=p.team_id AND class_id=p.class_id FOR SHARE;
 PERFORM 1 FROM public.class_guest_principals WHERE id=p.id AND class_id=p.class_id AND team_id=p.team_id FOR SHARE;
 RETURN firstten_private.resolve_guest(p_session);
END $$;
CREATE FUNCTION firstten_private.guest_learning_rate(p_principal uuid)RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE n integer;stamp timestamptz:=date_trunc('minute',clock_timestamp());
BEGIN
 INSERT INTO firstten_private.guest_learning_buckets(principal_id,window_start,attempts)VALUES(p_principal,stamp,1)
 ON CONFLICT(principal_id)DO UPDATE SET attempts=CASE WHEN guest_learning_buckets.window_start=stamp THEN guest_learning_buckets.attempts+1 ELSE 1 END,window_start=stamp
 WHERE guest_learning_buckets.window_start<>stamp OR guest_learning_buckets.attempts<120 RETURNING attempts INTO n;
 RETURN n IS NOT NULL;
END $$;
CREATE FUNCTION firstten_private.guest_learning_access(a firstten_private.guest_learning_activities,p public.class_guest_principals)RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$SELECT a.id IS NOT NULL AND a.class_id=p.class_id AND a.team_id=p.team_id AND(a.audience='team_shared' OR a.author_principal_id=p.id)$$;
CREATE FUNCTION firstten_private.guest_learning_record(a firstten_private.guest_learning_activities,include_document boolean DEFAULT true)RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$SELECT jsonb_build_object('id',a.id,'classId',a.class_id,'teamId',a.team_id,'authorPrincipalId',a.author_principal_id,'audience',a.audience,'revision',a.revision,'savedAt',a.updated_at,'aiEnabled',false)||CASE WHEN include_document THEN jsonb_build_object('document',a.document)ELSE '{}'::jsonb END$$;
CREATE FUNCTION public.list_guest_learning_activities(p_session text)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;items jsonb;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 SELECT coalesce(jsonb_agg(firstten_private.guest_learning_record(a,false)ORDER BY a.id),'[]')INTO items FROM firstten_private.guest_learning_activities a WHERE a.class_id=p.class_id AND a.team_id=p.team_id AND(a.audience='team_shared'OR a.author_principal_id=p.id);
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'data',items);
END $$;
CREATE FUNCTION public.load_guest_learning_activity(p_session text,p_activity_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_learning_activities;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 SELECT * INTO a FROM firstten_private.guest_learning_activities WHERE id=p_activity_id;
 IF NOT firstten_private.guest_learning_access(a,p)OR(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.guest_learning_record(a));
END $$;
-- At capacity, privacy restrictions remain possible without reopening ordinary editing.
CREATE FUNCTION firstten_private.guest_learning_restriction(before_doc jsonb,after_doc jsonb)RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE expected jsonb:=before_doc;old_i jsonb;new_i jsonb;items jsonb:='[]';answers jsonb;removed text[]:='{}';k text;changed boolean:=false;local_changed boolean;
BEGIN
 FOREACH k IN ARRAY ARRAY['ai','sharing']LOOP
  IF before_doc->'permissions'->k IS DISTINCT FROM after_doc->'permissions'->k THEN
   IF after_doc->'permissions'->>k IS DISTINCT FROM'withdrawn'THEN RETURN false;END IF;changed:=true;
  END IF;
 END LOOP;
 expected:=jsonb_set(expected,'{permissions}',after_doc->'permissions');
 FOR old_i IN SELECT value FROM jsonb_array_elements(before_doc->'interviews')LOOP
  new_i:=firstten_private.marketing_find(after_doc->'interviews',old_i->>'id');IF new_i IS NULL THEN RETURN false;END IF;local_changed:=false;
  FOREACH k IN ARRAY ARRAY['note','ai','sharing']LOOP
   IF old_i->'choices'->k IS DISTINCT FROM new_i->'choices'->k THEN
    IF new_i->'choices'->>k IS DISTINCT FROM'withdrawn'THEN RETURN false;END IF;changed:=true;local_changed:=true;
   END IF;
  END LOOP;
  IF old_i#>>'{choices,note}'<>'withdrawn'AND new_i#>>'{choices,note}'='withdrawn'THEN
   SELECT jsonb_agg(jsonb_set(jsonb_set(x,'{note}','""'),'{quote}','""')ORDER BY ordinal)INTO answers FROM jsonb_array_elements(old_i->'answers')WITH ORDINALITY t(x,ordinal);
   old_i:=jsonb_set(jsonb_set(old_i,'{answers}',answers),'{completed}','false');removed:=array_append(removed,old_i->>'id');
  END IF;
  old_i:=jsonb_set(old_i,'{choices}',new_i->'choices');items:=items||jsonb_build_array(old_i);
 END LOOP;
 expected:=jsonb_set(expected,'{interviews}',items);
 IF cardinality(removed)>0 THEN expected:=jsonb_set(expected,'{discovery,results}',(SELECT coalesce(jsonb_agg(x ORDER BY ordinal),'[]')FROM jsonb_array_elements(before_doc#>'{discovery,results}')WITH ORDINALITY t(x,ordinal)WHERE NOT coalesce(x->>'interviewId'=ANY(removed),false)));END IF;
 RETURN changed AND expected=after_doc;
END $$;
CREATE FUNCTION public.save_guest_learning_activity(p_session text,p_activity_id uuid,p_audience text,p_expected_revision bigint,p_mutation_id uuid,p_shared_confirmed boolean,p_document jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_learning_activities;op firstten_private.guest_learning_operations;d jsonb;hash text;item jsonb;old_item jsonb;k text;ord bigint;changed boolean;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 IF p_activity_id IS NULL OR p_mutation_id IS NULL OR p_audience IS NULL OR p_audience NOT IN('principal_private','team_shared')OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 d:=firstten_private.normalize_guest_learning(p_document);
 IF p_audience='team_shared'AND(d->'interviews'<>'[]'::jsonb OR EXISTS(SELECT 1 FROM jsonb_array_elements(d#>'{discovery,results}')x WHERE x->'interviewId'<>'null'::jsonb OR x->>'quote'<>''))THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 hash:=encode(sha256(convert_to(jsonb_build_object('activity',p_activity_id,'audience',p_audience,'revision',p_expected_revision,'sharedConfirmed',p_shared_confirmed,'document',d)::text,'UTF8')),'hex');
 SELECT * INTO op FROM firstten_private.guest_learning_operations WHERE principal_id=p.id AND operation='save'AND request_id=p_mutation_id;
 IF EXISTS(SELECT 1 FROM firstten_private.guest_learning_activities WHERE id=p_activity_id AND(class_id<>p.class_id OR team_id<>p.team_id OR(audience='principal_private'AND author_principal_id<>p.id)))THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO a FROM firstten_private.guest_learning_activities WHERE id=p_activity_id AND class_id=p.class_id AND team_id=p.team_id FOR UPDATE;
 IF op.request_id IS NOT NULL THEN
  IF op.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
  IF NOT firstten_private.guest_learning_access(a,p)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
  IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('record',firstten_private.guest_learning_record(a),'savedRevision',op.saved_revision,'replayed',true));
 END IF;
 IF a.id IS NOT NULL AND(NOT firstten_private.guest_learning_access(a,p)OR a.audience<>p_audience)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF coalesce(a.revision,0)<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT','currentRevision',coalesce(a.revision,0));END IF;
 IF(SELECT count(*)FROM firstten_private.guest_learning_operations WHERE principal_id=p.id)>=2000 AND(a.id IS NULL OR NOT firstten_private.guest_learning_restriction(a.document,d))THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
 IF a.id IS NULL THEN
  IF d#>>'{permissions,revision}'<>'1'OR EXISTS(SELECT 1 FROM jsonb_array_elements(d->'interviews')i WHERE i#>>'{choices,revision}'<>'1')THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  IF p_audience='team_shared'AND p_shared_confirmed IS DISTINCT FROM true THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  IF(p_audience='principal_private'AND(SELECT count(*)FROM firstten_private.guest_learning_activities WHERE author_principal_id=p.id AND audience='principal_private')>=5)OR(p_audience='team_shared'AND(SELECT count(*)FROM firstten_private.guest_learning_activities WHERE team_id=p.team_id AND audience='team_shared')>=10)THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  INSERT INTO firstten_private.guest_learning_activities(id,class_id,team_id,author_principal_id,audience,revision,document)VALUES(p_activity_id,p.class_id,p.team_id,p.id,p_audience,1,d)RETURNING * INTO a;
 ELSE
  FOREACH k IN ARRAY ARRAY['hypotheses','scripts','contexts']LOOP
   FOR old_item,ord IN SELECT value,ordinality FROM jsonb_array_elements(a.document->'discovery'->k)WITH ORDINALITY LOOP
    IF old_item IS DISTINCT FROM d->'discovery'->k->((ord-1)::integer)THEN RETURN jsonb_build_object('ok',false,'code','PRESERVED_VERSION');END IF;
   END LOOP;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(a.document#>'{discovery,excludedContextIds}')x WHERE NOT d#>'{discovery,excludedContextIds}'@>jsonb_build_array(x.value))THEN RETURN jsonb_build_object('ok',false,'code','PRESERVED_VERSION');END IF;
  changed:=(a.document->'permissions'-'revision')IS DISTINCT FROM(d->'permissions'-'revision');
  IF(d#>>'{permissions,revision}')::bigint<>(a.document#>>'{permissions,revision}')::bigint+CASE WHEN changed THEN 1 ELSE 0 END THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  FOR old_item IN SELECT value FROM jsonb_array_elements(a.document->'interviews')LOOP
   item:=firstten_private.marketing_find(d->'interviews',old_item->>'id');
   IF item IS NULL OR item->'scriptId'IS DISTINCT FROM old_item->'scriptId'OR item->'capturedAt'IS DISTINCT FROM old_item->'capturedAt'OR(SELECT jsonb_agg(x->'q'ORDER BY n)FROM jsonb_array_elements(item->'answers')WITH ORDINALITY t(x,n))IS DISTINCT FROM(SELECT jsonb_agg(x->'q'ORDER BY n)FROM jsonb_array_elements(old_item->'answers')WITH ORDINALITY t(x,n))THEN RETURN jsonb_build_object('ok',false,'code','PRESERVED_VERSION');END IF;
   changed:=(item->'choices'-'revision')IS DISTINCT FROM(old_item->'choices'-'revision');
   IF(item#>>'{choices,revision}')::bigint<>(old_item#>>'{choices,revision}')::bigint+CASE WHEN changed THEN 1 ELSE 0 END THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
   IF old_item->>'completed'='true'AND(item-'choices')IS DISTINCT FROM(old_item-'choices')AND NOT(item#>>'{choices,note}'='withdrawn'AND item->>'completed'='false'AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item->'answers')x WHERE x->>'note'<>''OR x->>'quote'<>''))THEN RETURN jsonb_build_object('ok',false,'code','PRESERVED_VERSION');END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'interviews')i WHERE firstten_private.marketing_find(a.document->'interviews',i->>'id')IS NULL AND i#>>'{choices,revision}'<>'1')THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  UPDATE firstten_private.guest_learning_activities SET revision=revision+1,document=d,updated_at=clock_timestamp()WHERE id=a.id RETURNING * INTO a;
 END IF;
 INSERT INTO firstten_private.guest_learning_operations(principal_id,operation,request_id,payload_hash,target_id,saved_revision)VALUES(p.id,'save',p_mutation_id,hash,a.id,a.revision);
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RAISE EXCEPTION 'Guest expired during save' USING ERRCODE='PGX02';END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('record',firstten_private.guest_learning_record(a),'savedRevision',a.revision,'replayed',false));
EXCEPTION WHEN SQLSTATE 'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');WHEN invalid_parameter_value OR invalid_text_representation OR check_violation OR numeric_value_out_of_range OR datetime_field_overflow THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END $$;
-- A changed/reopened guest scope never silently revives an old reviewed disclosure.
ALTER TABLE public.class_teams ADD COLUMN access_revision bigint NOT NULL DEFAULT 1 CHECK(access_revision BETWEEN 1 AND 9007199254740991);
ALTER TABLE public.class_guest_principals ADD COLUMN access_revision bigint NOT NULL DEFAULT 1 CHECK(access_revision BETWEEN 1 AND 9007199254740991);
CREATE FUNCTION firstten_private.guest_access_generation()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN NEW.access_revision:=OLD.access_revision+1;RETURN NEW;END $$;
CREATE TRIGGER guest_team_generation BEFORE UPDATE ON public.class_teams FOR EACH ROW EXECUTE FUNCTION firstten_private.guest_access_generation();
CREATE TRIGGER guest_principal_generation BEFORE UPDATE ON public.class_guest_principals FOR EACH ROW EXECUTE FUNCTION firstten_private.guest_access_generation();
CREATE FUNCTION firstten_private.guest_publication_authority(p public.class_guest_principals,p_assignment uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE c public.classes;a public.assignments;t public.class_teams;g public.class_guest_principals;label text;
BEGIN
 SELECT * INTO c FROM public.classes WHERE id=p.class_id;
 SELECT * INTO a FROM public.assignments WHERE id=p_assignment AND class_id=p.class_id AND state='published'FOR SHARE;
 SELECT * INTO t FROM public.class_teams WHERE id=p.team_id AND class_id=p.class_id;
 SELECT * INTO g FROM public.class_guest_principals WHERE id=p.id AND class_id=p.class_id AND team_id=p.team_id;
 IF a.id IS NULL OR c.archived_at IS NOT NULL OR c.access_expires_at<=clock_timestamp()OR t.archived_at IS NOT NULL OR g.revoked_at IS NOT NULL THEN RETURN NULL;END IF;
 label:=firstten_private.submission_scrub(g.alias);IF char_length(label)NOT BETWEEN 1 AND 80 THEN RETURN jsonb_build_object('invalidLabel',true);END IF;
 RETURN jsonb_build_object('label',label,'classRevision',c.revision,'assignmentRevision',a.revision,'accessExpiresAt',c.access_expires_at,'teamGeneration',t.access_revision,'principalGeneration',g.access_revision);
END $$;
CREATE FUNCTION firstten_private.build_guest_publication(a firstten_private.guest_learning_activities,p public.class_guest_principals,spec jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE item jsonb;i jsonb;phrase jsonb;f text;body text;label text;src jsonb;payload jsonb;manifest jsonb:='[]';excerpts jsonb:='[]';n integer:=0;value_text text;
BEGIN
 IF NOT firstten_private.guest_learning_access(a,p)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF a.document#>>'{permissions,sharing}'<>'granted'THEN RETURN jsonb_build_object('ok',false,'code','SHARING_REQUIRED');END IF;
 IF jsonb_typeof(spec->'selections')<>'array'OR jsonb_array_length(spec->'selections')NOT BETWEEN 1 AND 12 OR jsonb_typeof(spec->'redactions')<>'array'OR jsonb_array_length(spec->'redactions')>30 OR jsonb_typeof(spec->'reflection')<>'object'OR(SELECT count(*)FROM jsonb_object_keys(spec->'reflection'))<>5 OR NOT(spec->'reflection')?&ARRAY['title','interpretation','uncertainty','decision','nextAction']THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 FOR phrase IN SELECT value FROM jsonb_array_elements(spec->'redactions')LOOP IF jsonb_typeof(phrase)<>'string'OR char_length(phrase#>>'{}')NOT BETWEEN 1 AND 200 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;END LOOP;
 payload:=jsonb_build_object('schemaVersion',1);
 FOREACH f IN ARRAY ARRAY['title','interpretation','uncertainty','decision','nextAction']LOOP
  body:=spec->'reflection'->>f;
  IF jsonb_typeof(spec->'reflection'->f)IS DISTINCT FROM'string'OR char_length(body)>CASE WHEN f='title'THEN 120 WHEN f='interpretation'THEN 3000 ELSE 2000 END OR(f='title'AND btrim(body)='')THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  FOR phrase IN SELECT value FROM jsonb_array_elements(spec->'redactions')LOOP body:=replace(body,phrase#>>'{}','[Redacted]');END LOOP;
  body:=firstten_private.submission_scrub(body);IF char_length(body)>CASE WHEN f='title'THEN 120 WHEN f='interpretation'THEN 3000 ELSE 2000 END OR(f='title'AND btrim(body)='')THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  payload:=payload||jsonb_build_object(f,body);
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(spec->'selections')LOOP
  IF jsonb_typeof(item)<>'object'OR NOT item?&ARRAY['kind','recordId','field']OR EXISTS(SELECT 1 FROM jsonb_object_keys(item)x WHERE x NOT IN('kind','recordId','field','excerpt'))OR jsonb_typeof(item->'kind')<>'string'OR jsonb_typeof(item->'recordId')<>'string'OR jsonb_typeof(item->'field')<>'string'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  src:=jsonb_build_object('activityId',a.id,'kind',item->>'kind','id',item->>'recordId','field',item->>'field','permissionRevision',a.document#>'{permissions,revision}');
  f:=item->>'field';i:=NULL;
  IF item->>'kind'='discovery'AND item->>'recordId'=a.id::text AND f IN('problem','solution','hypothesis','script','reflection','next_test')THEN
   IF f IN('problem','solution')THEN value_text:=a.document#>>ARRAY['discovery','frame',f];
   ELSIF f='hypothesis'THEN value_text:=(a.document#>'{discovery,hypothesisDraft}')::text;
   ELSIF f='script'THEN value_text:=(a.document#>'{discovery,scriptDraft}')::text;
   ELSIF f='reflection'THEN value_text:=(a.document#>'{discovery,reflection}')::text;
   ELSE value_text:=a.document#>>'{discovery,reflection,nextTest}';END IF;
   label:='Guest discovery - '||f;src:=src||jsonb_build_object('hash',encode(sha256(convert_to(a.document::text,'UTF8')),'hex'));
   -- A reflection may carry linked observations. Conservatively bind every actual interview
   -- choice, not an incomplete claim that only one source informed the student's wording.
   IF f IN('reflection','next_test')AND jsonb_array_length(a.document->'interviews')>0 THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(a.document->'interviews')j WHERE j#>>'{choices,note}'<>'granted'OR j#>>'{choices,sharing}'<>'granted')THEN RETURN jsonb_build_object('ok',false,'code','SHARING_REQUIRED');END IF;
    src:=src||jsonb_build_object('interviewDependencies',(SELECT jsonb_agg(jsonb_build_object('id',j->'id','revision',j#>'{choices,revision}'))FROM jsonb_array_elements(a.document->'interviews')j));
   END IF;
  ELSIF item->>'kind'='interview'AND f='answers'AND a.audience='principal_private'AND a.author_principal_id=p.id THEN
   i:=firstten_private.marketing_find(a.document->'interviews',item->>'recordId');
   IF i IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
   IF i->>'completed'<>'true'OR i#>>'{choices,note}'<>'granted'OR i#>>'{choices,sharing}'<>'granted'THEN RETURN jsonb_build_object('ok',false,'code','SHARING_REQUIRED');END IF;
   SELECT string_agg(coalesce(j->>'q','')||E'\nObservation: '||coalesce(j->>'note','')||E'\nReported quote: '||coalesce(j->>'quote',''),E'\n\n'ORDER BY ordinal)INTO value_text FROM jsonb_array_elements(i->'answers')WITH ORDINALITY x(j,ordinal);
   label:='Guest interview - selected observation and reported words';src:=src||jsonb_build_object('hash',encode(sha256(convert_to(i::text,'UTF8')),'hex'),'interviewRevision',i#>'{choices,revision}');
  ELSE RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  IF item?'excerpt'THEN IF jsonb_typeof(item->'excerpt')<>'string'OR char_length(item->>'excerpt')NOT BETWEEN 1 AND 6000 OR strpos(value_text,item->>'excerpt')=0 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;value_text:=item->>'excerpt';END IF;
  IF value_text IS NULL OR char_length(value_text)NOT BETWEEN 1 AND 6000 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  FOR phrase IN SELECT value FROM jsonb_array_elements(spec->'redactions')LOOP value_text:=replace(value_text,phrase#>>'{}','[Redacted]');END LOOP;
  value_text:=firstten_private.submission_scrub(value_text);IF char_length(value_text)NOT BETWEEN 1 AND 6000 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  n:=n+1;excerpts:=excerpts||jsonb_build_array(jsonb_build_object('key','excerpt.'||n,'label',label,'text',firstten_private.submission_scrub(value_text),'sourceKind',item->>'kind','evidenceLabel','Owner-reported; selected and reviewed'));manifest:=manifest||jsonb_build_array(src);
 END LOOP;
 payload:=payload||jsonb_build_object('excerpts',excerpts);
 IF octet_length(payload::text)>40000 OR octet_length(manifest::text)>40000 OR payload::text~*'-----BEGIN [A-Z ]*PRIVATE KEY-----|(sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9._-]{16,}'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 RETURN jsonb_build_object('ok',true,'payload',payload,'manifest',manifest);
END $$;
CREATE FUNCTION public.preview_guest_learning_submission(p_session text,p_document jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_learning_activities;t firstten_private.class_submission_threads;preview firstten_private.class_submission_previews;authority jsonb;built jsonb;binding text;tid uuid;rid uuid;aid uuid;wid uuid;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 IF p_document IS NULL OR jsonb_typeof(p_document)<>'object'OR octet_length(p_document::text)>65536 OR(SELECT count(*)FROM jsonb_object_keys(p_document))<>8 OR NOT p_document?&ARRAY['activityId','assignmentId','threadId','requestId','audience','selections','redactions','reflection']OR p_document->>'audience'NOT IN('teacher','team')THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 tid:=(p_document->>'threadId')::uuid;rid:=(p_document->>'requestId')::uuid;aid:=(p_document->>'assignmentId')::uuid;wid:=(p_document->>'activityId')::uuid;
 IF tid IS NULL OR rid IS NULL OR aid IS NULL OR wid IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 authority:=firstten_private.guest_publication_authority(p,aid);IF authority IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;IF authority?'invalidLabel'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 SELECT * INTO a FROM firstten_private.guest_learning_activities WHERE id=wid AND class_id=p.class_id AND team_id=p.team_id AND(audience='team_shared'OR author_principal_id=p.id)FOR SHARE;
 IF NOT firstten_private.guest_learning_access(a,p)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF EXISTS(SELECT 1 FROM firstten_private.class_submission_threads WHERE id=tid AND(source_type<>'guest_team'OR guest_principal_id IS DISTINCT FROM p.id OR team_id IS DISTINCT FROM p.team_id OR class_id<>p.class_id OR assignment_id<>aid))THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO t FROM firstten_private.class_submission_threads WHERE id=tid AND source_type='guest_team'AND guest_principal_id=p.id AND class_id=p.class_id AND team_id=p.team_id FOR UPDATE;
 IF t.id IS NOT NULL AND(t.source_type<>'guest_team'OR t.guest_principal_id IS DISTINCT FROM p.id OR t.team_id IS DISTINCT FROM p.team_id OR t.class_id<>p.class_id OR t.assignment_id<>aid)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF t.id IS NULL THEN
  IF(SELECT count(*)FROM firstten_private.class_submission_threads WHERE source_type='guest_team'AND guest_principal_id=p.id)>=50 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  INSERT INTO firstten_private.class_submission_threads(id,class_id,assignment_id,source_type,team_id,guest_principal_id)VALUES(tid,p.class_id,aid,'guest_team',p.team_id,p.id)RETURNING * INTO t;
 END IF;
 SELECT * INTO preview FROM firstten_private.class_submission_previews WHERE thread_id=tid AND request_id=rid;
 IF preview.id IS NOT NULL THEN
  IF preview.specification<>p_document THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
  IF preview.expires_at<=clock_timestamp()OR preview.consumed_snapshot_id IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','EXPIRED');END IF;
 ELSE
  IF t.last_version>=20 OR(SELECT count(*)FROM firstten_private.class_submission_previews WHERE thread_id=tid)>=50 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  built:=firstten_private.build_guest_publication(a,p,p_document);IF built->>'ok'<>'true'THEN RETURN built;END IF;
  binding:=encode(sha256(convert_to(jsonb_build_object('authority',authority,'manifest',built->'manifest','payload',built->'payload','version',t.last_version)::text,'UTF8')),'hex');
  INSERT INTO firstten_private.class_submission_previews(thread_id,request_id,specification,binding_hash,manifest,payload,expected_version,expires_at)VALUES(tid,rid,p_document,binding,built->'manifest',built->'payload',t.last_version,least(clock_timestamp()+interval '10 minutes',(authority->>'accessExpiresAt')::timestamptz))RETURNING * INTO preview;
  INSERT INTO firstten_private.class_submission_audit(actor_id,class_id,thread_id,operation,request_id)VALUES(p.id,p.class_id,tid,'preview',rid);
 END IF;
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RAISE EXCEPTION 'Guest expired during preview' USING ERRCODE='PGX02';END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('id',preview.id,'hash',preview.binding_hash,'threadId',tid,'expiresAt',preview.expires_at,'audience',preview.specification->>'audience','payload',preview.payload));
EXCEPTION WHEN SQLSTATE 'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');WHEN invalid_parameter_value OR invalid_text_representation OR check_violation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END $$;
CREATE FUNCTION public.confirm_guest_learning_submission(p_session text,p_preview_id uuid,p_preview_hash text,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_learning_activities;t firstten_private.class_submission_threads;preview firstten_private.class_submission_previews;v firstten_private.class_submission_versions;op firstten_private.guest_learning_operations;authority jsonb;built jsonb;binding text;hash text;target uuid;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 IF p_preview_id IS NULL OR p_request_id IS NULL OR p_preview_hash IS NULL OR p_preview_hash!~'^[a-f0-9]{64}$'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 SELECT thread_id INTO target FROM firstten_private.class_submission_previews WHERE id=p_preview_id;
 SELECT * INTO t FROM firstten_private.class_submission_threads WHERE id=target AND source_type='guest_team'AND guest_principal_id=p.id AND class_id=p.class_id AND team_id=p.team_id;
 IF t.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 authority:=firstten_private.guest_publication_authority(p,t.assignment_id);IF authority IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;IF authority?'invalidLabel'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 SELECT * INTO t FROM firstten_private.class_submission_threads WHERE id=target FOR UPDATE;
 SELECT * INTO preview FROM firstten_private.class_submission_previews WHERE id=p_preview_id AND thread_id=t.id FOR UPDATE;
 IF preview.binding_hash IS DISTINCT FROM p_preview_hash THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
 hash:=encode(sha256(convert_to(jsonb_build_object('preview',p_preview_id,'hash',p_preview_hash)::text,'UTF8')),'hex');
 SELECT * INTO op FROM firstten_private.guest_learning_operations WHERE principal_id=p.id AND operation='submit'AND request_id=p_request_id;
 IF op.request_id IS NOT NULL THEN
  IF op.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
  SELECT * INTO v FROM firstten_private.class_submission_versions WHERE id=op.result_snapshot_id;
  IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
  RETURN jsonb_build_object('ok',true,'data',firstten_private.submission_view(v));
 END IF;
 IF(SELECT count(*)FROM firstten_private.guest_learning_operations WHERE principal_id=p.id)>=2000 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
 IF preview.consumed_snapshot_id IS NOT NULL THEN
  SELECT * INTO v FROM firstten_private.class_submission_versions WHERE id=preview.consumed_snapshot_id;
 ELSE
  IF preview.expires_at<=clock_timestamp()THEN RETURN jsonb_build_object('ok',false,'code','EXPIRED');END IF;
  IF t.last_version<>preview.expected_version THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
  SELECT * INTO a FROM firstten_private.guest_learning_activities WHERE id=(preview.specification->>'activityId')::uuid FOR SHARE;
  built:=firstten_private.build_guest_publication(a,p,preview.specification);IF built->>'ok'<>'true'THEN RETURN built;END IF;
  binding:=encode(sha256(convert_to(jsonb_build_object('authority',authority,'manifest',built->'manifest','payload',built->'payload','version',t.last_version)::text,'UTF8')),'hex');
  IF binding<>preview.binding_hash THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
  INSERT INTO firstten_private.class_submission_versions(thread_id,version,audience,author_label,payload,manifest,authority)VALUES(t.id,t.last_version+1,preview.specification->>'audience',authority->>'label',preview.payload,preview.manifest,authority)RETURNING * INTO v;
  INSERT INTO firstten_private.class_submission_grants(snapshot_id)VALUES(v.id);
  UPDATE firstten_private.class_submission_threads SET last_version=last_version+1 WHERE id=t.id;
  UPDATE firstten_private.class_submission_previews SET consumed_snapshot_id=v.id WHERE id=preview.id;
  INSERT INTO firstten_private.class_submission_audit(actor_id,class_id,thread_id,snapshot_id,operation,request_id)VALUES(p.id,p.class_id,t.id,v.id,'submit',p_request_id);
 END IF;
 INSERT INTO firstten_private.guest_learning_operations(principal_id,operation,request_id,payload_hash,target_id,result_snapshot_id)VALUES(p.id,'submit',p_request_id,hash,p_preview_id,v.id);
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RAISE EXCEPTION 'Guest expired during confirmation' USING ERRCODE='PGX02';END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.submission_view(v));
EXCEPTION WHEN SQLSTATE 'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');WHEN invalid_parameter_value OR invalid_text_representation OR check_violation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END $$;
-- Recipient checks use permission/scope metadata. Source content never becomes a recipient query.
CREATE FUNCTION firstten_private.guest_publication_allowed(p_snapshot uuid)RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE v firstten_private.class_submission_versions;t firstten_private.class_submission_threads;a firstten_private.guest_learning_activities;src jsonb;i jsonb;dep jsonb;
BEGIN
 SELECT * INTO v FROM firstten_private.class_submission_versions WHERE id=p_snapshot;
 SELECT * INTO t FROM firstten_private.class_submission_threads WHERE id=v.thread_id AND source_type='guest_team';
 IF t.id IS NULL OR NOT EXISTS(SELECT 1 FROM firstten_private.class_submission_grants WHERE snapshot_id=v.id AND state='active')THEN RETURN false;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.classes WHERE id=t.class_id AND revision=(v.authority->>'classRevision')::bigint AND access_expires_at=(v.authority->>'accessExpiresAt')::timestamptz AND access_expires_at>clock_timestamp()AND archived_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.assignments WHERE id=t.assignment_id AND class_id=t.class_id AND state='published'AND revision=(v.authority->>'assignmentRevision')::bigint)
 OR NOT EXISTS(SELECT 1 FROM public.class_teams WHERE id=t.team_id AND class_id=t.class_id AND archived_at IS NULL AND access_revision=(v.authority->>'teamGeneration')::bigint)
 OR NOT EXISTS(SELECT 1 FROM public.class_guest_principals WHERE id=t.guest_principal_id AND class_id=t.class_id AND team_id=t.team_id AND revoked_at IS NULL AND access_revision=(v.authority->>'principalGeneration')::bigint)THEN RETURN false;END IF;
 FOR src IN SELECT value FROM jsonb_array_elements(v.manifest)LOOP
  SELECT * INTO a FROM firstten_private.guest_learning_activities WHERE id=(src->>'activityId')::uuid AND class_id=t.class_id AND team_id=t.team_id AND(audience='team_shared'OR author_principal_id=t.guest_principal_id);
  IF a.id IS NULL OR a.document#>>'{permissions,sharing}'<>'granted'OR a.document#>'{permissions,revision}'IS DISTINCT FROM src->'permissionRevision'THEN RETURN false;END IF;
  IF src->>'kind'='interview'THEN
   i:=firstten_private.marketing_find(a.document->'interviews',src->>'id');
   IF i IS NULL OR i->>'completed'<>'true'OR i#>>'{choices,note}'<>'granted'OR i#>>'{choices,sharing}'<>'granted'OR i#>'{choices,revision}'IS DISTINCT FROM src->'interviewRevision'THEN RETURN false;END IF;
  END IF;
  FOR dep IN SELECT value FROM jsonb_array_elements(coalesce(src->'interviewDependencies','[]'))LOOP
   i:=firstten_private.marketing_find(a.document->'interviews',dep->>'id');
   IF i IS NULL OR i#>>'{choices,note}'<>'granted'OR i#>>'{choices,sharing}'<>'granted'OR i#>'{choices,revision}'IS DISTINCT FROM dep->'revision'THEN RETURN false;END IF;
  END LOOP;
 END LOOP;RETURN true;
END $$;
CREATE FUNCTION public.get_guest_learning_submission(p_session text,p_snapshot_id uuid,p_mode text)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;v firstten_private.class_submission_versions;t firstten_private.class_submission_threads;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 SELECT * INTO v FROM firstten_private.class_submission_versions WHERE id=p_snapshot_id;
 SELECT * INTO t FROM firstten_private.class_submission_threads WHERE id=v.thread_id AND source_type='guest_team'AND class_id=p.class_id AND team_id=p.team_id;
 IF t.id IS NULL OR p_mode IS NULL OR p_mode NOT IN('author','team')OR(p_mode='author'AND t.guest_principal_id<>p.id)OR(p_mode='team'AND(v.audience<>'team'OR NOT firstten_private.guest_publication_allowed(v.id)))OR(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.submission_view(v));
END $$;
CREATE FUNCTION public.list_guest_learning_submissions(p_session text,p_mode text,p_cursor uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;items jsonb;next_id uuid;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 IF p_mode IS NULL OR p_mode NOT IN('author','team')THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 SELECT coalesce(jsonb_agg(firstten_private.submission_view(v,false)ORDER BY v.id),'[]')INTO items FROM(SELECT s.* FROM firstten_private.class_submission_versions s JOIN firstten_private.class_submission_threads t ON t.id=s.thread_id WHERE t.source_type='guest_team'AND t.class_id=p.class_id AND t.team_id=p.team_id AND(p_cursor IS NULL OR s.id>p_cursor)AND((p_mode='author'AND t.guest_principal_id=p.id)OR(p_mode='team'AND s.audience='team'AND firstten_private.guest_publication_allowed(s.id)))ORDER BY s.id LIMIT 50)v;
 IF jsonb_array_length(items)=50 THEN next_id:=(items->49->>'id')::uuid;END IF;
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_id));
END $$;
CREATE FUNCTION public.withdraw_guest_learning_submission(p_session text,p_snapshot_id uuid,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;v firstten_private.class_submission_versions;t firstten_private.class_submission_threads;g firstten_private.class_submission_grants;op firstten_private.guest_learning_operations;hash text;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 IF p_snapshot_id IS NULL OR p_request_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 SELECT * INTO v FROM firstten_private.class_submission_versions WHERE id=p_snapshot_id;
 SELECT * INTO t FROM firstten_private.class_submission_threads WHERE id=v.thread_id AND source_type='guest_team'AND guest_principal_id=p.id AND class_id=p.class_id AND team_id=p.team_id;
 IF t.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO g FROM firstten_private.class_submission_grants WHERE snapshot_id=v.id FOR UPDATE;
 hash:=encode(sha256(convert_to(p_snapshot_id::text,'UTF8')),'hex');
 SELECT * INTO op FROM firstten_private.guest_learning_operations WHERE principal_id=p.id AND operation='withdraw'AND request_id=p_request_id;
 IF op.request_id IS NOT NULL AND op.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
 IF g.state='withdrawn'AND op.request_id IS NULL THEN RETURN jsonb_build_object('ok',true,'data',firstten_private.submission_view(v,false));END IF;
 IF g.state='active'THEN
  UPDATE firstten_private.class_submission_grants SET state='withdrawn',revision=revision+1,withdrawn_at=clock_timestamp()WHERE snapshot_id=v.id;
  INSERT INTO firstten_private.class_submission_audit(actor_id,class_id,thread_id,snapshot_id,operation,request_id)VALUES(p.id,p.class_id,t.id,v.id,'withdraw',p_request_id);
 END IF;
 IF op.request_id IS NULL THEN INSERT INTO firstten_private.guest_learning_operations(principal_id,operation,request_id,payload_hash,target_id,result_snapshot_id)VALUES(p.id,'withdraw',p_request_id,hash,v.id,v.id);END IF;
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RAISE EXCEPTION 'Guest expired during withdrawal' USING ERRCODE='PGX02';END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.submission_view(v,false));
EXCEPTION WHEN SQLSTATE 'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END $$;
-- Account teacher entry points stay unchanged; these return only currently eligible guest copies.
CREATE FUNCTION public.get_teacher_guest_learning_submission(p_class_id uuid,p_snapshot_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE v firstten_private.class_submission_versions;r text;
BEGIN
 IF auth.uid()IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 PERFORM 1 FROM public.classes WHERE id=p_class_id FOR SHARE;
 r:=firstten_private.class_role(p_class_id,false);
 SELECT s.* INTO v FROM firstten_private.class_submission_versions s JOIN firstten_private.class_submission_threads t ON t.id=s.thread_id WHERE s.id=p_snapshot_id AND t.class_id=p_class_id AND t.source_type='guest_team'AND s.audience='teacher';
 IF r IS NULL OR r NOT IN('owner','teacher')OR v.id IS NULL OR NOT firstten_private.guest_publication_allowed(v.id)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.submission_view(v));
END $$;
CREATE FUNCTION public.list_teacher_guest_learning_submissions(p_class_id uuid,p_assignment_id uuid DEFAULT NULL,p_cursor uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE items jsonb;next_id uuid;r text;
BEGIN
 IF auth.uid()IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;PERFORM 1 FROM public.classes WHERE id=p_class_id FOR SHARE;r:=firstten_private.class_role(p_class_id,false);
 IF r IS NULL OR r NOT IN('owner','teacher')THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT coalesce(jsonb_agg(firstten_private.submission_view(v,false)ORDER BY v.id),'[]')INTO items FROM(SELECT s.* FROM firstten_private.class_submission_versions s JOIN firstten_private.class_submission_threads t ON t.id=s.thread_id WHERE t.class_id=p_class_id AND t.source_type='guest_team'AND s.audience='teacher'AND(p_assignment_id IS NULL OR t.assignment_id=p_assignment_id)AND(p_cursor IS NULL OR s.id>p_cursor)AND firstten_private.guest_publication_allowed(s.id)ORDER BY s.id LIMIT 50)v;
 IF jsonb_array_length(items)=50 THEN next_id:=(items->49->>'id')::uuid;END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_id));
END $$;
DO $$DECLARE r record;BEGIN FOR r IN SELECT p.oid::regprocedure signature,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE(n.nspname='firstten_private'AND p.proname IN('normalize_guest_learning','guest_learning_restriction','guest_learning_identity','lock_guest_learning','guest_learning_rate','guest_learning_access','guest_learning_record','guest_access_generation','guest_publication_authority','build_guest_publication','guest_publication_allowed'))OR(n.nspname='public'AND p.proname IN('list_guest_learning_activities','load_guest_learning_activity','save_guest_learning_activity','preview_guest_learning_submission','confirm_guest_learning_submission','get_guest_learning_submission','list_guest_learning_submissions','withdraw_guest_learning_submission','get_teacher_guest_learning_submission','list_teacher_guest_learning_submissions'))LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature);IF r.nspname='public'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',r.signature,CASE WHEN r.proname IN('get_teacher_guest_learning_submission','list_teacher_guest_learning_submissions')THEN 'authenticated'ELSE 'service_role'END);END IF;END LOOP;END $$;
COMMENT ON TABLE firstten_private.guest_learning_activities IS 'Genuine guest principal-private or explicitly created team-shared learning work; immutable audience; no fake auth/project owner. AI disabled. Class/session expiry ends guest access; retention/deletion not implemented by this feature.';
COMMENT ON TABLE firstten_private.guest_learning_operations IS 'Guest-only stable intent namespace, independent from account submission operations. Save receipts retain original acknowledged revision and current authorized state, never duplicate revisions.';
COMMIT;
