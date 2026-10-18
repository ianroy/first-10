import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GuestField, GuestSelect } from "./GuestFields";
import { GuestActivityExport } from "./GuestActivityExport";
import { guestSubmissionActivities } from "@/lib/export/guest-activity-adapters";
import type { GuestView } from "@/lib/guest-spaces/contracts";
import {
  confirmGuestSubmission,
  getGuestSubmission,
  listGuestSubmissions,
  previewGuestSubmission,
  withdrawGuestSubmission,
} from "@/lib/guest-activities/functions";
import {
  guestActivityMessage,
  type GuestActivityRecord,
  type GuestSubmissionView,
  guestSubmissionPreviewSchema,
  guestSubmissionHeaderSchema,
} from "@/lib/guest-activities/contracts";
import type { z } from "zod";
type Preview = z.infer<typeof guestSubmissionPreviewSchema>;
type Header = z.infer<typeof guestSubmissionHeaderSchema>;
export function GuestReviewedHandoff({
  view,
  csrf,
  record,
  dirty,
  onDraftChange,
}: {
  view: GuestView;
  csrf: string;
  record: GuestActivityRecord | null;
  dirty: boolean;
  onDraftChange: (dirty: boolean) => void;
}) {
  const [assignmentId, setAssignmentId] = useState(
      view.assignments.find((a) => a.state === "published")?.id ?? "",
    ),
    [audience, setAudience] = useState<"teacher" | "team">("teacher"),
    [selected, setSelected] = useState<string[]>([]),
    [redactions, setRedactions] = useState(""),
    [reflection, setReflection] = useState({
      title: "",
      interpretation: "",
      uncertainty: "",
      decision: "",
      nextAction: "",
    }),
    [preview, setPreview] = useState<{ value: Preview; basis: string; requestId: string } | null>(
      null,
    ),
    [affirm, setAffirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [mode, setMode] = useState<"author" | "team">("author"),
    [items, setItems] = useState<Header[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [copy, setCopy] = useState<GuestSubmissionView | null>(null),
    [withdrawing, setWithdrawing] = useState<string | null>(null);
  const pendingPreview = useRef<{
    basis: string;
    input: Parameters<typeof previewGuestSubmission>[0]["data"];
  } | null>(null);
  const mounted = useRef(true),
    generation = useRef(0),
    pendingConfirm = useRef<string | null>(null),
    withdrawIds = useRef(new Map<string, string>());
  const basis = JSON.stringify([
    record?.id,
    record?.revision,
    dirty,
    assignmentId,
    audience,
    selected,
    redactions,
    reflection,
  ]);
  const currentBasis = useRef(basis);
  currentBasis.current = basis;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Request epoch, not a DOM ref: invalidate receipts after scope unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, []);
  useEffect(() => {
    onDraftChange(
      Boolean(
        reflection.title ||
        reflection.interpretation ||
        reflection.uncertainty ||
        reflection.decision ||
        reflection.nextAction ||
        redactions ||
        selected.length,
      ),
    );
  }, [reflection, redactions, selected, onDraftChange]);
  const available = [
    {
      key: "problem",
      label: "Problem space",
      field: "problem" as const,
      kind: "discovery" as const,
      recordId: record?.id ?? "",
    },
    {
      key: "solution",
      label: "Solution idea",
      field: "solution" as const,
      kind: "discovery" as const,
      recordId: record?.id ?? "",
    },
    {
      key: "hypothesis",
      label: "Current hypothesis draft fields",
      field: "hypothesis" as const,
      kind: "discovery" as const,
      recordId: record?.id ?? "",
    },
    {
      key: "script",
      label: "Current script draft fields",
      field: "script" as const,
      kind: "discovery" as const,
      recordId: record?.id ?? "",
    },
    {
      key: "reflection",
      label: "Decision reflection (conservative interview sharing checks)",
      field: "reflection" as const,
      kind: "discovery" as const,
      recordId: record?.id ?? "",
    },
    {
      key: "next_test",
      label: "Next test (conservative interview sharing checks)",
      field: "next_test" as const,
      kind: "discovery" as const,
      recordId: record?.id ?? "",
    },
    ...(record?.document.interviews
      .filter((i) => i.completed && i.choices.note === "granted" && i.choices.sharing === "granted")
      .map((i, j) => ({
        key: i.id,
        label: `Completed interview ${j + 1}: ${i.alias || "Alias not entered"} · exact answers`,
        field: "answers" as const,
        kind: "interview" as const,
        recordId: i.id,
      })) ?? []),
  ];
  async function loadList(nextMode: typeof mode, more = false) {
    const token = ++generation.current;
    setBusy(true);
    setError("");
    const r = await listGuestSubmissions({
      data: { csrf, mode: nextMode, ...(more && cursor ? { cursor } : {}) },
    }).catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const);
    if (!mounted.current || token !== generation.current) return;
    setBusy(false);
    if (!r.ok) {
      setError(guestActivityMessage(r.code));
      return;
    }
    setItems((old) => (more ? [...old, ...r.data.items] : r.data.items));
    setCursor(r.data.nextCursor);
    setCopy(null);
  }
  async function prepare() {
    if (!record || dirty || busy) return;
    const captured = basis,
      token = ++generation.current;
    setBusy(true);
    setError("");
    setPreview(null);
    setAffirm(false);
    pendingConfirm.current = null;
    if (pendingPreview.current?.basis !== captured)
      pendingPreview.current = {
        basis: captured,
        input: {
          csrf,
          activityId: record.id,
          assignmentId,
          threadId: crypto.randomUUID(),
          requestId: crypto.randomUUID(),
          audience,
          selections: available
            .filter((x) => selected.includes(x.key))
            .map(({ kind, recordId, field }) => ({ kind, recordId, field })),
          redactions: redactions.split("\n").filter((x) => x.trim()),
          reflection,
        },
      };
    const r = await previewGuestSubmission({ data: pendingPreview.current.input }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!mounted.current || token !== generation.current) return;
    setBusy(false);
    if (currentBasis.current !== captured) {
      setError("The source or selection changed. Create a fresh preview.");
      return;
    }
    if (!r.ok) {
      if (r.code !== "UNAVAILABLE") pendingPreview.current = null;
      setError(guestActivityMessage(r.code));
      return;
    }
    pendingPreview.current = null;
    setPreview({ value: r.data, basis: captured, requestId: crypto.randomUUID() });
  }
  async function confirm() {
    if (!preview || preview.basis !== basis || !affirm || busy) return;
    const p = preview,
      token = ++generation.current;
    pendingConfirm.current ??= p.requestId;
    setBusy(true);
    setError("");
    const r = await confirmGuestSubmission({
      data: {
        csrf,
        previewId: p.value.id,
        previewHash: p.value.hash,
        requestId: pendingConfirm.current,
      },
    }).catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const);
    if (!mounted.current || token !== generation.current) return;
    setBusy(false);
    if (!r.ok) {
      setError(guestActivityMessage(r.code));
      return;
    }
    setPreview(null);
    setAffirm(false);
    pendingConfirm.current = null;
    setCopy(r.data);
    setNotice(
      "The exact reviewed version was submitted. Raw activity work was not opened to the audience.",
    );
    setItems((old) =>
      mode === "author" ? [r.data, ...old.filter((x) => x.id !== r.data.id)] : [r.data],
    );
    setMode("author");
    setSelected([]);
    setRedactions("");
    setReflection({ title: "", interpretation: "", uncertainty: "", decision: "", nextAction: "" });
    onDraftChange(false);
  }
  async function read(id: string) {
    const token = ++generation.current;
    setBusy(true);
    setError("");
    setCopy(null);
    const r = await getGuestSubmission({ data: { csrf, snapshotId: id, mode } }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!mounted.current || token !== generation.current) return;
    setBusy(false);
    if (!r.ok) {
      setError(guestActivityMessage(r.code));
      return;
    }
    setCopy(r.data);
  }
  async function withdraw(id: string) {
    const token = ++generation.current;
    setBusy(true);
    setError("");
    if (!withdrawIds.current.has(id)) withdrawIds.current.set(id, crypto.randomUUID());
    const r = await withdrawGuestSubmission({
      data: { csrf, snapshotId: id, requestId: withdrawIds.current.get(id)! },
    }).catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const);
    if (!mounted.current || token !== generation.current) return;
    setBusy(false);
    if (!r.ok) {
      setError(guestActivityMessage(r.code));
      return;
    }
    setItems((old) => old.map((x) => (x.id === id ? r.data : x)));
    setCopy(null);
    setWithdrawing(null);
    setNotice(
      "Access to this submitted copy was withdrawn. Previously downloaded copies cannot be recalled.",
    );
  }
  const livePreview = preview?.basis === basis ? preview : null;
  return (
    <details className="rounded-2xl border bg-card p-5">
      <summary className="cursor-pointer py-2 font-semibold">
        Review a copy for your teacher or team
      </summary>
      <div className="mt-4 space-y-5">
        <p className="text-sm text-muted-foreground">
          Private notes do not appear automatically in a class dashboard. Save first, select exact
          source fields, redact identifying phrases, review the server-created copy and separately
          confirm its audience. Team copies are visible to current and future teammates while access
          remains active. Changed source, permission, class or assignment requires a new review.
          Downloaded copies cannot be recalled.
        </p>
        {dirty && (
          <p role="status" className="text-sm font-semibold">
            Save your activity before preparing a reviewed copy. Unsaved edits are never submitted.
          </p>
        )}
        <fieldset disabled={busy || !record || dirty} className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <GuestSelect
              label="Published assignment"
              value={assignmentId}
              onChange={setAssignmentId}
            >
              <option value="">Choose an assignment</option>
              {view.assignments
                .filter((a) => a.state === "published")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
            </GuestSelect>
            <GuestSelect
              label="Reviewed copy audience"
              value={audience}
              onChange={(v) => {
                if (v === "teacher" || v === "team") setAudience(v);
              }}
            >
              <option value="teacher">Class teacher(s) for this assignment</option>
              <option value="team">Current and future teammates</option>
            </GuestSelect>
          </div>
          <fieldset className="space-y-3 rounded-xl border p-4">
            <legend>Select sources (up to 12)</legend>
            {available.map((s) => (
              <label key={s.key} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(s.key)}
                  disabled={!selected.includes(s.key) && selected.length >= 12}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked ? [...old, s.key] : old.filter((k) => k !== s.key),
                    )
                  }
                />
                {s.label}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">
            Hypothesis and script selectors use the current saved draft fields. Preserved versions
            remain separately available in activity PDFs. Interviews require note and sharing
            permission; AI permission alone never allows sharing. Context captures are not
            selectable here.
          </p>
          {(
            [
              ["title", "Copy title", 120],
              ["interpretation", "Your interpretation", 3000],
              ["uncertainty", "Remaining uncertainty", 2000],
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
          <GuestField
            label="Phrases to redact (one per line, up to 30)"
            value={redactions}
            max={6000}
            onChange={setRedactions}
          />
          <Button
            disabled={!assignmentId || !selected.length || !reflection.title.trim()}
            onClick={() => void prepare()}
          >
            Prepare exact reviewed copy
          </Button>
        </fieldset>
        {livePreview && (
          <article className="space-y-4 rounded-xl border-2 border-primary/40 p-5">
            <h3 className="text-xl font-bold">
              Review the exact {livePreview.value.audience} copy
            </h3>
            <p className="text-sm">
              Expires {new Date(livePreview.value.expiresAt).toLocaleString()}. Check for
              identifying details; automatic email/identifier scrubbing does not guarantee
              de-identification.
            </p>
            <h4 className="font-semibold">{livePreview.value.payload.title}</h4>
            {livePreview.value.payload.excerpts.map((e) => (
              <section key={e.key}>
                <h4 className="text-sm font-semibold">{e.label}</h4>
                <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm">
                  {e.text}
                </pre>
              </section>
            ))}
            {(
              [
                ["interpretation", "Interpretation"],
                ["uncertainty", "Uncertainty"],
                ["decision", "Decision"],
                ["nextAction", "Next action"],
              ] as const
            ).map(([k, label]) => (
              <p key={k} className="whitespace-pre-wrap text-sm">
                <strong>{label}:</strong> {livePreview.value.payload[k] || "Not entered"}
              </p>
            ))}
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={affirm}
                onChange={(e) => setAffirm(e.target.checked)}
              />
              I reviewed this exact copy and intend to give{" "}
              {livePreview.value.audience === "teacher"
                ? "the class teacher(s)"
                : "current and future teammates"}{" "}
              access to these selected excerpts and reflection.
            </label>
            <Button disabled={!affirm || busy} onClick={() => void confirm()}>
              Confirm and submit this reviewed version
            </Button>
          </article>
        )}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="space-y-4 border-t pt-5">
          <h3 className="text-lg font-bold">Reviewed copies</h3>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setMode("author");
                setItems([]);
                void loadList("author");
              }}
            >
              Load my submitted copies
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setMode("team");
                setItems([]);
                void loadList("team");
              }}
            >
              Load copies shared with my team
            </Button>
          </div>
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border p-4">
              <p className="font-semibold">
                {item.title} · version {item.version} · {item.grantState}
              </p>
              <p className="my-2 text-xs text-muted-foreground">
                {item.authorLabel} · {item.audience} audience ·{" "}
                {new Date(item.submittedAt).toLocaleString()}
              </p>
              {(item.grantState === "active" || mode === "author") && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void read(item.id)}
                >
                  {item.grantState === "withdrawn"
                    ? "Open my withdrawn copy"
                    : "Open reviewed copy"}
                </Button>
              )}
              {mode === "author" && item.grantState === "active" && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setWithdrawing(item.id)}
                >
                  Withdraw this copy
                </Button>
              )}
              {withdrawing === item.id && (
                <div className="mt-3 space-y-3 text-sm">
                  <p>
                    End access to this version? Downloaded copies cannot be recalled. Your private
                    source work stays intact.
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => void withdraw(item.id)}
                  >
                    Confirm withdrawal
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setWithdrawing(null)}>
                    Keep access
                  </Button>
                </div>
              )}
            </article>
          ))}
          {cursor && (
            <Button variant="outline" disabled={busy} onClick={() => void loadList(mode, true)}>
              Load more reviewed copies
            </Button>
          )}
          {copy && (copy.grantState === "active" || mode === "author") && (
            <section className="rounded-xl border p-5">
              <h4 className="font-semibold">
                {copy.title} · version {copy.version}
              </h4>
              <p className="mt-2 text-sm">
                Current access: {copy.grantState}.{" "}
                {mode === "author"
                  ? "Your private author copy; exporting it does not grant or restore audience access."
                  : "Team-authorized reviewed copy."}{" "}
                Earlier downloads cannot be recalled.
              </p>
              {copy.payload.excerpts.map((e) => (
                <div key={e.key} className="mt-4">
                  <p className="font-semibold">{e.label}</p>
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm">{e.text}</pre>
                </div>
              ))}
              {(
                [
                  ["interpretation", "Interpretation"],
                  ["uncertainty", "Uncertainty"],
                  ["decision", "Decision"],
                  ["nextAction", "Next action"],
                ] as const
              ).map(([key, label]) => (
                <p key={key} className="mt-4 whitespace-pre-wrap text-sm">
                  <strong>{label}:</strong> {copy.payload[key] || "Not entered"}
                </p>
              ))}
              <GuestActivityExport
                offers={guestSubmissionActivities(copy, mode)}
                team={mode === "team" && copy.audience === "team"}
                authorizeDownload={async () => {
                  const r = await getGuestSubmission({ data: { csrf, snapshotId: copy.id, mode } });
                  if (
                    !mounted.current ||
                    !r.ok ||
                    r.data.grantState !== copy.grantState ||
                    (mode !== "author" &&
                      (r.data.grantState !== "active" || r.data.audience !== "team")) ||
                    r.data.version !== copy.version ||
                    r.data.grantRevision !== copy.grantRevision ||
                    JSON.stringify(r.data) !== JSON.stringify(copy)
                  )
                    throw new Error(
                      "This reviewed copy or its permission changed. Open a fresh copy before exporting.",
                    );
                }}
              />
            </section>
          )}
        </div>
      </div>
    </details>
  );
}
