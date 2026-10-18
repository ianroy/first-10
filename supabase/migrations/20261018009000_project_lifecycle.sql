-- WS-001: recoverable owner-private project lifecycle. No content is deleted,
-- copied or moved; archive is metadata, not a new sharing/read-only permission.
-- Forward rollback: hide lifecycle controls and retain these columns/journal.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.projects
 ADD COLUMN archived_at timestamptz DEFAULT NULL,
 ADD COLUMN lifecycle_revision bigint NOT NULL DEFAULT 0
 CHECK(lifecycle_revision BETWEEN 0 AND 9007199254740991);
COMMENT ON COLUMN public.projects.archived_at IS 'Owner-controlled recoverable archive marker. Existing owner-only content policies are unchanged; this is not a read-only/security boundary.';
COMMENT ON COLUMN public.projects.lifecycle_revision IS 'Database-maintained archive/restore revision; unrelated content updates do not increment it.';

CREATE FUNCTION firstten_private.enforce_project_lifecycle() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.archived_at IS NOT NULL OR NEW.lifecycle_revision<>0 THEN
   RAISE EXCEPTION 'New projects begin active at lifecycle revision zero' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NEW.lifecycle_revision<>OLD.lifecycle_revision THEN
   RAISE EXCEPTION 'Project lifecycle revision is database maintained' USING ERRCODE='23514';
  END IF;
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
   IF OLD.lifecycle_revision>=9007199254740991 THEN
    RAISE EXCEPTION 'Project lifecycle revision exhausted' USING ERRCODE='23514';
   END IF;
   NEW.lifecycle_revision:=OLD.lifecycle_revision+1;
   IF NEW.archived_at IS NOT NULL THEN NEW.archived_at:=statement_timestamp(); END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER project_lifecycle_metadata BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION firstten_private.enforce_project_lifecycle();
REVOKE ALL ON FUNCTION firstten_private.enforce_project_lifecycle() FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE firstten_private.project_lifecycle_operations (
 actor_id uuid NOT NULL,
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 operation text NOT NULL CHECK(operation IN ('create','archive','restore')),
 request_id uuid NOT NULL,
 payload_hash text NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,project_id,operation,request_id)
);
ALTER TABLE firstten_private.project_lifecycle_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.project_lifecycle_operations FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE firstten_private.project_lifecycle_operations IS 'Private retry acknowledgements, scoped by actor/project/operation/request. Current owner authorization is checked before replay. No automatic pruning.';

CREATE FUNCTION firstten_private.project_lifecycle_projection(p public.projects) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',p.id,'name',p.name,'archivedAt',p.archived_at,'lifecycleRevision',p.lifecycle_revision,'updatedAt',p.updated_at)
$$;
REVOKE ALL ON FUNCTION firstten_private.project_lifecycle_projection(public.projects) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.create_owned_project(p_project_id uuid,p_request_id uuid,p_name text,p_description text,p_audience text,p_problem text,p_link text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); saved public.projects; prior firstten_private.project_lifecycle_operations; hash text; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=actor) THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF p_project_id IS NULL OR p_request_id IS NULL
 OR p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 200
 OR p_description IS NULL OR char_length(btrim(p_description)) NOT BETWEEN 1 AND 4000
 OR p_audience IS NULL OR char_length(btrim(p_audience)) NOT BETWEEN 1 AND 2000
 OR p_problem IS NULL OR char_length(btrim(p_problem)) NOT BETWEEN 1 AND 4000
 OR p_link IS NULL OR char_length(btrim(p_link))>2048
 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 hash:=encode(sha256(convert_to(jsonb_build_object('name',btrim(p_name),'description',btrim(p_description),'audience',btrim(p_audience),'problem',btrim(p_problem),'link',btrim(p_link))::text,'UTF8')),'hex');
 -- Serialize even when the intended project does not exist yet. Never adopt an
 -- existing project or derive its owner from a caller-supplied user id.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::text,19001));
 SELECT * INTO saved FROM public.projects p WHERE p.id=p_project_id FOR UPDATE;
 IF FOUND THEN
  IF saved.user_id<>actor THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  SELECT * INTO prior FROM firstten_private.project_lifecycle_operations j WHERE j.actor_id=actor AND j.project_id=p_project_id AND j.operation='create' AND j.request_id=p_request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
  IF prior.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN prior.result;
 END IF;
 INSERT INTO public.projects(id,user_id,name,description,audience,problem,link)
 VALUES(p_project_id,actor,btrim(p_name),btrim(p_description),btrim(p_audience),btrim(p_problem),btrim(p_link)) RETURNING * INTO saved;
 result:=jsonb_build_object('ok',true,'data',firstten_private.project_lifecycle_projection(saved));
 INSERT INTO firstten_private.project_lifecycle_operations(actor_id,project_id,operation,request_id,payload_hash,result)
 VALUES(actor,p_project_id,'create',p_request_id,hash,result);
 RETURN result;
END $$;

CREATE FUNCTION public.set_owned_project_archived(p_project_id uuid,p_archived boolean,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); saved public.projects; prior firstten_private.project_lifecycle_operations; hash text; operation_name text; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=actor) THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF p_project_id IS NULL OR p_archived IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>=9007199254740991 OR p_request_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 SELECT * INTO saved FROM public.projects p WHERE p.id=p_project_id AND p.user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 operation_name:=CASE WHEN p_archived THEN 'archive' ELSE 'restore' END;
 hash:=encode(sha256(convert_to(jsonb_build_object('expectedRevision',p_expected_revision,'archived',p_archived)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM firstten_private.project_lifecycle_operations j WHERE j.actor_id=actor AND j.project_id=p_project_id AND j.operation=operation_name AND j.request_id=p_request_id;
 IF FOUND THEN
  IF prior.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN prior.result;
 END IF;
 IF saved.lifecycle_revision<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','REVISION_CONFLICT','currentRevision',saved.lifecycle_revision); END IF;
 IF (saved.archived_at IS NOT NULL)<>p_archived THEN
  UPDATE public.projects SET archived_at=CASE WHEN p_archived THEN statement_timestamp() ELSE NULL END WHERE id=p_project_id AND user_id=actor RETURNING * INTO saved;
 END IF;
 result:=jsonb_build_object('ok',true,'data',firstten_private.project_lifecycle_projection(saved));
 INSERT INTO firstten_private.project_lifecycle_operations(actor_id,project_id,operation,request_id,payload_hash,result)
 VALUES(actor,p_project_id,operation_name,p_request_id,hash,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_owned_project(uuid,uuid,text,text,text,text,text),public.set_owned_project_archived(uuid,boolean,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_owned_project(uuid,uuid,text,text,text,text,text),public.set_owned_project_archived(uuid,boolean,bigint,uuid) TO authenticated;

-- Preserve the approved six-field projection and its disabled feature gate.
-- A collaborator gets no lifecycle mutation or legacy private-table access.
CREATE OR REPLACE FUNCTION public.get_member_project_summary(p_project_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r text; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF NOT public.project_collaboration_enabled() THEN RETURN jsonb_build_object('ok',false,'code','FEATURE_DISABLED'); END IF;
 r:=public.current_project_role(p_project_id);
 IF r IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT jsonb_build_object('id',p.id,'name',p.name,'role',r,'archivedAt',p.archived_at,'updatedAt',p.updated_at,'membershipRevision',CASE WHEN r='owner' THEN 0 ELSE (SELECT m.revision FROM public.project_members m WHERE m.project_id=p.id AND m.user_id=auth.uid() AND m.state='active') END) INTO result FROM public.projects p WHERE p.id=p_project_id;
 RETURN jsonb_build_object('ok',true,'data',result);
END $$;
COMMENT ON FUNCTION public.get_member_project_summary(uuid) IS 'Exactly six approved summary fields, including the real owner-controlled archivedAt. Granting explicitly shares the project name; no private project row is exposed.';
COMMIT;
