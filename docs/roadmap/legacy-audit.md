# Legacy and backlog reconciliation

Generated from [tasks.json](tasks.json). Historical notes remain in [the history file](../../FEATUREROADMAP_history.md).

## Legacy tasks

| ID | Disposition | Successors | Reason |
| --- | --- | --- | --- |
| DOC-001 | complete | DOC-001 | Committed and pushed; describes current code and candidate value. Original dated Notes remain in FEATUREROADMAP_history.md. |
| DOC-002 | complete | DOC-002 | Concurrent completed commit a2d69a3 added team names and removed the old email link. Credits are preserved in README and the historical roadmap snapshot. |
| F-001 | deferred | F-001 | Deferred. F-007 verifies the baseline but does not establish that wrapper cleanup is needed. Activation requires a recorded concrete reason and compatible replacement plan; retain Lovable history protections. Original dated Notes remain in FEATUREROADMAP_history.md. |
| F-002 | split | AI-001, AI-004, AI-005 | Existing timeout/retry is partial; complete strict runtime validation, bounded retries, accounting and evaluated routing before marking reliability done. Original dated Notes remain in FEATUREROADMAP_history.md. |
| F-003 | split | AI-002, AI-007 | Versioned prompts/schema parity and authorized grounded context are separate migration/integration tasks. Original dated Notes remain in FEATUREROADMAP_history.md. |
| F-004 | split | AI-003, AI-006, AI-008 | Offline harness, capped actual comparisons and release gate have distinct evidence. Original dated Notes remain in FEATUREROADMAP_history.md. |
| F-005 | split | AI-004, ADM-001, ADM-002 | Authoritative cost/usage ledger and protected aggregate dashboard; a UI graph alone cannot enforce budget. Original dated Notes remain in FEATUREROADMAP_history.md. |
| F-006 | split | PRV-001, PRV-002, SEC-001, SEC-003 | Persist processing/sharing choices, ownership consistency and scoped export/delete; existing local checkbox is insufficient. Original dated Notes remain in FEATUREROADMAP_history.md. |
| F-007 | complete | F-007 | CI success verified for 7006f87 on 2026-10-17. Local typecheck, 17 tests, Vercel build and scoped lint passed in DOC-001. Six existing refresh warnings; schema parity stays with AI-002. Original dated Notes remain in FEATUREROADMAP_history.md. |
| F-008 | expanded | EV-001 | Preserve both outreach and synthesis with atomic history and explicit acceptance. Original dated Notes remain in FEATUREROADMAP_history.md. |
| F-009 | split | F-009a, F-009b | Production connection was owner-confirmed; preview environment/auth acceptance remains not started. Original dated Notes remain in FEATUREROADMAP_history.md. |
| F-010 | complete | F-010 | Owner confirmed sign-in and AI generation on 2026-10-17; not a new uptime claim. Original dated Notes remain in FEATUREROADMAP_history.md. |
| G-002 | dropped | — | Historical iteration gate superseded; retained only in the immutable history archive. Original dated Notes remain in FEATUREROADMAP_history.md. |
| G-003 | dropped | — | Historical iteration gate superseded by G-004 and the separate engineering release gates. Original dated Notes remain in FEATUREROADMAP_history.md. |
| G-004 | retained | G-004 | Research decision is retained independently of engineering authorization; no automatic erasure of the owner-requested broader plan. Original dated Notes remain in FEATUREROADMAP_history.md. |
| I2-001 | revised | EV-004 | Keep distinct requested/agreed/fulfilled actions; avoid universal proof scoring or forced positive gates. Original dated Notes remain in FEATUREROADMAP_history.md. |
| I2-002 | revised | EV-004, EV-003 | UI distinguishes observed actions and decisions; original mandatory validation gate is not retained. Original dated Notes remain in FEATUREROADMAP_history.md. |
| I2-003 | retained | EV-005 | Optional grounded challenge through the shared, metered AI entry point. Original dated Notes remain in FEATUREROADMAP_history.md. |
| I2-004 | split | EV-006 | Deterministic cues plus optional evaluated low-cost rewrite; no truth/authenticity score. Original dated Notes remain in FEATUREROADMAP_history.md. |
| I2-005 | split | AN-001, AN-002 | Define funnel/events before collection; distinguish application adoption and founder-entered customer pipeline. Original dated Notes remain in FEATUREROADMAP_history.md. |
| I3-001 | split | SHR-001, SHR-002 | Reviewed immutable snapshot, then explicit scoped grants/revocation. Original dated Notes remain in FEATUREROADMAP_history.md. |
| I3-002 | expanded | EV-007 | Manual first-ask guidance plus bounded low-cost rewrite, never automatic sending. Original dated Notes remain in FEATUREROADMAP_history.md. |
| L-001 | retained | L-001 | Scheduled by Iteration 5; no implementation or validation claimed. Original dated Notes remain in FEATUREROADMAP_history.md. |
| L-002 | retained | L-002 | Scheduled by Iteration 5; no implementation or validation claimed. Original dated Notes remain in FEATUREROADMAP_history.md. |
| P-001 | split | WEB-003, P-001b | Current technical schematics proceed now; five-minute pitch deck with real outcome evidence remains deferred. Original dated Notes remain in FEATUREROADMAP_history.md. |
| R0-001 | complete | R0-001 | Workspace created; no participant findings implied. Original dated Notes remain in FEATUREROADMAP_history.md. |
| R0-002 | complete | R0-002 | Inspiration only; direct Reddit audit remains cancelled. Original dated Notes remain in FEATUREROADMAP_history.md. |
| R0-003 | dropped | — | Direct Reddit audit cancelled by owner; preserve supplied signal brief and historical rankings without resuming collection. Original dated Notes remain in FEATUREROADMAP_history.md. |
| R0-004 | split | R0-004a, R0-004b | Human founder sample split into first three and remaining two to five eligible cases. Original dated Notes remain in FEATUREROADMAP_history.md. |
| R0-004a | retained | R0-004a | Not started; requires human recruiting and interviews. Agents may prepare documents or analyze notes the human supplies, but may not contact participants. Original dated Notes remain in FEATUREROADMAP_history.md. |
| R0-004b | retained | R0-004b | Not started. Completes the human founder-study portion of legacy R0-004 only when both R0-004a and R0-004b meet their criteria. Original dated Notes remain in FEATUREROADMAP_history.md. |
| R0-005 | retained | R0-005 | Not started. Engineering may proceed within the newly authorized plan while this evidence work remains open; feature delivery is not market validation. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-001 | complete | VP-001 | Completed draft; unsupported/secondary-source claims still require VP-007 audit. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-002 | complete | VP-002 | Guides exist; VP-008 revises tests and processing choices. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-003 | retained | VP-003 | Not started. Agent prepares/organizes only; human conducts outreach and interviews. This study can proceed alongside founder interviews and engineering. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-004 | split | VP-004a, VP-004b | Manual comprehension/action study can run without traffic; live A/B requires its own traffic and attribution plan. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-004a | retained | VP-004a | Not started. Replaces the manual-study part of legacy VP-004; automated VP-004b remains separately deferred. No external contacts are sent by the agent. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-004b | deferred | VP-004b | Activation requires a coordinator-recorded traffic/power or explicitly exploratory plan, validated attribution and privacy settings after AN-002/WEB-004. Manual VP-004a is sufficient for early comprehension learning; live A/B work is not currently started. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-005 | dropped | VP-005 | Dropped: the user now explicitly requests real class spaces and teacher workflows (CLS tasks). A fake-door interest table is superseded, not completed; no instructor purchase or efficacy claim follows from this scope decision. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-006 | split | VP-006a, VP-006b | Evidence decision and later production positioning rollout have separate checks. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-006a | retained | VP-006a | Not started. This replaces the decision part of legacy VP-006; it is not a blanket veto or completion gate for the newly authorized full engineering plan. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-006b | retained | VP-006b | Not started. Future evidence-based reconciliation of WEB-004/EDU-002, not a prerequisite that prevents their factual candidate materials from shipping earlier. If the actual teaching route differs, coordinator assigns that existing route before work; do not create a duplicate. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-007 | retained | VP-007 | Not started. Extends the existing VP-007 research audit; DOC-001 updated product documentation but did not complete this task. No participant findings exist merely because a canvas exists. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-008 | retained | VP-008 | Not started. Human studies are not autonomous recruiting authorization. The coordinator may prepare materials and organize supplied notes; people conduct recruiting/interviews. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-009 | retained | VP-009 | Not started. Agents can prepare the prototype; human observations are required. This manual test does not complete the planned Evidence Pack or structured-decision implementation. Original dated Notes remain in FEATUREROADMAP_history.md. |
| VP-010 | retained | VP-010 | Not started. Human-owned participation and follow-up; the coordinator prepares materials and analyzes supplied evidence. This does not satisfy feature-specific or classroom pilots elsewhere in the plan. Original dated Notes remain in FEATUREROADMAP_history.md. |
| X-001 | expanded | OPS-001, OPS-002, F-009b, OPS-003 | Repeatable local/CI, real isolated preview smoke and migration/restore procedures. Original dated Notes remain in FEATUREROADMAP_history.md. |

## Seed backlog

| ID | Disposition | Successors | Reason |
| --- | --- | --- | --- |
| FB-01 | deferred | HOLD-001 | Discovery of communities needs observed access friction and permitted source workflows. |
| FB-02 | scheduled | EV-006 | Question coaching uses deterministic feedback before cheap optional AI. |
| FB-03 | deferred | HOLD-002 | Voice adds consent/storage/transcription cost before capture friction is established. |
| FB-04 | scheduled | AI-007, EV-001, EV-003 | Ground sources, preserve reviewed versions, connect evidence to decisions. |
| FB-05 | revised | EV-004 | Distinct commitments and observed outcomes replace universal proof scores. |
| FB-06 | deferred | HOLD-003 | Follow-up demand must be observed; user controls all communication. |
| FB-07 | deferred | HOLD-004 | Online durable drafts ship first; full offline sync adds conflict/security complexity. |
| FB-08 | promoted | WS-001, WS-002, WS-003, WS-004, WS-005, WS-006, WS-007 | Owner explicitly requested saving/returning and different ideas; no longer waiting for research permission. |
| FB-09 | promoted | CLS-001, CLS-002, CLS-003, CLS-004, CLS-005, CLS-006 | Owner explicitly requested real teacher class spaces; reviewed submission boundaries replace fake door. |
| FB-10 | scheduled | EV-002, EV-003 | Link experiments to a decision, expected observation and later outcome. |
| FB-11 | deferred | HOLD-005 | Hosted survey distribution needs privacy/abuse scope and observed need. |
| FB-12 | split | AI-004, AI-005, ADM-002, HOLD-006 | Internal cheap routing and usage/caps are scheduled; end-user model picker remains unproven. |
| FB-13 | scheduled | SHR-001, SHR-002 | Reviewed evidence snapshots and explicit revocable sharing. |
| FB-14 | scheduled | EV-007 | First-ask guidance with optional bounded rewrite. |
| FB-15 | scheduled | EV-005 | Evidence-linked challenge, optional and human-reviewed. |
| FB-16 | deferred | HOLD-007 | Pain-mining source rights and user need remain unresolved. |
| FB-17 | deferred | HOLD-008 | Peer participation is not customer relevance; network needs real demand and moderation scope. |
| FB-18 | deferred | HOLD-009 | Digest needs repeated-use evidence, events and explicit notification preferences. |
| FB-19 | scheduled | EV-002, EV-003, EV-005 | Manual research continues while requested implementation records evidence and next decisions. |
