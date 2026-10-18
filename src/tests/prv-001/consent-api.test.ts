import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  header: "Bearer fixture",
  getUser: vi.fn(),
  rpc: vi.fn(),
  setHeader: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      inputValidator: (parse: (x: unknown) => unknown) => ({
        handler: (fn: (x: unknown) => unknown) => (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: parse(args.data) }),
      }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://fixture.invalid/consent", { headers: { authorization: h.header } }),
  setResponseHeader: h.setHeader,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import {
  getProcessingConsent,
  setProcessingConsent,
  saveInterviewWithConsent,
} from "@/lib/consent.functions";
import { consentRecordSchema, setConsentSchema, captureInterviewSchema } from "@/lib/consent";
const owner = "fa110000-0000-4000-8000-000000000001",
  project = "fa110000-0000-4000-8000-000000000002";
const scope = { projectId: project, targetKind: "project" as const, targetId: project };
const record = {
  ...scope,
  noteStatus: "unknown",
  aiStatus: "unknown",
  sharingStatus: "unknown",
  policyVersion: 1,
  revision: 0,
  evidenceInvalidated: false,
  reportedAt: null,
};
const context = { userId: owner, supabase: { auth: { getUser: h.getUser }, rpc: h.rpc } };
const invoke = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ data, context });
beforeEach(() => {
  vi.clearAllMocks();
  h.header = "Bearer fixture";
  h.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  h.rpc.mockReturnValue({
    abortSignal: async () => ({ data: { ok: true, data: record }, error: null }),
  });
});
describe("PRV001 versioned owner-report API", () => {
  it("reads unknown state with fresh identity and a no-store response", async () => {
    expect(await invoke(getProcessingConsent, scope)).toEqual(record);
    expect(h.getUser).toHaveBeenCalledWith("fixture");
    expect(h.rpc).toHaveBeenCalledWith("get_processing_consent", {
      p_project_id: project,
      p_target_kind: "project",
      p_target_id: project,
    });
    expect(h.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
  it.each(["", "Basic fixture", "Bearer two tokens", "Bearer a,b"])(
    "rejects malformed bearer before database access",
    async (header) => {
      h.header = header;
      await expect(invoke(getProcessingConsent, scope)).rejects.toThrow(
        "Privacy settings could not be verified",
      );
      expect(h.rpc).not.toHaveBeenCalled();
    },
  );
  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: "other" } }, error: null },
    { data: { user: { id: owner } }, error: { message: "private error" } },
  ])("denies stale or mismatched identity", async (result) => {
    h.getUser.mockResolvedValue(result);
    await expect(
      invoke(setProcessingConsent, {
        ...scope,
        noteStatus: "unknown",
        aiStatus: "granted",
        sharingStatus: "unknown",
        policyVersion: 1,
        expectedRevision: 0,
      }),
    ).rejects.toThrow("Privacy settings could not be verified");
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("saves separate statuses and explicit revision without a client actor or role", async () => {
    await invoke(setProcessingConsent, {
      ...scope,
      noteStatus: "granted",
      aiStatus: "declined",
      sharingStatus: "unknown",
      policyVersion: 1,
      expectedRevision: 0,
    });
    expect(h.rpc).toHaveBeenCalledWith("set_processing_consent", {
      p_project_id: project,
      p_target_kind: "project",
      p_target_id: project,
      p_note_status: "granted",
      p_ai_status: "declined",
      p_sharing_status: "unknown",
      p_policy_version: 1,
      p_expected_revision: 0,
    });
  });
  it.each(["REVISION_CONFLICT", "EVIDENCE_REVIEW_REQUIRED"])(
    "preserves safe actionable error %s",
    async (code) => {
      h.rpc.mockReturnValue({
        abortSignal: async () => ({ data: { ok: false, code }, error: null }),
      });
      await expect(
        invoke(setProcessingConsent, {
          ...scope,
          noteStatus: "unknown",
          aiStatus: "granted",
          sharingStatus: "unknown",
          policyVersion: 1,
          expectedRevision: 0,
        }),
      ).rejects.toThrow(code === "REVISION_CONFLICT" ? "changed elsewhere" : "withdrawn evidence");
    },
  );
  it("rejects caller role/owner fields and unrecognized policy states", () => {
    expect(
      setConsentSchema.safeParse({
        ...scope,
        noteStatus: "granted",
        aiStatus: "granted",
        sharingStatus: "granted",
        policyVersion: 1,
        expectedRevision: 0,
        userId: owner,
      }).success,
    ).toBe(false);
    expect(consentRecordSchema.safeParse({ ...record, policyVersion: 2 }).success).toBe(false);
    expect(consentRecordSchema.safeParse({ ...record, aiStatus: "yes" }).success).toBe(false);
  });
  it("saves notes and owner-reported choices in one RPC with a stable retry identifier", async () => {
    const interviewId = "fa110000-0000-4000-8000-000000000003";
    h.rpc.mockReturnValue({
      abortSignal: async () => ({
        data: { ok: true, data: { interviewId, replayed: false } },
        error: null,
      }),
    });
    const data = {
      projectId: project,
      contactId: null,
      answers: [{ q: "Recent event?", note: "Synthetic note", quote: "Exact synthetic words" }],
      tags: [],
      noteStatus: "granted",
      aiStatus: "unknown",
      sharingStatus: "unknown",
      policyVersion: 1,
      requestId: interviewId,
    };
    expect(await invoke(saveInterviewWithConsent, data)).toEqual({ interviewId, replayed: false });
    expect(h.rpc).toHaveBeenCalledWith(
      "save_interview_with_consent",
      expect.objectContaining({
        p_request_id: interviewId,
        p_note_status: "granted",
        p_ai_status: "unknown",
        p_sharing_status: "unknown",
      }),
    );
    expect(captureInterviewSchema.safeParse({ ...data, noteStatus: "declined" }).success).toBe(
      false,
    );
  });
  it("redacts thrown upstream diagnostics", async () => {
    h.rpc.mockReturnValue({
      abortSignal: async () => {
        throw Error("PRIVATE_NOTES_TOKEN");
      },
    });
    await expect(invoke(getProcessingConsent, scope)).rejects.toThrow(
      /^Privacy settings could not be verified\. Your saved work is unchanged\.$/,
    );
  });
});
