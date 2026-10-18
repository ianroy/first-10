-- WS-009: freeze archived owner work without blocking recovery or privacy reductions.
-- Additive after reviewed 18000/19000. No prompt/eval files or data are rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';

-- The parent lock conflicts with archive's non-key UPDATE. NOWAIT avoids a
-- child-row -> parent wait against existing parent -> child RPC lock order.
CREATE FUNCTION firstten_private.workspace_is_archived(p_project uuid,p_owner uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE archived timestamptz;
BEGIN
 SELECT archived_at INTO archived FROM public.projects WHERE id=p_project AND user_id=p_owner FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN archived IS NOT NULL;
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'WORKSPACE_BUSY' USING ERRCODE='PT409';
END $$;
REVOKE ALL ON FUNCTION firstten_private.workspace_is_archived(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION firstten_private.draft_privacy_clear(before jsonb,after jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(firstten_private.valid_interview_draft(after)
 AND (before-'answers'-'tags'-'choices')=(after-'answers'-'tags'-'choices')
 AND after->'tags'='[]'::jsonb
 AND after->'choices'='{"noteStatus":"withdrawn","aiStatus":"withdrawn","sharingStatus":"withdrawn"}'::jsonb
 AND (SELECT jsonb_agg(x->'q' ORDER BY n) FROM jsonb_array_elements(before->'answers')WITH ORDINALITY a(x,n))=(SELECT jsonb_agg(x->'q' ORDER BY n) FROM jsonb_array_elements(after->'answers')WITH ORDINALITY a(x,n))
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(after->'answers')a WHERE a->>'note'<>'' OR a->>'quote'<>''),false)
$$;
CREATE FUNCTION firstten_private.discovery_exclusion_only(before jsonb,after jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce((before-'excludedContextIds')=(after-'excludedContextIds')
 AND jsonb_typeof(after->'excludedContextIds')='array'
 AND (after->'excludedContextIds') @> (before->'excludedContextIds')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(after->'excludedContextIds')id WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before->'contexts')c WHERE c->'id'=id)),false)
$$;
REVOKE ALL ON FUNCTION firstten_private.draft_privacy_clear(jsonb,jsonb),firstten_private.discovery_exclusion_only(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Contact removal must not broaden AI eligibility by erasing a restrictive source.
-- This event is an automatic restriction, distinct from an owner-reported choice.
ALTER TABLE firstten_private.processing_consent_history DROP CONSTRAINT processing_consent_history_operation_check;
ALTER TABLE firstten_private.processing_consent_history ADD CONSTRAINT processing_consent_history_operation_check CHECK(operation IN ('choice_saved','evidence_invalidated','contact_unlinked'));
CREATE FUNCTION firstten_private.invalidate_unlinked_interview(p_project uuid,p_owner uuid,p_interview uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected public.processing_consents;
BEGIN
 -- The project is already absent during its own cascade; do not recreate children.
 IF NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project AND user_id=p_owner) THEN RETURN; END IF;
 PERFORM firstten_private.workspace_is_archived(p_project,p_owner);
 INSERT INTO public.processing_consents(user_id,project_id,target_kind,target_id,note_status,ai_status,sharing_status,policy_version,revision)
 VALUES(p_owner,p_project,'interview',p_interview,'unknown','unknown','unknown',1,1)
 ON CONFLICT(project_id,target_kind,target_id) DO UPDATE SET
  ai_status='unknown',note_status=CASE WHEN public.processing_consents.revision>=9007199254740990 THEN 'unknown' ELSE public.processing_consents.note_status END,
  sharing_status=CASE WHEN public.processing_consents.revision>=9007199254740990 THEN 'unknown' ELSE public.processing_consents.sharing_status END,
  revision=least(public.processing_consents.revision+1,9007199254740991),reported_at=clock_timestamp()
 RETURNING * INTO affected;
 INSERT INTO firstten_private.processing_consent_history(user_id,project_id,target_kind,target_id,operation,note_status,ai_status,sharing_status,policy_version,revision,evidence_invalidated)
 VALUES(p_owner,p_project,'interview',p_interview,'contact_unlinked',affected.note_status,affected.ai_status,affected.sharing_status,1,affected.revision,affected.evidence_invalidated);
 FOR affected IN
  INSERT INTO public.processing_consents(user_id,project_id,target_kind,target_id,note_status,ai_status,sharing_status,policy_version,revision,evidence_invalidated)
  SELECT p_owner,p_project,'learning',l.id,'unknown','unknown','unknown',1,1,true FROM public.learnings l WHERE l.project_id=p_project AND l.user_id=p_owner
  ON CONFLICT(project_id,target_kind,target_id) DO UPDATE SET ai_status='unknown',note_status=CASE WHEN public.processing_consents.revision>=9007199254740990 THEN 'unknown' ELSE public.processing_consents.note_status END,
   sharing_status=CASE WHEN public.processing_consents.revision>=9007199254740990 THEN 'unknown' ELSE public.processing_consents.sharing_status END,
   evidence_invalidated=true,revision=least(public.processing_consents.revision+1,9007199254740991),reported_at=clock_timestamp()
  RETURNING *
 LOOP
  INSERT INTO firstten_private.processing_consent_history(user_id,project_id,target_kind,target_id,operation,note_status,ai_status,sharing_status,policy_version,revision,evidence_invalidated)
  VALUES(p_owner,p_project,'learning',affected.target_id,'evidence_invalidated',affected.note_status,affected.ai_status,affected.sharing_status,1,affected.revision,true);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION firstten_private.invalidate_unlinked_interview(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION firstten_private.archived_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b jsonb:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END; a jsonb:=to_jsonb(NEW); owner_id uuid; parent_project_id uuid; allowed boolean:=false; k text;
BEGIN
 IF TG_TABLE_NAME='projects' THEN
  -- Metadata changes cannot smuggle content into an archive or restore operation.
  IF OLD.archived_at IS NOT NULL OR NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
   IF (a-'archived_at'-'lifecycle_revision'-'updated_at') IS DISTINCT FROM (b-'archived_at'-'lifecycle_revision'-'updated_at') THEN
    RAISE EXCEPTION 'WORKSPACE_ARCHIVED' USING ERRCODE='PT409';
   END IF;
  END IF;
  RETURN NEW;
 END IF;
 parent_project_id:=(a->>'project_id')::uuid;
 owner_id:=CASE WHEN TG_TABLE_NAME='project_members' THEN (a->>'created_by')::uuid WHEN TG_TABLE_NAME='project_invitations' THEN (a->>'issuer_id')::uuid ELSE (a->>'user_id')::uuid END;
 -- Accounting of an already authorized dispatch must survive archive/deletion.
 IF TG_TABLE_NAME='ai_usage_operations' AND TG_OP='UPDATE' AND NOT (b->>'state' IS DISTINCT FROM 'in_flight' AND a->>'state'='in_flight') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='public_context_operations' AND TG_OP='UPDATE' AND a->>'state' IN ('failed','expired') THEN RETURN NEW; END IF;
 -- Exact contact unlink is also used by ON DELETE SET NULL during parent cascades.
 -- No trigger-depth, session-setting or role-based bypass exists.
 IF TG_TABLE_NAME='interviews' AND TG_OP='UPDATE' AND b->'contact_id'<>'null'::jsonb AND a->'contact_id'='null'::jsonb THEN
  PERFORM firstten_private.invalidate_unlinked_interview(parent_project_id,owner_id,(a->>'id')::uuid);
  IF (a-'contact_id')=(b-'contact_id') THEN RETURN NEW; END IF;
 END IF;
 IF NOT firstten_private.workspace_is_archived(parent_project_id,owner_id) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND a=b THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='processing_consents' THEN
  -- ON CONFLICT runs BEFORE INSERT first. Existing grants may be retained while
  -- withdrawing another choice; the subsequent UPDATE guard checks the full row.
  IF TG_OP='INSERT' THEN SELECT to_jsonb(c) INTO b FROM public.processing_consents c WHERE c.project_id=parent_project_id AND c.user_id=owner_id AND c.target_kind=a->>'target_kind' AND c.target_id=(a->>'target_id')::uuid; END IF;
  allowed:=true;
  FOREACH k IN ARRAY ARRAY['note_status','ai_status','sharing_status'] LOOP
   IF a->>k='granted' AND b->>k IS DISTINCT FROM 'granted' THEN allowed:=false; END IF;
  END LOOP;
  IF TG_OP='UPDATE' THEN
   allowed:=allowed AND (a-ARRAY['note_status','ai_status','sharing_status','revision','reported_at','evidence_invalidated'])=(b-ARRAY['note_status','ai_status','sharing_status','revision','reported_at','evidence_invalidated']) AND NOT(b->>'evidence_invalidated'='true' AND a->>'evidence_invalidated'<>'true');
  END IF;
 ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='interview_drafts' THEN
  allowed:=(a-ARRAY['document','contact_id','revision','last_mutation_id','last_mutation_hash','updated_at'])=(b-ARRAY['document','contact_id','revision','last_mutation_id','last_mutation_hash','updated_at'])
   AND (a->'contact_id'=b->'contact_id' OR a->'contact_id'='null'::jsonb)
   AND firstten_private.draft_privacy_clear(b->'document',a->'document');
 ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='discovery_workspaces' THEN
  allowed:=(a-ARRAY['document','revision','last_mutation_id','last_mutation_hash','updated_at'])=(b-ARRAY['document','revision','last_mutation_id','last_mutation_hash','updated_at'])
   AND firstten_private.discovery_exclusion_only(b->'document',a->'document');
 ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='project_members' THEN
  allowed:=a->>'state'='revoked' AND (a-ARRAY['state','revision','updated_at'])=(b-ARRAY['state','revision','updated_at']);
 ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='project_invitations' THEN
  allowed:=a->'revoked_at'<>'null'::jsonb AND (a-'revoked_at')=(b-'revoked_at');
 ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='class_project_links' THEN
  allowed:=a->'active'='false'::jsonb AND (a-ARRAY['active','revision','updated_at'])=(b-ARRAY['active','revision','updated_at']);
 ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='reviewed_public_sources' THEN
  allowed:=a->>'status'='withdrawn' AND (a-ARRAY['status','revision'])=(b-ARRAY['status','revision']);
 END IF;
 IF NOT coalesce(allowed,false) THEN RAISE EXCEPTION 'WORKSPACE_ARCHIVED' USING ERRCODE='PT409'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION firstten_private.archived_write_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_archived_workspace_guard BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION firstten_private.archived_write_guard();
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['contacts','interviews','learnings','experiments','outreach','marketing_plans','teacher_plans','discovery_workspaces','interview_drafts','processing_consents','project_members','class_project_links'] LOOP
  EXECUTE format('CREATE TRIGGER zz_archived_workspace_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION firstten_private.archived_write_guard()',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['project_invitations','ai_usage_operations','demo_ai_reservations','public_context_operations','public_context_previews','reviewed_public_sources'] LOOP
  EXECUTE format('CREATE TRIGGER zz_archived_workspace_guard BEFORE INSERT OR UPDATE ON firstten_private.%I FOR EACH ROW EXECUTE FUNCTION firstten_private.archived_write_guard()',n);
 END LOOP;
END $$;
-- A table grant overrides a column revoke: remove it, then grant only content fields.
-- Owner SELECT/INSERT/DELETE and all existing RLS remain. Lifecycle RPC owns metadata.
REVOKE UPDATE ON public.projects FROM authenticated;
GRANT UPDATE(name,description,audience,problem,link,stage,questions,survey,checklist,questions_origin_id,survey_origin_id) ON public.projects TO authenticated;
COMMENT ON COLUMN public.projects.archived_at IS 'Recoverable owner archive. Database guards reject ordinary content writes/new dispatch while preserving owner read/export/restore, privacy reduction and existing delete behavior.';

CREATE OR REPLACE FUNCTION public.save_marketing_plan(p_project_id uuid,p_expected_revision bigint,p_mutation_id uuid,p_complete_student_first boolean,p_document jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE actor uuid; project_stage integer; current_plan public.marketing_plans%ROWTYPE; saved public.marketing_plans%ROWTYPE;
  doc jsonb; client_doc jsonb; mutation_hash text; prior_history jsonb; asset jsonb; old_asset jsonb; assets jsonb := '[]'::jsonb; source jsonb; stamp timestamptz; stamp_text text;
BEGIN
  actor := auth.uid();
  IF actor IS NULL THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); END IF;
  -- Locks both first creation and stage changes. Authorization is repeated before replay.
  SELECT p.stage INTO project_stage FROM public.projects p WHERE p.id=p_project_id AND p.user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF firstten_private.workspace_is_archived(p_project_id,actor) THEN RETURN jsonb_build_object('ok',false,'code','ARCHIVED'); END IF;
  IF project_stage<2 THEN RETURN jsonb_build_object('ok',false,'code','STAGE_LOCKED'); END IF;
  SELECT * INTO current_plan FROM public.marketing_plans WHERE project_id=p_project_id AND user_id=actor FOR UPDATE;
  IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>9007199254740991 OR p_mutation_id IS NULL OR p_complete_student_first IS NULL OR p_document IS NULL OR octet_length(p_document::text)>131072 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_PLAN'); END IF;
  doc := firstten_private.marketing_normalize(p_document,firstten_private.marketing_shape()->'MarketingPlanV1');
  client_doc := jsonb_set(doc,'{studentFirst,completedAt}','null'::jsonb);
  mutation_hash := encode(sha256(convert_to(jsonb_build_object('expectedRevision',p_expected_revision,'completeStudentFirst',p_complete_student_first,'document',client_doc)::text,'UTF8')),'hex');
  IF current_plan.last_mutation_id=p_mutation_id THEN
    IF current_plan.last_mutation_hash<>mutation_hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT','currentRevision',current_plan.revision); END IF;
    RETURN jsonb_build_object('ok',true,'id',current_plan.id,'revision',current_plan.revision,'savedAt',to_char(current_plan.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'document',current_plan.document);
  END IF;
  IF coalesce(current_plan.revision,0)<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT','currentRevision',coalesce(current_plan.revision,0)); END IF;
  IF current_plan.revision=9007199254740991 THEN RETURN jsonb_build_object('ok',false,'code','UNAVAILABLE'); END IF;
  stamp := clock_timestamp();
  stamp_text := to_char(stamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  IF current_plan.document#>>'{studentFirst,completedAt}' IS NOT NULL THEN
    IF doc->'studentFirst'<>current_plan.document->'studentFirst' OR p_complete_student_first THEN RETURN jsonb_build_object('ok',false,'code','INVALID_PLAN'); END IF;
  ELSE
    doc := jsonb_set(doc,'{studentFirst,completedAt}','null'::jsonb);
    IF p_complete_student_first THEN
      IF NOT firstten_private.marketing_first_complete(doc->'studentFirst') THEN RETURN jsonb_build_object('ok',false,'code','INVALID_PLAN'); END IF;
      doc := jsonb_set(doc,'{studentFirst,completedAt}',to_jsonb(stamp_text));
    END IF;
  END IF;
  -- Provenance adoption stays disabled until MKT-004/005 has a trusted AI ledger.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'channels') WHERE value->>'origin'<>'student' OR value->'aiOrigin'<>'null'::jsonb) OR EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'assets') WHERE value->'aiOrigin'<>'null'::jsonb) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_PLAN'); END IF;
  FOR asset IN SELECT value FROM jsonb_array_elements(doc->'assets') LOOP
    old_asset := firstten_private.marketing_find(coalesce(current_plan.document->'assets','[]'::jsonb),asset->>'id');
    IF old_asset IS NULL OR firstten_private.marketing_review_basis(doc,asset) IS DISTINCT FROM firstten_private.marketing_review_basis(current_plan.document,old_asset) THEN
      asset := jsonb_set(asset,'{review}','{"truthful":false,"disclosedBuilder":false,"accessChecked":false,"destinationChecked":false,"checkedAt":null}'::jsonb);
    END IF;
    assets := assets || jsonb_build_array(asset);
  END LOOP;
  doc := jsonb_set(doc,'{assets}',assets);
  IF NOT firstten_private.marketing_plan_valid(doc) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_PLAN'); END IF;
  FOR source IN SELECT value FROM jsonb_array_elements(doc->'sources') LOOP
    IF source->>'kind'='interview' AND NOT EXISTS(SELECT 1 FROM public.interviews WHERE id=(source->>'recordId')::uuid AND project_id=p_project_id AND user_id=actor) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_PLAN'); END IF;
    IF source->>'kind'='accepted_learning' AND NOT EXISTS(SELECT 1 FROM public.learnings WHERE id=(source->>'recordId')::uuid AND project_id=p_project_id AND user_id=actor) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_PLAN'); END IF;
  END LOOP;
  IF current_plan.id IS NULL THEN
    INSERT INTO public.marketing_plans(user_id,project_id,revision,document,last_mutation_id,last_mutation_hash,created_at,updated_at) VALUES(actor,p_project_id,1,doc,p_mutation_id,mutation_hash,stamp,stamp) RETURNING * INTO saved;
  ELSE
    SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO prior_history FROM jsonb_array_elements(current_plan.history || jsonb_build_array(jsonb_build_object('revision',current_plan.revision,'savedAt',to_char(current_plan.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'document',current_plan.document))) WITH ORDINALITY AS h(value,ord) WHERE ord>greatest(0,jsonb_array_length(current_plan.history)+1-3);
    UPDATE public.marketing_plans SET revision=current_plan.revision+1,document=doc,history=prior_history,last_mutation_id=p_mutation_id,last_mutation_hash=mutation_hash,updated_at=stamp WHERE id=current_plan.id RETURNING * INTO saved;
  END IF;
  RETURN jsonb_build_object('ok',true,'id',saved.id,'revision',saved.revision,'savedAt',stamp_text,'document',saved.document);
EXCEPTION
  WHEN invalid_parameter_value OR invalid_text_representation OR datetime_field_overflow OR check_violation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'code','INVALID_PLAN');
  WHEN SQLSTATE 'PT409' THEN RETURN jsonb_build_object('ok',false,'code',CASE WHEN SQLERRM='WORKSPACE_BUSY' THEN 'BUSY' ELSE 'ARCHIVED' END);
 WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code','UNAVAILABLE');
END $fn$;

CREATE OR REPLACE FUNCTION public.save_teacher_plan(p_project_id uuid,p_expected_revision bigint,p_mutation_id uuid,p_document jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE actor uuid; current_plan public.teacher_plans%ROWTYPE; saved public.teacher_plans%ROWTYPE; doc jsonb; hash text; stamp timestamptz;
BEGIN
 actor:=auth.uid();
 IF actor IS NULL THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF firstten_private.workspace_is_archived(p_project_id,actor) THEN RETURN jsonb_build_object('ok',false,'code','ARCHIVED'); END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>9007199254740991 OR p_mutation_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_PLAN'); END IF;
 doc:=firstten_private.normalize_teacher_plan(p_document);
 hash:=encode(sha256(convert_to(jsonb_build_object('expectedRevision',p_expected_revision,'document',doc)::text,'UTF8')),'hex');
 SELECT * INTO current_plan FROM public.teacher_plans WHERE project_id=p_project_id AND user_id=actor FOR UPDATE;
 IF current_plan.last_mutation_id=p_mutation_id THEN
   IF current_plan.last_mutation_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT','currentRevision',current_plan.revision); END IF;
   saved:=current_plan;
 ELSE
   IF coalesce(current_plan.revision,0)<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT','currentRevision',coalesce(current_plan.revision,0)); END IF;
   IF current_plan.revision=9007199254740991 THEN RETURN jsonb_build_object('ok',false,'code','UNAVAILABLE'); END IF;
   stamp:=clock_timestamp();
   IF current_plan.id IS NULL THEN
     INSERT INTO public.teacher_plans(user_id,project_id,revision,document,last_mutation_id,last_mutation_hash,created_at,updated_at) VALUES(actor,p_project_id,1,doc,p_mutation_id,hash,stamp,stamp) RETURNING * INTO saved;
   ELSE
     UPDATE public.teacher_plans SET revision=current_plan.revision+1,document=doc,last_mutation_id=p_mutation_id,last_mutation_hash=hash,updated_at=stamp WHERE id=current_plan.id RETURNING * INTO saved;
   END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'id',saved.id,'revision',saved.revision,'savedAt',to_char(saved.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'document',saved.document);
EXCEPTION
 WHEN invalid_parameter_value OR invalid_text_representation OR datetime_field_overflow OR check_violation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'code','INVALID_PLAN');
 WHEN SQLSTATE 'PT409' THEN RETURN jsonb_build_object('ok',false,'code',CASE WHEN SQLERRM='WORKSPACE_BUSY' THEN 'BUSY' ELSE 'ARCHIVED' END);
 WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code','UNAVAILABLE');
END $fn$;

CREATE OR REPLACE FUNCTION public.save_interview_draft(p_project_id uuid,p_draft_id uuid,p_expected_revision bigint,p_mutation_id uuid,p_contact_id uuid,p_document jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid();d public.interview_drafts%ROWTYPE;archived timestamptz;hash text;questions jsonb;
BEGIN
 SELECT archived_at INTO archived FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO d FROM public.interview_drafts WHERE id=p_draft_id AND user_id=actor AND project_id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF d.status='completed' THEN RETURN jsonb_build_object('ok',false,'code','ALREADY_COMPLETED');END IF;
 IF p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 1 AND 9007199254740991 OR p_mutation_id IS NULL OR NOT firstten_private.valid_interview_draft(p_document) THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 IF archived IS NOT NULL AND NOT firstten_private.draft_privacy_clear(d.document,p_document) THEN RETURN jsonb_build_object('ok',false,'code','ARCHIVED');END IF;
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

CREATE OR REPLACE FUNCTION public.save_discovery_workspace(p_project_id uuid,p_expected_revision bigint,p_mutation_id uuid,p_document jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE actor uuid:=auth.uid(); current_row public.discovery_workspaces%ROWTYPE; saved public.discovery_workspaces%ROWTYPE; d jsonb; hash text; stamp timestamptz; k text; item jsonb; old_item jsonb; ord bigint; archived timestamptz; old_history jsonb;
BEGIN
 IF actor IS NULL THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); END IF;
 SELECT archived_at INTO archived FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>9007199254740991 OR p_mutation_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_DOCUMENT'); END IF;
 d:=firstten_private.normalize_discovery(p_document);
 hash:=encode(sha256(convert_to(jsonb_build_object('revision',p_expected_revision,'document',d)::text,'UTF8')),'hex');
 SELECT * INTO current_row FROM public.discovery_workspaces WHERE project_id=p_project_id AND user_id=actor FOR UPDATE;
 IF archived IS NOT NULL AND (current_row.id IS NULL OR NOT firstten_private.discovery_exclusion_only(current_row.document,d)) THEN RETURN jsonb_build_object('ok',false,'code','ARCHIVED'); END IF;
 IF current_row.last_mutation_id=p_mutation_id THEN
  IF current_row.last_mutation_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT','currentRevision',current_row.revision); END IF;
  RETURN jsonb_build_object('ok',true)||firstten_private.discovery_record(current_row);
 END IF;
 IF coalesce(current_row.revision,0)<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT','currentRevision',coalesce(current_row.revision,0)); END IF;
 IF archived IS NOT NULL THEN
  UPDATE public.discovery_workspaces SET document=d,revision=least(current_row.revision+1,9007199254740991),last_mutation_id=p_mutation_id,last_mutation_hash=hash,updated_at=clock_timestamp() WHERE id=current_row.id RETURNING * INTO saved;
  RETURN jsonb_build_object('ok',true)||firstten_private.discovery_record(saved);
 END IF;
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

-- A generated replacement is a content mutation even when its rows are empty.
CREATE OR REPLACE FUNCTION public.save_generated_outreach(p_project_id uuid,p_stage integer,p_origin_id uuid,p_rows jsonb,p_survey jsonb DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE row_data jsonb; current_stage integer; target_kind text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Project access unavailable' USING ERRCODE='42501'; END IF;
  SELECT stage INTO current_stage FROM public.projects WHERE id=p_project_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project access unavailable' USING ERRCODE='42501'; END IF;
  IF firstten_private.workspace_is_archived(p_project_id,auth.uid()) THEN RAISE EXCEPTION 'WORKSPACE_ARCHIVED' USING ERRCODE='PT409'; END IF;
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

COMMIT;
