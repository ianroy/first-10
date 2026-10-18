import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateAI } from "@/lib/ai.functions";
import { AppShell, Card, DraftBadge, Empty } from "@/components/AppShell";
import { RequireProject } from "@/components/RequireProject";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Json } from "@/integrations/supabase/types";
import { isReady, itemDone, unlockChecklist, type ChecklistItem } from "@/lib/stages";
import {
  stageProgress,
  useContacts,
  useExperiments,
  useInterviews,
  useLearnings,
  useRefresh,
  type Learning,
  type Project,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/learnings")({
  head: () => ({
    meta: [
      { title: "Learnings — First Ten" },
      {
        name: "description",
        content: "What your conversations taught you, and experiments you ran.",
      },
    ],
  }),
  component: () => <RequireProject>{(p) => <Learnings p={p} />}</RequireProject>,
});

type Synth = {
  problems: string[];
  objections: string[];
  best_fit: string[];
  quotes: string[];
  changes: { title: string; body: string }[];
};
const SECTIONS: [keyof Omit<Synth, "changes">, string][] = [
  ["problems", "Top problems"],
  ["objections", "Objections & hesitations"],
  ["best_fit", "Best-fit users"],
  ["quotes", "In their own words"],
];

function Learnings({ p }: { p: Project }) {
  const { data: learnings = [] } = useLearnings(p.id);
  const { data: interviews = [] } = useInterviews(p.id);
  const { data: contacts = [] } = useContacts(p.id);
  const { data: experiments = [] } = useExperiments(p.id);
  const done = interviews.filter((i) => i.completed).length;
  const synth = learnings.find((l) => l.kind === "synthesis" && l.stage === 1);
  const prog = stageProgress(contacts, interviews);
  const check = (p.checklist ?? {}) as Record<string, unknown>;
  const checklist = unlockChecklist({
    stage: p.stage,
    completedInterviews: done,
    synthesisAccepted: !!synth?.accepted,
    experiments,
    stage2Reached: prog.s2,
    surveyCount: ((p.survey as string[]) ?? []).length,
  });

  return (
    <AppShell title="Learnings">
      {done < 5 && !synth ? (
        <Empty
          title={`${done}/5 interviews done`}
          body="After 5 conversations, AI will help you spot patterns: top problems, objections, and who loves this most."
        />
      ) : (
        <Synthesis p={p} synth={synth} />
      )}

      {checklist && <Checklist p={p} check={check} {...checklist} />}

      <Experiments p={p} />
    </AppShell>
  );
}

function Synthesis({ p, synth }: { p: Project; synth: Learning | undefined }) {
  const gen = useServerFn(generateAI);
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState<Synth | null>(null);
  useEffect(() => {
    if (synth) setD(synth.data as Synth);
  }, [synth]);

  const run = async () => {
    setBusy(true);
    try {
      const r = (await gen({ data: { kind: "synthesis", projectId: p.id } })) as Synth;
      if (synth)
        await supabase.from("learnings").update({ data: r, accepted: false }).eq("id", synth.id);
      else
        await supabase.from("learnings").insert({
          project_id: p.id,
          stage: 1,
          kind: "synthesis",
          title: "What I learned from my first conversations",
          data: r,
        });
      refresh("learnings");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };
  const save = async (accepted: boolean) => {
    if (!synth || !d) return;
    const { error } = await supabase
      .from("learnings")
      .update({ data: d, accepted, body: d.problems.slice(0, 2).join(" · ") })
      .eq("id", synth.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh("learnings");
    toast.success(accepted ? "Accepted! These now shape your outreach." : "Saved");
  };

  if (!synth || !d)
    return (
      <Card className="text-center">
        <h2 className="text-xl font-bold">You’ve done 5+ interviews </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Let’s turn your notes into clear patterns.
        </p>
        <Button size="xl" className="mt-4" disabled={busy} onClick={run}>
          {busy ? "Reading your notes…" : "Summarize my interviews"}
        </Button>
      </Card>
    );

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Your summary</h2>
        {synth.accepted ? (
          <span className="rounded-full bg-success px-2.5 py-0.5 text-xs font-semibold text-success-foreground">
            ✓ Accepted
          </span>
        ) : (
          <DraftBadge />
        )}
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        One item per line. Fix anything that doesn’t sound right.
      </p>
      <div className="space-y-4">
        {SECTIONS.map(([k, label]) => (
          <div key={k}>
            <p className="mb-1 text-sm font-semibold">{label}</p>
            <Textarea
              rows={Math.max(3, d[k].length + 1)}
              value={d[k].join("\n")}
              onChange={(e) => setD({ ...d, [k]: e.target.value.split("\n") })}
              className="rounded-xl"
            />
          </div>
        ))}
        <div>
          <p className="mb-1 text-sm font-semibold">3 suggested changes</p>
          <div className="space-y-2">
            {d.changes.map((c, i) => (
              <div key={i} className="rounded-xl bg-muted p-3">
                <Input
                  value={c.title}
                  onChange={(e) =>
                    setD({
                      ...d,
                      changes: d.changes.map((x, j) =>
                        j === i ? { ...x, title: e.target.value } : x,
                      ),
                    })
                  }
                  className="mb-2 rounded-lg bg-background font-semibold"
                />
                <Textarea
                  value={c.body}
                  rows={2}
                  onChange={(e) =>
                    setD({
                      ...d,
                      changes: d.changes.map((x, j) =>
                        j === i ? { ...x, body: e.target.value } : x,
                      ),
                    })
                  }
                  className="rounded-lg bg-background text-sm"
                />
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-xl"
            onClick={() => save(synth.accepted)}
          >
            Save edits
          </Button>
          <Button className="flex-1 rounded-xl" onClick={() => save(true)}>
            Accept
          </Button>
        </div>
        <button
          className="w-full text-xs text-muted-foreground underline"
          disabled={busy}
          onClick={run}
        >
          {busy ? "Re-reading…" : "Regenerate with latest interviews"}
        </button>
      </div>
    </Card>
  );
}

function Checklist({
  p,
  title,
  items,
  check,
  nextStage,
}: {
  p: Project;
  title: string;
  nextStage: number;
  check: Record<string, unknown>;
  items: ChecklistItem[];
}) {
  const refresh = useRefresh();
  const val = (it: ChecklistItem) => itemDone(it, check);
  const ready = isReady(items, check);
  const toggle = async (k: string) => {
    await supabase
      .from("projects")
      .update({ checklist: { ...check, [k]: !check[k] } as Json })
      .eq("id", p.id);
    refresh("project");
  };
  return (
    <Card>
      <h2 className="text-lg font-bold">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it.k}>
            <button
              disabled={it.auto !== undefined}
              onClick={() => toggle(it.k)}
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left disabled:cursor-default"
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${val(it) ? "border-success bg-success text-success-foreground" : ""}`}
              >
                {val(it) ? "✓" : ""}
              </span>
              <span className={val(it) ? "" : "text-muted-foreground"}>{it.l}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button
        size="xl"
        className="mt-3"
        disabled={!ready}
        onClick={async () => {
          await supabase.from("projects").update({ stage: nextStage }).eq("id", p.id);
          refresh("project");
          toast.success(`Stage ${nextStage} unlocked! `);
        }}
      >
        {ready ? `Unlock Stage ${nextStage}` : "Finish the list to unlock"}
      </Button>
    </Card>
  );
}

function Experiments({ p }: { p: Project }) {
  const { data: exps = [] } = useExperiments(p.id);
  const refresh = useRefresh();
  const [f, setF] = useState({ hypothesis: "", change: "", result: "" });
  return (
    <Card>
      <h2 className="text-lg font-bold">Experiments</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Small bets: “If I change X, then Y will happen.”
      </p>
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await supabase
            .from("experiments")
            .insert({ ...f, project_id: p.id, stage: p.stage });
          if (error) {
            toast.error(error.message);
            return;
          }
          setF({ hypothesis: "", change: "", result: "" });
          refresh("experiments");
        }}
      >
        <Input
          required
          placeholder="I think… (hypothesis)"
          value={f.hypothesis}
          onChange={(e) => setF({ ...f, hypothesis: e.target.value })}
          className="h-12 rounded-xl"
        />
        <Input
          placeholder="So I’ll change…"
          value={f.change}
          onChange={(e) => setF({ ...f, change: e.target.value })}
          className="h-12 rounded-xl"
        />
        <Input
          placeholder="What happened (fill in later)"
          value={f.result}
          onChange={(e) => setF({ ...f, result: e.target.value })}
          className="h-12 rounded-xl"
        />
        <Button size="xl" variant="secondary">
          Log experiment
        </Button>
      </form>
      <ul className="mt-4 space-y-2">
        {exps.map((x) => (
          <li key={x.id} className="rounded-xl bg-muted p-3 text-sm">
            <p className="text-[11px] font-semibold uppercase text-primary">Stage {x.stage}</p>
            <p className="font-semibold">{x.hypothesis}</p>
            {x.change && <p>Change: {x.change}</p>}
            <Input
              defaultValue={x.result}
              placeholder="Result…"
              className="mt-2 rounded-lg bg-background"
              onBlur={async (e) => {
                if (e.target.value !== x.result) {
                  await supabase
                    .from("experiments")
                    .update({ result: e.target.value })
                    .eq("id", x.id);
                  refresh("experiments");
                }
              }}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
