import { useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GuestField } from "@/components/guest/GuestFields";
import { GuestActivityExport } from "@/components/guest/GuestActivityExport";
import { bootstrapGuestSession } from "@/lib/guest-spaces.functions";
import type { GuestView } from "@/lib/guest-spaces/contracts";
import { guestActivityMessage } from "@/lib/guest-activities/contracts";
import {
  listGuestMarketing,
  loadGuestMarketing,
  saveGuestMarketing,
} from "@/lib/guest-marketing/functions";
import {
  createGuestMarketing,
  guestMarketingDocumentSchema,
  preservedMarketingError,
  type GuestMarketingDocument,
  type GuestMarketingRecord,
  type SaveGuestMarketingInput,
  guestMarketingHeaderSchema,
} from "@/lib/guest-marketing/contracts";
import { guestMarketingActivities } from "@/lib/guest-marketing/pdf-adapters";
import { MarketingSteps } from "./MarketingSteps";
import type { z } from "zod";
type Header = z.infer<typeof guestMarketingHeaderSchema>;
type Props = { view: GuestView; csrf: string; onDirtyChange?: (dirty: boolean) => void };
const fp = (v: unknown) => JSON.stringify(v),
  steps = ["Think first", "Map channels", "Make content", "Plan the test", "Review learning"];
function matches(r: Header, v: GuestView) {
  return (
    r.classId === v.classId &&
    r.teamId === v.teamId &&
    (r.audience === "team_shared" || r.authorPrincipalId === v.principalId)
  );
}
export function GuestMarketingWorkspace(props: Props) {
  return (
    <Workspace
      key={`${props.view.classId}:${props.view.teamId}:${props.view.principalId}:${props.csrf}`}
      {...props}
    />
  );
}
function Workspace({ view, csrf, onDirtyChange }: Props) {
  const [doc, setDoc] = useState<GuestMarketingDocument>(createGuestMarketing),
    [record, setRecord] = useState<GuestMarketingRecord | null>(null),
    [headers, setHeaders] = useState<Header[]>([]),
    [id, setId] = useState<string>(() => crypto.randomUUID()),
    [audience, setAudience] = useState<"principal_private" | "team_shared">("principal_private"),
    [shared, setShared] = useState(false),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false),
    [message, setMessage] = useState(""),
    [step, setStep] = useState(0),
    [tick, setTick] = useState(0);
  const alive = useRef(true),
    epoch = useRef(0),
    current = useRef(doc),
    saved = useRef(record),
    pending = useRef<SaveGuestMarketingInput | null>(null),
    reporter = useRef(onDirtyChange);
  current.current = doc;
  saved.current = record;
  reporter.current = onDirtyChange;
  const dirty = fp(doc) !== fp(record?.document ?? createGuestMarketing()),
    guard = dirty || busy || uncertain,
    expired = Date.now() >= Date.parse(view.accessExpiresAt);
  const blocker = useBlocker({
    shouldBlockFn: () => guard,
    enableBeforeUnload: guard,
    withResolver: true,
  });
  useEffect(() => {
    onDirtyChange?.(guard);
  }, [guard, onDirtyChange]);
  useEffect(
    () => () => {
      reporter.current?.(false);
    },
    [],
  );
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    alive.current = true;
    const token = ++epoch.current;
    void listGuestMarketing({ data: { csrf } })
      .catch(() => ({ ok: false, code: "UNAVAILABLE" }) as const)
      .then((r) => {
        if (!alive.current || token !== epoch.current) return;
        if (r.ok && r.data.every((h) => matches(h, view))) {
          setHeaders(r.data);
          setLoaded(true);
        } else
          setMessage(
            r.ok ? "The class scope changed. Reopen this space." : guestActivityMessage(r.code),
          );
      });
    return () => {
      alive.current = false;
    };
  }, [csrf, view]);
  function update(fn: (d: GuestMarketingDocument) => void) {
    setDoc((old) => {
      const next = structuredClone(old);
      fn(next);
      return next;
    });
  }
  function reset(sharedMode: boolean) {
    if (
      guard &&
      !window.confirm("Discard local Marketing Lab edits? A save already sent may still finish.")
    )
      return;
    ++epoch.current;
    pending.current = null;
    setDoc(createGuestMarketing());
    setRecord(null);
    setId(crypto.randomUUID());
    setAudience(sharedMode ? "team_shared" : "principal_private");
    setShared(false);
    setUncertain(false);
    setConflict(false);
    setBusy(false);
    setMessage(
      sharedMode
        ? "New blank team plan. Nothing was copied from private work."
        : "New private plan. Only this learner can open it.",
    );
    setStep(0);
  }
  async function open(planId: string) {
    if (guard && !window.confirm("Discard local Marketing Lab edits and open saved work?")) return;
    const token = ++epoch.current;
    setBusy(true);
    const r = await loadGuestMarketing({ data: { csrf, planId } }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!alive.current || token !== epoch.current) return;
    setBusy(false);
    if (!r.ok) {
      setMessage(guestActivityMessage(r.code));
      return;
    }
    if (!matches(r.data, view)) {
      setMessage("The class scope changed. Reopen this space.");
      return;
    }
    pending.current = null;
    setId(r.data.id);
    setAudience(r.data.audience);
    setDoc(r.data.document);
    setRecord(r.data);
    setShared(false);
    setUncertain(false);
    setConflict(false);
    setMessage(`Opened saved revision ${r.data.revision}.`);
  }
  async function save() {
    if (busy || expired || !loaded || conflict) return;
    let input = pending.current;
    if (!input) {
      const parsed = guestMarketingDocumentSchema.safeParse(doc);
      if (!parsed.success) {
        setMessage(parsed.error.issues[0]?.message || "Check the plan fields before saving.");
        return;
      }
      if (record) {
        const error = preservedMarketingError(record.document, parsed.data);
        if (error) {
          setMessage(error);
          return;
        }
      }
      if (audience === "team_shared" && !record && !shared) {
        setMessage("Confirm that current and future teammates may read and edit this new plan.");
        return;
      }
      input = {
        csrf,
        planId: id,
        audience,
        expectedRevision: record?.revision ?? 0,
        mutationId: crypto.randomUUID(),
        sharedAudienceConfirmed: audience === "team_shared" && !record && shared,
        document: parsed.data,
      };
      pending.current = input;
    }
    const sent = input,
      token = ++epoch.current;
    setBusy(true);
    const r = await saveGuestMarketing({ data: sent }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!alive.current || token !== epoch.current) return;
    setBusy(false);
    if (!r.ok) {
      if (r.code === "UNAVAILABLE") {
        setUncertain(true);
        setMessage(
          "Save outcome is unconfirmed. Your edits remain here. Retry the exact sent save before opening another plan.",
        );
      } else {
        pending.current = null;
        setUncertain(false);
        setConflict(r.code === "CONFLICT" || r.code === "IDEMPOTENCY_CONFLICT");
        setMessage(guestActivityMessage(r.code));
      }
      return;
    }
    if (
      !matches(r.data.record, view) ||
      r.data.record.id !== id ||
      r.data.record.audience !== audience
    ) {
      setUncertain(true);
      setMessage("The saved scope could not be confirmed. Your local edits remain here.");
      return;
    }
    pending.current = null;
    setUncertain(false);
    const newer = r.data.record.revision !== r.data.savedRevision;
    setRecord(r.data.record);
    if (!newer && fp(current.current) === fp(sent.document)) setDoc(r.data.record.document);
    setConflict(newer);
    setHeaders((old) => [...old.filter((h) => h.id !== r.data.record.id), r.data.record]);
    setMessage(
      newer
        ? "That exact save already completed, but a newer version now exists. Local edits were preserved. Open the latest saved plan to review it."
        : `Saved revision ${r.data.savedRevision}. ${fp(current.current) !== fp(sent.document) ? "Later local edits are still unsaved." : ""}`,
    );
  }
  async function authorizeDownload() {
    const before = fp(current.current),
      basis = saved.current;
    const session = await bootstrapGuestSession();
    if (
      !alive.current ||
      !session.ok ||
      !session.data ||
      session.csrf !== csrf ||
      session.data.classId !== view.classId ||
      session.data.teamId !== view.teamId ||
      session.data.principalId !== view.principalId ||
      Date.now() >= Date.parse(session.data.accessExpiresAt)
    )
      throw new Error("Guest access changed. Reopen this space before exporting.");
    if (basis) {
      const r = await loadGuestMarketing({ data: { csrf, planId: basis.id } });
      if (!r.ok || !matches(r.data, view) || fp(r.data) !== fp(basis))
        throw new Error("Saved plan changed. Reopen it and review the PDF again.");
    }
    if (!alive.current || fp(current.current) !== before || saved.current !== basis)
      throw new Error("The local plan changed. Review the current PDF again.");
  }
  let offers: ReturnType<typeof guestMarketingActivities> = [];
  try {
    offers = guestMarketingActivities(
      doc,
      { savedAt: record?.savedAt ?? null, ...(record ? { revision: record.revision } : {}), dirty },
      audience,
    );
  } catch {
    /* Invalid unfinished fields must be fixed before a reliable export. */
  }
  void tick;
  return (
    <section
      className="mt-8 space-y-6 rounded-3xl border bg-card p-6 lg:p-8"
      aria-label="Guest Marketing Lab"
    >
      <header className="grid gap-5 xl:grid-cols-[1fr_auto]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Next 50 · manual Marketing Lab
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold">
            Find your channel. Make one useful invitation.
          </h2>
          <p className="mt-3 max-w-4xl text-sm text-muted-foreground">
            A $0 plan for real-world learning: think, map channels, make content, test, reflect.
            Save before leaving; export before class access ends. No AI, automatic publishing or
            messaging.
          </p>
        </div>
        <div className="rounded-2xl border bg-background p-4 text-sm">
          <strong>
            {audience === "principal_private"
              ? "Private to this learner"
              : "Shared with current and future teammates"}
          </strong>
          <p className="mt-2">
            {view.className} / {view.teamAlias}
          </p>
          <p className="mt-1 text-muted-foreground">
            Teachers cannot automatically open this plan.
          </p>
        </div>
      </header>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={!loaded || busy || expired}
          onClick={() => reset(false)}
        >
          New private marketing plan
        </Button>
        <Button variant="outline" disabled={!loaded || busy || expired} onClick={() => reset(true)}>
          New blank team marketing plan
        </Button>
        <Button
          disabled={
            !loaded ||
            busy ||
            expired ||
            conflict ||
            (!dirty && !uncertain && !(!record && audience === "team_shared"))
          }
          onClick={() => void save()}
        >
          {busy ? "Saving…" : uncertain ? "Retry exact save" : "Save marketing plan"}
        </Button>
      </div>
      {!loaded && <p>Loading available plans…</p>}
      {expired && (
        <p role="alert">
          Class access has expired. Local edits cannot be saved or exported here. Reopen permitted
          access with your teacher.
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl border bg-muted/40 p-4 text-sm">
          {message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {record ? `Saved revision ${record.revision} at ${record.savedAt}` : "No confirmed save"} ·{" "}
        {dirty ? "Unsaved local edits" : "No local changes"}. Manual statuses are self-reported.
        Expiry is an access deadline, not verified deletion.
      </p>
      {headers.length > 0 && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer font-semibold">
            Open a saved marketing plan ({headers.length})
          </summary>
          <div className="mt-3 flex flex-wrap gap-3">
            {headers.map((h, i) => (
              <Button key={h.id} variant="outline" disabled={busy} onClick={() => void open(h.id)}>
                {h.audience === "principal_private" ? "Private" : "Team"} plan {i + 1} · revision{" "}
                {h.revision}
              </Button>
            ))}
          </div>
        </details>
      )}
      {audience === "team_shared" && !record && (
        <label className="flex items-start gap-3 rounded-xl border p-4 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
          />
          I understand that current and future members of this team can read and edit this new blank
          plan. I will add only business text I may share, never private interview notes or
          participant details.
        </label>
      )}
      <GuestField
        label="Marketing plan title"
        disabled={expired}
        value={doc.title}
        onChange={(v) =>
          update((d) => {
            d.title = v;
          })
        }
        max={120}
      />
      <nav aria-label="Marketing Lab steps" className="grid gap-2 md:grid-cols-5">
        {steps.map((s, i) => (
          <button
            key={s}
            type="button"
            aria-current={step === i ? "step" : undefined}
            className={`min-h-14 rounded-xl border p-3 text-left text-sm font-semibold ${step === i ? "border-primary bg-primary/10 text-primary" : "bg-background"}`}
            onClick={() => setStep(i)}
          >
            {i + 1}. {s}
          </button>
        ))}
      </nav>
      <fieldset disabled={expired} className="min-w-0">
        <legend className="sr-only">{steps[step]}</legend>
        <MarketingSteps document={doc} step={step} update={update} />
      </fieldset>
      <div className="flex justify-between gap-4">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Previous step
        </Button>
        <Button variant="outline" disabled={step === 4} onClick={() => setStep((s) => s + 1)}>
          Next step
        </Button>
      </div>
      {offers.length ? (
        <GuestActivityExport
          offers={offers}
          authorizeDownload={authorizeDownload}
          team={audience === "team_shared"}
        />
      ) : (
        <p className="text-sm">
          Finish invalid date/reference fields before creating an exact PDF. Your local text remains
          here.
        </p>
      )}
      {blocker.status === "blocked" && (
        <div role="alert" className="rounded-xl border p-4">
          <p>Your Marketing Lab has unsaved or unconfirmed work.</p>
          <Button variant="outline" onClick={() => blocker.reset()}>
            Keep editing marketing plan
          </Button>
          <Button variant="destructive" onClick={() => blocker.proceed()}>
            Leave marketing plan
          </Button>
        </div>
      )}
    </section>
  );
}
