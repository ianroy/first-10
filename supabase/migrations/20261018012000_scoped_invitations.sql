-- SEC-005: authenticated, recipient-bound project invitations. Capability stays
-- disabled until separately verified shared resources exist. No legacy RLS changes.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE firstten_private.project_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL,
 issuer_id uuid NOT NULL, recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('editor','viewer')),
 token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[0-9a-f]{64}$'),
 expected_member_revision bigint NOT NULL CHECK(expected_member_revision BETWEEN 0 AND 9007199254740990),
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 accepted_by uuid REFERENCES auth.users(id) ON DELETE CASCADE, accepted_at timestamptz,
 accepted_member_revision bigint CHECK(accepted_member_revision BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 FOREIGN KEY(project_id,issuer_id) REFERENCES public.projects(id,user_id) ON DELETE CASCADE,
 CHECK(issuer_id<>recipient_id), CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 days'),
 CHECK((accepted_by IS NULL AND accepted_at IS NULL AND accepted_member_revision IS NULL) OR
       (accepted_by IS NOT NULL AND accepted_by=recipient_id AND accepted_at IS NOT NULL AND accepted_member_revision IS NOT NULL))
);
CREATE INDEX invitation_owner_listing ON firstten_private.project_invitations(issuer_id,project_id,id);
CREATE TABLE firstten_private.invitation_operations (
 actor_id uuid NOT NULL, project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 operation text NOT NULL CHECK(operation IN ('create','revoke')), request_id uuid NOT NULL,
 payload_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,project_id,operation,request_id)
);
CREATE TABLE firstten_private.invitation_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 invitation_id uuid NOT NULL REFERENCES firstten_private.project_invitations(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL, operation text NOT NULL CHECK(operation IN ('create','accept','revoke')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE firstten_private.project_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.invitation_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.invitation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.project_invitations,firstten_private.invitation_operations,firstten_private.invitation_audit FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE firstten_private.project_invitations IS 'Only SHA256 capability hashes are stored. No recovery of raw token; an unknown create outcome requires owner revoke/reissue. No student class or legacy private-content grant.';
CREATE FUNCTION firstten_private.invitation_projection(i firstten_private.project_invitations) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',i.id,'projectId',i.project_id,'recipientId',i.recipient_id,'role',i.role,'expiresAt',i.expires_at,'revokedAt',i.revoked_at,'acceptedAt',i.accepted_at,'createdAt',i.created_at)
$$;
REVOKE ALL ON FUNCTION firstten_private.invitation_projection(firstten_private.project_invitations) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.create_project_invitation(p_target_type text,p_project_id uuid,p_recipient_id uuid,p_role text,p_days integer DEFAULT 7,p_request_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); prior firstten_private.invitation_operations; saved firstten_private.project_invitations; secret text; hash text; result jsonb; member_revision bigint;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor) THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF p_target_type='class' AND p_role='student' THEN RETURN jsonb_build_object('ok',false,'code','FEATURE_DISABLED'); END IF;
 IF p_target_type IS DISTINCT FROM 'project' OR p_project_id IS NULL OR p_recipient_id IS NULL OR p_role IS NULL OR p_role NOT IN ('editor','viewer') OR p_days IS NULL OR p_days NOT BETWEEN 1 AND 30 OR p_request_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 -- Current owner authority is checked before any acknowledgement replay.
 PERFORM 1 FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF NOT public.project_collaboration_enabled() THEN RETURN jsonb_build_object('ok',false,'code','FEATURE_DISABLED'); END IF;
 IF EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND archived_at IS NOT NULL) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF p_recipient_id=actor THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 hash:=encode(sha256(convert_to(jsonb_build_object('recipient',p_recipient_id,'role',p_role,'days',p_days)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM firstten_private.invitation_operations WHERE actor_id=actor AND project_id=p_project_id AND operation='create' AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN jsonb_build_object('ok',true,'data',prior.result,'token',NULL,'replayed',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_recipient_id) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT revision INTO member_revision FROM public.project_members WHERE project_id=p_project_id AND user_id=p_recipient_id;
 secret:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO firstten_private.project_invitations(project_id,issuer_id,recipient_id,role,token_hash,expected_member_revision,expires_at)
 VALUES(p_project_id,actor,p_recipient_id,p_role,encode(sha256(convert_to(secret,'UTF8')),'hex'),coalesce(member_revision,0),statement_timestamp()+p_days*interval '1 day') RETURNING * INTO saved;
 result:=firstten_private.invitation_projection(saved);
 INSERT INTO firstten_private.invitation_operations(actor_id,project_id,operation,request_id,payload_hash,result) VALUES(actor,p_project_id,'create',p_request_id,hash,result);
 INSERT INTO firstten_private.invitation_audit(project_id,invitation_id,actor_id,operation) VALUES(p_project_id,saved.id,actor,'create');
 RETURN jsonb_build_object('ok',true,'data',result,'token',secret,'replayed',false);
END $$;
CREATE FUNCTION public.list_project_invitations(p_project_id uuid,p_cursor uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); items jsonb; next_cursor uuid;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor) THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND user_id=actor) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT coalesce(jsonb_agg(firstten_private.invitation_projection(i) ORDER BY i.id),'[]'::jsonb) INTO items FROM (
  SELECT * FROM firstten_private.project_invitations WHERE project_id=p_project_id AND issuer_id=actor AND (p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT 50
 ) i;
 IF jsonb_array_length(items)=50 AND EXISTS(SELECT 1 FROM firstten_private.project_invitations WHERE project_id=p_project_id AND issuer_id=actor AND id>(items->49->>'id')::uuid) THEN next_cursor:=(items->49->>'id')::uuid; END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_cursor));
END $$;
CREATE FUNCTION public.revoke_project_invitation(p_project_id uuid,p_invitation_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); saved firstten_private.project_invitations; prior firstten_private.invitation_operations; hash text; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor) THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF p_project_id IS NULL OR p_invitation_id IS NULL OR p_request_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 hash:=encode(sha256(convert_to(p_invitation_id::text,'UTF8')),'hex');
 SELECT * INTO prior FROM firstten_private.invitation_operations WHERE actor_id=actor AND project_id=p_project_id AND operation='revoke' AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN jsonb_build_object('ok',true,'data',prior.result);
 END IF;
 SELECT * INTO saved FROM firstten_private.project_invitations WHERE id=p_invitation_id AND project_id=p_project_id AND issuer_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF saved.revoked_at IS NULL THEN
  UPDATE firstten_private.project_invitations SET revoked_at=statement_timestamp() WHERE id=saved.id RETURNING * INTO saved;
  INSERT INTO firstten_private.invitation_audit(project_id,invitation_id,actor_id,operation) VALUES(p_project_id,saved.id,actor,'revoke');
 END IF;
 result:=firstten_private.invitation_projection(saved);
 INSERT INTO firstten_private.invitation_operations(actor_id,project_id,operation,request_id,payload_hash,result) VALUES(actor,p_project_id,'revoke',p_request_id,hash,result);
 RETURN jsonb_build_object('ok',true,'data',result);
END $$;

CREATE FUNCTION public.accept_project_invitation(p_target_type text,p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); invitation firstten_private.project_invitations; saved public.project_members; target_project uuid; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor) THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF p_target_type='class' THEN RETURN jsonb_build_object('ok',false,'code','FEATURE_DISABLED'); END IF;
 IF p_target_type IS DISTINCT FROM 'project' OR p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF NOT public.project_collaboration_enabled() THEN RETURN jsonb_build_object('ok',false,'code','FEATURE_DISABLED'); END IF;
 -- Resolve without revealing content, then lock in the same project->invite
 -- order as owner issue/revoke/member operations to avoid acceptance deadlocks.
 SELECT project_id INTO target_project FROM firstten_private.project_invitations WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 PERFORM 1 FROM public.projects WHERE id=target_project FOR UPDATE;
 SELECT * INTO invitation FROM firstten_private.project_invitations WHERE project_id=target_project AND token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') FOR UPDATE;
 IF NOT FOUND OR invitation.recipient_id<>actor OR invitation.revoked_at IS NOT NULL OR invitation.expires_at<=statement_timestamp()
 OR NOT EXISTS(SELECT 1 FROM public.projects p JOIN auth.users a ON a.id=p.user_id WHERE p.id=target_project AND p.user_id=invitation.issuer_id AND p.archived_at IS NULL) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT * INTO saved FROM public.project_members WHERE project_id=target_project AND user_id=actor FOR UPDATE;
 IF invitation.accepted_at IS NOT NULL THEN
  IF invitation.accepted_by<>actor OR saved.id IS NULL OR saved.state<>'active' OR saved.role<>invitation.role OR saved.revision<>invitation.accepted_member_revision THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('invitationId',invitation.id,'projectId',target_project,'role',invitation.role,'membershipRevision',saved.revision));
 END IF;
 IF coalesce(saved.revision,0)<>invitation.expected_member_revision THEN RETURN jsonb_build_object('ok',false,'code','REVISION_CONFLICT'); END IF;
 IF saved.id IS NULL THEN
  INSERT INTO public.project_members(project_id,user_id,created_by,role) VALUES(target_project,actor,invitation.issuer_id,invitation.role) RETURNING * INTO saved;
 ELSE
  UPDATE public.project_members SET role=invitation.role,state='active',revision=revision+1 WHERE id=saved.id RETURNING * INTO saved;
 END IF;
 UPDATE firstten_private.project_invitations SET accepted_by=actor,accepted_at=statement_timestamp(),accepted_member_revision=saved.revision WHERE id=invitation.id;
 INSERT INTO firstten_private.invitation_audit(project_id,invitation_id,actor_id,operation) VALUES(target_project,invitation.id,actor,'accept');
 result:=jsonb_build_object('invitationId',invitation.id,'projectId',target_project,'role',invitation.role,'membershipRevision',saved.revision);
 RETURN jsonb_build_object('ok',true,'data',result);
END $$;
REVOKE ALL ON FUNCTION public.create_project_invitation(text,uuid,uuid,text,integer,uuid),public.list_project_invitations(uuid,uuid),public.revoke_project_invitation(uuid,uuid,uuid),public.accept_project_invitation(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_project_invitation(text,uuid,uuid,text,integer,uuid),public.list_project_invitations(uuid,uuid),public.revoke_project_invitation(uuid,uuid,uuid),public.accept_project_invitation(text,text) TO authenticated;
COMMIT;
