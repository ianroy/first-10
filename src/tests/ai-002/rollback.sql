-- Operational rollback: deploy the previous application first, then run this as database owner.
-- Preserve historical provenance and nullable saved-output links instead of dropping data.
-- The additive 08000 columns/triggers are compatible with the earlier flat-response app.
-- Existing legacy writes have NULL origins; do not strip links from previously saved work.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.record_ai_generation(jsonb) FROM service_role;
COMMIT;
-- Re-enable after deploying the matching application:
-- GRANT EXECUTE ON FUNCTION public.record_ai_generation(jsonb) TO service_role;
