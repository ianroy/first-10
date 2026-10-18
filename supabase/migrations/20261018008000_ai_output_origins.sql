BEGIN;
SET LOCAL lock_timeout='5s';
-- Nullable links preserve every legacy record; source text remains in existing owner-only tables.
ALTER TABLE firstten_private.ai_generation_provenance ADD CONSTRAINT ai_generation_scoped_id UNIQUE(request_id,user_id,project_id);
ALTER TABLE public.projects ADD COLUMN questions_origin_id uuid, ADD COLUMN survey_origin_id uuid,
  ADD CONSTRAINT questions_origin_scope FOREIGN KEY(questions_origin_id,user_id,id) REFERENCES firstten_private.ai_generation_provenance(request_id,user_id,project_id),
  ADD CONSTRAINT survey_origin_scope FOREIGN KEY(survey_origin_id,user_id,id) REFERENCES firstten_private.ai_generation_provenance(request_id,user_id,project_id);
ALTER TABLE public.learnings ADD COLUMN generation_origin_id uuid,
  ADD CONSTRAINT learning_origin_scope FOREIGN KEY(generation_origin_id,user_id,project_id) REFERENCES firstten_private.ai_generation_provenance(request_id,user_id,project_id);
ALTER TABLE public.outreach ADD COLUMN generation_origin_id uuid,
  ADD CONSTRAINT outreach_origin_scope FOREIGN KEY(generation_origin_id,user_id,project_id) REFERENCES firstten_private.ai_generation_provenance(request_id,user_id,project_id);

CREATE FUNCTION firstten_private.check_generation_origin(p_origin uuid,p_user uuid,p_project uuid,p_kind text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_origin IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM firstten_private.ai_generation_provenance
    WHERE request_id=p_origin AND user_id=p_user AND project_id=p_project AND kind=p_kind
  ) THEN RAISE EXCEPTION 'AI origin is unavailable for this output' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION firstten_private.check_generation_origin(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION firstten_private.validate_output_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME='projects' THEN
    PERFORM firstten_private.check_generation_origin(NEW.questions_origin_id,NEW.user_id,NEW.id,'questions');
    PERFORM firstten_private.check_generation_origin(NEW.survey_origin_id,NEW.user_id,NEW.id,'stage2');
  ELSIF TG_TABLE_NAME='learnings' THEN
    IF NEW.generation_origin_id IS NOT NULL AND (NEW.kind<>'synthesis' OR NEW.stage<>1) THEN
      RAISE EXCEPTION 'AI origin is unavailable for this output' USING ERRCODE='23514';
    END IF;
    PERFORM firstten_private.check_generation_origin(NEW.generation_origin_id,NEW.user_id,NEW.project_id,'synthesis');
  ELSE
    IF NEW.generation_origin_id IS NOT NULL AND (NEW.stage NOT IN (2,3) OR
      (NEW.stage=2 AND NEW.kind NOT IN ('channel','draft')) OR
      (NEW.stage=3 AND NEW.kind NOT IN ('channel','referral','onboarding'))) THEN
      RAISE EXCEPTION 'AI origin is unavailable for this output' USING ERRCODE='23514';
    END IF;
    PERFORM firstten_private.check_generation_origin(NEW.generation_origin_id,NEW.user_id,NEW.project_id,'stage'||NEW.stage);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION firstten_private.validate_output_origin() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER validate_project_ai_origin BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION firstten_private.validate_output_origin();
CREATE TRIGGER validate_learning_ai_origin BEFORE INSERT OR UPDATE ON public.learnings FOR EACH ROW EXECUTE FUNCTION firstten_private.validate_output_origin();
CREATE TRIGGER validate_outreach_ai_origin BEFORE INSERT OR UPDATE ON public.outreach FOR EACH ROW EXECUTE FUNCTION firstten_private.validate_output_origin();

-- Owner check is performed on every lookup. This does not expose the ledger or provider request IDs.
CREATE FUNCTION public.get_ai_generation_origin(p_project_id uuid,p_origin_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND user_id=auth.uid()) THEN
    RAISE EXCEPTION 'AI origin is unavailable' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('requestId',request_id,'kind',kind,'promptId',prompt_id,'promptVersion',prompt_version,
    'schemaId',schema_id,'schemaVersion',schema_version,'requestedModel',requested_model,'actualModel',actual_model,
    'provider',actual_provider,'costUsd',cost_usd,'createdAt',created_at)
  INTO result FROM firstten_private.ai_generation_provenance
  WHERE request_id=p_origin_id AND project_id=p_project_id AND user_id=auth.uid();
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_ai_generation_origin(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_generation_origin(uuid,uuid) TO authenticated;

-- One transaction: invalid rows/origins never erase a previously saved plan or survey.
CREATE FUNCTION public.save_generated_outreach(p_project_id uuid,p_stage integer,p_origin_id uuid,p_rows jsonb,p_survey jsonb DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE row_data jsonb; current_stage integer; target_kind text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Project access unavailable' USING ERRCODE='42501'; END IF;
  SELECT stage INTO current_stage FROM public.projects WHERE id=p_project_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project access unavailable' USING ERRCODE='42501'; END IF;
  IF p_stage IS NULL OR p_stage NOT IN (2,3) OR current_stage<p_stage OR p_origin_id IS NULL THEN
    RAISE EXCEPTION 'Invalid outreach draft' USING ERRCODE='23514';
  END IF;
  target_kind := 'stage'||p_stage;
  PERFORM firstten_private.check_generation_origin(p_origin_id,auth.uid(),p_project_id,target_kind);
  IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Invalid outreach draft' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(p_rows)>64 THEN RAISE EXCEPTION 'Invalid outreach draft' USING ERRCODE='23514'; END IF;
  FOR row_data IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(row_data)<>'object' OR NOT row_data ?& ARRAY['kind','title','body'] OR
      EXISTS(SELECT 1 FROM jsonb_object_keys(row_data) k WHERE k NOT IN ('kind','title','body')) OR
      jsonb_typeof(row_data->'kind')<>'string' OR jsonb_typeof(row_data->'title')<>'string' OR jsonb_typeof(row_data->'body')<>'string' OR
      length(row_data->>'title')>2400 OR length(row_data->>'body') NOT BETWEEN 1 AND 2400 OR
      (p_stage=2 AND row_data->>'kind' NOT IN ('channel','draft')) OR
      (p_stage=3 AND row_data->>'kind' NOT IN ('channel','referral','onboarding')) THEN
      RAISE EXCEPTION 'Invalid outreach draft' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF p_stage=2 THEN
    IF p_survey IS NULL OR jsonb_typeof(p_survey)<>'array' THEN RAISE EXCEPTION 'Invalid outreach survey' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(p_survey)>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_survey) v WHERE jsonb_typeof(v)<>'string' OR length(v#>>'{}') NOT BETWEEN 1 AND 2400) THEN
      RAISE EXCEPTION 'Invalid outreach survey' USING ERRCODE='23514';
    END IF;
  ELSIF p_survey IS NOT NULL THEN RAISE EXCEPTION 'Invalid outreach survey' USING ERRCODE='23514'; END IF;
  DELETE FROM public.outreach WHERE project_id=p_project_id AND user_id=auth.uid() AND stage=p_stage;
  INSERT INTO public.outreach(project_id,user_id,stage,kind,title,body,generation_origin_id)
    SELECT p_project_id,auth.uid(),p_stage,value->>'kind',value->>'title',value->>'body',p_origin_id FROM jsonb_array_elements(p_rows);
  IF p_stage=2 THEN UPDATE public.projects SET survey=p_survey,survey_origin_id=p_origin_id WHERE id=p_project_id AND user_id=auth.uid(); END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_generated_outreach(uuid,integer,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_generated_outreach(uuid,integer,uuid,jsonb,jsonb) TO authenticated;
COMMENT ON COLUMN public.projects.questions_origin_id IS 'Recorded generation on which these questions were based. User edits may differ; NULL means no recorded origin, including legacy work.';
COMMENT ON COLUMN public.projects.survey_origin_id IS 'Recorded stage2 generation on which survey was based. Not proof that current wording is unchanged.';
COMMENT ON COLUMN public.learnings.generation_origin_id IS 'Recorded synthesis generation; edits and acceptance are human actions and do not certify the content.';
COMMENT ON COLUMN public.outreach.generation_origin_id IS 'Recorded stage2/stage3 generation, scoped to owner/project/kind; current wording may have been edited.';
COMMIT;
