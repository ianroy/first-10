import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProject, useRefresh } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({
    meta: [
      { title: "Describe your app — First Ten" },
      { name: "description", content: "Tell First Ten about the app you built." },
    ],
  }),
  component: Setup,
});

const fields = [
  { k: "name", l: "App name", p: "StudyBuddy" },
  {
    k: "description",
    l: "What does it do?",
    p: "Matches classmates into study groups before exams",
    area: true,
  },
  { k: "audience", l: "Who is it for?", p: "First-year students in big lecture classes" },
  {
    k: "problem",
    l: "What problem does it solve?",
    p: "Hard to find people to study with when you don’t know anyone",
    area: true,
  },
  { k: "link", l: "Link (optional)", p: "https://…" },
] as const;

function Setup() {
  const { data: project } = useProject();
  const refresh = useRefresh();
  const navigate = useNavigate();
  const [form, setForm] = useState<{
    name: string;
    description: string;
    audience: string;
    problem: string;
    link: string;
  }>({ name: "", description: "", audience: "", problem: "", link: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (project)
      setForm({
        name: project.name,
        description: project.description,
        audience: project.audience,
        problem: project.problem,
        link: project.link,
      });
  }, [project]);

  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">Step 1 of 1</p>
      <h1 className="mt-1 text-3xl font-bold">Tell us about your app</h1>
      <p className="mt-2 text-muted-foreground">
        Plain words are perfect. You can change this anytime.
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const { error } = project
            ? await supabase.from("projects").update(form).eq("id", project.id)
            : await supabase.from("projects").insert(form);
          setBusy(false);
          if (error) {
            toast.error(error.message);
            return;
          }
          refresh("project");
          navigate({ to: "/dashboard" });
        }}
      >
        {fields.map((f) => (
          <div key={f.k} className="space-y-1.5">
            <Label>{f.l}</Label>
            {"area" in f ? (
              <Textarea
                required
                value={form[f.k]}
                placeholder={f.p}
                onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                className="rounded-xl text-base"
              />
            ) : (
              <Input
                required={f.k !== "link"}
                value={form[f.k]}
                placeholder={f.p}
                onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                className="h-12 rounded-xl text-base"
              />
            )}
          </div>
        ))}
        <Button size="xl" disabled={busy}>
          {project ? "Save changes" : "Start my ladder"}
        </Button>
      </form>
    </div>
  );
}
