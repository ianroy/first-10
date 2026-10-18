-- AI-007: versioned owner-private sources and a serialized dispatch permission/version fence.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION firstten_private.ai_source_permitted(p_actor uuid,p_project uuid,p_type text,p_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.projects p JOIN public.processing_consents c ON c.project_id=p.id AND c.target_kind='project' AND c.target_id=p.id AND c.ai_status='granted' WHERE p.id=p_project AND p.user_id=p_actor AND p.archived_at IS NULL) THEN RETURN false; END IF;
 IF p_type='project' THEN RETURN p_id=p_project;
 ELSIF p_type='interview' THEN RETURN EXISTS(SELECT 1 FROM public.interviews i JOIN public.processing_consents c ON c.project_id=i.project_id AND c.target_kind='interview' AND c.target_id=i.id AND c.note_status='granted' AND c.ai_status='granted' WHERE i.id=p_id AND i.project_id=p_project AND i.user_id=p_actor AND i.completed AND (i.contact_id IS NULL OR EXISTS(SELECT 1 FROM public.contacts linked JOIN public.processing_consents cc ON cc.project_id=linked.project_id AND cc.target_kind='contact' AND cc.target_id=linked.id AND cc.ai_status='granted' WHERE linked.id=i.contact_id AND linked.project_id=p_project AND linked.user_id=p_actor)));
 ELSIF p_type='contact' THEN RETURN EXISTS(SELECT 1 FROM public.contacts r JOIN public.processing_consents c ON c.project_id=r.project_id AND c.target_kind='contact' AND c.target_id=r.id AND c.ai_status='granted' WHERE r.id=p_id AND r.project_id=p_project AND r.user_id=p_actor);
 ELSIF p_type='learning' THEN RETURN EXISTS(SELECT 1 FROM public.learnings r JOIN public.processing_consents c ON c.project_id=r.project_id AND c.target_kind='learning' AND c.target_id=r.id AND c.ai_status='granted' AND NOT c.evidence_invalidated WHERE r.id=p_id AND r.project_id=p_project AND r.user_id=p_actor AND r.accepted)
 AND NOT EXISTS(SELECT 1 FROM public.interviews i WHERE i.project_id=p_project AND i.user_id=p_actor AND i.completed AND NOT firstten_private.ai_source_permitted(p_actor,p_project,'interview',i.id))
 AND NOT EXISTS(SELECT 1 FROM public.contacts c WHERE c.project_id=p_project AND c.user_id=p_actor AND NOT firstten_private.ai_source_permitted(p_actor,p_project,'contact',c.id));
 END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION firstten_private.ai_source_permitted(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION firstten_private.ai_source_record(p_actor uuid,p_project uuid,p_type text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE body jsonb; linked jsonb:='null'; created timestamptz; consent_revision bigint; content_hash text; iv public.interviews; answer jsonb; max_bytes integer;
BEGIN
 IF NOT firstten_private.ai_source_permitted(p_actor,p_project,p_type,p_id) THEN RETURN NULL; END IF;
 SELECT revision INTO consent_revision FROM public.processing_consents WHERE project_id=p_project AND target_kind=p_type AND target_id=p_id;
 IF p_type='project' THEN
  SELECT jsonb_build_object('name',name,'description',description,'audience',audience,'problem',problem),created_at INTO body,created FROM public.projects WHERE id=p_id AND user_id=p_actor; max_bytes:=8000;
 ELSIF p_type='interview' THEN
  SELECT * INTO iv FROM public.interviews WHERE id=p_id AND project_id=p_project AND user_id=p_actor;
  IF jsonb_typeof(iv.answers) IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('omitted','invalid'); END IF;
  IF jsonb_array_length(iv.answers)>30 OR octet_length(iv.answers::text)>20000 OR iv.tags IS NULL OR cardinality(iv.tags)>10 THEN RETURN jsonb_build_object('omitted','oversized'); END IF;
  FOR answer IN SELECT value FROM jsonb_array_elements(iv.answers) LOOP
   IF jsonb_typeof(answer)<>'object' THEN RETURN jsonb_build_object('omitted','invalid'); END IF;
   IF (SELECT count(*) FROM jsonb_object_keys(answer))<>3 OR NOT answer ?& ARRAY['q','note','quote'] OR jsonb_typeof(answer->'q') IS DISTINCT FROM 'string' OR jsonb_typeof(answer->'note') IS DISTINCT FROM 'string' OR jsonb_typeof(answer->'quote') IS DISTINCT FROM 'string' THEN RETURN jsonb_build_object('omitted','invalid'); END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM unnest(iv.tags) t WHERE t IS NULL OR t NOT IN ('has problem','current workaround','would use','would pay','gave referral')) THEN RETURN jsonb_build_object('omitted','invalid'); END IF;
  body:=jsonb_build_object('answers',iv.answers,'tags',iv.tags); created:=iv.created_at; max_bytes:=12000;
  IF iv.contact_id IS NOT NULL THEN SELECT jsonb_build_object('recordId',iv.contact_id,'consentRevision',revision) INTO linked FROM public.processing_consents WHERE project_id=p_project AND target_kind='contact' AND target_id=iv.contact_id; END IF;
 ELSIF p_type='contact' THEN
  SELECT jsonb_build_object('relation',relation,'why',why,'source',source,'stage',stage),created_at INTO body,created FROM public.contacts WHERE id=p_id AND project_id=p_project AND user_id=p_actor; max_bytes:=2000;
 ELSIF p_type='learning' THEN
  SELECT jsonb_build_object('title',r.title,'body',r.body,'data',r.data,'kind',r.kind),r.created_at INTO body,created FROM public.learnings r WHERE r.id=p_id AND r.project_id=p_project AND r.user_id=p_actor; max_bytes:=6000;
 ELSE RETURN NULL; END IF;
 IF body IS NULL OR octet_length(body::text)>max_bytes THEN RETURN jsonb_build_object('omitted','oversized'); END IF;
 content_hash:=encode(sha256(convert_to(jsonb_build_object('content',body,'linkedContact',linked)::text,'UTF8')),'hex');
 RETURN jsonb_build_object('type',p_type,'recordId',p_id,'sourceId','src_'||encode(sha256(convert_to(p_project::text||':'||p_type||':'||p_id::text||':'||content_hash,'UTF8')),'hex'),'contentHash',content_hash,'consentRevision',consent_revision,'linkedContact',linked,'createdAt',created,'content',body);
END $$;
REVOKE ALL ON FUNCTION firstten_private.ai_source_record(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION firstten_private.ai_source_identity(source jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT source-'content'-'createdAt' $$;
REVOKE ALL ON FUNCTION firstten_private.ai_source_identity(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_ai_processing_context_v2(p_project_id uuid,p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); project_source jsonb; source jsonb; sources jsonb:='[]'; omitted jsonb:='{"permission":0,"oversized":0,"invalid":0,"candidateLimit":0}'; row record; selected integer; max_count integer; reason text; total bigint;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor) THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('questions','synthesis','stage2','stage3') THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND user_id=actor AND archived_at IS NULL) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 project_source:=firstten_private.ai_source_record(actor,p_project_id,'project',p_project_id);
 IF project_source IS NULL THEN RETURN jsonb_build_object('ok',false,'code','PROCESSING_PERMISSION_REQUIRED'); END IF;
 IF project_source ? 'omitted' THEN RETURN jsonb_build_object('ok',false,'code','PROJECT_CONTEXT_LIMIT'); END IF;
 IF p_kind<>'questions' THEN
  SELECT (SELECT count(*) FROM public.contacts WHERE project_id=p_project_id AND user_id=actor)+(SELECT count(*) FROM public.interviews WHERE project_id=p_project_id AND user_id=actor)+(SELECT count(*) FROM public.learnings WHERE project_id=p_project_id AND user_id=actor) INTO total;
  IF total>500 THEN RETURN jsonb_build_object('ok',false,'code','SOURCE_COUNT_LIMIT'); END IF;
  FOR row IN SELECT 'interview'::text AS type,id,created_at FROM public.interviews WHERE project_id=p_project_id AND user_id=actor AND completed
   UNION ALL SELECT 'contact',id,created_at FROM public.contacts WHERE project_id=p_project_id AND user_id=actor
   UNION ALL SELECT 'learning',id,created_at FROM public.learnings WHERE project_id=p_project_id AND user_id=actor AND accepted
   ORDER BY type,created_at DESC,id LOOP
   -- Contacts remain a dependency of learning eligibility even when not requested as provider context.
   IF (row.type='contact' AND p_kind<>'stage2') OR (row.type='learning' AND p_kind='synthesis') THEN CONTINUE; END IF;
   source:=firstten_private.ai_source_record(actor,p_project_id,row.type,row.id);
   IF source IS NULL THEN reason:='permission';
   ELSIF source ? 'omitted' THEN reason:=source->>'omitted';
   ELSE
    SELECT count(*) INTO selected FROM jsonb_array_elements(sources) s WHERE s->>'type'=row.type;
    max_count:=CASE WHEN row.type='learning' THEN 16 ELSE 32 END;
    IF selected>=max_count THEN reason:='candidateLimit'; ELSE sources:=sources||jsonb_build_array(source); CONTINUE; END IF;
   END IF;
   omitted:=jsonb_set(omitted,ARRAY[reason],to_jsonb((omitted->>reason)::integer+1));
  END LOOP;
 END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('version',2,'projectId',p_project_id,'project',project_source,'sources',sources,'omissions',omitted));
END $$;
REVOKE ALL ON FUNCTION public.get_ai_processing_context_v2(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_processing_context_v2(uuid,text) TO authenticated;

CREATE TABLE firstten_private.ai_context_claims (
 operation_id uuid PRIMARY KEY REFERENCES firstten_private.ai_usage_operations(operation_id),user_id uuid NOT NULL,project_id uuid NOT NULL,
 manifest jsonb NOT NULL CHECK(octet_length(manifest::text)<=40000),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE firstten_private.ai_context_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.ai_context_claims FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ai_context_claims_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON firstten_private.ai_context_claims FOR EACH STATEMENT EXECUTE FUNCTION firstten_private.deny_admin_audit_change();
CREATE FUNCTION public.claim_ai_usage_with_context(p_operation_id uuid,p_attempt_id uuid,p_manifest jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o firstten_private.ai_usage_operations; item jsonb; live jsonb; receipt jsonb; total bigint; seen text[]:='{}'; t text; id uuid; project_count integer:=0;
BEGIN
 PERFORM 1 FROM firstten_private.ai_usage_global_policy WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT o FROM firstten_private.ai_usage_operations WHERE operation_id=p_operation_id FOR UPDATE;
 IF o.state<>'reserved' THEN RETURN firstten_private.ai_usage_receipt(o)||jsonb_build_object('dispatch',false); END IF;
 IF p_manifest IS NULL OR jsonb_typeof(p_manifest)<>'object' OR octet_length(p_manifest::text)>40000 OR (SELECT count(*) FROM jsonb_object_keys(p_manifest))<>4 OR NOT p_manifest ?& ARRAY['version','contextHash','sources','omissions'] OR jsonb_typeof(p_manifest->'version') IS DISTINCT FROM 'number' OR jsonb_typeof(p_manifest->'contextHash') IS DISTINCT FROM 'string' OR p_manifest->>'version' IS DISTINCT FROM '2' OR p_manifest->>'contextHash' IS DISTINCT FROM o.context_sha256 THEN RAISE EXCEPTION 'Invalid context binding' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_manifest->'sources')<>'array' THEN RAISE EXCEPTION 'Invalid source manifest' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_manifest->'sources') NOT BETWEEN 1 AND 49 OR jsonb_typeof(p_manifest->'omissions')<>'object' THEN RAISE EXCEPTION 'Invalid source manifest' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_manifest->'omissions'))<>5 OR NOT (p_manifest->'omissions') ?& ARRAY['permission','oversized','invalid','candidateLimit','budget']
 OR EXISTS(SELECT 1 FROM jsonb_each(p_manifest->'omissions') kv WHERE jsonb_typeof(kv.value)<>'number' OR (kv.value#>>'{}') !~ '^[0-9]{1,3}$' OR (kv.value#>>'{}')::integer>500) THEN RAISE EXCEPTION 'Invalid omission metadata' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM auth.users u WHERE u.id=o.user_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.projects p WHERE p.id=o.project_id AND p.user_id=o.user_id AND p.archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner unavailable' USING ERRCODE='42501'; END IF;
 IF o.kind<>'questions' THEN
  SELECT (SELECT count(*) FROM public.contacts WHERE project_id=o.project_id AND user_id=o.user_id)+(SELECT count(*) FROM public.interviews WHERE project_id=o.project_id AND user_id=o.user_id)+(SELECT count(*) FROM public.learnings WHERE project_id=o.project_id AND user_id=o.user_id) INTO total;
  IF total>500 THEN RAISE EXCEPTION 'Source count limit' USING ERRCODE='54000'; END IF;
  -- Lock ALL potential conservative-learning dependencies, including currently unselected records.
  -- Ordinary FK child inserts wait on the locked project; direct legacy row edits wait on these locks.
  PERFORM r.id FROM public.contacts r WHERE r.project_id=o.project_id AND r.user_id=o.user_id ORDER BY r.id FOR SHARE;
  PERFORM r.id FROM public.interviews r WHERE r.project_id=o.project_id AND r.user_id=o.user_id ORDER BY r.id FOR SHARE;
  PERFORM r.id FROM public.learnings r WHERE r.project_id=o.project_id AND r.user_id=o.user_id ORDER BY r.id FOR SHARE;
 END IF;
 PERFORM c.target_id FROM public.processing_consents c WHERE c.project_id=o.project_id AND c.user_id=o.user_id AND
 ((c.target_kind='project' AND c.target_id=o.project_id) OR (o.kind<>'questions' AND (
 (c.target_kind='contact' AND EXISTS(SELECT 1 FROM public.contacts r WHERE r.id=c.target_id AND r.project_id=o.project_id AND r.user_id=o.user_id))
 OR (c.target_kind='interview' AND EXISTS(SELECT 1 FROM public.interviews r WHERE r.id=c.target_id AND r.project_id=o.project_id AND r.user_id=o.user_id))
 OR (c.target_kind='learning' AND EXISTS(SELECT 1 FROM public.learnings r WHERE r.id=c.target_id AND r.project_id=o.project_id AND r.user_id=o.user_id)))))
 ORDER BY c.target_kind,c.target_id FOR SHARE;
 FOR item IN SELECT value FROM jsonb_array_elements(p_manifest->'sources') LOOP
  IF jsonb_typeof(item)<>'object' THEN RAISE EXCEPTION 'Invalid source manifest' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(item))<>6 OR NOT item ?& ARRAY['type','recordId','sourceId','contentHash','consentRevision','linkedContact'] THEN RAISE EXCEPTION 'Invalid source manifest' USING ERRCODE='22023'; END IF;
  t:=item->>'type'; id:=(item->>'recordId')::uuid;
  IF t IS NULL OR t NOT IN ('project','interview','contact','learning') OR (o.kind='questions' AND t<>'project') OR (o.kind='synthesis' AND t NOT IN ('project','interview')) OR (o.kind='stage3' AND t='contact') OR t||':'||id::text=ANY(seen) THEN RAISE EXCEPTION 'Invalid source type or scope' USING ERRCODE='22023'; END IF;
  seen:=array_append(seen,t||':'||id::text);
  IF t='project' THEN IF id<>o.project_id THEN RAISE EXCEPTION 'Mandatory project context missing' USING ERRCODE='42501'; END IF; project_count:=project_count+1; END IF;
  live:=firstten_private.ai_source_record(o.user_id,o.project_id,t,id);
  IF live IS NULL OR live ? 'omitted' OR firstten_private.ai_source_identity(live)<>item THEN RAISE EXCEPTION 'Context permission or version changed' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF project_count<>1 THEN RAISE EXCEPTION 'Mandatory project context missing' USING ERRCODE='42501'; END IF;
 receipt:=public.claim_ai_usage(p_operation_id,p_attempt_id);
 IF receipt->>'dispatch'='true' THEN INSERT INTO firstten_private.ai_context_claims(operation_id,user_id,project_id,manifest) VALUES(o.operation_id,o.user_id,o.project_id,p_manifest); END IF;
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.claim_ai_usage_with_context(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_ai_usage_with_context(uuid,uuid,jsonb) TO service_role;

-- Metadata v1 stays valid. A v2 success additionally requires a settled, source-fenced operation.
ALTER TABLE firstten_private.ai_generation_provenance DROP CONSTRAINT ai_generation_provenance_prompt_version_check;
ALTER TABLE firstten_private.ai_generation_provenance DROP CONSTRAINT ai_generation_provenance_schema_version_check;
ALTER TABLE firstten_private.ai_generation_provenance ADD CONSTRAINT ai_generation_contract_versions CHECK(prompt_version IN (1,2) AND schema_version=prompt_version);
CREATE TABLE firstten_private.ai_generation_grounding (
 request_id uuid PRIMARY KEY REFERENCES firstten_private.ai_generation_provenance(request_id) ON DELETE CASCADE,
 operation_id uuid NOT NULL UNIQUE REFERENCES firstten_private.ai_context_claims(operation_id),
 grounding jsonb NOT NULL CHECK(octet_length(grounding::text)<=30000)
);
ALTER TABLE firstten_private.ai_generation_grounding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.ai_generation_grounding FROM PUBLIC,anon,authenticated,service_role;
-- Keep the public v1 API strict; the common metadata insert is private to these wrappers.
ALTER FUNCTION public.record_ai_generation(jsonb) RENAME TO insert_ai_generation_metadata;
ALTER FUNCTION public.insert_ai_generation_metadata(jsonb) SET SCHEMA firstten_private;
REVOKE ALL ON FUNCTION firstten_private.insert_ai_generation_metadata(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.record_ai_generation(p_record jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_record->>'prompt_version' IS DISTINCT FROM '1' OR p_record->>'schema_version' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Versioned source receipt required' USING ERRCODE='23514'; END IF;
 RETURN firstten_private.insert_ai_generation_metadata(p_record);
END $$;
REVOKE ALL ON FUNCTION public.record_ai_generation(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_ai_generation(jsonb) TO service_role;
CREATE FUNCTION public.record_ai_generation_v2(p_record jsonb,p_operation_id uuid,p_grounding jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op firstten_private.ai_usage_operations; receipt uuid; item jsonb; ids text[]; path text; seen text[]:='{}';
BEGIN
 SELECT * INTO STRICT op FROM firstten_private.ai_usage_operations WHERE operation_id=p_operation_id;
 IF op.state<>'settled' OR NOT op.result_allowed OR p_record->>'user_id' IS DISTINCT FROM op.user_id::text OR p_record->>'project_id' IS DISTINCT FROM op.project_id::text OR p_record->>'kind' IS DISTINCT FROM op.kind OR p_record->>'provider_generation_id' IS DISTINCT FROM op.generation_id OR p_record->>'prompt_version' IS DISTINCT FROM '2' OR p_record->>'schema_version' IS DISTINCT FROM '2'
 OR p_record->>'requested_model' IS DISTINCT FROM op.route->>'model' OR p_record->>'actual_model' IS DISTINCT FROM op.settlement->>'model' OR p_record->>'actual_provider' IS DISTINCT FROM op.settlement->>'provider' OR p_record->'cost_usd' IS DISTINCT FROM op.settlement->'costUsd' OR p_record->'prompt_tokens' IS DISTINCT FROM op.settlement->'promptTokens' OR p_record->'completion_tokens' IS DISTINCT FROM op.settlement->'completionTokens' OR p_record->>'attempts' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Generation context unavailable' USING ERRCODE='42501'; END IF;
 SELECT array_agg(s->>'sourceId') INTO ids FROM firstten_private.ai_context_claims c CROSS JOIN LATERAL jsonb_array_elements(c.manifest->'sources') s WHERE c.operation_id=op.operation_id;
 IF ids IS NULL OR p_grounding IS NULL OR jsonb_typeof(p_grounding)<>'array' OR octet_length(p_grounding::text)>30000 THEN RAISE EXCEPTION 'Invalid grounding manifest' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_grounding) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid grounding manifest' USING ERRCODE='22023'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_grounding) LOOP
  IF jsonb_typeof(item)<>'object' THEN RAISE EXCEPTION 'Invalid grounding manifest' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(item))<>3 OR NOT item ?& ARRAY['path','category','sourceIds'] OR jsonb_typeof(item->'path')<>'string' OR (item->>'path') !~ '^(/[a-z_]+|/[0-9]+){1,4}$' OR length(item->>'path')>120 OR jsonb_typeof(item->'category')<>'string' OR item->>'category' NOT IN ('observation','inference','proposal','missing_evidence') OR jsonb_typeof(item->'sourceIds')<>'array' THEN RAISE EXCEPTION 'Invalid grounding manifest' USING ERRCODE='22023'; END IF;
  path:=item->>'path'; IF path=ANY(seen) THEN RAISE EXCEPTION 'Duplicate grounding path' USING ERRCODE='22023'; END IF; seen:=array_append(seen,path);
  IF (item->>'category'='observation' AND jsonb_array_length(item->'sourceIds')<>1) OR (item->>'category'='inference' AND jsonb_array_length(item->'sourceIds')<1) OR (item->>'category'='missing_evidence' AND jsonb_array_length(item->'sourceIds')<>0) OR jsonb_array_length(item->'sourceIds')>8 OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'sourceIds') s WHERE jsonb_typeof(s)<>'string' OR NOT(s#>>'{}'=ANY(ids))) THEN RAISE EXCEPTION 'Unknown source reference' USING ERRCODE='22023'; END IF;
 END LOOP;
 receipt:=firstten_private.insert_ai_generation_metadata(p_record);
 INSERT INTO firstten_private.ai_generation_grounding(request_id,operation_id,grounding) VALUES(receipt,p_operation_id,p_grounding);
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.record_ai_generation_v2(jsonb,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_ai_generation_v2(jsonb,uuid,jsonb) TO service_role;
COMMENT ON TABLE firstten_private.ai_context_claims IS 'Content-free dispatch source/consent version receipts. No prompts, excerpts or generated text. Accounting-linked historical identifiers survive project deletion; retention/purge policy remains PRV-002.';
COMMENT ON TABLE firstten_private.ai_generation_grounding IS 'Server-only source IDs and typed output paths. No excerpts, source text or drafts. Exact quote matching occurs in the versioned server validator before any result is returned.';
COMMIT;
