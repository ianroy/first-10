import { guestActivityMessage } from "@/lib/guest-activities/contracts";
import { useEffect, useRef, useState } from "react";
import {
  getTeacherGrowthSubmission,
  listTeacherGrowthSubmissions,
} from "@/lib/guest-growth/handoff/teacher.functions";
import {
  type GrowthSubmissionView,
  growthSubmissionPageSchema,
} from "@/lib/guest-growth/handoff/contracts";
import { ActivityPdfExport } from "@/components/export/ActivityPdfExport";
import { growthSubmissionActivities } from "@/lib/guest-growth/handoff/pdf-adapters";
import { canonicalGrowthJson } from "@/lib/guest-growth/transport";
import type { z } from "zod";
type Page = z.infer<typeof growthSubmissionPageSchema>;
const denial =
  "This reviewed guest version is no longer available. Refresh the class before exporting.";
export function TeacherGrowthSubmissions(props: { userId: string; classId: string }) {
  return <GrowthVersions key={`${props.userId}:${props.classId}`} {...props} />;
}
function GrowthVersions({ classId }: { classId: string }) {
  const [page, setPage] = useState<Page>({ items: [], nextCursor: null });
  const [view, setView] = useState<GrowthSubmissionView | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const requests = useRef({ epoch: 0, alive: true });
  const refresh = async (cursor?: string) => {
    const token = ++requests.current.epoch;
    setBusy(true);
    setMessage("");
    setView(null);
    const result = await listTeacherGrowthSubmissions({
      data: { classId, ...(cursor ? { cursor } : {}) },
    }).catch(() => ({ ok: false as const, code: "UNAVAILABLE" as const }));
    if (!requests.current.alive || token !== requests.current.epoch) return;
    setBusy(false);
    if (!result.ok) {
      setPage({ items: [], nextCursor: null });
      setMessage(guestActivityMessage(result.code));
      return;
    }
    setPage((old) => ({
      ...result.data,
      items: cursor
        ? [...new Map([...old.items, ...result.data.items].map((row) => [row.id, row])).values()]
        : result.data.items,
    }));
  };
  useEffect(() => {
    const state = requests.current;
    state.alive = true;
    void refresh();
    return () => {
      state.alive = false;
      state.epoch++;
    };
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps
  const authorize = async (expected: GrowthSubmissionView) => {
    const token = requests.current.epoch;
    const result = await getTeacherGrowthSubmission({
      data: { classId, snapshotId: expected.id },
    }).catch(() => ({ ok: false as const, code: "UNAVAILABLE" as const }));
    if (
      !requests.current.alive ||
      token !== requests.current.epoch ||
      !result.ok ||
      result.data.audience !== "teacher" ||
      result.data.grantState !== "active" ||
      !result.data.recipientEligible ||
      canonicalGrowthJson(result.data) !== canonicalGrowthJson(expected)
    )
      throw new Error(denial);
  };
  const document = view
    ? {
        schemaVersion: 1 as const,
        title: "Reviewed guest Growth Lab copy",
        capturedAt: view.submittedAt,
        activities: growthSubmissionActivities(view, "teacher").map((offer) => offer.activity),
      }
    : null;
  return (
    <section
      aria-label="Reviewed guest Growth Lab submissions"
      className="space-y-5 rounded-2xl border bg-card p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Reviewed Growth Lab submissions</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Only the selected, redacted growth copies students deliberately submitted appear here.
            Teachers cannot read their raw artifacts. Authored material is not verified customer
            evidence.
          </p>
        </div>
        <button
          className="min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh growth versions
        </button>
      </div>
      {busy && <p role="status">Checking current classroom access…</p>}
      {message && <p role="alert">{message}</p>}
      {!busy && !message && !page.items.length && (
        <p className="text-sm text-muted-foreground">
          No currently authorized Growth Lab submissions.
        </p>
      )}
      <ul className="space-y-3">
        {page.items.map((row) => (
          <li className="rounded-xl border p-4" key={row.id}>
            <p className="font-semibold">{row.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.authorLabel} · Version {row.version} ·{" "}
              {new Date(row.submittedAt).toLocaleString()}
            </p>
            <button
              className="mt-2 min-h-11 font-semibold underline disabled:opacity-50"
              disabled={busy}
              onClick={async () => {
                const token = ++requests.current.epoch;
                setBusy(true);
                setMessage("");
                setView(null);
                const result = await getTeacherGrowthSubmission({
                  data: { classId, snapshotId: row.id },
                }).catch(() => ({ ok: false as const, code: "UNAVAILABLE" as const }));
                if (!requests.current.alive || token !== requests.current.epoch) return;
                setBusy(false);
                if (
                  result.ok &&
                  result.data.audience === "teacher" &&
                  result.data.grantState === "active" &&
                  result.data.recipientEligible
                )
                  setView(result.data);
                else setMessage(denial);
              }}
            >
              Open reviewed version
            </button>
          </li>
        ))}
      </ul>
      {page.nextCursor && (
        <button
          className="min-h-11 underline"
          disabled={busy}
          onClick={() => void refresh(page.nextCursor!)}
        >
          More growth versions
        </button>
      )}
      {document && view && (
        <ActivityPdfExport
          key={view.id + ":" + view.grantRevision}
          document={document}
          permittedAudiences={["teacher"]}
          authorizeDownload={() => authorize(view)}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Source permissions, class changes, expiry or withdrawal can end access. Downloaded copies
        cannot be recalled. Reported observations are not independently verified.
      </p>
    </section>
  );
}
