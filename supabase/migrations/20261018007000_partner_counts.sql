-- Count-only partner intake for the freshly authorized admin server endpoint.
-- No public/authenticated execution, row grant, contact details or school names.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION public.get_founding_partner_counts() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
 WITH submissions AS (
  SELECT kind,lower(email) AS address,
   lower(email) ~ '(\.(invalid|test|example)$|@example\.(com|org|net)$)' AS fixture
  FROM firstten_private.founding_partner_submissions
 )
 SELECT jsonb_build_object(
  'interestRequests',count(*) FILTER(WHERE NOT fixture AND kind='interest'),
  'feedbackSubmissions',count(*) FILTER(WHERE NOT fixture AND kind='feedback'),
  'distinctRespondents',count(DISTINCT address) FILTER(WHERE NOT fixture),
  'excludedFixtures',count(*) FILTER(WHERE fixture)
 ) FROM submissions;
$fn$;
REVOKE ALL ON FUNCTION public.get_founding_partner_counts() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_founding_partner_counts() TO service_role;
COMMENT ON FUNCTION public.get_founding_partner_counts() IS 'Fixed aggregate intake counts only. Reserved fixture email domains excluded; other addresses are unverified, not adoption or enrollment.';
COMMIT;
