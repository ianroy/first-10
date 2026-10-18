import { useEffect, useRef, useState } from "react";
import {
  getOwnSubmission,
  getTeacherSubmission,
  listMySubmissions,
  listTeacherSubmissions,
  withdrawSubmission,
} from "@/lib/submissions.functions";
import {
  submissionMessage,
  type SubmissionView,
  submissionHeaderSchema,
} from "@/lib/submissions/contracts";
import { SubmissionPayloadView } from "./SubmissionPreview";
import type { z } from "zod";
type Props = {
  scopeKey: string;
  mode: "author" | "teacher";
  classId?: string;
  assignmentId?: string;
  refreshKey?: number;
  onExport?: (view: SubmissionView) => void;
};
export function SubmissionList(props: Props) {
  return (
    <List
      key={JSON.stringify([props.scopeKey, props.mode, props.classId, props.assignmentId])}
      {...props}
    />
  );
}
function List({ mode, classId, assignmentId, refreshKey, onExport }: Props) {
  const [items, setItems] = useState<z.infer<typeof submissionHeaderSchema>[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<SubmissionView | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const alive = useRef(true),
    epoch = useRef(0),
    withdrawIntent = useRef<{ snapshotId: string; requestId: string } | null>(null);
  const refresh = async (more = false) => {
    const run = ++epoch.current;
    setBusy(true);
    setMessage("");
    if (mode === "teacher" && !classId) {
      setItems([]);
      setSelected(null);
      setMessage("Choose an authorized class first.");
      setBusy(false);
      return;
    }
    const result =
      mode === "teacher" && classId
        ? await listTeacherSubmissions({
            data: {
              classId,
              ...(assignmentId ? { assignmentId } : {}),
              ...(more && cursor ? { cursor } : {}),
            },
          })
        : await listMySubmissions({
            data: { ...(classId ? { classId } : {}), ...(more && cursor ? { cursor } : {}) },
          });
    if (!alive.current || run !== epoch.current) return;
    setBusy(false);
    if (result.ok) {
      setItems((old) => (more ? [...old, ...result.data.items] : result.data.items));
      setCursor(result.data.nextCursor);
    } else {
      setItems([]);
      setSelected(null);
      setMessage(submissionMessage(result.code));
    }
  };
  useEffect(() => {
    alive.current = true;
    setBusy(false);
    setSelected(null);
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section
      aria-label={mode === "author" ? "Your submitted versions" : "Reviewed class submissions"}
      className="space-y-5 rounded-2xl border bg-card p-6"
    >
      <div>
        <h2 className="text-xl font-bold">
          {mode === "author" ? "Your submitted versions" : "Reviewed submissions"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "author"
            ? "Your own immutable copies and withdrawal remain available after class access ends. Withdrawing does not delete your source work or recall downloaded copies."
            : "Only currently permitted, intentionally submitted versions appear. This view provides no raw notes, contacts, private project IDs or guest activity placeholders."}
        </p>
      </div>
      <button
        className="min-h-11 underline"
        disabled={busy}
        onClick={() => {
          setSelected(null);
          void refresh();
        }}
      >
        Refresh authorized versions
      </button>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.authorLabel} · version {item.version} · {item.grantState} ·{" "}
                  {new Date(item.submittedAt).toLocaleString()}
                </p>
              </div>
              <button
                disabled={busy}
                className="min-h-11 font-semibold underline"
                onClick={async () => {
                  const run = ++epoch.current;
                  setBusy(true);
                  setSelected(null);
                  const result =
                    mode === "teacher" && classId
                      ? await getTeacherSubmission({ data: { classId, snapshotId: item.id } })
                      : await getOwnSubmission({ data: { snapshotId: item.id } });
                  if (!alive.current || run !== epoch.current) return;
                  setBusy(false);
                  if (result.ok) setSelected(result.data);
                  else setMessage(submissionMessage(result.code));
                }}
              >
                Open saved version
              </button>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No authorized submitted versions are available.
        </p>
      )}
      {cursor && (
        <button disabled={busy} className="min-h-11 underline" onClick={() => void refresh(true)}>
          More submitted versions
        </button>
      )}
      {selected && (
        <div className="space-y-4 rounded-xl border p-5">
          <SubmissionPayloadView payload={selected.payload} />
          {onExport && (
            <button
              disabled={busy}
              className="min-h-11 underline"
              onClick={async () => {
                const run = ++epoch.current;
                setBusy(true);
                const result =
                  mode === "teacher" && classId
                    ? await getTeacherSubmission({ data: { classId, snapshotId: selected.id } })
                    : await getOwnSubmission({ data: { snapshotId: selected.id } });
                if (!alive.current || run !== epoch.current) return;
                setBusy(false);
                if (result.ok) {
                  setSelected(result.data);
                  onExport(result.data);
                } else {
                  setSelected(null);
                  setMessage(submissionMessage(result.code));
                }
              }}
            >
              Review this authorized version for PDF
            </button>
          )}
          {mode === "author" && selected.grantState === "active" && (
            <button
              disabled={busy}
              className="min-h-11 font-semibold underline"
              onClick={async () => {
                const run = ++epoch.current;
                setBusy(true);
                if (withdrawIntent.current?.snapshotId !== selected.id)
                  withdrawIntent.current = {
                    snapshotId: selected.id,
                    requestId: crypto.randomUUID(),
                  };
                const result = await withdrawSubmission({ data: withdrawIntent.current });
                if (!alive.current || run !== epoch.current) return;
                setBusy(false);
                if (result.ok) {
                  setSelected({ ...selected, ...result.data });
                  setMessage(
                    "Future recipient access is withdrawn. Your own copy and private sources are retained.",
                  );
                  void refresh();
                } else setMessage(submissionMessage(result.code));
              }}
            >
              Withdraw recipient access
            </button>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="rounded-xl border p-4 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
