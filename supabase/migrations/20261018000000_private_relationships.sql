-- SEC-003: strengthen the existing six-table owner model; no content is rewritten.
-- One DO statement is atomic even when a SQL client does not open a transaction.
-- Preflight: supabase/tests/ownership.sql (aggregate counts only). Any anomaly
-- requires an operator-reviewed corrective migration; there is no inferred backfill.
DO $sec003_migration$
DECLARE
  table_name text;
  invalid_count bigint;
  audit_counts jsonb := '{}'::jsonb;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '60s', true);

  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '0A000',
      MESSAGE = 'SEC-003 requires PostgreSQL 15 or later for contact-only SET NULL.';
  END IF;

  -- Serialize the audit and DDL with writers. Bounded locks fail without changes;
  -- readers may briefly wait, so apply during a reviewed deployment window.
  LOCK TABLE public.projects, public.contacts, public.interviews,
    public.learnings, public.experiments, public.outreach IN ACCESS EXCLUSIVE MODE;

  FOREACH table_name IN ARRAY ARRAY['contacts','interviews','learnings','experiments','outreach'] LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I child LEFT JOIN public.projects parent ON parent.id = child.project_id WHERE parent.id IS NULL OR child.user_id IS DISTINCT FROM parent.user_id',
      table_name
    ) INTO invalid_count;
    audit_counts := audit_counts || jsonb_build_object(table_name || '_project', invalid_count);
  END LOOP;

  SELECT count(*) INTO invalid_count
  FROM public.interviews interview
  LEFT JOIN public.contacts contact ON contact.id = interview.contact_id
  WHERE interview.contact_id IS NOT NULL
    AND (contact.id IS NULL OR contact.user_id IS DISTINCT FROM interview.user_id
      OR contact.project_id IS DISTINCT FROM interview.project_id);
  audit_counts := audit_counts || jsonb_build_object('interviews_contact', invalid_count);

  IF EXISTS (SELECT 1 FROM jsonb_each_text(audit_counts) count_entry WHERE count_entry.value::bigint > 0) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'SEC-003 migration blocked: legacy ownership relationships need review.',
      DETAIL = audit_counts::text,
      HINT = 'No rows were changed. Run supabase/tests/ownership.sql as an authorized operator, review affected records privately, and prepare an explicit corrective migration before retrying. Do not reset, delete, or infer ownership.';
  END IF;

  ALTER TABLE public.projects ADD CONSTRAINT projects_id_user_key UNIQUE (id, user_id);
  ALTER TABLE public.contacts ADD CONSTRAINT contacts_id_project_user_key UNIQUE (id, project_id, user_id);

  -- Preserve public FK names and delete behavior; duplicate relationships would
  -- make PostgREST joins ambiguous. These replacements occur atomically.
  FOREACH table_name IN ARRAY ARRAY['contacts','interviews','learnings','experiments','outreach'] LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', table_name, table_name || '_project_id_fkey');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (project_id, user_id) REFERENCES public.projects(id, user_id) ON DELETE CASCADE',
      table_name, table_name || '_project_id_fkey'
    );
  END LOOP;

  ALTER TABLE public.interviews DROP CONSTRAINT interviews_contact_id_fkey;
  ALTER TABLE public.interviews ADD CONSTRAINT interviews_contact_id_fkey
    FOREIGN KEY (contact_id, project_id, user_id)
    REFERENCES public.contacts(id, project_id, user_id)
    ON DELETE SET NULL (contact_id);

  -- Non-exposed trigger helper: no elevated privilege, table reads or actor input.
  CREATE SCHEMA IF NOT EXISTS firstten_private;
  REVOKE ALL ON SCHEMA firstten_private FROM PUBLIC, anon, authenticated, service_role;

  CREATE OR REPLACE FUNCTION firstten_private.enforce_private_identity()
  RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
  SET search_path = pg_catalog
  AS $identity_function$
  BEGIN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Row ownership is immutable.';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Row identity and creation time are immutable.';
    END IF;
    IF TG_TABLE_NAME <> 'projects' THEN
      IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Row project scope is immutable.';
      END IF;
    END IF;
    RETURN NEW;
  END
  $identity_function$;

  REVOKE ALL ON FUNCTION firstten_private.enforce_private_identity() FROM PUBLIC, anon, authenticated, service_role;
  FOREACH table_name IN ARRAY ARRAY['projects','contacts','interviews','learnings','experiments','outreach'] LOOP
    EXECUTE format(
      'CREATE TRIGGER enforce_private_identity BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION firstten_private.enforce_private_identity()',
      table_name
    );
  END LOOP;
END
$sec003_migration$;
