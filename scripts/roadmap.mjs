#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";

export const TASK_STATUSES = new Set([
  "complete",
  "not_started",
  "in_progress",
  "blocked",
  "deferred",
  "dropped",
]);
const DECISION_STATUSES = new Set(["pending", "approved", "rejected", "deferred"]);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim().length > 0;
const textList = (value) => Array.isArray(value) && value.every(isText);
const dateValue = (value) => (typeof value === "string" ? Date.parse(value) : NaN);

/** Report dependency cycles without assuming the registry has already passed validation. */
export function findCycles(tasks) {
  const byId = new Map(tasks.filter(isRecord).map((task) => [task.id, task]));
  const visited = new Set();
  const visiting = new Set();
  const path = [];
  const cycles = [];
  function visit(id) {
    if (visiting.has(id)) {
      cycles.push([...path.slice(path.indexOf(id)), id]);
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    path.push(id);
    const dependencies = byId.get(id).depends_on;
    for (const dependency of Array.isArray(dependencies) ? dependencies : []) visit(dependency);
    path.pop();
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  return cycles;
}

export function validateRegistry(registry, { now = Date.now() } = {}) {
  const errors = [];
  const warnings = [];
  if (!isRecord(registry)) return { errors: ["Registry must be an object"], warnings };
  if (registry.schema_version !== 1) errors.push("schema_version must be 1");
  if (!Number.isInteger(registry.iteration) || registry.iteration < 1)
    errors.push("iteration must be positive");
  if (!Number.isFinite(dateValue(registry.updated_at))) errors.push("updated_at must be a date");
  if (
    !Number.isInteger(registry.max_parallel_agents) ||
    registry.max_parallel_agents < 1 ||
    registry.max_parallel_agents > 3
  ) {
    errors.push("max_parallel_agents must be an integer from 1 to 3");
  }
  for (const field of ["phases", "decisions", "tasks", "legacy_audit", "backlog_audit"]) {
    if (!Array.isArray(registry[field])) errors.push(`${field} must be an array`);
  }
  const tasks = Array.isArray(registry.tasks) ? registry.tasks : [];
  const phases = Array.isArray(registry.phases) ? registry.phases : [];
  const decisions = Array.isArray(registry.decisions) ? registry.decisions : [];
  function uniqueIds(items, label, key = "id") {
    const ids = new Set();
    for (const item of items) {
      if (!isRecord(item) || !isText(item[key])) {
        errors.push(`${label} entry needs ${key}`);
        continue;
      }
      if (ids.has(item[key])) errors.push(`Duplicate ${label} ${item[key]}`);
      ids.add(item[key]);
    }
    return ids;
  }
  const taskIds = uniqueIds(tasks, "task");
  const phaseIds = uniqueIds(phases, "phase");
  const decisionIds = uniqueIds(decisions, "decision");
  if (!tasks.length) errors.push("tasks must contain at least one task");
  for (const phase of phases.filter(isRecord)) {
    for (const field of ["title", "purpose"])
      if (!isText(phase[field])) errors.push(`Phase ${phase.id}: ${field} is required`);
  }
  for (const decision of decisions.filter(isRecord)) {
    if (!DECISION_STATUSES.has(decision.status))
      errors.push(`Decision ${decision.id}: invalid status`);
    if (!taskIds.has(decision.owner_task))
      errors.push(`Decision ${decision.id}: unknown owner_task ${decision.owner_task}`);
  }
  for (const task of tasks.filter(isRecord)) {
    const label = `Task ${task.id}`;
    if (!/^[A-Z][A-Z0-9]*-\d{3}[a-z]?$/.test(task.id ?? "")) errors.push(`${label}: invalid id`);
    for (const field of ["title", "goal", "metric", "rollback", "kind", "verification_profile"]) {
      if (!isText(task[field])) errors.push(`${label}: ${field} is required`);
    }
    if (!phaseIds.has(task.phase)) errors.push(`${label}: unknown phase ${task.phase}`);
    if (!TASK_STATUSES.has(task.status)) errors.push(`${label}: invalid status ${task.status}`);
    if (!["agent", "human", "either"].includes(task.owner)) errors.push(`${label}: invalid owner`);
    if (!["S", "M", "L"].includes(task.size)) errors.push(`${label}: invalid size`);
    if (!Number.isFinite(task.priority)) errors.push(`${label}: priority must be a number`);
    for (const field of [
      "depends_on",
      "requires_decisions",
      "write_scope",
      "exclusive_locks",
      "read_first",
      "steps",
      "acceptance",
      "verification",
      "completion_evidence",
    ]) {
      if (!textList(task[field]))
        errors.push(`${label}: ${field} must be an array of nonempty strings`);
      else if (new Set(task[field]).size !== task[field].length)
        errors.push(`${label}: duplicate ${field} entries`);
    }
    for (const field of ["read_first", "steps", "acceptance", "verification"]) {
      if (Array.isArray(task[field]) && !task[field].length)
        errors.push(`${label}: ${field} cannot be empty`);
    }
    if (!Array.isArray(task.subtasks)) errors.push(`${label}: subtasks must be an array`);
    else {
      uniqueIds(task.subtasks, `${task.id} subtask`);
      if (Array.isArray(task.steps) && task.subtasks.length !== task.steps.length) {
        errors.push(`${label}: subtasks must correspond one-to-one with steps`);
      }
      task.subtasks.forEach((subtask, index) => {
        if (!isRecord(subtask)) return;
        if (subtask.id !== `${task.id}.s${index + 1}`)
          errors.push(`${label}: subtask ${index + 1} needs id ${task.id}.s${index + 1}`);
        if (!TASK_STATUSES.has(subtask.status))
          errors.push(`${label}: subtask ${subtask.id} has invalid status`);
        if (subtask.status === "in_progress" && !isRecord(task.claim))
          errors.push(`${label}: active subtask ${subtask.id} requires a parent claim`);
        if (!isText(subtask.instruction) || subtask.instruction !== task.steps?.[index])
          errors.push(`${label}: subtask ${subtask.id} instruction must match its immutable step`);
        if (
          !Array.isArray(subtask.notes) ||
          subtask.notes.some(
            (note) =>
              !isRecord(note) || !Number.isFinite(dateValue(note.date)) || !isText(note.text),
          )
        )
          errors.push(`${label}: subtask ${subtask.id} notes must contain dated text records`);
        if (task.status === "complete" && subtask.status !== "complete")
          errors.push(`${label}: completed parent has unfinished subtask ${subtask.id}`);
      });
    }
    for (const dependency of textList(task.depends_on) ? task.depends_on : []) {
      if (!taskIds.has(dependency)) errors.push(`${label}: unknown dependency ${dependency}`);
    }
    for (const decision of textList(task.requires_decisions) ? task.requires_decisions : []) {
      if (!decisionIds.has(decision)) errors.push(`${label}: unknown decision ${decision}`);
    }
    for (const scope of textList(task.write_scope) ? task.write_scope : []) {
      if (scope.startsWith("/") || scope.includes("\\") || scope.split("/").includes("..")) {
        errors.push(`${label}: write_scope must remain repository-relative: ${scope}`);
      }
    }
    for (const field of ["starting_point", "stop_and_report", "handoff"]) {
      if (!isText(task.agent_notes?.[field]))
        errors.push(`${label}: agent_notes.${field} is required`);
    }
    if (
      !Array.isArray(task.notes) ||
      task.notes.some(
        (note) => !isRecord(note) || !Number.isFinite(dateValue(note.date)) || !isText(note.text),
      )
    ) {
      errors.push(`${label}: notes must contain dated text records`);
    }
    if (task.status === "complete" && !task.completion_evidence?.length)
      errors.push(`${label}: completed tasks need completion_evidence`);
    if (!("claim" in task)) errors.push(`${label}: claim must be null or a claim object`);
    if (task.status === "in_progress" && !isRecord(task.claim))
      errors.push(`${label}: in_progress requires a claim`);
    if (task.claim !== null && task.claim !== undefined) {
      if (!isRecord(task.claim)) errors.push(`${label}: invalid claim`);
      else {
        for (const field of [
          "owner",
          "branch",
          "base_commit",
          "worktree",
          "started_at",
          "lease_expires_at",
        ]) {
          if (!isText(task.claim[field])) errors.push(`${label}: claim.${field} is required`);
        }
        const started = dateValue(task.claim.started_at);
        const expires = dateValue(task.claim.lease_expires_at);
        if (!Number.isFinite(started) || !Number.isFinite(expires) || expires <= started)
          errors.push(`${label}: claim timestamps must define a positive lease`);
        else if (expires <= now)
          warnings.push(
            `${label}: expired claim remains reserved; coordinator must inspect and explicitly release it`,
          );
        if (["complete", "dropped"].includes(task.status))
          errors.push(`${label}: release claim before terminal status`);
      }
    }
  }
  for (const cycle of findCycles(tasks)) errors.push(`Dependency cycle: ${cycle.join(" -> ")}`);
  const reservations = tasks.filter((task) => isRecord(task) && isRecord(task.claim));
  for (let i = 0; i < reservations.length; i++) {
    for (let j = i + 1; j < reservations.length; j++) {
      const left = reservations[i];
      const right = reservations[j];
      if (
        isText(left.claim.worktree) &&
        isText(right.claim.worktree) &&
        resolve(left.claim.worktree) === resolve(right.claim.worktree)
      ) {
        errors.push(
          `Active claims ${left.id} and ${right.id} share a worktree; use isolated checkouts`,
        );
      }
      if (
        isText(left.claim.branch) &&
        isText(right.claim.branch) &&
        left.claim.branch.trim().replace(/^refs\/heads\//, "") ===
          right.claim.branch.trim().replace(/^refs\/heads\//, "")
      ) {
        errors.push(
          `Active claims ${left.id} and ${right.id} share a branch; use distinct task branches`,
        );
      }
      if (
        textList(left.write_scope) &&
        textList(right.write_scope) &&
        textList(left.exclusive_locks) &&
        textList(right.exclusive_locks) &&
        tasksConflict(left, right)
      ) {
        errors.push(
          `Conflicting active claims: ${left.id} and ${right.id}; coordinator must reconcile reservations`,
        );
      }
    }
  }
  // A decision cannot be produced by work that itself waits on that decision.
  const byId = new Map(tasks.filter(isRecord).map((task) => [task.id, task]));
  const decisionsById = new Map(
    decisions.filter(isRecord).map((decision) => [decision.id, decision]),
  );
  for (const task of tasks.filter((task) => isRecord(task) && task.status === "complete")) {
    for (const id of textList(task.depends_on) ? task.depends_on : []) {
      if (byId.get(id)?.status !== "complete")
        errors.push(`Task ${task.id}: completed parent requires completed dependency ${id}`);
    }
    for (const id of textList(task.requires_decisions) ? task.requires_decisions : []) {
      if (decisionsById.get(id)?.status !== "approved")
        errors.push(`Task ${task.id}: completed parent requires approved decision ${id}`);
    }
  }
  for (const decision of decisions.filter(isRecord)) {
    const seen = new Set();
    const pending = [decision.owner_task];
    while (pending.length) {
      const id = pending.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const task = byId.get(id);
      if (!task) continue;
      if (Array.isArray(task.requires_decisions) && task.requires_decisions.includes(decision.id)) {
        errors.push(`Decision ${decision.id}: owner path waits on its own decision at ${id}`);
      }
      if (Array.isArray(task.depends_on)) pending.push(...task.depends_on);
    }
  }
  for (const field of ["legacy_audit", "backlog_audit"]) {
    const entries = Array.isArray(registry[field]) ? registry[field] : [];
    uniqueIds(entries, field, "legacy_id");
    for (const entry of entries.filter(isRecord)) {
      if (!isText(entry.disposition) || !isText(entry.reason))
        errors.push(`${field} ${entry.legacy_id}: disposition and reason are required`);
      if (!textList(entry.successors))
        errors.push(`${field} ${entry.legacy_id}: successors must be a string array`);
      else
        for (const id of entry.successors)
          if (!taskIds.has(id)) errors.push(`${field} ${entry.legacy_id}: unknown successor ${id}`);
    }
  }
  for (const [inventoryField, auditField] of [
    ["legacy_inventory", "legacy_audit"],
    ["backlog_inventory", "backlog_audit"],
  ]) {
    if (!(inventoryField in registry)) continue;
    const inventory = registry[inventoryField];
    if (!textList(inventory)) errors.push(`${inventoryField} must be an array of nonempty strings`);
    else {
      if (new Set(inventory).size !== inventory.length)
        errors.push(`${inventoryField} contains duplicate ids`);
      const entries = Array.isArray(registry[auditField]) ? registry[auditField] : [];
      const represented = new Set(entries.filter(isRecord).map((entry) => entry.legacy_id));
      for (const id of inventory)
        if (!represented.has(id)) errors.push(`${auditField}: missing inventory id ${id}`);
      for (const id of represented)
        if (!inventory.includes(id)) errors.push(`${auditField}: unexpected inventory id ${id}`);
    }
  }
  return { errors, warnings };
}

function scopePrefix(scope) {
  const normalized = posix.normalize(scope).replace(/\/+$/, "");
  const wildcard = normalized.search(/[*?[{]/);
  return {
    prefix: normalized === "." ? "" : wildcard < 0 ? normalized : normalized.slice(0, wildcard),
    glob: wildcard >= 0,
  };
}

/** Conservative static-prefix matching: false positives are safer than concurrent writes. */
export function scopesConflict(left, right) {
  const a = scopePrefix(left);
  const b = scopePrefix(right);
  if (!a.prefix || !b.prefix) return true;
  if (a.glob && b.glob) return a.prefix.startsWith(b.prefix) || b.prefix.startsWith(a.prefix);
  if (a.glob) return b.prefix.startsWith(a.prefix) || a.prefix.startsWith(`${b.prefix}/`);
  if (b.glob) return a.prefix.startsWith(b.prefix) || b.prefix.startsWith(`${a.prefix}/`);
  return (
    a.prefix === b.prefix ||
    a.prefix.startsWith(`${b.prefix}/`) ||
    b.prefix.startsWith(`${a.prefix}/`)
  );
}

export function tasksConflict(left, right) {
  if ((left.exclusive_locks ?? []).some((lock) => (right.exclusive_locks ?? []).includes(lock)))
    return true;
  return (left.write_scope ?? []).some((a) =>
    (right.write_scope ?? []).some((b) => scopesConflict(a, b)),
  );
}

export function getReadyTasks(registry, { now = Date.now() } = {}) {
  const validation = validateRegistry(registry, { now });
  if (validation.errors.length)
    return { ...validation, ready: [], human_ready: [], wave: [], active: [], blocked: [] };
  const tasks = new Map(registry.tasks.map((task) => [task.id, task]));
  const decisions = new Map(registry.decisions.map((decision) => [decision.id, decision]));
  const active = registry.tasks.filter(
    (task) => task.claim !== null || task.status === "in_progress",
  );
  const capacity = Math.max(
    0,
    registry.max_parallel_agents - active.filter((task) => task.owner !== "human").length,
  );
  const ready = [];
  const humanReady = [];
  const blocked = [];
  const ordered = [...registry.tasks].sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  );
  for (const task of ordered) {
    if (["complete", "dropped"].includes(task.status)) continue;
    const reasons = [];
    if (task.status !== "not_started") reasons.push(`status is ${task.status}`);
    if (task.claim !== null) reasons.push("claim is reserved until explicitly released");
    for (const id of task.depends_on)
      if (tasks.get(id).status !== "complete")
        reasons.push(`dependency ${id} is ${tasks.get(id).status}`);
    for (const id of task.requires_decisions)
      if (decisions.get(id).status !== "approved")
        reasons.push(`decision ${id} is ${decisions.get(id).status}`);
    for (const other of active)
      if (task.id !== other.id && tasksConflict(task, other))
        reasons.push(`conflicts with reserved task ${other.id}`);
    if (reasons.length) blocked.push({ id: task.id, reasons });
    else (task.owner === "human" ? humanReady : ready).push(task.id);
  }
  const wave = [];
  for (const id of ready) {
    if (wave.length >= capacity) break;
    if (wave.every((other) => !tasksConflict(tasks.get(id), tasks.get(other)))) wave.push(id);
  }
  return {
    ...validation,
    ready,
    human_ready: humanReady,
    wave,
    capacity,
    active: active.map((task) => ({
      id: task.id,
      owner: task.claim?.owner ?? null,
      expired: dateValue(task.claim?.lease_expires_at) <= now,
    })),
    blocked,
  };
}

const cell = (value) =>
  String(value).replaceAll("\\", "\\\\").replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
const list = (values) => (values.length ? values.map(cell).join(", ") : "—");
const scopeSummary = (values) =>
  list(values.slice(0, 3)) +
  (values.length > 3 ? ` (${values.length - 3} more; inspect --task)` : "");

export function renderTaskIndex(registry) {
  const lines = [
    "# Task index",
    "",
    "Generated by `node scripts/roadmap.mjs --render` from [tasks.json](tasks.json). Edit the registry, then regenerate.",
    "",
    "Status and completion evidence are registry records; this renderer does not independently verify implementation.",
    "",
  ];
  for (const phase of registry.phases) {
    lines.push(
      `## ${cell(phase.id)} — ${cell(phase.title)}`,
      "",
      phase.purpose,
      "",
      "| Task | Status | Subtasks complete | Owner | Size | Dependencies | Decisions | Write scope / locks |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const task of registry.tasks.filter((task) => task.phase === phase.id)) {
      lines.push(
        `| ${cell(task.id)} ${cell(task.title)} | ${task.status} | ${task.subtasks.filter((subtask) => subtask.status === "complete").length}/${task.subtasks.length} | ${task.owner} | ${task.size} | ${list(task.depends_on)} | ${list(task.requires_decisions)} | ${scopeSummary(task.write_scope)}; locks: ${list(task.exclusive_locks)} |`,
      );
    }
    lines.push("");
  }
  lines.push(
    "Inspect a complete brief with `node scripts/roadmap.mjs --task ID`. Readiness is advisory: the coordinator must record a claim and recheck the registry before dispatch.",
    "",
  );
  return lines.join("\n");
}

export function renderLegacyAudit(registry) {
  const lines = [
    "# Legacy and backlog reconciliation",
    "",
    "Generated from [tasks.json](tasks.json). Historical notes remain in [the history file](../../FEATUREROADMAP_history.md).",
    "",
  ];
  for (const [field, title] of [
    ["legacy_audit", "Legacy tasks"],
    ["backlog_audit", "Seed backlog"],
  ]) {
    lines.push(
      `## ${title}`,
      "",
      "| ID | Disposition | Successors | Reason |",
      "| --- | --- | --- | --- |",
    );
    for (const entry of registry[field])
      lines.push(
        `| ${cell(entry.legacy_id)} | ${cell(entry.disposition)} | ${list(entry.successors)} | ${cell(entry.reason)} |`,
      );
    lines.push("");
  }
  return lines.join("\n");
}

export function renderTask(task) {
  const lines = [
    `# ${task.id}: ${task.title}`,
    "",
    `Status: ${task.status} · owner: ${task.owner} · size: ${task.size} · phase: ${task.phase}`,
    "",
    task.goal,
    "",
  ];
  for (const [label, values] of [
    ["Dependencies", task.depends_on],
    ["Required decisions", task.requires_decisions],
    ["Read first", task.read_first],
    ["Write scope", task.write_scope],
    ["Exclusive locks", task.exclusive_locks],
    ["Steps", task.steps],
    ["Acceptance", task.acceptance],
    ["Verification", task.verification],
    ["Completion evidence", task.completion_evidence],
  ]) {
    lines.push(
      `## ${label}`,
      "",
      ...(values.length ? values.map((value) => `- ${value}`) : ["None."]),
      "",
    );
  }
  lines.push(
    "## Subtask progress",
    "",
    ...task.subtasks.flatMap((subtask) => [
      `- ${subtask.id} [${subtask.status}]: ${subtask.instruction}`,
      ...subtask.notes.map((note) => `  - ${note.date}: ${note.text}`),
    ]),
    "",
  );
  lines.push(`Metric: ${task.metric}`, "", `Rollback: ${task.rollback}`, "", "## Agent notes", "");
  for (const [key, value] of Object.entries(task.agent_notes)) lines.push(`- ${key}: ${value}`);
  lines.push(
    "",
    "## Notes",
    "",
    ...task.notes.map((note) => `- ${note.date}: ${note.text}`),
    "",
    "Claim: " + JSON.stringify(task.claim),
    "",
  );
  return lines.join("\n");
}

async function main(args) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let registryPath = resolve(root, "docs/roadmap/tasks.json");
  let command;
  let taskId;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") json = true;
    else if (arg === "--registry" && args[i + 1]) registryPath = resolve(args[++i]);
    else if (["--check", "--ready", "--render", "--task"].includes(arg) && !command) {
      command = arg;
      if (arg === "--task") taskId = args[++i];
    } else throw new Error(`Unknown or conflicting argument: ${arg}`);
  }
  if (!command || (command === "--task" && !taskId))
    throw new Error(
      "Usage: node scripts/roadmap.mjs --check | --ready [--json] | --task ID [--json] | --render [--registry PATH]",
    );
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const result = validateRegistry(registry);
  if (result.errors.length) {
    if (json) console.log(JSON.stringify(result, null, 2));
    else for (const error of result.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }
  if (command !== "--ready" && !json)
    for (const warning of result.warnings) console.error(`WARNING: ${warning}`);
  if (command === "--check")
    console.log(
      json
        ? JSON.stringify(result, null, 2)
        : `Registry valid: ${registry.tasks.length} tasks; dependency and decision paths checked. ${result.warnings.length} warning(s).`,
    );
  if (command === "--ready") {
    const readiness = getReadyTasks(registry);
    if (json) console.log(JSON.stringify(readiness, null, 2));
    else {
      console.log(
        `Agent-ready: ${readiness.ready.join(", ") || "none"}\nHuman-ready: ${readiness.human_ready.join(", ") || "none"}\nSuggested wave (${readiness.capacity} available slots): ${readiness.wave.join(", ") || "none"}\nReserved: ${readiness.active.map((task) => task.id + (task.expired ? " (expired; inspect before release)" : "")).join(", ") || "none"}\nRead-only suggestion; claim and recheck before dispatch.`,
      );
      for (const warning of readiness.warnings) console.error(`WARNING: ${warning}`);
    }
  }
  if (command === "--task") {
    const task = registry.tasks.find((entry) => entry.id === taskId);
    if (!task) throw new Error(`Unknown task: ${taskId}`);
    console.log(json ? JSON.stringify(task, null, 2) : renderTask(task));
  }
  if (command === "--render") {
    const destination = dirname(registryPath);
    await mkdir(destination, { recursive: true });
    await writeFile(resolve(destination, "task-index.md"), renderTaskIndex(registry));
    await writeFile(resolve(destination, "legacy-audit.md"), renderLegacyAudit(registry));
    console.log(`Rendered task-index.md and legacy-audit.md beside ${registryPath}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
