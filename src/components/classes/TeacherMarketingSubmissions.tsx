import { guestActivityMessage } from "@/lib/guest-activities/contracts";
import { useEffect, useRef, useState } from "react";
import {
  getTeacherMarketingSubmission,
  listTeacherMarketingSubmissions,
} from "@/lib/guest-marketing/handoff/teacher.functions";
import {
  type MarketingSubmissionView,
  marketingSubmissionPageSchema,
} from "@/lib/guest-marketing/handoff/contracts";
import { ActivityPdfExport } from "@/components/export/ActivityPdfExport";
import { marketingSubmissionActivities } from "@/lib/guest-marketing/handoff/pdf-adapters";
import type { z } from "zod";
type Page = z.infer<typeof marketingSubmissionPageSchema>;
const denial =
  "This reviewed guest version is no longer available. Refresh the class before exporting.";
export function TeacherMarketingSubmissions(props: { userId: string; classId: string }) {
  return <MarketingVersions key={`${props.userId}:${props.classId}`} {...props} />;
}
function MarketingVersions({ classId }: { classId: string }) {
  const [page, setPage] = useState<Page>({ items: [], nextCursor: null });
  const [view, setView] = useState<MarketingSubmissionView | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const requests = useRef({ epoch: 0, alive: true });
  const refresh = async (cursor?: string) => {
    const token = ++requests.current.epoch;
    setBusy(true);
    setMessage("");
    setView(null);
    const result = await listTeacherMarketingSubmissions({
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
  const authorize = async (expected: MarketingSubmissionView) => {
    const token = requests.current.epoch;
    const result = await getTeacherMarketingSubmission({
      data: { classId, snapshotId: expected.id },
    }).catch(() => ({ ok: false as const, code: "UNAVAILABLE" as const }));
    if (
      !requests.current.alive ||
      token !== requests.current.epoch ||
      !result.ok ||
      result.data.audience !== "teacher" ||
      result.data.grantState !== "active" ||
      !result.data.recipientEligible ||
      JSON.stringify(result.data) !== JSON.stringify(expected)
    )
      throw new Error(denial);
  };
  const document = view
    ? {
        schemaVersion: 1 as const,
        title: "Reviewed guest Marketing Lab copy",
        capturedAt: view.submittedAt,
        activities: marketingSubmissionActivities(view, "teacher").map((offer) => offer.activity),
      }
    : null;
  return (
    <section
      aria-label="Reviewed guest Marketing Lab submissions"
      className="space-y-5 rounded-2xl border bg-card p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Reviewed Marketing Lab submissions</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Only the selected, redacted marketing copies students deliberately submitted appear
            here. Teachers cannot read their raw plans. Authored material is not verified customer
            evidence.
          </p>
        </div>
        <button
          className="min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh marketing versions
        </button>
      </div>
      {busy && <p role="status">Checking current classroom access…</p>}
      {message && <p role="alert">{message}</p>}
      {!busy && !message && !page.items.length && (
        <p className="text-sm text-muted-foreground">
          No currently authorized Marketing Lab submissions.
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
                const result = await getTeacherMarketingSubmission({
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
          More marketing versions
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
