import { growthExcerptDisplay } from "@/lib/guest-growth/handoff/presentation";
import { useEffect, useRef, useState } from "react";
import { GuestField, GuestSelect } from "@/components/guest/GuestFields";
import { Button } from "@/components/ui/button";
import { GuestActivityExport } from "@/components/guest/GuestActivityExport";
import type { GuestView } from "@/lib/guest-spaces/contracts";
import { guestGrowthRecordSchema } from "@/lib/guest-growth/contracts";
type GuestGrowthRecord = z.infer<typeof guestGrowthRecordSchema>;
import { guestActivityMessage } from "@/lib/guest-activities/contracts";
import {
  readGrowthChoice,
  getGrowthHandoffSources,
  saveGrowthChoice,
  previewGrowthSubmission,
  confirmGrowthSubmission,
  listGrowthSubmissions,
  getGrowthSubmission,
  withdrawGrowthSubmission,
} from "@/lib/guest-growth/handoff/functions";
import {
  growthSelectionOptions,
  type GrowthSubmissionView,
  type growthChoiceSchema,
  type growthPreviewSchema,
  type growthSubmissionHeaderSchema,
  type sourceRosterSchema,
} from "@/lib/guest-growth/handoff/contracts";
import {
  growthPreviewActivities,
  growthSubmissionActivities,
} from "@/lib/guest-growth/handoff/pdf-adapters";
import type { z } from "zod";
type Props = {
  view: Pick<GuestView, "classId" | "teamId" | "principalId" | "accessExpiresAt"> & {
    assignments: { id: string; title: string; state: string }[];
  };
  csrf: string;
  record: GuestGrowthRecord | null;
  dirty: boolean;
  onDraftChange: (dirty: boolean) => void;
};
type Preview = z.infer<typeof growthPreviewSchema>;
type Choice = z.infer<typeof growthChoiceSchema>;
type Header = z.infer<typeof growthSubmissionHeaderSchema>;
import { canonicalGrowthJson } from "@/lib/guest-growth/transport";
const fingerprint = canonicalGrowthJson;
export function ReviewedGrowthHandoff(props: Props) {
  return (
    <Handoff
      key={`${props.view.classId}:${props.view.teamId}:${props.view.principalId}:${props.csrf}:${props.record?.id ?? "new"}`}
      {...props}
    />
  );
}
function Handoff({ view, csrf, record, dirty, onDraftChange }: Props) {
  const [choice, setChoice] = useState<Choice | null>(null),
    [affirmChoice, setAffirmChoice] = useState(false),
    [roster, setRoster] = useState<z.infer<typeof sourceRosterSchema> | null>(null),
    [sourceChoice, setSourceChoice] = useState(""),
    [assignment, setAssignment] = useState(
      view.assignments.find((a) => a.state === "published")?.id ?? "",
    ),
    [selected, setSelected] = useState<string[]>([]),
    [excerpts, setExcerpts] = useState<Record<string, string>>({}),
    [redactions, setRedactions] = useState(""),
    [reflection, setReflection] = useState({
      title: "",
      interpretation: "",
      uncertainty: "",
      decision: "",
      nextAction: "",
    }),
    [preview, setPreview] = useState<{
      value: Preview;
      basis: string;
      input: Parameters<typeof previewGrowthSubmission>[0]["data"];
    } | null>(null),
    [affirm, setAffirm] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [message, setMessage] = useState(""),
    [now, setNow] = useState(Date.now),
    [items, setItems] = useState<Header[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [copy, setCopy] = useState<GrowthSubmissionView | null>(null);
  const state = useRef({ alive: true, epoch: 0 }),
    pendingChoice = useRef<Parameters<typeof saveGrowthChoice>[0]["data"] | null>(null),
    pendingReductions = useRef<Record<string, Parameters<typeof saveGrowthChoice>[0]["data"]>>({}),
    pendingPreview = useRef<{
      basis: string;
      data: Parameters<typeof previewGrowthSubmission>[0]["data"];
    } | null>(null),
    pendingConfirm = useRef<{
      basis: string;
      data: Parameters<typeof confirmGrowthSubmission>[0]["data"];
    } | null>(null),
    withdrawal = useRef<{ snapshot: string; requestId: string } | null>(null),
    thread = useRef<Record<string, string>>({}),
    reporter = useRef(onDraftChange);
  reporter.current = onDraftChange;
  const options = record ? growthSelectionOptions(record) : [],
    basis = fingerprint([
      record?.id,
      record?.revision,
      dirty,
      choice,
      roster,
      assignment,
      selected,
      excerpts,
      redactions,
      reflection,
    ]);
  const latest = useRef(basis);
  latest.current = basis;
  const formDirty = Boolean(
      selected.length ||
      redactions ||
      Object.values(excerpts).some(Boolean) ||
      Object.values(reflection).some(Boolean) ||
      affirmChoice ||
      preview,
    ),
    guard =
      formDirty ||
      busy ||
      uncertain ||
      Boolean(
        pendingChoice.current ||
        pendingPreview.current ||
        pendingConfirm.current ||
        withdrawal.current ||
        Object.keys(pendingReductions.current).length,
      );
  const syncUncertain = () =>
    setUncertain(
      Boolean(
        pendingChoice.current ||
        pendingPreview.current ||
        pendingConfirm.current ||
        withdrawal.current ||
        Object.keys(pendingReductions.current).length,
      ),
    );
  useEffect(() => {
    onDraftChange(guard);
  }, [guard, onDraftChange]);
  useEffect(() => {
    const scope = state.current;
    scope.alive = true;
    const epoch = ++scope.epoch;
    if (
      pendingChoice.current ||
      Object.keys(pendingReductions.current).length ||
      pendingPreview.current ||
      pendingConfirm.current ||
      withdrawal.current
    ) {
      setBusy(false);
      setUncertain(true);
    }
    if (record)
      void readGrowthChoice({ data: { csrf, artifactId: record.id } })
        .catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const)
        .then((r) => {
          if (!scope.alive || epoch !== scope.epoch) return;
          if (r.ok) setChoice(r.data);
          else setMessage(guestActivityMessage(r.code));
        });
    if (record)
      void getGrowthHandoffSources({
        data: { csrf, artifactId: record.id, revision: record.revision },
      })
        .catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const)
        .then((r) => {
          if (!scope.alive || epoch !== scope.epoch) return;
          if (r.ok) {
            setRoster(r.data);
            setSourceChoice(record.id);
          } else {
            setRoster(null);
            setMessage(guestActivityMessage(r.code));
          }
        });
    return () => {
      scope.alive = false;
      scope.epoch++;
    };
  }, [csrf, record?.id, record?.revision]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => reporter.current(false), []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setAffirm(false);
  }, [basis]);
  const expired = () => Date.now() >= Date.parse(view.accessExpiresAt);
  const safe = (epoch: number) => state.current.alive && state.current.epoch === epoch;
  async function refreshSources() {
    if (!record || busy || expired()) return;
    const epoch = ++state.current.epoch;
    setBusy(true);
    const r = await getGrowthHandoffSources({
      data: { csrf, artifactId: record.id, revision: record.revision },
    }).catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const);
    if (!safe(epoch)) return;
    setBusy(false);
    setPreview(null);
    setAffirm(false);
    if (!r.ok) {
      setRoster(null);
      setMessage(guestActivityMessage(r.code));
      return;
    }
    setRoster(r.data);
    setMessage("Source choices refreshed. Your form edits and unconfirmed operations remain.");
  }
  async function changeChoice(restrict: boolean, artifactId = sourceChoice) {
    const selectedSource = roster?.sources.find((s) => s.artifactId === artifactId);
    if (!record || busy || expired()) return;
    if (
      !restrict &&
      (Object.keys(pendingReductions.current).length || (!pendingChoice.current && !affirmChoice))
    )
      return;
    if (!restrict && pendingChoice.current && pendingChoice.current.artifactId !== artifactId) {
      setMessage("Resolve the pending choice before starting another operation.");
      return;
    }
    if (!restrict && !pendingChoice.current && !selectedSource) return;
    const epoch = ++state.current.epoch;
    setBusy(true);
    setMessage("");
    let input = restrict ? pendingReductions.current[artifactId] : pendingChoice.current;
    if (!input && restrict) {
      // A permission reduction needs the current CAS revision, even after an unknown grant.
      const fresh = await readGrowthChoice({ data: { csrf, artifactId } }).catch(
        () => ({ ok: false, code: "UNAVAILABLE" }) as const,
      );
      if (!safe(epoch)) return;
      if (!fresh.ok) {
        setBusy(false);
        setMessage(guestActivityMessage(fresh.code));
        return;
      }
      input = {
        csrf,
        artifactId,
        choice: "withdrawn",
        expectedRevision: fresh.data.revision,
        requestId: crypto.randomUUID(),
      };
      pendingReductions.current[artifactId] = input;
    } else if (!input) {
      input = {
        csrf,
        artifactId,
        choice: "granted",
        expectedRevision: selectedSource!.choiceRevision,
        requestId: crypto.randomUUID(),
      };
      pendingChoice.current = input;
    }
    const result = await saveGrowthChoice({ data: input }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!safe(epoch)) return;
    setBusy(false);
    if (!result.ok) {
      if (result.code !== "UNAVAILABLE") {
        if (restrict) delete pendingReductions.current[artifactId];
        else pendingChoice.current = null;
      }
      syncUncertain();
      setMessage(guestActivityMessage(result.code));
      return;
    }
    if (restrict) {
      delete pendingReductions.current[artifactId];
      if (pendingChoice.current?.artifactId === artifactId) pendingChoice.current = null;
    } else pendingChoice.current = null;
    syncUncertain();
    if (result.data.artifactId === record.id) setChoice(result.data);
    setRoster((old) =>
      old
        ? {
            ...old,
            sources: old.sources.map((s) =>
              s.artifactId === result.data.artifactId
                ? { ...s, choice: result.data.choice, choiceRevision: result.data.revision }
                : s,
            ),
          }
        : old,
    );
    setAffirmChoice(false);
    setPreview(null);
    setCopy(null);
    setMessage(
      result.data.choice === "withdrawn"
        ? "Reported sharing choice withdrawn. Earlier teacher access cannot revive on regrant; downloaded copies cannot be recalled."
        : "Reported eligibility saved. No teacher access exists until you confirm an exact reviewed copy.",
    );
  }
  async function makePreview() {
    if (
      !record ||
      dirty ||
      busy ||
      expired() ||
      !roster ||
      roster.sources.some((s) => s.choice !== "granted")
    )
      return;
    thread.current[assignment] ??=
      roster.threads.find((t) => t.assignmentId === assignment)?.threadId ?? crypto.randomUUID();
    const input = {
      csrf,
      artifactId: record.id,
      expectedRevision: record.revision,
      assignmentId: assignment,
      threadId: thread.current[assignment]!,
      requestId: crypto.randomUUID(),
      selections: options
        .filter((o) => selected.includes(o.key))
        .map((o) => ({ ...o.selection, ...(excerpts[o.key] ? { excerpt: excerpts[o.key] } : {}) })),
      redactions: redactions.split("\n").filter((v) => v.trim()),
      reflection,
    };
    pendingPreview.current ??= { basis, data: input };
    const sent = pendingPreview.current,
      epoch = ++state.current.epoch;
    setBusy(true);
    setMessage("");
    const result = await previewGrowthSubmission({ data: sent.data }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!safe(epoch)) return;
    setBusy(false);
    if (!result.ok) {
      if (result.code !== "UNAVAILABLE") pendingPreview.current = null;
      syncUncertain();
      setMessage(guestActivityMessage(result.code));
      return;
    }
    pendingPreview.current = null;
    syncUncertain();
    thread.current[sent.data.assignmentId] = result.data.threadId;
    if (latest.current !== sent.basis) {
      setMessage(
        "Preview returned for an earlier form. Your newer edits remain; review a fresh preview.",
      );
      return;
    }
    setPreview({ value: result.data, basis: sent.basis, input: sent.data });
    setAffirm(false);
    setMessage("Private preview only. Review every excerpt before granting teacher access.");
  }
  async function confirm() {
    if (expired() || busy) return;
    if (!pendingConfirm.current) {
      if (!preview || preview.basis !== basis || !affirm || dirty) return;
      pendingConfirm.current = {
        basis,
        data: {
          csrf,
          previewId: preview.value.id,
          previewHash: preview.value.hash,
          requestId: crypto.randomUUID(),
          selectedCopyConfirmed: true,
        },
      };
    }
    const sent = pendingConfirm.current;
    const epoch = ++state.current.epoch;
    setBusy(true);
    setMessage("");
    const result = await confirmGrowthSubmission({ data: sent.data }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!safe(epoch)) return;
    setBusy(false);
    if (!result.ok) {
      if (result.code !== "UNAVAILABLE") pendingConfirm.current = null;
      syncUncertain();
      setMessage(guestActivityMessage(result.code));
      return;
    }
    pendingConfirm.current = null;
    syncUncertain();
    setCopy(result.data);
    setPreview(null);
    setAffirm(false);
    if (latest.current === sent.basis) {
      setSelected([]);
      setRedactions("");
      setExcerpts({});
      setReflection({
        title: "",
        interpretation: "",
        uncertainty: "",
        decision: "",
        nextAction: "",
      });
    }
    setMessage(
      result.data.recipientEligible
        ? "Exact selected copy submitted. The teacher receives this immutable version; your other artifact material remains private."
        : "Earlier exact copy recovered. Teacher access is unavailable; this retry does not restore access.",
    );
  }
  async function refresh(more = false) {
    const epoch = ++state.current.epoch;
    setBusy(true);
    setCopy(null);
    const r = await listGrowthSubmissions({
      data: { csrf, ...(more && cursor ? { cursor } : {}) },
    }).catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const);
    if (!safe(epoch)) return;
    setBusy(false);
    if (!r.ok) {
      setMessage(guestActivityMessage(r.code));
      setItems([]);
      return;
    }
    setItems((old) =>
      more ? [...new Map([...old, ...r.data.items].map((v) => [v.id, v])).values()] : r.data.items,
    );
    setCursor(r.data.nextCursor);
  }
  async function open(snapshotId: string) {
    const epoch = ++state.current.epoch;
    setBusy(true);
    setCopy(null);
    const r = await getGrowthSubmission({ data: { csrf, snapshotId } }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!safe(epoch)) return;
    setBusy(false);
    if (r.ok) setCopy(r.data);
    else setMessage(guestActivityMessage(r.code));
  }
  async function withdraw(snapshotId: string) {
    withdrawal.current ??= { snapshot: snapshotId, requestId: crypto.randomUUID() };
    const sent = withdrawal.current;
    if (sent.snapshot !== snapshotId) {
      setMessage("Resolve the pending withdrawal first.");
      return;
    }
    const epoch = ++state.current.epoch;
    setBusy(true);
    const r = await withdrawGrowthSubmission({
      data: { csrf, snapshotId, requestId: sent.requestId },
    }).catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const);
    if (!safe(epoch)) return;
    setBusy(false);
    if (!r.ok) {
      if (r.code !== "UNAVAILABLE") withdrawal.current = null;
      syncUncertain();
      setMessage(guestActivityMessage(r.code));
      return;
    }
    withdrawal.current = null;
    syncUncertain();
    setItems((old) => old.map((v) => (v.id === snapshotId ? r.data : v)));
    setCopy(null);
    setMessage(
      "Teacher access withdrawn. Your private author copy remains available during class access; earlier downloads cannot be recalled.",
    );
  }
  async function authorizeCopy(expected: GrowthSubmissionView) {
    const epoch = state.current.epoch;
    const r = await getGrowthSubmission({ data: { csrf, snapshotId: expected.id } });
    if (!safe(epoch) || expired() || !r.ok || fingerprint(r.data) !== fingerprint(expected))
      throw new Error(
        "This author copy changed or class access ended. Reopen it before exporting.",
      );
  }
  async function authorizePreview(expected: NonNullable<typeof preview>) {
    const epoch = state.current.epoch;
    const r = await previewGrowthSubmission({ data: expected.input });
    if (
      !safe(epoch) ||
      expired() ||
      latest.current !== expected.basis ||
      !r.ok ||
      fingerprint(r.data) !== fingerprint(expected.value)
    )
      throw new Error("This preview changed or expired. Review a fresh preview before exporting.");
  }
  const validPreview = preview?.basis === basis && Date.parse(preview.value.expiresAt) > now;
  return (
    <section
      aria-label="Reviewed growth handoff"
      className="space-y-5 rounded-2xl border bg-background p-5"
    >
      <h3 className="font-display text-2xl font-bold">Choose what your teacher sees</h3>
      <p className="text-sm text-muted-foreground">
        Only your deliberately selected, redacted copy is submitted. Authored plans, self-reported
        tests and counts are not verified customer evidence. Keep private participant details out.
        Export before class access ends; downloaded copies cannot be recalled.
      </p>
      {!record ? (
        <p>Save this growth artifact before preparing a teacher copy.</p>
      ) : (
        <>
          <p className="text-sm">
            Your reported choice for this artifact: <strong>{choice?.choice ?? "checking"}</strong>.
            This is your scoped report about material you may submit, not verified participant
            consent, a team-wide grant or teacher access.
          </p>
          <GuestSelect
            label="Exact retained source for reported choice"
            value={sourceChoice}
            onChange={setSourceChoice}
          >
            <option value="">Choose a source</option>
            {[...new Map(roster?.sources.map((s) => [s.artifactId, s]) ?? []).values()].map((s) => (
              <option key={s.artifactId} value={s.artifactId}>
                {s.kind} · revision {s.revision} · {s.choice} · {s.audience}
              </option>
            ))}
          </GuestSelect>
          <p className="text-sm">
            Every listed dependency needs your separate artifact-scoped reported choice. It covers
            authored material across that artifact's retained versions; this exact copy binds the
            displayed retained revision. This is not a teammate's consent or a grant to view their
            private notes.
          </p>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={affirmChoice}
              disabled={busy}
              onChange={(e) => setAffirmChoice(e.target.checked)}
            />
            I may submit selected authored growth material from this saved artifact. I will exclude
            private participant notes and material I may not disclose.
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={
                !sourceChoice ||
                busy ||
                Object.keys(pendingReductions.current).length > 0 ||
                (!affirmChoice && !pendingChoice.current) ||
                expired()
              }
              onClick={() => void changeChoice(false)}
            >
              {pendingChoice.current
                ? "Retry exact reported choice"
                : "Save reported sharing eligibility"}
            </Button>
            <Button
              variant="outline"
              disabled={!sourceChoice || busy || expired()}
              onClick={() => void changeChoice(true)}
            >
              Withdraw reported sharing choice
            </Button>
          </div>
          <Button
            variant="outline"
            disabled={busy || expired()}
            onClick={() => void refreshSources()}
          >
            Refresh source choices
          </Button>
          {pendingChoice.current && pendingChoice.current.artifactId !== sourceChoice && (
            <Button
              variant="outline"
              disabled={busy || expired() || Object.keys(pendingReductions.current).length > 0}
              onClick={() => void changeChoice(false, pendingChoice.current!.artifactId)}
            >
              Retry prior exact reported choice
            </Button>
          )}
          {Object.keys(pendingReductions.current).map((artifactId) => (
            <Button
              key={artifactId}
              variant="outline"
              disabled={busy || expired()}
              onClick={() => void changeChoice(true, artifactId)}
            >
              Retry exact sharing withdrawal — {artifactId}
            </Button>
          ))}
          <GuestSelect label="Growth assignment" value={assignment} onChange={setAssignment}>
            <option value="">Choose a published assignment</option>
            {view.assignments
              .filter((a) => a.state === "published")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
          </GuestSelect>
          <fieldset className="space-y-3">
            <legend className="font-semibold">Select up to 12 saved sections/questions</legend>
            {options.map((o) => (
              <div key={o.key} className="rounded-xl border p-3">
                <label className="flex min-h-10 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.key)}
                    disabled={busy || (!selected.includes(o.key) && selected.length >= 12)}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked ? [...old, o.key] : old.filter((k) => k !== o.key),
                      )
                    }
                  />
                  {o.label}
                </label>
                {selected.includes(o.key) && (
                  <GuestField
                    label={`Optional exact excerpt — ${o.label}`}
                    value={excerpts[o.key] ?? ""}
                    max={6000}
                    onChange={(v) => setExcerpts((old) => ({ ...old, [o.key]: v }))}
                  />
                )}
              </div>
            ))}
          </fieldset>
          <GuestField
            label="Redact these exact phrases (one per line, up to 30)"
            value={redactions}
            max={6030}
            onChange={setRedactions}
          />
          {(
            [
              ["title", "Submission title", 120],
              ["interpretation", "Your interpretation", 3000],
              ["uncertainty", "What remains uncertain", 2000],
              ["decision", "Your decision", 2000],
              ["nextAction", "Your next action", 2000],
            ] as const
          ).map(([key, label, max]) => (
            <GuestField
              key={key}
              label={label}
              value={reflection[key]}
              max={max}
              onChange={(v) => setReflection((old) => ({ ...old, [key]: v }))}
            />
          ))}
          <Button
            disabled={
              busy ||
              dirty ||
              !assignment ||
              !selected.length ||
              !reflection.title.trim() ||
              !roster ||
              roster.sources.some((s) => s.choice !== "granted") ||
              expired()
            }
            onClick={() => void makePreview()}
          >
            {pendingPreview.current ? "Retry exact growth preview" : "Preview selected growth copy"}
          </Button>
          {dirty && (
            <p className="text-sm">
              Save artifact edits before previewing; the teacher copy uses the exact saved revision.
            </p>
          )}
          {validPreview && preview && (
            <div className="space-y-3 rounded-xl border p-4">
              <h4 className="font-bold">Private preview — teacher has no access yet</h4>
              <GuestActivityExport
                offers={growthPreviewActivities(preview.value)}
                authorizeDownload={() => authorizePreview(preview)}
              />
              {preview.value.payload.excerpts.map((e) => (
                <div key={e.key}>
                  <h5 className="font-semibold">{e.label}</h5>
                  <pre className="whitespace-pre-wrap break-words text-sm">
                    {growthExcerptDisplay(e)}
                  </pre>
                  <p className="text-xs">{e.evidenceLabel}</p>
                </div>
              ))}
              <p className="text-sm">
                {preview.value.payload.title} · {preview.value.payload.interpretation} ·{" "}
                {preview.value.payload.uncertainty} · {preview.value.payload.decision} ·{" "}
                {preview.value.payload.nextAction}
              </p>
              <label className="flex gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={affirm}
                  onChange={(e) => setAffirm(e.target.checked)}
                />
                I reviewed this exact copy and grant current class teachers access to it.
              </label>
              <Button disabled={!affirm || busy} onClick={() => void confirm()}>
                {pendingConfirm.current
                  ? "Retry exact growth submission"
                  : "Submit this exact teacher copy"}
              </Button>
            </div>
          )}
          {preview && !validPreview && (
            <p role="alert">
              The plan, form, reported choice or preview deadline changed. Create a fresh preview.
            </p>
          )}
        </>
      )}
      {message && (
        <p role="status" className="rounded-xl border p-3 text-sm">
          {message}
        </p>
      )}
      {pendingPreview.current && !pendingConfirm.current && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            pendingPreview.current = null;
            setPreview(null);
            setAffirm(false);
            syncUncertain();
            setMessage(
              "Private preview discarded. No teacher access was granted; your form edits remain.",
            );
          }}
        >
          Discard unconfirmed private preview
        </Button>
      )}
      {uncertain && pendingConfirm.current && (
        <Button variant="outline" disabled={busy || expired()} onClick={() => void confirm()}>
          Retry prior exact submission (new edits remain)
        </Button>
      )}
      {uncertain && pendingPreview.current && (
        <Button variant="outline" disabled={busy || expired()} onClick={() => void makePreview()}>
          Retry prior exact preview (new edits remain)
        </Button>
      )}
      {uncertain && (
        <p className="text-sm">
          An operation is unconfirmed. Keep this page open and retry the exact operation. Refresh
          your own copies to check whether publication finished.
        </p>
      )}
      <Button variant="outline" disabled={busy || expired()} onClick={() => void refresh()}>
        Refresh my growth copies
      </Button>
      <ul className="space-y-3">
        {items.map((i) => (
          <li key={i.id} className="rounded-xl border p-3 text-sm">
            <p>
              {i.title} · version {i.version} · {i.grantState}
              {!i.recipientEligible ? " · teacher access unavailable" : ""}
            </p>
            <Button variant="outline" disabled={busy} onClick={() => void open(i.id)}>
              Open my growth copy
            </Button>
            <Button
              variant="outline"
              disabled={busy || i.grantState === "withdrawn"}
              onClick={() => void withdraw(i.id)}
            >
              Withdraw this teacher copy
            </Button>
          </li>
        ))}
      </ul>
      {cursor && (
        <Button variant="outline" disabled={busy} onClick={() => void refresh(true)}>
          More growth copies
        </Button>
      )}
      {copy && (
        <GuestActivityExport
          offers={growthSubmissionActivities(copy, "author")}
          authorizeDownload={() => authorizeCopy(copy)}
        />
      )}
    </section>
  );
}
