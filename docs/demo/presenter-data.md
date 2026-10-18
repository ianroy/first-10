# Fictional presenter workspace

The dedicated account is `workshop-presenter@firstten-demo.invalid`. It is non-deliverable and receives no email. Its ordinary authenticated role owns only the reserved fictional StudyLoop project; it has no teacher, platform-admin or service-role grant.

All sample people, conversations and drafts are authored teaching examples. The accepted synthesis means reviewed within the fictional case, not validated research. The proposed experiment has no recorded result. Account metadata marks the identity synthetic; project checklist metadata marks the fixture fictional and excluded from research/product metrics. Future analytics must enforce exclusion using trusted account metadata, not treat a client-editable checklist as authorization.

## Safe seeding

The fixture source is [supabase-fixture.json](supabase-fixture.json). Default mode is a dry run. The only accepted targets are the isolated API on local port55321 and the explicitly selected existing hosted project. No generic URL or other local stack is accepted.

```sh
node --env-file=.env scripts/seed-demo.mjs --url https://hdwnnuvqqkkpontcdbwa.supabase.co --project-ref hdwnnuvqqkkpontcdbwa
# After reviewing the dry run, apply the same fixture:
node --env-file=.env scripts/seed-demo.mjs --url https://hdwnnuvqqkkpontcdbwa.supabase.co --project-ref hdwnnuvqqkkpontcdbwa --apply
node --test scripts/seed-demo.test.mjs
```

Provide the existing service key through the process environment; never put it in arguments, Git or logs. The seeder inserts missing reserved records only. It does not update, upsert, delete, reset projects, send messages or call AI. It refuses identity/project ownership collisions. Rerunning retains presenter edits and can fill missing fixture rows after an interrupted run.

## Observed evidence, 2026-10-18

- Five seeder safety/idempotency tests pass. Wrong hosts, another local stack, unlabeled fixtures and identity/row collisions fail.
- Isolated local and authorized hosted initial runs created one synthetic auth account, one project, five contacts, five interviews, one learning, one experiment and three outreach drafts.
- Both repeat runs created zero rows, updated zero rows and deleted zero rows. No emails or AI calls occurred.
- Aggregate production totals after seeding: two projects, five contacts, five interviews, one learning, one experiment and three outreach rows. The original project remained in place; the seeder has no update/delete path.
- A one-time admin-generated link signed into the synthetic account without email. The browser showed its own StudyLoop project and all five fictional people. A summary edit saved through the normal UI and survived a full reload.
- A persistent shell notice identifies fictional work even on generic Learnings/Outreach headings. Context comes from the already resolved `RequireProject` selection. Its tests ensure the notice does not carry into ordinary work.

The generated sign-in link is private, temporary and outside Git. It is not a public demo credential or invitation for real testers. The login-free `/demo` is the primary stage presentation; it requires neither email nor a model response. For a fresh private presenter sign-in, an authorized operator can use Supabase admin `generateLink` for the exact fictional email with redirect `https://first-10-three.vercel.app/auth`; never publish the resulting link/token.

## Limits and preservation

The fixture is not a real class, user-research sample, adoption measurement or learning-effect study. A public sample and the private seeded workspace are separate. No actual interview or participant permission has been simulated as real.

No existing private row contents or content fingerprints were exported. Automatic approval review rejected those backup/audit exports. The ownership migration was instead reviewed and applied as atomic no-DML schema protection, with unchanged aggregate row counts and verified constraint/trigger metadata. No recoverable native backup/PITR point was verified; a restore claim would be incorrect.

Removing the fixture is an operator task, not an automatic reset. Keep presenter work and unrelated records intact. A later fixture revision needs an explicit migration/update strategy rather than silently overwriting saved edits.
