import { marketingPlanSchema, type MarketingPlanV1, type MarketingTask } from "./marketing-plan";

export function dependencyError(
  tasks: MarketingTask[],
  taskId: string,
  dependencies: string[],
): string | null {
  const ids = new Set(tasks.map((task) => task.id));
  if (dependencies.some((id) => !ids.has(id))) return "A prerequisite no longer exists.";
  if (dependencies.includes(taskId)) return "An action cannot depend on itself.";
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    const deps =
      id === taskId ? dependencies : (tasks.find((task) => task.id === id)?.dependsOn ?? []);
    for (const dep of deps) if (!ids.has(dep) || !visit(dep)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  return tasks.every((task) => visit(task.id))
    ? null
    : "That prerequisite would create a dependency cycle.";
}
export function taskStatusError(
  task: MarketingTask,
  tasks: MarketingTask[],
  status: MarketingTask["status"],
): string | null {
  if (
    status !== "done" &&
    task.status === "done" &&
    tasks.some(
      (other) => other.dependsOn.includes(task.id) && ["doing", "done"].includes(other.status),
    )
  )
    return "Move dependent actions back to todo or blocked before reopening this prerequisite.";
  if (
    ["doing", "done"].includes(status) &&
    task.dependsOn.some((id) => tasks.find((t) => t.id === id)?.status !== "done")
  )
    return "Finish the prerequisite actions first, or record this action as blocked.";
  if (status === "done" && (!task.doneMeans.trim() || !task.completionNote.trim()))
    return "Record what counts as done and what actually happened before marking done.";
  return null;
}
export function previewTestState(
  plan: MarketingPlanV1,
  state: MarketingPlanV1["test"]["state"],
  now = new Date().toISOString(),
): { ok: true; plan: MarketingPlanV1 } | { ok: false; errors: string[] } {
  const next = structuredClone(plan);
  next.test.state = state;
  if (state === "running" && !next.test.startedAt) next.test.startedAt = now;
  const parsed = marketingPlanSchema.safeParse(next);
  return parsed.success
    ? { ok: true, plan: next }
    : { ok: false, errors: [...new Set(parsed.error.issues.map((issue) => issue.message))] };
}

/** Editing the text/destination or its access basis requires a fresh human launch check. */
export function invalidateChangedLaunchReviews(
  previous: MarketingPlanV1,
  next: MarketingPlanV1,
): void {
  for (const asset of next.assets) {
    const old = previous.assets.find((item) => item.id === asset.id);
    if (!old) continue;
    const fields = [
      "format",
      "ownHook",
      "truthfulSupport",
      "body",
      "builderDisclosure",
      "cta",
      "destinationUrl",
      "firstUsefulAction",
      "channelId",
    ] as const;
    const oldAccess = previous.channels.find((channel) => channel.id === old.channelId)?.access;
    const newAccess = next.channels.find((channel) => channel.id === asset.channelId)?.access;
    if (
      fields.some((key) => old[key] !== asset[key]) ||
      JSON.stringify(oldAccess) !== JSON.stringify(newAccess)
    ) {
      asset.review = {
        truthful: false,
        disclosedBuilder: false,
        accessChecked: false,
        destinationChecked: false,
        checkedAt: null,
      };
    }
  }
}
