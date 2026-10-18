-- Owner-reported choices, not verified participant consent or a sharing grant.
-- No historical backfill: absence means unknown.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.processing_consents (
 user_id uuid NOT NULL,
 project_id uuid NOT NULL,
 target_kind text NOT NULL CHECK(target_kind IN ('project','contact','interview','learning')),
 target_id uuid NOT NULL,
 note_status text NOT NULL CHECK(note_status IN ('unknown','granted','declined','withdrawn')),
 ai_status text NOT NULL CHECK(ai_status IN ('unknown','granted','declined','withdrawn')),
 sharing_status text NOT NULL CHECK(sharing_status IN ('unknown','granted','declined','withdrawn')),
 policy_version integer NOT NULL CHECK(policy_version=1),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991 AND (revision<9007199254740991 OR (note_status<>'granted' AND ai_status<>'granted' AND sharing_status<>'granted'))),
 evidence_invalidated boolean NOT NULL DEFAULT false,
 reported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,target_kind,target_id),
 FOREIGN KEY(project_id,user_id) REFERENCES public.projects(id,user_id) ON DELETE CASCADE
);
ALTER TABLE public.processing_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.processing_consents FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.processing_consents TO authenticated;
CREATE POLICY owner_read ON public.processing_consents FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE TABLE firstten_private.processing_consent_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, project_id uuid NOT NULL,
 target_kind text NOT NULL CHECK(target_kind IN ('project','contact','interview','learning')), target_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('choice_saved','evidence_invalidated')),
 note_status text NOT NULL, ai_status text NOT NULL, sharing_status text NOT NULL,
 policy_version integer NOT NULL CHECK(policy_version=1), revision bigint NOT NULL,
 evidence_invalidated boolean NOT NULL, reported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE firstten_private.interview_capture_operations (
 request_id uuid PRIMARY KEY,user_id uuid NOT NULL,project_id uuid NOT NULL,
 request_hash text NOT NULL CHECK(length(request_hash)=64),interview_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE firstten_private.processing_consent_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE firstten_private.interview_capture_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON firstten_private.processing_consent_history,firstten_private.interview_capture_operations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION firstten_private.deny_consent_history_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Consent history is append-only' USING ERRCODE='42501';END;$$;
REVOKE ALL ON FUNCTION firstten_private.deny_consent_history_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER consent_history_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON firstten_private.processing_consent_history FOR EACH STATEMENT EXECUTE FUNCTION firstten_private.deny_consent_history_change();

CREATE FUNCTION firstten_private.consent_target_exists(p_project uuid,p_kind text,p_target uuid,p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project AND user_id=p_actor) AND CASE p_kind
 WHEN 'project' THEN p_target=p_project
 WHEN 'contact' THEN EXISTS(SELECT 1 FROM public.contacts WHERE id=p_target AND project_id=p_project AND user_id=p_actor)
 WHEN 'interview' THEN EXISTS(SELECT 1 FROM public.interviews WHERE id=p_target AND project_id=p_project AND user_id=p_actor)
 WHEN 'learning' THEN EXISTS(SELECT 1 FROM public.learnings WHERE id=p_target AND project_id=p_project AND user_id=p_actor)
 ELSE false END;
$$;
REVOKE ALL ON FUNCTION firstten_private.consent_target_exists(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION firstten_private.consent_projection(c public.processing_consents) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('projectId',c.project_id,'targetKind',c.target_kind,'targetId',c.target_id,'noteStatus',c.note_status,'aiStatus',c.ai_status,'sharingStatus',c.sharing_status,'policyVersion',c.policy_version,'revision',c.revision,'evidenceInvalidated',c.evidence_invalidated,'reportedAt',c.reported_at);
$$;
REVOKE ALL ON FUNCTION firstten_private.consent_projection(public.processing_consents) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.get_processing_consent(p_project_id uuid,p_target_kind text,p_target_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.processing_consents%ROWTYPE;
BEGIN
 IF NOT firstten_private.consent_target_exists(p_project_id,p_target_kind,p_target_id,auth.uid()) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT * INTO c FROM public.processing_consents WHERE project_id=p_project_id AND target_kind=p_target_kind AND target_id=p_target_id;
 RETURN jsonb_build_object('ok',true,'data',CASE WHEN FOUND THEN firstten_private.consent_projection(c) ELSE jsonb_build_object('projectId',p_project_id,'targetKind',p_target_kind,'targetId',p_target_id,'noteStatus','unknown','aiStatus','unknown','sharingStatus','unknown','policyVersion',1,'revision',0,'evidenceInvalidated',false,'reportedAt',NULL) END);
END;$$;
CREATE FUNCTION public.set_processing_consent(p_project_id uuid,p_target_kind text,p_target_id uuid,p_note_status text,p_ai_status text,p_sharing_status text,p_policy_version integer,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); c public.processing_consents%ROWTYPE; saved public.processing_consents%ROWTYPE; affected public.processing_consents%ROWTYPE;
BEGIN
 IF p_note_status IS NULL OR p_ai_status IS NULL OR p_sharing_status IS NULL OR p_note_status NOT IN ('unknown','granted','declined','withdrawn') OR p_ai_status NOT IN ('unknown','granted','declined','withdrawn') OR p_sharing_status NOT IN ('unknown','granted','declined','withdrawn') OR p_policy_version IS DISTINCT FROM 1 OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>=9007199254740991 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND OR NOT firstten_private.consent_target_exists(p_project_id,p_target_kind,p_target_id,actor) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT * INTO c FROM public.processing_consents WHERE project_id=p_project_id AND target_kind=p_target_kind AND target_id=p_target_id FOR UPDATE;
 IF coalesce(c.revision,0)<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','REVISION_CONFLICT'); END IF;
 IF p_expected_revision=9007199254740990 AND (p_note_status='granted' OR p_ai_status='granted' OR p_sharing_status='granted') THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 IF c.evidence_invalidated AND p_ai_status='granted' THEN RETURN jsonb_build_object('ok',false,'code','EVIDENCE_REVIEW_REQUIRED'); END IF;
 INSERT INTO public.processing_consents(user_id,project_id,target_kind,target_id,note_status,ai_status,sharing_status,policy_version,revision)
 VALUES(actor,p_project_id,p_target_kind,p_target_id,p_note_status,p_ai_status,p_sharing_status,1,p_expected_revision+1)
 ON CONFLICT(project_id,target_kind,target_id) DO UPDATE SET note_status=excluded.note_status,ai_status=excluded.ai_status,sharing_status=excluded.sharing_status,revision=excluded.revision,reported_at=clock_timestamp()
 RETURNING * INTO saved;
 INSERT INTO firstten_private.processing_consent_history(user_id,project_id,target_kind,target_id,operation,note_status,ai_status,sharing_status,policy_version,revision,evidence_invalidated)
 VALUES(actor,p_project_id,p_target_kind,p_target_id,'choice_saved',saved.note_status,saved.ai_status,saved.sharing_status,1,saved.revision,saved.evidence_invalidated);
 -- No trusted source lineage exists yet. Withdrawing evidence invalidates every existing learning,
 -- including summaries without a previous choice. Ordinary regrant cannot clear this marker.
 IF p_target_kind IN ('project','contact','interview') AND ((c.ai_status='granted' AND p_ai_status<>'granted') OR p_ai_status IN ('declined','withdrawn') OR (c.note_status='granted' AND p_note_status<>'granted') OR p_note_status IN ('declined','withdrawn')) THEN
  FOR affected IN
   INSERT INTO public.processing_consents(user_id,project_id,target_kind,target_id,note_status,ai_status,sharing_status,policy_version,revision,evidence_invalidated)
   SELECT actor,p_project_id,'learning',l.id,'unknown','unknown','unknown',1,1,true FROM public.learnings l WHERE l.project_id=p_project_id AND l.user_id=actor
   ON CONFLICT(project_id,target_kind,target_id) DO UPDATE SET ai_status='unknown',note_status=CASE WHEN public.processing_consents.revision>=9007199254740990 THEN 'unknown' ELSE public.processing_consents.note_status END,sharing_status=CASE WHEN public.processing_consents.revision>=9007199254740990 THEN 'unknown' ELSE public.processing_consents.sharing_status END,evidence_invalidated=true,revision=least(public.processing_consents.revision+1,9007199254740991),reported_at=clock_timestamp()
   RETURNING *
  LOOP
   INSERT INTO firstten_private.processing_consent_history(user_id,project_id,target_kind,target_id,operation,note_status,ai_status,sharing_status,policy_version,revision,evidence_invalidated)
   VALUES(actor,p_project_id,'learning',affected.target_id,'evidence_invalidated',affected.note_status,'unknown',affected.sharing_status,1,affected.revision,true);
  END LOOP;
 END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.consent_projection(saved));
END;$$;

CREATE FUNCTION public.get_ai_processing_context(p_project_id uuid,p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); p public.projects%ROWTYPE; iv jsonb:='[]'; ls jsonb:='[]'; cs jsonb:='[]'; excluded_iv integer:=0;excluded_cs integer:=0;excluded_ls integer:=0; payload jsonb;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('questions','synthesis','stage2','stage3') THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 SELECT * INTO p FROM public.projects WHERE id=p_project_id AND user_id=actor;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.processing_consents WHERE project_id=p.id AND target_kind='project' AND target_id=p.id AND ai_status='granted') THEN RETURN jsonb_build_object('ok',false,'code','PROCESSING_PERMISSION_REQUIRED'); END IF;
 IF p_kind<>'questions' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('answers',(SELECT coalesce(jsonb_agg(jsonb_build_object('q',coalesce(a->>'q',''),'note',coalesce(a->>'note',''),'quote',coalesce(a->>'quote',''))),'[]') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.answers)='array' THEN i.answers ELSE '[]' END) a),'tags',i.tags) ORDER BY i.created_at,i.id),'[]') INTO iv
  FROM public.interviews i JOIN public.processing_consents ci ON ci.project_id=i.project_id AND ci.target_kind='interview' AND ci.target_id=i.id AND ci.note_status='granted' AND ci.ai_status='granted'
  WHERE i.project_id=p.id AND i.user_id=actor AND i.completed AND (i.contact_id IS NULL OR EXISTS(SELECT 1 FROM public.processing_consents cc WHERE cc.project_id=p.id AND cc.target_kind='contact' AND cc.target_id=i.contact_id AND cc.ai_status='granted'));
  SELECT count(*)-jsonb_array_length(iv) INTO excluded_iv FROM public.interviews WHERE project_id=p.id AND user_id=actor AND completed;
  SELECT coalesce(jsonb_agg(jsonb_build_object('relation',c.relation,'why',c.why,'source',c.source,'stage',c.stage) ORDER BY c.created_at,c.id),'[]') INTO cs FROM public.contacts c JOIN public.processing_consents cc ON cc.project_id=c.project_id AND cc.target_kind='contact' AND cc.target_id=c.id AND cc.ai_status='granted' WHERE c.project_id=p.id AND c.user_id=actor;
  SELECT count(*)-jsonb_array_length(cs) INTO excluded_cs FROM public.contacts WHERE project_id=p.id AND user_id=actor;
  IF p_kind IN ('stage2','stage3') AND excluded_iv=0 AND excluded_cs=0 THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('title',l.title,'body',l.body,'data',l.data,'kind',l.kind) ORDER BY l.created_at,l.id),'[]') INTO ls FROM public.learnings l JOIN public.processing_consents cl ON cl.project_id=l.project_id AND cl.target_kind='learning' AND cl.target_id=l.id AND cl.ai_status='granted' AND NOT cl.evidence_invalidated WHERE l.project_id=p.id AND l.user_id=actor AND l.accepted;
  END IF;
  SELECT count(*)-jsonb_array_length(ls) INTO excluded_ls FROM public.learnings WHERE project_id=p.id AND user_id=actor AND accepted;
 END IF;
 payload:=jsonb_build_object('project',jsonb_build_object('name',p.name,'description',p.description,'audience',p.audience,'problem',p.problem),'interviews',iv,'learnings',ls,'contacts',CASE WHEN p_kind='stage2' THEN cs ELSE '[]'::jsonb END,'excluded',jsonb_build_object('interviews',excluded_iv,'contacts',excluded_cs,'learnings',excluded_ls));
 IF octet_length(payload::text)>100000 THEN RETURN jsonb_build_object('ok',false,'code','CONTEXT_LIMIT'); END IF;
 RETURN jsonb_build_object('ok',true,'data',payload);
END;$$;

CREATE FUNCTION public.save_interview_with_consent(p_project_id uuid,p_contact_id uuid,p_answers jsonb,p_tags text[],p_note_status text,p_ai_status text,p_sharing_status text,p_policy_version integer,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); fingerprint text; previous firstten_private.interview_capture_operations%ROWTYPE; iv uuid; choice jsonb;
BEGIN
 IF p_request_id IS NULL OR p_policy_version IS DISTINCT FROM 1 OR p_note_status IS DISTINCT FROM 'granted' OR p_ai_status IS NULL OR p_ai_status NOT IN ('unknown','granted','declined','withdrawn') OR p_sharing_status IS NULL OR p_sharing_status NOT IN ('unknown','granted','declined','withdrawn') OR p_answers IS NULL OR jsonb_typeof(p_answers)<>'array' OR jsonb_array_length(p_answers) NOT BETWEEN 1 AND 30 OR octet_length(p_answers::text)>60000 OR p_tags IS NULL OR cardinality(p_tags)>10 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_answers) a WHERE jsonb_typeof(a)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(a))<>3 OR NOT(a ?& ARRAY['q','note','quote']) OR jsonb_typeof(a->'q')<>'string' OR jsonb_typeof(a->'note')<>'string' OR jsonb_typeof(a->'quote')<>'string' OR length(a->>'q')>2400 OR length(a->>'note')>6000 OR length(a->>'quote')>2400) OR EXISTS(SELECT 1 FROM unnest(p_tags) t WHERE t IS NULL OR t NOT IN ('has problem','current workaround','would use','would pay','gave referral')) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND OR (p_contact_id IS NOT NULL AND NOT firstten_private.consent_target_exists(p_project_id,'contact',p_contact_id,actor)) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
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
 IF p_contact_id IS NOT NULL THEN UPDATE public.contacts SET status='interviewed' WHERE id=p_contact_id AND project_id=p_project_id AND user_id=actor; END IF;
 INSERT INTO firstten_private.interview_capture_operations(request_id,user_id,project_id,request_hash,interview_id) VALUES(p_request_id,actor,p_project_id,fingerprint,iv);
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('interviewId',iv,'replayed',false));
END;$$;
REVOKE ALL ON FUNCTION public.get_processing_consent(uuid,text,uuid),public.set_processing_consent(uuid,text,uuid,text,text,text,integer,bigint),public.get_ai_processing_context(uuid,text),public.save_interview_with_consent(uuid,uuid,jsonb,text[],text,text,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_processing_consent(uuid,text,uuid),public.set_processing_consent(uuid,text,uuid,text,text,text,integer,bigint),public.get_ai_processing_context(uuid,text),public.save_interview_with_consent(uuid,uuid,jsonb,text[],text,text,text,integer,uuid) TO authenticated;
COMMIT;
