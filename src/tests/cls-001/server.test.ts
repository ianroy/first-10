import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  response: vi.fn(),
  getUser: vi.fn(),
  header: vi.fn(),
  headers: { authorization: "Bearer fixture.token" } as Record<string, string>,
  middlewareError: null as Error | null,
}));
const actor = "f1000000-0000-4000-8000-000000000001";
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: () => ({}) }),
  createServerFn: () => ({
    middleware: () => ({
      inputValidator: (validate: (v: unknown) => unknown) => ({
        handler:
          (fn: (arg: unknown) => unknown) =>
          async ({ data }: { data: unknown }) => {
            if (h.middlewareError) throw h.middlewareError;
            return fn({
              data: validate(data),
              context: {
                userId: "f1000000-0000-4000-8000-000000000001",
                supabase: { auth: { getUser: h.getUser }, rpc: h.rpc },
              },
            });
          },
      }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://fixture.invalid", { headers: h.headers }),
  setResponseHeader: h.header,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import * as classes from "@/lib/classes.functions";
import {
  createInvitation,
  acceptInvitation,
  listClassInvitations,
  revokeClassInvitation,
} from "@/lib/invitations.functions";
import { classDetailSchema, classDocumentSchema } from "@/lib/classes";
import { takeScopedInvitationFragment } from "@/components/invitations/contracts";
const id = "fc010000-0000-4000-8000-000000000001";
const resource = "fc010000-0000-4000-8000-000000000002";
const document = {
  name: "Test class",
  mode: "class" as const,
  instructions: "Reviewed instructions",
  accessExpiresAt: "2026-11-18T12:00:00Z",
  retentionDays: 120,
};
const summary = {
  ...document,
  id,
  aiEnabled: false,
  archivedAt: null,
  revision: 1,
  role: "owner",
  updatedAt: "2026-10-18T12:00:00Z",
};
const member = {
  id: resource,
  classId: id,
  displayLabel: "Alias",
  role: "teacher",
  state: "active",
  revision: 1,
};
const assignment = {
  id: resource,
  classId: id,
  title: "Five conversations",
  instructions: "Test a hypothesis",
  dueAt: null,
  state: "published" as const,
  revision: 1,
  updatedAt: summary.updatedAt,
};
const mutation = { classId: id, requestId: resource, expectedRevision: 1 };
const metadata = {
  id: resource,
  classId: id,
  recipientId: resource,
  role: "student",
  expiresAt: document.accessExpiresAt,
  createdAt: summary.updatedAt,
  revokedAt: null,
  acceptedAt: null,
};
type Call = (input: { data: never }) => Promise<unknown>;
const call = (fn: unknown, data: unknown) => (fn as Call)({ data: data as never });
beforeEach(() => {
  vi.clearAllMocks();
  h.headers = { authorization: "Bearer fixture.token" };
  h.middlewareError = null;
  h.getUser.mockResolvedValue({ error: null, data: { user: { id: actor } } });
  h.rpc.mockReturnValue({ abortSignal: h.response });
  h.response.mockResolvedValue({ error: null, data: { ok: false, code: "NOT_FOUND" } });
});
describe("closed authenticated class API", () => {
  it.each([
    [
      classes.createClass,
      { classId: id, requestId: resource, document },
      "create_class",
      { p_class_id: id, p_request_id: resource, p_document: document },
      summary,
    ],
    [
      classes.updateClass,
      { ...mutation, document },
      "update_class",
      { p_class_id: id, p_request_id: resource, p_expected_revision: 1, p_document: document },
      summary,
    ],
    [
      classes.setClassArchived,
      { ...mutation, archived: true },
      "set_class_archived",
      { p_class_id: id, p_request_id: resource, p_expected_revision: 1, p_archived: true },
      summary,
    ],
    [
      classes.grantClassTeacher,
      { ...mutation, targetUserId: resource, displayLabel: "Alias" },
      "set_class_teacher",
      {
        p_class_id: id,
        p_request_id: resource,
        p_expected_revision: 1,
        p_target_user_id: resource,
        p_active: true,
        p_display_label: "Alias",
      },
      member,
    ],
    [
      classes.revokeClassTeacher,
      { ...mutation, membershipId: resource },
      "revoke_class_teacher",
      { p_class_id: id, p_request_id: resource, p_expected_revision: 1, p_membership_id: resource },
      member,
    ],
    [
      classes.removeStudent,
      { ...mutation, membershipId: resource },
      "remove_class_student",
      { p_class_id: id, p_request_id: resource, p_expected_revision: 1, p_membership_id: resource },
      member,
    ],
    [
      classes.leaveClass,
      mutation,
      "leave_class",
      { p_class_id: id, p_request_id: resource, p_expected_revision: 1 },
      member,
    ],
    [
      classes.saveAssignment,
      {
        ...mutation,
        assignmentId: resource,
        document: {
          title: assignment.title,
          instructions: assignment.instructions,
          dueAt: null,
          state: "published",
        },
      },
      "save_class_assignment",
      {
        p_class_id: id,
        p_request_id: resource,
        p_expected_revision: 1,
        p_assignment_id: resource,
        p_document: {
          title: assignment.title,
          instructions: assignment.instructions,
          dueAt: null,
          state: "published",
        },
      },
      assignment,
    ],
    [
      classes.associateClassProject,
      { ...mutation, projectId: resource },
      "associate_class_project",
      { p_class_id: id, p_request_id: resource, p_expected_revision: 1, p_project_id: resource },
      { id: resource, projectId: resource, active: true, revision: 1 },
    ],
    [
      classes.getClass,
      { classId: id },
      "get_class",
      { p_class_id: id },
      { ...summary, enrollment: null, projectAssociation: null },
    ],
    [
      classes.listMyClasses,
      {},
      "list_my_classes",
      { p_cursor: null },
      { items: [summary], nextCursor: null },
    ],
    [
      classes.listAssignments,
      { classId: id },
      "list_class_assignments",
      { p_class_id: id, p_cursor: null },
      { items: [assignment], nextCursor: null },
    ],
    [
      classes.listClassMembers,
      { classId: id, cursor: resource },
      "list_class_members",
      { p_class_id: id, p_cursor: resource },
      { items: [member], nextCursor: null },
    ],
  ])(
    "maps a fixed operation with fresh actor and bounded output (%s)",
    async (fn, input, rpc, args, data) => {
      h.response.mockResolvedValue({ error: null, data: { ok: true, data } });
      expect(await call(fn, input)).toEqual({ ok: true, data });
      expect(h.getUser).toHaveBeenCalledWith("fixture.token");
      expect(h.rpc).toHaveBeenCalledExactlyOnceWith(rpc, args);
      expect(h.response).toHaveBeenCalledWith(expect.any(AbortSignal));
    },
  );
  it.each([
    { ...mutation, document, ownerId: actor },
    { ...mutation, document: { ...document, aiEnabled: true } },
    { ...mutation, document: { ...document, retentionDays: 0 } },
    { ...mutation, document: { ...document, mode: "admin" } },
    { ...mutation, document, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...mutation, document, expectedRevision: -1 },
  ])("rejects forged or invalid mutations before any database call", async (data) => {
    expect(await call(classes.updateClass, data)).toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each([null, { id: resource }])(
    "rejects missing or switched fresh identity (%j)",
    async (user) => {
      h.getUser.mockResolvedValue({ error: null, data: { user } });
      expect(await classes.getClass({ data: { classId: id } })).toEqual({
        ok: false,
        code: "AUTH_REQUIRED",
      });
      expect(h.rpc).not.toHaveBeenCalled();
    },
  );
  it("does not allow absent bearer credentials or oversized bodies", async () => {
    h.headers = {};
    expect(await classes.getClass({ data: { classId: id } })).toEqual({
      ok: false,
      code: "AUTH_REQUIRED",
    });
    h.headers = { authorization: "Bearer fixture.token", "content-length": "65537" };
    expect(await classes.getClass({ data: { classId: id } })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { ...summary, enrollment: null, projectAssociation: null, userId: actor },
    {
      ...summary,
      role: "teacher",
      enrollment: member,
      projectAssociation: { id: resource, projectId: id, active: true, revision: 1 },
    },
    {
      ...summary,
      role: "student",
      enrollment: { ...member, role: "student", state: "removed" },
      projectAssociation: null,
    },
    { ...summary, aiEnabled: true, enrollment: null, projectAssociation: null },
  ])("fails closed on overbroad or contradictory class DTOs", async (data) => {
    expect(classDetailSchema.safeParse(data).success).toBe(false);
    h.response.mockResolvedValue({ error: null, data: { ok: true, data } });
    expect(await classes.getClass({ data: { classId: id } })).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
  });
  it("accepts terminal revision to revoke but reports revision exhaustion without leaking DB details", async () => {
    h.response.mockResolvedValue({ error: null, data: { ok: false, code: "REVISION_EXHAUSTED" } });
    expect(
      await classes.leaveClass({
        data: { ...mutation, expectedRevision: Number.MAX_SAFE_INTEGER },
      }),
    ).toEqual({ ok: false, code: "REVISION_EXHAUSTED" });
    h.response.mockRejectedValue(new Error("private postgres SQL parameters"));
    expect(await classes.leaveClass({ data: mutation })).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
    h.middlewareError = new Error("Unauthorized: secret");
    expect(await classes.getClass({ data: { classId: id } })).toEqual({
      ok: false,
      code: "AUTH_REQUIRED",
    });
  });
  it("class documents never imply AI consent or guest entry", () => {
    expect(classDocumentSchema.safeParse({ ...document, guestAccess: true }).success).toBe(false);
    expect(classDocumentSchema.safeParse({ ...document, aiEnabled: true }).success).toBe(false);
  });
});
describe("actual class invitation dispatch", () => {
  it("uses real class recipient-only RPC and strict class projection", async () => {
    h.response.mockResolvedValue({
      error: null,
      data: { ok: true, data: metadata, token: "a".repeat(64), replayed: false },
    });
    expect(
      await createInvitation({
        data: {
          targetType: "class",
          targetId: id,
          requestId: resource,
          recipientId: resource,
          role: "student",
        },
      }),
    ).toMatchObject({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith("create_class_invitation", {
      p_class_id: id,
      p_recipient_id: resource,
      p_days: 7,
      p_request_id: resource,
    });
    expect(h.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(h.header).toHaveBeenCalledWith("Referrer-Policy", "no-referrer");
    expect(h.header).toHaveBeenCalledWith("X-Robots-Tag", "noindex, nofollow");
  });
  it("requires chosen alias and never accepts a caller-supplied teacher role", async () => {
    const valid = { targetType: "class", token: "a".repeat(64), displayLabel: " Chosen alias " };
    expect(await call(acceptInvitation, { ...valid, role: "teacher" })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(await call(acceptInvitation, { targetType: "class", token: valid.token })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(h.rpc).not.toHaveBeenCalled();
    h.response.mockResolvedValue({
      error: null,
      data: {
        ok: true,
        data: {
          invitationId: resource,
          classId: id,
          role: "student",
          membershipRevision: 1,
        },
      },
    });
    expect(await call(acceptInvitation, valid)).toMatchObject({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith("accept_class_invitation", {
      p_token: valid.token,
      p_display_label: "Chosen alias",
    });
  });
  it("lists and revokes class metadata without using any project target", async () => {
    h.response.mockResolvedValueOnce({
      error: null,
      data: { ok: true, data: { items: [metadata], nextCursor: null } },
    });
    expect(await listClassInvitations({ data: { classId: id } })).toMatchObject({ ok: true });
    expect(h.rpc).toHaveBeenLastCalledWith("list_class_invitations", {
      p_class_id: id,
      p_cursor: null,
    });
    h.response.mockResolvedValueOnce({ error: null, data: { ok: true, data: metadata } });
    expect(
      await revokeClassInvitation({
        data: { classId: id, invitationId: resource, requestId: resource },
      }),
    ).toMatchObject({ ok: true });
    expect(h.rpc).toHaveBeenLastCalledWith("revoke_class_invitation", {
      p_class_id: id,
      p_invitation_id: resource,
      p_request_id: resource,
    });
  });
  it.each(["invite", "class-invite"])(
    "strips typed secret before any auth or request (%s)",
    (name) => {
      const replaceState = vi.fn();
      expect(
        takeScopedInvitationFragment(
          { pathname: "/invite", search: "?token=untrusted", hash: `#${name}=${"a".repeat(64)}` },
          { replaceState },
        ),
      ).toEqual({ targetType: name === "invite" ? "project" : "class", token: "a".repeat(64) });
      expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, "", "/invite");
    },
  );
  it.each(["", "#class-invite=bad", `#class-invite=${"a".repeat(64)}&role=teacher`])(
    "rejects ambiguous fragment without query fallback",
    (hash) => {
      const replaceState = vi.fn();
      expect(
        takeScopedInvitationFragment(
          { pathname: "/invite", search: `?token=${"a".repeat(64)}`, hash },
          { replaceState },
        ),
      ).toBeNull();
      expect(replaceState).toHaveBeenCalledWith(null, "", "/invite");
    },
  );
});
