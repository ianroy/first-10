import { useCallback, useEffect, useRef, useState } from "react";
import { loadInterviewDraft, saveInterviewDraft } from "./interview-drafts.functions";
import {
  draftErrorText,
  interviewDraftDocumentSchema,
  type InterviewDraftDocument,
  type InterviewDraftRecord,
  type saveDraftSchema,
} from "./interview-drafts";
import type { z } from "zod";

const localFingerprint = (document: InterviewDraftDocument | null, contactId: string | null) =>
  JSON.stringify([
    contactId,
    document?.schemaVersion,
    document?.policyVersion,
    document?.answers.map(({ q, note, quote }) => [q, note, quote]),
    document?.tags,
    document?.choices.noteStatus,
    document?.choices.aiStatus,
    document?.choices.sharingStatus,
    document?.currentQuestion,
  ]);
export const INTERVIEW_AUTOSAVE_DELAY = 1200;

/** Private text remains in memory until the existing atomic save acknowledges it. */
export function useInterviewDraft(scope: {
  ownerId: string;
  projectId: string;
  draftId: string;
  suspendAutosave?: boolean;
}) {
  const { ownerId, projectId, draftId } = scope;
  const [record, setRecord] = useState<InterviewDraftRecord | null>(null);
  const [doc, setDoc] = useState<InterviewDraftDocument | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [remote, setRemote] = useState<InterviewDraftRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(false);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const latest = useRef({ record, doc, contactId, dirty, conflict, paused });
  latest.current = { record, doc, contactId, dirty, conflict, paused };
  const pending = useRef<{
    fingerprint: string;
    data: z.infer<typeof saveDraftSchema>;
  } | null>(null);
  const blocked = useRef(false);

  const accept = useCallback((value: InterviewDraftRecord) => {
    const document = value.document ? structuredClone(value.document) : null;
    latest.current = {
      record: value,
      doc: document,
      contactId: value.contactId,
      dirty: false,
      conflict: false,
      paused: false,
    };
    setRecord(value);
    setDoc(document);
    setContactId(value.contactId);
    setDirty(false);
    setConflict(false);
    setPaused(false);
    setRemote(null);
    setError("");
    pending.current = null;
    blocked.current = false;
  }, []);

  useEffect(() => {
    active.current = true;
    const requestEpoch = ++epoch.current;
    setRecord(null);
    setDoc(null);
    setLoading(true);
    void loadInterviewDraft({ data: { projectId, draftId } })
      .then((result) => {
        if (!active.current || epoch.current !== requestEpoch) return;
        if (result.ok && result.draft.id === draftId && result.draft.projectId === projectId)
          accept(result.draft);
        else if (result.ok) setError(draftErrorText.UNAVAILABLE);
        else setError(draftErrorText[result.code]);
      })
      .catch(() => {
        if (active.current && epoch.current === requestEpoch) setError(draftErrorText.UNAVAILABLE);
      })
      .finally(() => {
        if (active.current && epoch.current === requestEpoch) setLoading(false);
      });
    return () => {
      active.current = false;
      epoch.current = requestEpoch + 1;
    };
  }, [ownerId, projectId, draftId, attempt, accept]);

  function change(fn: (value: InterviewDraftDocument) => void) {
    if (!latest.current.doc) return;
    const document = structuredClone(latest.current.doc);
    fn(document);
    latest.current = { ...latest.current, doc: document, dirty: true };
    setDoc(document);
    setDirty(true);
    setNotice("");
    if (!latest.current.paused && !latest.current.conflict) setError("");
  }
  function unlinkContact() {
    latest.current = { ...latest.current, contactId: null, dirty: true };
    setContactId(null);
    setDirty(true);
    setNotice("");
  }

  const save = useCallback(
    async (replacement?: InterviewDraftDocument) => {
      const current = latest.current;
      if (
        !active.current ||
        inFlight.current ||
        current.conflict ||
        !current.record ||
        !current.doc
      )
        return;
      // Unconfirmed requests are immutable even when the user has continued typing.
      if (!pending.current) {
        const parsed = interviewDraftDocumentSchema.safeParse(replacement ?? current.doc);
        if (!parsed.success) {
          blocked.current = true;
          setPaused(true);
          setError(parsed.error.issues[0]?.message ?? "Review the draft.");
          return;
        }
        const data = {
          projectId,
          draftId,
          expectedRevision: current.record.revision,
          mutationId: crypto.randomUUID(),
          contactId: current.contactId,
          document: parsed.data,
        };
        pending.current = { data, fingerprint: localFingerprint(data.document, data.contactId) };
      }
      const request = pending.current;
      const requestEpoch = epoch.current;
      inFlight.current = true;
      setSaving(true);
      setError("");
      const result = await saveInterviewDraft({ data: request.data }).catch(
        () => ({ ok: false, code: "UNAVAILABLE" }) as const,
      );
      if (!active.current || epoch.current !== requestEpoch) return;
      inFlight.current = false;
      setSaving(false);
      if (result.ok && (result.draft.id !== draftId || result.draft.projectId !== projectId)) {
        blocked.current = true;
        setPaused(true);
        setError(draftErrorText.UNAVAILABLE);
        return;
      }
      if (result.ok) {
        // A replay receipt must never move an already known saved revision backwards.
        if (result.draft.revision < (latest.current.record?.revision ?? 0)) {
          blocked.current = true;
          setPaused(true);
          setConflict(true);
          setError(draftErrorText.CONFLICT);
          return;
        }
        pending.current = null;
        blocked.current = false;
        const unchanged =
          localFingerprint(latest.current.doc, latest.current.contactId) === request.fingerprint;
        if (unchanged) accept(result.draft);
        else {
          latest.current = { ...latest.current, record: result.draft, dirty: true, paused: false };
          setRecord(result.draft);
          setDirty(true);
          setPaused(false);
        }
        setNotice(
          unchanged
            ? "Draft saved. It is still incomplete and is not included in interview counts or AI evidence."
            : "Earlier changes saved. Your newer local edits are waiting to save.",
        );
      } else {
        blocked.current = true;
        setPaused(true);
        setError(draftErrorText[result.code]);
        if (["CONFLICT", "IDEMPOTENCY_CONFLICT", "ALREADY_COMPLETED"].includes(result.code)) {
          latest.current = { ...latest.current, conflict: true, paused: true };
          setConflict(true);
        }
        // Only an explicit retry can reconcile an uncertain outcome. Known failures may
        // be corrected locally, but are never automatically resubmitted.
        if (result.code !== "UNAVAILABLE") pending.current = null;
      }
    },
    [projectId, draftId, accept],
  );

  useEffect(() => {
    if (
      scope.suspendAutosave ||
      !dirty ||
      saving ||
      loading ||
      paused ||
      conflict ||
      blocked.current ||
      record?.status !== "active"
    )
      return;
    const timer = setTimeout(() => {
      void save();
    }, INTERVIEW_AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [
    dirty,
    doc,
    contactId,
    saving,
    loading,
    paused,
    conflict,
    record,
    save,
    scope.suspendAutosave,
  ]);

  async function reload(compare = false) {
    if (inFlight.current) return;
    blocked.current = true;
    setPaused(true);
    setLoading(true);
    const requestEpoch = epoch.current;
    const result = await loadInterviewDraft({ data: { projectId, draftId } }).catch(
      () => ({ ok: false, code: "UNAVAILABLE" }) as const,
    );
    if (!active.current || epoch.current !== requestEpoch) return;
    setLoading(false);
    if (!result.ok || result.draft.id !== draftId || result.draft.projectId !== projectId) {
      setError("Reload failed. Your current local draft remains here.");
      return;
    }
    if (compare) {
      setRemote(result.draft);
      setNotice("Saved version loaded for comparison. Your local work has not been replaced.");
    } else {
      accept(result.draft);
      setNotice("Saved draft reloaded.");
    }
  }
  return {
    record,
    doc,
    contactId,
    dirty,
    saving,
    uncertain: paused && pending.current !== null,
    paused,
    conflict,
    error,
    notice,
    remote,
    loading,
    accept,
    change,
    unlinkContact,
    save,
    reload,
    setError,
    setNotice,
    setConflict,
    retryOpening: () => setAttempt((value) => value + 1),
  };
}
