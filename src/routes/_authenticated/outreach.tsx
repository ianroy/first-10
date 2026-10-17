import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateAI } from "@/lib/ai.functions";
import { AppShell, Card, DraftBadge, Empty } from "@/components/AppShell";
import { RequireProject } from "@/components/RequireProject";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PIPELINE, useContacts, useOutreach, useRefresh, type Outreach, type Project } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/outreach")({
  head: () => ({ meta: [{ title: "Outreach — First Ten" }, { name: "description", content: "Outreach plans, message drafts, pipeline and metrics." }] }),
  component: () => <RequireProject>{(p) => <OutreachPage p={p} />}</RequireProject>,
});

function OutreachPage({ p }: { p: Project }) {
  const [tab, setTab] = useState(p.stage >= 3 ? 3 : 2);
  if (p.stage < 2)
    return (
      <AppShell title="Outreach">
        <Empty title="Unlocks after your First 10" body="Talk to people you know first. What they tell you becomes the words you use to reach the next 50."
          action={<Button asChild className="rounded-xl"><Link to="/learnings"><Lock /> See the checklist</Link></Button>} />
      </AppShell>
    );
  return (
    <AppShell title="Outreach">
      <div className="flex gap-2">
        {[2, 3].map((s) => (
          <button key={s} disabled={p.stage < s} onClick={() => setTab(s)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40 ${tab === s ? "bg-foreground text-background" : "bg-muted"}`}>
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
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await gen({ data: { kind, projectId: p.id } });
      const stage = kind === "stage2" ? 2 : 3;
      await supabase.from("outreach").delete().eq("project_id", p.id).eq("stage", stage);
      const rows: { kind: string; title: string; body: string }[] =
        kind === "stage2"
          ? [...r.channels.map((c: any) => ({ kind: "channel", ...c })), ...r.drafts.map((c: any) => ({ kind: "draft", ...c }))]
          : [
              ...r.channels.map((c: any) => ({ kind: "channel", ...c })),
              ...r.referral_asks.map((b: string, i: number) => ({ kind: "referral", title: `Referral ask ${i + 1}`, body: b })),
              ...r.onboarding_questions.map((b: string) => ({ kind: "onboarding", title: "", body: b })),
            ];
      await supabase.from("outreach").insert(rows.map((x) => ({ ...x, project_id: p.id, stage })));
      if (kind === "stage2") await supabase.from("projects").update({ survey: r.survey }).eq("id", p.id);
      refresh("outreach", "project");
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  return { busy, run };
}

function DraftItem({ o, copy }: { o: Outreach; copy?: boolean | undefined }) {
  const refresh = useRefresh();
  const [body, setBody] = useState(o.body);
  return (
    <div className="rounded-xl bg-muted p-3">
      {o.title && <p className="mb-1 text-sm font-semibold">{o.title}</p>}
      <Textarea value={body} rows={copy ? 5 : 3} onChange={(e) => setBody(e.target.value)} className="rounded-lg bg-background text-sm"
        onBlur={async () => { if (body !== o.body) { await supabase.from("outreach").update({ body }).eq("id", o.id); refresh("outreach"); } }} />
      {copy && (
        <Button variant="outline" size="sm" className="mt-2 rounded-lg" onClick={() => { navigator.clipboard.writeText(body); toast.success("Copied"); }}>
          <Copy /> Copy
        </Button>
      )}
    </div>
  );
}

function Section({ title, items, copy }: { title: string; items: Outreach[]; copy?: boolean | undefined }) {
  if (!items.length) return null;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{title}</h2><DraftBadge /></div>
      <div className="space-y-2">{items.map((o) => <DraftItem key={o.id} o={o} copy={copy} />)}</div>
    </Card>
  );
}

function Stage2({ p }: { p: Project }) {
  const { data: out = [] } = useOutreach(p.id);
  const { data: contacts = [] } = useContacts(p.id);
  const refresh = useRefresh();
  const { busy, run } = useGenerate(p, "stage2");
  const items = out.filter((o) => o.stage === 2).reverse();
  const survey = (p.survey as string[]) ?? [];
  const [sv, setSv] = useState<string | null>(null);
  const pipe = contacts.filter((c) => c.stage === 2);

  return (
    <>
      {items.length === 0 ? (
        <Card className="text-center">
          <h2 className="text-xl font-bold">Build your plan for the next 50</h2>
          <p className="mt-1 text-sm text-muted-foreground">Uses your referrals and accepted learnings to suggest where to go and what to say.</p>
          <Button size="xl" className="mt-4" disabled={busy} onClick={run}>{busy ? "Planning…" : "Create my outreach plan"}</Button>
        </Card>
      ) : (
        <>
          <Section title="Where to find people" items={items.filter((o) => o.kind === "channel")} />
          <Section title="Message drafts" items={items.filter((o) => o.kind === "draft")} copy />
        </>
      )}
      {survey.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">Feedback survey</h2><DraftBadge /></div>
          <p className="mb-2 text-sm text-muted-foreground">Send to people who tried it. One question per line.</p>
          <Textarea rows={survey.length + 2} value={sv ?? survey.join("\n")} onChange={(e) => setSv(e.target.value)} className="rounded-xl text-sm" />
          <div className="mt-2 flex gap-2">
            {sv !== null && <Button className="flex-1 rounded-xl" onClick={async () => { await supabase.from("projects").update({ survey: sv.split("\n").filter(Boolean) }).eq("id", p.id); setSv(null); refresh("project"); toast.success("Saved"); }}>Save</Button>}
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { navigator.clipboard.writeText(sv ?? survey.join("\n")); toast.success("Copied"); }}><Copy /> Copy</Button>
          </div>
        </Card>
      )}
      {items.length > 0 && (
        <button className="w-full text-xs text-muted-foreground underline" disabled={busy} onClick={run}>{busy ? "Re-planning…" : "Regenerate plan (replaces drafts)"}</button>
      )}
      <Card>
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Pipeline</h2><Link to="/contacts" className="text-sm font-semibold text-primary">+ Add people</Link></div>
        {pipe.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">As you message people, add them under People → Next 50 and move them along here.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {PIPELINE.map((s, si) => {
              const list = pipe.filter((c) => c.status === s.key);
              return (
                <div key={s.key}>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{s.label} · {list.length}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {list.map((c) => (
                      <button key={c.id} disabled={si === PIPELINE.length - 1}
                        onClick={async () => { await supabase.from("contacts").update({ status: PIPELINE[si + 1]!.key }).eq("id", c.id); refresh("contacts"); }}
                        className="rounded-full border bg-background px-3 py-1.5 text-sm">
                        {c.first_name} {si < PIPELINE.length - 1 && "→"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">Tap a name to move them to the next step.</p>
          </div>
        )}
      </Card>
    </>
  );
}

function Stage3({ p }: { p: Project }) {
  const { data: out = [] } = useOutreach(p.id);
  const refresh = useRefresh();
  const { busy, run } = useGenerate(p, "stage3");
  const items = out.filter((o) => o.stage === 3).reverse();
  const check = (p.checklist ?? {}) as Record<string, unknown>;
  const m = (check["metrics"] ?? { signups: 0, active: 0, returning: 0 }) as { signups: number; active: number; returning: number };
  const [mm, setMm] = useState(m);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <>
      <Card>
        <h2 className="text-lg font-bold">Your numbers</h2>
        <p className="mb-3 text-sm text-muted-foreground">Update weekly. Rough counts are fine.</p>
        <div className="grid grid-cols-3 gap-2">
          {([["signups", "Sign-ups"], ["active", "Active"], ["returning", "Came back"]] as const).map(([k, l]) => (
            <label key={k} className="text-xs text-muted-foreground">{l}
              <Input type="number" min={0} inputMode="numeric" value={mm[k] ?? 0} onChange={(e) => setMm({ ...mm, [k]: Number(e.target.value) })} className="mt-1 h-12 rounded-xl text-center text-lg font-bold text-foreground" />
            </label>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-secondary p-3"><p className="font-display text-2xl font-bold">{pct(mm.active, mm.signups)}%</p><p className="text-xs">sign-up → active</p></div>
          <div className="rounded-xl bg-secondary p-3"><p className="font-display text-2xl font-bold">{pct(mm.returning, mm.active)}%</p><p className="text-xs">active → came back</p></div>
        </div>
        <Button variant="outline" className="mt-3 w-full rounded-xl" onClick={async () => { await supabase.from("projects").update({ checklist: { ...check, metrics: mm } }).eq("id", p.id); refresh("project"); toast.success("Numbers saved"); }}>Save numbers</Button>
      </Card>
      {items.length === 0 ? (
        <Card className="text-center">
          <h2 className="text-xl font-bold">Plan for the next 100</h2>
          <p className="mt-1 text-sm text-muted-foreground">Scalable channels, referral asks, and onboarding questions — built from everything you’ve learned.</p>
          <Button size="xl" className="mt-4" disabled={busy} onClick={run}>{busy ? "Planning…" : "Create my growth plan"}</Button>
        </Card>
      ) : (
        <>
          <Section title="Scalable channels" items={items.filter((o) => o.kind === "channel")} />
          <Section title="Referral asks" items={items.filter((o) => o.kind === "referral")} copy />
          <Section title="Onboarding feedback questions" items={items.filter((o) => o.kind === "onboarding")} />
          <button className="w-full text-xs text-muted-foreground underline" disabled={busy} onClick={run}>{busy ? "Re-planning…" : "Regenerate plan"}</button>
        </>
      )}
    </>
  );
}
