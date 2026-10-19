import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const admin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-auth.server", () => ({ requirePlatformAdmin: admin }));
import { requireAIReadinessViewer } from "@/lib/ai/readiness-access.server";
const actor = "f1d00000-0000-4000-8000-000000000001";
const project = "f1d00000-0000-4000-8000-000000000010";
const fixture = "first-ten-babson-2026-10-18-v1";
const getUser = vi.fn();
const abortSignal = vi.fn();
const from = vi.fn();
const select = vi.fn();
const eq = vi.fn();
const active = vi.fn();
const client = { auth: { getUser }, from } as unknown as SupabaseClient;
beforeEach(() => {
  vi.resetAllMocks();
  admin.mockRejectedValue(new Error("No platform grant"));
  getUser.mockResolvedValue({
    error: null,
    data: {
      user: {
        id: actor,
        app_metadata: {
          synthetic: true,
          firstten_demo_admin: true,
          firstten_demo_fixture: fixture,
        },
      },
    },
  });
  const query = { select, eq, is: active, abortSignal: () => query, maybeSingle: abortSignal };
  from.mockReturnValue(query);
  select.mockReturnValue(query);
  eq.mockReturnValue(query);
  active.mockReturnValue(query);
  abortSignal.mockResolvedValue({
    error: null,
    data: {
      id: project,
      user_id: actor,
      demo: {
        fictional: true,
        fixtureVersion: fixture,
      },
    },
  });
});
it("permits only the exact active fictional fixture without granting or claiming a platform role", async () => {
  await expect(requireAIReadinessViewer(client, "Bearer fictional", project)).resolves.toEqual({
    userId: actor,
    kind: "fictional_presenter",
  });
  expect(admin).not.toHaveBeenCalled();
  expect(from).toHaveBeenCalledExactlyOnceWith("projects");
  expect(select).toHaveBeenCalledExactlyOnceWith("id,user_id,demo:checklist->demo");
  expect(eq.mock.calls).toEqual([
    ["id", project],
    ["user_id", actor],
  ]);
  expect(active).toHaveBeenCalledExactlyOnceWith("archived_at", null);
});
it.each([
  {},
  { synthetic: true },
  { synthetic: true, firstten_demo_admin: true, firstten_demo_fixture: "foreign" },
])("rejects missing or changed trusted fixture markers", async (app_metadata) => {
  getUser.mockResolvedValue({ error: null, data: { user: { id: actor, app_metadata } } });
  await expect(requireAIReadinessViewer(client, "Bearer fictional", project)).rejects.toThrow();
  expect(from).not.toHaveBeenCalled();
});
it.each([
  null,
  { id: project, user_id: "other", demo: { fictional: true, fixtureVersion: fixture } },
  { id: project, user_id: actor, demo: { fictional: false, fixtureVersion: fixture } },
])("denies missing, archived, foreign or non-fictional selected fixture", async (data) => {
  abortSignal.mockResolvedValue({ error: null, data });
  await expect(requireAIReadinessViewer(client, "Bearer fictional", project)).rejects.toThrow();
});
it("does not use editable user metadata as trusted authority", async () => {
  getUser.mockResolvedValue({
    error: null,
    data: {
      user: {
        id: actor,
        app_metadata: {},
        user_metadata: {
          synthetic: true,
          firstten_demo_admin: true,
          firstten_demo_fixture: fixture,
        },
      },
    },
  });
  await expect(requireAIReadinessViewer(client, "Bearer fictional", project)).rejects.toThrow();
});
it("requires real platform authority for another project or another synthetic user", async () => {
  await expect(
    requireAIReadinessViewer(client, "Bearer fictional", "00000000-0000-4000-8000-000000000001"),
  ).rejects.toThrow("No platform grant");
  expect(from).not.toHaveBeenCalled();
  getUser.mockResolvedValue({
    error: null,
    data: {
      user: {
        id: "other",
        app_metadata: {
          synthetic: true,
          firstten_demo_admin: true,
          firstten_demo_fixture: fixture,
        },
      },
    },
  });
  await expect(requireAIReadinessViewer(client, "Bearer fictional", project)).rejects.toThrow(
    "No platform grant",
  );
  expect(from).not.toHaveBeenCalled();
});
