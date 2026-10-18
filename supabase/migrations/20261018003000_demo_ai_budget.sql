-- One workshop, synthetic-only AI reservation budget. No provider calls or text storage.
-- Reservations are never refunded: unknown provider outcomes remain charged to the cap.
-- Rollback revokes reserve_demo_ai execution; retain the private ledger and spent budget.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE firstten_private.demo_ai_budget(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 cap_cents smallint NOT NULL DEFAULT 100 CHECK(cap_cents=100),
 reserved_cents smallint NOT NULL DEFAULT 0 CHECK(reserved_cents BETWEEN 0 AND 100)
);
INSERT INTO firstten_private.demo_ai_budget(singleton,cap_cents,reserved_cents) VALUES(true,100,0);
CREATE TABLE firstten_private.demo_ai_reservations(
 request_id uuid PRIMARY KEY,
 user_id uuid NOT NULL CHECK(user_id='f1d00000-0000-4000-8000-000000000001'::uuid),
 project_id uuid NOT NULL CHECK(project_id='f1d00000-0000-4000-8000-000000000010'::uuid),
 reserved_cents smallint NOT NULL DEFAULT 2 CHECK(reserved_cents=2),
 reserved_at timestamptz NOT NULL DEFAULT now()
);
-- Historical actor/project ids intentionally survive fixture deletion. Authorization
-- and matching live ownership are checked afresh before every reservation.
ALTER TABLE firstten_private.demo_ai_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.demo_ai_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.demo_ai_budget,firstten_private.demo_ai_reservations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.reserve_demo_ai(p_project_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE actor uuid; metadata jsonb; marker jsonb; cap integer; reserved integer;
BEGIN
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
REVOKE ALL ON FUNCTION public.reserve_demo_ai(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reserve_demo_ai(uuid,uuid) TO authenticated;
COMMENT ON TABLE firstten_private.demo_ai_reservations IS 'Synthetic workshop reservations only; actor/project identifiers are immutable historical scope, not live grants. No prompts, outputs, participant data or refunds.';
COMMIT;
