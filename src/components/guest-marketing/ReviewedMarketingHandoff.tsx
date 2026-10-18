import { useEffect, useRef, useState } from "react";
import { GuestField, GuestSelect } from "@/components/guest/GuestFields";
import { Button } from "@/components/ui/button";
import { GuestActivityExport } from "@/components/guest/GuestActivityExport";
import type { GuestView } from "@/lib/guest-spaces/contracts";
import type { GuestMarketingRecord } from "@/lib/guest-marketing/contracts";
import { guestActivityMessage } from "@/lib/guest-activities/contracts";
import {
  readMarketingChoice,
  saveMarketingChoice,
  previewMarketingSubmission,
  confirmMarketingSubmission,
  listMarketingSubmissions,
  getMarketingSubmission,
  withdrawMarketingSubmission,
} from "@/lib/guest-marketing/handoff/functions";
import {
  marketingSelectionOptions,
  type MarketingSubmissionView,
  type marketingChoiceSchema,
  type marketingPreviewSchema,
  type marketingSubmissionHeaderSchema,
} from "@/lib/guest-marketing/handoff/contracts";
import {
  marketingPreviewActivities,
  marketingSubmissionActivities,
} from "@/lib/guest-marketing/handoff/pdf-adapters";
import type { z } from "zod";
type Props = {
  view: GuestView;
  csrf: string;
  record: GuestMarketingRecord | null;
  dirty: boolean;
  onDraftChange: (dirty: boolean) => void;
};
type Preview = z.infer<typeof marketingPreviewSchema>;
type Choice = z.infer<typeof marketingChoiceSchema>;
type Header = z.infer<typeof marketingSubmissionHeaderSchema>;
const fingerprint = (v: unknown) => JSON.stringify(v);
export function ReviewedMarketingHandoff(props: Props) {
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
      input: Parameters<typeof previewMarketingSubmission>[0]["data"];
    } | null>(null),
    [affirm, setAffirm] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [message, setMessage] = useState(""),
    [now, setNow] = useState(Date.now),
    [items, setItems] = useState<Header[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [copy, setCopy] = useState<MarketingSubmissionView | null>(null);
  const state = useRef({ alive: true, epoch: 0 }),
    pendingChoice = useRef<Parameters<typeof saveMarketingChoice>[0]["data"] | null>(null),
    pendingPreview = useRef<{
      basis: string;
      data: Parameters<typeof previewMarketingSubmission>[0]["data"];
    } | null>(null),
    pendingConfirm = useRef<{
      basis: string;
      data: Parameters<typeof confirmMarketingSubmission>[0]["data"];
    } | null>(null),
    withdrawal = useRef<{ snapshot: string; requestId: string } | null>(null),
    thread = useRef<string>(crypto.randomUUID()),
    reporter = useRef(onDraftChange);
  reporter.current = onDraftChange;
  const options = record ? marketingSelectionOptions(record) : [],
    basis = fingerprint([
      record?.id,
      record?.revision,
      dirty,
      choice,
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
      Object.values(reflection).some(Boolean) ||
      affirmChoice ||
      preview,
    ),
    guard = formDirty || busy || uncertain;
  useEffect(() => {
    onDraftChange(guard);
  }, [guard, onDraftChange]);
  useEffect(() => {
    const scope = state.current;
    scope.alive = true;
    const epoch = ++scope.epoch;
    if (record)
      void readMarketingChoice({ data: { csrf, planId: record.id } })
        .catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const)
        .then((r) => {
          if (!scope.alive || epoch !== scope.epoch) return;
          if (r.ok) setChoice(r.data);
          else setMessage(guestActivityMessage(r.code));
        });
    return () => {
      scope.alive = false;
      scope.epoch++;
      reporter.current(false);
    };
  }, [csrf, record?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setAffirm(false);
  }, [basis]);
  const expired = () => Date.now() >= Date.parse(view.accessExpiresAt);
  const safe = (epoch: number) => state.current.alive && state.current.epoch === epoch;
  async function changeChoice(restrict: boolean) {
    if (!record || !choice || busy || expired() || (!restrict && !affirmChoice)) return;
    const candidate = {
      csrf,
      planId: record.id,
      choice: restrict ? ("withdrawn" as const) : ("granted" as const),
      expectedRevision: choice.revision,
      requestId: crypto.randomUUID(),
    };
    const input = pendingChoice.current ?? candidate;
    if (input.planId !== record.id || (restrict && input.choice !== "withdrawn")) {
      setMessage("Resolve the pending choice before starting another operation.");
      return;
    }
    pendingChoice.current = input;
    const epoch = ++state.current.epoch;
    setBusy(true);
    setMessage("");
    const result = await saveMarketingChoice({ data: input }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!safe(epoch)) return;
    setBusy(false);
    if (!result.ok) {
      setUncertain(result.code === "UNAVAILABLE");
      if (result.code !== "UNAVAILABLE") pendingChoice.current = null;
      setMessage(guestActivityMessage(result.code));
      return;
    }
    pendingChoice.current = null;
    setUncertain(false);
    setChoice(result.data);
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
    if (!record || dirty || busy || expired() || choice?.choice !== "granted") return;
    const input = {
      csrf,
      planId: record.id,
      expectedPlanRevision: record.revision,
      assignmentId: assignment,
      threadId: thread.current,
      requestId: crypto.randomUUID(),
      selections: options
        .filter((o) => selected.includes(o.key))
        .map((o) => ({ ...o.selection, ...(excerpts[o.key] ? { excerpt: excerpts[o.key] } : {}) })),
      redactions: redactions.split("\n").filter((v) => v.trim()),
      reflection,
    };
    if (pendingPreview.current && pendingPreview.current.basis !== basis) {
      setMessage(
        "The form changed after an uncertain preview. Keep your work, reload confirmed copies, then clear the pending preview before starting anew.",
      );
      return;
    }
    pendingPreview.current ??= { basis, data: input };
    const sent = pendingPreview.current,
      epoch = ++state.current.epoch;
    setBusy(true);
    setMessage("");
    const result = await previewMarketingSubmission({ data: sent.data }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!safe(epoch)) return;
    setBusy(false);
    if (!result.ok) {
      setUncertain(result.code === "UNAVAILABLE");
      if (result.code !== "UNAVAILABLE") pendingPreview.current = null;
      setMessage(guestActivityMessage(result.code));
      return;
    }
    pendingPreview.current = null;
    setUncertain(false);
    thread.current = result.data.threadId;
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
    if (!preview || preview.basis !== basis || !affirm || dirty || expired() || busy) return;
    pendingConfirm.current ??= {
      basis,
      data: {
        csrf,
        previewId: preview.value.id,
        previewHash: preview.value.hash,
        requestId: crypto.randomUUID(),
        selectedCopyConfirmed: true,
      },
    };
    const sent = pendingConfirm.current;
    if (sent.basis !== basis) {
      setMessage(
        "The pending confirmation belongs to an earlier preview. Refresh your own copies before clearing it.",
      );
      return;
    }
    const epoch = ++state.current.epoch;
    setBusy(true);
    setMessage("");
    const result = await confirmMarketingSubmission({ data: sent.data }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!safe(epoch)) return;
    setBusy(false);
    if (!result.ok) {
      setUncertain(result.code === "UNAVAILABLE");
      if (result.code !== "UNAVAILABLE") pendingConfirm.current = null;
      setMessage(guestActivityMessage(result.code));
      return;
    }
    pendingConfirm.current = null;
    setUncertain(false);
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
      "Exact selected copy submitted. The teacher receives this immutable version; your other plan material remains private.",
    );
  }
  async function refresh(more = false) {
    const epoch = ++state.current.epoch;
    setBusy(true);
    setCopy(null);
    const r = await listMarketingSubmissions({
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
    const r = await getMarketingSubmission({ data: { csrf, snapshotId } }).catch(
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
    const r = await withdrawMarketingSubmission({
      data: { csrf, snapshotId, requestId: sent.requestId },
    }).catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const);
    if (!safe(epoch)) return;
    setBusy(false);
    if (!r.ok) {
      setUncertain(r.code === "UNAVAILABLE");
      if (r.code !== "UNAVAILABLE") withdrawal.current = null;
      setMessage(guestActivityMessage(r.code));
      return;
    }
    withdrawal.current = null;
    setUncertain(false);
    setItems((old) => old.map((v) => (v.id === snapshotId ? r.data : v)));
    setCopy(null);
    setMessage(
      "Teacher access withdrawn. Your private author copy remains available during class access; earlier downloads cannot be recalled.",
    );
  }
  async function authorizeCopy(expected: MarketingSubmissionView) {
    const epoch = state.current.epoch;
    const r = await getMarketingSubmission({ data: { csrf, snapshotId: expected.id } });
    if (!safe(epoch) || expired() || !r.ok || fingerprint(r.data) !== fingerprint(expected))
      throw new Error(
        "This author copy changed or class access ended. Reopen it before exporting.",
      );
  }
  async function authorizePreview(expected: NonNullable<typeof preview>) {
    const epoch = state.current.epoch;
    const r = await previewMarketingSubmission({ data: expected.input });
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
      aria-label="Reviewed marketing handoff"
      className="space-y-5 rounded-2xl border bg-background p-5"
    >
      <h3 className="font-display text-2xl font-bold">Choose what your teacher sees</h3>
      <p className="text-sm text-muted-foreground">
        Only your deliberately selected, redacted copy is submitted. Authored plans, self-reported
        tests and counts are not verified customer evidence. Keep private participant details out.
        Export before class access ends; downloaded copies cannot be recalled.
      </p>
      {!record ? (
        <p>Save this marketing plan before preparing a teacher copy.</p>
      ) : (
        <>
          <p className="text-sm">
            Your reported choice for this plan: <strong>{choice?.choice ?? "checking"}</strong>.
            This is your scoped report about material you may submit, not verified participant
            consent, a team-wide grant or teacher access.
          </p>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={affirmChoice}
              disabled={busy}
              onChange={(e) => setAffirmChoice(e.target.checked)}
            />
            I may submit selected authored marketing material from this saved plan. I will exclude
            private participant notes and material I may not disclose.
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!choice || busy || (!affirmChoice && !pendingChoice.current) || expired()}
              onClick={() => void changeChoice(false)}
            >
              {pendingChoice.current
                ? "Retry exact reported choice"
                : "Save reported sharing eligibility"}
            </Button>
            <Button
              variant="outline"
              disabled={!choice || busy || expired()}
              onClick={() => void changeChoice(true)}
            >
              Withdraw reported sharing choice
            </Button>
          </div>
          <GuestSelect label="Marketing assignment" value={assignment} onChange={setAssignment}>
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
            <legend className="font-semibold">Select up to 12 saved activities</legend>
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
              choice?.choice !== "granted" ||
              expired()
            }
            onClick={() => void makePreview()}
          >
            {pendingPreview.current
              ? "Retry exact marketing preview"
              : "Preview selected marketing copy"}
          </Button>
          {dirty && (
            <p className="text-sm">
              Save plan edits before previewing; the teacher copy uses the exact saved revision.
            </p>
          )}
          {validPreview && preview && (
            <div className="space-y-3 rounded-xl border p-4">
              <h4 className="font-bold">Private preview — teacher has no access yet</h4>
              <GuestActivityExport
                offers={marketingPreviewActivities(preview.value)}
                authorizeDownload={() => authorizePreview(preview)}
              />
              {preview.value.payload.excerpts.map((e) => (
                <div key={e.key}>
                  <h5 className="font-semibold">{e.label}</h5>
                  <pre className="whitespace-pre-wrap break-words text-sm">{e.text}</pre>
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
                  ? "Retry exact marketing submission"
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
      {uncertain && (
        <p className="text-sm">
          An operation is unconfirmed. Keep this page open and retry the exact operation. Refresh
          your own copies to check whether publication finished.
        </p>
      )}
      <Button variant="outline" disabled={busy || expired()} onClick={() => void refresh()}>
        Refresh my marketing copies
      </Button>
      <ul className="space-y-3">
        {items.map((i) => (
          <li key={i.id} className="rounded-xl border p-3 text-sm">
            <p>
              {i.title} · version {i.version} · {i.grantState}
              {!i.recipientEligible ? " · teacher access unavailable" : ""}
            </p>
            <Button variant="outline" disabled={busy} onClick={() => void open(i.id)}>
              Open my marketing copy
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
          More marketing copies
        </Button>
      )}
      {copy && (
        <GuestActivityExport
          offers={marketingSubmissionActivities(copy, "author")}
          authorizeDownload={() => authorizeCopy(copy)}
        />
      )}
    </section>
  );
}
