import { useEffect, useRef, useState } from "react";
import { AppShell, Card } from "@/components/AppShell";
import { ClassInvitationPanel } from "@/components/invitations/ClassInvitationPanel";
import * as api from "@/lib/classes.functions";
import {
  classMessage,
  type ClassSummary,
  type ClassDetail,
  type ClassAssignment,
  type ClassMember,
} from "@/lib/classes";
import * as guest from "@/lib/guest-spaces.functions";
import {
  guestLink,
  guestMessage,
  type GuestEntry,
  guestTeamsSchema,
} from "@/lib/guest-spaces/contracts";
import type { z } from "zod";
import { EntryLink } from "./EntryLink";
import { TeacherGuestSubmissions } from "./TeacherGuestSubmissions";
import { TeacherMarketingSubmissions } from "./TeacherMarketingSubmissions";
import { AccountSubmissionWorkspace } from "./AccountSubmissionWorkspace";
import { SubmissionList } from "./SubmissionList";
import { SubmittedSnapshotExport } from "@/components/export/SubmittedSnapshotExport";
import type { SubmissionView } from "@/lib/submissions/contracts";
const button =
  "min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50";
const field = "mt-2 block min-h-11 w-full rounded-xl border bg-background p-3";
const nowPlusMonth = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16);
export function ClassroomManager({ userId }: { userId: string }) {
  const [authorRefresh, setAuthorRefresh] = useState(0),
    [authorExport, setAuthorExport] = useState<SubmissionView | null>(null);
  const [items, setItems] = useState<ClassSummary[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false);
  const alive = useRef(true),
    listEpoch = useRef(0);
  const refresh = async (more = false) => {
    const run = ++listEpoch.current;
    setLoading(true);
    setMessage("");
    const result = await api.listMyClasses({ data: more && cursor ? { cursor } : {} });
    if (!alive.current || run !== listEpoch.current) return;
    setLoading(false);
    if (result.ok) {
      setLoaded(true);
      setItems((old) => (more ? [...old, ...result.data.items] : result.data.items));
      setCursor(result.data.nextCursor);
    } else {
      setLoaded(false);
      setItems([]);
      setCursor(null);
      setMessage(classMessage(result.code));
    }
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AppShell title="Classes & hackathons">
      <div className="space-y-7">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Teach through real discovery
            </p>
            <h1 className="mt-2 text-3xl font-bold">One room. Every team can start.</h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Provision a private class or hackathon. Students join by QR without email, password or
              a personal account. Private projects remain private.
            </p>
          </div>
          <button
            className={button}
            onClick={() => {
              setCreating(!creating);
              setSelected(null);
            }}
          >
            New class or hackathon
          </button>
        </div>
        <div className="rounded-2xl border bg-secondary/30 p-5 text-sm">
          <strong>Know the audience.</strong> Published instructions reach enrolled accounts and
          admitted guests. Guests see their own team and alias, not a class roster. Signed-in
          students and account-free guests can save their work and deliberately submit selected
          reviewed versions. Teachers see reviewed submissions, never automatic private-note access.
          Class AI is disabled. Retention is requested, not automatic deletion.
        </div>
        <a className="inline-flex min-h-11 items-center font-semibold underline" href="/workspace">
          Return to your personal workspace
        </a>
        {message && <p role="status">{message}</p>}
        {creating && (
          <ClassForm
            key={"new:" + userId}
            onSaved={(id) => {
              setCreating(false);
              setSelected(id);
              void refresh();
            }}
          />
        )}
        <div className="grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
          <nav aria-label="Your classes" className="space-y-3">
            <h2 className="font-bold">Your spaces</h2>
            <button
              className="min-h-11 text-sm underline"
              disabled={loading}
              onClick={() => void refresh()}
            >
              {loading ? "Loading your classes…" : "Refresh your classes"}
            </button>
            {loaded && !loading && items.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Create a class, or accept a named class invitation. No personal idea is required.
              </p>
            )}
            {items.map((item) => (
              <button
                key={item.id}
                aria-pressed={selected === item.id}
                className={
                  "block w-full rounded-xl border p-4 text-left " +
                  (selected === item.id ? "border-primary bg-secondary/50" : "bg-card")
                }
                onClick={() => {
                  setCreating(false);
                  setSelected(item.id);
                }}
              >
                <span className="block font-semibold">{item.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {item.mode} · {item.role} ·{" "}
                  {item.archivedAt
                    ? "archived"
                    : new Date(item.accessExpiresAt).getTime() < Date.now()
                      ? "expired"
                      : "active"}
                </span>
              </button>
            ))}
            {cursor && (
              <button
                disabled={loading}
                className="min-h-11 underline"
                onClick={() => void refresh(true)}
              >
                More classes
              </button>
            )}
          </nav>
          {selected ? (
            <ClassDetailPanel
              key={userId + ":" + selected}
              classId={selected}
              userId={userId}
              onSubmitted={() => {
                setAuthorRefresh((n) => n + 1);
                setAuthorExport(null);
              }}
              onChanged={() => void refresh()}
              onLeft={() => {
                setSelected(null);
                setAuthorRefresh((n) => n + 1);
                setAuthorExport(null);
                void refresh();
              }}
            />
          ) : (
            <Card>
              <h2 className="text-xl font-bold">A classroom without signup friction.</h2>
              <ol className="mt-4 list-inside list-decimal space-y-3 text-sm">
                <li>Set a title, instructions, end date and requested retention.</li>
                <li>Publish assignments and review the visible audience.</li>
                <li>Activate a bounded entry QR. Every new team gets distinct access.</li>
                <li>Students save their own private recovery key separately from team keys.</li>
              </ol>
            </Card>
          )}
        </div>
        <SubmissionList
          scopeKey={userId}
          mode="author"
          refreshKey={authorRefresh}
          onExport={setAuthorExport}
        />
        {authorExport && (
          <SubmittedSnapshotExport scopeKey={userId} mode="author" view={authorExport} />
        )}
      </div>
    </AppShell>
  );
}
function ClassForm({ current, onSaved }: { current?: ClassDetail; onSaved: (id: string) => void }) {
  const [name, setName] = useState(current?.name ?? ""),
    [mode, setMode] = useState<"class" | "hackathon">(current?.mode ?? "class");
  const [instructions, setInstructions] = useState(current?.instructions ?? ""),
    [expiry, setExpiry] = useState(current?.accessExpiresAt.slice(0, 16) ?? nowPlusMonth());
  const [retention, setRetention] = useState(current?.retentionDays ?? 120),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const request = useRef({
    classId: current?.id ?? crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    payload: "",
  });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <Card>
      <h2 className="text-xl font-bold">{current ? "Class settings" : "Provision a space"}</h2>
      <form
        className="mt-4 grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          const document = {
            name,
            mode,
            instructions,
            accessExpiresAt: new Date(expiry + "Z").toISOString(),
            retentionDays: retention,
          };
          const payload = JSON.stringify(document);
          if (request.current.payload && request.current.payload !== payload)
            request.current.requestId = crypto.randomUUID();
          request.current.payload = payload;
          const result = current
            ? await api.updateClass({
                data: {
                  classId: current.id,
                  requestId: request.current.requestId,
                  expectedRevision: current.revision,
                  document,
                },
              })
            : await api.createClass({
                data: {
                  classId: request.current.classId,
                  requestId: request.current.requestId,
                  document,
                },
              });
          if (!alive.current) return;
          setBusy(false);
          if (result.ok) onSaved(result.data.id);
          else setMessage(classMessage(result.code));
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            Space title
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </label>
          <label>
            Format
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
              className={field}
            >
              <option value="class">Class</option>
              <option value="hackathon">Hackathon</option>
            </select>
          </label>
          <label>
            Access ends (UTC)
            <input
              type="datetime-local"
              required
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className={field}
            />
          </label>
          <label>
            Requested retention (days)
            <input
              type="number"
              min={1}
              max={730}
              required
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
              className={field}
            />
          </label>
        </div>
        <label>
          Published class instructions
          <textarea
            maxLength={4000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className={field + " min-h-28"}
          />
        </label>
        <p className="text-sm text-muted-foreground">
          AI stays off. These instructions are visible to admitted guests. Do not include student
          names or private interview notes. Access ends at the time above; automatic deletion is not
          yet implemented.
        </p>
        <button disabled={busy} className={button}>
          {current ? "Save settings" : "Create private space"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </Card>
  );
}
function ClassDetailPanel({
  classId,
  userId,
  onChanged,
  onSubmitted,
  onLeft,
}: {
  classId: string;
  userId: string;
  onChanged: () => void;
  onSubmitted: () => void;
  onLeft: () => void;
}) {
  const [teacherExport, setTeacherExport] = useState<SubmissionView | null>(null);
  const [detail, setDetail] = useState<ClassDetail | null>(null),
    [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [members, setMembers] = useState<ClassMember[]>([]),
    [message, setMessage] = useState(""),
    [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false),
    [grant, setGrant] = useState(""),
    [label, setLabel] = useState("Co-teacher"),
    [grantRevision, setGrantRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true),
    detailEpoch = useRef(0),
    leaveIntent = useRef<{ revision: number; requestId: string } | null>(null);
  const refresh = async () => {
    const run = ++detailEpoch.current;
    setTeacherExport(null);
    setDetail(null);
    setAssignments([]);
    setMembers([]);
    setLoading(true);
    setMessage("");
    const result = await api.getClass({ data: { classId } });
    if (!alive.current || run !== detailEpoch.current) return;
    if (!result.ok) {
      setLoading(false);
      setMessage(classMessage(result.code));
      return;
    }
    const read = await api.listAssignments({ data: { classId } });
    if (!alive.current || run !== detailEpoch.current) return;
    if (read.ok) setAssignments(read.data.items);
    else setMessage(classMessage(read.code));
    if (result.data.role !== "student") {
      const roster = await api.listClassMembers({ data: { classId } });
      if (!alive.current || run !== detailEpoch.current) return;
      if (roster.ok) setMembers(roster.data.items);
    }
    setDetail(result.data);
    setLoading(false);
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps
  const active =
    detail && !detail.archivedAt && new Date(detail.accessExpiresAt).getTime() > Date.now();
  return (
    <div className="space-y-6">
      {loading && <p role="status">Checking current class access and assignments…</p>}
      <button
        disabled={loading || busy}
        className="min-h-11 underline"
        onClick={() => void refresh()}
      >
        {detail ? "Refresh selected class" : "Retry selected class"}
      </button>
      {message && (
        <p role="status" className="rounded-xl border p-4">
          {message}
        </p>
      )}
      {detail && (
        <>
          <Card>
            <div className="flex flex-wrap justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest">
                  {detail.mode} · {detail.role}
                </p>
                <h2 className="mt-2 text-2xl font-bold">{detail.name}</h2>
              </div>
              {detail.role === "owner" && (
                <div className="flex gap-3">
                  <button className="min-h-11 underline" onClick={() => setEdit(!edit)}>
                    Edit settings
                  </button>
                  <button
                    disabled={busy}
                    className={button}
                    onClick={async () => {
                      setBusy(true);
                      const result = await api.setClassArchived({
                        data: {
                          classId,
                          expectedRevision: detail.revision,
                          requestId: crypto.randomUUID(),
                          archived: !detail.archivedAt,
                        },
                      });
                      if (!alive.current) return;
                      setBusy(false);
                      if (!result.ok) setMessage(classMessage(result.code));
                      await refresh();
                      onChanged();
                    }}
                  >
                    {detail.archivedAt ? "Restore space" : "Close space"}
                  </button>
                </div>
              )}
            </div>
            <p className="mt-4 whitespace-pre-wrap">
              {detail.instructions || "No class instructions yet."}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Access ends {new Date(detail.accessExpiresAt).toLocaleString()} · Requested retention{" "}
              {detail.retentionDays} days · AI disabled
            </p>
            {!active && (
              <p className="mt-4 font-semibold">
                This space is closed or expired. Guest entry and ordinary member access are denied.
                Owners can recover settings.
              </p>
            )}
          </Card>
          {edit && detail.role === "owner" && (
            <ClassForm
              key={"edit:" + detail.revision}
              current={detail}
              onSaved={() => {
                setEdit(false);
                void refresh();
                onChanged();
              }}
            />
          )}
          {detail.role === "owner" && (
            <GuestEntryManager classId={classId} active={Boolean(active)} />
          )}
          <Card>
            <h3 className="text-xl font-bold">Assignments</h3>
            <div className="mt-4 space-y-4">
              {assignments.map((a) => (
                <article key={a.id} className="rounded-xl border p-4">
                  <p className="text-xs uppercase text-muted-foreground">
                    {a.state}
                    {a.dueAt ? " · Due " + new Date(a.dueAt).toLocaleDateString() : ""}
                  </p>
                  <h4 className="mt-2 font-bold">{a.title}</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{a.instructions}</p>
                  {detail.role !== "student" && active && a.state !== "archived" && (
                    <button
                      className="mt-3 min-h-11 underline"
                      onClick={async () => {
                        const result = await api.saveAssignment({
                          data: {
                            classId,
                            assignmentId: a.id,
                            expectedRevision: a.revision,
                            requestId: crypto.randomUUID(),
                            document: {
                              title: a.title,
                              instructions: a.instructions,
                              dueAt: a.dueAt,
                              state: "archived",
                            },
                          },
                        });
                        if (!alive.current) return;
                        if (!result.ok) setMessage(classMessage(result.code));
                        void refresh();
                      }}
                    >
                      Archive assignment
                    </button>
                  )}
                </article>
              ))}
              {assignments.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {detail.role === "student"
                    ? "No published assignments are available. Keep working privately until your teacher publishes one."
                    : "No visible assignments. Publish one to receive deliberately reviewed student work."}
                </p>
              )}
            </div>
            {detail.role !== "student" && active && (
              <AssignmentForm classId={classId} onSaved={() => void refresh()} />
            )}
          </Card>
          {detail.role === "student" && active && (
            <>
              <Card>
                <h3 className="text-xl font-bold">What your teachers can see</h3>
                <p className="mt-3 text-sm">
                  Your chosen classroom alias and membership are visible to teaching staff. For a
                  submitted version they can see its title, selected redacted excerpts, your
                  interpretation, uncertainty, decision and next action, plus the assignment,
                  version number and submission time. Connecting an idea shares no private notes or
                  project access. Later private edits are not sent automatically.
                </p>
              </Card>
              <fieldset disabled={busy} aria-busy={busy}>
                <AccountSubmissionWorkspace
                  userId={userId}
                  detail={detail}
                  assignments={assignments}
                  onAssociated={() => void refresh()}
                  onSubmitted={onSubmitted}
                />
              </fieldset>
            </>
          )}
          {detail.role !== "student" && (
            <>
              <SubmissionList
                key={`account-submissions:${detail.revision}`}
                scopeKey={userId + ":" + classId}
                mode="teacher"
                classId={classId}
                onExport={setTeacherExport}
              />
              {teacherExport && (
                <SubmittedSnapshotExport
                  scopeKey={userId + ":" + classId}
                  mode="teacher"
                  view={teacherExport}
                />
              )}
              <TeacherGuestSubmissions
                key={`guest-submissions:${detail.revision}`}
                userId={userId}
                classId={classId}
              />
              <TeacherMarketingSubmissions
                key={`marketing-submissions:${detail.revision}`}
                userId={userId}
                classId={classId}
              />
            </>
          )}
          {detail.role !== "student" && (
            <GuestRoster classId={classId} owner={detail.role === "owner"} />
          )}
          {detail.role === "owner" && (
            <>
              <Card>
                <h3 className="text-xl font-bold">Teaching access</h3>
                <p className="mt-2 text-sm">
                  Only you grant co-teachers. They can manage published assignments, never private
                  project notes.
                </p>
                <form
                  className="mt-4 flex flex-wrap gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const result = await api.grantClassTeacher({
                      data: {
                        classId,
                        targetUserId: grant,
                        displayLabel: label,
                        expectedRevision: grantRevision,
                        requestId: crypto.randomUUID(),
                      },
                    });
                    if (!alive.current) return;
                    setMessage(
                      result.ok
                        ? "Teaching access granted."
                        : result.code === "REVISION_CONFLICT"
                          ? "This account already has class history. Review the current membership revision below, then explicitly grant again if intended."
                          : classMessage(result.code),
                    );
                    if (!result.ok && result.code === "REVISION_CONFLICT")
                      setGrantRevision(result.currentRevision ?? 0);
                    if (result.ok) {
                      setGrant("");
                      setGrantRevision(0);
                      void refresh();
                    }
                  }}
                >
                  <label className="flex-1">
                    Co-teacher account ID
                    <input
                      required
                      value={grant}
                      onChange={(e) => {
                        setGrant(e.target.value);
                        setGrantRevision(0);
                      }}
                      className={field}
                    />
                  </label>
                  <label>
                    Display alias
                    <input
                      required
                      maxLength={80}
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className={field}
                    />
                  </label>
                  <label>
                    Reviewed membership revision
                    <input
                      type="number"
                      min={0}
                      max={Number.MAX_SAFE_INTEGER}
                      value={grantRevision}
                      onChange={(e) => setGrantRevision(Number(e.target.value))}
                      className={field}
                    />
                  </label>
                  <button disabled={!active} className={button}>
                    Grant co-teacher
                  </button>
                </form>
                <ul className="mt-4 space-y-2">
                  {members.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm"
                    >
                      {m.displayLabel} · {m.role} · {m.state}
                      {m.state === "active" && (
                        <button
                          className="min-h-11 underline"
                          onClick={async () => {
                            const input = {
                              data: {
                                classId,
                                membershipId: m.id,
                                expectedRevision: m.revision,
                                requestId: crypto.randomUUID(),
                              },
                            };
                            const result =
                              m.role === "teacher"
                                ? await api.revokeClassTeacher(input)
                                : await api.removeStudent(input);
                            if (!alive.current) return;
                            if (!result.ok) setMessage(classMessage(result.code));
                            void refresh();
                          }}
                        >
                          Remove access
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
              <ClassInvitationPanel key={"account-invites:" + classId} classId={classId} />
            </>
          )}
          {detail.role !== "owner" && detail.enrollment && (
            <div className="rounded-xl border p-5 text-sm">
              <p>
                Leaving ends your class access and deactivates this class’s idea connection. Your
                private ideas and saved source work are kept. Your own submitted copies and the
                ability to withdraw access remain below; downloaded copies cannot be recalled.
              </p>
              <button
                disabled={busy}
                className="min-h-11 underline"
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  if (leaveIntent.current?.revision !== detail.enrollment!.revision)
                    leaveIntent.current = {
                      revision: detail.enrollment!.revision,
                      requestId: crypto.randomUUID(),
                    };
                  const result = await api.leaveClass({
                    data: {
                      classId,
                      expectedRevision: detail.enrollment!.revision,
                      requestId: leaveIntent.current.requestId,
                    },
                  });
                  if (!alive.current) return;
                  setBusy(false);
                  if (result.ok) onLeft();
                  else {
                    setMessage(classMessage(result.code));
                  }
                }}
              >
                {busy ? "Leaving class…" : "Leave this class"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function AssignmentForm({ classId, onSaved }: { classId: string; onSaved: () => void }) {
  const [title, setTitle] = useState(""),
    [instructions, setInstructions] = useState(""),
    [state, setState] = useState<"draft" | "published">("published");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const request = useRef({
    assignmentId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    payload: "",
  });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <form
      className="mt-5 space-y-4 rounded-xl bg-secondary/30 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        const document = { title, instructions, dueAt: null, state };
        const payload = JSON.stringify(document);
        if (request.current.payload && request.current.payload !== payload)
          request.current = {
            assignmentId: request.current.assignmentId,
            requestId: crypto.randomUUID(),
            payload,
          };
        else request.current.payload = payload;
        const result = await api.saveAssignment({
          data: {
            classId,
            assignmentId: request.current.assignmentId,
            requestId: request.current.requestId,
            expectedRevision: 0,
            document,
          },
        });
        if (!alive.current) return;
        setBusy(false);
        if (result.ok) {
          setTitle("");
          setInstructions("");
          request.current = {
            assignmentId: crypto.randomUUID(),
            requestId: crypto.randomUUID(),
            payload: "",
          };
          onSaved();
        } else setMessage(classMessage(result.code));
      }}
    >
      <h4 className="font-bold">Add an assignment</h4>
      <label className="block">
        Assignment title
        <input
          required
          maxLength={120}
          className={field}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block">
        Instructions
        <textarea
          maxLength={8000}
          className={field + " min-h-28"}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <label className="block">
        Visibility
        <select
          value={state}
          onChange={(e) => setState(e.target.value as typeof state)}
          className={field}
        >
          <option value="published">Publish to admitted guests and students</option>
          <option value="draft">Teacher draft only</option>
        </select>
      </label>
      <button disabled={busy} className={button}>
        Save assignment
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
function GuestEntryManager({ classId, active }: { classId: string; active: boolean }) {
  const [items, setItems] = useState<GuestEntry[]>([]),
    [days, setDays] = useState(7),
    [maxUses, setMaxUses] = useState(45);
  const [confirmed, setConfirmed] = useState(false),
    [url, setUrl] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef({ id: crypto.randomUUID(), payload: "" });
  const alive = useRef(true);
  const refresh = async () => {
    const result = await guest.listGuestEntries({ data: { classId } });
    if (!alive.current) return;
    if (result.ok) setItems(result.data);
    else setMessage(guestMessage(result.code));
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card>
      <h3 className="text-xl font-bold">Account-free entry</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Each use creates a separate new team. Existing teammates use their private team invitation.
        Closing a link stops new teams; remove team access below to end existing sessions.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !confirmed) return;
          setBusy(true);
          setUrl("");
          const payload = JSON.stringify({ days, maxUses });
          if (request.current.payload && request.current.payload !== payload)
            request.current.id = crypto.randomUUID();
          request.current.payload = payload;
          const result = await guest.createGuestEntry({
            data: { classId, days, maxUses, requestId: request.current.id },
          });
          if (!alive.current) return;
          if (result.ok) {
            request.current = { id: crypto.randomUUID(), payload: "" };
            if (result.token) setUrl(guestLink("entry", result.token, window.location.origin));
            setMessage(
              result.token
                ? "Entry activated. Copy this code now; only its hash is stored."
                : "This entry was already created. Its secret cannot be recovered; revoke and reissue if needed.",
            );
            await refresh();
          } else setMessage(guestMessage(result.code));
          if (alive.current) setBusy(false);
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            Entry lasts (days)
            <input
              type="number"
              min={1}
              max={30}
              required
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className={field}
            />
          </label>
          <label>
            Maximum new teams
            <input
              type="number"
              min={1}
              max={200}
              required
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              className={field}
            />
          </label>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1"
          />
          I reviewed published instructions and access end date. Students need no personal account.
          Team work will be shared only with their team; private recovery is distinct. AI is off and
          automatic deletion is not promised.
        </label>
        <button disabled={busy || !active || !confirmed} className={button}>
          Activate entry QR
        </button>
      </form>
      {url && (
        <div className="mt-5">
          <EntryLink key={url} url={url} />
        </div>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
      <ul className="mt-5 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-4 rounded-xl border p-3 text-sm"
          >
            <span>
              {item.uses}/{item.maxUses} teams · ends {new Date(item.expiresAt).toLocaleString()} ·{" "}
              {item.revokedAt ? "revoked" : "issued"}
            </span>
            {!item.revokedAt && (
              <button
                className="min-h-11 underline"
                onClick={async () => {
                  setUrl("");
                  const result = await guest.revokeGuestEntry({
                    data: { classId, entryId: item.id },
                  });
                  if (!alive.current) return;
                  if (!result.ok) setMessage(guestMessage(result.code));
                  void refresh();
                }}
              >
                Revoke entry
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
function GuestRoster({ classId, owner }: { classId: string; owner: boolean }) {
  const [page, setPage] = useState<z.infer<typeof guestTeamsSchema>>({
      items: [],
      nextCursor: null,
    }),
    [message, setMessage] = useState("");
  const alive = useRef(true);
  const refresh = async (more = false) => {
    const result = await guest.listGuestTeams({
      data: more && page.nextCursor ? { classId, cursor: page.nextCursor } : { classId },
    });
    if (!alive.current) return;
    if (result.ok)
      setPage((old) => ({
        ...result.data,
        items: more ? [...old.items, ...result.data.items] : result.data.items,
      }));
    else setMessage(guestMessage(result.code));
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card>
      <h3 className="text-xl font-bold">Guest teams</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Aliases and access state only. No raw work, recovery keys or private notes are available
        here.
      </p>
      <ul className="mt-4 space-y-4">
        {page.items.map((team) => (
          <li key={team.id} className="rounded-xl border p-4">
            <div className="flex justify-between gap-3">
              <h4 className="font-bold">
                {team.alias}
                {team.archivedAt ? " · access removed" : ""}
              </h4>
              {owner && !team.archivedAt && (
                <button
                  className="min-h-11 underline"
                  onClick={async () => {
                    const result = await guest.revokeGuestScope({
                      data: { classId, teamId: team.id },
                    });
                    if (!alive.current) return;
                    if (!result.ok) setMessage(guestMessage(result.code));
                    void refresh();
                  }}
                >
                  Remove team access
                </button>
              )}
            </div>
            <ul>
              {team.members.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 text-sm">
                  {p.alias} · {p.revokedAt ? "removed" : "active"}
                  {owner && !p.revokedAt && (
                    <button
                      className="min-h-11 underline"
                      onClick={async () => {
                        const result = await guest.revokeGuestScope({
                          data: { classId, teamId: team.id, principalId: p.id },
                        });
                        if (!alive.current) return;
                        if (!result.ok) setMessage(guestMessage(result.code));
                        void refresh();
                      }}
                    >
                      Remove learner access
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {page.nextCursor && (
        <button className="min-h-11 underline" onClick={() => void refresh(true)}>
          More guest teams
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </Card>
  );
}
