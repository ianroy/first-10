import { expect, it } from "vitest";
import { listResultSchema } from "@/lib/context/contracts";
import { publicContextActivities } from "@/lib/export/public-context-adapters";
import { activityExportSchema } from "@/lib/export/activity";
const project = {
  id: "fa190000-0000-4000-8000-000000000010",
  user_id: "fictional-owner",
  checklist: { demo: { fictional: true } },
};
function fixture(text = "A public author claim; no customer evidence.") {
  const source = {
    url: "https://example.org/",
    title: "Fictional public reference",
    format: "plain_text",
    contentHash: "a".repeat(64),
    previewHash: "b".repeat(64),
    bytes: new TextEncoder().encode(text).length,
    commitSha: null,
    path: null,
    blobSha: null,
  };
  return listResultSchema.parse({
    ok: true,
    previews: [
      {
        id: "fa190000-0000-4000-8000-000000000020",
        projectId: project.id,
        operationId: "fa190000-0000-4000-8000-000000000021",
        previewPermission: true,
        kind: "website",
        retrievedAt: "2026-10-18T20:00:00Z",
        expiresAt: "2026-10-18T20:15:00Z",
        source: { ...source, text },
      },
    ],
    reviewed: [
      {
        id: "fa190000-0000-4000-8000-000000000030",
        previewId: "fa190000-0000-4000-8000-000000000031",
        projectId: project.id,
        reviewedAt: "2026-10-18T20:01:00Z",
        revision: 1,
        status: "active",
        label: "A reviewed claim",
        excerpt: "Selected unverified claim.",
        excerptHash: "c".repeat(64),
        storagePermission: "own_or_permitted",
        aiPermission: "unknown",
        sharingPermission: "unknown",
        source,
      },
      {
        id: "fa190000-0000-4000-8000-000000000040",
        previewId: "fa190000-0000-4000-8000-000000000041",
        projectId: project.id,
        reviewedAt: "2026-10-18T20:02:00Z",
        revision: 2,
        status: "withdrawn",
      },
    ],
  });
}
it("preserves the whole long preview and distinguishes review from evidence or processing permission", () => {
  const text = "Fictional reference. ".repeat(1100) + "END_OF_AUTHORIZED_REFERENCE";
  const offers = publicContextActivities(project, fixture(text));
  const doc = activityExportSchema.parse({
    schemaVersion: 1,
    title: "Public reference reviews",
    capturedAt: "2026-10-18T20:05:00Z",
    activities: offers.map((offer) => offer.activity),
  });
  const parts = doc.activities[0]!.sections.filter((s) =>
    s.title.startsWith("Source text"),
  ).flatMap((s) =>
    s.blocks.flatMap((b) => (b.type === "fields" ? b.fields.map((f) => f.value) : [])),
  );
  expect(parts.join("")).toBe(text);
  expect(doc.activities.every((a) => a.fictional)).toBe(true);
  expect(JSON.stringify(doc)).toContain("not customer evidence");
  expect(JSON.stringify(doc)).toContain("unknown");
  expect(doc.activities[1]!.status).toBe("reviewed");
  expect(JSON.stringify(doc.activities[2])).not.toContain("example.org");
  expect(JSON.stringify(doc.activities[2])).not.toContain("Selected unverified claim");
});
it("rejects partial acquisition and mismatched preview or review scopes", () => {
  expect(() => publicContextActivities(project, { ok: false, code: "UNAVAILABLE" })).toThrow();
  const context = fixture();
  if (!context.ok) throw new Error();
  context.previews[0]!.projectId = "fa190000-0000-4000-8000-000000000099";
  expect(() => publicContextActivities(project, context)).toThrow("another project");
  context.previews = [];
  context.reviewed[0]!.projectId = "fa190000-0000-4000-8000-000000000099";
  expect(() => publicContextActivities(project, context)).toThrow("another project");
});
it("exports unsaved review thinking without attesting it or enabling AI", () => {
  const context = fixture();
  if (!context.ok) throw new Error();
  const draft = {
    previewId: context.previews[0]!.id,
    label: "My draft",
    excerpt: "Edited, not yet checked",
    read: true,
    permitted: false,
  };
  const offer = publicContextActivities(project, context, draft)[0]!;
  expect(offer.activity.status).toBe("draft");
  expect(JSON.stringify(offer)).toContain("does not save or attest");
  expect(() =>
    publicContextActivities(project, context, { ...draft, previewId: "unknown" }),
  ).toThrow("authorized preview");
});
