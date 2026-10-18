-- MKT-002: additive owner-private marketing plans. No legacy rows are rewritten.
-- Rollback: revoke authenticated execution of save_marketing_plan and hide the entry;
-- retain table/history for owner recovery. Never drop acknowledged private plans.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION firstten_private.marketing_shape() RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog
AS $shape$ SELECT '{"AiOrigin":{"type":"object","properties":{"requestId":{"type":"string","maxLength":36,"format":"uuid"},"kind":{"type":"string","enum":["marketing_channels","marketing_content"]},"promptVersion":{"type":"string","maxLength":500},"modelId":{"type":"string","maxLength":500},"planRevision":{"type":"integer","minimum":1,"maximum":9007199254740991}}},"StudentBoard":{"type":"object","properties":{"columns":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":36,"format":"uuid"},"title":{"type":"string","maxLength":120}}},"maxItems":8},"notes":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":36,"format":"uuid"},"columnId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"text":{"type":"string","maxLength":1000}}},"maxItems":24},"audience":{"type":"string","maxLength":500},"usefulAction":{"type":"string","maxLength":500},"channelIdeas":{"type":"array","items":{"type":"string","maxLength":300},"maxItems":8},"completedAt":{"type":"string","maxLength":35,"format":"instant","nullable":true}}},"MarketingSource":{"type":"object","properties":{"id":{"type":"string","maxLength":36,"format":"uuid"},"label":{"type":"string","maxLength":120},"text":{"type":"string","maxLength":1000},"kind":{"type":"string","enum":["owner_observation","interview","accepted_learning","external_observation"]},"recordId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"url":{"type":"string","maxLength":2048,"format":"url","nullable":true},"observedOn":{"type":"string","maxLength":10,"format":"day","nullable":true}}},"MarketingChannel":{"type":"object","properties":{"id":{"type":"string","maxLength":36,"format":"uuid"},"name":{"type":"string","maxLength":120},"medium":{"type":"string","enum":["physical","digital"]},"place":{"type":"string","maxLength":500,"nullable":true},"url":{"type":"string","maxLength":2048,"format":"url","nullable":true},"sourceIds":{"type":"array","items":{"type":"string","maxLength":36,"format":"uuid"},"maxItems":20},"observation":{"type":"string","maxLength":1000},"fitReason":{"type":"string","maxLength":1000},"access":{"type":"object","properties":{"state":{"type":"string","enum":["unknown","needs_permission","requested","allowed","not_required","denied"]},"rulesNote":{"type":"string","maxLength":1000},"rulesSourceId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"checkedOn":{"type":"string","maxLength":10,"format":"day","nullable":true},"nextQuestion":{"type":"string","maxLength":500}}},"estimatedMinutes":{"type":"integer","minimum":0,"maximum":10080,"nullable":true},"resourcesNeeded":{"type":"array","items":{"type":"string","maxLength":300},"maxItems":8},"unknowns":{"type":"array","items":{"type":"string","maxLength":300},"maxItems":8},"origin":{"type":"string","enum":["student","ai_proposal"]},"aiOrigin":{"ref":"AiOrigin","nullable":true}}},"MarketingAsset":{"type":"object","properties":{"id":{"type":"string","maxLength":36,"format":"uuid"},"channelId":{"type":"string","maxLength":36,"format":"uuid"},"format":{"type":"string","enum":["community_post","organizer_email","dm","social_caption","flyer","demo_script"]},"ownHook":{"type":"string","maxLength":500},"truthfulSupport":{"type":"string","maxLength":1000},"supportSourceIds":{"type":"array","items":{"type":"string","maxLength":36,"format":"uuid"},"maxItems":20},"body":{"type":"string","maxLength":4000},"builderDisclosure":{"type":"string","maxLength":500},"cta":{"type":"string","maxLength":500},"destinationUrl":{"type":"string","maxLength":2048,"format":"url","nullable":true},"firstUsefulAction":{"type":"string","maxLength":500},"aiOrigin":{"ref":"AiOrigin","nullable":true},"review":{"type":"object","properties":{"truthful":{"type":"boolean"},"disclosedBuilder":{"type":"boolean"},"accessChecked":{"type":"boolean"},"destinationChecked":{"type":"boolean"},"checkedAt":{"type":"string","maxLength":35,"format":"instant","nullable":true}}},"walkthrough":{"type":"object","properties":{"mode":{"type":"string","enum":["peer","self"],"nullable":true},"understoodAudience":{"type":"string","maxLength":500},"actionObserved":{"type":"string","maxLength":500},"hesitation":{"type":"string","maxLength":500},"revisionMade":{"type":"string","maxLength":500},"checkedOn":{"type":"string","maxLength":10,"format":"day","nullable":true}}}}},"MarketingTask":{"type":"object","properties":{"id":{"type":"string","maxLength":36,"format":"uuid"},"channelId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"assetId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"kind":{"type":"string","enum":["investigate","permission","make","peer_check","manual_outreach","observe","reflect"]},"title":{"type":"string","maxLength":120},"ownerLabel":{"type":"string","maxLength":120},"dueOn":{"type":"string","maxLength":10,"format":"day","nullable":true},"dependsOn":{"type":"array","items":{"type":"string","maxLength":36,"format":"uuid"},"maxItems":20},"doneMeans":{"type":"string","maxLength":500},"estimatedMinutes":{"type":"integer","minimum":0,"maximum":10080,"nullable":true},"status":{"type":"string","enum":["todo","doing","done","blocked"]},"completionNote":{"type":"string","maxLength":500}}},"MarketingMeasurement":{"type":"object","properties":{"id":{"type":"string","maxLength":36,"format":"uuid"},"channelId":{"type":"string","maxLength":36,"format":"uuid"},"assetId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"metric":{"type":"string","enum":["relevant_reach","visits","useful_action","return","referral"]},"cohort":{"type":"string","enum":["peer_test","classmate","external","automated","mixed_unknown"]},"from":{"type":"string","maxLength":10,"format":"day"},"to":{"type":"string","maxLength":10,"format":"day"},"unit":{"type":"string","enum":["unique_people","sessions","events"]},"count":{"type":"integer","minimum":0,"maximum":1000000000,"nullable":true},"source":{"type":"string","maxLength":1000},"sourceUrl":{"type":"string","maxLength":2048,"format":"url","nullable":true},"recordedOn":{"type":"string","maxLength":10,"format":"day"},"limitations":{"type":"string","maxLength":1000}}},"MarketingRate":{"type":"object","properties":{"id":{"type":"string","maxLength":36,"format":"uuid"},"numeratorId":{"type":"string","maxLength":36,"format":"uuid"},"denominatorId":{"type":"string","maxLength":36,"format":"uuid"},"label":{"type":"string","maxLength":120},"subsetConfirmed":{"type":"boolean"}}},"MarketingPlanV1":{"type":"object","properties":{"schemaVersion":{"type":"integer","const":1},"studentFirst":{"ref":"StudentBoard"},"audience":{"type":"object","properties":{"beachhead":{"type":"string","maxLength":500},"situation":{"type":"string","maxLength":500},"usefulAction":{"type":"string","maxLength":500},"valueProposition":{"type":"string","maxLength":500},"sourceIds":{"type":"array","items":{"type":"string","maxLength":36,"format":"uuid"},"maxItems":20},"assumptions":{"type":"array","items":{"type":"string","maxLength":300},"maxItems":8},"unknowns":{"type":"array","items":{"type":"string","maxLength":300},"maxItems":8}}},"sources":{"type":"array","items":{"ref":"MarketingSource"},"maxItems":20},"channels":{"type":"array","items":{"ref":"MarketingChannel"},"maxItems":12},"selection":{"type":"object","properties":{"primaryId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"alternativeId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"reason":{"type":"string","maxLength":500}}},"assets":{"type":"array","items":{"ref":"MarketingAsset"},"maxItems":10},"resources":{"type":"object","properties":{"cashBudgetCents":{"type":"integer","const":0},"availableMinutes":{"type":"integer","minimum":0,"maximum":10080,"nullable":true},"existingResources":{"type":"array","items":{"type":"string","maxLength":300},"maxItems":8},"limitations":{"type":"array","items":{"type":"string","maxLength":300},"maxItems":8},"aiUse":{"type":"string","enum":["manual_only","existing_allowance"]},"fallback":{"type":"string","maxLength":500}}},"test":{"type":"object","properties":{"state":{"type":"string","enum":["draft","ready_to_review","running","reviewed"]},"startOn":{"type":"string","maxLength":10,"format":"day","nullable":true},"endOn":{"type":"string","maxLength":10,"format":"day","nullable":true},"reviewOn":{"type":"string","maxLength":10,"format":"day","nullable":true},"startedAt":{"type":"string","maxLength":35,"format":"instant","nullable":true},"primaryMetric":{"type":"string","enum":["relevant_reach","visits","useful_action","return","referral"]},"baselineMeasurementId":{"type":"string","maxLength":36,"format":"uuid","nullable":true},"target":{"type":"integer","minimum":0,"maximum":1000000000,"nullable":true},"unknownBaselineOrTarget":{"type":"string","maxLength":500},"measurementPlan":{"type":"string","maxLength":500},"repeatIf":{"type":"string","maxLength":500},"reviseIf":{"type":"string","maxLength":500},"stopIf":{"type":"string","maxLength":500},"tasks":{"type":"array","items":{"ref":"MarketingTask"},"maxItems":24}}},"measurements":{"type":"array","items":{"ref":"MarketingMeasurement"},"maxItems":80},"rates":{"type":"array","items":{"ref":"MarketingRate"},"maxItems":10},"reflection":{"type":"object","properties":{"decision":{"type":"string","enum":["repeat","revise","stop"],"nullable":true},"evidenceIds":{"type":"array","items":{"type":"string","maxLength":36,"format":"uuid"},"maxItems":20},"learned":{"type":"string","maxLength":500},"uncertainty":{"type":"string","maxLength":500},"nextAction":{"type":"string","maxLength":500},"reviewedOn":{"type":"string","maxLength":10,"format":"day","nullable":true}}}}}}'::jsonb $shape$;

CREATE FUNCTION firstten_private.marketing_public_url(v text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog
AS $fn$
DECLARE authority text; host text; ip inet; parts text[];
BEGIN
  IF v !~ '^https?://' OR v ~ '[[:cntrl:]\\]' OR char_length(v)>2048 THEN RETURN false; END IF;
  authority := substring(v from '^https?://([^/?#]+)');
  IF authority IS NULL OR authority ~ '[@[:space:]]' THEN RETURN false; END IF;
  IF authority ~ ':[0-9]+$' AND substring(authority from ':([0-9]+)$')::numeric>65535 THEN RETURN false; END IF;
  IF authority LIKE '[%' THEN
    IF authority !~ '^\[[0-9a-fA-F:]+\](:[0-9]{1,5})?$' THEN RETURN false; END IF;
    host := split_part(substring(authority from 2),']',1);
    ip := host::inet;
    RETURN family(ip)=6 AND ip <<= '2000::/3'::inet AND NOT ip <<= '2001:db8::/32'::inet;
  END IF;
  IF authority !~ '^[^:]+(:[0-9]{1,5})?$' THEN RETURN false; END IF;
  host := lower(rtrim(split_part(authority,':',1),'.'));
  IF host = 'localhost' OR host ~ '\.(localhost|local|internal|lan|home)$' THEN RETURN false; END IF;
  IF host ~ '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' THEN
    -- Require canonical dotted decimal; disallow octal/hex/short numeric spellings.
    ip := host::inet;
    IF family(ip)<>4 OR host(ip)<>host THEN RETURN false; END IF;
    RETURN NOT (ip <<= '0.0.0.0/8'::inet OR ip <<= '10.0.0.0/8'::inet OR ip <<= '127.0.0.0/8'::inet OR ip <<= '169.254.0.0/16'::inet OR ip <<= '172.16.0.0/12'::inet OR ip <<= '192.168.0.0/16'::inet OR ip <<= '192.0.0.0/16'::inet OR ip <<= '100.64.0.0/10'::inet OR ip <<= '198.18.0.0/15'::inet OR ip <<= '224.0.0.0/3'::inet);
  END IF;
  -- A dotted domain with a nonnumeric suffix avoids WHATWG numeric-host aliases.
  IF host !~ '^[a-z0-9.-]+\.[a-z][a-z0-9-]*$' OR host ~ '(^|\.)-|-(\.|$)|\.\.' THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $fn$;

CREATE FUNCTION firstten_private.marketing_normalize(v jsonb, shape jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog
AS $fn$
DECLARE result jsonb; item jsonb; k text; s text; format text; kind text;
BEGIN
  IF v IS NULL THEN RAISE EXCEPTION 'Invalid marketing field' USING ERRCODE='22023'; END IF;
  IF v='null'::jsonb AND coalesce((shape->>'nullable')::boolean,false) THEN RETURN v; END IF;
  IF shape ? 'ref' THEN RETURN firstten_private.marketing_normalize(v,firstten_private.marketing_shape()->(shape->>'ref')); END IF;
  kind := shape->>'type';
  IF shape ? 'const' THEN
    IF v <> shape->'const' THEN RAISE EXCEPTION 'Invalid marketing constant' USING ERRCODE='22023'; END IF;
    RETURN v;
  ELSIF kind='object' THEN
    IF jsonb_typeof(v)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v))<>(SELECT count(*) FROM jsonb_object_keys(shape->'properties')) THEN RAISE EXCEPTION 'Invalid marketing object' USING ERRCODE='22023'; END IF;
    result := '{}'::jsonb;
    FOR k,item IN SELECT key,value FROM jsonb_each(shape->'properties') LOOP
      result := result || jsonb_build_object(k,firstten_private.marketing_normalize(v->k,item));
    END LOOP;
    RETURN result;
  ELSIF kind='array' THEN
    IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>(shape->>'maxItems')::int THEN RAISE EXCEPTION 'Invalid marketing array' USING ERRCODE='22023'; END IF;
    result := '[]'::jsonb;
    FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP result := result || jsonb_build_array(firstten_private.marketing_normalize(item,shape->'items')); END LOOP;
    RETURN result;
  ELSIF kind='boolean' THEN
    IF jsonb_typeof(v)<>'boolean' THEN RAISE EXCEPTION 'Invalid marketing flag' USING ERRCODE='22023'; END IF;
    RETURN v;
  ELSIF kind='integer' THEN
    IF jsonb_typeof(v)<>'number' OR (v::text)::numeric<>trunc((v::text)::numeric) OR (v::text)::numeric<(shape->>'minimum')::numeric OR (v::text)::numeric>(shape->>'maximum')::numeric THEN RAISE EXCEPTION 'Invalid marketing number' USING ERRCODE='22023'; END IF;
    RETURN to_jsonb((v::text)::bigint);
  END IF;
  IF jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'Invalid marketing text' USING ERRCODE='22023'; END IF;
  s := v#>>'{}'; format := shape->>'format';
  IF format='url' AND s ~ '[[:cntrl:]\\]' THEN RAISE EXCEPTION 'Invalid marketing URL' USING ERRCODE='22023'; END IF;
  s := btrim(s,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  IF (shape ? 'maxLength' AND char_length(s)>(shape->>'maxLength')::int) OR (shape ? 'enum' AND NOT shape->'enum' ? s) THEN RAISE EXCEPTION 'Invalid marketing text bounds' USING ERRCODE='22023'; END IF;
  IF format='uuid' THEN
    IF s !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid marketing id' USING ERRCODE='22023'; END IF;
    s := lower(s);
  ELSIF format IN ('day','instant') THEN
    IF substring(s from 1 for 10) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR left(s,4)='0000' OR to_char(substring(s from 1 for 10)::date,'YYYY-MM-DD')<>substring(s from 1 for 10) THEN RAISE EXCEPTION 'Invalid marketing date' USING ERRCODE='22023'; END IF;
    IF (format='day' AND length(s)<>10) OR (format='instant' AND s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$') THEN RAISE EXCEPTION 'Invalid marketing date' USING ERRCODE='22023'; END IF;
  ELSIF format='url' AND NOT firstten_private.marketing_public_url(s) THEN RAISE EXCEPTION 'Invalid public marketing URL' USING ERRCODE='22023';
  END IF;
  RETURN to_jsonb(s);
END $fn$;

CREATE FUNCTION firstten_private.marketing_find(items jsonb,id text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
AS $$ SELECT value FROM jsonb_array_elements(items) WHERE value->>'id'=$2 LIMIT 1 $$;
CREATE FUNCTION firstten_private.marketing_refs(ids jsonb,items jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
AS $$ SELECT count(*)=count(DISTINCT value) AND coalesce(bool_and(firstten_private.marketing_find($2,value#>>'{}') IS NOT NULL),true) FROM jsonb_array_elements($1) $$;
CREATE FUNCTION firstten_private.marketing_first_complete(board jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
AS $$ SELECT board->>'audience'<>'' AND board->>'usefulAction'<>'' AND EXISTS(SELECT 1 FROM jsonb_array_elements(board->'notes') WHERE value->>'text'<>'') AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(board->'channelIdeas') WHERE value<>'') $$;

CREATE FUNCTION firstten_private.marketing_plan_valid(doc jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
AS $fn$
DECLARE items jsonb; item jsonb; source jsonb; channel jsonb; asset jsonb; primary_id text; alternative_id text; t jsonb; launch boolean; cyclic boolean;
BEGIN
  IF doc IS NULL OR octet_length(doc::text)>131072 OR firstten_private.marketing_normalize(doc,firstten_private.marketing_shape()->'MarketingPlanV1')<>doc THEN RETURN false; END IF;
  FOREACH items IN ARRAY ARRAY[doc#>'{studentFirst,columns}',doc#>'{studentFirst,notes}',doc->'sources',doc->'channels',doc->'assets',doc#>'{test,tasks}',doc->'measurements',doc->'rates'] LOOP
    IF (SELECT count(*)<>count(DISTINCT value->>'id') FROM jsonb_array_elements(items)) THEN RETURN false; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(doc#>'{studentFirst,notes}') LOOP
    IF item->>'columnId' IS NOT NULL AND firstten_private.marketing_find(doc#>'{studentFirst,columns}',item->>'columnId') IS NULL THEN RETURN false; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(doc->'sources') LOOP
    IF (item->>'kind' IN ('interview','accepted_learning'))<>(item->>'recordId' IS NOT NULL) THEN RETURN false; END IF;
  END LOOP;
  IF NOT firstten_private.marketing_refs(doc#>'{audience,sourceIds}',doc->'sources') THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(doc->'channels') LOOP
    IF NOT firstten_private.marketing_refs(item->'sourceIds',doc->'sources') OR (item#>>'{access,rulesSourceId}' IS NOT NULL AND firstten_private.marketing_find(doc->'sources',item#>>'{access,rulesSourceId}') IS NULL) THEN RETURN false; END IF;
    IF item#>>'{access,state}' IN ('allowed','not_required') AND (item#>>'{access,checkedOn}' IS NULL OR (item#>>'{access,rulesNote}'='' AND item#>>'{access,rulesSourceId}' IS NULL)) THEN RETURN false; END IF;
    IF (item->>'origin'='ai_proposal')<>(item->'aiOrigin'<>'null'::jsonb) THEN RETURN false; END IF;
  END LOOP;
  primary_id := doc#>>'{selection,primaryId}'; alternative_id := doc#>>'{selection,alternativeId}';
  IF (primary_id IS NOT NULL AND firstten_private.marketing_find(doc->'channels',primary_id) IS NULL) OR (alternative_id IS NOT NULL AND firstten_private.marketing_find(doc->'channels',alternative_id) IS NULL) OR primary_id=alternative_id THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(doc->'assets') LOOP
    IF firstten_private.marketing_find(doc->'channels',item->>'channelId') IS NULL OR NOT firstten_private.marketing_refs(item->'supportSourceIds',doc->'sources') THEN RETURN false; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(doc#>'{test,tasks}') LOOP
    IF (item->>'channelId' IS NOT NULL AND firstten_private.marketing_find(doc->'channels',item->>'channelId') IS NULL) OR (item->>'assetId' IS NOT NULL AND (firstten_private.marketing_find(doc->'assets',item->>'assetId')->>'channelId') IS DISTINCT FROM item->>'channelId') OR NOT firstten_private.marketing_refs(item->'dependsOn',doc#>'{test,tasks}') OR item->'dependsOn' ? (item->>'id') THEN RETURN false; END IF;
  END LOOP;
  WITH RECURSIVE edges AS (SELECT task.value->>'id' AS id, dependency.value AS dep FROM jsonb_array_elements(doc#>'{test,tasks}') task CROSS JOIN LATERAL jsonb_array_elements_text(task.value->'dependsOn') dependency), walk AS (SELECT id,dep FROM edges UNION SELECT w.id,e.dep FROM walk w JOIN edges e ON e.id=w.dep) SELECT coalesce(bool_or(id=dep),false) INTO cyclic FROM walk;
  IF cyclic THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(doc->'measurements') LOOP
    IF firstten_private.marketing_find(doc->'channels',item->>'channelId') IS NULL OR (item->>'assetId' IS NOT NULL AND firstten_private.marketing_find(doc->'assets',item->>'assetId')->>'channelId' IS DISTINCT FROM item->>'channelId') OR item->>'from'>item->>'to' THEN RETURN false; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(doc->'rates') LOOP
    IF item->>'numeratorId'=item->>'denominatorId' OR firstten_private.marketing_find(doc->'measurements',item->>'numeratorId') IS NULL OR firstten_private.marketing_find(doc->'measurements',item->>'denominatorId') IS NULL THEN RETURN false; END IF;
  END LOOP;
  IF NOT firstten_private.marketing_refs(doc#>'{reflection,evidenceIds}',doc->'measurements') THEN RETURN false; END IF;
  t := doc->'test';
  IF t->>'baselineMeasurementId' IS NOT NULL AND firstten_private.marketing_find(doc->'measurements',t->>'baselineMeasurementId')->>'metric' IS DISTINCT FROM t->>'primaryMetric' THEN RETURN false; END IF;
  IF t->>'target' IS NOT NULL AND t->>'primaryMetric'='useful_action' AND doc#>>'{audience,usefulAction}'='' THEN RETURN false; END IF;
  IF (t->>'startOn' IS NOT NULL AND t->>'endOn' IS NOT NULL AND (t->>'endOn')::date-(t->>'startOn')::date<>6) OR (t->>'endOn' IS NOT NULL AND t->>'reviewOn' IS NOT NULL AND t->>'reviewOn'<t->>'endOn') THEN RETURN false; END IF;
  IF doc#>>'{studentFirst,completedAt}' IS NOT NULL AND NOT firstten_private.marketing_first_complete(doc->'studentFirst') THEN RETURN false; END IF;
  IF t->>'state'<>'draft' THEN
    IF doc#>>'{studentFirst,completedAt}' IS NULL OR doc#>>'{audience,beachhead}'='' OR doc#>>'{audience,usefulAction}'='' OR primary_id IS NULL OR alternative_id IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'assets') WHERE value->>'channelId'=primary_id AND value->>'body'<>'' AND value->>'cta'<>'' AND value->>'firstUsefulAction'<>'') OR doc#>>'{resources,availableMinutes}' IS NULL OR doc#>>'{resources,fallback}'='' OR t->>'startOn' IS NULL OR t->>'endOn' IS NULL OR t->>'reviewOn' IS NULL OR t->>'measurementPlan'='' OR t->>'repeatIf'='' OR t->>'reviseIf'='' OR t->>'stopIf'='' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(t->'tasks') WHERE value->>'title'<>'' AND value->>'ownerLabel'<>'' AND value->>'doneMeans'<>'') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(doc#>'{audience,unknowns}') WHERE value<>'') OR ((t->>'baselineMeasurementId' IS NULL OR t->>'target' IS NULL) AND t->>'unknownBaselineOrTarget'='') THEN RETURN false; END IF;
    IF t->>'state'='running' THEN
      channel := firstten_private.marketing_find(doc->'channels',primary_id);
      SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'assets') WHERE value->>'channelId'=primary_id AND value->>'body'<>'' AND value->>'cta'<>'' AND value->>'firstUsefulAction'<>'' AND value#>>'{review,truthful}'='true' AND value#>>'{review,disclosedBuilder}'='true' AND value#>>'{review,accessChecked}'='true' AND value#>>'{review,destinationChecked}'='true' AND value#>>'{review,checkedAt}' IS NOT NULL AND value#>>'{walkthrough,mode}' IS NOT NULL AND value#>>'{walkthrough,checkedOn}' IS NOT NULL AND value#>>'{walkthrough,understoodAudience}'<>'' AND value#>>'{walkthrough,actionObserved}'<>'') INTO launch;
      IF t->>'startedAt' IS NULL OR NOT launch OR channel#>>'{access,state}' NOT IN ('allowed','not_required') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(t->'tasks') WHERE value->>'status' IN ('todo','doing') AND value->>'title'<>'' AND value->>'ownerLabel'<>'' AND value->>'doneMeans'<>'' AND value->>'dueOn' IS NOT NULL) THEN RETURN false; END IF;
    END IF;
    IF t->>'state'='reviewed' AND (doc#>>'{reflection,decision}' IS NULL OR doc#>>'{reflection,learned}'='' OR doc#>>'{reflection,uncertainty}'='' OR doc#>>'{reflection,nextAction}'='' OR doc#>>'{reflection,reviewedOn}' IS NULL) THEN RETURN false; END IF;
  END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $fn$;

CREATE FUNCTION firstten_private.marketing_history_valid(history jsonb, current_revision bigint) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
AS $fn$
DECLARE item jsonb; prior bigint := 0;
BEGIN
  IF history IS NULL OR jsonb_typeof(history)<>'array' OR jsonb_array_length(history)>3 OR octet_length(history::text)>400000 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(history) LOOP
    IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>3 OR NOT item ?& ARRAY['revision','savedAt','document'] OR jsonb_typeof(item->'revision')<>'number' OR (item->>'revision')::numeric<>trunc((item->>'revision')::numeric) OR (item->>'revision')::bigint<=prior OR (item->>'revision')::bigint>=current_revision OR NOT firstten_private.marketing_plan_valid(item->'document') THEN RETURN false; END IF;
    PERFORM firstten_private.marketing_normalize(item->'savedAt','{"type":"string","format":"instant","maxLength":35}'::jsonb);
    prior := (item->>'revision')::bigint;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $fn$;

CREATE TABLE public.marketing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  project_id uuid NOT NULL UNIQUE,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  document jsonb NOT NULL CHECK (firstten_private.marketing_plan_valid(document)),
  history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (firstten_private.marketing_history_valid(history,revision)),
  last_mutation_id uuid NOT NULL,
  last_mutation_hash text NOT NULL CHECK (last_mutation_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_plans_project_id_fkey FOREIGN KEY (project_id,user_id) REFERENCES public.projects(id,user_id) ON DELETE CASCADE
);
CREATE TRIGGER marketing_private_identity BEFORE UPDATE ON public.marketing_plans FOR EACH ROW EXECUTE FUNCTION firstten_private.enforce_private_identity();
ALTER TABLE public.marketing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketing_owner_read ON public.marketing_plans FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
REVOKE ALL ON public.marketing_plans FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.marketing_plans TO authenticated;

-- Comparing source contents/access as well as copy prevents retaining stale checkmarks.
CREATE FUNCTION firstten_private.marketing_review_basis(doc jsonb, asset jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
AS $fn$
WITH channel AS (SELECT firstten_private.marketing_find(doc->'channels',asset->>'channelId') AS c)
SELECT jsonb_build_object('asset',asset-'review'-'walkthrough','channel',c,'sources',coalesce((SELECT jsonb_agg(s ORDER BY s->>'id') FROM jsonb_array_elements(doc->'sources') s WHERE asset->'supportSourceIds' ? (s->>'id') OR c->'sourceIds' ? (s->>'id') OR c#>>'{access,rulesSourceId}'=s->>'id'),'[]'::jsonb)) FROM channel
$fn$;

CREATE FUNCTION public.save_marketing_plan(p_project_id uuid,p_expected_revision bigint,p_mutation_id uuid,p_complete_student_first boolean,p_document jsonb) RETURNS jsonb
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
  WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code','UNAVAILABLE');
END $fn$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA firstten_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_marketing_plan(uuid,bigint,uuid,boolean,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_marketing_plan(uuid,bigint,uuid,boolean,jsonb) TO authenticated;
COMMENT ON TABLE public.marketing_plans IS 'Owner-private manual marketing plans. Three prior snapshots; no teacher/member/admin access. Source text is unverified owner input.';
COMMIT;
