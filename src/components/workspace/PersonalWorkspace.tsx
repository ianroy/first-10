import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Archive,
  Compass,
  FolderOpen,
  LockKeyhole,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { AppShell, Card } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useProject, useProjects, type Project } from "@/lib/data";
import { CurrentProjectContext } from "@/lib/current-project";
import { useProjectSelection } from "@/lib/project-selection";
import { setOwnedProjectArchived } from "@/lib/project-lifecycle";
import { resumeDestination, savedTime, type ResumeDestination } from "./saved-activity";
import { useSavedActivity } from "./useSavedActivity";

type LifecycleConfirmation = { idea: Project; requestId: string };
type Destination = ResumeDestination["to"] | "/setup" | "/account" | "/dashboard";
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-card px-4 text-sm font-semibold disabled:opacity-50";

export function PersonalWorkspace() {
  const selection = useProjectSelection();
  return <WorkspaceContent key={selection?.userId ?? "unverified"} />;
}

function WorkspaceContent() {
  const selection = useProjectSelection();
  const projects = useProjects();
  const current = useProject();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"active" | "archived" | "all">("active");
  const [confirmation, setConfirmation] = useState<LifecycleConfirmation | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const currentProject =
    !current.error && current.data?.user_id === selection?.userId ? (current.data ?? null) : null;
  const owned = projects.data?.filter((idea) => idea.user_id === selection?.userId) ?? [];
  const active = owned.filter((idea) => !idea.archived_at);
  const archived = owned.filter((idea) => !!idea.archived_at);
  const shown = filter === "active" ? active : filter === "archived" ? archived : owned;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    busyRef.current = false;
    setBusy(false);
    setConfirmation(null);
    setNotice("");
  }, [selection?.scopeToken]);
  useEffect(() => {
    if (currentProject && selection && !selection.selectedProjectId)
      selection.selectProject(currentProject.id);
  }, [currentProject, selection]);

  async function open(idea: Project, to: Destination) {
    if (!selection || busyRef.current || idea.user_id !== selection.userId) return;
    const token = selection.scopeToken;
    const isCurrent = () => mounted.current && selection.isCurrentScope(token);
    busyRef.current = true;
    setBusy(true);
    setNotice("");
    try {
      // A card is a cached suggestion, never authority to select or mutate a project.
      const verified = await supabase.auth.getUser();
      if (!isCurrent()) return;
      if (verified.error || verified.data.user?.id !== selection.userId) {
        setNotice("Sign in again before opening saved work.");
        return;
      }
      const latest = await supabase
        .from("projects")
        .select("id,user_id,archived_at")
        .eq("id", idea.id)
        .eq("user_id", selection.userId)
        .maybeSingle();
      if (!isCurrent()) return;
      if (
        latest.error ||
        !latest.data ||
        latest.data.id !== idea.id ||
        latest.data.user_id !== selection.userId
      ) {
        setNotice("This idea is unavailable. Refresh your list or use Account recovery.");
        return;
      }
      if (latest.data.archived_at && to !== "/account") {
        setNotice(
          "This idea was archived. Refresh the list, then restore or export it in Account.",
        );
        return;
      }
      selection.selectProject(idea.id);
      await navigate(to === "/setup" ? { to, search: {} } : { to });
    } catch {
      if (isCurrent())
        setNotice(
          "This idea could not be opened. Check your connection and try again; your saved work has not changed.",
        );
    } finally {
      if (isCurrent()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function changeLifecycle() {
    if (!selection || !confirmation || busyRef.current) return;
    const token = selection.scopeToken;
    const isCurrent = () => mounted.current && selection.isCurrentScope(token);
    const { idea, requestId } = confirmation;
    if (idea.user_id !== selection.userId) return;
    busyRef.current = true;
    setBusy(true);
    setNotice("");
    try {
      const result = await setOwnedProjectArchived(supabase, {
        projectId: idea.id,
        requestId,
        archived: !idea.archived_at,
        expectedRevision: idea.lifecycle_revision,
      });
      if (!isCurrent()) return;
      // An idempotent acknowledgement can describe an older state. Read the latest owner rows.
      const latest = await projects.refetch({ throwOnError: true });
      if (!isCurrent()) return;
      await current.refetch();
      if (!isCurrent()) return;
      if (result.ok) {
        const actual = latest.data?.find(
          (row) => row.id === idea.id && row.user_id === selection.userId,
        );
        setNotice(
          actual
            ? `${actual.name} is ${actual.archived_at ? "archived" : "active"}. Saved work is retained.`
            : "This idea is unavailable. Use Account recovery before another change.",
        );
        setConfirmation(null);
      } else if (result.code === "UNAVAILABLE") {
        setNotice(
          "The change could not be confirmed. Review the refreshed list and retry this same request. No work has been deleted.",
        );
      } else {
        setNotice(
          result.code === "REVISION_CONFLICT"
            ? "This idea changed in another session. Review the latest state and choose the action again."
            : "This change is unavailable. Check your sign-in and refreshed list.",
        );
        setConfirmation(null);
      }
    } catch {
      if (isCurrent())
        setNotice(
          "The latest saved state could not be refreshed. Retry before making another change.",
        );
    } finally {
      if (isCurrent()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <CurrentProjectContext.Provider value={currentProject}>
      <AppShell title="My workspace">
        <section className="relative overflow-hidden rounded-3xl border bg-secondary/45 p-6 lg:p-8">
          <div
            className="absolute -right-8 -top-12 hidden size-64 rounded-full border-[36px] border-primary/5 lg:block"
            aria-hidden="true"
          />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">
                Your ideas. Your next move.
              </p>
              <h2 className="mt-3 text-3xl font-bold lg:text-4xl">
                Come back with a clearer question.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Pick up saved work or give a different idea its own space. Each project keeps its
                people, scripts, decisions and experiments separate.
              </p>
            </div>
            <Link
              to="/setup"
              search={{ new: true }}
              className={`${button} border-primary bg-primary text-primary-foreground`}
            >
              <Plus className="size-4" aria-hidden="true" /> New idea
            </Link>
          </div>
        </section>
        {current.error && (
          <div role="alert" className="rounded-2xl border bg-card p-5">
            <p className="font-semibold">Your selected idea is unavailable or archived.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              We have kept your selection. Choose an active idea below, restore an archived one, or
              open Account recovery.
            </p>
            <Link
              to="/account"
              className="mt-3 inline-flex min-h-11 items-center font-semibold underline"
            >
              Account recovery & exports
            </Link>
          </div>
        )}
        {notice && (
          <p
            role="status"
            aria-label="Workspace result"
            className="rounded-xl border bg-card p-4 text-sm"
          >
            {notice}
          </p>
        )}
        {confirmation && (
          <section
            aria-label="Confirm workspace lifecycle change"
            className="rounded-2xl border border-primary bg-card p-5"
          >
            <h3 className="text-lg font-bold">
              {confirmation.idea.archived_at ? "Restore" : "Archive"} {confirmation.idea.name}?
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {confirmation.idea.archived_at
                ? "Return this idea to the active list. Saved work stays intact. Previously withdrawn permissions do not become granted again."
                : "Keep saved work and stop new edits, AI generations and access grants. Owner review, export, withdrawal and restore remain available. An already authorized request may finish transiently, but cannot save new content into the archived idea."}
            </p>
            <div className="mt-4 flex gap-3">
              <button
                className={`${button} bg-primary text-primary-foreground`}
                disabled={busy}
                onClick={() => void changeLifecycle()}
              >
                {busy
                  ? "Checking saved state…"
                  : confirmation.idea.archived_at
                    ? "Confirm restore"
                    : "Confirm archive"}
              </button>
              <button className={button} disabled={busy} onClick={() => setConfirmation(null)}>
                Cancel
              </button>
            </div>
          </section>
        )}
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section aria-labelledby="workspace-ideas">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="workspace-ideas" className="text-xl font-bold">
                My private ideas
              </h2>
              <button
                disabled={busy || projects.isFetching}
                className="min-h-11 text-sm font-semibold underline underline-offset-4"
                onClick={() => void projects.refetch()}
              >
                Refresh ideas
              </button>
            </div>
            {projects.isLoading ? (
              <p role="status" className="py-8">
                Opening your ideas…
              </p>
            ) : projects.error ? (
              <div role="alert" className="mt-4 rounded-2xl border bg-card p-6">
                <h3 className="font-semibold">Your ideas could not be loaded.</h3>
                <p className="mt-2 text-sm">
                  Your saved work has not been changed. Refresh the list or use Account recovery.
                </p>
                <Link to="/account" className="mt-4 inline-flex min-h-11 items-center underline">
                  Account recovery
                </Link>
              </div>
            ) : (
              <>
                <div role="group" aria-label="Filter ideas" className="my-4 flex flex-wrap gap-2">
                  {(
                    [
                      ["active", `Active (${active.length})`],
                      ["archived", `Archived (${archived.length})`],
                      ["all", `All (${owned.length})`],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                      className={`${button} ${filter === value ? "border-primary bg-secondary" : ""}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {!shown.length ? (
                  <div className="rounded-2xl border-2 border-dashed bg-card/50 p-8">
                    <FolderOpen className="mb-4 size-8 text-primary" aria-hidden="true" />
                    <h3 className="text-lg font-bold">
                      {!owned.length
                        ? "Your first idea starts here."
                        : filter === "archived"
                          ? "No archived ideas."
                          : "No active ideas right now."}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {!owned.length
                        ? "Start with a problem or solution idea. You can revise it as you learn."
                        : filter === "archived"
                          ? "Archive keeps a project’s work for later; it does not delete it."
                          : "Restore an archived idea, or start a separate one."}
                    </p>
                    {!!archived.length && filter === "active" && (
                      <button className={`${button} mt-4`} onClick={() => setFilter("archived")}>
                        Review archived ideas
                      </button>
                    )}
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {shown.map((idea) => (
                      <WorkspaceIdea
                        key={`${idea.user_id}:${idea.id}`}
                        idea={idea}
                        selected={selection?.selectedProjectId === idea.id}
                        busy={busy || !selection}
                        onOpen={open}
                        onLifecycle={(item) => {
                          setNotice("");
                          setConfirmation({ idea: item, requestId: crypto.randomUUID() });
                        }}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
          <aside className="space-y-4">
            <Card>
              <LockKeyhole className="mb-3 size-6 text-primary" aria-hidden="true" />
              <h2 className="font-bold">Private by default</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                You own these ideas. A teacher or class membership does not grant access to your
                private interviews. Only deliberately reviewed submissions are shared.
              </p>
              <Link
                to="/account"
                className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline"
              >
                Account & saved-work exports <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </Card>
            <Card>
              <ShieldCheck className="mb-3 size-6 text-primary" aria-hidden="true" />
              <h2 className="font-bold">Return on another device</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Sign in to open saved work. This browser remembers your selected idea; choose it
                again on a different device. Save local edits before leaving an activity.
              </p>
            </Card>
            <Card>
              <h2 className="font-bold">Shared project spaces</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Shared-project discovery is still in development. This list contains only your owned
                ideas. Classes and account-free team spaces have separate access.
              </p>
              <Link
                to="/classes"
                className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline"
              >
                Classes & hackathons <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </Card>
          </aside>
        </div>
      </AppShell>
    </CurrentProjectContext.Provider>
  );
}

function WorkspaceIdea({
  idea,
  selected,
  busy,
  onOpen,
  onLifecycle,
}: {
  idea: Project;
  selected: boolean;
  busy: boolean;
  onOpen: (idea: Project, to: Destination) => Promise<void>;
  onLifecycle: (idea: Project) => void;
}) {
  const activity = useSavedActivity(idea.user_id, idea.id);
  const resume = resumeDestination(idea, activity.data?.known ?? []);
  const incomplete = activity.isError || activity.data?.incomplete;
  const unknownDiscovery = incomplete && !resume.savedAt && resume.to === "/discovery";
  return (
    <li
      className={`overflow-hidden rounded-2xl border bg-card shadow-soft ${selected ? "border-primary" : ""}`}
    >
      <div className="p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="min-w-0 break-words text-xl font-bold">{idea.name}</h3>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-secondary px-3 py-1">Owner · Private</span>
            <span className="rounded-full bg-muted px-3 py-1">
              {idea.archived_at ? "Archived" : "Active"}
            </span>
            {selected && (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">Selected</span>
            )}
          </div>
        </div>
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {idea.description}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Saved ladder stage</dt>
            <dd className="mt-1 font-semibold">
              Stage {idea.stage} ·{" "}
              {idea.stage === 1
                ? "First 10"
                : idea.stage === 2
                  ? "Next 50"
                  : idea.stage === 3
                    ? "Next 100"
                    : "Stage label unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Idea record updated</dt>
            <dd className="mt-1">{savedTime(idea.updated_at)}</dd>
          </div>
        </dl>
        <div className="mt-5 rounded-xl bg-background p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Known saved work
          </p>
          {activity.isLoading ? (
            <p role="status" className="mt-2 text-sm">
              Checking saved activity…
            </p>
          ) : (
            <>
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
                <Compass className="size-4 text-primary" aria-hidden="true" />
                {unknownDiscovery ? "Open discovery" : resume.label}
              </p>
              {resume.savedAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Saved {savedTime(resume.savedAt)} · revision {resume.revision}
                </p>
              )}
              {incomplete && (
                <p role="status" className="mt-2 text-xs text-muted-foreground">
                  Some saved activity could not be checked. This suggestion may be incomplete.
                </p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Checks saved Discovery, incomplete interview drafts and Marketing Lab only. This is
                not a last-visit record or a measure of customer validation.
              </p>
            </>
          )}
        </div>
        {idea.archived_at && (
          <p className="mt-4 text-sm text-muted-foreground">
            Saved work is retained. Restore to edit, or review and export it in Account.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {!idea.archived_at ? (
            <>
              <button
                disabled={busy || activity.isLoading}
                className={`${button} border-primary bg-primary text-primary-foreground`}
                aria-label={`Resume ${idea.name}`}
                onClick={() => void onOpen(idea, resume.to)}
              >
                {resume.savedAt || resume.to === "/interview"
                  ? "Resume saved work"
                  : unknownDiscovery
                    ? "Open discovery"
                    : "Start discovery"}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </button>
              <button
                disabled={busy}
                className={button}
                aria-label={`Rename or edit ${idea.name}`}
                onClick={() => void onOpen(idea, "/setup")}
              >
                Rename / edit idea
              </button>
              <button
                disabled={busy}
                className={button}
                aria-label={`Open ladder for ${idea.name}`}
                onClick={() => void onOpen(idea, "/dashboard")}
              >
                Open ladder
              </button>
            </>
          ) : (
            <button
              disabled={busy}
              className={button}
              aria-label={`Review or export ${idea.name}`}
              onClick={() => void onOpen(idea, "/account")}
            >
              Review / export
            </button>
          )}
          <button
            disabled={busy}
            className={button}
            aria-label={`${idea.archived_at ? "Restore" : "Archive"} ${idea.name}`}
            onClick={() => onLifecycle(idea)}
          >
            <Archive className="size-4" aria-hidden="true" />
            {idea.archived_at ? "Restore" : "Archive"}
          </button>
        </div>
      </div>
    </li>
  );
}
