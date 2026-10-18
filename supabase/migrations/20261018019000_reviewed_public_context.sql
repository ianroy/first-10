-- CTX-001 first slice: private public-source previews and reviewed excerpts. No AI adapter.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE firstten_private.public_context_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 runtime_review_sha256 text CHECK(runtime_review_sha256 ~ '^[a-f0-9]{64}$'), operator_reference text NOT NULL DEFAULT '' CHECK(length(operator_reference)<=120),
 CHECK(NOT enabled OR (runtime_review_sha256 IS NOT NULL AND length(operator_reference)>0))
);
INSERT INTO firstten_private.public_context_policy(singleton) VALUES(true);
CREATE TABLE firstten_private.public_context_operations (
 id uuid PRIMARY KEY,user_id uuid NOT NULL,project_id uuid NOT NULL,request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 kind text NOT NULL CHECK(kind IN ('website','github')),attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','retrieved','failed','expired')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),lease_until timestamptz NOT NULL DEFAULT clock_timestamp()+interval '30 seconds',
 failure_code text CHECK(failure_code IN ('UNAVAILABLE','UNSAFE_SOURCE')),
 FOREIGN KEY(project_id,user_id) REFERENCES public.projects(id,user_id) ON DELETE CASCADE,
 UNIQUE(id,user_id,project_id)
);
CREATE INDEX public_context_actor_time ON firstten_private.public_context_operations(user_id,started_at DESC);
CREATE TABLE firstten_private.public_context_previews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation_id uuid NOT NULL,user_id uuid NOT NULL,project_id uuid NOT NULL,
 source jsonb NOT NULL CHECK(octet_length(source::text)<=30000),retrieved_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes',
 FOREIGN KEY(operation_id,user_id,project_id) REFERENCES firstten_private.public_context_operations(id,user_id,project_id) ON DELETE CASCADE,
 UNIQUE(id,user_id,project_id)
);
CREATE TABLE firstten_private.reviewed_public_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),preview_id uuid NOT NULL UNIQUE,user_id uuid NOT NULL,project_id uuid NOT NULL,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 120),excerpt text NOT NULL CHECK(length(excerpt) BETWEEN 1 AND 6000 AND octet_length(excerpt)<=24576),
 excerpt_sha256 text NOT NULL CHECK(excerpt_sha256=encode(sha256(convert_to(excerpt,'UTF8')),'hex')),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','withdrawn')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991 AND (status='withdrawn' OR revision<9007199254740991)),
 storage_permission text NOT NULL DEFAULT 'own_or_permitted' CHECK(storage_permission='own_or_permitted'),
 ai_permission text NOT NULL DEFAULT 'unknown' CHECK(ai_permission='unknown'),sharing_permission text NOT NULL DEFAULT 'unknown' CHECK(sharing_permission='unknown'),
 FOREIGN KEY(preview_id,user_id,project_id) REFERENCES firstten_private.public_context_previews(id,user_id,project_id) ON DELETE CASCADE
);
ALTER TABLE firstten_private.public_context_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.public_context_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.public_context_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.reviewed_public_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.public_context_policy,firstten_private.public_context_operations,firstten_private.public_context_previews,firstten_private.reviewed_public_sources FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION firstten_private.public_context_url_valid(v text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT v IS NOT NULL AND length(v)<=2048 AND v ~ '^https://[a-z0-9.-]+(/[!-~]*)?$' AND v !~ '[?#%@\\]' AND split_part(substr(v,9),'/',1) !~ '^[0-9.]+$' AND split_part(substr(v,9),'/',1) ~ '\.' AND split_part(substr(v,9),'/',1) !~ '(^|\.)(localhost|local|internal|lan|home|invalid|test|example|onion)$'
$$;
REVOKE ALL ON FUNCTION firstten_private.public_context_url_valid(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION firstten_private.public_context_source_valid(v jsonb,kind text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE k text;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)<>'object' THEN RETURN false; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(v))<>10 OR NOT v ?& ARRAY['url','title','format','contentHash','previewHash','text','bytes','commitSha','path','blobSha'] THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['url','title','format','contentHash','previewHash','text'] LOOP IF jsonb_typeof(v->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF; END LOOP;
 FOREACH k IN ARRAY ARRAY['commitSha','path','blobSha'] LOOP IF jsonb_typeof(v->k) NOT IN ('string','null') THEN RETURN false; END IF; END LOOP;
 IF NOT firstten_private.public_context_url_valid(v->>'url') OR length(v->>'title')>200 OR length(v->>'text')<1 OR octet_length(v->>'text')>24576 OR octet_length(v::text)>30000 OR (v->>'contentHash') !~ '^[a-f0-9]{64}$' OR v->>'previewHash' IS DISTINCT FROM encode(sha256(convert_to(v->>'text','UTF8')),'hex') THEN RETURN false; END IF;
 IF jsonb_typeof(v->'bytes') IS DISTINCT FROM 'number' OR (v->>'bytes') !~ '^[0-9]{1,6}$' THEN RETURN false; END IF;
 IF (v->>'bytes')::integer NOT BETWEEN 1 AND 262144 OR v::text ~* '-----BEGIN [A-Z ]*PRIVATE KEY-----|(sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9._-]{16,}' THEN RETURN false; END IF;
 IF kind='website' THEN RETURN v->>'format' IN ('html_static_text','plain_text') AND v->'commitSha'='null' AND v->'path'='null' AND v->'blobSha'='null'; END IF;
 IF kind<>'github' OR jsonb_typeof(v->'commitSha') IS DISTINCT FROM 'string' OR (v->>'commitSha') !~ '^[a-f0-9]{40}$' OR v->>'url' NOT LIKE 'https://github.com/%' THEN RETURN false; END IF;
 IF v->>'format'='github_metadata' THEN RETURN (v->>'url') ~ '^https://github.com/[A-Za-z0-9-]{1,39}/[A-Za-z0-9_.-]{1,100}$' AND v->'path'='null' AND v->'blobSha'='null'; END IF;
 RETURN v->>'format'='github_file' AND (v->>'blobSha') ~ '^[a-f0-9]{40}$' AND length(v->>'path') BETWEEN 1 AND 200 AND (v->>'path') ~ '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)?$' AND (v->>'path') !~ '(^|/)\.' AND right(v->>'url',length('/blob/'||(v->>'commitSha')||'/'||(v->>'path')))='/blob/'||(v->>'commitSha')||'/'||(v->>'path');
END $$;
REVOKE ALL ON FUNCTION firstten_private.public_context_source_valid(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.begin_public_context_retrieval(p_actor uuid,p_project_id uuid,p_operation_id uuid,p_kind text,p_request_sha256 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o firstten_private.public_context_operations; now_at timestamptz:=clock_timestamp();
BEGIN
 PERFORM 1 FROM firstten_private.public_context_policy WHERE singleton AND enabled FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','DISABLED'); END IF;
 PERFORM 1 FROM auth.users u WHERE u.id=p_actor FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 PERFORM 1 FROM public.projects p WHERE p.id=p_project_id AND p.user_id=p_actor AND p.archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF p_operation_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('website','github') OR p_request_sha256 IS NULL OR p_request_sha256 !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 SELECT * INTO o FROM firstten_private.public_context_operations WHERE id=p_operation_id FOR UPDATE;
 IF FOUND THEN
  IF o.user_id<>p_actor OR o.project_id<>p_project_id OR o.kind<>p_kind OR o.request_sha256<>p_request_sha256 THEN RETURN jsonb_build_object('ok',false,'code','CHANGED'); END IF;
  RETURN jsonb_build_object('ok',false,'code','ALREADY_STARTED');
 END IF;
 now_at:=clock_timestamp();
 UPDATE firstten_private.public_context_operations SET state='expired' WHERE state='pending' AND lease_until<=now_at;
 IF (SELECT count(*) FROM firstten_private.public_context_operations WHERE state='pending')>=10 OR EXISTS(SELECT 1 FROM firstten_private.public_context_operations WHERE user_id=p_actor AND state='pending') OR (SELECT count(*) FROM firstten_private.public_context_operations WHERE user_id=p_actor AND started_at>now_at-interval '1 minute')>=3 OR (SELECT count(*) FROM firstten_private.public_context_operations WHERE user_id=p_actor AND started_at>now_at-interval '24 hours')>=20 THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMIT'); END IF;
 INSERT INTO firstten_private.public_context_operations(id,user_id,project_id,kind,request_sha256,started_at,lease_until) VALUES(p_operation_id,p_actor,p_project_id,p_kind,p_request_sha256,now_at,now_at+interval '30 seconds') RETURNING * INTO o;
 RETURN jsonb_build_object('ok',true,'attemptId',o.attempt_id,'leaseUntil',o.lease_until);
END $$;
REVOKE ALL ON FUNCTION public.begin_public_context_retrieval(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_public_context_retrieval(uuid,uuid,uuid,text,text) TO service_role;
CREATE FUNCTION public.complete_public_context_retrieval(p_operation_id uuid,p_attempt_id uuid,p_sources jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o firstten_private.public_context_operations; item jsonb;
BEGIN
 PERFORM 1 FROM firstten_private.public_context_policy WHERE singleton AND enabled FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','DISABLED'); END IF;
 SELECT * INTO o FROM firstten_private.public_context_operations WHERE id=p_operation_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 PERFORM 1 FROM auth.users u WHERE u.id=o.user_id FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 PERFORM 1 FROM public.projects p WHERE p.id=o.project_id AND p.user_id=o.user_id AND p.archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT * INTO o FROM firstten_private.public_context_operations WHERE id=p_operation_id FOR UPDATE;
 IF o.attempt_id IS DISTINCT FROM p_attempt_id OR o.state<>'pending' OR o.lease_until<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'code','EXPIRED'); END IF;
 IF p_sources IS NULL OR jsonb_typeof(p_sources) IS DISTINCT FROM 'array' OR octet_length(p_sources::text)>120000 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 IF jsonb_array_length(p_sources) NOT BETWEEN 1 AND 4 OR (o.kind='website' AND jsonb_array_length(p_sources)<>1) OR (o.kind='github' AND (jsonb_array_length(p_sources)<2 OR p_sources->0->>'format' IS DISTINCT FROM 'github_metadata')) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
  IF NOT coalesce(firstten_private.public_context_source_valid(item,o.kind),false) THEN RETURN jsonb_build_object('ok',false,'code','UNSAFE_SOURCE'); END IF;
 END LOOP;
 IF o.kind='github' AND ((SELECT count(*) FROM jsonb_array_elements(p_sources) s WHERE s->>'format'='github_metadata')<>1 OR (SELECT count(DISTINCT s->>'commitSha') FROM jsonb_array_elements(p_sources) s)<>1 OR (SELECT count(DISTINCT s->>'url') FROM jsonb_array_elements(p_sources) s)<>jsonb_array_length(p_sources)) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 IF o.kind='github' AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_sources) s WHERE s->>'format'='github_file' AND s->>'url'<>(p_sources->0->>'url')||'/blob/'||(s->>'commitSha')||'/'||(s->>'path')) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_sources) LOOP INSERT INTO firstten_private.public_context_previews(operation_id,user_id,project_id,source) VALUES(o.id,o.user_id,o.project_id,item); END LOOP;
 UPDATE firstten_private.public_context_operations SET state='retrieved' WHERE id=o.id;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.complete_public_context_retrieval(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_public_context_retrieval(uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION public.fail_public_context_retrieval(p_operation_id uuid,p_attempt_id uuid,p_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM firstten_private.public_context_policy WHERE singleton FOR UPDATE;
 IF p_code IS NULL OR p_code NOT IN ('UNAVAILABLE','UNSAFE_SOURCE') THEN RAISE EXCEPTION 'Invalid retrieval outcome' USING ERRCODE='22023'; END IF;
 UPDATE firstten_private.public_context_operations SET state=CASE WHEN lease_until<=clock_timestamp() THEN 'expired' ELSE 'failed' END,failure_code=p_code WHERE id=p_operation_id AND attempt_id=p_attempt_id AND state='pending';
END $$;
REVOKE ALL ON FUNCTION public.fail_public_context_retrieval(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fail_public_context_retrieval(uuid,uuid,text) TO service_role;
CREATE FUNCTION firstten_private.reviewed_public_source_view(r firstten_private.reviewed_public_sources,s jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',r.id,'previewId',r.preview_id,'projectId',r.project_id,'reviewedAt',r.reviewed_at,'revision',r.revision,'status',r.status)||CASE WHEN r.status='active' THEN jsonb_build_object('label',r.label,'storagePermission',r.storage_permission,'aiPermission',r.ai_permission,'sharingPermission',r.sharing_permission,'excerpt',r.excerpt,'excerptHash',r.excerpt_sha256,'source',s-'text') ELSE '{}'::jsonb END
$$;
REVOKE ALL ON FUNCTION firstten_private.reviewed_public_source_view(firstten_private.reviewed_public_sources,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.list_public_context(p_project_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); previews jsonb; reviewed jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.projects p ON p.user_id=u.id WHERE p.id=p_project_id AND u.id=actor) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'projectId',p.project_id,'operationId',p.operation_id,'previewPermission',true,'kind',o.kind,'retrievedAt',p.retrieved_at,'expiresAt',p.expires_at,'source',p.source) ORDER BY p.retrieved_at DESC,p.id),'[]') INTO previews FROM (SELECT * FROM firstten_private.public_context_previews r WHERE r.project_id=p_project_id AND r.user_id=actor AND r.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM firstten_private.reviewed_public_sources s WHERE s.preview_id=r.id) ORDER BY r.retrieved_at DESC,r.id LIMIT 40) p JOIN firstten_private.public_context_operations o ON o.id=p.operation_id;
 SELECT coalesce(jsonb_agg(firstten_private.reviewed_public_source_view(r,p.source) ORDER BY r.reviewed_at DESC,r.id),'[]') INTO reviewed FROM firstten_private.reviewed_public_sources r JOIN firstten_private.public_context_previews p ON p.id=r.preview_id WHERE r.project_id=p_project_id AND r.user_id=actor;
 RETURN jsonb_build_object('ok',true,'previews',previews,'reviewed',reviewed);
END $$;
REVOKE ALL ON FUNCTION public.list_public_context(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_public_context(uuid) TO authenticated;
CREATE FUNCTION public.review_public_context(p_project_id uuid,p_preview_id uuid,p_expected_hash text,p_label text,p_excerpt text,p_storage_permission boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); preview firstten_private.public_context_previews; reviewed firstten_private.reviewed_public_sources;
BEGIN
 PERFORM 1 FROM auth.users u WHERE u.id=actor FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 PERFORM 1 FROM public.projects p JOIN auth.users u ON u.id=p.user_id WHERE p.id=p_project_id AND p.user_id=actor AND p.archived_at IS NULL FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF p_storage_permission IS DISTINCT FROM true OR p_label IS NULL OR length(p_label) NOT BETWEEN 1 AND 120 OR p_label<>btrim(p_label) OR p_excerpt IS NULL OR length(p_excerpt) NOT BETWEEN 1 AND 6000 OR octet_length(p_excerpt)>24576 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 IF (p_label||p_excerpt) ~* '-----BEGIN [A-Z ]*PRIVATE KEY-----|(sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9._-]{16,}' THEN RETURN jsonb_build_object('ok',false,'code','UNSAFE_SOURCE'); END IF;
 SELECT * INTO preview FROM firstten_private.public_context_previews WHERE id=p_preview_id AND project_id=p_project_id AND user_id=actor FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF p_expected_hash IS DISTINCT FROM preview.source->>'previewHash' THEN RETURN jsonb_build_object('ok',false,'code','CHANGED'); END IF;
 IF strpos(preview.source->>'text',p_excerpt)=0 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 SELECT * INTO reviewed FROM firstten_private.reviewed_public_sources WHERE preview_id=p_preview_id;
 IF FOUND THEN
  IF reviewed.status<>'active' OR reviewed.label<>p_label OR reviewed.excerpt<>p_excerpt THEN RETURN jsonb_build_object('ok',false,'code','CHANGED'); END IF;
  RETURN jsonb_build_object('ok',true,'source',firstten_private.reviewed_public_source_view(reviewed,preview.source));
 END IF;
 IF preview.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'code','EXPIRED'); END IF;
 IF (SELECT count(*) FROM firstten_private.reviewed_public_sources WHERE project_id=p_project_id)>=20 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY'); END IF;
 INSERT INTO firstten_private.reviewed_public_sources(preview_id,user_id,project_id,label,excerpt,excerpt_sha256) VALUES(preview.id,actor,p_project_id,p_label,p_excerpt,encode(sha256(convert_to(p_excerpt,'UTF8')),'hex')) RETURNING * INTO reviewed;
 RETURN jsonb_build_object('ok',true,'source',firstten_private.reviewed_public_source_view(reviewed,preview.source));
END $$;
REVOKE ALL ON FUNCTION public.review_public_context(uuid,uuid,text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.review_public_context(uuid,uuid,text,text,text,boolean) TO authenticated;
CREATE FUNCTION public.withdraw_public_context(p_project_id uuid,p_source_id uuid,p_expected_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); r firstten_private.reviewed_public_sources;
BEGIN
 PERFORM 1 FROM auth.users u WHERE u.id=actor FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 PERFORM 1 FROM public.projects p JOIN auth.users u ON u.id=p.user_id WHERE p.id=p_project_id AND p.user_id=actor FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT * INTO r FROM firstten_private.reviewed_public_sources WHERE id=p_source_id AND project_id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF r.revision IS DISTINCT FROM p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','CHANGED'); END IF;
 IF r.status='active' THEN UPDATE firstten_private.reviewed_public_sources SET status='withdrawn',revision=revision+1 WHERE id=r.id RETURNING * INTO r; END IF;
 RETURN jsonb_build_object('ok',true,'source',firstten_private.reviewed_public_source_view(r,NULL));
END $$;
REVOKE ALL ON FUNCTION public.withdraw_public_context(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_public_context(uuid,uuid,bigint) TO authenticated;
COMMENT ON TABLE firstten_private.public_context_previews IS 'Owner-private temporary access previews. Expiry hides access, not a claim of physical deletion; PRV-002 owns retention/purge. No source HTML, cookies or raw network errors are retained.';
COMMENT ON TABLE firstten_private.reviewed_public_sources IS 'Owner-reviewed immutable public-source excerpts, separate from customer evidence. No provider adapter in CTX-001 first slice. AI/sharing remain unknown. Withdrawal hides current contents, retained history is not erased.';
COMMIT;
