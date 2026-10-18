-- AI-004: disabled-by-default, service-only atomic paid-request accounting.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE firstten_private.ai_usage_global_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 global_stop boolean NOT NULL DEFAULT true,
 general_enabled boolean NOT NULL DEFAULT false,
 general_cap_micro bigint NOT NULL DEFAULT 24000000 CHECK(general_cap_micro BETWEEN 0 AND 24000000),
 -- Includes all pre-ledger GENERAL spend/uncertainty; the entire separate $1 demo cap is already carved out.
 opening_hold_micro bigint CHECK(opening_hold_micro BETWEEN 0 AND 24000000),
 opening_reviewed_at timestamptz,
 operator_reference text NOT NULL DEFAULT 'migration-disabled' CHECK(operator_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$'),
 max_inflight integer NOT NULL DEFAULT 2 CHECK(max_inflight BETWEEN 1 AND 20),
 starts_per_minute integer NOT NULL DEFAULT 10 CHECK(starts_per_minute BETWEEN 1 AND 100),
 CHECK(NOT general_enabled OR (opening_hold_micro IS NOT NULL AND opening_reviewed_at IS NOT NULL AND opening_hold_micro<=general_cap_micro))
);
INSERT INTO firstten_private.ai_usage_global_policy(singleton) VALUES(true);
CREATE FUNCTION firstten_private.valid_ai_eval_hashes(hashes text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT hashes IS NOT NULL AND array_ndims(hashes)=1 AND array_lower(hashes,1)=1 AND cardinality(hashes) BETWEEN 1 AND 32
 AND array_position(hashes,NULL) IS NULL AND array_to_string(hashes,',') ~ '^[a-f0-9]{64}(,[a-f0-9]{64}){0,31}$';
$$;
REVOKE ALL ON FUNCTION firstten_private.valid_ai_eval_hashes(text[]) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE firstten_private.ai_usage_route_policies (
 kind text NOT NULL CHECK(kind IN ('questions','synthesis','stage2','stage3')),
 version integer NOT NULL CHECK(version BETWEEN 1 AND 2147483647),
 enabled boolean NOT NULL DEFAULT false,
 model text NOT NULL CHECK(model IN ('anthropic/claude-sonnet-4.5','google/gemini-2.5-flash-lite','google/gemini-3.1-flash-lite','openai/gpt-5-mini')),
 provider_slug text NOT NULL CHECK(provider_slug ~ '^[a-z0-9][a-z0-9/_-]{0,79}$'),
 response_providers text[] NOT NULL CHECK(cardinality(response_providers) BETWEEN 1 AND 4 AND array_ndims(response_providers)=1 AND array_lower(response_providers,1)=1 AND array_position(response_providers,NULL) IS NULL AND NOT(''=ANY(response_providers))),
 -- Reserve the ENTIRE reviewed endpoint input/context ceiling, not an estimated prompt token count.
 input_token_ceiling integer NOT NULL CHECK(input_token_ceiling BETWEEN 1 AND 2000000),
 output_token_ceiling integer NOT NULL CHECK(output_token_ceiling BETWEEN 1 AND 100000),
 input_byte_ceiling integer NOT NULL CHECK(input_byte_ceiling BETWEEN 1 AND 200000),
 prompt_micro_per_million bigint NOT NULL CHECK(prompt_micro_per_million BETWEEN 1 AND 100000000),
 completion_micro_per_million bigint NOT NULL CHECK(completion_micro_per_million BETWEEN 1 AND 100000000),
 -- Reviews must establish the TOTAL billable output bound (including reasoning) for this endpoint.
 bounds_review_sha256 text NOT NULL CHECK(bounds_review_sha256 ~ '^[a-f0-9]{64}$'),
 quality_review_sha256 text NOT NULL CHECK(quality_review_sha256 ~ '^[a-f0-9]{64}$'),
 checked_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 operator_reference text NOT NULL CHECK(operator_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$'),
 purpose text NOT NULL DEFAULT 'product' CHECK(purpose IN ('product','eval_only')),
 eval_user_id uuid,
 eval_project_id uuid,
 eval_context_sha256 text[],
 PRIMARY KEY(kind,version),
 CHECK((purpose='product' AND eval_user_id IS NULL AND eval_project_id IS NULL AND eval_context_sha256 IS NULL)
 OR (purpose='eval_only' AND eval_user_id IS NOT NULL AND eval_project_id IS NOT NULL AND firstten_private.valid_ai_eval_hashes(eval_context_sha256))),
 CHECK(expires_at>checked_at AND expires_at<=checked_at+interval '24 hours')
);
CREATE UNIQUE INDEX ai_usage_one_enabled_route ON firstten_private.ai_usage_route_policies(kind) WHERE enabled;
CREATE TABLE firstten_private.ai_usage_user_limits (
 user_id uuid PRIMARY KEY,
 lifetime_micro bigint NOT NULL CHECK(lifetime_micro BETWEEN 0 AND 24000000),
 daily_micro bigint NOT NULL CHECK(daily_micro BETWEEN 0 AND 24000000),
 max_inflight integer NOT NULL CHECK(max_inflight BETWEEN 1 AND 20),
 starts_per_minute integer NOT NULL CHECK(starts_per_minute BETWEEN 1 AND 100),
 operator_reference text NOT NULL CHECK(operator_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$')
);
CREATE TABLE firstten_private.ai_usage_project_limits (
 project_id uuid PRIMARY KEY,
 user_id uuid NOT NULL,
 lifetime_micro bigint NOT NULL CHECK(lifetime_micro BETWEEN 0 AND 24000000),
 daily_micro bigint NOT NULL CHECK(daily_micro BETWEEN 0 AND 24000000),
 max_inflight integer NOT NULL CHECK(max_inflight BETWEEN 1 AND 20),
 starts_per_minute integer NOT NULL CHECK(starts_per_minute BETWEEN 1 AND 100),
 operator_reference text NOT NULL CHECK(operator_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$')
);
CREATE TABLE firstten_private.ai_usage_operations (
 operation_id uuid PRIMARY KEY,
 user_id uuid NOT NULL,
 project_id uuid NOT NULL,
 kind text NOT NULL,
 context_sha256 text NOT NULL CHECK(context_sha256 ~ '^[a-f0-9]{64}$'),
 input_bytes integer NOT NULL CHECK(input_bytes>0),
 route jsonb NOT NULL,
 reserved_micro bigint NOT NULL CHECK(reserved_micro>0),
 charge_micro bigint NOT NULL CHECK(charge_micro BETWEEN 0 AND 1000000000000),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','in_flight','unknown','closed_unknown','settled','cancelled')),
 attempt_id uuid UNIQUE,
 generation_id text UNIQUE CHECK(generation_id ~ '^gen-[0-9A-Za-z-]{1,123}$'),
 settlement jsonb,
 result_allowed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((state IN ('reserved','cancelled') AND attempt_id IS NULL) OR (state NOT IN ('reserved','cancelled') AND attempt_id IS NOT NULL)),
 CHECK((state='settled')=(settlement IS NOT NULL)),
 CHECK(NOT result_allowed OR state='settled'),
 CHECK((state='cancelled' AND charge_micro=0) OR state='settled' OR charge_micro=reserved_micro)
);
CREATE INDEX ai_usage_operations_actor ON firstten_private.ai_usage_operations(user_id,created_at);
CREATE INDEX ai_usage_operations_project ON firstten_private.ai_usage_operations(project_id,created_at);
-- No cascading foreign keys: deleting a user/project must not erase charges or free global allowance.
CREATE TABLE firstten_private.ai_usage_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 operation_id uuid,
 action text NOT NULL CHECK(action IN ('policy_changed','reserved','claimed','unknown','cancelled','settled','closed_unknown')),
 subject text NOT NULL CHECK(subject ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'),
 operator_reference text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE firstten_private.ai_usage_global_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.ai_usage_route_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.ai_usage_user_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.ai_usage_project_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.ai_usage_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.ai_usage_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.ai_usage_global_policy,firstten_private.ai_usage_route_policies,firstten_private.ai_usage_user_limits,firstten_private.ai_usage_project_limits,firstten_private.ai_usage_operations,firstten_private.ai_usage_audit FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE firstten_private.ai_usage_audit_id_seq FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ai_usage_audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON firstten_private.ai_usage_audit FOR EACH STATEMENT EXECUTE FUNCTION firstten_private.deny_admin_audit_change();

CREATE FUNCTION firstten_private.audit_ai_policy() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 -- Lock the same singleton before every operator policy mutation; serialize with reserve/claim/settle.
 PERFORM 1 FROM firstten_private.ai_usage_global_policy WHERE singleton FOR UPDATE;
 INSERT INTO firstten_private.ai_usage_audit(action,subject,operator_reference)
 VALUES('policy_changed',TG_TABLE_NAME,NEW.operator_reference);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION firstten_private.audit_ai_policy() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ai_global_policy_audit BEFORE UPDATE ON firstten_private.ai_usage_global_policy FOR EACH ROW EXECUTE FUNCTION firstten_private.audit_ai_policy();
CREATE TRIGGER ai_route_policy_audit BEFORE INSERT OR UPDATE ON firstten_private.ai_usage_route_policies FOR EACH ROW EXECUTE FUNCTION firstten_private.audit_ai_policy();
CREATE TRIGGER ai_user_policy_audit BEFORE INSERT OR UPDATE ON firstten_private.ai_usage_user_limits FOR EACH ROW EXECUTE FUNCTION firstten_private.audit_ai_policy();
CREATE TRIGGER ai_project_policy_audit BEFORE INSERT OR UPDATE ON firstten_private.ai_usage_project_limits FOR EACH ROW EXECUTE FUNCTION firstten_private.audit_ai_policy();

CREATE FUNCTION firstten_private.ai_usage_receipt(o firstten_private.ai_usage_operations) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('operationId',o.operation_id,'state',o.state,'reservedMicro',o.reserved_micro,'chargeMicro',o.charge_micro,'resultAllowed',o.result_allowed,'route',o.route);
$$;
REVOKE ALL ON FUNCTION firstten_private.ai_usage_receipt(firstten_private.ai_usage_operations) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.reserve_ai_usage(p_user_id uuid,p_project_id uuid,p_kind text,p_operation_id uuid,p_context_sha256 text,p_input_bytes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g firstten_private.ai_usage_global_policy%ROWTYPE; r firstten_private.ai_usage_route_policies%ROWTYPE;
 u firstten_private.ai_usage_user_limits%ROWTYPE; p firstten_private.ai_usage_project_limits%ROWTYPE;
 o firstten_private.ai_usage_operations%ROWTYPE; amount bigint; total bigint; day_start timestamptz:=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
 SELECT * INTO STRICT g FROM firstten_private.ai_usage_global_policy WHERE singleton FOR UPDATE;
 IF p_user_id IS NULL OR p_project_id IS NULL OR p_operation_id IS NULL OR p_kind IS NULL OR p_context_sha256 IS NULL OR p_context_sha256 !~ '^[a-f0-9]{64}$' OR p_input_bytes IS NULL OR p_input_bytes<1 THEN RAISE EXCEPTION 'Invalid reservation' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM auth.users WHERE id=p_user_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id AND user_id=p_user_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM firstten_private.ai_usage_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF o.user_id<>p_user_id OR o.project_id<>p_project_id OR o.kind<>p_kind OR o.context_sha256<>p_context_sha256 OR o.input_bytes<>p_input_bytes THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023'; END IF;
  RETURN firstten_private.ai_usage_receipt(o);
 END IF;
 IF g.global_stop OR NOT g.general_enabled OR g.opening_hold_micro IS NULL OR g.opening_reviewed_at IS NULL THEN RAISE EXCEPTION 'Budget disabled' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM firstten_private.ai_usage_route_policies WHERE kind=p_kind AND enabled AND checked_at<=clock_timestamp() AND expires_at>clock_timestamp();
 IF NOT FOUND OR p_input_bytes>r.input_byte_ceiling THEN RAISE EXCEPTION 'Route unavailable' USING ERRCODE='42501'; END IF;
 IF r.purpose='eval_only' AND (r.eval_user_id<>p_user_id OR r.eval_project_id<>p_project_id OR NOT(p_context_sha256=ANY(r.eval_context_sha256))
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND raw_app_meta_data @> '{"synthetic":true}'::jsonb)) THEN RAISE EXCEPTION 'Evaluation scope denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO u FROM firstten_private.ai_usage_user_limits WHERE user_id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'User allowance unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM firstten_private.ai_usage_project_limits WHERE project_id=p_project_id AND user_id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project allowance unavailable' USING ERRCODE='42501'; END IF;
 amount:=ceil((r.input_token_ceiling::numeric*r.prompt_micro_per_million+r.output_token_ceiling::numeric*r.completion_micro_per_million)/1000000)::bigint;
 SELECT coalesce(sum(charge_micro),0) INTO total FROM firstten_private.ai_usage_operations;
 IF total+g.opening_hold_micro+amount>g.general_cap_micro THEN RAISE EXCEPTION 'Global allowance exhausted' USING ERRCODE='54000'; END IF;
 IF (SELECT coalesce(sum(charge_micro),0)+amount>u.lifetime_micro OR coalesce(sum(charge_micro) FILTER(WHERE created_at>=day_start),0)+amount>u.daily_micro FROM firstten_private.ai_usage_operations WHERE user_id=p_user_id)
 OR (SELECT coalesce(sum(charge_micro),0)+amount>p.lifetime_micro OR coalesce(sum(charge_micro) FILTER(WHERE created_at>=day_start),0)+amount>p.daily_micro FROM firstten_private.ai_usage_operations WHERE project_id=p_project_id) THEN RAISE EXCEPTION 'Scoped allowance exhausted' USING ERRCODE='54000'; END IF;
 IF (SELECT count(*)>=g.max_inflight FROM firstten_private.ai_usage_operations WHERE state IN ('reserved','in_flight','unknown'))
 OR (SELECT count(*)>=u.max_inflight FROM firstten_private.ai_usage_operations WHERE user_id=p_user_id AND state IN ('reserved','in_flight','unknown'))
 OR (SELECT count(*)>=p.max_inflight FROM firstten_private.ai_usage_operations WHERE project_id=p_project_id AND state IN ('reserved','in_flight','unknown')) THEN RAISE EXCEPTION 'Concurrency exhausted' USING ERRCODE='54000'; END IF;
 IF (SELECT count(*)>=g.starts_per_minute FROM firstten_private.ai_usage_operations WHERE created_at>clock_timestamp()-interval '1 minute')
 OR (SELECT count(*)>=u.starts_per_minute FROM firstten_private.ai_usage_operations WHERE user_id=p_user_id AND created_at>clock_timestamp()-interval '1 minute')
 OR (SELECT count(*)>=p.starts_per_minute FROM firstten_private.ai_usage_operations WHERE project_id=p_project_id AND created_at>clock_timestamp()-interval '1 minute') THEN RAISE EXCEPTION 'Rate exhausted' USING ERRCODE='54000'; END IF;
 INSERT INTO firstten_private.ai_usage_operations(operation_id,user_id,project_id,kind,context_sha256,input_bytes,route,reserved_micro,charge_micro)
 VALUES(p_operation_id,p_user_id,p_project_id,p_kind,p_context_sha256,p_input_bytes,to_jsonb(r),amount,amount) RETURNING * INTO o;
 INSERT INTO firstten_private.ai_usage_audit(operation_id,action,subject) VALUES(p_operation_id,'reserved',p_kind);
 RETURN firstten_private.ai_usage_receipt(o);
END $$;
REVOKE ALL ON FUNCTION public.reserve_ai_usage(uuid,uuid,text,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(uuid,uuid,text,uuid,text,integer) TO service_role;

CREATE FUNCTION public.claim_ai_usage(p_operation_id uuid,p_attempt_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g firstten_private.ai_usage_global_policy%ROWTYPE; o firstten_private.ai_usage_operations%ROWTYPE; r firstten_private.ai_usage_route_policies%ROWTYPE;
 u firstten_private.ai_usage_user_limits%ROWTYPE; p firstten_private.ai_usage_project_limits%ROWTYPE;
 day_start timestamptz:=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
 SELECT * INTO STRICT g FROM firstten_private.ai_usage_global_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT o FROM firstten_private.ai_usage_operations WHERE operation_id=p_operation_id FOR UPDATE;
 IF p_attempt_id IS NULL THEN RAISE EXCEPTION 'Invalid attempt' USING ERRCODE='22023'; END IF;
 IF o.state<>'reserved' THEN RETURN firstten_private.ai_usage_receipt(o)||jsonb_build_object('dispatch',false); END IF;
 IF g.global_stop OR NOT g.general_enabled THEN RAISE EXCEPTION 'Budget disabled' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM auth.users WHERE id=o.user_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.projects WHERE id=o.project_id AND user_id=o.user_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM firstten_private.ai_usage_route_policies WHERE kind=o.kind AND version=(o.route->>'version')::integer AND enabled AND checked_at<=clock_timestamp() AND expires_at>clock_timestamp();
 IF NOT FOUND OR to_jsonb(r)<>o.route THEN RAISE EXCEPTION 'Route changed' USING ERRCODE='42501'; END IF;
 IF r.purpose='eval_only' AND (r.eval_user_id<>o.user_id OR r.eval_project_id<>o.project_id OR NOT(o.context_sha256=ANY(r.eval_context_sha256))
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=o.user_id AND raw_app_meta_data @> '{"synthetic":true}'::jsonb)) THEN RAISE EXCEPTION 'Evaluation scope denied' USING ERRCODE='42501'; END IF;
 -- Reservation is not lasting authorization: operator revocation/reduction wins before dispatch.
 SELECT * INTO u FROM firstten_private.ai_usage_user_limits WHERE user_id=o.user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'User allowance unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM firstten_private.ai_usage_project_limits WHERE project_id=o.project_id AND user_id=o.user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project allowance unavailable' USING ERRCODE='42501'; END IF;
 IF g.opening_hold_micro IS NULL OR g.opening_reviewed_at IS NULL
 OR (SELECT coalesce(sum(charge_micro),0)+g.opening_hold_micro>g.general_cap_micro FROM firstten_private.ai_usage_operations)
 OR (SELECT coalesce(sum(charge_micro),0)>u.lifetime_micro OR coalesce(sum(charge_micro) FILTER(WHERE created_at>=day_start),0)>u.daily_micro FROM firstten_private.ai_usage_operations WHERE user_id=o.user_id)
 OR (SELECT coalesce(sum(charge_micro),0)>p.lifetime_micro OR coalesce(sum(charge_micro) FILTER(WHERE created_at>=day_start),0)>p.daily_micro FROM firstten_private.ai_usage_operations WHERE project_id=o.project_id) THEN RAISE EXCEPTION 'Allowance reduced' USING ERRCODE='54000'; END IF;
 IF (SELECT count(*)>g.max_inflight FROM firstten_private.ai_usage_operations WHERE state IN ('reserved','in_flight','unknown'))
 OR (SELECT count(*)>u.max_inflight FROM firstten_private.ai_usage_operations WHERE user_id=o.user_id AND state IN ('reserved','in_flight','unknown'))
 OR (SELECT count(*)>p.max_inflight FROM firstten_private.ai_usage_operations WHERE project_id=o.project_id AND state IN ('reserved','in_flight','unknown')) THEN RAISE EXCEPTION 'Concurrency reduced' USING ERRCODE='54000'; END IF;
 IF (SELECT count(*)>g.starts_per_minute FROM firstten_private.ai_usage_operations WHERE created_at>clock_timestamp()-interval '1 minute')
 OR (SELECT count(*)>u.starts_per_minute FROM firstten_private.ai_usage_operations WHERE user_id=o.user_id AND created_at>clock_timestamp()-interval '1 minute')
 OR (SELECT count(*)>p.starts_per_minute FROM firstten_private.ai_usage_operations WHERE project_id=o.project_id AND created_at>clock_timestamp()-interval '1 minute') THEN RAISE EXCEPTION 'Rate reduced' USING ERRCODE='54000'; END IF;
 UPDATE firstten_private.ai_usage_operations SET state='in_flight',attempt_id=p_attempt_id,updated_at=clock_timestamp() WHERE operation_id=p_operation_id RETURNING * INTO o;
 INSERT INTO firstten_private.ai_usage_audit(operation_id,action,subject) VALUES(p_operation_id,'claimed',o.kind);
 RETURN firstten_private.ai_usage_receipt(o)||jsonb_build_object('dispatch',true);
END $$;
REVOKE ALL ON FUNCTION public.claim_ai_usage(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_ai_usage(uuid,uuid) TO service_role;

CREATE FUNCTION public.finish_ai_usage(p_operation_id uuid,p_attempt_id uuid,p_action text,p_generation_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o firstten_private.ai_usage_operations%ROWTYPE;
BEGIN
 PERFORM 1 FROM firstten_private.ai_usage_global_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT o FROM firstten_private.ai_usage_operations WHERE operation_id=p_operation_id FOR UPDATE;
 IF p_action IS NULL OR p_action NOT IN ('unknown','cancel') THEN RAISE EXCEPTION 'Invalid finish' USING ERRCODE='22023'; END IF;
 IF p_action='cancel' THEN
  IF p_attempt_id IS NOT NULL OR p_generation_id IS NOT NULL OR o.state NOT IN ('reserved','cancelled') THEN RAISE EXCEPTION 'Cannot cancel dispatched request' USING ERRCODE='42501'; END IF;
  IF o.state='cancelled' THEN RETURN firstten_private.ai_usage_receipt(o); END IF;
  UPDATE firstten_private.ai_usage_operations SET state='cancelled',charge_micro=0,updated_at=clock_timestamp() WHERE operation_id=p_operation_id RETURNING * INTO o;
 ELSE
  IF p_attempt_id IS NULL OR o.attempt_id IS DISTINCT FROM p_attempt_id OR o.state NOT IN ('in_flight','unknown') THEN RAISE EXCEPTION 'Invalid uncertain attempt' USING ERRCODE='42501'; END IF;
  IF p_generation_id IS NOT NULL AND p_generation_id !~ '^gen-[0-9A-Za-z-]{1,123}$' THEN RAISE EXCEPTION 'Invalid generation id' USING ERRCODE='22023'; END IF;
  IF o.generation_id IS NOT NULL AND o.generation_id IS DISTINCT FROM p_generation_id THEN RAISE EXCEPTION 'Generation conflict' USING ERRCODE='22023'; END IF;
  -- A duplicate provider id never frees either reservation; conservatively retain both holds.
  IF p_generation_id IS NOT NULL AND EXISTS(SELECT 1 FROM firstten_private.ai_usage_operations WHERE generation_id=p_generation_id AND operation_id<>p_operation_id) THEN p_generation_id:=NULL; END IF;
  UPDATE firstten_private.ai_usage_operations SET state='unknown',generation_id=coalesce(generation_id,p_generation_id),updated_at=clock_timestamp() WHERE operation_id=p_operation_id RETURNING * INTO o;
 END IF;
 INSERT INTO firstten_private.ai_usage_audit(operation_id,action,subject) VALUES(p_operation_id,CASE WHEN p_action='cancel' THEN 'cancelled' ELSE 'unknown' END,o.kind);
 RETURN firstten_private.ai_usage_receipt(o);
END $$;
REVOKE ALL ON FUNCTION public.finish_ai_usage(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finish_ai_usage(uuid,uuid,text,text) TO service_role;

CREATE FUNCTION public.settle_ai_usage(p_operation_id uuid,p_attempt_id uuid,p_generation_id text,p_model text,p_provider text,p_cost_usd numeric,p_prompt_tokens integer,p_completion_tokens integer,p_output_valid boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o firstten_private.ai_usage_operations%ROWTYPE; metadata jsonb; amount bigint; allowed boolean;
BEGIN
 PERFORM 1 FROM firstten_private.ai_usage_global_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT o FROM firstten_private.ai_usage_operations WHERE operation_id=p_operation_id FOR UPDATE;
 IF p_attempt_id IS NULL OR o.attempt_id IS DISTINCT FROM p_attempt_id OR o.state NOT IN ('in_flight','unknown','closed_unknown','settled') THEN RAISE EXCEPTION 'Invalid settlement attempt' USING ERRCODE='42501'; END IF;
 IF p_generation_id IS NULL OR p_generation_id !~ '^gen-[0-9A-Za-z-]{1,123}$' OR p_model IS NULL OR length(p_model) NOT BETWEEN 1 AND 100 OR p_provider IS NULL OR length(p_provider) NOT BETWEEN 1 AND 100
 OR p_cost_usd IS NULL OR p_cost_usd::text IN ('NaN','Infinity','-Infinity') OR p_cost_usd<0 OR p_cost_usd>1000000 OR p_prompt_tokens IS NULL OR p_prompt_tokens<0 OR p_completion_tokens IS NULL OR p_completion_tokens<0 OR p_output_valid IS NULL THEN RAISE EXCEPTION 'Untrusted settlement shape' USING ERRCODE='22023'; END IF;
 metadata:=jsonb_build_object('generationId',p_generation_id,'model',p_model,'provider',p_provider,'costUsd',p_cost_usd,'promptTokens',p_prompt_tokens,'completionTokens',p_completion_tokens,'outputValid',p_output_valid);
 IF o.state='settled' THEN
  IF o.settlement<>metadata THEN RAISE EXCEPTION 'Settlement conflict' USING ERRCODE='22023'; END IF;
  RETURN firstten_private.ai_usage_receipt(o);
 END IF;
 IF (o.generation_id IS NOT NULL AND o.generation_id<>p_generation_id) OR EXISTS(SELECT 1 FROM firstten_private.ai_usage_operations WHERE generation_id=p_generation_id AND operation_id<>p_operation_id) THEN
  -- Commit the stop and full hold, rather than rolling it back by throwing.
  UPDATE firstten_private.ai_usage_global_policy SET global_stop=true,operator_reference='duplicate-provider-generation' WHERE singleton;
  UPDATE firstten_private.ai_usage_operations SET state='unknown',updated_at=clock_timestamp() WHERE operation_id=p_operation_id RETURNING * INTO o;
  RETURN firstten_private.ai_usage_receipt(o);
 END IF;
 amount:=ceil(p_cost_usd*1000000)::bigint;
 allowed:=p_output_valid AND p_model=o.route->>'model' AND p_provider IN (SELECT jsonb_array_elements_text(o.route->'response_providers')) AND p_prompt_tokens<=(o.route->>'input_token_ceiling')::integer AND p_completion_tokens<=(o.route->>'output_token_ceiling')::integer AND amount<=o.reserved_micro;
 UPDATE firstten_private.ai_usage_operations SET state='settled',charge_micro=amount,generation_id=p_generation_id,settlement=metadata,result_allowed=allowed,updated_at=clock_timestamp() WHERE operation_id=p_operation_id RETURNING * INTO o;
 -- Charge real, trusted usage even if it exceeded the expected reservation; stop future dispatches.
 IF amount>o.reserved_micro OR p_model<>o.route->>'model' OR p_provider NOT IN (SELECT jsonb_array_elements_text(o.route->'response_providers')) OR p_prompt_tokens>(o.route->>'input_token_ceiling')::integer OR p_completion_tokens>(o.route->>'output_token_ceiling')::integer THEN
  UPDATE firstten_private.ai_usage_global_policy SET global_stop=true,operator_reference='provider-policy-violation' WHERE singleton;
 END IF;
 INSERT INTO firstten_private.ai_usage_audit(operation_id,action,subject) VALUES(p_operation_id,'settled',o.kind);
 RETURN firstten_private.ai_usage_receipt(o);
END $$;
REVOKE ALL ON FUNCTION public.settle_ai_usage(uuid,uuid,text,text,text,numeric,integer,integer,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.settle_ai_usage(uuid,uuid,text,text,text,numeric,integer,integer,boolean) TO service_role;

-- Manual operator action frees ONLY the concurrency slot, never the unknown cost hold.
CREATE FUNCTION firstten_private.close_unknown_ai_usage(p_operation_id uuid,p_operator_reference text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o firstten_private.ai_usage_operations%ROWTYPE;
BEGIN
 IF p_operator_reference IS NULL OR p_operator_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$' THEN RAISE EXCEPTION 'Invalid operator reference' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM firstten_private.ai_usage_global_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT o FROM firstten_private.ai_usage_operations WHERE operation_id=p_operation_id FOR UPDATE;
 IF o.state NOT IN ('in_flight','unknown','closed_unknown') THEN RAISE EXCEPTION 'Not an uncertain request' USING ERRCODE='22023'; END IF;
 UPDATE firstten_private.ai_usage_operations SET state='closed_unknown',updated_at=clock_timestamp() WHERE operation_id=p_operation_id;
 INSERT INTO firstten_private.ai_usage_audit(operation_id,action,subject,operator_reference) VALUES(p_operation_id,'closed_unknown',o.kind,p_operator_reference);
END $$;
REVOKE ALL ON FUNCTION firstten_private.close_unknown_ai_usage(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.reserve_demo_ai(p_project_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE actor uuid; metadata jsonb; marker jsonb; cap integer; reserved integer;
BEGIN
 -- Same global kill switch, with the full $1 legacy allowance permanently carved out of $25.
 PERFORM 1 FROM firstten_private.ai_usage_global_policy WHERE singleton AND NOT global_stop FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','BUDGET_DISABLED'); END IF;
 actor:=auth.uid();
 IF actor IS NULL THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); END IF;
 IF actor<>'f1d00000-0000-4000-8000-000000000001'::uuid OR p_project_id IS DISTINCT FROM 'f1d00000-0000-4000-8000-000000000010'::uuid OR p_request_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
 -- Read fresh trusted account data, not request JWT claims or user-editable metadata.
 -- Share locks serialize account/project revocation with the short reservation transaction.
 SELECT raw_app_meta_data INTO metadata FROM auth.users WHERE id=actor FOR SHARE;
 IF NOT FOUND OR NOT coalesce(metadata @> '{"firstten_demo_admin":true,"synthetic":true,"firstten_demo_fixture":"first-ten-babson-2026-10-18-v1"}'::jsonb,false) THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
 SELECT checklist->'demo' INTO marker FROM public.projects WHERE id=p_project_id AND user_id=actor FOR SHARE;
 IF NOT FOUND OR NOT coalesce(marker @> '{"fictional":true,"fixtureVersion":"first-ten-babson-2026-10-18-v1"}'::jsonb,false) THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN'); END IF;
 SELECT cap_cents,reserved_cents INTO cap,reserved FROM firstten_private.demo_ai_budget WHERE singleton=true FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','UNAVAILABLE'); END IF;
 IF EXISTS(SELECT 1 FROM firstten_private.demo_ai_reservations WHERE request_id=p_request_id) THEN RETURN jsonb_build_object('ok',false,'code','ALREADY_RESERVED','remainingCents',cap-reserved); END IF;
 IF reserved+2>cap THEN RETURN jsonb_build_object('ok',false,'code','BUDGET_EXHAUSTED','remainingCents',cap-reserved); END IF;
 INSERT INTO firstten_private.demo_ai_reservations(request_id,user_id,project_id,reserved_cents) VALUES(p_request_id,actor,p_project_id,2);
 UPDATE firstten_private.demo_ai_budget SET reserved_cents=reserved+2 WHERE singleton=true;
 RETURN jsonb_build_object('ok',true,'reservedCents',2,'remainingCents',cap-reserved-2);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code','UNAVAILABLE');
END $fn$;

COMMIT;
