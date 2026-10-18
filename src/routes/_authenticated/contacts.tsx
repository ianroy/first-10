import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Card, Empty, PrivacyNote } from "@/components/AppShell";
import { RequireProject } from "@/components/RequireProject";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PIPELINE, useContacts, useRefresh, type Project } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "People — First Ten" },
      { name: "description", content: "Your warm list and outreach pipeline." },
    ],
  }),
  component: () => <RequireProject>{(p) => <Contacts p={p} />}</RequireProject>,
});

const PROMPTS: Record<number, string[]> = {
  1: ["Classmate", "Family", "Club", "Coworker", "Professor", "Roommate"],
  2: ["Referral", "Online community", "Campus group", "Friend of a friend"],
  3: ["Referral", "Social post", "Campus event", "Online community"],
};

function Contacts({ p }: { p: Project }) {
  const [stage, setStage] = useState(Math.min(p.stage, 3));
  const { data: contacts = [] } = useContacts(p.id);
  const refresh = useRefresh();
  const [f, setF] = useState({ first_name: "", relation: "", why: "" });
  const list = contacts.filter((c) => c.stage === stage);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("contacts").insert({
      ...f,
      first_name: f.first_name.trim().split(" ")[0] ?? f.first_name,
      project_id: p.id,
      stage,
      source: stage === 1 ? "warm" : f.relation.toLowerCase(),
      status: stage === 1 ? "to_contact" : "contacted",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setF({ first_name: "", relation: "", why: "" });
    refresh("contacts");
    toast.success("Added!");
  };

  return (
    <AppShell title="People">
      <div className="flex gap-2">
        {[1, 2, 3].map((s) => (
          <button
            key={s}
            disabled={p.stage < s}
            onClick={() => setStage(s)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40 ${stage === s ? "bg-foreground text-background" : "bg-muted"}`}
          >
            {s === 1 ? "First 10" : s === 2 ? "Next 50" : "Next 100"}
          </button>
        ))}
      </div>
      <PrivacyNote />
      <Card>
        <h2 className="text-lg font-bold">
          {stage === 1 ? "Who do you already know?" : "Add someone you reached out to"}
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">Tap a group to jog your memory.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {(PROMPTS[stage] ?? []).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setF({ ...f, relation: r })}
              className={`rounded-full border px-3 py-1.5 text-sm ${f.relation === r ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}
            >
              {r}
            </button>
          ))}
        </div>
        <form onSubmit={add} className="space-y-2">
          <Input
            required
            placeholder="First name"
            value={f.first_name}
            onChange={(e) => setF({ ...f, first_name: e.target.value })}
            className="h-12 rounded-xl text-base"
          />
          <Input
            placeholder="How you know them"
            value={f.relation}
            onChange={(e) => setF({ ...f, relation: e.target.value })}
            className="h-12 rounded-xl text-base"
          />
          <Input
            placeholder="Why might they care?"
            value={f.why}
            onChange={(e) => setF({ ...f, why: e.target.value })}
            className="h-12 rounded-xl text-base"
          />
          <Button size="xl">Add person</Button>
        </form>
      </Card>

      {list.length === 0 ? (
        <Empty
          title="No one here yet"
          body={
            stage === 1
              ? "Aim for 10–15 names. Think of who complains about the problem your app solves."
              : "Add people as you message them, then move them along the pipeline."
          }
        />
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id} className="flex items-start gap-3 rounded-2xl border bg-card p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground">
                {c.first_name[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {c.first_name}{" "}
                  <span className="text-sm font-normal text-muted-foreground">· {c.relation}</span>
                </p>
                {c.why && <p className="text-sm text-muted-foreground">{c.why}</p>}
                {stage > 1 ? (
                  <select
                    value={c.status}
                    onChange={async (e) => {
                      await supabase
                        .from("contacts")
                        .update({ status: e.target.value })
                        .eq("id", c.id);
                      refresh("contacts");
                    }}
                    className="mt-2 rounded-lg border bg-background px-2 py-1.5 text-sm"
                  >
                    {PIPELINE.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  c.status === "interviewed" && (
                    <p className="mt-1 text-xs font-semibold text-success">✓ Interviewed</p>
                  )
                )}
              </div>
              <button
                aria-label="Remove"
                className="p-1 text-muted-foreground"
                onClick={async () => {
                  await supabase.from("contacts").delete().eq("id", c.id);
                  refresh("contacts");
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
