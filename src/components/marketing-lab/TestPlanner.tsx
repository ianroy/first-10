import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/AppShell";
import { type MarketingPlanV1, type MarketingTask } from "@/lib/marketing-plan";
import { measurementLabels, parseManualCount } from "@/lib/marketing-metrics";
import { dependencyError, previewTestState, taskStatusError } from "@/lib/marketing-planning";
const selectClass = "min-h-11 w-full rounded-lg border bg-background px-3 text-sm";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
const stateLabels = {
  draft: "Draft",
  ready_to_review: "Ready to review",
  running: "Running — manually started",
  reviewed: "Reviewed",
};
export function TestPlanner({
  plan,
  update,
}: {
  plan: MarketingPlanV1;
  update: (mutate: (next: MarketingPlanV1) => void) => void;
}) {
  const [error, setError] = useState("");
  const setTask = (id: string, patch: Partial<MarketingTask>) =>
    update((next) => {
      const row = next.test.tasks.find((t) => t.id === id);
      if (row) Object.assign(row, patch);
    });
  const knownMinutes = plan.test.tasks.reduce((total, t) => total + (t.estimatedMinutes ?? 0), 0);
  const unknownMinutes = plan.test.tasks.filter((t) => t.estimatedMinutes === null).length;
  function changeState(state: MarketingPlanV1["test"]["state"]) {
    const result = previewTestState(plan, state);
    if (!result.ok) {
      setError(result.errors.join(" "));
      return;
    }
    setError("");
    update((next) => {
      next.test = result.plan.test;
    });
  }
  return (
    <>
      <Card>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Plan → act → observe → decide
        </p>
        <h3 className="mt-2 text-2xl font-bold">A one-week test with a real limit</h3>
        <p className="mt-3 text-sm text-muted-foreground">
          You run the test yourself. Status is your own record, not verified participation. Nothing
          is published, scheduled or tracked automatically. Save draft to preserve changes.
        </p>
        <div className="mt-5 rounded-xl bg-secondary p-4">
          <Field label="Test status">
            <select
              className={selectClass}
              value={plan.test.state}
              onChange={(e) => changeState(e.target.value as MarketingPlanV1["test"]["state"])}
            >
              {Object.entries(stateLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <p className="mt-2 text-sm">
            Ready requires the planning fields below, two chosen channels and a primary asset.
            Running also needs permission and the content review/walkthrough in Make content.
            Reviewed needs your reflection in Review learning.
          </p>
          {plan.test.startedAt && (
            <p className="mt-2 text-xs">
              First manual start: {new Date(plan.test.startedAt).toLocaleString()}. Retained if you
              return to draft.
            </p>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="my-4 rounded-xl bg-destructive-soft p-3 text-sm text-destructive-soft-foreground"
          >
            {error} Your existing entries are unchanged.
          </p>
        )}
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {(
            [
              ["startOn", "Start date"],
              ["endOn", "End date"],
              ["reviewOn", "Review date"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                type="date"
                value={plan.test[key] ?? ""}
                onChange={(e) =>
                  update((n) => {
                    n.test[key] = e.target.value || null;
                  })
                }
              />
            </Field>
          ))}
          <Field label="Available time (minutes; blank means unknown)">
            <Input
              type="number"
              min={0}
              max={10080}
              step={1}
              value={plan.resources.availableMinutes ?? ""}
              onChange={(e) => {
                const value = parseManualCount(e.target.value);
                if (value !== undefined && (value === null || value <= 10080))
                  update((n) => {
                    n.resources.availableMinutes = value;
                  });
              }}
            />
          </Field>
          <Field label="Cash budget">
            <Input value="$0 — time and resources still matter" readOnly />
          </Field>
          <Field label="AI resources">
            <select
              className={selectClass}
              value={plan.resources.aiUse}
              onChange={(e) =>
                update((n) => {
                  n.resources.aiUse = e.target.value as MarketingPlanV1["resources"]["aiUse"];
                })
              }
            >
              <option value="manual_only">Manual only</option>
              <option value="existing_allowance">Existing allowance, if available</option>
            </select>
          </Field>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Choose seven inclusive calendar days; review on or after the end date. $0 cash does not
          mean unlimited time or free AI.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Field label="Primary useful action">
            <Textarea
              maxLength={500}
              value={plan.audience.usefulAction}
              onChange={(e) =>
                update((next) => {
                  next.audience.usefulAction = e.target.value;
                })
              }
            />
          </Field>
          {(
            [
              ["existingResources", "Resources you already have (one per line)"],
              ["limitations", "Resource limits (one per line)"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <Textarea
                value={plan.resources[key].join("\n")}
                maxLength={2407}
                onChange={(e) =>
                  update((n) => {
                    n.resources[key] = e.target.value.split("\n");
                  })
                }
              />
            </Field>
          ))}
          <Field label="Primary metric">
            <select
              className={selectClass}
              value={plan.test.primaryMetric}
              onChange={(e) =>
                update((n) => {
                  n.test.primaryMetric = e.target.value as MarketingPlanV1["test"]["primaryMetric"];
                  n.test.baselineMeasurementId = null;
                })
              }
            >
              {Object.entries(measurementLabels).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Baseline observation">
            <select
              className={selectClass}
              value={plan.test.baselineMeasurementId ?? ""}
              onChange={(e) =>
                update((n) => {
                  n.test.baselineMeasurementId = e.target.value || null;
                })
              }
            >
              <option value="">Unknown / not selected</option>
              {plan.measurements
                .filter((m) => m.metric === plan.test.primaryMetric)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.cohort} · {m.from} to {m.to} · {m.count ?? "unknown"} ·{" "}
                    {m.source || "source not recorded"}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Target count (blank means unknown)">
            <Input
              type="number"
              min={0}
              max={1000000000}
              step={1}
              value={plan.test.target ?? ""}
              onChange={(e) => {
                const value = parseManualCount(e.target.value);
                if (value !== undefined)
                  update((n) => {
                    n.test.target = value;
                  });
              }}
            />
          </Field>
          <Field label="Fallback if access, time or tools fail">
            <Textarea
              maxLength={500}
              value={plan.resources.fallback}
              onChange={(e) =>
                update((n) => {
                  n.resources.fallback = e.target.value;
                })
              }
            />
          </Field>
          {(
            [
              ["measurementPlan", "How will you observe the primary metric?"],
              ["unknownBaselineOrTarget", "What baseline or target is still unknown?"],
              ["repeatIf", "Repeat if…"],
              ["reviseIf", "Revise if…"],
              ["stopIf", "Stop if…"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <Textarea
                maxLength={500}
                value={plan.test[key]}
                onChange={(e) =>
                  update((n) => {
                    n.test[key] = e.target.value;
                  })
                }
              />
            </Field>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Add a dated baseline under Review learning → Manual measurements. An unknown count remains
          unknown; a target is a proposed threshold, never an observed result.
        </p>
      </Card>
      <Card>
        <h3 className="text-xl font-bold">Who will do what, and what comes first?</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Known task estimates total {knownMinutes} minutes; {unknownMinutes} estimates remain
          unknown.{" "}
          {plan.resources.availableMinutes !== null &&
          knownMinutes > plan.resources.availableMinutes
            ? "This already exceeds your time limit: reduce scope or revise the limit."
            : ""}
        </p>
      </Card>
      {plan.test.tasks.map((item, index) => (
        <Card key={item.id}>
          <h3 className="mb-4 text-lg font-bold">Action {index + 1}</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {(
              [
                ["title", "Action", 120],
                ["ownerLabel", "Owner or role", 120],
                ["doneMeans", "What counts as done?", 500],
                ["completionNote", "What actually happened?", 500],
              ] as const
            ).map(([key, label, max]) => (
              <Field key={key} label={`Action ${index + 1}: ${label}`}>
                <Input
                  maxLength={max}
                  value={item[key]}
                  onChange={(e) => setTask(item.id, { [key]: e.target.value })}
                />
              </Field>
            ))}
            <Field label={`Action ${index + 1}: Due date`}>
              <Input
                type="date"
                value={item.dueOn ?? ""}
                onChange={(e) => setTask(item.id, { dueOn: e.target.value || null })}
              />
            </Field>
            <Field label={`Action ${index + 1}: Estimated minutes`}>
              <Input
                type="number"
                min={0}
                max={10080}
                step={1}
                value={item.estimatedMinutes ?? ""}
                onChange={(e) => {
                  const value = parseManualCount(e.target.value);
                  if (value !== undefined && (value === null || value <= 10080))
                    setTask(item.id, { estimatedMinutes: value });
                }}
              />
            </Field>
            <Field label={`Action ${index + 1}: Type`}>
              <select
                className={selectClass}
                value={item.kind}
                onChange={(e) =>
                  setTask(item.id, { kind: e.target.value as MarketingTask["kind"] })
                }
              >
                {[
                  "investigate",
                  "permission",
                  "make",
                  "peer_check",
                  "manual_outreach",
                  "observe",
                  "reflect",
                ].map((v) => (
                  <option key={v} value={v}>
                    {v.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Action ${index + 1}: Status`}>
              <select
                className={selectClass}
                value={item.status}
                onChange={(e) => {
                  const status = e.target.value as MarketingTask["status"];
                  const issue = taskStatusError(item, plan.test.tasks, status);
                  setError(issue ?? "");
                  if (!issue) setTask(item.id, { status });
                }}
              >
                {["todo", "doing", "done", "blocked"].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Action ${index + 1}: Channel`}>
              <select
                className={selectClass}
                value={item.channelId ?? ""}
                onChange={(e) =>
                  setTask(item.id, { channelId: e.target.value || null, assetId: null })
                }
              >
                <option value="">No specific channel</option>
                {plan.channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || "Unnamed channel"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Action ${index + 1}: Content draft`}>
              <select
                className={selectClass}
                value={item.assetId ?? ""}
                onChange={(e) => setTask(item.id, { assetId: e.target.value || null })}
              >
                <option value="">No specific draft</option>
                {plan.assets
                  .filter((a) => a.channelId === item.channelId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.ownHook || "Untitled draft"}
                    </option>
                  ))}
              </select>
            </Field>
            <fieldset className="lg:col-span-2">
              <legend className="mb-2 text-sm font-semibold">
                Action {index + 1}: Prerequisites
              </legend>
              {plan.test.tasks.length === 1 && (
                <p className="text-sm text-muted-foreground">
                  Add another action to define a prerequisite.
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                {plan.test.tasks
                  .filter((t) => t.id !== item.id)
                  .map((other) => (
                    <label
                      key={other.id}
                      className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={item.dependsOn.includes(other.id)}
                        onChange={(e) => {
                          const deps = e.target.checked
                            ? [...item.dependsOn, other.id]
                            : item.dependsOn.filter((id) => id !== other.id);
                          const issue =
                            dependencyError(plan.test.tasks, item.id, deps) ??
                            taskStatusError(
                              { ...item, dependsOn: deps },
                              plan.test.tasks,
                              item.status,
                            );
                          setError(issue ?? "");
                          if (!issue) setTask(item.id, { dependsOn: deps });
                        }}
                      />
                      {other.title || "Untitled action"} · {other.status}
                    </label>
                  ))}
              </div>
            </fieldset>
          </div>
        </Card>
      ))}
      <Button
        variant="outline"
        disabled={plan.test.tasks.length >= 24}
        onClick={() =>
          update((n) => {
            n.test.tasks.push({
              id: crypto.randomUUID(),
              channelId: null,
              assetId: null,
              kind: "investigate",
              title: "",
              ownerLabel: "",
              dueOn: null,
              dependsOn: [],
              doneMeans: "",
              estimatedMinutes: null,
              status: "todo",
              completionNote: "",
            });
          })
        }
      >
        Add an action
      </Button>
    </>
  );
}
