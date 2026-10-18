import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProject, useRefresh, type Project } from "@/lib/data";
import { createOwnedProject } from "@/lib/project-lifecycle";
import { useProjectSelection } from "@/lib/project-selection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BrandLogo } from "@/components/BrandLogo";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/setup")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } =>
    search["new"] === true || search["new"] === "true" ? { new: true } : {},
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
  const selection = useProjectSelection();
  const search = useSearch({ strict: false }) as { new?: boolean };
  const query = useProject();
  const newIdea = search.new === true;
  const project = newIdea ? null : (query.data ?? null);
  const pinDefault =
    !newIdea && !!project && !!selection && !selection.selectedProjectId && !query.error;
  useEffect(() => {
    if (pinDefault && project) selection?.selectProject(project.id);
  }, [pinDefault, project, selection]);
  return (
    <SetupForm
      key={`${selection?.userId}:${selection?.selectedProjectId}:${newIdea ? "new" : (project?.id ?? "first")}`}
      project={project}
      newIdea={newIdea}
      loading={!newIdea && (query.isLoading || pinDefault)}
      error={!newIdea ? query.error : null}
    />
  );
}

function SetupForm({
  project,
  newIdea,
  loading,
  error,
}: {
  project: Project | null;
  newIdea: boolean;
  loading: boolean;
  error: Error | null;
}) {
  const selection = useProjectSelection();
  const refresh = useRefresh();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: project?.name ?? "",
    description: project?.description ?? "",
    audience: project?.audience ?? "",
    problem: project?.problem ?? "",
    link: project?.link ?? "",
  });
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const creation = useRef<{ projectId: string; requestId: string; payload: string } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 lg:py-14">
      <Link to="/" aria-label="First Ten home">
        <BrandLogo className="mb-10 h-9 w-auto" />
      </Link>
      <div className="grid items-start gap-10 lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {newIdea
              ? "A separate idea, a fresh ladder"
              : project
                ? "Your project"
                : "Start with your current idea"}
          </p>
          <h1 className="mt-1 text-3xl font-bold">Tell us about your app</h1>
          <p className="mt-2 text-muted-foreground">
            Plain words are perfect. Treat the audience and problem as starting assumptions you can
            revise.
          </p>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            What have you built? Who has experienced the problem? A focused starting point helps you
            choose a useful first conversation. Creating a new idea keeps your other projects and
            their saved work separate.
          </p>
          <p className="mt-4">
            <Link
              to="/account"
              className="inline-flex min-h-11 items-center text-sm font-semibold underline"
            >
              Back to my ideas
            </Link>
          </p>
        </div>
        {error ? (
          <div role="alert" className="rounded-2xl border bg-card p-6">
            <h2 className="font-bold">This project could not be opened</h2>
            <p className="mt-2 text-sm">
              Your saved work has not been changed. Choose an available idea from your account, or
              try again.
            </p>
            <Link
              to="/account"
              className="mt-4 inline-flex min-h-11 items-center font-semibold underline"
            >
              Choose an idea
            </Link>
          </div>
        ) : (
          <form
            className="space-y-5 rounded-3xl border bg-card p-6 shadow-soft lg:p-8"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selection || loading || busy) return;
              setBusy(true);
              try {
                const values = {
                  ...form,
                  name: form.name.trim(),
                  description: form.description.trim(),
                  audience: form.audience.trim(),
                  problem: form.problem.trim(),
                  link: form.link.trim(),
                };
                if (!values.name || !values.description || !values.audience || !values.problem)
                  throw new Error("Describe the name, audience, problem and what your app does.");
                const token = selection.scopeToken;
                const stillHere = () => mounted.current && selection.isCurrentScope(token);
                let savedId: string;
                if (project && !newIdea) {
                  const verified = await supabase.auth.getUser();
                  if (!stillHere()) return;
                  if (verified.error || verified.data.user?.id !== selection.userId)
                    throw new Error("Sign in again before saving this idea.");
                  const result = await supabase
                    .from("projects")
                    .update(values)
                    .eq("id", project.id)
                    .eq("user_id", selection.userId)
                    .is("archived_at", null)
                    .select("id")
                    .single();
                  if (!stillHere()) return;
                  if (result.error || !result.data?.id)
                    throw new Error(
                      "The save could not be confirmed. Your text is still here; check Account & saved work if this idea was archived.",
                    );
                  savedId = result.data.id;
                } else {
                  const payload = JSON.stringify(values);
                  if (!creation.current)
                    creation.current = {
                      projectId: crypto.randomUUID(),
                      requestId: crypto.randomUUID(),
                      payload,
                    };
                  if (creation.current.payload !== payload)
                    throw new Error(
                      "A previous create may have saved. Retry its original text or open Account & saved work before starting another idea.",
                    );
                  const session = await supabase.auth.getSession();
                  if (!stillHere()) return;
                  if (session.error || !session.data.session?.access_token)
                    throw new Error("Sign in again before creating this idea.");
                  const result = await createOwnedProject(
                    supabase,
                    {
                      ...values,
                      projectId: creation.current.projectId,
                      requestId: creation.current.requestId,
                    },
                    {
                      accessToken: session.data.session.access_token,
                      expectedUserId: selection.userId,
                      isCurrent: stillHere,
                    },
                  );
                  if (!stillHere()) return;
                  if (!result.ok)
                    throw new Error(
                      result.code === "UNAVAILABLE"
                        ? "Creation could not be confirmed. Retry with the same text; the same request will not create a duplicate."
                        : "This idea could not be created. Check Account & saved work before retrying.",
                    );
                  savedId = result.data.id;
                }
                // An acknowledged create can be an old retry. Re-authorize the
                // actual latest owner row before selecting/navigating to it.
                const latest = await supabase
                  .from("projects")
                  .select("id,archived_at")
                  .eq("id", savedId)
                  .eq("user_id", selection.userId)
                  .maybeSingle();
                if (!stillHere()) return;
                if (latest.error || !latest.data || latest.data.archived_at)
                  throw new Error(
                    "The idea was saved but cannot be opened now. Review its latest state in Account & saved work.",
                  );
                selection.selectProject(savedId);
                refresh("project", "projects");
                await navigate({ to: "/dashboard" });
              } catch (failure) {
                if (!mounted.current) return;
                toast.error(
                  failure instanceof Error
                    ? failure.message
                    : "Your idea could not be saved. Please try again.",
                );
              } finally {
                if (mounted.current) setBusy(false);
              }
            }}
          >
            {loading && <p role="status">Opening your project…</p>}
            <fieldset disabled={busy || loading || !selection} className="space-y-5">
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
                {busy
                  ? "Saving…"
                  : project && !newIdea
                    ? "Save changes"
                    : newIdea
                      ? "Create new idea"
                      : "Start my ladder"}
              </Button>
            </fieldset>
          </form>
        )}
      </div>
    </div>
  );
}
