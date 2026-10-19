import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  FlaskConical,
  Users,
  ClipboardList,
  Share2,
  Compass,
  ShieldCheck,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GuestField, GuestSelect } from "@/components/guest/GuestFields";
import { ActivityPdfExport } from "@/components/export/ActivityPdfExport";
import { guestActivityResult, guestActivityMessage } from "@/lib/guest-activities/contracts";
import {
  createEmptyGuestGrowth,
  guestGrowthDocumentSchema,
  guestGrowthPageSchema,
  guestGrowthRecordSchema,
  guestGrowthSaveReceiptSchema,
  guestGrowthHistorySchema,
  saveGuestGrowthSchema,
  GUEST_GROWTH_KINDS,
  type GuestGrowthDocument,
  type GuestGrowthKind,
  type guestGrowthHeaderSchema,
  type guestGrowthRecordSchema as RecordSchema,
} from "@/lib/guest-growth/contracts";
import {
  guestGrowthPortfolio,
  guestGrowthLearningPdf,
  guestGrowthExperimentPdf,
  guestGrowthPipelinePdf,
  guestGrowthSurveyPdf,
  guestGrowthReferralPdf,
  guestGrowthOnboardingPdf,
  guestGrowthExportAudiences,
  GUEST_GROWTH_TITLES,
  type GuestGrowthPdfSource,
  type GuestGrowthPdfScope,
} from "@/lib/guest-growth/pdf";
import type { GuestView } from "@/lib/guest-spaces/contracts";
import type { z } from "zod";
import { GrowthEditor } from "./Editors";
import { ReferencePicker } from "./ReferencePicker";
import type { GuestGrowthPorts } from "./ports";
import { canonicalGrowthJson } from "@/lib/guest-growth/transport";
type Header = z.infer<typeof guestGrowthHeaderSchema>;
type Saved = z.infer<typeof RecordSchema>;
type Save = z.infer<typeof saveGuestGrowthSchema>;
type Props = {
  view: GuestView;
  csrf: string;
  ports: GuestGrowthPorts;
  fictional?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};
function pdfDocument(signature: string, title: string) {
  const [scope, sources] = JSON.parse(signature) as [GuestGrowthPdfScope, GuestGrowthPdfSource[]];
  try {
    if (sources.length === 1) {
      const source = sources[0]!;
      const kind = source.state === "saved" ? source.record.kind : source.document.kind;
      switch (kind) {
        case "learning":
          return guestGrowthLearningPdf(source, scope, title);
        case "experiment":
          return guestGrowthExperimentPdf(source, scope, title);
        case "pipeline_contact":
          return guestGrowthPipelinePdf(source, scope, title);
        case "survey":
          return guestGrowthSurveyPdf(source, scope, title);
        case "referral":
          return guestGrowthReferralPdf(source, scope, title);
        case "onboarding":
          return guestGrowthOnboardingPdf(source, scope, title);
      }
    }
    return sources.length ? guestGrowthPortfolio(sources, scope, title) : null;
  } catch {
    return null;
  }
}
const fp = canonicalGrowthJson,
  icons = {
    learning: BookOpen,
    experiment: FlaskConical,
    pipeline_contact: Users,
    survey: ClipboardList,
    referral: Share2,
    onboarding: Compass,
  };
const summaries = {
  learning: "Separate what you heard from what you think it means.",
  experiment: "Plan a small falsifiable test; report the result separately.",
  pipeline_contact: "Track relevant aliases and distinguish reports from proof.",
  survey: "Draft questions that explore behavior without collecting responses here.",
  referral: "Ask respectfully for one relevant introduction.",
  onboarding: "Plan what to ask and observe around a first useful action.",
};
export function GuestGrowthWorkspace(props: Props) {
  return (
    <Workspace
      key={`${props.view.classId}:${props.view.teamId}:${props.view.principalId}:${props.csrf}:${props.view.accessExpiresAt}`}
      {...props}
    />
  );
}
function Workspace({ view, csrf, ports, fictional = false, onDirtyChange }: Props) {
  const [doc, setDoc] = useState<GuestGrowthDocument>(() => createEmptyGuestGrowth("learning")),
    [record, setRecord] = useState<Saved | null>(null),
    [id, setId] = useState<string>(() => crypto.randomUUID()),
    [audience, setAudience] = useState<"principal_private" | "team_shared">("principal_private"),
    [shared, setShared] = useState(false),
    [headers, setHeaders] = useState<Header[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false),
    [message, setMessage] = useState(""),
    [history, setHistory] = useState<Header[]>([]),
    [historyRevision, setHistoryRevision] = useState(""),
    [historical, setHistorical] = useState(false),
    [comparison, setComparison] = useState<Saved | null>(null),
    [portfolioIds, setPortfolioIds] = useState<string[]>([]),
    [portfolio, setPortfolio] = useState<Saved[]>([]),
    [now, setNow] = useState(Date.now);
  const life = useRef({ alive: true, epoch: 0 }),
    current = useRef(doc),
    pending = useRef<Save | null>(null),
    reporter = useRef(onDirtyChange);
  current.current = doc;
  reporter.current = onDirtyChange;
  const dirty = fp(doc) !== fp(record?.document ?? createEmptyGuestGrowth(doc.kind)),
    guard = dirty || busy || uncertain || shared,
    expired = now >= Date.parse(view.accessExpiresAt),
    teamUncreated = audience === "team_shared" && !record;
  const scope = useMemo<GuestGrowthPdfScope>(
    () => ({
      classId: view.classId,
      teamId: view.teamId,
      principalId: view.principalId,
      className: view.className,
      teamAlias: view.teamAlias,
      principalAlias: view.principalAlias,
      accessExpiresAt: view.accessExpiresAt,
      fictional,
    }),
    [view, fictional],
  );
  const matches = useCallback(
    (r: Header) =>
      r.classId === view.classId &&
      r.teamId === view.teamId &&
      (r.audience === "team_shared" || r.authorPrincipalId === view.principalId),
    [view],
  );
  useEffect(() => {
    onDirtyChange?.(guard);
  }, [guard, onDirtyChange]);
  useEffect(() => {
    const s = life.current;
    s.alive = true;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      s.alive = false;
      s.epoch++;
      clearInterval(t);
      reporter.current?.(false);
    };
  }, []);
  useEffect(() => {
    if (!guard) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [guard]);
  const alive = (epoch: number) => life.current.alive && life.current.epoch === epoch;
  async function list(more = false) {
    if (busy || Date.now() >= Date.parse(view.accessExpiresAt)) return;
    const epoch = ++life.current.epoch;
    setBusy(true);
    setMessage("");
    const raw = await ports.list({ csrf, ...(more && cursor ? { cursor } : {}) }).catch(() => null);
    if (!alive(epoch)) return;
    setBusy(false);
    const r = guestActivityResult(guestGrowthPageSchema).safeParse(raw);
    if (!r.success || !r.data.ok || r.data.data.items.some((h) => !matches(h))) {
      setMessage(
        "Saved activities could not be confirmed in this guest scope. Local drafts remain here.",
      );
      return;
    }
    const page = r.data.data;
    setHeaders((old) =>
      more ? [...new Map([...old, ...page.items].map((h) => [h.id, h])).values()] : page.items,
    );
    setCursor(page.nextCursor);
    setLoaded(true);
  }
  useEffect(() => {
    void list();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function permitSwitch() {
    return (
      !guard ||
      window.confirm(
        "Leave this growth draft with unsaved or unconfirmed work? Save or export first. A request already sent may still finish.",
      )
    );
  }
  function fresh(kind: GuestGrowthKind, team = false) {
    if (!permitSwitch()) return;
    life.current.epoch++;
    pending.current = null;
    setDoc(createEmptyGuestGrowth(kind));
    setRecord(null);
    setId(crypto.randomUUID());
    setAudience(team ? "team_shared" : "principal_private");
    setShared(false);
    setUncertain(false);
    setConflict(false);
    setComparison(null);
    setHistory([]);
    setHistoryRevision("");
    setHistorical(false);
    setBusy(false);
    setMessage(
      team
        ? "New blank team activity. Confirm and create the empty shared record before adding business material."
        : "New private local draft. Nothing has been saved yet.",
    );
  }
  async function open(artifactId: string, revision?: number, compare = false) {
    if (busy || Date.now() >= Date.parse(view.accessExpiresAt) || (!compare && !permitSwitch()))
      return;
    const epoch = ++life.current.epoch;
    setBusy(true);
    setMessage("");
    const raw = await ports
      .load({ csrf, artifactId, ...(revision ? { revision } : {}) })
      .catch(() => null);
    if (!alive(epoch)) return;
    setBusy(false);
    const r = guestActivityResult(guestGrowthRecordSchema).safeParse(raw);
    if (
      !r.success ||
      !r.data.ok ||
      !matches(r.data.data) ||
      r.data.data.id !== artifactId ||
      (revision !== undefined && r.data.data.revision !== revision)
    ) {
      setMessage(
        "This exact saved activity is unavailable. Your local draft remains here; no other activity was opened.",
      );
      return;
    }
    const known =
      headers.find((h) => h.id === artifactId) ?? (record?.id === artifactId ? record : undefined);
    if (
      known &&
      [known.kind, known.audience, known.authorPrincipalId].join(":") !==
        [r.data.data.kind, r.data.data.audience, r.data.data.authorPrincipalId].join(":")
    ) {
      setMessage(
        "The immutable saved activity scope changed unexpectedly. Your local draft remains here.",
      );
      return;
    }
    if (compare) {
      setComparison(r.data.data);
      return;
    }
    pending.current = null;
    setRecord(r.data.data);
    setDoc(r.data.data.document);
    setId(r.data.data.id);
    setAudience(r.data.data.audience);
    setShared(false);
    setHistorical(revision !== undefined);
    setHistory([]);
    setHistoryRevision("");
    setComparison(null);
    setUncertain(false);
    setConflict(false);
    setMessage(
      `Opened exact saved revision ${r.data.data.revision}${revision !== undefined ? " for review and export" : ""}.`,
    );
  }
  async function save() {
    if (busy || Date.now() >= Date.parse(view.accessExpiresAt) || historical || conflict || !loaded)
      return;
    let input = pending.current;
    if (!input) {
      const candidate = {
          csrf,
          artifactId: id,
          audience,
          expectedRevision: record?.revision ?? 0,
          mutationId: crypto.randomUUID(),
          sharedAudienceConfirmed: teamUncreated && shared,
          document: doc,
        },
        valid = saveGuestGrowthSchema.safeParse(candidate);
      if (!valid.success) {
        setMessage(valid.error.issues[0]?.message ?? "Check the activity before saving.");
        return;
      }
      input = structuredClone(valid.data);
      pending.current = input;
    }
    const sent = input,
      epoch = ++life.current.epoch;
    setBusy(true);
    setMessage("");
    const raw = await ports.save(sent).catch(() => null);
    if (!alive(epoch)) return;
    setBusy(false);
    const r = guestActivityResult(guestGrowthSaveReceiptSchema).safeParse(raw);
    if (!r.success || !r.data.ok) {
      const code = r.success && !r.data.ok ? r.data.code : "UNAVAILABLE";
      if (code === "UNAVAILABLE") {
        setUncertain(true);
        setMessage(
          "Save outcome is unconfirmed. Keep this draft open and retry the exact save; newer local edits remain.",
        );
      } else {
        pending.current = null;
        setUncertain(false);
        setConflict(code === "CONFLICT" || code === "IDEMPOTENCY_CONFLICT");
        setMessage(guestActivityMessage(code));
      }
      return;
    }
    const ack = r.data.data;
    if (
      !matches(ack.record) ||
      ack.record.id !== sent.artifactId ||
      ack.record.kind !== sent.document.kind ||
      ack.record.audience !== sent.audience ||
      ack.savedRevision !== sent.expectedRevision + 1 ||
      (ack.record.revision === ack.savedRevision && fp(ack.record.document) !== fp(sent.document))
    ) {
      setUncertain(true);
      setMessage("The saved scope/revision could not be confirmed. Your draft remains here.");
      return;
    }
    pending.current = null;
    setUncertain(false);
    setRecord(ack.record);
    setShared(false);
    setHistorical(false);
    const newer = ack.record.revision !== ack.savedRevision;
    if (!newer && fp(current.current) === fp(sent.document)) setDoc(ack.record.document);
    setConflict(newer);
    setHeaders((old) => [...old.filter((h) => h.id !== ack.record.id), ack.record]);
    setHistory([]);
    setMessage(
      newer
        ? "Your exact save was acknowledged, but a newer saved revision exists. Keep local edits and review it before continuing."
        : `Saved revision ${ack.savedRevision} confirmed${fp(current.current) !== fp(sent.document) ? "; newer local edits are still unsaved" : ""}.`,
    );
  }
  async function loadHistory() {
    if (!record || busy || Date.now() >= Date.parse(view.accessExpiresAt)) return;
    const epoch = ++life.current.epoch;
    setBusy(true);
    const raw = await ports.history({ csrf, artifactId: record.id }).catch(() => null);
    if (!alive(epoch)) return;
    setBusy(false);
    const r = guestActivityResult(guestGrowthHistorySchema).safeParse(raw);
    if (
      !r.success ||
      !r.data.ok ||
      r.data.data.artifactId !== record.id ||
      r.data.data.versions.some(
        (h) =>
          !matches(h) ||
          h.kind !== record.kind ||
          h.audience !== record.audience ||
          h.authorPrincipalId !== record.authorPrincipalId,
      )
    ) {
      setMessage("Retained revision history could not be confirmed. Your draft remains here.");
      return;
    }
    setHistory(r.data.data.versions);
    setHistoryRevision("");
  }
  async function loadPortfolio() {
    if (!portfolioIds.length || busy || Date.now() >= Date.parse(view.accessExpiresAt)) return;
    const chosen = headers.filter((h) => portfolioIds.includes(h.id));
    if (chosen.length !== portfolioIds.length) {
      setMessage("A selected saved header is no longer available. Review your selection.");
      return;
    }
    const epoch = ++life.current.epoch;
    setBusy(true);
    setPortfolio([]);
    const results = await Promise.allSettled(
      chosen.map((h) => ports.load({ csrf, artifactId: h.id, revision: h.revision })),
    );
    if (!alive(epoch)) return;
    setBusy(false);
    const records: Saved[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!,
        header = chosen[i]!,
        r = guestActivityResult(guestGrowthRecordSchema).safeParse(
          result.status === "fulfilled" ? result.value : null,
        );
      if (
        !r.success ||
        !r.data.ok ||
        !matches(r.data.data) ||
        r.data.data.id !== header.id ||
        r.data.data.revision !== header.revision ||
        r.data.data.kind !== header.kind ||
        r.data.data.audience !== header.audience ||
        r.data.data.authorPrincipalId !== header.authorPrincipalId
      ) {
        setMessage(
          "The exact selected portfolio could not be confirmed. Nothing was substituted or silently omitted.",
        );
        return;
      }
      records.push(r.data.data);
    }
    setPortfolio(records);
    setMessage(
      `Loaded ${records.length} exact saved activities for your selected portfolio; export still checks current access.`,
    );
  }
  const pdfSources = useMemo<GuestGrowthPdfSource[]>(() => {
    const parsed = guestGrowthDocumentSchema.safeParse(doc);
    if (!parsed.success || teamUncreated) return [];
    return record
      ? [{ state: "saved", record, localDocument: parsed.data }]
      : [{ state: "draft", localDraftId: id, document: parsed.data }];
  }, [doc, record, teamUncreated, id]);
  const portfolioSources = useMemo<GuestGrowthPdfSource[]>(
    () => portfolio.map((record) => ({ state: "saved", record })),
    [portfolio],
  );
  const signature = fp([scope, pdfSources]),
    portfolioSignature = fp([scope, portfolioSources]);
  const latestPdf = useRef({ current: signature, portfolio: portfolioSignature, uncertain });
  latestPdf.current = { current: signature, portfolio: portfolioSignature, uncertain };
  async function authorize(
    sources: readonly GuestGrowthPdfSource[],
    expected: string,
    mode: "current" | "portfolio" = "current",
  ) {
    const epoch = life.current.epoch;
    const permitted = () =>
      life.current.alive &&
      !latestPdf.current.uncertain &&
      Date.now() < Date.parse(view.accessExpiresAt) &&
      latestPdf.current[mode] === expected;
    if (!permitted())
      throw new Error("This guest PDF scope is changed or unconfirmed. Review again.");
    await ports.authorizeExport({ csrf, scope, sources });
    if (!alive(epoch) || !permitted())
      throw new Error("This guest PDF scope changed before delivery.");
  }
  const currentPdf = useMemo(() => pdfDocument(signature, "Current growth activity"), [signature]);
  const portfolioPdf = useMemo(
    () => pdfDocument(portfolioSignature, "Selected saved growth portfolio"),
    [portfolioSignature],
  );
  const change = (next: GuestGrowthDocument) => setDoc(next),
    Icon = icons[doc.kind];
  return (
    <section
      aria-label="Guest growth studio"
      className="space-y-6 rounded-3xl border bg-card p-6 lg:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">
            First 10 → Next 50 → Next 100
          </p>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">
            Learn. Test. Keep moving.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Give each learning, experiment and growth draft its own place. Save a precise revision,
            keep uncertainty visible and take your work with you.
          </p>
        </div>
        <div className="rounded-2xl border bg-primary/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-bold">
            <ShieldCheck className="size-4" />
            {audience === "principal_private"
              ? "Private to this learner"
              : "Current and future authorized teammates"}
          </p>
          <p className="mt-2">
            {view.className} / {view.teamAlias}
          </p>
          <p className="mt-2 max-w-xs text-xs text-muted-foreground">
            No AI, automatic sending, survey collection or implicit teacher access.
          </p>
        </div>
      </header>
      <nav aria-label="Growth activity kinds" className="grid gap-2 lg:grid-cols-6">
        {GUEST_GROWTH_KINDS.map((kind) => {
          const I = icons[kind];
          return (
            <button
              key={kind}
              className={`min-h-24 rounded-2xl border p-4 text-left text-sm font-bold ${kind === doc.kind ? "border-primary bg-primary/10 text-primary" : "bg-background"}`}
              aria-current={kind === doc.kind ? "page" : undefined}
              disabled={busy}
              onClick={() => fresh(kind)}
            >
              <I className="mb-3 size-5" />
              {GUEST_GROWTH_TITLES[kind]}
            </button>
          );
        })}
      </nav>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div aria-label="Growth editor area" className="min-w-0 space-y-5">
          <div className="rounded-2xl border bg-background p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="flex items-center gap-2 text-xl font-bold">
                  <Icon className="size-5 text-primary" />
                  {GUEST_GROWTH_TITLES[doc.kind]}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{summaries[doc.kind]}</p>
              </div>
              <Button
                disabled={
                  !loaded ||
                  busy ||
                  expired ||
                  historical ||
                  conflict ||
                  (!dirty && !uncertain && !teamUncreated)
                }
                onClick={() => void save()}
              >
                {busy
                  ? "Checking…"
                  : uncertain
                    ? "Retry exact growth save"
                    : teamUncreated
                      ? "Create confirmed blank team activity"
                      : "Save growth revision"}
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {record
                ? `Exact loaded revision ${record.revision} · ${record.savedAt}`
                : "Not saved — local draft only"}{" "}
              · {dirty ? "Unsaved local edits" : "No local changes"}
              {historical ? " · Retained revision review; saving disabled" : ""}
            </p>
          </div>
          {message && (
            <p role="status" className="rounded-xl border bg-muted/30 p-4 text-sm">
              {message}
            </p>
          )}
          {expired && (
            <p role="alert" className="rounded-xl border p-4 text-sm">
              Class access has expired. Local text stays visible; saving, reopening and PDF delivery
              are unavailable until valid access is restored.
            </p>
          )}
          {teamUncreated && (
            <label className="flex items-start gap-3 rounded-xl border bg-primary/5 p-5 text-sm">
              <input
                type="checkbox"
                checked={shared}
                disabled={busy || expired}
                onChange={(e) => setShared(e.target.checked)}
              />
              I understand that current and future authorized teammates can read/edit this new blank
              activity. Nothing is copied from my private work. Create the blank record before
              adding business material.
            </label>
          )}
          <fieldset
            disabled={expired || historical || teamUncreated}
            className="min-w-0 space-y-5 rounded-2xl border bg-background p-5"
          >
            <legend className="sr-only">Structured growth editor</legend>
            <GuestField
              label="Growth activity title"
              value={doc.title}
              max={120}
              onChange={(title) =>
                setDoc((d) =>
                  d.kind === "learning"
                    ? { ...d, title, reviewState: "draft", reviewedAt: null }
                    : { ...d, title },
                )
              }
            />
            <GuestSelect
              label="Teaching stage"
              value={String(doc.stage)}
              onChange={(v) => {
                const stage = Number(v);
                if (
                  (stage === 1 || stage === 2 || stage === 3) &&
                  !((doc.kind === "pipeline_contact" || doc.kind === "survey") && stage === 1) &&
                  !((doc.kind === "referral" || doc.kind === "onboarding") && stage !== 3)
                )
                  setDoc(
                    (doc.kind === "learning"
                      ? { ...doc, stage, reviewState: "draft", reviewedAt: null }
                      : { ...doc, stage }) as GuestGrowthDocument,
                  );
              }}
            >
              {([1, 2, 3] as const)
                .filter((s) =>
                  doc.kind === "referral" || doc.kind === "onboarding"
                    ? s === 3
                    : doc.kind === "pipeline_contact" || doc.kind === "survey"
                      ? s >= 2
                      : true,
                )
                .map((s) => (
                  <option key={s} value={s}>
                    {s === 1 ? "First 10" : s === 2 ? "Next 50" : "Next 100"}
                  </option>
                ))}
            </GuestSelect>
            <GrowthEditor document={doc} onChange={change} />
          </fieldset>
          <fieldset
            disabled={expired || historical || teamUncreated}
            className="space-y-4 rounded-2xl border p-5"
          >
            <legend className="px-2 font-bold">Exact saved references</legend>
            {doc.kind === "experiment" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Use up to four saved learnings. No linked body is copied into this experiment.
                </p>
                {doc.learningRefs.map((ref, i) => (
                  <ReferencePicker
                    key={`${ref.artifactId}:${i}`}
                    label={`Learning reference ${i + 1}`}
                    target="learning"
                    value={ref}
                    headers={headers}
                    view={view}
                    csrf={csrf}
                    audience={audience}
                    ports={ports}
                    onChange={(v) =>
                      setDoc({
                        ...doc,
                        learningRefs: v
                          ? [
                              ...doc.learningRefs.slice(0, i),
                              v.kind === "learning" ? v : ref,
                              ...doc.learningRefs.slice(i + 1),
                            ]
                          : doc.learningRefs.filter((_, j) => j !== i),
                      })
                    }
                  />
                ))}
                {doc.learningRefs.length < 4 && (
                  <ReferencePicker
                    key={`new:${doc.learningRefs.length}`}
                    label="Add learning reference"
                    target="learning"
                    value={null}
                    headers={headers}
                    view={view}
                    csrf={csrf}
                    audience={audience}
                    ports={ports}
                    onChange={(v) => {
                      if (v?.kind === "learning")
                        setDoc({ ...doc, learningRefs: [...doc.learningRefs, v] });
                    }}
                  />
                )}
              </>
            ) : doc.kind === "survey" || doc.kind === "onboarding" ? (
              <ReferencePicker
                label="Experiment reference"
                target="experiment"
                value={doc.experimentRef}
                headers={headers}
                view={view}
                csrf={csrf}
                audience={audience}
                ports={ports}
                onChange={(v) =>
                  setDoc({ ...doc, experimentRef: v?.kind === "experiment" ? v : null })
                }
              />
            ) : doc.kind === "referral" ? (
              <>
                <ReferencePicker
                  label="Pipeline reference"
                  target="pipeline_contact"
                  value={doc.contactRef}
                  headers={headers}
                  view={view}
                  csrf={csrf}
                  audience={audience}
                  ports={ports}
                  onChange={(v) =>
                    setDoc({ ...doc, contactRef: v?.kind === "pipeline_contact" ? v : null })
                  }
                />
                <ReferencePicker
                  label="Experiment reference"
                  target="experiment"
                  value={doc.experimentRef}
                  headers={headers}
                  view={view}
                  csrf={csrf}
                  audience={audience}
                  ports={ports}
                  onChange={(v) =>
                    setDoc({ ...doc, experimentRef: v?.kind === "experiment" ? v : null })
                  }
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This standalone artifact has no implicit source attachment. Use deidentified
                authored summaries; private interview notes and cross-studio context are not
                imported.
              </p>
            )}
          </fieldset>
          {record && (
            <div className="space-y-3 rounded-2xl border p-5">
              <h4 className="font-bold">Review an exact saved revision</h4>
              <Button
                variant="outline"
                disabled={busy || expired}
                onClick={() => void loadHistory()}
              >
                Load retained growth revisions
              </Button>
              {history.length > 0 && (
                <>
                  <GuestSelect
                    label="Retained growth revision"
                    value={historyRevision}
                    onChange={setHistoryRevision}
                  >
                    <option value="">Choose a revision</option>
                    {history.map((h) => (
                      <option key={h.revision} value={h.revision}>
                        Revision {h.revision} · {new Date(h.savedAt).toLocaleString()}
                      </option>
                    ))}
                  </GuestSelect>
                  <Button
                    variant="outline"
                    disabled={busy || !historyRevision}
                    onClick={() => void open(record.id, Number(historyRevision))}
                  >
                    Open exact retained growth revision
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                disabled={busy || expired}
                onClick={() => void open(record.id, undefined, true)}
              >
                Compare current saved growth version
              </Button>
            </div>
          )}
          {comparison && (
            <div className="space-y-4 rounded-2xl border bg-primary/5 p-5">
              <h4 className="font-bold">
                Current saved comparison · revision {comparison.revision}
              </h4>
              <p className="text-sm">
                Your local editor has not changed. Review the saved fields before choosing a basis
                for your next CAS save.
              </p>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border bg-background p-4 text-xs">
                {JSON.stringify(comparison.document, null, 2)}
              </pre>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (
                      uncertain &&
                      !window.confirm(
                        "Clear the pending request after reviewing this saved version? An already-sent request may still finish.",
                      )
                    )
                      return;
                    pending.current = null;
                    setRecord(comparison);
                    setConflict(false);
                    setUncertain(false);
                    setHistorical(false);
                    setComparison(null);
                    setMessage(
                      "Local edits kept; the reviewed saved revision is the explicit basis for your next save.",
                    );
                  }}
                >
                  Keep local edits on reviewed saved basis
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Replace local edits with this reviewed saved version? An already-sent request may still finish.",
                      )
                    )
                      return;
                    pending.current = null;
                    setDoc(comparison.document);
                    setRecord(comparison);
                    setConflict(false);
                    setUncertain(false);
                    setHistorical(false);
                    setComparison(null);
                  }}
                >
                  Use reviewed saved version
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-4 rounded-2xl border p-5">
            <h4 className="flex items-center gap-2 font-bold">
              <FileDown className="size-4" />
              Current activity PDF
            </h4>
            <p className="text-sm text-muted-foreground">
              Choose sections and redactions in the PDF preview. Unsaved text stays labeled.
              Downloading does not submit or grant access.
            </p>
            {currentPdf ? (
              <ActivityPdfExport
                key={signature}
                document={currentPdf}
                permittedAudiences={guestGrowthExportAudiences(pdfSources)}
                authorizeDownload={() => authorize(pdfSources, signature)}
              />
            ) : (
              <p className="text-sm">
                Create the blank team record first, or correct invalid fields before preparing a
                PDF. Your local text remains visible.
              </p>
            )}
          </div>
        </div>
        <aside className="space-y-5 xl:sticky xl:top-5">
          <div className="space-y-4 rounded-2xl border bg-background p-5">
            <h3 className="text-lg font-bold">Your activity library</h3>
            <p className="text-xs text-muted-foreground">
              Only confirmed saved headers in your current guest scope appear here.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || expired}
                onClick={() => void list()}
              >
                Refresh saved growth work
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || expired}
                onClick={() => fresh(doc.kind)}
              >
                New private activity
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || expired}
                onClick={() => fresh(doc.kind, true)}
              >
                New blank team activity
              </Button>
            </div>
            {!loaded && (
              <p className="text-sm">
                Saved work has not been confirmed yet. You can keep a local private draft.
              </p>
            )}
            <ul className="max-h-[36rem] space-y-3 overflow-auto">
              {headers.map((h, i) => (
                <li key={h.id} className="rounded-xl border p-3">
                  <button
                    className="min-h-10 text-left text-sm font-semibold underline"
                    disabled={busy || expired}
                    onClick={() => void open(h.id)}
                  >
                    {GUEST_GROWTH_TITLES[h.kind]} {i + 1} · revision {h.revision}
                  </button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {h.audience === "team_shared" ? "Team-shared" : "Principal-private"}
                  </p>
                  <label className="mt-2 flex min-h-9 items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={portfolioIds.includes(h.id)}
                      disabled={busy || (!portfolioIds.includes(h.id) && portfolioIds.length >= 50)}
                      onChange={(e) => {
                        setPortfolioIds((old) =>
                          e.target.checked ? [...old, h.id] : old.filter((x) => x !== h.id),
                        );
                        setPortfolio([]);
                      }}
                    />
                    Include exact revision in portfolio
                  </label>
                </li>
              ))}
            </ul>
            {cursor && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy || expired}
                onClick={() => void list(true)}
              >
                More saved growth work
              </Button>
            )}
          </div>
          <div className="space-y-4 rounded-2xl border bg-primary/5 p-5">
            <h3 className="font-bold">Selected saved portfolio</h3>
            <p className="text-sm">
              {portfolioIds.length} chosen · current local edits are excluded. Every selected record
              must load and authorize exactly.
            </p>
            <Button
              variant="outline"
              disabled={busy || expired || !portfolioIds.length}
              onClick={() => void loadPortfolio()}
            >
              Load exact selected growth portfolio
            </Button>
            {portfolio.length > 0 && !portfolioPdf && (
              <p role="alert" className="text-sm">
                This selection is too large or invalid for one PDF. Choose fewer activities; nothing
                was silently omitted.
              </p>
            )}
            {portfolioPdf && (
              <ActivityPdfExport
                key={portfolioSignature}
                document={portfolioPdf}
                permittedAudiences={guestGrowthExportAudiences(portfolioSources)}
                authorizeDownload={() =>
                  authorize(portfolioSources, portfolioSignature, "portfolio")
                }
              />
            )}
          </div>
          <p className="px-2 text-xs leading-relaxed text-muted-foreground">
            Reported learning is not proof. Classroom membership does not permit AI processing or
            teacher disclosure. Previously downloaded copies cannot be recalled after access ends.
          </p>
        </aside>
      </div>
    </section>
  );
}
