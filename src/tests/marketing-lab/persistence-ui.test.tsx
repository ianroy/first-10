import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyMarketingPlan, type MarketingPlanV1 } from "@/lib/marketing-plan";
import { planningFixture } from "./planning-fixture";
import type { Project } from "@/lib/data";

const gateway = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/marketing.functions", () => ({
  loadMarketingPlan: gateway.load,
  saveMarketingPlan: gateway.save,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/demo">{children}</a>,
  useBlocker: vi.fn(() => ({ status: "idle", proceed: vi.fn(), reset: vi.fn() })),
}));
import { SavedMarketingLab } from "@/components/marketing/SavedMarketingLab";

const project: Project = {
  id: "f4000000-0000-4000-8000-000000000010",
  user_id: "f4000000-0000-4000-8000-000000000001",
  name: "Fictional project",
  description: "",
  audience: "",
  problem: "",
  link: "",
  stage: 2,
  questions: [],
  questions_origin_id: null,
  survey_origin_id: null,
  survey: [],
  checklist: {},
  updated_at: "2026-10-18T00:00:00Z",
  created_at: "2026-10-18T12:00:00Z",
};
function completed(): MarketingPlanV1 {
  const plan = createEmptyMarketingPlan();
  plan.studentFirst = {
    columns: [],
    notes: [
      { id: "f4000000-0000-4000-8000-000000000020", columnId: null, text: "Original observation" },
    ],
    audience: "Initial audience",
    usefulAction: "Try one interview",
    channelIdeas: ["Campus club"],
    completedAt: "2026-10-18T12:00:00Z",
  };
  return plan;
}
function loaded(
  document: MarketingPlanV1 | null = completed(),
  extra: Record<string, unknown> = {},
) {
  return {
    ok: true,
    plan: document
      ? {
          id: "f4000000-0000-4000-8000-000000000030",
          revision: 3,
          savedAt: "2026-10-18T12:00:00Z",
          document,
          history: [],
        }
      : null,
    stage: 2,
    canWrite: true,
    sourceStatus: [],
    ...extra,
  };
}
async function open() {
  render(<SavedMarketingLab project={project} />);
  await screen.findByRole("heading", { name: "Your thinking comes first" });
}
async function editBeachhead(value = "My unsaved audience") {
  fireEvent.click(screen.getByRole("button", { name: /Map channels/ }));
  fireEvent.change(screen.getByLabelText("Beachhead audience"), { target: { value } });
}
beforeEach(() => {
  gateway.load.mockReset();
  gateway.save.mockReset();
  gateway.load.mockResolvedValue(loaded());
  gateway.save.mockResolvedValue({ ok: false, code: "CONFLICT", currentRevision: 4 });
});
afterEach(cleanup);

describe("private Marketing Lab persistence UI", () => {
  it("saves completed planning controls with the current revision and preserves them on reload", async () => {
    const plan = planningFixture();
    gateway.load.mockResolvedValue(loaded(plan));
    gateway.save.mockImplementation(async ({ data }: { data: { document: MarketingPlanV1 } }) => ({
      ok: true,
      id: "f4000000-0000-4000-8000-000000000030",
      revision: 4,
      savedAt: "2026-10-18T13:00:00Z",
      document: data.document,
    }));
    const view = render(<SavedMarketingLab project={project} />);
    await screen.findByRole("heading", { name: "Your thinking comes first" });
    fireEvent.click(screen.getByRole("button", { name: /Plan the test/ }));
    fireEvent.change(screen.getByLabelText("Target count (blank means unknown)"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Action 2: Estimated minutes"), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("Test status"), { target: { value: "running" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Saved · revision 4");
    const input = gateway.save.mock.calls[0]![0].data;
    expect(input.expectedRevision).toBe(3);
    expect(input.projectId).toBe(project.id);
    expect(input.document.test.target).toBe(0);
    expect(input.document.test.state).toBe("running");
    expect(input.document.test.startedAt).toBeTruthy();
    expect(input.document.test.tasks[1].estimatedMinutes).toBe(30);
    expect(input.document.test.tasks[1].dependsOn).toEqual(plan.test.tasks[1]!.dependsOn);
    expect(input.document.studentFirst).toEqual(plan.studentFirst);
    view.unmount();
    gateway.load.mockResolvedValue({
      ...loaded(input.document),
      plan: { ...loaded(input.document).plan, revision: 4 },
    });
    await open();
    fireEvent.click(screen.getByRole("button", { name: /Plan the test/ }));
    expect(screen.getByLabelText("Target count (blank means unknown)")).toHaveValue(0);
    expect(screen.getByLabelText("Action 2: Estimated minutes")).toHaveValue(30);
    expect(screen.getByLabelText("Test status")).toHaveValue("running");
  });

  it("does not replace a failed load with an empty editable plan", async () => {
    gateway.load.mockResolvedValue({ ok: false, code: "UNAVAILABLE" });
    render(<SavedMarketingLab project={project} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("has not been replaced");
    expect(screen.queryByLabelText("Beachhead audience")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(gateway.save).not.toHaveBeenCalled();
  });
  it("renders the saved initial board read-only and keeps unavailable sources visible", async () => {
    gateway.load.mockResolvedValue(
      loaded(completed(), { sourceStatus: [{ sourceId: "source", status: "missing" }] }),
    );
    await open();
    expect(screen.getByDisplayValue("Original observation")).toBeDisabled();
    expect(screen.getByDisplayValue("Initial audience")).toBeDisabled();
    expect(screen.getByText(/Some linked source records are missing/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Map channels/ })).toBeEnabled();
  });
  it("retains unsaved content and expected revision when a competing save wins", async () => {
    await open();
    await editBeachhead();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("newer version");
    expect(screen.getByLabelText("Beachhead audience")).toHaveValue("My unsaved audience");
    expect(screen.getByText("Unsaved edits")).toBeInTheDocument();
    expect(gateway.save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: project.id,
        expectedRevision: 3,
        completeStudentFirst: false,
        document: expect.objectContaining({ studentFirst: completed().studentFirst }),
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Load saved version" }));
    expect(gateway.load).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Beachhead audience")).toHaveValue("My unsaved audience");
  });
  it("retains the draft if an explicitly confirmed reload fails", async () => {
    await open();
    await editBeachhead();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByRole("alert");
    gateway.load.mockResolvedValue({ ok: false, code: "UNAVAILABLE" });
    fireEvent.click(screen.getByRole("button", { name: "Load saved version" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace with saved version" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("has not been replaced"),
    );
    expect(screen.getByLabelText("Beachhead audience")).toHaveValue("My unsaved audience");
  });
  it("adopts the server completion timestamp before unlocking the next step", async () => {
    gateway.load.mockResolvedValue(loaded(null));
    gateway.save.mockImplementation(async ({ data }: { data: { document: MarketingPlanV1 } }) => ({
      ok: true,
      id: "f4000000-0000-4000-8000-000000000030",
      revision: 1,
      savedAt: "2026-10-18T12:30:00Z",
      document: {
        ...data.document,
        studentFirst: { ...data.document.studentFirst, completedAt: "2026-10-18T12:30:00Z" },
      },
    }));
    await open();
    expect(screen.getByRole("button", { name: /Map channels/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/What have you noticed/), {
      target: { value: "A recent observation" },
    });
    fireEvent.change(screen.getByLabelText("Who is your reachable audience?"), {
      target: { value: "Students with a prototype" },
    });
    fireEvent.change(screen.getByLabelText("What useful action could they take?"), {
      target: { value: "Try an interview" },
    });
    fireEvent.change(screen.getByLabelText(/Where might you reach them/), {
      target: { value: "Campus club" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Preserve my thinking/ }));
    await screen.findByLabelText("Beachhead audience");
    expect(gateway.save).toHaveBeenCalledWith({
      data: expect.objectContaining({ expectedRevision: 0, completeStudentFirst: true }),
    });
    expect(screen.getByText("Saved · revision 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Think first/ }));
    expect(screen.getByDisplayValue("A recent observation")).toBeDisabled();
  });
  it("uses the server's stage gate for read-only rendering after a downgrade", async () => {
    gateway.load.mockResolvedValue(loaded(completed(), { stage: 1, canWrite: false }));
    await open();
    fireEvent.click(screen.getByRole("button", { name: /Map channels/ }));
    expect(screen.getByLabelText("Beachhead audience")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });
  it("reuses the request token for an identical ambiguous retry", async () => {
    gateway.save.mockResolvedValue({ ok: false, code: "UNAVAILABLE" });
    await open();
    await editBeachhead();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(gateway.save).toHaveBeenCalledTimes(2));
    expect(gateway.save.mock.calls[0]![0]).toEqual(gateway.save.mock.calls[1]![0]);
  });
});
