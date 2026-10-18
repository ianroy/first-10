import { workspaceWriteError } from "@/lib/write-errors";
import { OwnerActivityExport } from "@/components/export/OwnerActivityExport";
import { outreachActivities, projectActivities, contactActivities } from "@/lib/export/adapters";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateAI } from "@/lib/ai.functions";
import { useAIIntent } from "@/hooks/useAIIntent";
import { recordedAIOutput, outreachRows } from "@/lib/ai/saved-output";
import { AIOrigin } from "@/components/AIOrigin";
import { AppShell, Card, DraftBadge, Empty } from "@/components/AppShell";
import { RequireProject } from "@/components/RequireProject";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PIPELINE,
  useContacts,
  useOutreach,
  useRefresh,
  type Outreach,
  type Project,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/outreach")({
  head: () => ({
    meta: [
      { title: "Outreach — First Ten" },
      { name: "description", content: "Outreach plans, message drafts, pipeline and metrics." },
    ],
  }),
  component: () => (
    <RequireProject>{(p) => <OutreachPage key={`${p.user_id}:${p.id}`} p={p} />}</RequireProject>
  ),
});

function OutreachPage({ p }: { p: Project }) {
  const [tab, setTab] = useState(p.stage >= 3 ? 3 : 2);
  if (p.stage < 2)
    return (
      <AppShell title="Outreach">
        <Empty
          title="Unlocks after your First 10"
          body="Review the First 10 checklist and your accepted learnings before moving on. Those observations help shape the next outreach draft."
          action={
            <Button asChild className="rounded-xl">
              <Link to="/learnings">
                <Lock /> See the checklist
              </Link>
            </Button>
          }
        />
      </AppShell>
    );
  return (
    <AppShell title="Outreach">
      <p className="max-w-2xl text-muted-foreground">
        Turn reviewed learning into an outreach draft, then check the audience, claims and
        permission before sending it yourself.
      </p>
      <div className="flex max-w-xl gap-2" role="group" aria-label="Outreach stage">
        {[2, 3].map((s) => (
          <button
            key={s}
            disabled={p.stage < s}
            aria-pressed={tab === s}
            onClick={() => setTab(s)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40 ${tab === s ? "bg-foreground text-background" : "bg-muted"}`}
          >
            {s === 2 ? "Next 50" : "Next 100"}
          </button>
        ))}
      </div>
      {tab === 2 ? <Stage2 p={p} /> : <Stage3 p={p} />}
    </AppShell>
  );
}

function useGenerate(p: Project, kind: "stage2" | "stage3") {
  const gen = useServerFn(generateAI);
  const intent = useAIIntent(p.id, kind);
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const operationId = intent.begin();
    if (!operationId) return;
    setBusy(true);
    try {
      const output = await gen({ data: { kind, projectId: p.id, operationId, withOrigin: true } });
      if (!intent.isCurrent(operationId)) return;
      const recorded =
        kind === "stage2" ? recordedAIOutput("stage2", output) : recordedAIOutput("stage3", output);
      const r = recorded.data;
      const saved = await supabase.rpc("save_generated_outreach", {
        p_project_id: p.id,
        p_stage: kind === "stage2" ? 2 : 3,
        p_origin_id: recorded.originId,
        p_rows: outreachRows(r),
        ...("survey" in r ? { p_survey: r.survey } : {}),
      });
      if (saved.error)
        throw new Error(
          "The new outreach plan could not be saved. Your previous saved plan is unchanged.",
        );
      if (!intent.isCurrent(operationId)) return;
      refresh("outreach", "project");
      intent.succeeded(operationId);
    } catch (e) {
      intent.failed(operationId);
      if (intent.isCurrent(operationId)) toast.error((e as Error).message);
    } finally {
      if (intent.isCurrent(operationId)) setBusy(false);
    }
  };
  return {
    busy,
    run,
    uncertain: intent.uncertain,
    runNew: () => {
      if (intent.newRequest()) void run();
    },
  };
}

function DraftItem({ o, copy }: { o: Outreach; copy?: boolean | undefined }) {
  const refresh = useRefresh();
  const [body, setBody] = useState(o.body);
  return (
    <div className="rounded-xl bg-muted p-3">
      <label htmlFor={`outreach-${o.id}`} className="mb-2 block break-words text-sm font-semibold">
        {o.title || "Draft text"}
      </label>
      <Textarea
        id={`outreach-${o.id}`}
        value={body}
        rows={copy ? 5 : 3}
        onChange={(e) => setBody(e.target.value)}
        className="rounded-lg bg-background text-sm"
        onBlur={async () => {
          if (body !== o.body) {
            const { error } = await supabase.from("outreach").update({ body }).eq("id", o.id);
            if (error) {
              toast.error(workspaceWriteError(error));
              return;
            }
            refresh("outreach");
          }
        }}
      />
      <AIOrigin projectId={o.project_id} originId={o.generation_origin_id} />
      <OwnerActivityExport
        project={{ id: o.project_id, user_id: o.user_id }}
        activities={() =>
          outreachActivities({ id: o.project_id, user_id: o.user_id }, [{ ...o, body }])
        }
      />
      {copy && (
        <Button
          variant="outline"
          aria-label={`Copy ${o.title || "draft"}`}
          size="sm"
          className="mt-2 min-h-11 rounded-lg"
          onClick={() => {
            navigator.clipboard.writeText(body);
            toast.success("Copied");
          }}
        >
          <Copy /> Copy
        </Button>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  copy,
}: {
  title: string;
  items: Outreach[];
  copy?: boolean | undefined;
}) {
  if (!items.length) return null;
  return (
    <Card className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <DraftBadge />
      </div>
      <div className="space-y-2">
        {items.map((o) => (
          <DraftItem key={o.id} o={o} copy={copy} />
        ))}
      </div>
    </Card>
  );
}

function Stage2({ p }: { p: Project }) {
  const { data: out = [] } = useOutreach(p.id);
  const { data: contacts = [] } = useContacts(p.id);
  const refresh = useRefresh();
  const { busy, run, uncertain, runNew } = useGenerate(p, "stage2");
  const items = out.filter((o) => o.stage === 2).reverse();
  const survey = (p.survey as string[]) ?? [];
  const [sv, setSv] = useState<string | null>(null);
  const pipe = contacts.filter((c) => c.stage === 2);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {uncertain && (
        <div role="status" className="rounded-xl border p-4 text-sm lg:col-span-2">
          The previous request may have completed; repeating it cannot generate twice. A new request
          uses additional allowance.
          <Button variant="outline" disabled={busy} className="ml-3" onClick={runNew}>
            Request a new AI plan
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <Card className="min-w-0 text-center lg:col-span-2">
          <h2 className="text-xl font-bold">Build your plan for the next 50</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Uses your referrals and accepted learnings to draft places to investigate and messages
            to review. Suggested channels and posting rules are not verified.
          </p>
          <Button size="xl" className="mt-4" disabled={busy} onClick={run}>
            {busy ? "Planning…" : "Create my outreach plan"}
          </Button>
        </Card>
      ) : (
        <>
          <Section
            title="Channels to investigate"
            items={items.filter((o) => o.kind === "channel")}
          />
          <Section title="Message drafts" items={items.filter((o) => o.kind === "draft")} copy />
        </>
      )}
      {survey.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="feedback-survey-title" className="text-lg font-bold">
              Feedback survey
            </h2>
            <DraftBadge />
          </div>
          <p id="feedback-survey-help" className="mb-2 text-sm text-muted-foreground">
            Review for people who tried it. One question per line. Copy to your own form or message;
            responses are not collected here.
          </p>
          <AIOrigin projectId={p.id} originId={p.survey_origin_id} />
          <OwnerActivityExport
            project={p}
            activities={() =>
              projectActivities({
                ...p,
                survey: sv === null ? p.survey : sv.split("\n"),
              }).filter((o) => o.activity.key === "survey")
            }
          />
          <Textarea
            aria-labelledby="feedback-survey-title"
            aria-describedby="feedback-survey-help"
            rows={survey.length + 2}
            value={sv ?? survey.join("\n")}
            onChange={(e) => setSv(e.target.value)}
            className="rounded-xl text-sm"
          />
          <div className="mt-2 flex gap-2">
            {sv !== null && (
              <Button
                className="flex-1 rounded-xl"
                onClick={async () => {
                  const { error } = await supabase
                    .from("projects")
                    .update({ survey: sv.split("\n").filter(Boolean) })
                    .eq("id", p.id);
                  if (error) {
                    toast.error(workspaceWriteError(error));
                    return;
                  }
                  setSv(null);
                  refresh("project");
                  toast.success("Saved");
                }}
              >
                Save
              </Button>
            )}
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => {
                navigator.clipboard.writeText(sv ?? survey.join("\n"));
                toast.success("Copied");
              }}
            >
              <Copy /> Copy
            </Button>
          </div>
        </Card>
      )}
      <Card>
        <OwnerActivityExport project={p} activities={() => contactActivities(p, pipe)} />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Pipeline</h2>
          <Link to="/contacts" className="text-sm font-semibold text-primary">
            + Add people
          </Link>
        </div>
        {pipe.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            As you message people, add them under People → Next 50 and move them along here.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {PIPELINE.map((s, si) => {
              const list = pipe.filter((c) => c.status === s.key);
              return (
                <div key={s.key}>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {s.label} · {list.length}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {list.map((c) => (
                      <button
                        key={c.id}
                        aria-label={
                          si < PIPELINE.length - 1
                            ? `Move ${c.first_name} to ${PIPELINE[si + 1]!.label}`
                            : `${c.first_name}: ${s.label}`
                        }
                        disabled={si === PIPELINE.length - 1}
                        onClick={async () => {
                          const { error } = await supabase
                            .from("contacts")
                            .update({ status: PIPELINE[si + 1]!.key })
                            .eq("id", c.id);
                          if (error) {
                            toast.error(workspaceWriteError(error));
                            return;
                          }
                          refresh("contacts");
                        }}
                        className="min-h-11 rounded-full border bg-background px-3 py-2 text-sm"
                      >
                        {c.first_name} {si < PIPELINE.length - 1 && "→"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Select a person to record the next step only after it happens. These are manually
              reported statuses.
            </p>
          </div>
        )}
      </Card>
      {items.length > 0 && (
        <button
          className="min-h-11 rounded-lg text-sm text-muted-foreground underline lg:col-span-2"
          disabled={busy}
          onClick={run}
        >
          {busy ? "Re-planning…" : "Regenerate plan (replaces drafts)"}
        </button>
      )}
    </div>
  );
}

function Stage3({ p }: { p: Project }) {
  const { data: out = [] } = useOutreach(p.id);
  const refresh = useRefresh();
  const { busy, run, uncertain, runNew } = useGenerate(p, "stage3");
  const items = out.filter((o) => o.stage === 3).reverse();
  const check = (p.checklist ?? {}) as Record<string, unknown>;
  const m = (check["metrics"] ?? { signups: 0, active: 0, returning: 0 }) as {
    signups: number;
    active: number;
    returning: number;
  };
  const [mm, setMm] = useState(m);
  const [metricTouched, setMetricTouched] = useState<Record<string, boolean>>({});
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {uncertain && (
        <div role="status" className="rounded-xl border p-4 text-sm lg:col-span-2">
          The previous request may have completed; repeating it cannot generate twice. A new request
          uses additional allowance.
          <Button variant="outline" disabled={busy} className="ml-3" onClick={runNew}>
            Request a new AI plan
          </Button>
        </div>
      )}
      <Card>
        <h2 className="text-lg font-bold">Your numbers</h2>
        <OwnerActivityExport
          project={p}
          activities={() =>
            projectActivities({
              ...p,
              checklist: {
                ...check,
                metrics: Object.fromEntries(
                  Object.entries(mm).map(([key, value]) => [
                    key,
                    metricTouched[key]
                      ? value
                      : ((check["metrics"] as Record<string, unknown> | undefined)?.[key] ?? null),
                  ]),
                ),
              } as NonNullable<import("@/integrations/supabase/types").Json>,
            }).filter((o) => o.activity.key === "metrics")
          }
        />
        <p className="mb-3 text-sm text-muted-foreground">
          Manually entered counts, not automatic analytics. Use the same population and period for
          each comparison; keep dates and sources in your notes.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["signups", "Sign-ups"],
              ["active", "Active"],
              ["returning", "Came back"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="text-xs text-muted-foreground">
              {l}
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={mm[k] ?? 0}
                onChange={(e) => {
                  setMm({ ...mm, [k]: Number(e.target.value) });
                  setMetricTouched((old) => ({ ...old, [k]: true }));
                }}
                className="mt-1 h-12 rounded-xl text-center text-lg font-bold text-foreground"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-secondary p-3">
            <p className="font-display text-2xl font-bold">{pct(mm.active, mm.signups)}%</p>
            <p className="text-xs">sign-up → active</p>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <p className="font-display text-2xl font-bold">{pct(mm.returning, mm.active)}%</p>
            <p className="text-xs">active → came back</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="mt-3 w-full rounded-xl"
          onClick={async () => {
            const { error } = await supabase
              .from("projects")
              .update({ checklist: { ...check, metrics: mm } })
              .eq("id", p.id);
            if (error) {
              toast.error(workspaceWriteError(error));
              return;
            }
            refresh("project");
            toast.success("Numbers saved");
          }}
        >
          Save numbers
        </Button>
      </Card>
      {items.length === 0 ? (
        <Card className="text-center">
          <h2 className="text-xl font-bold">Plan for the next 100</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft channels to investigate, referral requests and onboarding questions from your
            learning. Check fit, access and claims before using them.
          </p>
          <Button size="xl" className="mt-4" disabled={busy} onClick={run}>
            {busy ? "Planning…" : "Create my growth plan"}
          </Button>
        </Card>
      ) : (
        <>
          <Section
            title="Channels to investigate"
            items={items.filter((o) => o.kind === "channel")}
          />
          <Section title="Referral asks" items={items.filter((o) => o.kind === "referral")} copy />
          <Section
            title="Onboarding feedback questions"
            items={items.filter((o) => o.kind === "onboarding")}
          />
          <button
            className="min-h-11 rounded-lg text-sm text-muted-foreground underline lg:col-span-2"
            disabled={busy}
            onClick={run}
          >
            {busy ? "Re-planning…" : "Regenerate plan (replaces drafts)"}
          </button>
        </>
      )}
    </div>
  );
}
