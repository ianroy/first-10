-- Operational interest/feedback only. No workspace access, accounts or email delivery.
-- Rollback: revoke RPC execute from service_role; retain private submissions for owner review.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE firstten_private.founding_partner_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL CHECK(char_length(email) BETWEEN 3 AND 254),
 school text NOT NULL CHECK(char_length(school) BETWEEN 1 AND 200),
 kind text NOT NULL CHECK(kind IN ('interest','feedback')),
 note text NOT NULL CHECK(char_length(note)<=2000),
 ip_hash text CHECK(ip_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX founding_partner_email_time ON firstten_private.founding_partner_submissions(email,created_at);
CREATE INDEX founding_partner_time ON firstten_private.founding_partner_submissions(created_at);
CREATE INDEX founding_partner_ip_time ON firstten_private.founding_partner_submissions(ip_hash,created_at) WHERE ip_hash IS NOT NULL;
ALTER TABLE firstten_private.founding_partner_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.founding_partner_submissions FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.record_founding_partner(p_email text,p_school text,p_kind text,p_note text,p_ip_hash text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE normalized_email text; cutoff timestamptz;
BEGIN
 normalized_email:=lower(btrim(p_email));
 IF normalized_email IS NULL OR char_length(normalized_email) NOT BETWEEN 3 AND 254
 OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR p_school IS NULL OR char_length(btrim(p_school)) NOT BETWEEN 1 AND 200
 OR p_kind IS NULL OR p_kind NOT IN ('interest','feedback')
 OR p_note IS NULL OR char_length(btrim(p_note))>2000
 OR (p_kind='feedback' AND btrim(p_note)='')
 OR (p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$')
 THEN RETURN jsonb_build_object('ok',false,'code','INVALID'); END IF;
 -- A single short transaction lock makes all rolling-window caps atomic across workers.
 PERFORM pg_advisory_xact_lock(67102618004000::bigint);
 cutoff:=clock_timestamp()-interval '1 hour';
 IF (SELECT count(*) FROM firstten_private.founding_partner_submissions WHERE created_at>=cutoff AND email=normalized_email)>=3
 OR (SELECT count(*) FROM firstten_private.founding_partner_submissions WHERE created_at>=cutoff)>=500
 OR (p_ip_hash IS NOT NULL AND (SELECT count(*) FROM firstten_private.founding_partner_submissions WHERE created_at>=cutoff AND ip_hash=p_ip_hash)>=150)
 THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED'); END IF;
 INSERT INTO firstten_private.founding_partner_submissions(email,school,kind,note,ip_hash)
 VALUES(normalized_email,btrim(p_school),p_kind,btrim(p_note),p_ip_hash);
 RETURN jsonb_build_object('ok',true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code','UNAVAILABLE');
END $fn$;
REVOKE ALL ON FUNCTION public.record_founding_partner(text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_founding_partner(text,text,text,text,text) TO service_role;
COMMENT ON TABLE firstten_private.founding_partner_submissions IS 'Unverified educator interest/feedback for owner follow-up, not enrollment, adoption or product research outcomes. No student/interview/project records. No raw IP; optional server HMAC for rate limiting. No browser or service-role direct access grants.';
COMMIT;
