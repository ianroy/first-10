import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProject, useRefresh } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BrandLogo } from "@/components/BrandLogo";
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
    <div className="mx-auto max-w-5xl px-6 py-8 lg:py-14">
      <Link to="/" aria-label="First Ten home">
        <BrandLogo className="mb-10 h-9 w-auto" />
      </Link>
      <div className="grid items-start gap-10 lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {project ? "Your project" : "Start with your current idea"}
          </p>
          <h1 className="mt-1 text-3xl font-bold">Tell us about your app</h1>
          <p className="mt-2 text-muted-foreground">
            Plain words are perfect. Treat the audience and problem as starting assumptions you can
            revise.
          </p>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            What have you built? Who has experienced the problem? A focused starting point helps you
            choose a useful first conversation.
          </p>
        </div>
        <form
          className="space-y-5 rounded-3xl border bg-card p-6 shadow-soft lg:p-8"
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
              <Label htmlFor={`project-${f.k}`}>{f.l}</Label>
              {"area" in f ? (
                <Textarea
                  id={`project-${f.k}`}
                  required
                  value={form[f.k]}
                  placeholder={f.p}
                  onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                  className="rounded-xl text-base"
                />
              ) : (
                <Input
                  id={`project-${f.k}`}
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
    </div>
  );
}
