import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDiscovery, type DiscoveryDocument } from "@/lib/discovery";
import type { Project } from "@/lib/data";
const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), adopt: vi.fn(), refresh: vi.fn() }));
const navigation = vi.hoisted(() => ({
  status: "idle",
  proceed: vi.fn(),
  reset: vi.fn(),
  options: vi.fn(),
}));
vi.mock("@/lib/discovery.functions", () => ({
  loadDiscovery: api.load,
  saveDiscovery: api.save,
  adoptDiscoveryScript: api.adopt,
}));
vi.mock("@/lib/data", () => ({
  useContacts: () => ({
    data: [{ id: "d1600000-0000-4000-8000-000000000011", first_name: "Maya", stage: 1 }],
    error: null,
  }),
  useInterviews: () => ({
    data: [
      {
        id: "d1600000-0000-4000-8000-000000000021",
        completed: true,
        created_at: "2026-10-18T12:00:00Z",
        answers: [{ q: "A different original question", note: "Owner private source" }],
      },
    ],
    error: null,
  }),
  useRefresh: () => api.refresh,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/export/OwnerActivityExport", () => ({
  OwnerActivityExport: () => <div>Owner export available</div>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useBlocker: (options: unknown) => {
    navigation.options(options);
    return { status: navigation.status, proceed: navigation.proceed, reset: navigation.reset };
  },
}));
import { DiscoveryWorkspace } from "@/components/discovery/DiscoveryWorkspace";
const project = {
  id: "d1600000-0000-4000-8000-000000000001",
  user_id: "f1000000-0000-4000-8000-000000000001",
  name: "Own idea",
  problem: "My saved problem",
  description: "My saved solution",
  questions: ["Existing prep"],
  questions_origin_id: null,
  checklist: {},
} as unknown as Project;
const id = (n: number) => `d1500000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function versioned() {
  const doc = createEmptyDiscovery();
  doc.hypotheses = [
    {
      id: id(1),
      createdAt: "2026-10-18T12:00:00Z",
      population: "Club students",
      situation: "Before a meeting",
      prediction: "Describe attendance uncertainty",
      disconfirming: "Already know attendance",
      timeWindow: "This week",
      reason: "My own assumption",
    },
  ];
  doc.selectedHypothesisId = id(1);
  doc.scripts = [
    {
      id: id(2),
      createdAt: "2026-10-18T12:00:00Z",
      hypothesisId: id(1),
      contextIds: [],
      title: "Neutral questions",
      opening: "May I take notes?",
      questions: ["Tell me about last time."],
      closing: "What have I missed?",
    },
  ];
  doc.selectedScriptId = id(2);
  return doc;
}
function record(document = createEmptyDiscovery(), revision = 1) {
  return { id: id(90), document, revision, savedAt: "2026-10-18T12:00:00Z", history: [] };
}
async function open() {
  render(<DiscoveryWorkspace project={project} />);
  await screen.findByLabelText("Problem space in your own words");
}
function step(name: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
beforeEach(() => {
  vi.clearAllMocks();
  navigation.status = "idle";
  api.load.mockResolvedValue({ ok: true, workspace: null });
  api.save.mockImplementation(
    async ({ data }: { data: { document: DiscoveryDocument; expectedRevision: number } }) => ({
      ok: true,
      ...record(data.document, data.expectedRevision + 1),
    }),
  );
  api.adopt.mockResolvedValue({ ok: true, questions: ["Tell me about last time."] });
});
afterEach(cleanup);
describe("manual discovery journey", () => {
  it("loads fail-closed and retries without inventing a replacement document", async () => {
    api.load.mockRejectedValue(new Error("offline"));
    render(<DiscoveryWorkspace project={project} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be opened");
    expect(screen.queryByLabelText("Problem space in your own words")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save workspace" })).toBeDisabled();
    api.load.mockResolvedValue({ ok: true, workspace: null });
    fireEvent.click(screen.getByRole("button", { name: "Retry opening workspace" }));
    await screen.findByLabelText("Problem space in your own words");
    expect(api.save).not.toHaveBeenCalled();
  });
  it("explicitly copies the saved brief, preserves own hypothesis, and saves no fabricated people", async () => {
    await open();
    expect(screen.getByLabelText("Problem space in your own words")).toHaveValue("");
    step("Use my saved idea brief");
    expect(screen.getByLabelText("Problem space in your own words")).toHaveValue(project.problem);
    step("Make it testable");
    const fields = [
      ["Specific people or population", "Commuters"],
      ["Situation they experience", "After clubs"],
      ["What do you predict you will observe?", "Miss a return bus"],
      ["What observation would weaken this hypothesis?", "Already have transport"],
      ["Small test window", "One week"],
    ];
    for (const [label, value] of fields) change(label!, value!);
    step("Preserve my first hypothesis");
    expect(screen.getByText("Hypothesis 1 — first attempt retained")).toBeInTheDocument();
    step("Save workspace");
    await screen.findByText(/Workspace saved/);
    expect(api.save.mock.calls[0]![0].data).toMatchObject({
      projectId: project.id,
      expectedRevision: 0,
      document: {
        frame: { problem: project.problem, solution: project.description },
        hypotheses: [{ population: "Commuters" }],
        people: [],
        results: [],
      },
    });
    expect(api.adopt).not.toHaveBeenCalled();
  });
  it("retains a conflicting local draft and requires explicit reload confirmation", async () => {
    api.save.mockResolvedValue({ ok: false, code: "CONFLICT" });
    await open();
    change("Problem space in your own words", "Do not lose this");
    step("Save workspace");
    expect(await screen.findByRole("alert")).toHaveTextContent("Your draft remains here");
    expect(screen.getByLabelText("Problem space in your own words")).toHaveValue(
      "Do not lose this",
    );
    expect(screen.getByRole("button", { name: "Save workspace" })).toBeDisabled();
    step("Review / reload saved");
    const dialog = await screen.findByRole("alertdialog");
    expect(api.load).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep working" }));
    expect(screen.getByLabelText("Problem space in your own words")).toHaveValue(
      "Do not lose this",
    );
    step("Review / reload saved");
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Reload saved workspace",
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Problem space in your own words")).toHaveValue(""),
    );
  });
  it("reuses only the identical ambiguous save request and retains local edits", async () => {
    api.save.mockRejectedValue(new Error("lost response"));
    await open();
    change("Problem space in your own words", "Draft");
    step("Save workspace");
    expect(await screen.findByRole("alert")).toHaveTextContent("Keep your draft");
    step("Save workspace");
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[0]![0]).toEqual(api.save.mock.calls[1]![0]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save workspace" })).toBeEnabled(),
    );
    change("Problem space in your own words", "Changed draft");
    step("Save workspace");
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(3));
    expect(api.save.mock.calls[2]![0].data.mutationId).not.toEqual(
      api.save.mock.calls[0]![0].data.mutationId,
    );
  });
  it("adopts only saved selected questions after confirmation and does not create an interview", async () => {
    api.load.mockResolvedValue({ ok: true, workspace: record(versioned(), 4) });
    await open();
    step("Go and listen");
    step("Use this saved script in Interview");
    expect(api.adopt).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Completed interview answers");
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace preparation questions" }));
    await screen.findByText(/Selected manual questions are ready/);
    expect(api.adopt).toHaveBeenCalledWith({
      data: {
        projectId: project.id,
        expectedRevision: 4,
        scriptId: id(2),
        expectedQuestions: ["Existing prep"],
        expectedOriginId: null,
      },
    });
    expect(api.save).not.toHaveBeenCalled();
    expect(api.refresh).toHaveBeenCalledWith("project");
  });
  it("shows mismatched actual questions and supports reported observations with explicit unlink", async () => {
    const doc = versioned();
    doc.results.push({
      id: id(3),
      interviewId: "d1600000-0000-4000-8000-000000000021",
      scriptId: id(2),
      sourceCapturedAt: "2026-10-18T12:00:00Z",
      observation: "Keep my observation",
      quote: "",
      interpretation: "",
      counterevidence: "",
    });
    api.load.mockResolvedValue({ ok: true, workspace: record(doc) });
    await open();
    step("Decide what follows");
    expect(screen.getByText(/recorded questions differ/)).toBeInTheDocument();
    expect(screen.getByText(/A different original question/)).toBeInTheDocument();
    change("Observation 1: saved interview (optional)", "");
    step("Save workspace");
    await screen.findByText(/Workspace saved/);
    expect(api.save.mock.calls[0]![0].data.document.results[0]).toMatchObject({
      interviewId: null,
      sourceCapturedAt: null,
      observation: "Keep my observation",
    });
    expect(
      screen.getByText(/Manual observations do not create completed interview records/),
    ).toBeInTheDocument();
  });
  it("keeps dirty navigation behind an explicit discard dialog", async () => {
    await open();
    change("Problem space in your own words", "Unsaved");
    expect(navigation.options.mock.lastCall![0].shouldBlockFn()).toBe(true);
    navigation.status = "blocked";
    change("Problem space in your own words", "Still unsaved");
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Leave without saving" }));
    expect(navigation.proceed).toHaveBeenCalledTimes(1);
    expect(api.save).not.toHaveBeenCalled();
  });
});
