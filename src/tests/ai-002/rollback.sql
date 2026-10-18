-- Operational rollback: deploy the previous application first, then run this as database owner.
-- Preserve historical provenance instead of destructively dropping a successful-generation ledger.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.record_ai_generation(jsonb) FROM service_role;
COMMIT;
-- Re-enable after deploying the matching application:
-- GRANT EXECUTE ON FUNCTION public.record_ai_generation(jsonb) TO service_role;
