-- CLS-001: authenticated class foundations; no guest entry, submitted content,
-- shared project membership or legacy private-table policy changes.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.classes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 120), mode text NOT NULL CHECK(mode IN ('class','hackathon')),
 instructions text NOT NULL DEFAULT '' CHECK(char_length(instructions)<=4000),
 access_expires_at timestamptz NOT NULL, retention_days integer NOT NULL DEFAULT 120 CHECK(retention_days BETWEEN 1 AND 730),
 ai_enabled boolean NOT NULL DEFAULT false CHECK(NOT ai_enabled), archived_at timestamptz,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,user_id)
);
ALTER TABLE public.classes ADD CONSTRAINT class_final_revision_inactive CHECK(revision<9007199254740991 OR archived_at IS NOT NULL);
CREATE TABLE public.class_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES auth.users(id),
 created_by uuid NOT NULL, role text NOT NULL CHECK(role IN ('student','teacher')),
 display_label text NOT NULL CHECK(char_length(display_label) BETWEEN 1 AND 80),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','left','removed')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(class_id,created_by) REFERENCES public.classes(id,user_id) ON DELETE CASCADE,
 UNIQUE(class_id,user_id),CHECK(user_id<>created_by)
);
ALTER TABLE public.class_members ADD CONSTRAINT class_member_final_revision_inactive CHECK(revision<9007199254740991 OR state<>'active');
CREATE TABLE public.assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id), last_editor_id uuid NOT NULL REFERENCES auth.users(id),
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 120), instructions text NOT NULL DEFAULT '' CHECK(char_length(instructions)<=8000),
 due_at timestamptz, state text NOT NULL CHECK(state IN ('draft','published','archived')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,class_id)
);
ALTER TABLE public.assignments ADD CONSTRAINT assignment_final_revision_inactive CHECK(revision<9007199254740991 OR state='archived');
CREATE TABLE public.class_project_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL,user_id uuid NOT NULL,project_id uuid NOT NULL,
 active boolean NOT NULL DEFAULT true,revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(class_id,user_id),FOREIGN KEY(class_id,user_id) REFERENCES public.class_members(class_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,user_id) REFERENCES public.projects(id,user_id) ON DELETE CASCADE
);
ALTER TABLE public.class_project_links ADD CONSTRAINT class_link_final_revision_inactive CHECK(revision<9007199254740991 OR NOT active);
-- Genuine non-account guest scopes. There are deliberately no sessions, secrets,
-- anonymous policies, invitation acceptance or activity content for guests yet.
CREATE TABLE public.class_teams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_id uuid NOT NULL,issued_by uuid NOT NULL,
 alias text NOT NULL CHECK(char_length(alias) BETWEEN 1 AND 80),archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,class_id),
 FOREIGN KEY(class_id,issued_by) REFERENCES public.classes(id,user_id) ON DELETE CASCADE
);
CREATE TABLE public.class_guest_principals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_id uuid NOT NULL,team_id uuid NOT NULL,issued_by uuid NOT NULL,
 alias text NOT NULL CHECK(char_length(alias) BETWEEN 1 AND 80),revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(team_id,class_id) REFERENCES public.class_teams(id,class_id) ON DELETE CASCADE,
 FOREIGN KEY(class_id,issued_by) REFERENCES public.classes(id,user_id) ON DELETE CASCADE
);
CREATE FUNCTION firstten_private.enforce_class_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.created_at) THEN RAISE EXCEPTION 'Class resource identity is immutable' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='classes' THEN
  IF NEW.user_id<>OLD.user_id THEN RAISE EXCEPTION 'Class owner is immutable' USING ERRCODE='42501'; END IF;
 ELSE
  IF NEW.class_id<>OLD.class_id THEN RAISE EXCEPTION 'Class scope is immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME IN ('class_members','assignments','class_project_links') THEN IF NEW.user_id<>OLD.user_id THEN RAISE EXCEPTION 'Class author or subject is immutable' USING ERRCODE='42501'; END IF; END IF;
  IF TG_TABLE_NAME='class_members' THEN IF NEW.created_by<>OLD.created_by THEN RAISE EXCEPTION 'Class grantor is immutable' USING ERRCODE='23514'; END IF; END IF;
  IF TG_TABLE_NAME IN ('class_teams','class_guest_principals') THEN IF NEW.issued_by<>OLD.issued_by THEN RAISE EXCEPTION 'Guest issuer is immutable' USING ERRCODE='23514'; END IF; END IF;
  IF TG_TABLE_NAME='class_guest_principals' THEN IF NEW.team_id<>OLD.team_id THEN RAISE EXCEPTION 'Guest team is immutable' USING ERRCODE='23514'; END IF; END IF;
 END IF;
 IF TG_TABLE_NAME IN ('classes','class_members','assignments','class_project_links') THEN
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Class revision must advance once' USING ERRCODE='23514'; END IF;
  NEW.updated_at:=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION firstten_private.enforce_class_identity() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['classes','class_members','assignments','class_project_links','class_teams','class_guest_principals'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',n);
  EXECUTE format('CREATE TRIGGER class_identity BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION firstten_private.enforce_class_identity()',n);
 END LOOP;
END $$;
CREATE TABLE firstten_private.class_operations (
 actor_id uuid NOT NULL,class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
 operation text NOT NULL,resource_id uuid NOT NULL,request_id uuid NOT NULL,payload_hash text NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,class_id,operation,resource_id,request_id)
);
CREATE TABLE firstten_private.class_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
 operation text NOT NULL,resource_id uuid NOT NULL,request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE firstten_private.class_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.class_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.class_operations,firstten_private.class_audit FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION firstten_private.class_role(p_class_id uuid,p_owner_recovery boolean DEFAULT false) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN c.user_id=auth.uid() AND (p_owner_recovery OR (c.archived_at IS NULL AND c.access_expires_at>clock_timestamp())) THEN 'owner'
 WHEN c.archived_at IS NULL AND c.access_expires_at>clock_timestamp() THEN (SELECT m.role FROM public.class_members m WHERE m.class_id=c.id AND m.user_id=auth.uid() AND m.state='active') END
 FROM public.classes c WHERE c.id=p_class_id AND EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())
$$;
CREATE FUNCTION firstten_private.class_projection(c public.classes,r text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT jsonb_build_object('id',c.id,'name',c.name,'mode',c.mode,'instructions',c.instructions,'accessExpiresAt',c.access_expires_at,'retentionDays',c.retention_days,'aiEnabled',c.ai_enabled,'archivedAt',c.archived_at,'revision',c.revision,'role',r,'updatedAt',c.updated_at) $$;
CREATE FUNCTION firstten_private.class_member_projection(m public.class_members) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT jsonb_build_object('id',m.id,'classId',m.class_id,'displayLabel',m.display_label,'role',m.role,'state',m.state,'revision',m.revision) $$;
CREATE FUNCTION firstten_private.assignment_projection(a public.assignments) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT jsonb_build_object('id',a.id,'classId',a.class_id,'title',a.title,'instructions',a.instructions,'dueAt',a.due_at,'state',a.state,'revision',a.revision,'updatedAt',a.updated_at) $$;
CREATE FUNCTION firstten_private.class_link_projection(l public.class_project_links) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT jsonb_build_object('id',l.id,'projectId',l.project_id,'active',l.active,'revision',l.revision) $$;
REVOKE ALL ON FUNCTION firstten_private.class_role(uuid,boolean),firstten_private.class_projection(public.classes,text),firstten_private.class_member_projection(public.class_members),firstten_private.assignment_projection(public.assignments),firstten_private.class_link_projection(public.class_project_links) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_class(p_class_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r text; c public.classes; m public.class_members; l public.class_project_links;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 r:=firstten_private.class_role(p_class_id,true);
 IF r IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT * INTO c FROM public.classes WHERE id=p_class_id;
 SELECT * INTO m FROM public.class_members WHERE class_id=p_class_id AND user_id=auth.uid();
 IF r='student' THEN SELECT * INTO l FROM public.class_project_links WHERE class_id=p_class_id AND user_id=auth.uid(); END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.class_projection(c,r)||jsonb_build_object('enrollment',CASE WHEN m.id IS NULL THEN NULL ELSE firstten_private.class_member_projection(m) END,'projectAssociation',CASE WHEN l.id IS NULL THEN NULL ELSE firstten_private.class_link_projection(l) END));
END $$;
CREATE FUNCTION public.list_my_classes(p_cursor uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE items jsonb; next_cursor uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()) THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 SELECT coalesce(jsonb_agg(firstten_private.class_projection(c,firstten_private.class_role(c.id,true)) ORDER BY c.id),'[]'::jsonb) INTO items FROM (
 SELECT * FROM public.classes WHERE (p_cursor IS NULL OR id>p_cursor) AND firstten_private.class_role(id,true) IS NOT NULL ORDER BY id LIMIT 50) c;
 IF jsonb_array_length(items)=50 AND EXISTS(SELECT 1 FROM public.classes WHERE id>(items->49->>'id')::uuid AND firstten_private.class_role(id,true) IS NOT NULL) THEN next_cursor:=(items->49->>'id')::uuid; END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_cursor));
END $$;
CREATE FUNCTION public.list_class_assignments(p_class_id uuid,p_cursor uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r text; items jsonb; next_cursor uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 r:=firstten_private.class_role(p_class_id,true);
 IF r IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT coalesce(jsonb_agg(firstten_private.assignment_projection(a) ORDER BY a.id),'[]'::jsonb) INTO items FROM (
 SELECT * FROM public.assignments WHERE class_id=p_class_id AND (r IN ('owner','teacher') OR state='published') AND (p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT 50) a;
 IF jsonb_array_length(items)=50 AND EXISTS(SELECT 1 FROM public.assignments WHERE class_id=p_class_id AND (r IN ('owner','teacher') OR state='published') AND id>(items->49->>'id')::uuid) THEN next_cursor:=(items->49->>'id')::uuid; END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_cursor));
END $$;
CREATE FUNCTION public.list_class_members(p_class_id uuid,p_cursor uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r text; items jsonb; next_cursor uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 r:=firstten_private.class_role(p_class_id,true);
 IF r IS NULL OR r NOT IN ('owner','teacher') THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT coalesce(jsonb_agg(firstten_private.class_member_projection(m) ORDER BY m.id),'[]'::jsonb) INTO items FROM (
 SELECT * FROM public.class_members WHERE class_id=p_class_id AND (p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT 50) m;
 IF jsonb_array_length(items)=50 AND EXISTS(SELECT 1 FROM public.class_members WHERE class_id=p_class_id AND id>(items->49->>'id')::uuid) THEN next_cursor:=(items->49->>'id')::uuid; END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_cursor));
END $$;

CREATE FUNCTION firstten_private.mutate_class(p_operation text,p_class_id uuid,p_resource_id uuid,p_expected_revision bigint,p_request_id uuid,p_document jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); c public.classes; m public.class_members; a public.assignments; l public.class_project_links; prior firstten_private.class_operations; r text; hash text; result jsonb; actual_revision bigint; expires timestamptz; due timestamptz; target_project uuid; flag boolean;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor) THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF p_operation IS NULL OR p_operation NOT IN ('create','update','archive','teacher','revoke_teacher','remove_student','leave','assignment','associate') OR p_class_id IS NULL OR p_resource_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>9007199254740991 OR p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR octet_length(p_document::text)>65536 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_class_id::text,15001));
 SELECT * INTO c FROM public.classes WHERE id=p_class_id FOR UPDATE;
 IF p_operation='create' THEN
  IF c.id IS NOT NULL AND c.user_id<>actor THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  IF p_expected_revision<>0 OR p_resource_id<>p_class_id THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 ELSE
  IF c.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  r:=firstten_private.class_role(p_class_id,true);
  IF p_operation IN ('update','archive','teacher','revoke_teacher','remove_student') AND r IS DISTINCT FROM 'owner' THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  IF p_operation='assignment' AND (r IS NULL OR r NOT IN ('owner','teacher') OR c.archived_at IS NOT NULL OR c.access_expires_at<=clock_timestamp()) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  IF p_operation='associate' AND r IS DISTINCT FROM 'student' THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  IF p_operation='leave' AND (p_resource_id<>actor OR NOT EXISTS(SELECT 1 FROM public.class_members WHERE class_id=p_class_id AND user_id=actor)) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 END IF;
 -- Validate each fixed operation even for an idempotent replay; no actor/role
 -- fields or generic patch/SQL path are accepted through the JSON document.
 IF p_operation IN ('create','update') THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_document))<>5 OR NOT p_document ?& ARRAY['name','mode','instructions','accessExpiresAt','retentionDays'] OR jsonb_typeof(p_document->'name')<>'string' OR char_length(btrim(p_document->>'name')) NOT BETWEEN 1 AND 120 OR jsonb_typeof(p_document->'mode')<>'string' OR p_document->>'mode' NOT IN ('class','hackathon') OR jsonb_typeof(p_document->'instructions')<>'string' OR char_length(p_document->>'instructions')>4000 OR jsonb_typeof(p_document->'retentionDays')<>'number' OR (p_document->>'retentionDays')::numeric<>trunc((p_document->>'retentionDays')::numeric) OR (p_document->>'retentionDays')::numeric NOT BETWEEN 1 AND 730 OR jsonb_typeof(p_document->'accessExpiresAt')<>'string' OR (p_document->>'accessExpiresAt') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
  expires:=(p_document->>'accessExpiresAt')::timestamptz;
  -- Replays retain original acknowledgements even after the requested expiry.
 ELSIF p_operation='archive' THEN
  IF p_resource_id<>p_class_id OR (SELECT count(*) FROM jsonb_object_keys(p_document))<>1 OR jsonb_typeof(p_document->'archived')<>'boolean' THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 ELSIF p_operation='teacher' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_document))<>2 OR jsonb_typeof(p_document->'active')<>'boolean' OR jsonb_typeof(p_document->'displayLabel')<>'string' OR char_length(btrim(p_document->>'displayLabel')) NOT BETWEEN 1 AND 80 OR p_resource_id=c.user_id THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 ELSIF p_operation IN ('leave','remove_student','revoke_teacher') THEN
  IF p_document<>'{}'::jsonb THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 ELSIF p_operation='assignment' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_document))<>4 OR NOT p_document ?& ARRAY['title','instructions','dueAt','state'] OR jsonb_typeof(p_document->'title')<>'string' OR char_length(btrim(p_document->>'title')) NOT BETWEEN 1 AND 120 OR jsonb_typeof(p_document->'instructions')<>'string' OR char_length(p_document->>'instructions')>8000 OR jsonb_typeof(p_document->'state')<>'string' OR p_document->>'state' NOT IN ('draft','published','archived') OR (p_document->'dueAt'<>'null'::jsonb AND (jsonb_typeof(p_document->'dueAt')<>'string' OR (p_document->>'dueAt') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$')) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
  due:=(p_document->>'dueAt')::timestamptz;
 ELSIF p_operation='associate' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_document))<>1 OR jsonb_typeof(p_document->'projectId')<>'string' THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
  target_project:=(p_document->>'projectId')::uuid;
  PERFORM 1 FROM public.projects WHERE id=target_project AND user_id=actor AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR c.archived_at IS NOT NULL OR c.access_expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 END IF;
 hash:=encode(sha256(convert_to(jsonb_build_object('expectedRevision',p_expected_revision,'document',p_document)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM firstten_private.class_operations WHERE actor_id=actor AND class_id=p_class_id AND operation=p_operation AND resource_id=p_resource_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN prior.result;
 END IF;
 IF p_operation IN ('create','update') THEN
  IF expires<=clock_timestamp() OR expires>clock_timestamp()+interval '730 days' THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
  IF p_operation='create' THEN
   IF c.id IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
   INSERT INTO public.classes(id,user_id,name,mode,instructions,access_expires_at,retention_days) VALUES(p_class_id,actor,btrim(p_document->>'name'),p_document->>'mode',p_document->>'instructions',expires,(p_document->>'retentionDays')::integer) RETURNING * INTO c;
  ELSE
   IF p_resource_id<>p_class_id THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
   IF c.revision<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','REVISION_CONFLICT','currentRevision',c.revision); END IF;
   IF c.revision=9007199254740991 OR (c.revision=9007199254740990 AND c.archived_at IS NULL) THEN RETURN jsonb_build_object('ok',false,'code','REVISION_EXHAUSTED'); END IF;
   UPDATE public.classes SET name=btrim(p_document->>'name'),mode=p_document->>'mode',instructions=p_document->>'instructions',access_expires_at=expires,retention_days=(p_document->>'retentionDays')::integer,revision=revision+1 WHERE id=p_class_id RETURNING * INTO c;
  END IF;
  result:=jsonb_build_object('ok',true,'data',firstten_private.class_projection(c,'owner'));
 ELSIF p_operation='archive' THEN
  IF c.revision<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','REVISION_CONFLICT','currentRevision',c.revision); END IF;
  flag:=(p_document->>'archived')::boolean;
  IF (c.archived_at IS NOT NULL)<>flag AND (c.revision=9007199254740991 OR (NOT flag AND c.revision=9007199254740990)) THEN RETURN jsonb_build_object('ok',false,'code','REVISION_EXHAUSTED'); END IF;
  IF (c.archived_at IS NOT NULL)<>flag THEN UPDATE public.classes SET archived_at=CASE WHEN flag THEN clock_timestamp() ELSE NULL END,revision=revision+1 WHERE id=p_class_id RETURNING * INTO c; END IF;
  result:=jsonb_build_object('ok',true,'data',firstten_private.class_projection(c,'owner'));
 ELSIF p_operation IN ('teacher','revoke_teacher','leave','remove_student') THEN
  IF p_operation IN ('remove_student','revoke_teacher') THEN SELECT * INTO m FROM public.class_members WHERE id=p_resource_id AND class_id=p_class_id FOR UPDATE;
  ELSE SELECT * INTO m FROM public.class_members WHERE class_id=p_class_id AND user_id=p_resource_id FOR UPDATE; END IF;
  IF p_operation='remove_student' AND (m.id IS NULL OR m.role<>'student') THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  IF p_operation='revoke_teacher' AND (m.id IS NULL OR m.role<>'teacher') THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  IF p_operation='leave' AND m.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  IF p_operation='teacher' THEN
   flag:=(p_document->>'active')::boolean;
   IF flag AND (c.archived_at IS NOT NULL OR c.access_expires_at<=clock_timestamp()) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
   IF NOT flag AND (m.id IS NULL OR m.role<>'teacher') THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
   IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_resource_id) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  END IF;
  actual_revision:=coalesce(m.revision,0);
  IF actual_revision<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','REVISION_CONFLICT','currentRevision',actual_revision); END IF;
  IF actual_revision=9007199254740991 OR (p_operation='teacher' AND flag AND actual_revision=9007199254740990) THEN RETURN jsonb_build_object('ok',false,'code','REVISION_EXHAUSTED'); END IF;
  IF m.id IS NULL THEN
   INSERT INTO public.class_members(class_id,user_id,created_by,role,display_label) VALUES(p_class_id,p_resource_id,c.user_id,'teacher',btrim(p_document->>'displayLabel')) RETURNING * INTO m;
  ELSE
   UPDATE public.class_members SET role=CASE WHEN p_operation='teacher' THEN 'teacher' ELSE role END,state=CASE WHEN p_operation='teacher' AND flag THEN 'active' WHEN p_operation='leave' THEN 'left' ELSE 'removed' END,display_label=CASE WHEN p_operation='teacher' THEN btrim(p_document->>'displayLabel') ELSE display_label END,revision=revision+1 WHERE id=m.id RETURNING * INTO m;
  END IF;
  UPDATE public.class_project_links SET active=false,revision=revision+1 WHERE class_id=p_class_id AND user_id=m.user_id AND active;
  result:=jsonb_build_object('ok',true,'data',firstten_private.class_member_projection(m));
 ELSIF p_operation='assignment' THEN
  SELECT * INTO a FROM public.assignments WHERE id=p_resource_id FOR UPDATE;
  IF a.id IS NOT NULL AND a.class_id<>p_class_id THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  actual_revision:=coalesce(a.revision,0);
  IF actual_revision<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','REVISION_CONFLICT','currentRevision',actual_revision); END IF;
  IF c.archived_at IS NOT NULL OR c.access_expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  IF actual_revision=9007199254740991 OR (actual_revision=9007199254740990 AND p_document->>'state'<>'archived') THEN RETURN jsonb_build_object('ok',false,'code','REVISION_EXHAUSTED'); END IF;
  IF a.id IS NULL THEN INSERT INTO public.assignments(id,class_id,user_id,last_editor_id,title,instructions,due_at,state) VALUES(p_resource_id,p_class_id,actor,actor,btrim(p_document->>'title'),p_document->>'instructions',due,p_document->>'state') RETURNING * INTO a;
  ELSE UPDATE public.assignments SET title=btrim(p_document->>'title'),instructions=p_document->>'instructions',due_at=due,state=p_document->>'state',last_editor_id=actor,revision=revision+1 WHERE id=a.id RETURNING * INTO a; END IF;
  result:=jsonb_build_object('ok',true,'data',firstten_private.assignment_projection(a));
 ELSIF p_operation='associate' THEN
  IF p_resource_id<>actor THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
  SELECT * INTO l FROM public.class_project_links WHERE class_id=p_class_id AND user_id=actor FOR UPDATE;
  actual_revision:=coalesce(l.revision,0);
  IF actual_revision<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','REVISION_CONFLICT','currentRevision',actual_revision); END IF;
  IF c.archived_at IS NOT NULL OR c.access_expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  IF actual_revision>=9007199254740990 THEN RETURN jsonb_build_object('ok',false,'code','REVISION_EXHAUSTED'); END IF;
  IF l.id IS NULL THEN INSERT INTO public.class_project_links(class_id,user_id,project_id) VALUES(p_class_id,actor,target_project) RETURNING * INTO l;
  ELSE UPDATE public.class_project_links SET project_id=target_project,active=true,revision=revision+1 WHERE id=l.id RETURNING * INTO l; END IF;
  result:=jsonb_build_object('ok',true,'data',firstten_private.class_link_projection(l));
 END IF;
 INSERT INTO firstten_private.class_operations(actor_id,class_id,operation,resource_id,request_id,payload_hash,result) VALUES(actor,p_class_id,p_operation,p_resource_id,p_request_id,hash,result);
 INSERT INTO firstten_private.class_audit(actor_id,class_id,operation,resource_id,request_id) VALUES(actor,p_class_id,p_operation,p_resource_id,p_request_id);
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');
END $$;
REVOKE ALL ON FUNCTION firstten_private.mutate_class(text,uuid,uuid,bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.create_class(p_class_id uuid,p_request_id uuid,p_document jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT firstten_private.mutate_class('create',p_class_id,p_class_id,0,p_request_id,p_document) $$;
CREATE FUNCTION public.update_class(p_class_id uuid,p_expected_revision bigint,p_request_id uuid,p_document jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT firstten_private.mutate_class('update',p_class_id,p_class_id,p_expected_revision,p_request_id,p_document) $$;
CREATE FUNCTION public.set_class_archived(p_class_id uuid,p_archived boolean,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT firstten_private.mutate_class('archive',p_class_id,p_class_id,p_expected_revision,p_request_id,jsonb_build_object('archived',p_archived)) $$;
CREATE FUNCTION public.set_class_teacher(p_class_id uuid,p_target_user_id uuid,p_active boolean,p_display_label text,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT firstten_private.mutate_class('teacher',p_class_id,p_target_user_id,p_expected_revision,p_request_id,jsonb_build_object('active',p_active,'displayLabel',p_display_label)) $$;
CREATE FUNCTION public.revoke_class_teacher(p_class_id uuid,p_membership_id uuid,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT firstten_private.mutate_class('revoke_teacher',p_class_id,p_membership_id,p_expected_revision,p_request_id,'{}'::jsonb) $$;
CREATE FUNCTION public.remove_class_student(p_class_id uuid,p_membership_id uuid,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT firstten_private.mutate_class('remove_student',p_class_id,p_membership_id,p_expected_revision,p_request_id,'{}'::jsonb) $$;
CREATE FUNCTION public.leave_class(p_class_id uuid,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT firstten_private.mutate_class('leave',p_class_id,auth.uid(),p_expected_revision,p_request_id,'{}'::jsonb) $$;
CREATE FUNCTION public.save_class_assignment(p_class_id uuid,p_assignment_id uuid,p_expected_revision bigint,p_request_id uuid,p_document jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT firstten_private.mutate_class('assignment',p_class_id,p_assignment_id,p_expected_revision,p_request_id,p_document) $$;
CREATE FUNCTION public.associate_class_project(p_class_id uuid,p_project_id uuid,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT firstten_private.mutate_class('associate',p_class_id,auth.uid(),p_expected_revision,p_request_id,jsonb_build_object('projectId',p_project_id)) $$;

-- Class invitations use a real class FK. They are never rows whose target UUID
-- could accidentally resolve to a project, and never mint teacher authority.
CREATE TABLE firstten_private.class_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_id uuid NOT NULL,issuer_id uuid NOT NULL,
 recipient_id uuid NOT NULL REFERENCES auth.users(id),token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[0-9a-f]{64}$'),
 expected_member_revision bigint NOT NULL CHECK(expected_member_revision BETWEEN 0 AND 9007199254740990),
 expires_at timestamptz NOT NULL,revoked_at timestamptz,accepted_by uuid REFERENCES auth.users(id),accepted_at timestamptz,accepted_member_revision bigint,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(class_id,issuer_id) REFERENCES public.classes(id,user_id) ON DELETE CASCADE,CHECK(issuer_id<>recipient_id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 days'),
 CHECK((accepted_by IS NULL AND accepted_at IS NULL AND accepted_member_revision IS NULL) OR (accepted_by IS NOT NULL AND accepted_by=recipient_id AND accepted_at IS NOT NULL AND accepted_member_revision BETWEEN 1 AND 9007199254740991))
);
CREATE TABLE firstten_private.class_invitation_operations (
 actor_id uuid NOT NULL,class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
 operation text NOT NULL CHECK(operation IN ('create','revoke')),request_id uuid NOT NULL,payload_hash text NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,class_id,operation,request_id)
);
ALTER TABLE firstten_private.class_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.class_invitation_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.class_invitations,firstten_private.class_invitation_operations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION firstten_private.class_invitation_projection(i firstten_private.class_invitations) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT jsonb_build_object('id',i.id,'classId',i.class_id,'recipientId',i.recipient_id,'role','student','expiresAt',i.expires_at,'revokedAt',i.revoked_at,'acceptedAt',i.accepted_at,'createdAt',i.created_at) $$;
REVOKE ALL ON FUNCTION firstten_private.class_invitation_projection(firstten_private.class_invitations) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.create_class_invitation(p_class_id uuid,p_recipient_id uuid,p_days integer,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); c public.classes; prior firstten_private.class_invitation_operations; saved firstten_private.class_invitations; m public.class_members; hash text; secret text; result jsonb; issued_at timestamptz;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor) THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF p_class_id IS NULL OR p_recipient_id IS NULL OR p_days IS NULL OR p_days NOT BETWEEN 1 AND 30 OR p_request_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 SELECT * INTO c FROM public.classes WHERE id=p_class_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND OR c.archived_at IS NOT NULL OR c.access_expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF p_recipient_id=actor THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 hash:=encode(sha256(convert_to(jsonb_build_object('recipient',p_recipient_id,'days',p_days)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM firstten_private.class_invitation_operations WHERE actor_id=actor AND class_id=p_class_id AND operation='create' AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN jsonb_build_object('ok',true,'data',prior.result,'token',NULL,'replayed',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_recipient_id) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT * INTO m FROM public.class_members WHERE class_id=p_class_id AND user_id=p_recipient_id;
 IF m.role='teacher' AND m.state='active' THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 IF coalesce(m.revision,0)>=9007199254740990 THEN RETURN jsonb_build_object('ok',false,'code','REVISION_EXHAUSTED'); END IF;
 issued_at:=clock_timestamp();
 IF c.access_expires_at<=issued_at THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 secret:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO firstten_private.class_invitations(class_id,issuer_id,recipient_id,token_hash,expected_member_revision,expires_at,created_at)
 VALUES(p_class_id,actor,p_recipient_id,encode(sha256(convert_to(secret,'UTF8')),'hex'),coalesce(m.revision,0),least(issued_at+p_days*interval '1 day',c.access_expires_at),issued_at) RETURNING * INTO saved;
 result:=firstten_private.class_invitation_projection(saved);
 INSERT INTO firstten_private.class_invitation_operations(actor_id,class_id,operation,request_id,payload_hash,result) VALUES(actor,p_class_id,'create',p_request_id,hash,result);
 INSERT INTO firstten_private.class_audit(actor_id,class_id,operation,resource_id,request_id) VALUES(actor,p_class_id,'invite_create',saved.id,p_request_id);
 RETURN jsonb_build_object('ok',true,'data',result,'token',secret,'replayed',false);
END $$;
CREATE FUNCTION public.list_class_invitations(p_class_id uuid,p_cursor uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE items jsonb; next_cursor uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF firstten_private.class_role(p_class_id,true) IS DISTINCT FROM 'owner' THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT coalesce(jsonb_agg(firstten_private.class_invitation_projection(i) ORDER BY i.id),'[]'::jsonb) INTO items FROM (SELECT * FROM firstten_private.class_invitations WHERE class_id=p_class_id AND (p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT 50) i;
 IF jsonb_array_length(items)=50 AND EXISTS(SELECT 1 FROM firstten_private.class_invitations WHERE class_id=p_class_id AND id>(items->49->>'id')::uuid) THEN next_cursor:=(items->49->>'id')::uuid; END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_cursor));
END $$;
CREATE FUNCTION public.revoke_class_invitation(p_class_id uuid,p_invitation_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); saved firstten_private.class_invitations; prior firstten_private.class_invitation_operations; hash text; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor) THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF p_class_id IS NULL OR p_invitation_id IS NULL OR p_request_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 PERFORM 1 FROM public.classes WHERE id=p_class_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 hash:=encode(sha256(convert_to(p_invitation_id::text,'UTF8')),'hex');
 SELECT * INTO prior FROM firstten_private.class_invitation_operations WHERE actor_id=actor AND class_id=p_class_id AND operation='revoke' AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN jsonb_build_object('ok',true,'data',prior.result);
 END IF;
 SELECT * INTO saved FROM firstten_private.class_invitations WHERE id=p_invitation_id AND class_id=p_class_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF saved.revoked_at IS NULL THEN
  UPDATE firstten_private.class_invitations SET revoked_at=clock_timestamp() WHERE id=saved.id RETURNING * INTO saved;
  INSERT INTO firstten_private.class_audit(actor_id,class_id,operation,resource_id,request_id) VALUES(actor,p_class_id,'invite_revoke',saved.id,p_request_id);
 END IF;
 result:=firstten_private.class_invitation_projection(saved);
 INSERT INTO firstten_private.class_invitation_operations(actor_id,class_id,operation,request_id,payload_hash,result) VALUES(actor,p_class_id,'revoke',p_request_id,hash,result);
 RETURN jsonb_build_object('ok',true,'data',result);
END $$;
CREATE FUNCTION public.accept_class_invitation(p_token text,p_display_label text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); invitation firstten_private.class_invitations; c public.classes; m public.class_members; class_target uuid;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor) THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_display_label IS NULL OR char_length(btrim(p_display_label)) NOT BETWEEN 1 AND 80 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 SELECT class_id INTO class_target FROM firstten_private.class_invitations WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT * INTO c FROM public.classes WHERE id=class_target FOR UPDATE;
 SELECT * INTO invitation FROM firstten_private.class_invitations WHERE class_id=class_target AND token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') FOR UPDATE;
 IF NOT FOUND OR c.id IS NULL OR c.archived_at IS NOT NULL OR c.access_expires_at<=clock_timestamp() OR invitation.recipient_id<>actor OR invitation.issuer_id<>c.user_id OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=c.user_id) OR invitation.revoked_at IS NOT NULL OR invitation.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT * INTO m FROM public.class_members WHERE class_id=class_target AND user_id=actor FOR UPDATE;
 IF invitation.accepted_at IS NOT NULL THEN
  IF invitation.accepted_by<>actor OR m.id IS NULL OR m.state<>'active' OR m.role<>'student' OR m.revision<>invitation.accepted_member_revision THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  IF m.display_label<>btrim(p_display_label) THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('invitationId',invitation.id,'classId',class_target,'role','student','membershipRevision',m.revision));
 END IF;
 IF coalesce(m.revision,0)<>invitation.expected_member_revision OR (m.role='teacher' AND m.state='active') THEN RETURN jsonb_build_object('ok',false,'code','REVISION_CONFLICT'); END IF;
 IF coalesce(m.revision,0)>=9007199254740990 THEN RETURN jsonb_build_object('ok',false,'code','REVISION_EXHAUSTED'); END IF;
 IF m.id IS NULL THEN INSERT INTO public.class_members(class_id,user_id,created_by,role,display_label) VALUES(class_target,actor,c.user_id,'student',btrim(p_display_label)) RETURNING * INTO m;
 ELSE UPDATE public.class_members SET role='student',state='active',display_label=btrim(p_display_label),revision=revision+1 WHERE id=m.id RETURNING * INTO m; END IF;
 IF invitation.expires_at<=clock_timestamp() OR c.access_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Class invitation expired during enrollment' USING ERRCODE='PCL01'; END IF;
 UPDATE firstten_private.class_invitations SET accepted_by=actor,accepted_at=clock_timestamp(),accepted_member_revision=m.revision WHERE id=invitation.id;
 INSERT INTO firstten_private.class_audit(actor_id,class_id,operation,resource_id,request_id) VALUES(actor,class_target,'invite_accept',invitation.id,invitation.id);
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('invitationId',invitation.id,'classId',class_target,'role','student','membershipRevision',m.revision));
EXCEPTION WHEN SQLSTATE 'PCL01' THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');
END $$;
-- All public entry points are fixed operations. There is no public co-teacher
-- invite or anonymous class/guest resolver. Class and project tokens are typed.
REVOKE ALL ON FUNCTION public.get_class(uuid),public.list_my_classes(uuid),public.list_class_assignments(uuid,uuid),public.list_class_members(uuid,uuid),public.create_class(uuid,uuid,jsonb),public.update_class(uuid,bigint,uuid,jsonb),public.set_class_archived(uuid,boolean,bigint,uuid),public.set_class_teacher(uuid,uuid,boolean,text,bigint,uuid),public.revoke_class_teacher(uuid,uuid,bigint,uuid),public.remove_class_student(uuid,uuid,bigint,uuid),public.leave_class(uuid,bigint,uuid),public.save_class_assignment(uuid,uuid,bigint,uuid,jsonb),public.associate_class_project(uuid,uuid,bigint,uuid),public.create_class_invitation(uuid,uuid,integer,uuid),public.list_class_invitations(uuid,uuid),public.revoke_class_invitation(uuid,uuid,uuid),public.accept_class_invitation(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class(uuid),public.list_my_classes(uuid),public.list_class_assignments(uuid,uuid),public.list_class_members(uuid,uuid),public.create_class(uuid,uuid,jsonb),public.update_class(uuid,bigint,uuid,jsonb),public.set_class_archived(uuid,boolean,bigint,uuid),public.set_class_teacher(uuid,uuid,boolean,text,bigint,uuid),public.revoke_class_teacher(uuid,uuid,bigint,uuid),public.remove_class_student(uuid,uuid,bigint,uuid),public.leave_class(uuid,bigint,uuid),public.save_class_assignment(uuid,uuid,bigint,uuid,jsonb),public.associate_class_project(uuid,uuid,bigint,uuid),public.create_class_invitation(uuid,uuid,integer,uuid),public.list_class_invitations(uuid,uuid),public.revoke_class_invitation(uuid,uuid,uuid),public.accept_class_invitation(text,text) TO authenticated;
COMMENT ON TABLE public.class_teams IS 'Schema foundation only; no guest provisioning/entry/session/content API exists until CLS-007/008.';
COMMENT ON TABLE public.class_guest_principals IS 'Real class/team principal, distinct from auth.users; no student account or fake project is created. No active guest capability is issued by CLS-001.';
COMMENT ON COLUMN public.classes.retention_days IS 'Owner-selected requested retention schedule; executable guest retention/deletion remains PRV-003. Do not advertise automatic cleanup before its verification.';
COMMIT;
