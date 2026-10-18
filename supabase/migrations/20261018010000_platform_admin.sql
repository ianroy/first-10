-- SEC-006: platform authority is an operator grant, never a signup/JWT field.
-- Bootstrap/revoke only through a reviewed SQL session as the migration owner:
-- SELECT firstten_private.set_platform_admin(<verified auth UUID>,true,0,<operator ticket>);
-- No initial grants; presenter demo metadata retains its existing separate scope.
CREATE TABLE firstten_private.platform_admins (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 enabled boolean NOT NULL,
 revision bigint NOT NULL CHECK (revision > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE firstten_private.admin_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid,
 subject_id uuid,
 operation text NOT NULL CHECK(operation IN ('role_granted','role_revoked','operational_snapshot','ai_usage_snapshot','funnel_snapshot')),
 outcome text NOT NULL CHECK(outcome IN ('ready','partial','unavailable')),
 request_id uuid,
 operator_reference text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((operation IN ('role_granted','role_revoked') AND actor_id IS NULL AND subject_id IS NOT NULL AND request_id IS NULL AND operator_reference IS NOT NULL AND operator_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$')
 OR (operation IN ('operational_snapshot','ai_usage_snapshot','funnel_snapshot') AND actor_id IS NOT NULL AND subject_id IS NULL AND request_id IS NOT NULL AND operator_reference IS NULL)),
 UNIQUE(actor_id,operation,request_id)
);
ALTER TABLE firstten_private.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.platform_admins,firstten_private.admin_audit FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION firstten_private.deny_admin_audit_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Admin audit is append-only' USING ERRCODE='42501'; END;
$$;
REVOKE ALL ON FUNCTION firstten_private.deny_admin_audit_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER admin_audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON firstten_private.admin_audit
FOR EACH STATEMENT EXECUTE FUNCTION firstten_private.deny_admin_audit_change();

CREATE FUNCTION firstten_private.set_platform_admin(p_user_id uuid,p_enabled boolean,p_expected_revision bigint,p_operator_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_grant firstten_private.platform_admins%ROWTYPE; next_revision bigint;
BEGIN
 IF p_user_id IS NULL OR p_enabled IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0
 OR p_operator_reference IS NULL OR p_operator_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$' THEN
  RAISE EXCEPTION 'Invalid operator request' USING ERRCODE='22023';
 END IF;
 -- Lock the subject to serialize first grant and subsequent revisions alike.
 PERFORM 1 FROM auth.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verified subject not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO current_grant FROM firstten_private.platform_admins WHERE user_id=p_user_id FOR UPDATE;
 IF coalesce(current_grant.revision,0)<>p_expected_revision THEN
  RAISE EXCEPTION 'Admin grant revision conflict' USING ERRCODE='40001';
 END IF;
 next_revision:=p_expected_revision+1;
 INSERT INTO firstten_private.platform_admins(user_id,enabled,revision)
 VALUES(p_user_id,p_enabled,next_revision)
 ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,revision=excluded.revision,updated_at=clock_timestamp();
 INSERT INTO firstten_private.admin_audit(subject_id,operation,outcome,operator_reference)
 VALUES(p_user_id,CASE WHEN p_enabled THEN 'role_granted' ELSE 'role_revoked' END,'ready',p_operator_reference);
 RETURN jsonb_build_object('userId',p_user_id,'enabled',p_enabled,'revision',next_revision);
END;
$$;
REVOKE ALL ON FUNCTION firstten_private.set_platform_admin(uuid,boolean,bigint,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.current_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM firstten_private.platform_admins WHERE user_id=auth.uid() AND enabled);
$$;
REVOKE ALL ON FUNCTION public.current_platform_admin() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.current_platform_admin() TO authenticated;

CREATE FUNCTION public.get_platform_admin_authorization() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN public.current_platform_admin() THEN jsonb_build_object('userId',auth.uid()) ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.get_platform_admin_authorization() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_admin_authorization() TO authenticated;

-- An audit receipt is issued only while the caller's current database grant is active.
-- No arbitrary context, content payload, target user, table name or query is accepted.
CREATE FUNCTION public.record_platform_admin_action(p_operation text,p_outcome text,p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); receipt uuid; previous_outcome text;
BEGIN
 -- The shared lock serializes this boundary with an operator revoking the grant.
 PERFORM 1 FROM firstten_private.platform_admins WHERE user_id=actor AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR p_operation NOT IN ('operational_snapshot','ai_usage_snapshot','funnel_snapshot')
 OR p_outcome IS NULL OR p_outcome NOT IN ('ready','partial','unavailable') OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'Invalid admin audit request' USING ERRCODE='22023';
 END IF;
 INSERT INTO firstten_private.admin_audit(actor_id,operation,outcome,request_id)
 VALUES(actor,p_operation,p_outcome,p_request_id)
 ON CONFLICT(actor_id,operation,request_id) DO NOTHING;
 SELECT id,outcome INTO receipt,previous_outcome FROM firstten_private.admin_audit
 WHERE actor_id=actor AND operation=p_operation AND request_id=p_request_id;
 IF previous_outcome<>p_outcome THEN RAISE EXCEPTION 'Admin audit request conflict' USING ERRCODE='22023'; END IF;
 RETURN receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.record_platform_admin_action(text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_platform_admin_action(text,text,uuid) TO authenticated;
