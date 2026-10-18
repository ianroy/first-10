# Founding-partner release verification — 2026-10-18

The final Questions slide asks educators to become founding partners: try First Ten in their classes, share candid feedback and receive the owner's offer of two semesters free. The QR and visible fallback address point to `https://first-10-three.vercel.app/founding-partners`. October 2026 tests and Spring 2027 release to ten schools remain targets, not confirmed adoption.

## Verified delivery

- Native deck Page `page_984affe9853c8191a5f8caf0d446aba3`, current connection `artifact_external_df4a6cc0-0203-4da3-9814-41a835d83328`, state version 22. All thirteen PNG exports and the self-contained offline companion are current.
- Core Image generated the real QR; Vision decoded both its source PNG and the actual rendered slide to the exact public URL. Root inspected slide 13 and the deployed desktop presentation, including End navigation and viewport-fitted Present mode. The companion's invitation is also a real clickable link.
- The no-login destination explains the offer, links to the public demo/teaching kit and ordinary educator sign-in/account creation. It accepts either partnership interest or feedback; incoming records remain private. Submitting does not create accounts, grant roles, enroll schools, send automatic emails or provision billing entitlements. The team coordinates the two free semesters.
- Hosted additive migration `20261018004000_founding_partners.sql` applied successfully after a dry run listing that migration only. The operational intake has no direct table grants to anonymous, authenticated or service roles; only the service-only bounded append RPC is available. Validation and atomic rolling email/IP-HMAC/global caps run on the database path. Raw IPs and private project data are excluded.
- Full integrated application suite: **276 tests in 34 files passed**; typecheck and production build passed; lint has zero errors and the six existing Fast Refresh warnings. The intake's 23 real PostgreSQL assertions passed in the rollback-only local harness, including browser-role denial and classroom-cap checks. No independent concurrent-connection test is claimed for this new RPC. GitHub CI [39128880007](https://github.com/ianroy/first-10/actions/runs/39128880007) and isolated database policies [39128879688](https://github.com/ianroy/first-10/actions/runs/39128879688) both passed at `d281f0c`.
- Actual deployed browser submission used a clearly fictional QA school and `example.invalid` address, with a note explicitly excluding the record from adoption/demand counts. The server completed successfully and the browser showed **Request received** with the two-semester coordination message. No real educator was contacted or automatically enrolled.

## Existing release context

The presenter login already opens Student, Educator and protected Admin views with clearly fictional demo data. The saved Marketing Lab supports manual measurements and reviewed Markdown export. A current-draft export preview was inspected, but an attempted browser download verification stalled the automation tool; local download completion is not claimed. The tool returned after roughly 25 minutes, beyond the owner's one-hour checkpoint. The root continued the newly requested architecture, chasm and founding-partner work; the earlier deadline was not met.

The architecture illustration names `google/gemini-2.5-flash-lite` for the live fixed fictional practice and `anthropic/claude-sonnet-4.5` as the private-workflow code default. The ten-year proprietary pedagogy moat is an owner-supplied teaching-history statement, not a measured learning-effect result for this new app. No additional paid AI calls were needed for this release.

For rollback, revoke execution of the intake RPC to disable new submissions while retaining received records; restore public page/deck assets with an ordinary corrective commit. Do not delete intake records or rewrite published history.
