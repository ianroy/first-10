BEGIN;
SET LOCAL lock_timeout='5s';
-- AI-002: successful private-workflow generations only. No prompt, source or output text.
CREATE TABLE firstten_private.ai_generation_provenance (
  request_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('questions','synthesis','stage2','stage3')),
  prompt_id text NOT NULL CHECK (prompt_id = 'first-ten.' || kind),
  prompt_version integer NOT NULL CHECK (prompt_version = 1),
  schema_id text NOT NULL CHECK (schema_id = 'first-ten.' || kind || '.output'),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  requested_model text NOT NULL CHECK (length(requested_model) BETWEEN 1 AND 200),
  actual_model text CHECK (length(actual_model) BETWEEN 1 AND 200),
  requested_provider text CHECK (requested_provider IS NULL),
  actual_provider text CHECK (length(actual_provider) BETWEEN 1 AND 200),
  provider_generation_id text CHECK (length(provider_generation_id) BETWEEN 1 AND 200),
  prompt_tokens bigint CHECK (prompt_tokens BETWEEN 0 AND 2147483647),
  completion_tokens bigint CHECK (completion_tokens BETWEEN 0 AND 2147483647),
  total_tokens bigint CHECK (total_tokens BETWEEN 0 AND 2147483647),
  cost_usd numeric CHECK (cost_usd BETWEEN 0 AND 1000000),
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 2),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (project_id,user_id) REFERENCES public.projects(id,user_id) ON DELETE CASCADE
);
CREATE INDEX ai_generation_project_time ON firstten_private.ai_generation_provenance(user_id,project_id,created_at);
ALTER TABLE firstten_private.ai_generation_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.ai_generation_provenance FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.record_ai_generation(p_record jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  k text;
  required_keys text[] := ARRAY['request_id','user_id','project_id','kind','prompt_id','prompt_version','schema_id','schema_version','requested_model','actual_model','requested_provider','actual_provider','provider_generation_id','prompt_tokens','completion_tokens','total_tokens','cost_usd','attempts'];
BEGIN
  IF p_record IS NULL OR jsonb_typeof(p_record) <> 'object' OR NOT p_record ?& required_keys
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_record) key WHERE NOT key = ANY(required_keys)) THEN
    RAISE EXCEPTION 'Invalid generation metadata' USING ERRCODE='23514';
  END IF;
  FOREACH k IN ARRAY ARRAY['request_id','user_id','project_id','kind','prompt_id','schema_id','requested_model'] LOOP
    IF jsonb_typeof(p_record->k) <> 'string' THEN RAISE EXCEPTION 'Invalid generation metadata' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['actual_model','requested_provider','actual_provider','provider_generation_id'] LOOP
    IF jsonb_typeof(p_record->k) NOT IN ('string','null') THEN RAISE EXCEPTION 'Invalid generation metadata' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['prompt_version','schema_version','prompt_tokens','completion_tokens','total_tokens','cost_usd','attempts'] LOOP
    IF jsonb_typeof(p_record->k) NOT IN ('number','null') OR (k <> 'cost_usd' AND (p_record->>k)::numeric <> trunc((p_record->>k)::numeric)) THEN
      RAISE EXCEPTION 'Invalid generation metadata' USING ERRCODE='23514';
    END IF;
  END LOOP;
  PERFORM 1 FROM public.projects WHERE id=(p_record->>'project_id')::uuid AND user_id=(p_record->>'user_id')::uuid FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project owner unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO firstten_private.ai_generation_provenance(request_id,user_id,project_id,kind,prompt_id,prompt_version,schema_id,schema_version,requested_model,actual_model,requested_provider,actual_provider,provider_generation_id,prompt_tokens,completion_tokens,total_tokens,cost_usd,attempts)
  VALUES ((p_record->>'request_id')::uuid,(p_record->>'user_id')::uuid,(p_record->>'project_id')::uuid,p_record->>'kind',p_record->>'prompt_id',(p_record->>'prompt_version')::integer,p_record->>'schema_id',(p_record->>'schema_version')::integer,p_record->>'requested_model',p_record->>'actual_model',p_record->>'requested_provider',p_record->>'actual_provider',p_record->>'provider_generation_id',(p_record->>'prompt_tokens')::bigint,(p_record->>'completion_tokens')::bigint,(p_record->>'total_tokens')::bigint,(p_record->>'cost_usd')::numeric,(p_record->>'attempts')::integer);
  RETURN (p_record->>'request_id')::uuid;
END $$;
REVOKE ALL ON FUNCTION public.record_ai_generation(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_ai_generation(jsonb) TO service_role;
COMMENT ON TABLE firstten_private.ai_generation_provenance IS 'Server-only successful generation provenance; no prompts, inputs, outputs or raw envelopes. Null usage/model/provider means unreported or invalid metadata, not zero. Legacy results remain unchanged so this records request/project scope, not a durable link to user-edited saved output. Project deletion cascades.';

COMMIT;
