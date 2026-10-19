-- CLS009 phase5 candidate: closed reviewed growth copies. Source27 remains immutable.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE firstten_private.growth_submission_choices(
 artifact_id uuid NOT NULL,class_id uuid NOT NULL,team_id uuid NOT NULL,principal_id uuid NOT NULL,
 choice text NOT NULL CHECK(choice IN('unknown','granted','withdrawn')),last_reduction_id uuid,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(artifact_id,principal_id),
 FOREIGN KEY(artifact_id)REFERENCES firstten_private.guest_growth_artifacts(id)ON DELETE CASCADE,
 FOREIGN KEY(principal_id,class_id,team_id)REFERENCES public.class_guest_principals(id,class_id,team_id)ON DELETE CASCADE
);
CREATE TABLE firstten_private.growth_submission_threads(
 id uuid PRIMARY KEY,class_id uuid NOT NULL,team_id uuid NOT NULL,principal_id uuid NOT NULL,artifact_id uuid NOT NULL,assignment_id uuid NOT NULL,
 last_version integer NOT NULL DEFAULT 0 CHECK(last_version BETWEEN 0 AND 20),
 UNIQUE(principal_id,artifact_id,assignment_id),
 FOREIGN KEY(artifact_id)REFERENCES firstten_private.guest_growth_artifacts(id)ON DELETE CASCADE,
 FOREIGN KEY(principal_id,class_id,team_id)REFERENCES public.class_guest_principals(id,class_id,team_id)ON DELETE CASCADE,
 FOREIGN KEY(assignment_id,class_id)REFERENCES public.assignments(id,class_id)ON DELETE CASCADE
);
CREATE TABLE firstten_private.growth_submission_previews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),thread_id uuid NOT NULL REFERENCES firstten_private.growth_submission_threads(id)ON DELETE CASCADE,
 request_id uuid NOT NULL,specification jsonb NOT NULL CHECK(octet_length(firstten_private.guest_growth_json(specification))<=65536),binding_hash text NOT NULL CHECK(binding_hash~'^[a-f0-9]{64}$'),
 manifest jsonb NOT NULL CHECK(octet_length(manifest::text)<=40000),payload jsonb NOT NULL CHECK(octet_length(firstten_private.guest_growth_json(payload))<=40000),expected_version integer NOT NULL CHECK(expected_version BETWEEN 0 AND 19),
 expires_at timestamptz NOT NULL,consumed_snapshot_id uuid,UNIQUE(thread_id,request_id)
);
CREATE TABLE firstten_private.growth_submission_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),thread_id uuid NOT NULL REFERENCES firstten_private.growth_submission_threads(id)ON DELETE CASCADE,
 version integer NOT NULL CHECK(version BETWEEN 1 AND 20),author_label text NOT NULL CHECK(char_length(author_label)BETWEEN 1 AND 80),
 payload jsonb NOT NULL CHECK(octet_length(firstten_private.guest_growth_json(payload))<=40000),manifest jsonb NOT NULL CHECK(octet_length(manifest::text)<=40000),authority jsonb NOT NULL CHECK(octet_length(authority::text)<=4096),
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(thread_id,version)
);
ALTER TABLE firstten_private.growth_submission_previews ADD CONSTRAINT growth_consumed_exists FOREIGN KEY(consumed_snapshot_id)REFERENCES firstten_private.growth_submission_versions(id);
CREATE TABLE firstten_private.growth_submission_grants(
 snapshot_id uuid PRIMARY KEY REFERENCES firstten_private.growth_submission_versions(id)ON DELETE CASCADE,
 state text NOT NULL DEFAULT'active'CHECK(state IN('active','withdrawn')),revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),withdrawn_at timestamptz,withdrawal_request_id uuid,
 CHECK((state='withdrawn')=(withdrawn_at IS NOT NULL))
);
CREATE TABLE firstten_private.growth_submission_operations(
 principal_id uuid NOT NULL REFERENCES public.class_guest_principals(id)ON DELETE CASCADE,operation text NOT NULL CHECK(operation IN('choice','submit','withdraw')),request_id uuid NOT NULL,
 payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),target_id uuid NOT NULL,result_snapshot_id uuid REFERENCES firstten_private.growth_submission_versions(id)ON DELETE CASCADE,
 PRIMARY KEY(principal_id,operation,request_id)
);
CREATE TABLE firstten_private.growth_submission_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),principal_id uuid NOT NULL REFERENCES public.class_guest_principals(id)ON DELETE CASCADE,class_id uuid NOT NULL,thread_id uuid REFERENCES firstten_private.growth_submission_threads(id)ON DELETE CASCADE,
 snapshot_id uuid REFERENCES firstten_private.growth_submission_versions(id)ON DELETE CASCADE,operation text NOT NULL CHECK(operation IN('choice','preview','submit','withdraw')),request_id uuid NOT NULL
);
CREATE INDEX growth_submission_class ON firstten_private.growth_submission_threads(class_id,assignment_id,id);
CREATE INDEX growth_submission_author ON firstten_private.growth_submission_threads(principal_id,id);
DO $$DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['growth_submission_choices','growth_submission_threads','growth_submission_previews','growth_submission_versions','growth_submission_grants','growth_submission_operations','growth_submission_audit']LOOP
 EXECUTE format('ALTER TABLE firstten_private.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON firstten_private.%I FROM PUBLIC,anon,authenticated,service_role',n);END LOOP;END $$;
CREATE FUNCTION firstten_private.growth_handoff_identity()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='growth_submission_versions'THEN RAISE EXCEPTION 'Reviewed growth content is immutable' USING ERRCODE='42501';
 ELSIF TG_TABLE_NAME='growth_submission_threads'THEN
  IF(to_jsonb(NEW)-'last_version')IS DISTINCT FROM(to_jsonb(OLD)-'last_version')OR NEW.last_version<>OLD.last_version+1 THEN RAISE EXCEPTION 'Thread identity is immutable' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='growth_submission_choices'THEN
  IF(to_jsonb(NEW)-ARRAY['choice','revision','last_reduction_id'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['choice','revision','last_reduction_id'])OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Choice identity is immutable' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='growth_submission_grants'THEN
  IF NEW.snapshot_id<>OLD.snapshot_id OR NEW.withdrawal_request_id IS NULL OR OLD.state<>'active'OR NEW.state<>'withdrawn'OR NEW.revision<>OLD.revision+1 OR NEW.withdrawn_at IS NULL THEN RAISE EXCEPTION 'Grant only reduces' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='growth_submission_previews'THEN
  IF(to_jsonb(NEW)-'consumed_snapshot_id')IS DISTINCT FROM(to_jsonb(OLD)-'consumed_snapshot_id')OR OLD.consumed_snapshot_id IS NOT NULL OR NEW.consumed_snapshot_id IS NULL OR NOT EXISTS(SELECT 1 FROM firstten_private.growth_submission_versions WHERE id=NEW.consumed_snapshot_id AND thread_id=OLD.thread_id)THEN RAISE EXCEPTION 'Preview is immutable' USING ERRCODE='42501';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER growth_version_immutable BEFORE UPDATE ON firstten_private.growth_submission_versions FOR EACH ROW EXECUTE FUNCTION firstten_private.growth_handoff_identity();
CREATE TRIGGER growth_thread_identity BEFORE UPDATE ON firstten_private.growth_submission_threads FOR EACH ROW EXECUTE FUNCTION firstten_private.growth_handoff_identity();
CREATE TRIGGER growth_choice_identity BEFORE UPDATE ON firstten_private.growth_submission_choices FOR EACH ROW EXECUTE FUNCTION firstten_private.growth_handoff_identity();
CREATE TRIGGER growth_grant_reduces BEFORE UPDATE ON firstten_private.growth_submission_grants FOR EACH ROW EXECUTE FUNCTION firstten_private.growth_handoff_identity();
CREATE TRIGGER growth_preview_identity BEFORE UPDATE ON firstten_private.growth_submission_previews FOR EACH ROW EXECUTE FUNCTION firstten_private.growth_handoff_identity();
-- DELETE remains available to genuine parent cascades; no append-only/delete trap.
CREATE TRIGGER growth_audit_append_only BEFORE UPDATE OR TRUNCATE ON firstten_private.growth_submission_audit FOR EACH STATEMENT EXECUTE FUNCTION firstten_private.deny_admin_audit_change();
CREATE FUNCTION firstten_private.growth_choice_view(p_artifact uuid,p_principal uuid)RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('sourceKind','guest_growth','artifactId',p_artifact,'choice',coalesce(c.choice,'unknown'),'revision',coalesce(c.revision,0))FROM(VALUES(1))x LEFT JOIN firstten_private.growth_submission_choices c ON c.artifact_id=p_artifact AND c.principal_id=p_principal
$$;
CREATE FUNCTION firstten_private.growth_publication_bytes(p_principal uuid,p_class uuid,p_add bigint)RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 WITH stored AS(
 SELECT t.principal_id,t.class_id,octet_length(p.payload::text)+octet_length(p.manifest::text)+octet_length(p.specification::text) AS bytes FROM firstten_private.growth_submission_previews p JOIN firstten_private.growth_submission_threads t ON t.id=p.thread_id WHERE t.class_id=p_class
 UNION ALL SELECT t.principal_id,t.class_id,octet_length(v.payload::text)+octet_length(v.manifest::text)+octet_length(v.authority::text) FROM firstten_private.growth_submission_versions v JOIN firstten_private.growth_submission_threads t ON t.id=v.thread_id WHERE t.class_id=p_class)
 SELECT coalesce(sum(bytes)FILTER(WHERE principal_id=p_principal),0)+p_add<=2097152 AND coalesce(sum(bytes),0)+p_add<=16777216 FROM stored
$$;

CREATE FUNCTION firstten_private.growth_publication_authority(p public.class_guest_principals,p_assignment uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g jsonb;a public.assignments;label text;
BEGIN
 g:=firstten_private.guest_growth_authority(p);
 SELECT live_assignment.* INTO a FROM public.assignments AS live_assignment WHERE live_assignment.id=p_assignment AND live_assignment.class_id=p.class_id AND live_assignment.state='published'FOR SHARE;
 IF g IS NULL OR a.id IS NULL THEN RETURN NULL;END IF;
 label:=firstten_private.submission_scrub(g->>'principalAlias');
 IF char_length(label)NOT BETWEEN 1 AND 80 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('label',label,'classRevision',g->'classRevision','assignmentRevision',a.revision,'accessExpiresAt',g->'accessExpiresAt','teamGeneration',g->'teamGeneration','principalGeneration',g->'principalGeneration','resolverVersion','guest-growth-v1');
END $$;
CREATE FUNCTION firstten_private.growth_handoff_finish(p_session text,p public.class_guest_principals,authority jsonb,p_assignment uuid DEFAULT NULL)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF(firstten_private.resolve_guest(p_session)).id IS DISTINCT FROM p.id OR authority IS NULL OR CASE WHEN p_assignment IS NULL THEN firstten_private.guest_growth_authority(p) ELSE firstten_private.growth_publication_authority(p,p_assignment) END IS DISTINCT FROM authority THEN RAISE EXCEPTION 'Growth handoff scope ended' USING ERRCODE='PGX02';END IF;
END $$;
-- Metadata-only exact graph. No source body is read by this resolver or teacher eligibility.
CREATE FUNCTION firstten_private.growth_handoff_manifest(p public.class_guest_principals,a firstten_private.guest_growth_artifacts,r integer,require_choice boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE item record;src firstten_private.guest_growth_artifacts;v record;c firstten_private.growth_submission_choices;author public.class_guest_principals;items jsonb:='[]';n integer;depth integer;
BEGIN
 IF NOT firstten_private.guest_growth_access(a,p)OR NOT firstten_private.guest_growth_lineage(p,a,r)THEN RETURN NULL;END IF;
 WITH RECURSIVE refs(id,rev,d)AS(SELECT a.id,r,0 UNION SELECT e.source_id,e.source_revision,x.d+1 FROM refs x JOIN firstten_private.guest_growth_reference_edges e ON e.artifact_id=x.id AND e.revision=x.rev WHERE x.d<4)SELECT count(*),max(d)INTO n,depth FROM(SELECT DISTINCT id,rev,d FROM refs)x;
 IF n>32 OR depth>3 THEN RETURN NULL;END IF;
 FOR item IN WITH RECURSIVE refs(id,rev)AS(SELECT a.id,r UNION SELECT e.source_id,e.source_revision FROM refs x JOIN firstten_private.guest_growth_reference_edges e ON e.artifact_id=x.id AND e.revision=x.rev)SELECT DISTINCT id,rev FROM refs ORDER BY id,rev LOOP
  SELECT x.* INTO src FROM firstten_private.guest_growth_artifacts x WHERE x.id=item.id FOR SHARE;
  -- Select ONLY immutable metadata; raw document is deliberately not selected.
  SELECT artifact_id,revision,reference_count,reference_digest INTO v FROM firstten_private.guest_growth_versions WHERE artifact_id=item.id AND revision=item.rev;
  IF v.artifact_id IS NULL OR NOT firstten_private.guest_growth_access(src,p)OR(a.audience='team_shared'AND src.audience<>'team_shared')THEN RETURN NULL;END IF;
  SELECT x.* INTO author FROM public.class_guest_principals x WHERE x.id=src.author_principal_id AND x.class_id=p.class_id AND x.team_id=p.team_id AND x.revoked_at IS NULL FOR SHARE;
  IF author.id IS NULL THEN RETURN NULL;END IF;
  SELECT x.* INTO c FROM firstten_private.growth_submission_choices x WHERE x.artifact_id=src.id AND x.principal_id=p.id;
  IF require_choice AND c.choice IS DISTINCT FROM'granted'THEN RETURN NULL;END IF;
  items:=items||jsonb_build_array(jsonb_build_object('artifactId',src.id,'revision',item.rev,'kind',src.kind,'audience',src.audience,'authorPrincipalId',src.author_principal_id,'sourcePrincipalGeneration',author.access_revision,'choice',coalesce(c.choice,'unknown'),'choiceRevision',coalesce(c.revision,0),'referenceCount',v.reference_count,'referenceDigest',v.reference_digest));
 END LOOP;
 RETURN jsonb_build_object('resolverVersion','guest-growth-v1','artifactId',a.id,'revision',r,'publisher',p.id,'sources',items);
END $$;
CREATE FUNCTION public.get_guest_growth_handoff_sources(p_session text,p_artifact_id uuid,p_revision integer)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_growth_artifacts;g jsonb;m jsonb;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 g:=firstten_private.guest_growth_authority(p);SELECT x.* INTO a FROM firstten_private.guest_growth_artifacts x WHERE x.id=p_artifact_id FOR SHARE;
 m:=firstten_private.growth_handoff_manifest(p,a,p_revision,false);IF m IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 PERFORM firstten_private.growth_handoff_finish(p_session,p,g);
 RETURN jsonb_build_object('ok',true,'data',m||jsonb_build_object('threads',(SELECT coalesce(jsonb_agg(jsonb_build_object('assignmentId',assignment_id,'threadId',id)ORDER BY id),'[]'::jsonb)FROM firstten_private.growth_submission_threads WHERE principal_id=p.id AND artifact_id=a.id)));
EXCEPTION WHEN SQLSTATE'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END $$;
-- Exact section projections intentionally exclude reference bodies and hidden/private interview data.
CREATE FUNCTION firstten_private.growth_handoff_section(d jsonb,item jsonb)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE k text:=d->>'kind';part text:=item->>'section';f text;keys text[];src jsonb:='{}';
BEGIN
 IF item->>'kind'IS DISTINCT FROM k OR jsonb_typeof(item)IS DISTINCT FROM'object'OR NOT item?&ARRAY['kind','section']OR EXISTS(SELECT 1 FROM jsonb_object_keys(item)x WHERE x NOT IN('kind','section','excerpt','questionId'))THEN RAISE EXCEPTION 'Invalid growth selection' USING ERRCODE='22023';END IF;
 IF k IN('survey','onboarding')AND part='question'THEN
  IF jsonb_typeof(item->'questionId')IS DISTINCT FROM'string'THEN RAISE EXCEPTION 'Question ID required' USING ERRCODE='22023';END IF;
  SELECT x INTO src FROM jsonb_array_elements(d->'questions')x WHERE x->>'id'=lower(item->>'questionId');
  IF src IS NULL THEN RAISE EXCEPTION 'Missing exact retained question' USING ERRCODE='22023';END IF;RETURN src-'id';
 ELSIF item?'questionId'THEN RAISE EXCEPTION 'Unexpected question ID' USING ERRCODE='22023';END IF;
 keys:=CASE k
 WHEN'learning'THEN CASE part WHEN'best_fit'THEN ARRAY['bestFit']WHEN'proposed_changes'THEN ARRAY['proposedChanges']WHEN'next_test'THEN ARRAY['nextTest']WHEN'review'THEN ARRAY['form','reviewState','reviewedAt']WHEN'observations'THEN ARRAY['observations']WHEN'patterns'THEN ARRAY['patterns']WHEN'objections'THEN ARRAY['objections']WHEN'interpretation'THEN ARRAY['interpretation']WHEN'counterevidence'THEN ARRAY['counterevidence']WHEN'uncertainty'THEN ARRAY['uncertainty']END
 WHEN'experiment'THEN CASE part WHEN'plan'THEN ARRAY['hypothesis','change','audience','procedure']WHEN'criterion'THEN ARRAY['criterion']WHEN'reported_result'THEN ARRAY['reportedResult']WHEN'reported_state'THEN ARRAY['state','reportedStartOn']END
 WHEN'pipeline_contact'THEN CASE part WHEN'alias'THEN ARRAY['alias','relationship']WHEN'fit'THEN ARRAY['relevantExperience','fitReason','source','uncertainty']WHEN'reported_status'THEN ARRAY['status','reportedOn','statusBasis']WHEN'next_action'THEN ARRAY['nextAction']END
 WHEN'survey'THEN CASE part WHEN'introduction'THEN ARRAY['purpose','audience','introduction','permissionReminder','delivery','collection']END
 WHEN'referral'THEN CASE part WHEN'recipient_role'THEN ARRAY['recipientAlias','recipientRole','relevantPersonCriteria']WHEN'draft'THEN ARRAY['builderDisclosure','context','body','delivery']WHEN'specific_ask'THEN ARRAY['specificAsk']WHEN'safe_exit'THEN ARRAY['respectfulExit']END
 WHEN'onboarding'THEN CASE part WHEN'goal'THEN ARRAY['audience','userGoal']WHEN'first_action'THEN ARRAY['firstAction','successObservationPlan']WHEN'walkthrough'THEN ARRAY['walkthroughPrompt','anticipatedHesitation','delivery','collection']END END;
 IF keys IS NULL THEN RAISE EXCEPTION 'Unknown section' USING ERRCODE='22023';END IF;
 FOREACH f IN ARRAY keys LOOP IF NOT d?f THEN RAISE EXCEPTION 'Unavailable section field' USING ERRCODE='22023';END IF;src:=src||jsonb_build_object(f,d->f);END LOOP;RETURN src;
END $$;

CREATE FUNCTION public.get_guest_growth_sharing_choice(p_session text,p_artifact_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_growth_artifacts;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 SELECT * INTO a FROM firstten_private.guest_growth_artifacts WHERE id=p_artifact_id;
 IF NOT firstten_private.guest_growth_access(a,p)OR(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.growth_choice_view(a.id,p.id));
END $$;
CREATE FUNCTION public.save_guest_growth_sharing_choice(p_session text,p_artifact_id uuid,p_choice text,p_expected_revision bigint,p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_growth_artifacts;c firstten_private.growth_submission_choices;op firstten_private.growth_submission_operations;hash text;g jsonb;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;g:=firstten_private.guest_growth_authority(p);
 IF p_choice IS NULL OR p_choice NOT IN('unknown','granted','withdrawn')OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990 OR(p_expected_revision=9007199254740990 AND p_choice<>'withdrawn')THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 SELECT x.* INTO a FROM firstten_private.guest_growth_artifacts x WHERE x.id=p_artifact_id FOR SHARE;
 IF NOT firstten_private.guest_growth_access(a,p)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT x.* INTO c FROM firstten_private.growth_submission_choices x WHERE x.artifact_id=a.id AND x.principal_id=p.id FOR UPDATE;
 hash:=firstten_private.guest_growth_hash(jsonb_build_object('artifact',a.id,'choice',p_choice,'revision',p_expected_revision));
 SELECT x.* INTO op FROM firstten_private.growth_submission_operations x WHERE x.principal_id=p.id AND x.operation='choice'AND x.request_id=p_request_id;
 IF op.request_id IS NOT NULL THEN IF op.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
 ELSIF p_choice='withdrawn'THEN
  -- One bounded row holds the monotone reduction receipt, regardless of ordinary caps.
  IF EXISTS(SELECT 1 FROM firstten_private.growth_submission_choices WHERE principal_id=p.id AND last_reduction_id=p_request_id AND artifact_id<>a.id)OR(c.last_reduction_id=p_request_id AND(c.choice<>'withdrawn'OR c.revision<>p_expected_revision+1))THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
  IF c.choice IS DISTINCT FROM'withdrawn'THEN
   IF coalesce(c.revision,0)<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT','currentRevision',coalesce(c.revision,0));END IF;
   INSERT INTO firstten_private.growth_submission_choices(artifact_id,class_id,team_id,principal_id,choice,revision,last_reduction_id)VALUES(a.id,p.class_id,p.team_id,p.id,'withdrawn',1,p_request_id)ON CONFLICT(artifact_id,principal_id)DO UPDATE SET choice='withdrawn',revision=growth_submission_choices.revision+1,last_reduction_id=p_request_id;
  END IF;
 ELSE
  IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
  IF coalesce(c.revision,0)<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','CONFLICT','currentRevision',coalesce(c.revision,0));END IF;
  IF(SELECT count(*)FROM firstten_private.growth_submission_operations WHERE principal_id=p.id)>=2000 OR(SELECT count(*)FROM firstten_private.growth_submission_audit WHERE principal_id=p.id)>=5000 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  INSERT INTO firstten_private.growth_submission_choices(artifact_id,class_id,team_id,principal_id,choice,revision)VALUES(a.id,p.class_id,p.team_id,p.id,p_choice,1)ON CONFLICT(artifact_id,principal_id)DO UPDATE SET choice=p_choice,revision=growth_submission_choices.revision+1;
  INSERT INTO firstten_private.growth_submission_operations(principal_id,operation,request_id,payload_hash,target_id)VALUES(p.id,'choice',p_request_id,hash,a.id);
  INSERT INTO firstten_private.growth_submission_audit(principal_id,class_id,operation,request_id)VALUES(p.id,p.class_id,'choice',p_request_id);
 END IF;
 PERFORM firstten_private.growth_handoff_finish(p_session,p,g);
 RETURN jsonb_build_object('ok',true,'data',firstten_private.growth_choice_view(a.id,p.id));
EXCEPTION WHEN SQLSTATE'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');WHEN invalid_parameter_value OR invalid_text_representation OR check_violation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END $$;
CREATE FUNCTION firstten_private.build_growth_publication(a firstten_private.guest_growth_artifacts,p public.class_guest_principals,spec jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item jsonb;phrase jsonb;k text;f text;body text;d jsonb;payload jsonb:='{"schemaVersion":1,"resolverVersion":"guest-growth-v1","sourceKind":"guest_growth"}';excerpts jsonb:='[]';manifest jsonb;seen text[]:='{}';key text;n integer:=0;r integer;
BEGIN
 IF NOT firstten_private.guest_growth_access(a,p)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF spec IS NULL OR jsonb_typeof(spec)IS DISTINCT FROM'object'OR octet_length(firstten_private.guest_growth_json(spec))>65536 OR(SELECT count(*)FROM jsonb_object_keys(spec))<>8 OR NOT spec?&ARRAY['artifactId','expectedRevision','assignmentId','threadId','requestId','selections','redactions','reflection']THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 IF jsonb_typeof(spec->'expectedRevision')IS DISTINCT FROM'number'OR(spec->>'expectedRevision')::numeric NOT BETWEEN 1 AND 40 OR(spec->>'expectedRevision')::numeric<>trunc((spec->>'expectedRevision')::numeric)THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;r:=(spec->>'expectedRevision')::integer;
 manifest:=firstten_private.growth_handoff_manifest(p,a,r);IF manifest IS NULL THEN RETURN jsonb_build_object('ok',false,'code','SHARING_REQUIRED');END IF;
 SELECT document INTO d FROM firstten_private.guest_growth_versions WHERE artifact_id=a.id AND revision=r FOR SHARE;
 IF d IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 -- Exact hashes are captured once for preview/confirm. Teacher checks never reread bodies.
 manifest:=manifest||jsonb_build_object('sourceHashes',(SELECT jsonb_agg(jsonb_build_object('artifactId',v.artifact_id,'revision',v.revision,'hash',firstten_private.guest_growth_hash(v.document))ORDER BY v.artifact_id,v.revision)FROM jsonb_array_elements(manifest->'sources')x JOIN firstten_private.guest_growth_versions v ON v.artifact_id=(x->>'artifactId')::uuid AND v.revision=(x->>'revision')::integer));
 IF jsonb_typeof(spec->'selections')IS DISTINCT FROM'array'OR jsonb_array_length(spec->'selections')NOT BETWEEN 1 AND 12 OR jsonb_typeof(spec->'redactions')IS DISTINCT FROM'array'OR jsonb_array_length(spec->'redactions')>30 OR jsonb_typeof(spec->'reflection')IS DISTINCT FROM'object'OR(SELECT count(*)FROM jsonb_object_keys(spec->'reflection'))<>5 OR NOT(spec->'reflection')?&ARRAY['title','interpretation','uncertainty','decision','nextAction']THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 FOR phrase IN SELECT value FROM jsonb_array_elements(spec->'redactions')LOOP IF jsonb_typeof(phrase)IS DISTINCT FROM'string'OR char_length(firstten_private.guest_growth_trim(phrase#>>'{}'))NOT BETWEEN 1 AND 200 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;END LOOP;
 FOREACH f IN ARRAY ARRAY['title','interpretation','uncertainty','decision','nextAction']LOOP
  body:=spec->'reflection'->>f;
  IF jsonb_typeof(spec->'reflection'->f)IS DISTINCT FROM'string'OR char_length(body)>(CASE WHEN f='title'THEN 120 WHEN f='interpretation'THEN 3000 ELSE 2000 END)OR(f='title'AND firstten_private.guest_growth_trim(body)='')THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  FOR phrase IN SELECT value FROM jsonb_array_elements(spec->'redactions')LOOP body:=replace(body,phrase#>>'{}','[Redacted]');END LOOP;body:=firstten_private.submission_scrub(body);
  IF char_length(body)>(CASE WHEN f='title'THEN 120 WHEN f='interpretation'THEN 3000 ELSE 2000 END)OR(f='title'AND firstten_private.guest_growth_trim(body)='')THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;payload:=payload||jsonb_build_object(f,body);
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(spec->'selections')LOOP
  body:=firstten_private.guest_growth_json(firstten_private.growth_handoff_section(d,item));key:=firstten_private.guest_growth_json(jsonb_build_array(item->'kind',item->'section',item->'questionId'));
  IF key=ANY(seen)THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;seen:=array_append(seen,key);
  IF item?'excerpt'THEN IF jsonb_typeof(item->'excerpt')IS DISTINCT FROM'string'OR char_length(item->>'excerpt')NOT BETWEEN 1 AND 6000 OR strpos(body,item->>'excerpt')=0 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;body:=item->>'excerpt';END IF;
  IF char_length(body)NOT BETWEEN 1 AND 6000 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
  FOR phrase IN SELECT value FROM jsonb_array_elements(spec->'redactions')LOOP body:=replace(body,phrase#>>'{}','[Redacted]');END LOOP;body:=firstten_private.submission_scrub(body);
  IF char_length(body)NOT BETWEEN 1 AND 6000 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;n:=n+1;
  excerpts:=excerpts||jsonb_build_array(jsonb_build_object('key','excerpt.'||n,'label',a.kind||' - '||(item->>'section')||CASE WHEN item?'excerpt'THEN' — literal excerpt'ELSE''END,'text',body,'evidenceLabel','Student-authored / student-reported; not verified customer evidence'));
 END LOOP;
 payload:=payload||jsonb_build_object('excerpts',excerpts);
 IF octet_length(firstten_private.guest_growth_json(payload))>40000 OR payload::text~*'-----BEGIN [A-Z ]*PRIVATE KEY-----|(sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9._-]{16,}|(^|[^A-Za-z0-9_])[a-f0-9]{64}($|[^A-Za-z0-9_])'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 RETURN jsonb_build_object('ok',true,'payload',payload,'manifest',manifest);
END $$;
CREATE FUNCTION public.preview_guest_growth_submission(p_session text,p_document jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_growth_artifacts;t firstten_private.growth_submission_threads;preview firstten_private.growth_submission_previews;authority jsonb;built jsonb;binding text;tid uuid;rid uuid;aid uuid;pid uuid;result jsonb;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 IF p_document IS NULL OR jsonb_typeof(p_document)IS DISTINCT FROM'object'OR octet_length(firstten_private.guest_growth_json(p_document))>65536 OR(SELECT count(*)FROM jsonb_object_keys(p_document))<>8 OR NOT p_document?&ARRAY['artifactId','expectedRevision','assignmentId','threadId','requestId','selections','redactions','reflection']OR jsonb_typeof(p_document->'expectedRevision')IS DISTINCT FROM'number'OR(p_document->>'expectedRevision')::numeric NOT BETWEEN 1 AND 40 OR(p_document->>'expectedRevision')::numeric<>trunc((p_document->>'expectedRevision')::numeric)THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 tid:=(p_document->>'threadId')::uuid;rid:=(p_document->>'requestId')::uuid;aid:=(p_document->>'assignmentId')::uuid;pid:=(p_document->>'artifactId')::uuid;
 IF tid IS NULL OR rid IS NULL OR aid IS NULL OR pid IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 authority:=firstten_private.growth_publication_authority(p,aid);IF authority IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;IF authority?'invalidLabel'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 SELECT * INTO a FROM firstten_private.guest_growth_artifacts WHERE id=pid FOR SHARE;
 built:=firstten_private.build_growth_publication(a,p,p_document);IF built->>'ok'<>'true'THEN RETURN built;END IF;
 IF EXISTS(SELECT 1 FROM firstten_private.growth_submission_threads WHERE id=tid AND(principal_id<>p.id OR artifact_id<>pid OR class_id<>p.class_id OR team_id<>p.team_id OR assignment_id<>aid))THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO t FROM firstten_private.growth_submission_threads WHERE principal_id=p.id AND artifact_id=pid AND assignment_id=aid FOR UPDATE;
 IF t.id IS NOT NULL AND t.id<>tid THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
 IF t.id IS NULL THEN
  IF(SELECT count(*)FROM firstten_private.growth_submission_threads WHERE principal_id=p.id)>=50 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  INSERT INTO firstten_private.growth_submission_threads(id,class_id,team_id,principal_id,artifact_id,assignment_id)VALUES(tid,p.class_id,p.team_id,p.id,pid,aid)RETURNING * INTO t;
 END IF;
 binding:=encode(sha256(convert_to(jsonb_build_object('authority',authority,'manifest',built->'manifest','payload',built->'payload','version',t.last_version)::text,'UTF8')),'hex');
 SELECT * INTO preview FROM firstten_private.growth_submission_previews WHERE thread_id=t.id AND request_id=rid;
 IF preview.id IS NOT NULL THEN
  IF preview.specification<>p_document THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
  IF preview.expires_at<=clock_timestamp()OR preview.consumed_snapshot_id IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','EXPIRED');END IF;
  IF preview.binding_hash<>binding THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
 ELSE
  IF t.last_version>=20 OR(SELECT count(*)FROM firstten_private.growth_submission_audit WHERE principal_id=p.id)>=5000 OR(SELECT count(*)FROM firstten_private.growth_submission_previews WHERE thread_id=t.id)>=50 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  binding:=encode(sha256(convert_to(jsonb_build_object('authority',authority,'manifest',built->'manifest','payload',built->'payload','version',t.last_version)::text,'UTF8')),'hex');
  IF NOT firstten_private.growth_publication_bytes(p.id,p.class_id,octet_length((built->'payload')::text)+octet_length((built->'manifest')::text)+octet_length(p_document::text))THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  INSERT INTO firstten_private.growth_submission_previews(thread_id,request_id,specification,binding_hash,manifest,payload,expected_version,expires_at)VALUES(t.id,rid,p_document,binding,built->'manifest',built->'payload',t.last_version,least(clock_timestamp()+interval'10 minutes',(authority->>'accessExpiresAt')::timestamptz))RETURNING * INTO preview;
  INSERT INTO firstten_private.growth_submission_audit(principal_id,class_id,thread_id,operation,request_id)VALUES(p.id,p.class_id,t.id,'preview',rid);
 END IF;
 result:=jsonb_build_object('ok',true,'data',jsonb_build_object('id',preview.id,'hash',preview.binding_hash,'threadId',t.id,'expiresAt',preview.expires_at,'audience','teacher','payload',preview.payload));
 PERFORM firstten_private.growth_handoff_finish(p_session,p,authority,aid);
 RETURN result;
EXCEPTION WHEN SQLSTATE'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');WHEN invalid_parameter_value OR invalid_text_representation OR check_violation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END $$;
CREATE FUNCTION firstten_private.growth_publication_allowed(p_snapshot uuid)RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v firstten_private.growth_submission_versions;t firstten_private.growth_submission_threads;p public.class_guest_principals;a firstten_private.guest_growth_artifacts;m jsonb;
BEGIN
 SELECT x.* INTO v FROM firstten_private.growth_submission_versions x WHERE x.id=p_snapshot;
 SELECT x.* INTO t FROM firstten_private.growth_submission_threads x WHERE x.id=v.thread_id;
 IF t.id IS NULL OR NOT EXISTS(SELECT 1 FROM firstten_private.growth_submission_grants WHERE snapshot_id=v.id AND state='active')THEN RETURN false;END IF;
 SELECT x.* INTO p FROM public.class_guest_principals x WHERE x.id=t.principal_id;
 IF firstten_private.growth_publication_authority(p,t.assignment_id)IS DISTINCT FROM v.authority THEN RETURN false;END IF;
 SELECT x.* INTO a FROM firstten_private.guest_growth_artifacts x WHERE x.id=t.artifact_id;
 m:=firstten_private.growth_handoff_manifest(p,a,(v.manifest->>'revision')::integer);
 IF m IS NULL OR m<>(v.manifest-'sourceHashes')THEN RETURN false;END IF;
 IF firstten_private.growth_publication_authority(p,t.assignment_id)IS DISTINCT FROM v.authority THEN RETURN false;END IF;
 RETURN clock_timestamp()<(v.authority->>'accessExpiresAt')::timestamptz;
END $$;
CREATE FUNCTION firstten_private.growth_submission_view(v firstten_private.growth_submission_versions,include_payload boolean DEFAULT true)RETURNS jsonb
LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',v.id,'threadId',t.id,'classId',t.class_id,'assignmentId',t.assignment_id,'sourceType','guest_growth','version',v.version,'audience','teacher','authorLabel',v.author_label,'submittedAt',v.submitted_at,'grantState',g.state,'grantRevision',g.revision,'recipientEligible',firstten_private.growth_publication_allowed(v.id),'title',v.payload->>'title')||CASE WHEN include_payload THEN jsonb_build_object('payload',v.payload)ELSE'{}'::jsonb END FROM firstten_private.growth_submission_threads t JOIN firstten_private.growth_submission_grants g ON g.snapshot_id=v.id WHERE t.id=v.thread_id
$$;
CREATE FUNCTION public.confirm_guest_growth_submission(p_session text,p_preview_id uuid,p_preview_hash text,p_request_id uuid,p_confirmed boolean)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;a firstten_private.guest_growth_artifacts;t firstten_private.growth_submission_threads;preview firstten_private.growth_submission_previews;v firstten_private.growth_submission_versions;op firstten_private.growth_submission_operations;authority jsonb;built jsonb;binding text;hash text;target uuid;scope_authority jsonb;result jsonb;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 IF p_confirmed IS DISTINCT FROM true OR p_preview_id IS NULL OR p_request_id IS NULL OR p_preview_hash IS NULL OR p_preview_hash!~'^[a-f0-9]{64}$'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 scope_authority:=firstten_private.guest_growth_authority(p);
 SELECT thread_id INTO target FROM firstten_private.growth_submission_previews WHERE id=p_preview_id;
 SELECT * INTO t FROM firstten_private.growth_submission_threads WHERE id=target AND principal_id=p.id AND class_id=p.class_id AND team_id=p.team_id FOR UPDATE;
 IF t.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT * INTO preview FROM firstten_private.growth_submission_previews WHERE id=p_preview_id AND thread_id=t.id FOR UPDATE;
 IF preview.binding_hash IS DISTINCT FROM p_preview_hash THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
 hash:=encode(sha256(convert_to(jsonb_build_object('preview',p_preview_id,'hash',p_preview_hash,'confirmed',p_confirmed)::text,'UTF8')),'hex');
 SELECT * INTO op FROM firstten_private.growth_submission_operations WHERE principal_id=p.id AND operation='submit'AND request_id=p_request_id;
 IF op.request_id IS NOT NULL THEN
  IF op.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
  SELECT * INTO v FROM firstten_private.growth_submission_versions WHERE id=op.result_snapshot_id;
 ELSE
  IF(SELECT count(*)FROM firstten_private.growth_submission_operations WHERE principal_id=p.id)>=2000 OR(SELECT count(*)FROM firstten_private.growth_submission_audit WHERE principal_id=p.id)>=5000 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
  IF preview.consumed_snapshot_id IS NOT NULL THEN SELECT * INTO v FROM firstten_private.growth_submission_versions WHERE id=preview.consumed_snapshot_id;
  ELSE
   IF preview.expires_at<=clock_timestamp()THEN RETURN jsonb_build_object('ok',false,'code','EXPIRED');END IF;
   IF t.last_version<>preview.expected_version THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
   authority:=firstten_private.growth_publication_authority(p,t.assignment_id);IF authority IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;IF authority?'invalidLabel'THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
   SELECT * INTO a FROM firstten_private.guest_growth_artifacts WHERE id=t.artifact_id FOR SHARE;
   built:=firstten_private.build_growth_publication(a,p,preview.specification);IF built->>'ok'<>'true'THEN RETURN built;END IF;
   binding:=encode(sha256(convert_to(jsonb_build_object('authority',authority,'manifest',built->'manifest','payload',built->'payload','version',t.last_version)::text,'UTF8')),'hex');
   IF binding<>preview.binding_hash THEN RETURN jsonb_build_object('ok',false,'code','CHANGED');END IF;
   IF(SELECT count(*)FROM firstten_private.growth_submission_operations WHERE principal_id=p.id)>=2000 OR NOT firstten_private.growth_publication_bytes(p.id,p.class_id,octet_length(preview.payload::text)+octet_length(preview.manifest::text)+octet_length(authority::text))THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');END IF;
   INSERT INTO firstten_private.growth_submission_versions(thread_id,version,author_label,payload,manifest,authority)VALUES(t.id,t.last_version+1,authority->>'label',preview.payload,preview.manifest,authority)RETURNING * INTO v;
   INSERT INTO firstten_private.growth_submission_grants(snapshot_id)VALUES(v.id);
   UPDATE firstten_private.growth_submission_threads SET last_version=last_version+1 WHERE id=t.id;
   UPDATE firstten_private.growth_submission_previews SET consumed_snapshot_id=v.id WHERE id=preview.id;
   INSERT INTO firstten_private.growth_submission_audit(principal_id,class_id,thread_id,snapshot_id,operation,request_id)VALUES(p.id,p.class_id,t.id,v.id,'submit',p_request_id);
  END IF;
  INSERT INTO firstten_private.growth_submission_operations(principal_id,operation,request_id,payload_hash,target_id,result_snapshot_id)VALUES(p.id,'submit',p_request_id,hash,p_preview_id,v.id);
 END IF;
 result:=jsonb_build_object('ok',true,'data',firstten_private.growth_submission_view(v));
 PERFORM firstten_private.growth_handoff_finish(p_session,p,scope_authority);
 RETURN result;
EXCEPTION WHEN SQLSTATE'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');WHEN invalid_parameter_value OR invalid_text_representation OR check_violation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END $$;
CREATE FUNCTION public.get_guest_growth_submission(p_session text,p_snapshot_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;v firstten_private.growth_submission_versions;authority jsonb;result jsonb;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 authority:=firstten_private.guest_growth_authority(p);
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 SELECT s.* INTO v FROM firstten_private.growth_submission_versions s JOIN firstten_private.growth_submission_threads t ON t.id=s.thread_id WHERE s.id=p_snapshot_id AND t.principal_id=p.id AND t.class_id=p.class_id AND t.team_id=p.team_id;
 IF v.id IS NULL OR(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 result:=jsonb_build_object('ok',true,'data',firstten_private.growth_submission_view(v));
 PERFORM firstten_private.growth_handoff_finish(p_session,p,authority);RETURN result;
 EXCEPTION WHEN SQLSTATE'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END $$;
CREATE FUNCTION public.list_guest_growth_submissions(p_session text,p_cursor uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;items jsonb;next_id uuid;authority jsonb;result jsonb;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 authority:=firstten_private.guest_growth_authority(p);
 IF NOT firstten_private.guest_learning_rate(p.id)THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');END IF;
 SELECT coalesce(jsonb_agg(firstten_private.growth_submission_view(v,false)ORDER BY v.id),'[]')INTO items FROM(SELECT s.* FROM firstten_private.growth_submission_versions s JOIN firstten_private.growth_submission_threads t ON t.id=s.thread_id WHERE t.principal_id=p.id AND t.class_id=p.class_id AND t.team_id=p.team_id AND(p_cursor IS NULL OR s.id>p_cursor)ORDER BY s.id LIMIT 50)v;
 IF jsonb_array_length(items)=50 THEN next_id:=(items->49->>'id')::uuid;END IF;
 IF(firstten_private.resolve_guest(p_session)).id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 result:=jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_id));
 PERFORM firstten_private.growth_handoff_finish(p_session,p,authority);RETURN result;
 EXCEPTION WHEN SQLSTATE'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END $$;
CREATE FUNCTION public.withdraw_guest_growth_submission(p_session text,p_snapshot_id uuid,p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE p public.class_guest_principals;v firstten_private.growth_submission_versions;g firstten_private.growth_submission_grants;authority jsonb;result jsonb;
BEGIN
 p:=firstten_private.lock_guest_learning(p_session);IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;authority:=firstten_private.guest_growth_authority(p);
 IF p_snapshot_id IS NULL OR p_request_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');END IF;
 SELECT s.* INTO v FROM firstten_private.growth_submission_versions s JOIN firstten_private.growth_submission_threads t ON t.id=s.thread_id WHERE s.id=p_snapshot_id AND t.principal_id=p.id AND t.class_id=p.class_id AND t.team_id=p.team_id;
 IF v.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF EXISTS(SELECT 1 FROM firstten_private.growth_submission_grants g JOIN firstten_private.growth_submission_versions x ON x.id=g.snapshot_id JOIN firstten_private.growth_submission_threads t ON t.id=x.thread_id WHERE t.principal_id=p.id AND g.withdrawal_request_id=p_request_id AND g.snapshot_id<>v.id)THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');END IF;
 SELECT x.* INTO g FROM firstten_private.growth_submission_grants x WHERE x.snapshot_id=v.id FOR UPDATE;
 IF g.state='active'THEN UPDATE firstten_private.growth_submission_grants SET state='withdrawn',revision=revision+1,withdrawn_at=clock_timestamp(),withdrawal_request_id=p_request_id WHERE snapshot_id=v.id;END IF;
 result:=jsonb_build_object('ok',true,'data',firstten_private.growth_submission_view(v,false));
 PERFORM firstten_private.growth_handoff_finish(p_session,p,authority);
 RETURN result;
EXCEPTION WHEN SQLSTATE'PGX02'THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END $$;
CREATE FUNCTION public.get_teacher_guest_growth_submission(p_class_id uuid,p_snapshot_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE v firstten_private.growth_submission_versions;r text;result jsonb;
BEGIN
 IF auth.uid()IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 PERFORM 1 FROM public.classes WHERE id=p_class_id FOR SHARE;r:=firstten_private.class_role(p_class_id,false);
 SELECT s.* INTO v FROM firstten_private.growth_submission_versions s JOIN firstten_private.growth_submission_threads t ON t.id=s.thread_id WHERE s.id=p_snapshot_id AND t.class_id=p_class_id;
 IF r IS NULL OR r NOT IN('owner','teacher')OR v.id IS NULL OR NOT firstten_private.growth_publication_allowed(v.id)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 result:=jsonb_build_object('ok',true,'data',firstten_private.growth_submission_view(v));
 IF NOT firstten_private.growth_publication_allowed(v.id)THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF auth.uid()IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 r:=firstten_private.class_role(p_class_id,false);IF coalesce(r,'')NOT IN('owner','teacher')THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF clock_timestamp()>=(v.authority->>'accessExpiresAt')::timestamptz THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN result;END $$;
CREATE FUNCTION public.list_teacher_guest_growth_submissions(p_class_id uuid,p_assignment_id uuid DEFAULT NULL,p_cursor uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE items jsonb;next_id uuid;r text;result jsonb;deadline timestamptz;
BEGIN
 IF auth.uid()IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 PERFORM 1 FROM public.classes WHERE id=p_class_id FOR SHARE;r:=firstten_private.class_role(p_class_id,false);
 IF r IS NULL OR r NOT IN('owner','teacher')THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT coalesce(jsonb_agg(firstten_private.growth_submission_view(v,false)ORDER BY v.id),'[]')INTO items FROM(SELECT s.* FROM firstten_private.growth_submission_versions s JOIN firstten_private.growth_submission_threads t ON t.id=s.thread_id WHERE t.class_id=p_class_id AND(p_assignment_id IS NULL OR t.assignment_id=p_assignment_id)AND(p_cursor IS NULL OR s.id>p_cursor)AND firstten_private.growth_publication_allowed(s.id)ORDER BY s.id LIMIT 50)v;
 IF jsonb_array_length(items)=50 THEN next_id:=(items->49->>'id')::uuid;END IF;
 result:=jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_id));
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items)x WHERE NOT firstten_private.growth_publication_allowed((x->>'id')::uuid))THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 IF auth.uid()IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 r:=firstten_private.class_role(p_class_id,false);IF coalesce(r,'')NOT IN('owner','teacher')THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 SELECT access_expires_at INTO deadline FROM public.classes WHERE id=p_class_id AND archived_at IS NULL;
 IF deadline IS NULL OR clock_timestamp()>=deadline THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');END IF;
 RETURN result;END $$;
DO $$DECLARE r record;BEGIN FOR r IN SELECT p.oid::regprocedure signature,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE(n.nspname='firstten_private'AND p.proname IN('growth_publication_authority','growth_handoff_finish','growth_handoff_manifest','growth_handoff_section','growth_handoff_identity','growth_choice_view','growth_publication_bytes','build_growth_publication','growth_publication_allowed','growth_submission_view'))OR(n.nspname='public'AND p.proname IN('get_guest_growth_handoff_sources','get_guest_growth_sharing_choice','save_guest_growth_sharing_choice','preview_guest_growth_submission','confirm_guest_growth_submission','get_guest_growth_submission','list_guest_growth_submissions','withdraw_guest_growth_submission','get_teacher_guest_growth_submission','list_teacher_guest_growth_submissions'))LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature);IF r.nspname='public'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',r.signature,CASE WHEN r.proname IN('get_teacher_guest_growth_submission','list_teacher_guest_growth_submissions')THEN'authenticated'ELSE'service_role'END);END IF;END LOOP;END $$;
COMMENT ON TABLE firstten_private.growth_submission_choices IS 'Publisher-reported eligibility for selected authored growth material, not verified participant consent and not an audience access grant. Explicit confirmation creates the separate grant.';
COMMENT ON TABLE firstten_private.growth_submission_versions IS 'Immutable teacher-only selected and redacted authored copies; no raw-plan teacher access. Ordinary edits do not rewrite the copy. Permission/scope generations invalidate without revival. Previously downloaded copies cannot be recalled; guest expiry ends private author access.';
COMMIT;
