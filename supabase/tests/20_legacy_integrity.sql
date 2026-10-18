-- TODOs document observed initial-schema integrity holes; --strict fails on each open hole.

RESET ROLE;
SELECT firstten_policy_test.set_actor('owner_a');
SET LOCAL ROLE authenticated;
SELECT is(current_user::text, 'authenticated', 'owner_a uses actual authenticated database role');
SELECT is(auth.uid(), firstten_policy_test.id('owner_a'), 'owner_a has its own JWT subject');
SELECT firstten_policy_test.expect_denied(firstten_policy_test.attempt($case$INSERT INTO public.contacts(id,project_id,first_name) VALUES (gen_random_uuid(),firstten_policy_test.id('project_b'),'Fixture create')$case$),'cross-owner project reference rejected in contacts');
SELECT firstten_policy_test.expect_denied(firstten_policy_test.attempt($case$INSERT INTO public.interviews(id,project_id,contact_id) VALUES (gen_random_uuid(),firstten_policy_test.id('project_b'),firstten_policy_test.id('contact_b'))$case$),'cross-owner project reference rejected in interviews');
SELECT firstten_policy_test.expect_denied(firstten_policy_test.attempt($case$INSERT INTO public.learnings(id,project_id) VALUES (gen_random_uuid(),firstten_policy_test.id('project_b'))$case$),'cross-owner project reference rejected in learnings');
SELECT firstten_policy_test.expect_denied(firstten_policy_test.attempt($case$INSERT INTO public.experiments(id,project_id) VALUES (gen_random_uuid(),firstten_policy_test.id('project_b'))$case$),'cross-owner project reference rejected in experiments');
SELECT firstten_policy_test.expect_denied(firstten_policy_test.attempt($case$INSERT INTO public.outreach(id,project_id) VALUES (gen_random_uuid(),firstten_policy_test.id('project_b'))$case$),'cross-owner project reference rejected in outreach');
SELECT firstten_policy_test.expect_denied(firstten_policy_test.attempt($case$INSERT INTO public.interviews(id,project_id,contact_id) VALUES (gen_random_uuid(),firstten_policy_test.id('project_a'),firstten_policy_test.id('contact_b'))$case$),'cross-owner contact reference rejected');
SELECT firstten_policy_test.expect_denied(firstten_policy_test.attempt($case$INSERT INTO public.interviews(id,project_id,contact_id) VALUES (gen_random_uuid(),firstten_policy_test.id('project_a'),firstten_policy_test.id('contact_a2'))$case$),'same-owner different-project contact reference rejected');
SELECT firstten_policy_test.expect_denied(firstten_policy_test.attempt($case$UPDATE public.contacts SET project_id=firstten_policy_test.id('project_b') WHERE id=firstten_policy_test.id('contact_a')$case$),'existing contact cannot be retargeted to another owner project');
SELECT firstten_policy_test.expect_denied(firstten_policy_test.attempt($case$UPDATE public.experiments SET project_id=firstten_policy_test.id('project_a2') WHERE id=firstten_policy_test.id('experiment_a')$case$),'existing private scope cannot be retargeted even to another owned project');
RESET ROLE;
