-- All fixtures below run inside the policy harness transaction and roll back.
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon','public.get_founding_partner_counts()','EXECUTE'),'anonymous cannot inspect partner aggregates');
SELECT ok(NOT has_function_privilege('authenticated','public.get_founding_partner_counts()','EXECUTE'),'ordinary signed users cannot inspect partner aggregates');
SELECT ok(has_function_privilege('service_role','public.get_founding_partner_counts()','EXECUTE'),'verified admin server can request fixed aggregates');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.get_founding_partner_counts()$$,'42501','permission denied for function get_founding_partner_counts','anonymous actual invocation is denied');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.get_founding_partner_counts()$$,'42501','permission denied for function get_founding_partner_counts','signed browser actual invocation is denied');
RESET ROLE;
INSERT INTO firstten_private.founding_partner_submissions(email,school,kind,note) VALUES
 ('fictional-teacher@fixture-university.edu','Fictional school','interest','Rollback fixture only'),
 ('fictional-teacher@fixture-university.edu','Fictional school','feedback','Rollback fixture only'),
 ('second-fictional-teacher@fixture-university.edu','Fictional school','interest','Rollback fixture only'),
 ('automatic-fixture@example.invalid','Fictional QA school','interest','Known fixture excluded');
SET LOCAL ROLE service_role;
SELECT is(public.get_founding_partner_counts()->>'interestRequests','2','counts interest requests excluding reserved fixture domains');
SELECT is(public.get_founding_partner_counts()->>'feedbackSubmissions','1','feedback is an independent count, not conversion');
SELECT is(public.get_founding_partner_counts()->>'distinctRespondents','2','same address is counted once across submission kinds');
SELECT ok((public.get_founding_partner_counts()->>'excludedFixtures')::int>0,'known test domains are explicitly counted separately');
SELECT is((SELECT count(*) FROM jsonb_object_keys(public.get_founding_partner_counts())),4::bigint,'response is exactly four scalar counts with no private contact or school fields');
RESET ROLE;
