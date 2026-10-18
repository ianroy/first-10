import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  createOwnedProject,
  createOwnedProjectSchema,
  setOwnedProjectArchived,
  setOwnedProjectArchivedSchema,
} from "@/lib/project-lifecycle";
const projectId = "f9100000-0000-4000-8000-000000000001";
const requestId = "f9100000-0000-4000-8000-000000000002";
const actorId = "f9100000-0000-4000-8000-000000000003";
const summary = {
  id: projectId,
  name: "Saved idea",
  archivedAt: "2026-10-18T15:00:00+00:00",
  lifecycleRevision: 3,
  updatedAt: "2026-10-18T15:00:00+00:00",
};
const create = {
  projectId,
  requestId,
  name: " Idea ",
  description: " Description ",
  audience: " Audience ",
  problem: " Problem ",
};
const archive = { projectId, requestId, archived: true, expectedRevision: 2 };
function client({
  data = { ok: true, data: summary } as unknown,
  error = null as unknown,
  user = { id: actorId } as { id: string } | null,
  authError = null as unknown,
} = {}) {
  const abortSignal = vi.fn().mockResolvedValue({ data, error });
  const rpc = vi.fn().mockReturnValue({ abortSignal });
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: authError });
  return {
    api: { auth: { getUser }, rpc } as unknown as SupabaseClient<Database>,
    rpc,
    getUser,
    abortSignal,
  };
}
describe("owner project lifecycle contracts", () => {
  it("creates only the bounded profile and stable request identity with verified auth", async () => {
    const c = client();
    const result = await createOwnedProject(c.api, create);
    expect(result).toEqual({ ok: true, data: summary });
    expect(c.getUser).toHaveBeenCalledExactlyOnceWith();
    expect(c.rpc).toHaveBeenCalledExactlyOnceWith("create_owned_project", {
      p_project_id: projectId,
      p_request_id: requestId,
      p_name: "Idea",
      p_description: "Description",
      p_audience: "Audience",
      p_problem: "Problem",
      p_link: "",
    });
    expect(c.abortSignal.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
  });
  it("preserves request ids and CAS revision across a network retry", async () => {
    const c = client();
    c.abortSignal.mockRejectedValueOnce(new Error("connection ended after possible commit"));
    expect(await setOwnedProjectArchived(c.api, archive)).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
    expect(await setOwnedProjectArchived(c.api, archive)).toEqual({ ok: true, data: summary });
    expect(c.rpc.mock.calls[0]).toEqual(c.rpc.mock.calls[1]);
    expect(c.rpc.mock.calls[1]).toEqual([
      "set_owned_project_archived",
      {
        p_project_id: projectId,
        p_request_id: requestId,
        p_archived: true,
        p_expected_revision: 2,
      },
    ]);
  });
  it("sends restore explicitly without selecting or deleting any project", async () => {
    const c = client({
      data: { ok: true, data: { ...summary, archivedAt: null, lifecycleRevision: 4 } },
    });
    expect(
      await setOwnedProjectArchived(c.api, { ...archive, archived: false, expectedRevision: 3 }),
    ).toMatchObject({ ok: true, data: { archivedAt: null, lifecycleRevision: 4 } });
    expect(c.rpc.mock.calls[0]?.[0]).toBe("set_owned_project_archived");
    expect(c.rpc.mock.calls[0]?.[1]).toMatchObject({ p_archived: false, p_expected_revision: 3 });
  });
  it.each([null, { id: actorId }])(
    "never invokes a mutation for invalid/expired identity (%j)",
    async (user) => {
      const c = client({ user, authError: { message: "revoked" } });
      expect(await setOwnedProjectArchived(c.api, archive)).toEqual({
        ok: false,
        code: "AUTH_REQUIRED",
      });
      expect(c.rpc).not.toHaveBeenCalled();
    },
  );
  it("requires a concrete fresh user even without an auth error", async () => {
    const c = client({ user: null });
    expect(await createOwnedProject(c.api, create)).toEqual({ ok: false, code: "AUTH_REQUIRED" });
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { ...archive, expectedRevision: -1 },
    { ...archive, expectedRevision: 2.5 },
    { ...archive, expectedRevision: Number.MAX_SAFE_INTEGER },
    { ...archive, projectId: "wrong" },
    { ...archive, archived: "true" },
    { ...archive, userId: actorId },
    { ...archive, role: "owner" },
    { ...archive, requestId: undefined },
  ])(
    "rejects malformed or caller-authority-bearing archive input before auth (%j)",
    async (input) => {
      const c = client();
      expect(await setOwnedProjectArchived(c.api, input)).toEqual({
        ok: false,
        code: "INVALID_INPUT",
      });
      expect(c.getUser).not.toHaveBeenCalled();
      expect(c.rpc).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...create, name: " " },
    { ...create, name: "x".repeat(201) },
    { ...create, description: "x".repeat(4001) },
    { ...create, audience: "x".repeat(2001) },
    { ...create, problem: "x".repeat(4001) },
    { ...create, link: "x".repeat(2049) },
    { ...create, stage: 3 },
    { ...create, archivedAt: "2026-10-18T15:00:00Z" },
    { ...create, userId: actorId },
  ])("cannot smuggle state, authority or oversized text into create (%j)", async (input) => {
    const c = client();
    expect(await createOwnedProject(c.api, input)).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it("returns owner conflict information without discarding it or automatically retrying", async () => {
    const c = client({ data: { ok: false, code: "REVISION_CONFLICT", currentRevision: 4 } });
    expect(await setOwnedProjectArchived(c.api, archive)).toEqual({
      ok: false,
      code: "REVISION_CONFLICT",
      currentRevision: 4,
    });
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ok: true, data: { ...summary, privateNotes: "hidden" } },
    { ok: true, data: { ...summary, lifecycleRevision: Number.MAX_SAFE_INTEGER + 1 } },
    { ok: true, data: { ...summary, archivedAt: "invalid" } },
    { ok: false, code: "NOT_FOUND", rawDatabaseError: "secret" },
    { ok: false, code: "UNRECOGNIZED" },
    null,
  ])("fails closed on malformed or overbroad RPC output (%j)", async (data) => {
    const c = client({ data });
    expect(await setOwnedProjectArchived(c.api, archive)).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
  });
  it("does not expose transport/database messages", async () => {
    const c = client({
      error: { message: "internal table and user secret", details: "sensitive" },
    });
    expect(await createOwnedProject(c.api, create)).toEqual({ ok: false, code: "UNAVAILABLE" });
  });
  it("validates extreme but safe lifecycle revision and exact profile limits", () => {
    expect(
      setOwnedProjectArchivedSchema.safeParse({
        ...archive,
        expectedRevision: Number.MAX_SAFE_INTEGER - 1,
      }).success,
    ).toBe(true);
    expect(
      createOwnedProjectSchema.safeParse({
        ...create,
        name: "x".repeat(200),
        description: "x".repeat(4000),
        audience: "x".repeat(2000),
        problem: "x".repeat(4000),
        link: "x".repeat(2048),
      }).success,
    ).toBe(true);
  });
});
