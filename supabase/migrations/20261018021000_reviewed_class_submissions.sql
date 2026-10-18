-- CLS-002: selected immutable submissions, never raw-source classroom access.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE firstten_private.class_submission_threads(
 id uuid PRIMARY KEY,class_id uuid NOT NULL,assignment_id uuid NOT NULL,source_type text NOT NULL CHECK(source_type IN('account_project','guest_team')),
 author_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,project_id uuid,team_id uuid,guest_principal_id uuid,
 last_version integer NOT NULL DEFAULT 0 CHECK(last_version BETWEEN 0 AND 20),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(assignment_id,class_id) REFERENCES public.assignments(id,class_id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,author_user_id) REFERENCES public.projects(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(guest_principal_id,class_id,team_id) REFERENCES public.class_guest_principals(id,class_id,team_id) ON DELETE CASCADE,
 CHECK((source_type='account_project' AND author_user_id IS NOT NULL AND project_id IS NOT NULL AND team_id IS NULL AND guest_principal_id IS NULL)
 OR(source_type='guest_team' AND author_user_id IS NULL AND project_id IS NULL AND team_id IS NOT NULL AND guest_principal_id IS NOT NULL))
);
CREATE TABLE firstten_private.class_submission_previews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),thread_id uuid NOT NULL REFERENCES firstten_private.class_submission_threads(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,specification jsonb NOT NULL CHECK(octet_length(specification::text)<=65536),
 binding_hash text NOT NULL CHECK(binding_hash~'^[a-f0-9]{64}$'),manifest jsonb NOT NULL CHECK(octet_length(manifest::text)<=40000),
 payload jsonb NOT NULL CHECK(octet_length(payload::text)<=65536),expected_version integer NOT NULL CHECK(expected_version BETWEEN 0 AND 19),
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),consumed_snapshot_id uuid,
 UNIQUE(thread_id,request_id)
);
CREATE TABLE firstten_private.class_submission_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),thread_id uuid NOT NULL REFERENCES firstten_private.class_submission_threads(id) ON DELETE CASCADE,
 version integer NOT NULL CHECK(version BETWEEN 1 AND 20),audience text NOT NULL CHECK(audience IN('teacher','team')),
 author_label text NOT NULL CHECK(char_length(author_label) BETWEEN 1 AND 80),payload jsonb NOT NULL CHECK(octet_length(payload::text)<=65536),
 manifest jsonb NOT NULL CHECK(octet_length(manifest::text)<=40000),authority jsonb NOT NULL CHECK(jsonb_typeof(authority)='object' AND octet_length(authority::text)<=4000),submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(thread_id,version)
);
ALTER TABLE firstten_private.class_submission_previews ADD CONSTRAINT consumed_submission_exists FOREIGN KEY(consumed_snapshot_id) REFERENCES firstten_private.class_submission_versions(id);
CREATE TABLE firstten_private.class_submission_grants(
 snapshot_id uuid PRIMARY KEY REFERENCES firstten_private.class_submission_versions(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'active' CHECK(state IN('active','withdrawn')),revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 withdrawn_at timestamptz,CHECK((state='withdrawn')=(withdrawn_at IS NOT NULL)),CHECK(revision<9007199254740991 OR state='withdrawn')
);
CREATE TABLE firstten_private.class_submission_operations(
 actor_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN('submit','withdraw')),request_id uuid NOT NULL,
 target_id uuid NOT NULL,payload_hash text NOT NULL,result_snapshot_id uuid NOT NULL REFERENCES firstten_private.class_submission_versions(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,operation,request_id)
);
CREATE TABLE firstten_private.class_submission_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,class_id uuid NOT NULL,thread_id uuid NOT NULL,
 snapshot_id uuid,operation text NOT NULL CHECK(operation IN('preview','submit','withdraw')),request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['class_submission_threads','class_submission_previews','class_submission_versions','class_submission_grants','class_submission_operations','class_submission_audit'] LOOP
 EXECUTE format('ALTER TABLE firstten_private.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('REVOKE ALL ON firstten_private.%I FROM PUBLIC,anon,authenticated,service_role',n);
 END LOOP;
END $$;
CREATE FUNCTION firstten_private.submission_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='class_submission_versions' THEN RAISE EXCEPTION 'Submitted content is immutable' USING ERRCODE='42501';
 ELSIF TG_TABLE_NAME='class_submission_threads' THEN
  IF (to_jsonb(NEW)-'last_version') IS DISTINCT FROM(to_jsonb(OLD)-'last_version') OR NEW.last_version<>OLD.last_version+1 THEN RAISE EXCEPTION 'Submission identity is immutable' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='class_submission_grants' THEN
  IF NEW.snapshot_id<>OLD.snapshot_id OR NEW.state<>'withdrawn' OR NEW.revision<>OLD.revision+1 OR OLD.state='withdrawn' THEN RAISE EXCEPTION 'Submission grant can only be withdrawn' USING ERRCODE='42501';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER submission_audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON firstten_private.class_submission_audit FOR EACH STATEMENT EXECUTE FUNCTION firstten_private.deny_admin_audit_change();
CREATE TRIGGER submission_version_immutable BEFORE UPDATE ON firstten_private.class_submission_versions FOR EACH ROW EXECUTE FUNCTION firstten_private.submission_identity();
CREATE TRIGGER submission_thread_identity BEFORE UPDATE ON firstten_private.class_submission_threads FOR EACH ROW EXECUTE FUNCTION firstten_private.submission_identity();
CREATE TRIGGER submission_grant_reduction BEFORE UPDATE ON firstten_private.class_submission_grants FOR EACH ROW EXECUTE FUNCTION firstten_private.submission_identity();
REVOKE ALL ON FUNCTION firstten_private.submission_identity() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION firstten_private.submission_scrub(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT regexp_replace(regexp_replace(v,'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}','[Identifier removed]','gi'),'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}','[Email removed]','gi')
$$;
CREATE FUNCTION firstten_private.submission_permission(p_project uuid,p_owner uuid,p_kind text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.processing_consents;exists_source boolean:=false;
BEGIN
 IF p_kind='project' THEN SELECT EXISTS(SELECT 1 FROM public.projects WHERE id=p_id AND id=p_project AND user_id=p_owner) INTO exists_source;
 ELSIF p_kind='contact' THEN SELECT EXISTS(SELECT 1 FROM public.contacts WHERE id=p_id AND project_id=p_project AND user_id=p_owner) INTO exists_source;
 ELSIF p_kind='interview' THEN SELECT EXISTS(SELECT 1 FROM public.interviews WHERE id=p_id AND project_id=p_project AND user_id=p_owner AND completed) INTO exists_source;
 ELSIF p_kind='learning' THEN SELECT EXISTS(SELECT 1 FROM public.learnings WHERE id=p_id AND project_id=p_project AND user_id=p_owner) INTO exists_source;
 END IF;
 IF NOT exists_source THEN RETURN NULL;END IF;
 SELECT * INTO c FROM public.processing_consents WHERE project_id=p_project AND user_id=p_owner AND target_kind=p_kind AND target_id=p_id;
 IF NOT FOUND OR c.sharing_status<>'granted' OR(p_kind='interview' AND c.note_status<>'granted') OR(p_kind='learning' AND c.evidence_invalidated)THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('kind',p_kind,'id',p_id,'revision',c.revision);
END $$;
CREATE FUNCTION firstten_private.submission_source(p_project uuid,p_owner uuid,selection jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k text:=selection->>'kind';f text:=selection->>'field';sid uuid;row_data jsonb;value_text text;permissions jsonb:='[]';permission jsonb;dep record;label text;
BEGIN
 IF jsonb_typeof(selection)<>'object' OR NOT selection?&ARRAY['kind','recordId','field'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(selection)x WHERE x NOT IN('kind','recordId','field','excerpt')) THEN RETURN NULL;END IF;
 IF jsonb_typeof(selection->'recordId')<>'string' OR jsonb_typeof(selection->'kind')<>'string' OR jsonb_typeof(selection->'field')<>'string' THEN RETURN NULL;END IF;
 sid:=(selection->>'recordId')::uuid;
 permission:=firstten_private.submission_permission(p_project,p_owner,'project',p_project);
 IF permission IS NULL THEN RETURN jsonb_build_object('denied',true);END IF;permissions:=jsonb_build_array(permission);
 IF k='project' AND f IN('name','description','audience','problem') AND sid=p_project THEN
  SELECT to_jsonb(p) INTO row_data FROM public.projects p WHERE id=sid AND user_id=p_owner FOR SHARE;
  value_text:=row_data->>f;label:='Own idea - '||f;
 ELSIF k='discovery' AND f IN('problem','solution','hypothesis','script','reflection','next_test') THEN
  SELECT to_jsonb(d) INTO row_data FROM public.discovery_workspaces d WHERE id=sid AND project_id=p_project AND user_id=p_owner FOR SHARE;
  IF f IN('problem','solution') THEN value_text:=row_data#>>ARRAY['document','frame',f];
  ELSIF f='hypothesis' THEN value_text:=(row_data#>'{document,hypothesisDraft}')::text;
  ELSIF f='script' THEN value_text:=(row_data#>'{document,scriptDraft}')::text;
  ELSIF f='reflection' THEN value_text:=(row_data#>'{document,reflection}')::text;
  ELSE value_text:=row_data#>>'{document,reflection,nextTest}';END IF;
  label:='Own discovery - '||f;
 ELSIF k='interview' AND f='answers' THEN
  SELECT to_jsonb(i) INTO row_data FROM public.interviews i WHERE id=sid AND project_id=p_project AND user_id=p_owner AND completed FOR SHARE;
  permission:=firstten_private.submission_permission(p_project,p_owner,'interview',sid);
  IF permission IS NULL THEN RETURN jsonb_build_object('denied',true);END IF;permissions:=permissions||jsonb_build_array(permission);
  IF row_data->'contact_id'<>'null'::jsonb THEN
   permission:=firstten_private.submission_permission(p_project,p_owner,'contact',(row_data->>'contact_id')::uuid);
   IF permission IS NULL THEN RETURN jsonb_build_object('denied',true);END IF;permissions:=permissions||jsonb_build_array(permission);
  END IF;
  SELECT string_agg(coalesce(a->>'q','')||E'\nObservation: '||coalesce(a->>'note','')||E'\nReported quote: '||coalesce(a->>'quote',''),E'\n\n' ORDER BY n)INTO value_text FROM jsonb_array_elements(row_data->'answers')WITH ORDINALITY x(a,n);
  label:='Interview - selected observation and reported words';
 ELSIF k='learning' AND f IN('title','body') THEN
  SELECT to_jsonb(l) INTO row_data FROM public.learnings l WHERE id=sid AND project_id=p_project AND user_id=p_owner FOR SHARE;
  permission:=firstten_private.submission_permission(p_project,p_owner,'learning',sid);
  IF permission IS NULL THEN RETURN jsonb_build_object('denied',true);END IF;permissions:=permissions||jsonb_build_array(permission);
  -- Until exact learning lineage exists, bind all current possible source choices.
  IF(SELECT count(*) FROM public.contacts WHERE project_id=p_project AND user_id=p_owner)+(SELECT count(*) FROM public.interviews WHERE project_id=p_project AND user_id=p_owner AND completed)>100 THEN RETURN NULL;END IF;
  FOR dep IN SELECT 'contact' AS kind,id FROM public.contacts WHERE project_id=p_project AND user_id=p_owner UNION ALL SELECT 'interview',id FROM public.interviews WHERE project_id=p_project AND user_id=p_owner AND completed ORDER BY kind,id LOOP
   permission:=firstten_private.submission_permission(p_project,p_owner,dep.kind,dep.id);
   IF permission IS NULL THEN RETURN jsonb_build_object('denied',true);END IF;permissions:=permissions||jsonb_build_array(permission);
  END LOOP;
  value_text:=row_data->>f;label:='Student learning - '||f;
 ELSIF k='experiment' AND f IN('hypothesis','change','result')THEN
  SELECT to_jsonb(e) INTO row_data FROM public.experiments e WHERE id=sid AND project_id=p_project AND user_id=p_owner FOR SHARE;
  value_text:=row_data->>f;label:='Student-reported experiment - '||f;
 ELSE RETURN NULL;END IF;
 IF row_data IS NULL OR value_text IS NULL OR octet_length(row_data::text)>262144 THEN RETURN NULL;END IF;
 IF selection?'excerpt' THEN
  IF jsonb_typeof(selection->'excerpt')<>'string' OR char_length(selection->>'excerpt') NOT BETWEEN 1 AND 6000 OR strpos(value_text,selection->>'excerpt')=0 THEN RETURN NULL;END IF;
  value_text:=selection->>'excerpt';
 END IF;
 IF char_length(value_text) NOT BETWEEN 1 AND 6000 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('text',value_text,'label',label,'kind',k,'id',sid,'field',f,'hash',encode(sha256(convert_to(row_data::text,'UTF8')),'hex'),'permissionRefs',permissions);
EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value THEN RETURN NULL;
END $$;
CREATE FUNCTION firstten_private.build_submission(p_project uuid,p_owner uuid,spec jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE excerpts jsonb:='[]';manifest jsonb:='[]';item jsonb;source jsonb;phrase jsonb;body text;payload jsonb;n integer:=0;f text;
BEGIN
 IF jsonb_typeof(spec->'selections')<>'array' OR jsonb_array_length(spec->'selections')NOT BETWEEN 1 AND 12 OR jsonb_typeof(spec->'redactions')<>'array' OR jsonb_array_length(spec->'redactions')>30 OR jsonb_typeof(spec->'reflection')<>'object' THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 FOR phrase IN SELECT value FROM jsonb_array_elements(spec->'redactions')LOOP
  IF jsonb_typeof(phrase)<>'string' OR char_length(phrase#>>'{}')NOT BETWEEN 1 AND 200 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 END LOOP;
 IF(SELECT count(*) FROM jsonb_object_keys(spec->'reflection'))<>5 OR NOT(spec->'reflection')?&ARRAY['title','interpretation','uncertainty','decision','nextAction']THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 payload:=jsonb_build_object('schemaVersion',1,'excerpts','[]'::jsonb);
 FOREACH f IN ARRAY ARRAY['title','interpretation','uncertainty','decision','nextAction']LOOP
  IF jsonb_typeof(spec->'reflection'->f)<>'string' OR char_length(spec->'reflection'->>f)>(CASE WHEN f='title'THEN 120 WHEN f='interpretation'THEN 3000 ELSE 2000 END)OR(f='title'AND char_length(btrim(spec->'reflection'->>f))=0)THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  body:=spec->'reflection'->>f;
  FOR phrase IN SELECT value FROM jsonb_array_elements(spec->'redactions')LOOP body:=replace(body,phrase#>>'{}','[Redacted]');END LOOP;
  payload:=payload||jsonb_build_object(f,firstten_private.submission_scrub(body));
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(spec->'selections')LOOP
  source:=firstten_private.submission_source(p_project,p_owner,item);
  IF source IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  IF source?'denied'THEN RETURN jsonb_build_object('ok',false,'code','SHARING_REQUIRED');END IF;
  body:=source->>'text';FOR phrase IN SELECT value FROM jsonb_array_elements(spec->'redactions')LOOP body:=replace(body,phrase#>>'{}','[Redacted]');END LOOP;n:=n+1;
  excerpts:=excerpts||jsonb_build_array(jsonb_build_object('key','excerpt.'||n,'label',source->>'label','text',firstten_private.submission_scrub(body),'sourceKind',source->>'kind','evidenceLabel','Owner-reported; selected and reviewed'));
  manifest:=manifest||jsonb_build_array(source-'text'-'label');
 END LOOP;
 payload:=jsonb_set(payload,'{excerpts}',excerpts);
 IF octet_length(payload::text)>40000 OR octet_length(manifest::text)>40000 OR payload::text~*'-----BEGIN [A-Z ]*PRIVATE KEY-----|(sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9._-]{16,}'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 RETURN jsonb_build_object('ok',true,'payload',payload,'manifest',manifest);
END $$;
-- Active authoring authority is separate from immutable author-copy authority.
CREATE FUNCTION firstten_private.submission_authoring(p_class uuid,p_assignment uuid,p_project uuid,p_actor uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.classes;a public.assignments;m public.class_members;l public.class_project_links;p public.projects;
BEGIN
 SELECT * INTO c FROM public.classes WHERE id=p_class FOR UPDATE;
 IF NOT FOUND OR c.archived_at IS NOT NULL OR c.access_expires_at<=clock_timestamp()THEN RETURN NULL;END IF;
 SELECT * INTO p FROM public.projects WHERE id=p_project AND user_id=p_actor FOR UPDATE;
 IF NOT FOUND OR p.archived_at IS NOT NULL THEN RETURN NULL;END IF;
 SELECT * INTO a FROM public.assignments WHERE id=p_assignment AND class_id=p_class AND state='published' FOR SHARE;
 SELECT * INTO m FROM public.class_members WHERE class_id=p_class AND user_id=p_actor AND role='student'AND state='active' FOR SHARE;
 SELECT * INTO l FROM public.class_project_links WHERE class_id=p_class AND user_id=p_actor AND project_id=p_project AND active FOR SHARE;
 IF a.id IS NULL OR m.id IS NULL OR l.id IS NULL OR c.access_expires_at<=clock_timestamp()THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('label',firstten_private.submission_scrub(m.display_label),'classRevision',c.revision,'assignmentRevision',a.revision,'membershipId',m.id,'membershipRevision',m.revision,'associationId',l.id,'associationRevision',l.revision,'accessExpiresAt',c.access_expires_at,'projectLifecycle',p.lifecycle_revision);
END $$;
CREATE FUNCTION firstten_private.submission_view(v firstten_private.class_submission_versions,include_payload boolean DEFAULT true)RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',v.id,'threadId',t.id,'classId',t.class_id,'assignmentId',t.assignment_id,'sourceType',t.source_type,'version',v.version,'audience',v.audience,'authorLabel',v.author_label,'submittedAt',v.submitted_at,'grantState',g.state,'grantRevision',g.revision,'title',v.payload->>'title')||CASE WHEN include_payload THEN jsonb_build_object('payload',v.payload)ELSE '{}'::jsonb END
 FROM firstten_private.class_submission_threads t JOIN firstten_private.class_submission_grants g ON g.snapshot_id=v.id WHERE t.id=v.thread_id
$$;
CREATE FUNCTION public.preview_class_submission(p_document jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid();cid uuid;aid uuid;pid uuid;tid uuid;rid uuid;t firstten_private.class_submission_threads;preview firstten_private.class_submission_previews;authority jsonb;built jsonb;binding text;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor)THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED');END IF;
 IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR octet_length(p_document::text)>65536 OR(SELECT count(*)FROM jsonb_object_keys(p_document))<>9 OR NOT p_document?&ARRAY['source','classId','assignmentId','threadId','requestId','audience','selections','redactions','reflection']THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 IF p_document#>>'{source,type}'='guest_team' OR p_document->>'audience'='team'THEN RETURN jsonb_build_object('ok',false,'code','FEATURE_DISABLED');END IF;
 IF p_document->>'audience'IS DISTINCT FROM'teacher' OR jsonb_typeof(p_document->'source')<>'object' OR(SELECT count(*)FROM jsonb_object_keys(p_document->'source'))<>2 OR NOT(p_document->'source')?&ARRAY['type','projectId']OR p_document#>>'{source,type}'IS DISTINCT FROM'account_project'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 cid:=(p_document->>'classId')::uuid;aid:=(p_document->>'assignmentId')::uuid;pid:=(p_document#>>'{source,projectId}')::uuid;tid:=(p_document->>'threadId')::uuid;rid:=(p_document->>'requestId')::uuid;
 IF cid IS NULL OR aid IS NULL OR pid IS NULL OR tid IS NULL OR rid IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 authority:=firstten_private.submission_authoring(cid,aid,pid,actor);IF authority IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO t FROM firstten_private.class_submission_threads WHERE id=tid FOR UPDATE;
 IF FOUND AND(t.author_user_id IS DISTINCT FROM actor OR t.project_id IS DISTINCT FROM pid OR t.class_id<>cid OR t.assignment_id<>aid OR t.source_type<>'account_project')THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF t.id IS NULL THEN
  IF(SELECT count(*)FROM firstten_private.class_submission_threads WHERE author_user_id=actor AND project_id=pid)>=50 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  INSERT INTO firstten_private.class_submission_threads(id,class_id,assignment_id,source_type,author_user_id,project_id)VALUES(tid,cid,aid,'account_project',actor,pid)RETURNING * INTO t;
 END IF;
 SELECT * INTO preview FROM firstten_private.class_submission_previews WHERE thread_id=tid AND request_id=rid;
 IF FOUND THEN
  IF preview.specification<>p_document THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
  IF preview.expires_at<=clock_timestamp()OR preview.consumed_snapshot_id IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','EXPIRED');END IF;
 ELSE
  IF t.last_version>=20 OR(SELECT count(*)FROM firstten_private.class_submission_previews WHERE thread_id=tid)>=50 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  built:=firstten_private.build_submission(pid,actor,p_document);IF built->>'ok'<>'true'THEN RETURN built;END IF;
  binding:=encode(sha256(convert_to(jsonb_build_object('authority',authority,'manifest',built->'manifest','payload',built->'payload','version',t.last_version)::text,'UTF8')),'hex');
  IF NOT EXISTS(SELECT 1 FROM public.classes WHERE id=cid AND archived_at IS NULL AND access_expires_at>clock_timestamp())THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
  INSERT INTO firstten_private.class_submission_previews(thread_id,request_id,specification,binding_hash,manifest,payload,expected_version,expires_at)
  VALUES(tid,rid,p_document,binding,built->'manifest',built->'payload',t.last_version,clock_timestamp()+interval '10 minutes')RETURNING * INTO preview;
  INSERT INTO firstten_private.class_submission_audit(actor_id,class_id,thread_id,operation,request_id)VALUES(actor,cid,tid,'preview',rid);
 END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('id',preview.id,'hash',preview.binding_hash,'threadId',tid,'expiresAt',preview.expires_at,'audience','teacher','teacherVisibleFields',jsonb_build_array('title','excerpts','interpretation','uncertainty','decision','nextAction'),'payload',preview.payload));
EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value OR check_violation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');
END $$;
CREATE FUNCTION public.confirm_class_submission(p_preview_id uuid,p_preview_hash text,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid();t firstten_private.class_submission_threads;preview firstten_private.class_submission_previews;v firstten_private.class_submission_versions;op firstten_private.class_submission_operations;authority jsonb;built jsonb;binding text;request_hash text;target uuid;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor)THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED');END IF;
 IF p_preview_id IS NULL OR p_preview_hash IS NULL OR p_preview_hash!~'^[a-f0-9]{64}$'OR p_request_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 SELECT thread_id INTO target FROM firstten_private.class_submission_previews WHERE id=p_preview_id;
 SELECT * INTO t FROM firstten_private.class_submission_threads WHERE id=target AND author_user_id=actor AND source_type='account_project';
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 authority:=firstten_private.submission_authoring(t.class_id,t.assignment_id,t.project_id,actor);IF authority IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO t FROM firstten_private.class_submission_threads WHERE id=target FOR UPDATE;
 SELECT * INTO preview FROM firstten_private.class_submission_previews WHERE id=p_preview_id AND thread_id=t.id FOR UPDATE;
 IF preview.binding_hash IS DISTINCT FROM p_preview_hash THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
 request_hash:=encode(sha256(convert_to(jsonb_build_object('preview',p_preview_id,'hash',p_preview_hash)::text,'UTF8')),'hex');
 SELECT * INTO op FROM firstten_private.class_submission_operations WHERE actor_id=actor AND operation='submit'AND request_id=p_request_id;
 IF FOUND THEN
  IF op.payload_hash<>request_hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
  SELECT * INTO v FROM firstten_private.class_submission_versions WHERE id=op.result_snapshot_id;
  RETURN jsonb_build_object('ok',true,'data',firstten_private.submission_view(v));
 END IF;
 IF preview.consumed_snapshot_id IS NOT NULL THEN
  SELECT * INTO v FROM firstten_private.class_submission_versions WHERE id=preview.consumed_snapshot_id;
  -- A new retry intent is still bound permanently to this original receipt.
  INSERT INTO firstten_private.class_submission_operations(actor_id,operation,request_id,target_id,payload_hash,result_snapshot_id)VALUES(actor,'submit',p_request_id,p_preview_id,request_hash,v.id);
  RETURN jsonb_build_object('ok',true,'data',firstten_private.submission_view(v));
 END IF;
 IF preview.expires_at<=clock_timestamp()THEN RETURN jsonb_build_object('ok',false,'code','EXPIRED');END IF;
 IF t.last_version<>preview.expected_version THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
 IF t.last_version>=20 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
 built:=firstten_private.build_submission(t.project_id,actor,preview.specification);IF built->>'ok'<>'true'THEN RETURN built;END IF;
 binding:=encode(sha256(convert_to(jsonb_build_object('authority',authority,'manifest',built->'manifest','payload',built->'payload','version',t.last_version)::text,'UTF8')),'hex');
 IF binding<>preview.binding_hash THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.classes WHERE id=t.class_id AND archived_at IS NULL AND access_expires_at>clock_timestamp())THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 INSERT INTO firstten_private.class_submission_versions(thread_id,version,audience,author_label,payload,manifest,authority)VALUES(t.id,t.last_version+1,'teacher',authority->>'label',preview.payload,preview.manifest,authority)RETURNING * INTO v;
 INSERT INTO firstten_private.class_submission_grants(snapshot_id)VALUES(v.id);
 UPDATE firstten_private.class_submission_threads SET last_version=last_version+1 WHERE id=t.id;
 UPDATE firstten_private.class_submission_previews SET consumed_snapshot_id=v.id WHERE id=preview.id;
 INSERT INTO firstten_private.class_submission_operations(actor_id,operation,request_id,target_id,payload_hash,result_snapshot_id)VALUES(actor,'submit',p_request_id,p_preview_id,request_hash,v.id);
 INSERT INTO firstten_private.class_submission_audit(actor_id,class_id,thread_id,snapshot_id,operation,request_id)VALUES(actor,t.class_id,t.id,v.id,'submit',p_request_id);
 RETURN jsonb_build_object('ok',true,'data',firstten_private.submission_view(v));
END $$;
-- Recipient authority checks only scope/status/permission metadata, never raw source text.
CREATE FUNCTION firstten_private.teacher_submission_allowed(p_snapshot uuid)RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t firstten_private.class_submission_threads;v firstten_private.class_submission_versions;source jsonb;permission jsonb;exists_source boolean;
BEGIN
 SELECT * INTO v FROM firstten_private.class_submission_versions WHERE id=p_snapshot AND audience='teacher';
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM firstten_private.class_submission_grants WHERE snapshot_id=v.id AND state='active')THEN RETURN false;END IF;
 SELECT * INTO t FROM firstten_private.class_submission_threads WHERE id=v.thread_id;
 IF t.source_type<>'account_project' OR firstten_private.class_role(t.class_id,false)NOT IN('owner','teacher') OR firstten_private.class_role(t.class_id,false)IS NULL THEN RETURN false;END IF;
 -- Exact issuance generations prevent close/reopen, extension, rejoin or
 -- re-association from silently reviving a prior disclosure. Changed scope
 -- requires another deliberate preview/confirmation; author copies persist.
 IF NOT EXISTS(SELECT 1 FROM public.classes WHERE id=t.class_id AND revision=(v.authority->>'classRevision')::bigint AND access_expires_at=(v.authority->>'accessExpiresAt')::timestamptz AND access_expires_at>clock_timestamp() AND archived_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.assignments WHERE id=t.assignment_id AND class_id=t.class_id AND state='published' AND revision=(v.authority->>'assignmentRevision')::bigint)
 OR NOT EXISTS(SELECT 1 FROM public.class_members WHERE id=(v.authority->>'membershipId')::uuid AND class_id=t.class_id AND user_id=t.author_user_id AND role='student'AND state='active' AND revision=(v.authority->>'membershipRevision')::bigint)
 OR NOT EXISTS(SELECT 1 FROM public.class_project_links WHERE id=(v.authority->>'associationId')::uuid AND class_id=t.class_id AND user_id=t.author_user_id AND project_id=t.project_id AND active AND revision=(v.authority->>'associationRevision')::bigint)THEN RETURN false;END IF;
 FOR source IN SELECT value FROM jsonb_array_elements(v.manifest)LOOP
  IF source->>'kind'='experiment'THEN SELECT EXISTS(SELECT 1 FROM public.experiments WHERE id=(source->>'id')::uuid AND project_id=t.project_id AND user_id=t.author_user_id)INTO exists_source;
  ELSIF source->>'kind'='discovery'THEN SELECT EXISTS(SELECT 1 FROM public.discovery_workspaces WHERE id=(source->>'id')::uuid AND project_id=t.project_id AND user_id=t.author_user_id)INTO exists_source;
  ELSE exists_source:=true;END IF;
  IF NOT exists_source THEN RETURN false;END IF;
  FOR permission IN SELECT value FROM jsonb_array_elements(source->'permissionRefs')LOOP
   IF firstten_private.submission_permission(t.project_id,t.author_user_id,permission->>'kind',(permission->>'id')::uuid) IS DISTINCT FROM permission THEN RETURN false;END IF;
  END LOOP;
 END LOOP;RETURN true;
END $$;
CREATE FUNCTION public.get_own_class_submission(p_snapshot_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v firstten_private.class_submission_versions;
BEGIN
 IF auth.uid()IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED');END IF;
 SELECT s.* INTO v FROM firstten_private.class_submission_versions s JOIN firstten_private.class_submission_threads t ON t.id=s.thread_id WHERE s.id=p_snapshot_id AND t.author_user_id=auth.uid()AND t.source_type='account_project'AND EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid());
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;RETURN jsonb_build_object('ok',true,'data',firstten_private.submission_view(v));
END $$;
CREATE FUNCTION public.get_teacher_class_submission(p_class_id uuid,p_snapshot_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v firstten_private.class_submission_versions;
BEGIN
 IF auth.uid()IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED');END IF;
 SELECT s.* INTO v FROM firstten_private.class_submission_versions s JOIN firstten_private.class_submission_threads t ON t.id=s.thread_id WHERE s.id=p_snapshot_id AND t.class_id=p_class_id;
 IF NOT FOUND OR NOT firstten_private.teacher_submission_allowed(v.id)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;RETURN jsonb_build_object('ok',true,'data',firstten_private.submission_view(v));
END $$;
CREATE FUNCTION public.list_own_class_submissions(p_class_id uuid DEFAULT NULL,p_cursor uuid DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE items jsonb;next_id uuid;
BEGIN
 IF auth.uid()IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED');END IF;
 SELECT coalesce(jsonb_agg(firstten_private.submission_view(v,false)ORDER BY v.id),'[]')INTO items FROM(SELECT s.* FROM firstten_private.class_submission_versions s JOIN firstten_private.class_submission_threads t ON t.id=s.thread_id WHERE t.author_user_id=auth.uid()AND t.source_type='account_project'AND(p_class_id IS NULL OR t.class_id=p_class_id)AND(p_cursor IS NULL OR s.id>p_cursor)ORDER BY s.id LIMIT 50)v;
 IF jsonb_array_length(items)=50 THEN next_id:=(items->49->>'id')::uuid;END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_id));
END $$;
CREATE FUNCTION public.list_teacher_class_submissions(p_class_id uuid,p_assignment_id uuid DEFAULT NULL,p_cursor uuid DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE items jsonb;next_id uuid;r text;
BEGIN
 IF auth.uid()IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED');END IF;r:=firstten_private.class_role(p_class_id,false);
 IF r IS NULL OR r NOT IN('owner','teacher')THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT coalesce(jsonb_agg(firstten_private.submission_view(v,false)ORDER BY v.id),'[]')INTO items FROM(SELECT s.* FROM firstten_private.class_submission_versions s JOIN firstten_private.class_submission_threads t ON t.id=s.thread_id WHERE t.class_id=p_class_id AND(p_assignment_id IS NULL OR t.assignment_id=p_assignment_id)AND(p_cursor IS NULL OR s.id>p_cursor)AND firstten_private.teacher_submission_allowed(s.id)ORDER BY s.id LIMIT 50)v;
 IF jsonb_array_length(items)=50 THEN next_id:=(items->49->>'id')::uuid;END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_id));
END $$;
CREATE FUNCTION public.withdraw_class_submission(p_snapshot_id uuid,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid();t firstten_private.class_submission_threads;v firstten_private.class_submission_versions;g firstten_private.class_submission_grants;op firstten_private.class_submission_operations;hash text;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor)THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED');END IF;
 IF p_snapshot_id IS NULL OR p_request_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 SELECT s.* INTO v FROM firstten_private.class_submission_versions s JOIN firstten_private.class_submission_threads th ON th.id=s.thread_id WHERE s.id=p_snapshot_id AND th.author_user_id=actor AND th.source_type='account_project';
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO t FROM firstten_private.class_submission_threads WHERE id=v.thread_id;
 SELECT * INTO g FROM firstten_private.class_submission_grants WHERE snapshot_id=v.id FOR UPDATE;
 hash:=encode(sha256(convert_to(p_snapshot_id::text,'UTF8')),'hex');
 SELECT * INTO op FROM firstten_private.class_submission_operations WHERE actor_id=actor AND operation='withdraw'AND request_id=p_request_id;
 IF FOUND AND op.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
 IF g.state='active'THEN
  UPDATE firstten_private.class_submission_grants SET state='withdrawn',revision=revision+1,withdrawn_at=clock_timestamp()WHERE snapshot_id=v.id;
  INSERT INTO firstten_private.class_submission_audit(actor_id,class_id,thread_id,snapshot_id,operation,request_id)VALUES(actor,t.class_id,t.id,v.id,'withdraw',p_request_id);
 END IF;
 IF op.request_id IS NULL THEN INSERT INTO firstten_private.class_submission_operations(actor_id,operation,request_id,target_id,payload_hash,result_snapshot_id)VALUES(actor,'withdraw',p_request_id,v.id,hash,v.id);END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.submission_view(v,false));
END $$;
REVOKE ALL ON FUNCTION firstten_private.submission_scrub(text),firstten_private.submission_permission(uuid,uuid,text,uuid),firstten_private.submission_source(uuid,uuid,jsonb),firstten_private.build_submission(uuid,uuid,jsonb),firstten_private.submission_authoring(uuid,uuid,uuid,uuid),firstten_private.submission_view(firstten_private.class_submission_versions,boolean),firstten_private.teacher_submission_allowed(uuid)FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.preview_class_submission(jsonb),public.confirm_class_submission(uuid,text,uuid),public.get_own_class_submission(uuid),public.get_teacher_class_submission(uuid,uuid),public.list_own_class_submissions(uuid,uuid),public.list_teacher_class_submissions(uuid,uuid,uuid),public.withdraw_class_submission(uuid,uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preview_class_submission(jsonb),public.confirm_class_submission(uuid,text,uuid),public.get_own_class_submission(uuid),public.get_teacher_class_submission(uuid,uuid),public.list_own_class_submissions(uuid,uuid),public.list_teacher_class_submissions(uuid,uuid,uuid),public.withdraw_class_submission(uuid,uuid)TO authenticated;
COMMENT ON TABLE firstten_private.class_submission_threads IS 'Discriminated real account_project/guest_team source. Guest adapter is disabled until CLS008 actual activities; no fake auth or project identity.';
COMMENT ON TABLE firstten_private.class_submission_versions IS 'Immutable selected/redacted owner-reported snapshots only. Teacher reads never return raw source IDs or private source bodies. Own author copies survive class exit/expiry; source deletion cascades.';
COMMIT;
