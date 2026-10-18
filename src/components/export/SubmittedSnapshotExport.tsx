import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityPdfExport } from "./ActivityPdfExport";
import { getOwnSubmission, getTeacherSubmission } from "@/lib/submissions.functions";
import {
  submittedSnapshotDocument,
  submissionPreviewDocument,
} from "@/lib/export/submission-adapters";
import { submissionPreviewSchema, type SubmissionView } from "@/lib/submissions/contracts";
import type { z } from "zod";
const denial =
  "This copy is no longer available. Refresh the authorized submission list before exporting.";
/** The supplied view must already come from the matching fresh author/teacher read API. */
export function SubmittedSnapshotExport(props: {
  scopeKey: string;
  mode: "author" | "teacher";
  view: SubmissionView;
}) {
  return <SavedExport key={JSON.stringify([props.scopeKey, props.mode, props.view])} {...props} />;
}
function SavedExport({ mode, view }: { mode: "author" | "teacher"; view: SubmissionView }) {
  const [ready, setReady] = useState(false),
    [message, setMessage] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const document = useMemo(() => submittedSnapshotDocument(view, mode), [view, mode]);
  const authorize = async () => {
    try {
      const result =
        mode === "teacher"
          ? await getTeacherSubmission({ data: { classId: view.classId, snapshotId: view.id } })
          : await getOwnSubmission({ data: { snapshotId: view.id } });
      if (
        !alive.current ||
        !result.ok ||
        JSON.stringify(result.data) !== JSON.stringify(view) ||
        (mode === "teacher" &&
          (result.data.grantState !== "active" || result.data.audience !== "teacher"))
      )
        throw new Error(denial);
    } catch {
      throw new Error(denial);
    }
  };
  return (
    <section className="space-y-3" aria-label="Authorized submission PDF">
      {!ready ? (
        <button
          className="min-h-11 underline"
          onClick={async () => {
            setMessage("");
            try {
              await authorize();
              if (alive.current) setReady(true);
            } catch {
              if (alive.current) setMessage(denial);
            }
          }}
        >
          Prepare authorized submission PDF
        </button>
      ) : (
        <ActivityPdfExport
          document={document}
          permittedAudiences={[mode === "teacher" ? "teacher" : "owner"]}
          authorizeDownload={authorize}
        />
      )}
      {message && <p role="alert">{message}</p>}
    </section>
  );
}
export function SubmissionPreviewExport(props: {
  scopeKey: string;
  preview: z.infer<typeof submissionPreviewSchema>;
  reauthorize: () => Promise<void>;
}) {
  const document = useMemo(() => submissionPreviewDocument(props.preview), [props.preview]);
  const authorize = async () => {
    if (Date.now() >= new Date(props.preview.expiresAt).getTime())
      throw new Error("This private preview expired. Create a fresh preview before exporting.");
    await props.reauthorize();
  };
  return (
    <ActivityPdfExport
      key={props.scopeKey + props.preview.id}
      document={document}
      permittedAudiences={["owner"]}
      authorizeDownload={authorize}
    />
  );
}
