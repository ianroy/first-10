import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { ACTIVITY_EXPORT_COVERAGE, PENDING_EXPORT_CAPABILITIES } from "@/lib/export/coverage";
import * as core from "@/lib/export/adapters";
import * as plans from "@/lib/export/plan-adapters";
import * as demos from "@/lib/export/demo-adapters";
import * as discovery from "@/lib/export/discovery-adapters";
import * as drafts from "@/lib/export/interview-draft-adapters";
import * as publicContext from "@/lib/export/public-context-adapters";
import * as guestMarketing from "@/lib/guest-marketing/pdf-adapters";
import * as marketingHandoff from "@/lib/guest-marketing/handoff/pdf-adapters";
import * as guestGrowth from "@/lib/guest-growth/pdf";
import * as guest from "@/lib/export/guest-activity-adapters";
import * as submissions from "@/lib/export/submission-adapters";
it("binds every mounted activity inventory entry to a real pure adapter and source mount", () => {
  const adapters = {
    ...core,
    ...plans,
    ...demos,
    ...discovery,
    ...drafts,
    ...publicContext,
    ...submissions,
    ...guest,
    ...guestMarketing,
    ...marketingHandoff,
    ...guestGrowth,
  };
  expect(new Set(ACTIVITY_EXPORT_COVERAGE.map((r) => r.id)).size).toBe(
    ACTIVITY_EXPORT_COVERAGE.length,
  );
  for (const row of ACTIVITY_EXPORT_COVERAGE) {
    expect(typeof adapters[row.adapter], row.id).toBe("function");
    if (row.status === "mounted") {
      const source = readFileSync(row.source, "utf8");
      expect(source, row.id).toContain(`${row.adapter}(`);
      expect(source, row.id).toMatch(
        /<(OwnerActivityExport|ActivityExportLauncher|ActivityPdfExport|GuestActivityExport)/,
      );
    }
  }
  expect(ACTIVITY_EXPORT_COVERAGE.map((r) => r.id)).toEqual(
    expect.arrayContaining([
      "idea",
      "interview-draft",
      "interview-records",
      "outreach-drafts",
      "manual-metrics",
      "marketing",
      "teacher-plan",
      "authored-teams",
      "saved-portfolio",
    ]),
  );
  expect(PENDING_EXPORT_CAPABILITIES.join("\n")).toContain("Teacher-authorized");
});
