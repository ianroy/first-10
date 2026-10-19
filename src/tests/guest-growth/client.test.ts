import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
const h = vi.hoisted(() => ({
  list: vi.fn(),
  load: vi.fn(),
  history: vi.fn(),
  save: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock("@/lib/guest-growth.functions", () => ({
  listGuestGrowth: h.list,
  loadGuestGrowth: h.load,
  historyGuestGrowth: h.history,
  saveGuestGrowth: h.save,
  authorizeGuestGrowthExport: h.authorize,
}));
import { createGuestGrowthPorts } from "@/lib/guest-growth/client";
import { growthRecordHash, canonicalGrowthJson } from "@/lib/guest-growth/transport";
import { createEmptyGuestGrowth } from "@/lib/guest-growth/contracts";
import { records, scope, csrf, id } from "./fixture";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
  h.authorize.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllGlobals());
it("forwards the unchanged mutation/CAS envelope without inventing an actor or retry ID", async () => {
  const input = {
    csrf,
    artifactId: id(987),
    audience: "principal_private" as const,
    expectedRevision: 0,
    mutationId: id(986),
    sharedAudienceConfirmed: false,
    document: createEmptyGuestGrowth("learning"),
  };
  const ports = createGuestGrowthPorts();
  await ports.save(input);
  await ports.save(input);
  expect(h.save.mock.calls).toEqual([[{ data: input }], [{ data: input }]]);
});
it("sends hashes and necessary identities only, excluding all unsaved private document text", async () => {
  const record = records()[0]!;
  await createGuestGrowthPorts().authorizeExport({
    csrf,
    scope,
    sources: [
      {
        state: "saved",
        record,
        localDocument: { ...record.document, title: "PRIVATE_LOCAL_OVERLAY" },
      },
      {
        state: "draft",
        localDraftId: id(985),
        document: { ...createEmptyGuestGrowth("learning"), title: "PRIVATE_NEW_DRAFT" },
      },
    ],
  });
  const sent = h.authorize.mock.calls[0]![0].data;
  expect(sent.sources).toEqual([
    {
      state: "saved",
      artifactId: record.id,
      revision: 2,
      kind: record.kind,
      audience: record.audience,
      authorPrincipalId: record.authorPrincipalId,
      recordHash: await growthRecordHash(record),
    },
    { state: "draft", localDraftId: id(985), kind: "learning" },
  ]);
  expect(sent.scope).toMatchObject({
    classId: scope.classId,
    teamId: scope.teamId,
    principalId: scope.principalId,
    accessExpiresAt: scope.accessExpiresAt,
  });
  expect(JSON.stringify(sent)).not.toMatch(
    /PRIVATE_LOCAL_OVERLAY|PRIVATE_NEW_DRAFT|OBSERVATION_SUMMARY|Fictional growth workshop|Fictional Élodie/,
  );
});
it("requires a fresh strict affirmative export receipt on every generation/delivery check", async () => {
  const ports = createGuestGrowthPorts(),
    input = { csrf, scope, sources: [{ state: "saved" as const, record: records()[0]! }] };
  await ports.authorizeExport(input);
  await ports.authorizeExport(input);
  expect(h.authorize).toHaveBeenCalledTimes(2);
  h.authorize.mockResolvedValue({ ok: false, code: "CHANGED" });
  await expect(ports.authorizeExport(input)).rejects.toThrow("could not be confirmed");
  h.authorize.mockResolvedValue({ ok: true, privateNotes: "unexpected" });
  await expect(ports.authorizeExport(input)).rejects.toThrow("could not be confirmed");
});
it("canonicalizes object key order but preserves ordered content and null versus zero", async () => {
  expect(canonicalGrowthJson({ b: 0, a: null })).toBe(canonicalGrowthJson({ a: null, b: 0 }));
  expect(await growthRecordHash({ b: 0, a: null })).toBe(await growthRecordHash({ a: null, b: 0 }));
  expect(await growthRecordHash({ a: [0, null] })).not.toBe(
    await growthRecordHash({ a: [null, 0] }),
  );
});
