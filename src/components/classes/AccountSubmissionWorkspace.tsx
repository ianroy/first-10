import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SavedConsentFields } from "@/components/ConsentFields";
import { associateClassProject } from "@/lib/classes.functions";
import { classMessage, type ClassAssignment, type ClassDetail } from "@/lib/classes";
import { SubmissionPreview, type SubmissionSourceOption } from "./SubmissionPreview";
import type { ConsentScope } from "@/lib/consent";
import { z } from "zod";
const field = "mt-2 block min-h-11 w-full rounded-xl border bg-background p-3";
const button =
  "min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50";
const projectShape = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string(),
  archived_at: z.string().nullable(),
});
type ProjectChoice = z.infer<typeof projectShape>;
export function AccountSubmissionWorkspace(props: {
  userId: string;
  detail: ClassDetail;
  assignments: ClassAssignment[];
  onAssociated: () => void;
  onSubmitted: () => void;
}) {
  return (
    <Workspace
      key={JSON.stringify([props.userId, props.detail.id, props.detail.projectAssociation])}
      {...props}
    />
  );
}
function Workspace({
  userId,
  detail,
  assignments,
  onAssociated,
  onSubmitted,
}: Parameters<typeof AccountSubmissionWorkspace>[0]) {
  const [projects, setProjects] = useState<ProjectChoice[]>([]),
    [projectId, setProjectId] = useState(
      detail.projectAssociation?.active ? detail.projectAssociation.projectId : "",
    );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const alive = useRef(true),
    intent = useRef<{ projectId: string; requestId: string } | null>(null);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const verified = await supabase.auth.getUser();
        if (verified.error || verified.data.user?.id !== userId) throw new Error();
        const result = await supabase
          .from("projects")
          .select("id,user_id,name,archived_at")
          .eq("user_id", userId)
          .is("archived_at", null)
          .order("created_at")
          .order("id")
          .limit(100)
          .abortSignal(controller.signal);
        if (result.error) throw new Error();
        const owned = z.array(projectShape).parse(result.data);
        if (owned.some((p) => p.user_id !== userId || p.archived_at)) throw new Error();
        if (alive.current) {
          setProjects(owned);
          if (projectId && !owned.some((p) => p.id === projectId))
            setMessage(
              "The explicitly associated idea is unavailable. Recover it in Account or deliberately choose another idea.",
            );
        }
      } catch {
        if (alive.current)
          setMessage(
            "Your own ideas could not be verified. Reload this class; no other idea was substituted.",
          );
      }
    })();
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const associated =
    detail.projectAssociation?.active &&
    detail.projectAssociation.projectId === projectId &&
    projects.some((p) => p.id === projectId);
  return (
    <section className="space-y-5 rounded-2xl border bg-card p-6" aria-label="Account student work">
      <h2 className="text-xl font-bold">Your private idea → one reviewed class version</h2>
      <p className="text-sm text-muted-foreground">
        Connecting an idea does not share it. You choose specific saved fields, review a redacted
        preview, and separately submit that version. Teachers never get automatic private-note
        access.
      </p>
      <label className="block font-semibold">
        Choose your own active idea
        <select
          className={field}
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setMessage("");
          }}
        >
          <option value="">Choose an idea explicitly</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "Untitled idea"}
            </option>
          ))}
        </select>
      </label>
      {!projects.length && (
        <p className="text-sm">
          Create or recover an idea in{" "}
          <a className="underline" href="/account">
            Account & saved work
          </a>
          . Class entry does not fabricate project work.
        </p>
      )}
      {!associated && (
        <button
          className={button}
          disabled={busy || !projects.some((p) => p.id === projectId)}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setMessage("");
            if (intent.current?.projectId !== projectId)
              intent.current = { projectId, requestId: crypto.randomUUID() };
            const result = await associateClassProject({
              data: {
                classId: detail.id,
                projectId,
                expectedRevision: detail.projectAssociation?.revision ?? 0,
                requestId: intent.current.requestId,
              },
            });
            if (!alive.current) return;
            setBusy(false);
            if (result.ok) onAssociated();
            else setMessage(classMessage(result.code));
          }}
        >
          Connect this idea to the class
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {associated && (
        <SourceWorkspace
          key={userId + ":" + detail.id + ":" + projectId}
          userId={userId}
          projectId={projectId}
          classId={detail.id}
          assignments={assignments}
          onSubmitted={onSubmitted}
        />
      )}
    </section>
  );
}
function SourceWorkspace({
  userId,
  projectId,
  classId,
  assignments,
  onSubmitted,
}: {
  userId: string;
  projectId: string;
  classId: string;
  assignments: ClassAssignment[];
  onSubmitted: () => void;
}) {
  const [options, setOptions] = useState<SubmissionSourceOption[]>([]),
    [privacy, setPrivacy] = useState<Array<{ label: string; scope: ConsentScope }>>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [generation, setGeneration] = useState(0),
    [assignmentId, setAssignmentId] = useState("");
  const [sourcePage, setSourcePage] = useState(0),
    [hasMoreSources, setHasMoreSources] = useState(false);
  const [openPrivacy, setOpenPrivacy] = useState<string | null>(null);
  const alive = useRef(true),
    run = useRef(0);
  const load = async () => {
    const token = ++run.current;
    setBusy(true);
    setMessage("");
    setOptions([]);
    setPrivacy([]);
    try {
      const verified = await supabase.auth.getUser();
      if (verified.error || verified.data.user?.id !== userId) throw new Error();
      const [p, d, i, l, e] = await Promise.all([
        supabase
          .from("projects")
          .select("*")
          .eq("user_id", userId)
          .eq("id", projectId)
          .is("archived_at", null)
          .single(),
        supabase
          .from("discovery_workspaces")
          .select("*")
          .eq("user_id", userId)
          .eq("project_id", projectId)
          .limit(1),
        supabase
          .from("interviews")
          .select("*")
          .eq("user_id", userId)
          .eq("project_id", projectId)
          .eq("completed", true)
          .order("created_at")
          .order("id")
          .range(sourcePage * 25, sourcePage * 25 + 24),
        supabase
          .from("learnings")
          .select("*")
          .eq("user_id", userId)
          .eq("project_id", projectId)
          .order("created_at")
          .order("id")
          .range(sourcePage * 25, sourcePage * 25 + 24),
        supabase
          .from("experiments")
          .select("*")
          .eq("user_id", userId)
          .eq("project_id", projectId)
          .order("created_at")
          .order("id")
          .range(sourcePage * 25, sourcePage * 25 + 24),
      ]);
      if ([p, d, i, l, e].some((r) => r.error) || !p.data) throw new Error();
      const own = p.data;
      if (own.user_id !== userId || own.id !== projectId) throw new Error();
      const opts: SubmissionSourceOption[] = [],
        controls: Array<{ label: string; scope: ConsentScope }> = [
          {
            label: "Idea sharing choices",
            scope: { projectId, targetKind: "project", targetId: projectId },
          },
        ];
      const add = (
        label: string,
        kind: SubmissionSourceOption["selection"]["kind"],
        recordId: string,
        field: SubmissionSourceOption["selection"]["field"],
        text?: unknown,
      ) => {
        if (typeof text === "string" && text.trim())
          opts.push({ label, selection: { kind, recordId, field }, text });
      };
      for (const field of ["name", "description", "audience", "problem"] as const)
        add(`Idea · ${field}`, "project", projectId, field, own[field]);
      for (const row of d.data ?? []) {
        if (row.user_id !== userId || row.project_id !== projectId) throw new Error();
        const doc = row.document as Record<string, unknown>;
        const frame = doc["frame"] as Record<string, unknown> | undefined;
        const reflection = doc["reflection"] as Record<string, unknown> | undefined;
        add("Discovery · problem", "discovery", row.id, "problem", frame?.["problem"]);
        add("Discovery · solution", "discovery", row.id, "solution", frame?.["solution"]);
        add("Discovery · next test", "discovery", row.id, "next_test", reflection?.["nextTest"]);
        for (const [field, value] of [
          ["hypothesis", doc["hypothesisDraft"]],
          ["script", doc["scriptDraft"]],
          ["reflection", doc["reflection"]],
        ] as const)
          if (value)
            opts.push({
              label: `Discovery · ${field} (full bounded saved field)`,
              selection: { kind: "discovery", recordId: row.id, field },
            });
      }
      for (const [index, row] of (i.data ?? []).entries()) {
        if (row.user_id !== userId || row.project_id !== projectId) throw new Error();
        const answers = z
          .array(
            z.object({
              q: z.string().optional(),
              note: z.string().optional(),
              quote: z.string().optional(),
            }),
          )
          .parse(row.answers);
        const text = answers
          .map(
            (a) => `${a.q ?? ""}\nObservation: ${a.note ?? ""}\nReported quote: ${a.quote ?? ""}`,
          )
          .join("\n\n");
        add(
          `Interview ${index + 1} · selected observation / reported words`,
          "interview",
          row.id,
          "answers",
          text,
        );
        controls.push({
          label: `Interview ${index + 1} choices`,
          scope: { projectId, targetKind: "interview", targetId: row.id },
        });
        if (
          row.contact_id &&
          !controls.some(
            (c) => c.scope.targetKind === "contact" && c.scope.targetId === row.contact_id,
          )
        )
          controls.push({
            label: `Interview ${index + 1} linked-person sharing choices`,
            scope: { projectId, targetKind: "contact", targetId: row.contact_id },
          });
      }
      for (const [index, row] of (l.data ?? []).entries()) {
        if (row.user_id !== userId || row.project_id !== projectId) throw new Error();
        for (const field of ["title", "body"] as const)
          add(`Learning ${index + 1} · ${field}`, "learning", row.id, field, row[field]);
        controls.push({
          label: `Learning ${index + 1} choices`,
          scope: { projectId, targetKind: "learning", targetId: row.id },
        });
      }
      for (const [index, row] of (e.data ?? []).entries()) {
        if (row.user_id !== userId || row.project_id !== projectId) throw new Error();
        for (const field of ["hypothesis", "change", "result"] as const)
          add(`Experiment ${index + 1} · ${field}`, "experiment", row.id, field, row[field]);
      }
      if (!alive.current || run.current !== token) return;
      setHasMoreSources([i.data, l.data, e.data].some((rows) => (rows?.length ?? 0) === 25));
      setOptions(opts);
      setPrivacy(controls);
      setGeneration((n) => n + 1);
    } catch {
      if (alive.current && run.current === token)
        setMessage(
          "Saved source work could not be verified. No example or other project was substituted. Reload before reviewing.",
        );
    } finally {
      if (alive.current && run.current === token) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [userId, projectId, sourcePage]); // eslint-disable-line react-hooks/exhaustive-deps
  const published = assignments.filter((a) => a.state === "published");
  return (
    <div className="space-y-5">
      <p className="rounded-xl border p-4 text-sm">
        Connected privately. Review real recorded permissions before submitting. Unknown choices are
        not permission. This workspace makes no AI call. Learning sources conservatively require
        sharing choices for all possible current interview/contact dependencies.
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer font-semibold">
          Review separate saved note, AI and sharing choices
        </summary>
        <div className="mt-4 space-y-4">
          {privacy.map((c) => (
            <details
              key={JSON.stringify(c.scope)}
              onToggle={(event) => {
                const key = JSON.stringify(c.scope);
                if (event.currentTarget.open) setOpenPrivacy(key);
                else setOpenPrivacy((current) => (current === key ? null : current));
              }}
            >
              <summary className="min-h-11 cursor-pointer">{c.label}</summary>
              {openPrivacy === JSON.stringify(c.scope) && (
                <SavedConsentFields scope={c.scope} label={c.label} />
              )}
            </details>
          ))}
        </div>
      </details>
      <button className="min-h-11 underline" disabled={busy} onClick={() => void load()}>
        {busy ? "Loading your saved sources…" : "Reload saved sources and start a fresh review"}
      </button>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <button
          className="min-h-11 underline"
          disabled={busy || sourcePage === 0}
          onClick={() => setSourcePage((n) => n - 1)}
        >
          Previous source page
        </button>
        <span>Saved-source page {sourcePage + 1}</span>
        <button
          className="min-h-11 underline"
          disabled={busy || !hasMoreSources}
          onClick={() => setSourcePage((n) => n + 1)}
        >
          Next source page
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Each page shows up to 25 completed interviews, 25 learnings and 25 experiments. Changing
        source pages starts a fresh review. Large fields need a matching excerpt of at most 6,000
        characters; nothing is silently shortened. Review any remaining linked-person choices in
        your own Contacts workspace for this idea; unknown choices never become permission
        automatically.
      </p>
      {message && <p role="alert">{message}</p>}
      <label className="block font-semibold">
        Published assignment
        <select
          className={field}
          value={assignmentId}
          onChange={(event) => setAssignmentId(event.target.value)}
        >
          <option value="">Choose an assignment</option>
          {published.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </label>
      {!published.length && (
        <p>
          No published assignment is available. Keep working privately until your teacher publishes
          one.
        </p>
      )}
      {!busy && published.some((a) => a.id === assignmentId) && (
        <SubmissionPreview
          key={`${userId}:${projectId}:${assignmentId}:${generation}`}
          scopeKey={`${userId}:${classId}:${projectId}:${generation}`}
          classId={classId}
          assignmentId={assignmentId}
          source={{ type: "account_project", projectId }}
          sourceOptions={options}
          onSubmitted={onSubmitted}
        />
      )}
    </div>
  );
}
