/** Safe messages shared by stale-tab writers. Never render raw database details. */
export function workspaceWriteError(
  error: unknown,
  fallback = "The change could not be saved. Your local edits remain here; retry or export them before leaving.",
): string {
  const value = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  if (value["code"] === "ARCHIVED" || value["message"] === "WORKSPACE_ARCHIVED")
    return "This idea is archived. Your local edits remain here. Export them before leaving, then restore the idea in Account & saved work to continue editing.";
  if (
    value["code"] === "BUSY" ||
    value["code"] === "55P03" ||
    value["code"] === "40P01" ||
    value["message"] === "WORKSPACE_BUSY"
  )
    return "Another save or archive change is finishing. Your local edits remain here; retry after it finishes.";
  return fallback;
}
