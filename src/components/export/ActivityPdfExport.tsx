import { useEffect, useId, useRef, useState } from "react";
import { Download, Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  exportSnapshotText,
  freezeActivityExport,
  permitsActivityAudience,
  type ActivityExportV1,
  type ExportAudience,
  type FrozenActivityExport,
} from "@/lib/export/activity";

type Props = {
  document: ActivityExportV1;
  /** Verified by the source adapter, never from a student-editable audience field. */
  permittedAudiences: readonly ExportAudience[];
  /** Shared/guest mounts reauthorize the exact captured source before creating and delivering a copy. */
  authorizeDownload?: () => Promise<void>;
};
const audienceLabels: Record<ExportAudience, string> = {
  owner: "My private copy",
  teacher: "Teacher review",
  team: "Team copy",
  external: "External review",
};

/** No source fetch, autosave, storage, AI, or implied submission. The caller owns acquisition authorization. */
export function ActivityPdfExport({ document, permittedAudiences, authorizeDownload }: Props) {
  const id = useId();
  const [audience, setAudience] = useState<ExportAudience>(permittedAudiences[0] ?? "owner");
  const [activityKeys, setActivityKeys] = useState(
    document.activities
      .filter((a) => permitsActivityAudience(a.sourceScope, permittedAudiences[0] ?? "owner"))
      .map((a) => a.key),
  );
  const [sectionKeys, setSectionKeys] = useState(
    document.activities.flatMap((a) => a.sections.map((s) => s.key)),
  );
  const [excludedBlocks, setExcludedBlocks] = useState<string[]>([]);
  const [redactions, setRedactions] = useState("");
  const [includeTeam, setIncludeTeam] = useState(false);
  const [review, setReview] = useState<{
    snapshot: FrozenActivityExport;
    fingerprint: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const generation = useRef(0);
  // A changed source or permission invalidates review even before an effect runs.
  const fingerprint = JSON.stringify([document, permittedAudiences]);
  const currentFingerprint = useRef(fingerprint);
  currentFingerprint.current = fingerprint;
  const currentReview = review?.fingerprint === fingerprint ? review : null;
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  const invalidate = () => {
    generation.current += 1;
    setReview(null);
    setError("");
    setSuccess("");
    setBusy(false);
  };
  const toggle = (values: string[], key: string) =>
    values.includes(key) ? values.filter((v) => v !== key) : [...values, key];
  const prepare = () => {
    invalidate();
    try {
      const snapshot = freezeActivityExport(
        document,
        {
          audience,
          activityKeys,
          sectionKeys,
          excludedBlockKeys: excludedBlocks,
          redactions: redactions.split("\n").filter((s) => s.trim()),
          includeTeamLabel: includeTeam,
        },
        { allowedAudiences: permittedAudiences },
      );
      setReview({ snapshot, fingerprint });
    } catch (e) {
      setError(
        e instanceof Error && !e.message.startsWith("[")
          ? e.message
          : "This activity cannot be exported in its current format. Your saved work is unchanged.",
      );
    }
  };
  const download = async () => {
    if (!currentReview) return;
    const captured = currentReview;
    const token = ++generation.current;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await authorizeDownload?.();
      if (token !== generation.current || captured.fingerprint !== currentFingerprint.current)
        return;
      const { createActivityPdf, downloadActivityPdf } = await import("@/lib/export/pdf");
      const result = await createActivityPdf(captured.snapshot);
      await authorizeDownload?.();
      if (token !== generation.current || captured.fingerprint !== currentFingerprint.current)
        return;
      downloadActivityPdf(result.bytes, result.filename);
      setSuccess(
        `PDF download started (${result.pageCount} ${result.pageCount === 1 ? "page" : "pages"}). Nothing was submitted or shared automatically.`,
      );
    } catch (e) {
      if (token === generation.current && captured.fingerprint === currentFingerprint.current)
        setError(
          e instanceof Error ? e.message : "PDF generation failed. Your saved work is unchanged.",
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl border bg-card p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <FileText className="mt-1 size-6 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-bold">
            Take your activity work with you
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Choose the audience and sections, remove identifying details, then review a frozen copy.
            Downloading a PDF does not submit work, send a message or grant access to source
            records.
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="space-y-5">
          <div>
            <label className="mb-2 block font-semibold" htmlFor={`${id}-audience`}>
              Who is this copy for?
            </label>
            <select
              id={`${id}-audience`}
              value={audience}
              onChange={(e) => {
                invalidate();
                const next = e.target.value as ExportAudience;
                setAudience(next);
                setActivityKeys(
                  document.activities
                    .filter((a) => permitsActivityAudience(a.sourceScope, next))
                    .map((a) => a.key),
                );
              }}
              className="min-h-11 w-full rounded-xl border bg-background px-3"
            >
              {permittedAudiences.map((value) => (
                <option key={value} value={value}>
                  {audienceLabels[value]}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">
              Teacher, team and external copies require an authorized submitted snapshot or a
              fictional example. A role label alone does not authorize access.
            </p>
          </div>
          <fieldset className="max-h-[28rem] space-y-3 overflow-y-auto rounded-xl border p-3">
            <legend className="mb-2 font-semibold">Select activities and sections</legend>
            {document.activities.map((a) => {
              const permitted = permitsActivityAudience(a.sourceScope, audience);
              return (
                <div key={a.key} className="rounded-xl border p-3">
                  <label className="flex min-h-11 items-center gap-3 font-semibold">
                    <input
                      type="checkbox"
                      className="size-5"
                      disabled={!permitted}
                      checked={permitted && activityKeys.includes(a.key)}
                      onChange={() => {
                        invalidate();
                        setActivityKeys(toggle(activityKeys, a.key));
                      }}
                    />
                    {a.title}
                  </label>
                  <p className="mb-2 pl-8 text-xs text-muted-foreground">
                    {a.status} {a.fictional ? " / Fictional example" : ""}
                    {!permitted ? " / Available only in a private owner copy" : ""}
                  </p>
                  {permitted &&
                    activityKeys.includes(a.key) &&
                    a.sections.map((s) => (
                      <div key={s.key} className="ml-8 border-t py-2">
                        <label className="flex min-h-11 items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={sectionKeys.includes(s.key)}
                            onChange={() => {
                              invalidate();
                              setSectionKeys(toggle(sectionKeys, s.key));
                            }}
                          />
                          {s.title}
                        </label>
                        {sectionKeys.includes(s.key) && s.blocks.length > 1 && (
                          <details className="text-xs text-muted-foreground">
                            <summary className="min-h-9 cursor-pointer py-2">
                              Choose individual content blocks
                            </summary>
                            {s.blocks.map((b, index) => (
                              <label key={b.key} className="flex min-h-11 items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!excludedBlocks.includes(b.key)}
                                  onChange={() => {
                                    invalidate();
                                    setExcludedBlocks(toggle(excludedBlocks, b.key));
                                  }}
                                />
                                Block {index + 1}:{" "}
                                {b.type === "text"
                                  ? b.text.slice(0, 80) || "Empty text"
                                  : b.type === "fields"
                                    ? b.fields
                                        .map((f) => f.label)
                                        .join(", ")
                                        .slice(0, 80)
                                    : b.columns.join(", ").slice(0, 80)}
                              </label>
                            ))}
                          </details>
                        )}
                      </div>
                    ))}
                </div>
              );
            })}
          </fieldset>
          {document.teamLabel && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={includeTeam}
                onChange={(e) => {
                  invalidate();
                  setIncludeTeam(e.target.checked);
                }}
              />
              Include team alias: {document.teamLabel}
            </label>
          )}
          <div>
            <label htmlFor={`${id}-redactions`} className="mb-2 block font-semibold">
              Remove words or phrases
            </label>
            <Textarea
              id={`${id}-redactions`}
              value={redactions}
              onChange={(e) => {
                invalidate();
                setRedactions(e.target.value);
              }}
              rows={4}
              aria-describedby={`${id}-privacy`}
              placeholder="One exact phrase per line"
            />
            <p id={`${id}-privacy`} className="mt-2 text-xs text-muted-foreground">
              Literal, case-sensitive replacements. Email addresses and UUIDs are removed
              automatically. Review names, phone numbers, locations, quotes and other identifying
              details yourself. This does not certify de-identification or FERPA compliance.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={prepare}
            disabled={!permittedAudiences.length}
          >
            <Eye className="size-4" />
            Review frozen copy
          </Button>
        </div>
        <div className="min-w-0 space-y-4 rounded-xl bg-muted p-4">
          <h3 className="text-lg font-semibold">Your export preview</h3>
          <p className="text-xs text-muted-foreground">
            The PDF uses this selected text with headings, tables and page numbers. Unknown values
            remain unknown; 0 stays 0. Font support currently covers Latin, Greek and Cyrillic;
            unsupported characters block download with an explanation.
          </p>
          {currentReview ? (
            <pre
              aria-label="Frozen export preview"
              className="max-h-[40rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-background p-4 font-sans text-sm leading-relaxed"
            >
              {exportSnapshotText(currentReview.snapshot)}
            </pre>
          ) : (
            <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              Review the selected copy before downloading. Changes to the source, audience or
              selection require a fresh review.
            </p>
          )}
          <Button type="button" onClick={() => void download()} disabled={!currentReview || busy}>
            <Download className="size-4" />
            {busy ? "Preparing PDF…" : "Download PDF"}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="text-sm text-success">
              {success}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
