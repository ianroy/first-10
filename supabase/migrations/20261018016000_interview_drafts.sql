-- Private resumable drafts, separate from completed research and all AI/shared projections.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION firstten_private.valid_interview_draft(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF d IS NULL OR jsonb_typeof(d)<>'object' OR octet_length(d::text)>70000 OR (SELECT count(*) FROM jsonb_object_keys(d))<>6 OR NOT d ?& ARRAY['schemaVersion','policyVersion','answers','tags','choices','currentQuestion'] OR d->'schemaVersion'<>'1'::jsonb OR d->'policyVersion'<>'1'::jsonb THEN RETURN false;END IF;
 IF jsonb_typeof(d->'answers')<>'array' OR jsonb_array_length(d->'answers') NOT BETWEEN 1 AND 30 OR octet_length((d->'answers')::text)>60000 THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'answers')a WHERE jsonb_typeof(a)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(a))<>3 OR NOT a ?& ARRAY['q','note','quote'] OR jsonb_typeof(a->'q')<>'string' OR btrim(a->>'q')='' OR length(a->>'q')>2400 OR jsonb_typeof(a->'note')<>'string' OR length(a->>'note')>6000 OR jsonb_typeof(a->'quote')<>'string' OR length(a->>'quote')>2400) THEN RETURN false;END IF;
 IF jsonb_typeof(d->'tags')<>'array' OR jsonb_array_length(d->'tags')>10 OR EXISTS(SELECT 1 FROM jsonb_array_elements(d->'tags')t WHERE jsonb_typeof(t)<>'string' OR t#>>'{}' NOT IN ('has problem','current workaround','would use','would pay','gave referral')) THEN RETURN false;END IF;
 IF jsonb_typeof(d->'choices')<>'object' OR (SELECT count(*) FROM jsonb_object_keys(d->'choices'))<>3 OR NOT d->'choices' ?& ARRAY['noteStatus','aiStatus','sharingStatus'] OR EXISTS(SELECT 1 FROM jsonb_each(d->'choices')c WHERE jsonb_typeof(c.value)<>'string' OR c.value#>>'{}' NOT IN ('unknown','granted','declined','withdrawn')) THEN RETURN false;END IF;
 IF d#>>'{choices,noteStatus}'<>'granted' AND EXISTS(SELECT 1 FROM jsonb_array_elements(d->'answers')a WHERE a->>'note'<>'' OR a->>'quote'<>'') THEN RETURN false;END IF;
 IF jsonb_typeof(d->'currentQuestion')<>'number' OR (d->>'currentQuestion')::numeric<>trunc((d->>'currentQuestion')::numeric) OR (d->>'currentQuestion')::numeric NOT BETWEEN 0 AND jsonb_array_length(d->'answers') THEN RETURN false;END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE TABLE public.interview_drafts(
 id uuid PRIMARY KEY,user_id uuid NOT NULL,project_id uuid NOT NULL,contact_id uuid,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
 questions_snapshot jsonb NOT NULL,questions_origin_id uuid,
 document jsonb,create_hash text NOT NULL CHECK(length(create_hash)=64),last_mutation_id uuid,last_mutation_hash text,
 completion_request_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),completed_interview_id uuid,completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,user_id) REFERENCES public.projects(id,user_id) ON DELETE CASCADE,
 CHECK((status='active' AND document IS NOT NULL AND firstten_private.valid_interview_draft(document) AND completed_interview_id IS NULL AND completed_at IS NULL) OR (status='completed' AND document IS NULL AND completed_interview_id IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE TRIGGER interview_draft_private_identity BEFORE UPDATE ON public.interview_drafts FOR EACH ROW EXECUTE FUNCTION firstten_private.enforce_private_identity();
ALTER TABLE public.interview_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.interview_drafts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.interview_drafts TO authenticated;
CREATE POLICY owner_read ON public.interview_drafts FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE FUNCTION firstten_private.interview_draft_record(d public.interview_drafts) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',d.id,'projectId',d.project_id,'contactId',d.contact_id,'revision',d.revision,'status',d.status,'questions',d.questions_snapshot,'originId',d.questions_origin_id,'document',d.document,'createdAt',d.created_at,'savedAt',d.updated_at,'completedAt',d.completed_at,'interviewId',d.completed_interview_id)
$$;
CREATE FUNCTION public.list_interview_drafts(p_project_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND user_id=auth.uid()) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'drafts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'contactId',d.contact_id,'revision',d.revision,'savedAt',d.updated_at,'questionCount',jsonb_array_length(d.questions_snapshot),'answeredCount',(SELECT count(*) FROM jsonb_array_elements(d.document->'answers')a WHERE a->>'note'<>'' OR a->>'quote'<>'')) ORDER BY d.updated_at DESC,d.id),'[]') FROM public.interview_drafts d WHERE d.project_id=p_project_id AND d.user_id=auth.uid() AND d.status='active'));
END $$;
CREATE FUNCTION public.load_interview_draft(p_project_id uuid,p_draft_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE d public.interview_drafts%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND user_id=auth.uid()) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO d FROM public.interview_drafts WHERE id=p_draft_id AND project_id=p_project_id AND user_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'draft',firstten_private.interview_draft_record(d));
END $$;
CREATE FUNCTION public.create_interview_draft(p_project_id uuid,p_draft_id uuid,p_contact_id uuid,p_expected_questions jsonb,p_expected_origin_id uuid,p_note_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid();p public.projects%ROWTYPE;d public.interview_drafts%ROWTYPE;doc jsonb;hash text;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF p.archived_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','ARCHIVED');END IF;
 IF p_draft_id IS NULL OR p_note_status IS NULL OR p_note_status NOT IN ('unknown','granted') THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 hash:=encode(sha256(convert_to(jsonb_build_object('project',p_project_id,'contact',p_contact_id,'questions',p_expected_questions,'origin',p_expected_origin_id,'notes',p_note_status)::text,'UTF8')),'hex');
 SELECT * INTO d FROM public.interview_drafts WHERE id=p_draft_id;
 IF FOUND THEN
  IF d.user_id<>actor OR d.project_id<>p_project_id THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
  IF d.create_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
  RETURN jsonb_build_object('ok',true,'draft',firstten_private.interview_draft_record(d));
 END IF;
 IF p.questions IS DISTINCT FROM p_expected_questions OR p.questions_origin_id IS DISTINCT FROM p_expected_origin_id THEN RETURN jsonb_build_object('ok',false,'code','SOURCE_CHANGED');END IF;
 IF jsonb_typeof(p.questions) IS DISTINCT FROM 'array' OR jsonb_array_length(p.questions) NOT BETWEEN 1 AND 30 OR octet_length(p.questions::text)>45000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p.questions)q WHERE jsonb_typeof(q)<>'string' OR btrim(q#>>'{}')='' OR length(q#>>'{}')>2400) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 IF p_contact_id IS NOT NULL THEN PERFORM 1 FROM public.contacts WHERE id=p_contact_id AND project_id=p_project_id AND user_id=actor FOR KEY SHARE;IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','SOURCE_UNAVAILABLE');END IF;END IF;
 IF (SELECT count(*) FROM public.interview_drafts WHERE project_id=p_project_id AND user_id=actor AND status='active')>=100 THEN RETURN jsonb_build_object('ok',false,'code','LIMIT_REACHED');END IF;
 SELECT jsonb_build_object('schemaVersion',1,'policyVersion',1,'currentQuestion',0,'tags','[]'::jsonb,'choices',jsonb_build_object('noteStatus',p_note_status,'aiStatus','unknown','sharingStatus','unknown'),'answers',jsonb_agg(jsonb_build_object('q',q,'note','','quote','') ORDER BY n)) INTO doc FROM jsonb_array_elements(p.questions) WITH ORDINALITY AS x(q,n);
 INSERT INTO public.interview_drafts(id,user_id,project_id,contact_id,questions_snapshot,questions_origin_id,document,create_hash) VALUES(p_draft_id,actor,p_project_id,p_contact_id,p.questions,p.questions_origin_id,doc,hash) RETURNING * INTO d;
 RETURN jsonb_build_object('ok',true,'draft',firstten_private.interview_draft_record(d));
END $$;
CREATE FUNCTION public.save_interview_draft(p_project_id uuid,p_draft_id uuid,p_expected_revision bigint,p_mutation_id uuid,p_contact_id uuid,p_document jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid();d public.interview_drafts%ROWTYPE;archived timestamptz;hash text;questions jsonb;
BEGIN
 SELECT archived_at INTO archived FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF archived IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','ARCHIVED');END IF;
 SELECT * INTO d FROM public.interview_drafts WHERE id=p_draft_id AND user_id=actor AND project_id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF d.status='completed' THEN RETURN jsonb_build_object('ok',false,'code','ALREADY_COMPLETED');END IF;
 IF p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 1 AND 9007199254740991 OR p_mutation_id IS NULL OR NOT firstten_private.valid_interview_draft(p_document) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 hash:=encode(sha256(convert_to(jsonb_build_object('revision',p_expected_revision,'contact',p_contact_id,'document',p_document)::text,'UTF8')),'hex');
 IF d.last_mutation_id=p_mutation_id THEN
  IF d.last_mutation_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
  RETURN jsonb_build_object('ok',true,'draft',firstten_private.interview_draft_record(d));
 END IF;
 IF d.revision<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT','currentRevision',d.revision);END IF;
 -- Terminal revisions permit only privacy-reducing clearing; they can never re-enable notes.
 IF d.revision>=9007199254740991 AND NOT (p_document#>>'{choices,noteStatus}'='withdrawn' AND p_document#>>'{choices,aiStatus}'='withdrawn' AND p_document#>>'{choices,sharingStatus}'='withdrawn' AND p_document->'tags'='[]'::jsonb AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_document->'answers')a WHERE a->>'note'<>'' OR a->>'quote'<>'')) THEN RETURN jsonb_build_object('ok',false,'code','UNAVAILABLE');END IF;
 SELECT jsonb_agg(a->'q' ORDER BY n) INTO questions FROM jsonb_array_elements(p_document->'answers')WITH ORDINALITY AS x(a,n);
 IF questions IS DISTINCT FROM d.questions_snapshot OR (p_contact_id IS DISTINCT FROM d.contact_id AND p_contact_id IS NOT NULL) THEN RETURN jsonb_build_object('ok',false,'code','IMMUTABLE_BINDING');END IF;
 IF p_contact_id IS NOT NULL THEN PERFORM 1 FROM public.contacts WHERE id=p_contact_id AND project_id=p_project_id AND user_id=actor FOR KEY SHARE;IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','SOURCE_UNAVAILABLE');END IF;END IF;
 UPDATE public.interview_drafts SET document=p_document,contact_id=p_contact_id,revision=least(d.revision+1,9007199254740991),last_mutation_id=p_mutation_id,last_mutation_hash=hash,updated_at=clock_timestamp() WHERE id=d.id RETURNING * INTO d;
 RETURN jsonb_build_object('ok',true,'draft',firstten_private.interview_draft_record(d));
END $$;
CREATE OR REPLACE FUNCTION public.save_interview_with_consent(p_project_id uuid,p_contact_id uuid,p_answers jsonb,p_tags text[],p_note_status text,p_ai_status text,p_sharing_status text,p_policy_version integer,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); fingerprint text; previous firstten_private.interview_capture_operations%ROWTYPE; iv uuid; choice jsonb; archived timestamptz;
BEGIN
 IF p_request_id IS NULL OR p_policy_version IS DISTINCT FROM 1 OR p_note_status IS DISTINCT FROM 'granted' OR p_ai_status IS NULL OR p_ai_status NOT IN ('unknown','granted','declined','withdrawn') OR p_sharing_status IS NULL OR p_sharing_status NOT IN ('unknown','granted','declined','withdrawn') OR p_answers IS NULL OR jsonb_typeof(p_answers)<>'array' OR jsonb_array_length(p_answers) NOT BETWEEN 1 AND 30 OR octet_length(p_answers::text)>60000 OR p_tags IS NULL OR cardinality(p_tags)>10 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_answers) a WHERE jsonb_typeof(a)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(a))<>3 OR NOT(a ?& ARRAY['q','note','quote']) OR jsonb_typeof(a->'q')<>'string' OR jsonb_typeof(a->'note')<>'string' OR jsonb_typeof(a->'quote')<>'string' OR length(a->>'q')>2400 OR length(a->>'note')>6000 OR length(a->>'quote')>2400) OR EXISTS(SELECT 1 FROM unnest(p_tags) t WHERE t IS NULL OR t NOT IN ('has problem','current workaround','would use','would pay','gave referral')) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 SELECT archived_at INTO archived FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF archived IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','ARCHIVED'); END IF;
 IF p_contact_id IS NOT NULL THEN
  PERFORM 1 FROM public.contacts WHERE id=p_contact_id AND project_id=p_project_id AND user_id=actor FOR KEY SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('project',p_project_id,'contact',p_contact_id,'answers',p_answers,'tags',p_tags,'notes',p_note_status,'ai',p_ai_status,'sharing',p_sharing_status,'policy',p_policy_version)::text,'UTF8')),'hex');
 SELECT * INTO previous FROM firstten_private.interview_capture_operations WHERE request_id=p_request_id;
 IF FOUND THEN
  IF previous.user_id<>actor OR previous.project_id<>p_project_id OR previous.request_hash<>fingerprint THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('interviewId',previous.interview_id,'replayed',true));
 END IF;
 iv:=gen_random_uuid();
 INSERT INTO public.interviews(id,user_id,project_id,contact_id,answers,tags,completed) VALUES(iv,actor,p_project_id,p_contact_id,p_answers,p_tags,true);
 choice:=public.set_processing_consent(p_project_id,'interview',iv,p_note_status,p_ai_status,p_sharing_status,1,0);
 IF choice->>'ok'<>'true' THEN RAISE EXCEPTION 'Interview permission save failed' USING ERRCODE='23514'; END IF;
 IF p_contact_id IS NOT NULL THEN UPDATE public.contacts SET status='interviewed' WHERE id=p_contact_id AND project_id=p_project_id AND user_id=actor AND stage=1 AND status IN ('to_contact','new','contacted','replied'); END IF;
 INSERT INTO firstten_private.interview_capture_operations(request_id,user_id,project_id,request_hash,interview_id) VALUES(p_request_id,actor,p_project_id,fingerprint,iv);
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('interviewId',iv,'replayed',false));
END;$$;

CREATE FUNCTION public.complete_interview_draft(p_project_id uuid,p_draft_id uuid,p_expected_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid();d public.interview_drafts%ROWTYPE;archived timestamptz;result jsonb;iv uuid;
BEGIN
 SELECT archived_at INTO archived FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO d FROM public.interview_drafts WHERE id=p_draft_id AND project_id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF d.status='completed' THEN RETURN jsonb_build_object('ok',true,'interviewId',d.completed_interview_id,'replayed',true,'completedRevision',d.revision);END IF;
 IF archived IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','ARCHIVED');END IF;
 IF p_expected_revision IS DISTINCT FROM d.revision THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT','currentRevision',d.revision);END IF;
 IF d.document#>>'{choices,noteStatus}'<>'granted' OR NOT firstten_private.valid_interview_draft(d.document) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 IF d.contact_id IS NOT NULL THEN PERFORM 1 FROM public.contacts WHERE id=d.contact_id AND user_id=actor AND project_id=p_project_id FOR KEY SHARE;IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','SOURCE_UNAVAILABLE');END IF;END IF;
 result:=public.save_interview_with_consent(p_project_id,d.contact_id,d.document->'answers',ARRAY(SELECT jsonb_array_elements_text(d.document->'tags')),d.document#>>'{choices,noteStatus}',d.document#>>'{choices,aiStatus}',d.document#>>'{choices,sharingStatus}',1,d.completion_request_id);
 IF result->>'ok'<>'true' THEN RETURN result;END IF;
 iv:=(result#>>'{data,interviewId}')::uuid;
 UPDATE public.interview_drafts SET status='completed',document=NULL,completed_interview_id=iv,completed_at=clock_timestamp(),updated_at=clock_timestamp(),last_mutation_id=NULL,last_mutation_hash=NULL WHERE id=d.id;
 RETURN jsonb_build_object('ok',true,'interviewId',iv,'replayed',false,'completedRevision',d.revision);
END $$;
REVOKE ALL ON FUNCTION firstten_private.valid_interview_draft(jsonb),firstten_private.interview_draft_record(public.interview_drafts) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.list_interview_drafts(uuid),public.load_interview_draft(uuid,uuid),public.create_interview_draft(uuid,uuid,uuid,jsonb,uuid,text),public.save_interview_draft(uuid,uuid,bigint,uuid,uuid,jsonb),public.complete_interview_draft(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_interview_drafts(uuid),public.load_interview_draft(uuid,uuid),public.create_interview_draft(uuid,uuid,uuid,jsonb,uuid,text),public.save_interview_draft(uuid,uuid,bigint,uuid,uuid,jsonb),public.complete_interview_draft(uuid,uuid,bigint) TO authenticated;
COMMENT ON TABLE public.interview_drafts IS 'Owner-private current incomplete notes. Revisioned CAS, no historical raw-note copies. Never counts as research or enters AI/shared projections. Completion atomically captures one interview and clears duplicate draft notes; completion tombstone prevents replay duplication.';
COMMIT;
