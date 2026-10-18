import { describe, expect, it } from "vitest";
import { workspaceWriteError } from "@/lib/write-errors";

describe("workspace write recovery", () => {
  it("explains restoring an archive without discarding unsaved work", () => {
    expect(workspaceWriteError({ code: "PT409", message: "WORKSPACE_ARCHIVED" })).toMatch(
      /restore.*Account/i,
    );
    expect(workspaceWriteError({ code: "ARCHIVED" })).toMatch(/local edits remain/i);
  });
  it("distinguishes competing writes from a permanent archive", () => {
    expect(workspaceWriteError({ code: "PT409", message: "WORKSPACE_BUSY" })).toMatch(/retry/i);
    expect(workspaceWriteError({ code: "55P03" })).not.toMatch(/Restore/);
  });
  it("does not expose database detail or private values", () => {
    const error = {
      code: "XX000",
      message: "secret SQL private participant",
      detail: "raw private note",
    };
    expect(workspaceWriteError(error)).not.toMatch(/secret|participant|SQL|private note/);
    expect(workspaceWriteError(error, "Keep your draft and retry.")).toBe(
      "Keep your draft and retry.",
    );
  });
});
