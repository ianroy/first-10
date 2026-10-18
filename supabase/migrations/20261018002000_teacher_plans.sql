-- EDU-005: private lesson planning only. No enrollment, student records or role grants.
-- Rollback hides the planner/revokes the save RPC; preserve all saved private plans.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION firstten_private.normalize_teacher_plan(doc jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
AS $fn$
DECLARE result jsonb; item jsonb; objectives jsonb:='[]'::jsonb; k text; s text; maximum integer; minutes numeric; learners numeric; scheduled text;
BEGIN
  IF doc IS NULL OR octet_length(doc::text)>65536 OR jsonb_typeof(doc)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(doc))<>10 OR NOT doc ?& ARRAY['schemaVersion','className','audience','learningObjectives','assignment','sessionMinutes','plannedLearners','scheduledOn','assessment','facilitatorNotes'] OR doc->'schemaVersion'<>'1'::jsonb THEN RAISE EXCEPTION 'Invalid lesson plan shape' USING ERRCODE='22023'; END IF;
  result:=jsonb_build_object('schemaVersion',1);
  FOREACH k IN ARRAY ARRAY['className','audience','assignment','assessment','facilitatorNotes'] LOOP
    IF jsonb_typeof(doc->k)<>'string' THEN RAISE EXCEPTION 'Invalid lesson plan text' USING ERRCODE='22023'; END IF;
    s:=btrim(doc->>k,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
    maximum:=CASE k WHEN 'className' THEN 120 WHEN 'audience' THEN 1000 WHEN 'assessment' THEN 2000 ELSE 4000 END;
    IF char_length(s)>maximum THEN RAISE EXCEPTION 'Lesson plan text is too long' USING ERRCODE='22023'; END IF;
    result:=result||jsonb_build_object(k,s);
  END LOOP;
  IF jsonb_typeof(doc->'learningObjectives')<>'array' OR jsonb_array_length(doc->'learningObjectives')>8 THEN RAISE EXCEPTION 'Invalid learning objectives' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(doc->'learningObjectives') LOOP
    IF jsonb_typeof(item)<>'string' THEN RAISE EXCEPTION 'Invalid objective text' USING ERRCODE='22023'; END IF;
    s:=btrim(item#>>'{}',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
    IF char_length(s)>500 THEN RAISE EXCEPTION 'Learning objective is too long' USING ERRCODE='22023'; END IF;
    objectives:=objectives||jsonb_build_array(s);
  END LOOP;
  IF jsonb_typeof(doc->'sessionMinutes')<>'number' THEN RAISE EXCEPTION 'Invalid session length' USING ERRCODE='22023'; END IF;
  minutes:=(doc->>'sessionMinutes')::numeric;
  IF minutes<>trunc(minutes) OR minutes<1 OR minutes>480 THEN RAISE EXCEPTION 'Invalid session length' USING ERRCODE='22023'; END IF;
  IF doc->'plannedLearners'<>'null'::jsonb THEN
    IF jsonb_typeof(doc->'plannedLearners')<>'number' THEN RAISE EXCEPTION 'Invalid planned capacity' USING ERRCODE='22023'; END IF;
    learners:=(doc->>'plannedLearners')::numeric;
    IF learners<>trunc(learners) OR learners<0 OR learners>10000 THEN RAISE EXCEPTION 'Invalid planned capacity' USING ERRCODE='22023'; END IF;
  END IF;
  IF doc->'scheduledOn'<>'null'::jsonb THEN
    IF jsonb_typeof(doc->'scheduledOn')<>'string' THEN RAISE EXCEPTION 'Invalid scheduled date' USING ERRCODE='22023'; END IF;
    scheduled:=btrim(doc->>'scheduledOn',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
    IF scheduled !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR left(scheduled,4)='0000' OR to_char(scheduled::date,'YYYY-MM-DD')<>scheduled THEN RAISE EXCEPTION 'Invalid scheduled date' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN result||jsonb_build_object('learningObjectives',objectives,'sessionMinutes',minutes::integer,'plannedLearners',learners::integer,'scheduledOn',scheduled);
END $fn$;
CREATE TABLE public.teacher_plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid(),
 project_id uuid NOT NULL UNIQUE,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 document jsonb NOT NULL CHECK(document=firstten_private.normalize_teacher_plan(document)),
 last_mutation_id uuid NOT NULL,
 last_mutation_hash text NOT NULL CHECK(last_mutation_hash~'^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT teacher_plans_project_id_fkey FOREIGN KEY(project_id,user_id) REFERENCES public.projects(id,user_id) ON DELETE CASCADE
);
CREATE TRIGGER teacher_private_identity BEFORE UPDATE ON public.teacher_plans FOR EACH ROW EXECUTE FUNCTION firstten_private.enforce_private_identity();
ALTER TABLE public.teacher_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY teacher_plan_owner_read ON public.teacher_plans FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
REVOKE ALL ON public.teacher_plans FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.teacher_plans TO authenticated;
CREATE FUNCTION public.save_teacher_plan(p_project_id uuid,p_expected_revision bigint,p_mutation_id uuid,p_document jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE actor uuid; current_plan public.teacher_plans%ROWTYPE; saved public.teacher_plans%ROWTYPE; doc jsonb; hash text; stamp timestamptz;
BEGIN
 actor:=auth.uid();
 IF actor IS NULL THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
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
 WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code','UNAVAILABLE');
END $fn$;
REVOKE ALL ON FUNCTION firstten_private.normalize_teacher_plan(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_teacher_plan(uuid,bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_teacher_plan(uuid,bigint,uuid,jsonb) TO authenticated;
COMMENT ON TABLE public.teacher_plans IS 'Owner-private lesson planning. Planned learners is capacity, not enrollment or observed participation. No student records or access grants.';
COMMIT;
