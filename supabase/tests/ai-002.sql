-- Runs in the guarded policy runner's rollback transaction. No real participant data.
RESET ROLE;
CREATE FUNCTION firstten_policy_test.ai_record(overrides jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql AS $$
SELECT jsonb_build_object(
 'request_id','fa020000-0000-4000-8000-000000000001','user_id','f1000000-0000-4000-8000-000000000001','project_id','f2000000-0000-4000-8000-000000000001',
 'kind','questions','prompt_id','first-ten.questions','prompt_version',1,'schema_id','first-ten.questions.output','schema_version',1,
 'requested_model','anthropic/claude-sonnet-4.5','actual_model',NULL,'requested_provider',NULL,'actual_provider',NULL,'provider_generation_id',NULL,
 'prompt_tokens',NULL,'completion_tokens',NULL,'total_tokens',NULL,'cost_usd',NULL,'attempts',1
) || overrides $$;
GRANT USAGE ON SCHEMA firstten_policy_test TO service_role;
GRANT EXECUTE ON FUNCTION firstten_policy_test.ai_record(jsonb) TO service_role,anon,authenticated;
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='firstten_private.ai_generation_provenance'::regclass),'generation provenance has RLS enabled');
SELECT ok(NOT has_table_privilege('anon','firstten_private.ai_generation_provenance','SELECT,INSERT,UPDATE,DELETE'),'anonymous has no provenance table access');
SELECT ok(NOT has_table_privilege('authenticated','firstten_private.ai_generation_provenance','SELECT,INSERT,UPDATE,DELETE'),'signed browser cannot inspect or forge provenance');
SELECT ok(NOT has_table_privilege('service_role','firstten_private.ai_generation_provenance','SELECT,INSERT,UPDATE,DELETE'),'service role has no direct provenance table access');
SELECT ok(has_function_privilege('service_role','public.record_ai_generation(jsonb)','EXECUTE'),'service role can execute only the narrow write');
SELECT ok((SELECT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] FROM pg_proc WHERE oid='public.record_ai_generation(jsonb)'::regprocedure),'write has fixed definer search path');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.record_ai_generation(firstten_policy_test.ai_record())$$,'42501','permission denied for function record_ai_generation','anonymous cannot forge provenance');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.record_ai_generation(firstten_policy_test.ai_record())$$,'42501','permission denied for function record_ai_generation','signed browser cannot forge provenance');
SET LOCAL ROLE service_role;
SELECT is(public.record_ai_generation(firstten_policy_test.ai_record()),'fa020000-0000-4000-8000-000000000001'::uuid,'service writes owned request and returns only its ID');
SELECT throws_ok($$SELECT public.record_ai_generation(firstten_policy_test.ai_record())$$,'23505',NULL,'duplicate request cannot overwrite provenance');
SELECT throws_ok($$SELECT public.record_ai_generation(firstten_policy_test.ai_record('{"request_id":"fa020000-0000-4000-8000-000000000002","user_id":"f1000000-0000-4000-8000-000000000002"}'))$$,'42501','Project owner unavailable','current owner is checked inside the write transaction');
SELECT throws_ok($$SELECT public.record_ai_generation(firstten_policy_test.ai_record('{"prompt":"PRIVATE"}'))$$,'23514','Invalid generation metadata','unknown content field is rejected');
SELECT throws_ok($$SELECT public.record_ai_generation(firstten_policy_test.ai_record('{"prompt_version":2}'))$$,'23514',NULL,'unregistered prompt version is rejected');
SELECT throws_ok($$SELECT public.record_ai_generation(firstten_policy_test.ai_record('{"schema_id":"arbitrary"}'))$$,'23514',NULL,'unregistered schema ID is rejected');
SELECT throws_ok($$SELECT public.record_ai_generation(firstten_policy_test.ai_record('{"prompt_tokens":"20"}'))$$,'23514','Invalid generation metadata','token counts require numeric metadata');
SELECT throws_ok($$SELECT public.record_ai_generation(firstten_policy_test.ai_record('{"completion_tokens":2.5}'))$$,'23514','Invalid generation metadata','fractional token count is rejected');
SELECT throws_ok($$SELECT public.record_ai_generation(firstten_policy_test.ai_record('{"cost_usd":-1}'))$$,'23514',NULL,'negative cost cannot be stored');
SELECT throws_ok($$SELECT public.record_ai_generation(firstten_policy_test.ai_record('{"requested_provider":"invented"}'))$$,'23514',NULL,'unconstrained baseline provider remains unspecified');
SELECT throws_ok($$SELECT public.record_ai_generation(firstten_policy_test.ai_record('{"kind":"marketing_demo"}'))$$,'23514',NULL,'specialized demo route cannot use this contract');
SELECT is(public.record_ai_generation(firstten_policy_test.ai_record('{"request_id":"fa020000-0000-4000-8000-000000000003","kind":"synthesis","prompt_id":"first-ten.synthesis","schema_id":"first-ten.synthesis.output","actual_model":"reported-model","actual_provider":"reported-provider","provider_generation_id":"reported-id","prompt_tokens":20,"completion_tokens":8,"total_tokens":28,"cost_usd":0.0001}')),'fa020000-0000-4000-8000-000000000003'::uuid,'reported model provider usage and cost are accepted');
SELECT is(public.record_ai_generation(firstten_policy_test.ai_record('{"request_id":"fa020000-0000-4000-8000-000000000004","kind":"stage2","prompt_id":"first-ten.stage2","schema_id":"first-ten.stage2.output"}')),'fa020000-0000-4000-8000-000000000004'::uuid,'stage2 version is allowlisted');
SELECT is(public.record_ai_generation(firstten_policy_test.ai_record('{"request_id":"fa020000-0000-4000-8000-000000000005","kind":"stage3","prompt_id":"first-ten.stage3","schema_id":"first-ten.stage3.output"}')),'fa020000-0000-4000-8000-000000000005'::uuid,'stage3 version is allowlisted');
RESET ROLE;
SELECT is((SELECT count(*) FROM firstten_private.ai_generation_provenance),4::bigint,'only four successful records exist after rejected mutations');
SELECT ok((SELECT actual_model IS NULL AND actual_provider IS NULL AND cost_usd IS NULL AND total_tokens IS NULL FROM firstten_private.ai_generation_provenance WHERE request_id='fa020000-0000-4000-8000-000000000001'),'unreported usage and provider remain unknown, not fabricated');
SELECT is((SELECT cost_usd FROM firstten_private.ai_generation_provenance WHERE request_id='fa020000-0000-4000-8000-000000000003'),0.0001::numeric,'reported cost is stored exactly');
SELECT ok(NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='firstten_private' AND table_name='ai_generation_provenance' AND column_name IN ('prompt','input','output','system','messages','notes','content','raw_response','usage')),'ledger has no content or raw-envelope columns');
INSERT INTO public.projects(id,user_id,name) VALUES ('fa020000-0000-4000-8000-000000000099','f1000000-0000-4000-8000-000000000001','Disposable fictional provenance fixture');
SET LOCAL ROLE service_role;
SELECT is(public.record_ai_generation(firstten_policy_test.ai_record('{"request_id":"fa020000-0000-4000-8000-000000000099","project_id":"fa020000-0000-4000-8000-000000000099"}')),'fa020000-0000-4000-8000-000000000099'::uuid,'temporary owned project records successfully');
RESET ROLE;
DELETE FROM public.projects WHERE id='fa020000-0000-4000-8000-000000000099';
SELECT is((SELECT count(*) FROM firstten_private.ai_generation_provenance WHERE request_id='fa020000-0000-4000-8000-000000000099'),0::bigint,'deleting an owned project also removes its scoped metadata');
