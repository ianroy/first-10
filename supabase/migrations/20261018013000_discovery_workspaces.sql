-- DISC-001: private manual discovery. No AI, external fetch, membership or classroom grant.
-- Forward rollback: hide route/revoke mutation RPCs; preserve saved documents and version history.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION firstten_private.discovery_shape() RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
AS $shape$ SELECT '{"type":"object","properties":{"schemaVersion":{"type":"integer","const":1},"frame":{"type":"object","properties":{"problem":{"type":"string","maxLength":3000},"solution":{"type":"string","maxLength":3000}}},"hypothesisDraft":{"type":"object","properties":{"population":{"type":"string","maxLength":500},"situation":{"type":"string","maxLength":500},"prediction":{"type":"string","maxLength":1000},"disconfirming":{"type":"string","maxLength":1000},"timeWindow":{"type":"string","maxLength":500},"reason":{"type":"string","maxLength":1000}}},"hypotheses":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":36,"format":"uuid"},"createdAt":{"type":"string","maxLength":35,"format":"instant"},"population":{"type":"string","maxLength":500},"situation":{"type":"string","maxLength":500},"prediction":{"type":"string","maxLength":1000},"disconfirming":{"type":"string","maxLength":1000},"timeWindow":{"type":"string","maxLength":500},"reason":{"type":"string","maxLength":1000}}},"maxItems":20},"selectedHypothesisId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"people":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":36,"format":"uuid"},"alias":{"type":"string","maxLength":120},"relationship":{"type":"string","maxLength":500},"relevance":{"type":"string","maxLength":1000},"contactId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"falsePositive":{"type":"string","maxLength":1000},"falseNegative":{"type":"string","maxLength":1000},"mitigation":{"type":"string","maxLength":1000}}},"maxItems":5},"missingPerspectives":{"type":"string","maxLength":2000},"scriptDraft":{"type":"object","properties":{"title":{"type":"string","maxLength":120},"opening":{"type":"string","maxLength":1500},"questions":{"type":"array","items":{"type":"string","maxLength":1000},"maxItems":20},"closing":{"type":"string","maxLength":1500}}},"scripts":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":36,"format":"uuid"},"createdAt":{"type":"string","maxLength":35,"format":"instant"},"hypothesisId":{"type":"string","maxLength":36,"format":"uuid"},"contextIds":{"type":"array","items":{"type":"string","maxLength":36,"format":"uuid"},"maxItems":20},"title":{"type":"string","maxLength":120},"opening":{"type":"string","maxLength":1500},"questions":{"type":"array","items":{"type":"string","maxLength":1000},"maxItems":20},"closing":{"type":"string","maxLength":1500}}},"maxItems":20},"selectedScriptId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"contexts":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":36,"format":"uuid"},"kind":{"type":"string","enum":["website","github","product_text","prompt","model_output","other"]},"label":{"type":"string","maxLength":120},"url":{"type":"string","maxLength":2048,"format":"url","nullable":true},"text":{"type":"string","maxLength":6000},"capturedAt":{"type":"string","maxLength":35,"format":"instant"},"reviewedAt":{"type":"string","maxLength":35,"format":"instant","nullable":true},"permission":{"type":"string","enum":["own_or_permitted","unknown"]},"retrieval":{"type":"string","enum":["link_not_read","pasted_text"]}}},"maxItems":20},"excludedContextIds":{"type":"array","items":{"type":"string","maxLength":36,"format":"uuid"},"maxItems":20},"results":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":36,"format":"uuid"},"interviewId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"scriptId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"sourceCapturedAt":{"type":"string","maxLength":35,"format":"instant","nullable":true},"observation":{"type":"string","maxLength":4000},"quote":{"type":"string","maxLength":2000},"interpretation":{"type":"string","maxLength":2000},"counterevidence":{"type":"string","maxLength":2000}}},"maxItems":20},"reflection":{"type":"object","properties":{"decision":{"type":"string","enum":["retain","narrow","pivot","test","stop"],"nullable":true},"reason":{"type":"string","maxLength":2000},"productChange":{"type":"string","maxLength":2000},"nextTest":{"type":"string","maxLength":2000},"uncertainty":{"type":"string","maxLength":2000}}}}}'::jsonb $shape$;
CREATE FUNCTION firstten_private.normalize_discovery(doc jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE d jsonb; item jsonb; k text; ids text[]; v text;
BEGIN
 IF doc IS NULL OR octet_length(doc::text)>262144 THEN RAISE EXCEPTION 'Invalid discovery document' USING ERRCODE='22023'; END IF;
 -- The existing bounded recursive normalizer accepts a fully inline shape (no marketing refs).
 d:=firstten_private.marketing_normalize(doc,firstten_private.discovery_shape());
 SELECT array_agg(value->>'id') INTO ids FROM (
 SELECT value FROM jsonb_array_elements(d->'hypotheses') UNION ALL SELECT value FROM jsonb_array_elements(d->'people') UNION ALL SELECT value FROM jsonb_array_elements(d->'scripts') UNION ALL SELECT value FROM jsonb_array_elements(d->'contexts') UNION ALL SELECT value FROM jsonb_array_elements(d->'results')) AS all_items;
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids)x) THEN RAISE EXCEPTION 'Duplicate activity ids' USING ERRCODE='22023'; END IF;
 IF d->'selectedHypothesisId'<>'null'::jsonb AND firstten_private.marketing_find(d->'hypotheses',d->>'selectedHypothesisId') IS NULL OR d->'selectedScriptId'<>'null'::jsonb AND firstten_private.marketing_find(d->'scripts',d->>'selectedScriptId') IS NULL THEN RAISE EXCEPTION 'Invalid selected version' USING ERRCODE='22023'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'hypotheses') LOOP
  FOREACH k IN ARRAY ARRAY['population','situation','prediction','disconfirming','timeWindow'] LOOP IF item->>k='' THEN RAISE EXCEPTION 'Incomplete hypothesis' USING ERRCODE='22023'; END IF; END LOOP;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'scripts') LOOP
  IF firstten_private.marketing_find(d->'hypotheses',item->>'hypothesisId') IS NULL OR NOT firstten_private.marketing_refs(item->'contextIds',d->'contexts') OR jsonb_array_length(item->'questions')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(item->'questions')q WHERE q='') THEN RAISE EXCEPTION 'Invalid script references' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF NOT firstten_private.marketing_refs(d->'excludedContextIds',d->'contexts') THEN RAISE EXCEPTION 'Invalid exclusions' USING ERRCODE='22023'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'results') LOOP
  IF item->'scriptId'<>'null'::jsonb AND firstten_private.marketing_find(d->'scripts',item->>'scriptId') IS NULL THEN RAISE EXCEPTION 'Invalid result script' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'contexts') LOOP
  IF item->>'label'='' OR ((item->>'kind' IN ('website','github')) IS DISTINCT FROM (item->>'retrieval'='link_not_read')) OR (item->>'retrieval'='link_not_read' AND (item->'url'='null'::jsonb OR item->>'text'<>'')) OR (item->>'retrieval'='pasted_text' AND item->>'text'='') THEN RAISE EXCEPTION 'Invalid context capture' USING ERRCODE='22023'; END IF;
  v:=coalesce(item->>'url','')||' '||(item->>'text');
  IF v ~* '-----BEGIN [A-Z ]*PRIVATE KEY-----|(sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9._-]{16,}' OR coalesce(item->>'url','') ~* '[?&#][^=&#]*(token|secret|password|api_key|authorization|signature|%)[^=&#]*=' THEN RAISE EXCEPTION 'Remove credentials from context' USING ERRCODE='22023'; END IF;
 END LOOP;
 RETURN d;
END $fn$;
CREATE TABLE public.discovery_workspaces(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid(), project_id uuid NOT NULL UNIQUE,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 document jsonb NOT NULL CHECK(document=firstten_private.normalize_discovery(document)),
 history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(history)='array' AND jsonb_array_length(history)<=3),
 last_mutation_id uuid NOT NULL,last_mutation_hash text NOT NULL CHECK(last_mutation_hash~'^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,user_id) REFERENCES public.projects(id,user_id) ON DELETE CASCADE
);
CREATE TRIGGER discovery_private_identity BEFORE UPDATE ON public.discovery_workspaces FOR EACH ROW EXECUTE FUNCTION firstten_private.enforce_private_identity();
ALTER TABLE public.discovery_workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY discovery_owner_read ON public.discovery_workspaces FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
REVOKE ALL ON public.discovery_workspaces FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.discovery_workspaces TO authenticated;
CREATE FUNCTION firstten_private.discovery_record(row_data public.discovery_workspaces) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',row_data.id,'revision',row_data.revision,'savedAt',to_char(row_data.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'document',row_data.document,'history',row_data.history)
$$;
CREATE FUNCTION public.load_discovery_workspace(p_project_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=auth.uid(); row_data public.discovery_workspaces%ROWTYPE;
BEGIN
 IF actor IS NULL THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id AND user_id=actor;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT * INTO row_data FROM public.discovery_workspaces WHERE project_id=p_project_id AND user_id=actor;
 RETURN jsonb_build_object('ok',true,'workspace',CASE WHEN row_data.id IS NULL THEN NULL ELSE firstten_private.discovery_record(row_data) END);
END $fn$;
CREATE FUNCTION public.save_discovery_workspace(p_project_id uuid,p_expected_revision bigint,p_mutation_id uuid,p_document jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=auth.uid(); current_row public.discovery_workspaces%ROWTYPE; saved public.discovery_workspaces%ROWTYPE; d jsonb; hash text; stamp timestamptz; k text; item jsonb; old_item jsonb; ord bigint; archived timestamptz; old_history jsonb;
BEGIN
 IF actor IS NULL THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); END IF;
 SELECT archived_at INTO archived FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF archived IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','ARCHIVED'); END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>9007199254740991 OR p_mutation_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_DOCUMENT'); END IF;
 d:=firstten_private.normalize_discovery(p_document);
 hash:=encode(sha256(convert_to(jsonb_build_object('revision',p_expected_revision,'document',d)::text,'UTF8')),'hex');
 SELECT * INTO current_row FROM public.discovery_workspaces WHERE project_id=p_project_id AND user_id=actor FOR UPDATE;
 IF current_row.last_mutation_id=p_mutation_id THEN
  IF current_row.last_mutation_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT','currentRevision',current_row.revision); END IF;
  RETURN jsonb_build_object('ok',true)||firstten_private.discovery_record(current_row);
 END IF;
 IF coalesce(current_row.revision,0)<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT','currentRevision',coalesce(current_row.revision,0)); END IF;
 IF current_row.revision=9007199254740991 THEN RETURN jsonb_build_object('ok',false,'code','UNAVAILABLE'); END IF;
 IF current_row.id IS NOT NULL THEN
  FOREACH k IN ARRAY ARRAY['hypotheses','scripts','contexts'] LOOP
   FOR old_item,ord IN SELECT value,ordinality FROM jsonb_array_elements(current_row.document->k) WITH ORDINALITY LOOP
    IF old_item IS DISTINCT FROM d->k->((ord-1)::integer) THEN RETURN jsonb_build_object('ok',false,'code','PRESERVED_VERSION'); END IF;
   END LOOP;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(current_row.document->'excludedContextIds') AS x(value) WHERE NOT d->'excludedContextIds' @> jsonb_build_array(x.value)) THEN RETURN jsonb_build_object('ok',false,'code','PRESERVED_VERSION'); END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'people') LOOP
  IF item->'contactId'<>'null'::jsonb THEN
   PERFORM 1 FROM public.contacts WHERE id=(item->>'contactId')::uuid AND user_id=actor AND project_id=p_project_id FOR KEY SHARE;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','SOURCE_UNAVAILABLE'); END IF;
  END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'results') LOOP
  IF item->'interviewId'<>'null'::jsonb THEN
   PERFORM 1 FROM public.interviews WHERE id=(item->>'interviewId')::uuid AND user_id=actor AND project_id=p_project_id FOR KEY SHARE;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','SOURCE_UNAVAILABLE'); END IF;
  END IF;
 END LOOP;
 stamp:=clock_timestamp();
 IF current_row.id IS NULL THEN
  INSERT INTO public.discovery_workspaces(user_id,project_id,revision,document,last_mutation_id,last_mutation_hash,created_at,updated_at) VALUES(actor,p_project_id,1,d,p_mutation_id,hash,stamp,stamp) RETURNING * INTO saved;
 ELSE
  SELECT coalesce(jsonb_agg(v ORDER BY n),'[]'::jsonb) INTO old_history FROM (SELECT v,n FROM jsonb_array_elements(jsonb_build_array(firstten_private.discovery_record(current_row)-'id'-'history')||current_row.history) WITH ORDINALITY AS x(v,n) ORDER BY n LIMIT 3)y;
  UPDATE public.discovery_workspaces SET revision=current_row.revision+1,document=d,history=old_history,last_mutation_id=p_mutation_id,last_mutation_hash=hash,updated_at=stamp WHERE id=current_row.id RETURNING * INTO saved;
 END IF;
 RETURN jsonb_build_object('ok',true)||firstten_private.discovery_record(saved);
EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR datetime_field_overflow OR check_violation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'code','INVALID_DOCUMENT');
 WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code','UNAVAILABLE');
END $fn$;
CREATE FUNCTION public.adopt_discovery_script(p_project_id uuid,p_expected_revision bigint,p_script_id uuid,p_expected_questions jsonb,p_expected_origin_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=auth.uid(); q jsonb; origin uuid; archived timestamptz; workspace public.discovery_workspaces%ROWTYPE; script jsonb;
BEGIN
 IF actor IS NULL THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); END IF;
 SELECT questions,questions_origin_id,archived_at INTO q,origin,archived FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF archived IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','ARCHIVED'); END IF;
 SELECT * INTO workspace FROM public.discovery_workspaces WHERE project_id=p_project_id AND user_id=actor;
 script:=firstten_private.marketing_find(workspace.document->'scripts',p_script_id::text);
 IF workspace.revision IS DISTINCT FROM p_expected_revision OR script IS NULL OR workspace.document->>'selectedScriptId' IS DISTINCT FROM p_script_id::text THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(script->'contextIds') AS x(value) WHERE workspace.document->'excludedContextIds' @> jsonb_build_array(x.value)) THEN RETURN jsonb_build_object('ok',false,'code','SOURCE_UNAVAILABLE'); END IF;
 -- Retry is safe only if the desired manual list is already present and has no AI-origin receipt.
 IF (q IS DISTINCT FROM p_expected_questions OR origin IS DISTINCT FROM p_expected_origin_id) AND (q IS DISTINCT FROM script->'questions' OR origin IS NOT NULL) THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT'); END IF;
 UPDATE public.projects SET questions=script->'questions',questions_origin_id=NULL WHERE id=p_project_id AND user_id=actor;
 RETURN jsonb_build_object('ok',true,'questions',script->'questions');
END $fn$;
REVOKE ALL ON FUNCTION firstten_private.discovery_shape(),firstten_private.normalize_discovery(jsonb),firstten_private.discovery_record(public.discovery_workspaces) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.load_discovery_workspace(uuid),public.save_discovery_workspace(uuid,bigint,uuid,jsonb),public.adopt_discovery_script(uuid,bigint,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.load_discovery_workspace(uuid),public.save_discovery_workspace(uuid,bigint,uuid,jsonb),public.adopt_discovery_script(uuid,bigint,uuid,jsonb,uuid) TO authenticated;
COMMENT ON TABLE public.discovery_workspaces IS 'Owner-private manual hypothesis, sampling, scripts and reflections. Reported student thinking and context are not verified evidence. History retains the last three saves; first hypothesis and script versions remain append-only. No classroom access grant.';
COMMIT;
