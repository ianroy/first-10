import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { useWorkspaceIdentity } from "@/lib/project-selection";
import { getProcessingConsent, setProcessingConsent } from "@/lib/consent.functions";
import {
  CONSENT_POLICY_VERSION,
  unknownConsent,
  type ConsentChoices,
  type ConsentScope,
  type ConsentState,
} from "@/lib/consent";
export function ConsentFields({
  value,
  onChange,
  disabled = false,
  label = "Reported choices",
}: {
  value: ConsentChoices;
  onChange: (choices: ConsentChoices) => void;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-xl border p-4">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <p className="text-sm text-muted-foreground">
        Record only choices you have actually discussed or can otherwise authorize. These are your
        reports, not independent verification of participant consent.
      </p>
      {(
        [
          { key: "noteStatus", title: "Permission to keep notes" },
          { key: "aiStatus", title: "Permission for external AI processing" },
          { key: "sharingStatus", title: "Permission for reviewed sharing" },
        ] as const
      ).map(({ key, title }) => (
        <div key={key}>
          <label htmlFor={`${id}-${key}`} className="block text-sm font-medium">
            {title}
          </label>
          <select
            id={`${id}-${key}`}
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value as ConsentState })}
            className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
          >
            <option value="unknown">Unknown — not recorded</option>
            <option value="granted">Granted — reported by you</option>
            <option value="declined">Declined</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Notes, external AI and sharing are separate. A sharing choice does not publish anything,
        enroll anyone or grant teacher access. Policy version {CONSENT_POLICY_VERSION}.
      </p>
    </fieldset>
  );
}
export function SavedConsentFields({ scope, label }: { scope: ConsentScope; label: string }) {
  const identity = useWorkspaceIdentity();
  const get = useServerFn(getProcessingConsent);
  const save = useServerFn(setProcessingConsent);
  const cache = useQueryClient();
  const [draft, setDraft] = useState<ConsentChoices>(unknownConsent);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const key = [
    "processing-consent",
    identity.userId,
    scope.projectId,
    scope.targetKind,
    scope.targetId,
  ];
  const query = useQuery({
    queryKey: key,
    enabled: !!identity.userId,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () => get({ data: scope }),
  });
  useEffect(() => {
    setDraft(
      query.data
        ? {
            noteStatus: query.data.noteStatus,
            aiStatus: query.data.aiStatus,
            sharingStatus: query.data.sharingStatus,
          }
        : unknownConsent,
    );
  }, [query.data, scope.projectId, scope.targetKind, scope.targetId]);
  useEffect(() => setMessage(""), [scope.projectId, scope.targetKind, scope.targetId]);
  if (query.isPending) return <p role="status">Loading saved privacy choices…</p>;
  if (query.isError || !query.data)
    return (
      <div>
        <p role="alert">Privacy choices could not be loaded. Manual work remains available.</p>
        <Button variant="outline" onClick={() => query.refetch()}>
          Reload privacy choices
        </Button>
      </div>
    );
  const record = query.data;
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{label}</h3>
      <ConsentFields value={draft} onChange={setDraft} disabled={busy} />
      <p className="text-xs text-muted-foreground">
        Archived ideas allow withdrawing choices but cannot add permission grants. Removing a linked
        person resets that interview’s AI choice to unknown; review it again before any deliberate
        new grant. Private notes are retained until you choose to remove them.
      </p>
      {record.evidenceInvalidated && (
        <p className="rounded-lg bg-secondary p-3 text-sm">
          This learning may contain withdrawn evidence. Its AI permission cannot be restored by this
          form. Keep working manually; a source-linked redaction review is required before AI reuse.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {record.reportedAt
          ? `Saved report: ${new Date(record.reportedAt).toLocaleString()} · revision ${record.revision}`
          : "No saved choice exists. Earlier records remain unknown."}
      </p>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const result = await save({
              data: {
                ...scope,
                ...draft,
                policyVersion: CONSENT_POLICY_VERSION,
                expectedRevision: record.revision,
              },
            });
            cache.setQueryData(key, result);
            await cache.invalidateQueries({
              queryKey: ["processing-consent", identity.userId, scope.projectId],
            });
            setMessage(
              "Privacy choices saved. Previously transmitted or downloaded copies cannot be recalled.",
            );
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Privacy choices were not saved.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving privacy choices…" : "Save privacy choices"}
      </Button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          setMessage("");
          void query.refetch();
        }}
      >
        Reload saved choices
      </Button>
    </div>
  );
}
