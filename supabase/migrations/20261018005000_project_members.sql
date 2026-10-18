-- SEC-004: explicit collaboration grants; legacy private-table policies stay unchanged.
-- Forward rollback: set the private capability to false and revoke RPC execution.
-- Retain grants, audit and operation journal; never delete/reassign existing workspace data.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE firstten_private.project_collaboration_capability (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false
);
INSERT INTO firstten_private.project_collaboration_capability VALUES(true,false);
ALTER TABLE firstten_private.project_collaboration_capability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.project_collaboration_capability FROM PUBLIC,anon,authenticated,service_role;

-- Timestamp is maintained by the database, including legacy owner writes.
ALTER TABLE public.projects ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE public.projects SET updated_at=created_at;
CREATE FUNCTION firstten_private.touch_project_summary() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN NEW.updated_at:=statement_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER touch_project_summary BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION firstten_private.touch_project_summary();
REVOKE ALL ON FUNCTION firstten_private.touch_project_summary() FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE public.project_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 created_by uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('editor','viewer')),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','revoked')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT project_members_project_owner_fkey FOREIGN KEY(project_id,created_by) REFERENCES public.projects(id,user_id) ON DELETE CASCADE,
 CONSTRAINT project_members_project_user_key UNIQUE(project_id,user_id),
 CONSTRAINT project_members_not_owner CHECK(user_id<>created_by)
);
CREATE INDEX project_members_active_subject ON public.project_members(user_id,project_id) WHERE state='active';
CREATE FUNCTION firstten_private.enforce_membership_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.id,NEW.project_id,NEW.user_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.project_id,OLD.user_id,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Membership identity is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Membership revision must advance once' USING ERRCODE='23514'; END IF;
 NEW.updated_at:=statement_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER membership_private_identity BEFORE UPDATE ON public.project_members FOR EACH ROW EXECUTE FUNCTION firstten_private.enforce_membership_identity();
REVOKE ALL ON FUNCTION firstten_private.enforce_membership_identity() FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_members FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT(id,project_id,user_id,role,state,revision,created_at,updated_at) ON public.project_members TO authenticated;

CREATE TABLE firstten_private.membership_operations (
 actor_id uuid NOT NULL, project_id uuid NOT NULL, target_user_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('set','revoke')), request_id uuid NOT NULL,
 payload_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,project_id,target_user_id,operation,request_id)
);
CREATE TABLE firstten_private.membership_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,project_id uuid NOT NULL,
 target_user_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN ('set','revoke')),
 request_id uuid NOT NULL,revision bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE firstten_private.membership_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.membership_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.membership_operations,firstten_private.membership_audit FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE firstten_private.membership_operations IS 'Private idempotency journal; retain at least seven days. No automatic pruning. Current authority is checked before replay.';

CREATE FUNCTION public.project_collaboration_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(auth.uid() IS NOT NULL AND (SELECT enabled FROM firstten_private.project_collaboration_capability WHERE singleton),false)
$$;
CREATE FUNCTION public.current_project_role(p_project_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p.user_id=auth.uid() THEN 'owner' ELSE
 (SELECT m.role FROM public.project_members m WHERE m.project_id=p.id AND m.user_id=auth.uid() AND m.state='active' AND public.project_collaboration_enabled()) END
 FROM public.projects p WHERE p.id=p_project_id AND EXISTS(SELECT 1 FROM auth.users a WHERE a.id=auth.uid())
$$;
CREATE POLICY project_members_safe_read ON public.project_members FOR SELECT TO authenticated
USING(public.project_collaboration_enabled() AND (
 (user_id=auth.uid() AND state='active') OR EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.user_id=auth.uid())
));

CREATE FUNCTION firstten_private.member_projection(m public.project_members) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',m.id,'projectId',m.project_id,'userId',m.user_id,'role',m.role,'state',m.state,'revision',m.revision,'createdAt',m.created_at,'updatedAt',m.updated_at)
$$;
REVOKE ALL ON FUNCTION firstten_private.member_projection(public.project_members) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_member_project_summary(p_project_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r text; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF NOT public.project_collaboration_enabled() THEN RETURN jsonb_build_object('ok',false,'code','FEATURE_DISABLED'); END IF;
 r:=public.current_project_role(p_project_id);
 IF r IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT jsonb_build_object('id',p.id,'name',p.name,'role',r,'archivedAt',NULL,'updatedAt',p.updated_at,'membershipRevision',CASE WHEN r='owner' THEN 0 ELSE (SELECT m.revision FROM public.project_members m WHERE m.project_id=p.id AND m.user_id=auth.uid() AND m.state='active') END) INTO result FROM public.projects p WHERE p.id=p_project_id;
 RETURN jsonb_build_object('ok',true,'data',result);
END $$;

CREATE FUNCTION public.list_project_members(p_project_id uuid,p_cursor uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r text; items jsonb; next_cursor uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF NOT public.project_collaboration_enabled() THEN RETURN jsonb_build_object('ok',false,'code','FEATURE_DISABLED'); END IF;
 r:=public.current_project_role(p_project_id);
 IF r IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT coalesce(jsonb_agg(firstten_private.member_projection(x) ORDER BY x.id),'[]'::jsonb) INTO items FROM (
 SELECT m.* FROM public.project_members m WHERE m.project_id=p_project_id AND (r='owner' OR (m.user_id=auth.uid() AND m.state='active')) AND (p_cursor IS NULL OR m.id>p_cursor) ORDER BY m.id LIMIT 50
 ) x;
 IF jsonb_array_length(items)=50 AND EXISTS(SELECT 1 FROM public.project_members m WHERE m.project_id=p_project_id AND (r='owner' OR (m.user_id=auth.uid() AND m.state='active')) AND m.id>(items->49->>'id')::uuid) THEN next_cursor:=(items->49->>'id')::uuid; END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_cursor));
END $$;

-- Private implementation is reachable only through fixed-operation authenticated wrappers.
CREATE FUNCTION firstten_private.mutate_project_member(p_operation text,p_project_id uuid,p_target_user_id uuid,p_role text,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); current_member public.project_members; saved public.project_members; prior firstten_private.membership_operations; hash text; result jsonb; current_revision bigint;
BEGIN
 IF actor IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF p_project_id IS NULL OR p_target_user_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>=9007199254740991 OR p_operation NOT IN ('set','revoke') OR (p_operation='set' AND (p_role IS NULL OR p_role NOT IN ('editor','viewer'))) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 IF NOT public.project_collaboration_enabled() THEN RETURN jsonb_build_object('ok',false,'code','FEATURE_DISABLED'); END IF;
 -- Project row serializes create/update/revoke and rejects cached replay after loss of authority.
 PERFORM 1 FROM public.projects p JOIN auth.users a ON a.id=p.user_id WHERE p.id=p_project_id AND p.user_id=actor FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF actor=p_target_user_id THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
 hash:=encode(sha256(convert_to(jsonb_build_object('role',p_role,'expectedRevision',p_expected_revision)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM firstten_private.membership_operations j WHERE j.actor_id=actor AND j.project_id=p_project_id AND j.target_user_id=p_target_user_id AND j.operation=p_operation AND j.request_id=p_request_id;
 IF FOUND THEN
  IF prior.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN prior.result;
 END IF;
 SELECT * INTO current_member FROM public.project_members m WHERE m.project_id=p_project_id AND m.user_id=p_target_user_id FOR UPDATE;
 current_revision:=coalesce(current_member.revision,0);
 IF p_expected_revision<>current_revision THEN RETURN jsonb_build_object('ok',false,'code','REVISION_CONFLICT','currentRevision',current_revision); END IF;
 IF p_operation='revoke' AND current_revision=0 THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=p_target_user_id) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF current_revision=0 THEN
  INSERT INTO public.project_members(project_id,user_id,created_by,role) VALUES(p_project_id,p_target_user_id,actor,p_role) RETURNING * INTO saved;
 ELSE
  UPDATE public.project_members SET role=CASE WHEN p_operation='set' THEN p_role ELSE role END,state=CASE WHEN p_operation='set' THEN 'active' ELSE 'revoked' END,revision=revision+1 WHERE id=current_member.id RETURNING * INTO saved;
 END IF;
 result:=jsonb_build_object('ok',true,'data',firstten_private.member_projection(saved));
 INSERT INTO firstten_private.membership_audit(actor_id,project_id,target_user_id,operation,request_id,revision) VALUES(actor,p_project_id,p_target_user_id,p_operation,p_request_id,saved.revision);
 INSERT INTO firstten_private.membership_operations(actor_id,project_id,target_user_id,operation,request_id,payload_hash,result) VALUES(actor,p_project_id,p_target_user_id,p_operation,p_request_id,hash,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION firstten_private.mutate_project_member(text,uuid,uuid,text,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.set_project_member(p_project_id uuid,p_target_user_id uuid,p_role text,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT firstten_private.mutate_project_member('set',p_project_id,p_target_user_id,p_role,p_expected_revision,p_request_id) $$;
CREATE FUNCTION public.revoke_project_member(p_project_id uuid,p_target_user_id uuid,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT firstten_private.mutate_project_member('revoke',p_project_id,p_target_user_id,NULL,p_expected_revision,p_request_id) $$;
REVOKE ALL ON FUNCTION public.project_collaboration_enabled(),public.current_project_role(uuid),public.get_member_project_summary(uuid),public.list_project_members(uuid,uuid),public.set_project_member(uuid,uuid,text,bigint,uuid),public.revoke_project_member(uuid,uuid,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.project_collaboration_enabled(),public.current_project_role(uuid),public.get_member_project_summary(uuid),public.list_project_members(uuid,uuid),public.set_project_member(uuid,uuid,text,bigint,uuid),public.revoke_project_member(uuid,uuid,bigint,uuid) TO authenticated;
COMMENT ON FUNCTION public.get_member_project_summary(uuid) IS 'Exactly six approved summary fields. Granting explicitly shares the project name; archivedAt is null until WS lifecycle support. No private project row is exposed.';
COMMIT;
