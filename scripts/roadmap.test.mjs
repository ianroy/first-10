import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  validateRegistry,
  findCycles,
  scopesConflict,
  tasksConflict,
  getReadyTasks,
  renderTaskIndex,
  renderLegacyAudit,
  renderTask,
} from "./roadmap.mjs";

const now = Date.parse("2026-10-17T15:00:00Z");
const claim = (overrides = {}) => ({
  owner: "agent-a",
  branch: "codex/test",
  base_commit: "abc123",
  worktree: "/tmp/test-worktree",
  started_at: "2026-10-17T14:00:00Z",
  lease_expires_at: "2026-10-17T16:00:00Z",
  ...overrides,
});
function task(id, overrides = {}) {
  const value = {
    id,
    title: `Task ${id}`,
    phase: "P0",
    status: "not_started",
    owner: "agent",
    size: "S",
    kind: "implementation",
    priority: 50,
    depends_on: [],
    requires_decisions: [],
    write_scope: [`src/${id}.ts`],
    exclusive_locks: [],
    read_first: ["ProductSpec.md"],
    goal: "A useful result",
    steps: ["Inspect the contract", "Implement the behavior"],
    acceptance: ["Behavior is observable"],
    verification_profile: "product",
    verification: ["Run the focused check"],
    metric: "Errors",
    rollback: "Disable the feature",
    agent_notes: {
      starting_point: "Existing implementation",
      stop_and_report: "Report missing contracts",
      handoff: "Record exact checks",
    },
    notes: [],
    claim: null,
    completion_evidence: [],
    ...overrides,
  };
  if (!("subtasks" in overrides))
    value.subtasks = value.steps.map((instruction, index) => ({
      id: `${id}.s${index + 1}`,
      status: value.status,
      instruction,
      notes: [],
    }));
  return value;
}
function registry(tasks, overrides = {}) {
  return {
    schema_version: 1,
    iteration: 5,
    updated_at: "2026-10-17",
    max_parallel_agents: 3,
    phases: [{ id: "P0", title: "Foundation", purpose: "Safe execution" }],
    decisions: [],
    tasks,
    legacy_audit: [],
    backlog_audit: [],
    ...overrides,
  };
}

test("historical tasks may have no write scope, locks, dependencies or notes, but require evidence", () => {
  const historical = task("OLD-001", {
    status: "complete",
    kind: "history",
    write_scope: [],
    completion_evidence: ["history.md"],
  });
  assert.deepEqual(validateRegistry(registry([historical]), { now }).errors, []);
  historical.completion_evidence = [];
  assert.match(
    validateRegistry(registry([historical]), { now }).errors.join("\n"),
    /completed tasks need completion_evidence/,
  );
});

test("missing and duplicate task IDs fail closed", () => {
  const data = registry([task("A-001", { depends_on: ["NO-001"] }), task("A-001")]);
  const result = validateRegistry(data, { now });
  assert.match(result.errors.join("\n"), /Duplicate task A-001/);
  assert.match(result.errors.join("\n"), /unknown dependency NO-001/);
  assert.deepEqual(getReadyTasks(data, { now }).wave, []);
});

test("subtask progress cannot fabricate parent completion or drift from execution instructions", () => {
  const finished = task("A-001", { status: "complete", completion_evidence: ["proof"] });
  finished.subtasks[0].status = "not_started";
  assert.match(
    validateRegistry(registry([finished]), { now }).errors.join("\n"),
    /completed parent has unfinished subtask/,
  );
  const invalid = task("B-001");
  invalid.subtasks[1].id = invalid.subtasks[0].id;
  invalid.subtasks[1].status = "made_up";
  invalid.subtasks[1].instruction = "A different instruction";
  const errors = validateRegistry(registry([invalid]), { now }).errors.join("\n");
  assert.match(errors, /Duplicate B-001 subtask/);
  assert.match(errors, /invalid status/);
  assert.match(errors, /instruction must match/);
  const unclaimed = task("D-001");
  unclaimed.subtasks[0].status = "in_progress";
  assert.match(
    validateRegistry(registry([unclaimed]), { now }).errors.join("\n"),
    /requires a parent claim/,
  );
  assert.match(
    validateRegistry(registry([task("C-001", { subtasks: undefined })]), { now }).errors.join("\n"),
    /subtasks must be an array/,
  );
});

test("inventory coverage prevents silently losing historical and backlog tasks", () => {
  for (const [inventoryField, auditField] of [
    ["legacy_inventory", "legacy_audit"],
    ["backlog_inventory", "backlog_audit"],
  ]) {
    const data = registry([task("A-001")], {
      [inventoryField]: ["OLD-001"],
      [auditField]: [
        {
          legacy_id: "EXTRA-001",
          disposition: "deferred",
          successors: [],
          reason: "Wait for evidence",
        },
      ],
    });
    const errors = validateRegistry(data, { now }).errors.join("\n");
    assert.match(errors, /missing inventory id OLD-001/);
    assert.match(errors, /unexpected inventory id EXTRA-001/);
    data[auditField][0].legacy_id = "OLD-001";
    assert.deepEqual(validateRegistry(data, { now }).errors, []);
  }
});

test("cycles are detected, including a self dependency", () => {
  assert.deepEqual(
    findCycles([
      task("A-001", { depends_on: ["B-001"] }),
      task("B-001", { depends_on: ["A-001"] }),
    ]),
    [["A-001", "B-001", "A-001"]],
  );
  assert.match(
    validateRegistry(registry([task("A-001", { depends_on: ["A-001"] })]), { now }).errors.join(
      "\n",
    ),
    /Dependency cycle/,
  );
});

test("dependencies require completion; dropped, blocked and deferred do not unlock work", () => {
  for (const status of ["not_started", "blocked", "deferred", "dropped"]) {
    const result = getReadyTasks(
      registry([task("A-001", { status }), task("B-001", { depends_on: ["A-001"] })]),
      { now },
    );
    assert.ok(!result.ready.includes("B-001"), status);
  }
  assert.deepEqual(
    getReadyTasks(
      registry([
        task("A-001", { status: "complete", completion_evidence: ["proof"] }),
        task("B-001", { depends_on: ["A-001"] }),
      ]),
      { now },
    ).wave,
    ["B-001"],
  );
});

test("pending/rejected decisions block work and approval unlocks it", () => {
  for (const status of ["pending", "rejected", "deferred", "approved"]) {
    const data = registry(
      [
        task("DEC-001", { status: "complete", completion_evidence: ["decision.md"] }),
        task("RT-001", { requires_decisions: ["realtime_go"] }),
      ],
      { decisions: [{ id: "realtime_go", status, owner_task: "DEC-001" }] },
    );
    assert.equal(getReadyTasks(data, { now }).ready.includes("RT-001"), status === "approved");
  }
});

test("completed work cannot bypass unfinished dependencies or unapproved decisions", () => {
  const data = registry(
    [
      task("A-001"),
      task("B-001", {
        status: "complete",
        completion_evidence: ["proof"],
        depends_on: ["A-001"],
        requires_decisions: ["go"],
      }),
    ],
    { decisions: [{ id: "go", status: "pending", owner_task: "A-001" }] },
  );
  const errors = validateRegistry(data, { now }).errors.join("\n");
  assert.match(errors, /requires completed dependency A-001/);
  assert.match(errors, /requires approved decision go/);
  data.tasks[0] = task("A-001", { status: "complete", completion_evidence: ["decision-proof"] });
  data.decisions[0].status = "approved";
  assert.deepEqual(validateRegistry(data, { now }).errors, []);
});

test("unknown decisions and indirect self-gating decision paths are rejected", () => {
  assert.match(
    validateRegistry(registry([task("A-001", { requires_decisions: ["missing"] })]), {
      now,
    }).errors.join("\n"),
    /unknown decision/,
  );
  const data = registry(
    [task("A-001", { depends_on: ["B-001"] }), task("B-001", { requires_decisions: ["go"] })],
    { decisions: [{ id: "go", status: "pending", owner_task: "A-001" }] },
  );
  assert.match(
    validateRegistry(data, { now }).errors.join("\n"),
    /owner path waits on its own decision/,
  );
});

test("scope comparison conservatively reserves glob prefixes without confusing siblings", () => {
  for (const [left, right] of [
    ["src/**", "src/lib/a.ts"],
    ["src/lib/*.ts", "src/lib/nested/b.ts"],
    ["src/lib/data*.ts", "src/lib/data.test.ts"],
    ["src/lib", "src/lib/a.ts"],
    ["**", "README.md"],
    ["./src/lib/", "src/lib/a.ts"],
  ]) {
    assert.equal(scopesConflict(left, right), true, `${left} / ${right}`);
    assert.equal(scopesConflict(right, left), true);
  }
  assert.equal(scopesConflict("src/lib/data.ts", "src/lib/data.test.ts"), false);
  assert.equal(scopesConflict("src/lib", "src/library/a.ts"), false);
  assert.equal(scopesConflict("docs/a/**", "docs/b/**"), false);
  assert.equal(scopesConflict("src//lib/./**", "src/lib/a.ts"), true);
  assert.equal(
    tasksConflict(
      task("A-001", { exclusive_locks: ["schema"] }),
      task("B-001", { exclusive_locks: ["schema"] }),
    ),
    true,
  );
});

test("dispatch chooses at most three non-overlapping agent tasks in priority order", () => {
  const result = getReadyTasks(
    registry([
      task("A-001", { priority: 1, write_scope: ["src/shared/**"] }),
      task("B-001", { priority: 2, write_scope: ["src/shared/a.ts"] }),
      task("C-001", { priority: 3 }),
      task("D-001", { priority: 4 }),
      task("E-001", { priority: 5 }),
      task("H-001", { owner: "human", priority: 0 }),
    ]),
    { now },
  );
  assert.deepEqual(result.wave, ["A-001", "C-001", "D-001"]);
  assert.deepEqual(result.human_ready, ["H-001"]);
  assert.ok(result.ready.includes("B-001")); // Ready on its own, not safe in this wave.
});

test("active claims reserve locks, paths and concurrency slots", () => {
  const data = registry([
    task("A-001", {
      status: "in_progress",
      claim: claim(),
      write_scope: ["src/shared/**"],
      exclusive_locks: ["schema"],
    }),
    task("B-001", { write_scope: ["src/shared/a.ts"] }),
    task("C-001", { exclusive_locks: ["schema"] }),
    task("D-001"),
    task("E-001"),
    task("F-001"),
  ]);
  const result = getReadyTasks(data, { now });
  assert.deepEqual(result.wave, ["D-001", "E-001"]);
  assert.equal(result.capacity, 2);
  assert.ok(
    result.blocked
      .find((entry) => entry.id === "B-001")
      .reasons.some((reason) => reason.includes("reserved task A-001")),
  );
});

test("expired and pre-dispatch claims remain reserved until explicitly released", () => {
  const data = registry([
    task("A-001", {
      claim: claim({ lease_expires_at: "2026-10-17T14:30:00Z" }),
      write_scope: ["src/shared/**"],
    }),
    task("B-001", { write_scope: ["src/shared/a.ts"] }),
    task("C-001"),
  ]);
  const before = JSON.stringify(data);
  const result = getReadyTasks(data, { now });
  assert.deepEqual(result.wave, ["C-001"]);
  assert.equal(result.active[0].expired, true);
  assert.match(result.warnings.join("\n"), /expired claim remains reserved/);
  assert.equal(JSON.stringify(data), before);
});

test("conflicting reservations stop further dispatch rather than legitimizing the overlap", () => {
  const data = registry([
    task("A-001", { claim: claim(), exclusive_locks: ["schema"] }),
    task("B-001", { claim: claim({ owner: "agent-b" }), exclusive_locks: ["schema"] }),
    task("C-001"),
  ]);
  const result = getReadyTasks(data, { now });
  assert.match(result.errors.join("\n"), /Conflicting active claims/);
  assert.deepEqual(result.wave, []);
});

test("in-progress tasks need complete, ordered claims and terminal tasks cannot retain claims", () => {
  for (const override of [
    { status: "in_progress" },
    { claim: { owner: "agent" } },
    { claim: claim({ lease_expires_at: "2026-10-17T13:00:00Z" }) },
    { status: "complete", completion_evidence: ["proof"], claim: claim() },
  ]) {
    assert.ok(validateRegistry(registry([task("A-001", override)]), { now }).errors.length);
  }
});

test("disjoint writers still need distinct worktrees and branches", () => {
  const make = (second) =>
    registry([
      task("A-001", { claim: claim() }),
      task("B-001", { claim: claim({ owner: "agent-b", ...second }) }),
      task("C-001"),
    ]);
  const sharedWorktree = getReadyTasks(
    make({ branch: "codex/second", worktree: "/tmp/test-worktree/./" }),
    { now },
  );
  assert.match(sharedWorktree.errors.join("\n"), /share a worktree/);
  assert.deepEqual(sharedWorktree.wave, []);
  const sharedBranch = getReadyTasks(
    make({ branch: "refs/heads/codex/test", worktree: "/tmp/second-worktree" }),
    { now },
  );
  assert.match(sharedBranch.errors.join("\n"), /share a branch/);
  assert.deepEqual(sharedBranch.wave, []);
  const isolated = getReadyTasks(
    make({ branch: "codex/second", worktree: "/tmp/second-worktree" }),
    { now },
  );
  assert.deepEqual(isolated.errors, []);
  assert.deepEqual(isolated.wave, ["C-001"]);
});

test("required briefs, bounded concurrency, tenant-safe paths and audit successors are checked", () => {
  const data = registry(
    [task("A-001", { steps: [], rollback: "", write_scope: ["../outside"], agent_notes: {} })],
    {
      max_parallel_agents: 4,
      legacy_audit: [
        {
          legacy_id: "OLD-001",
          disposition: "split",
          successors: ["MISSING-001"],
          reason: "New work",
        },
      ],
    },
  );
  const errors = validateRegistry(data, { now }).errors.join("\n");
  for (const pattern of [
    /steps cannot be empty/,
    /rollback is required/,
    /repository-relative/,
    /agent_notes.handoff/,
    /max_parallel_agents/,
    /unknown successor/,
  ])
    assert.match(errors, pattern);
});

test("renderers escape table cells and retain task/audit references", () => {
  const data = registry([task("A-001", { title: "Read | write" })], {
    legacy_audit: [
      {
        legacy_id: "OLD-001",
        disposition: "split",
        successors: ["A-001"],
        reason: "Keep history | narrow work",
      },
    ],
  });
  assert.match(renderTaskIndex(data), /Read \\\| write/);
  assert.match(renderLegacyAudit(data), /OLD-001/);
  assert.match(renderLegacyAudit(data), /Keep history \\\| narrow work/);
});

test("index summarizes wide scopes while the task brief retains every path", () => {
  const item = task("A-001", {
    write_scope: ["one.ts", "two.ts", "three.ts", "four.ts", "five.ts"],
  });
  const index = renderTaskIndex(registry([item]));
  assert.match(index, /one.ts, two.ts, three.ts \(2 more; inspect --task\)/);
  assert.ok(!index.includes("four.ts"));
  assert.match(renderTask(item), /four.ts/);
  assert.match(renderTask(item), /five.ts/);
});

test("CLI checks, emits machine-readable readiness, renders beside fixture and refuses bad graphs", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "first-ten-roadmap-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = join(directory, "tasks.json");
  const script = fileURLToPath(new URL("./roadmap.mjs", import.meta.url));
  await writeFile(filename, JSON.stringify(registry([task("A-001")])));
  const invoke = (...args) =>
    spawnSync(process.execPath, [script, ...args, "--registry", filename], { encoding: "utf8" });
  assert.equal(invoke("--check").status, 0);
  const ready = invoke("--ready", "--json");
  assert.equal(ready.status, 0, ready.stderr);
  assert.deepEqual(JSON.parse(ready.stdout).wave, ["A-001"]);
  assert.equal(JSON.parse(invoke("--task", "A-001", "--json").stdout).id, "A-001");
  assert.equal(invoke("--render").status, 0);
  assert.match(await readFile(join(directory, "task-index.md"), "utf8"), /A-001/);
  assert.equal(invoke("--task", "MISSING-001").status, 1);
  await writeFile(
    filename,
    JSON.stringify(registry([task("A-001", { depends_on: ["MISSING-001"] })])),
  );
  const bad = invoke("--ready", "--json");
  assert.equal(bad.status, 1);
  assert.match(JSON.parse(bad.stdout).errors.join("\n"), /unknown dependency/);
});
