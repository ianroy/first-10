import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyTeacherPlan, type TeacherPlanV1 } from "@/lib/teacher-plan";

const gateway = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
const navigation = vi.hoisted(() => ({
  blocker: vi.fn(),
  proceed: vi.fn(),
  reset: vi.fn(),
  status: "idle",
}));
vi.mock("@/lib/teacher.functions", () => ({
  loadTeacherPlan: gateway.load,
  saveTeacherPlan: gateway.save,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (options: unknown) => {
    navigation.blocker(options);
    return { status: navigation.status, proceed: navigation.proceed, reset: navigation.reset };
  },
}));
import { TeacherPlanner } from "@/components/teaching/TeacherPlanner";

const projectId = "f4000000-0000-4000-8000-000000000010";
const planId = "f4000000-0000-4000-8000-000000000030";
function loaded(document: TeacherPlanV1 | null = createEmptyTeacherPlan(), revision = 3) {
  return {
    ok: true,
    plan: document ? { id: planId, revision, savedAt: "2026-10-18T12:00:00Z", document } : null,
  };
}
async function open() {
  render(<TeacherPlanner projectId={projectId} projectName="Teaching project" />);
  await screen.findByLabelText("Class / lesson name");
}
function changeName(value = "My unsaved lesson") {
  fireEvent.change(screen.getByLabelText("Class / lesson name"), { target: { value } });
}
async function clickTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
  await waitFor(() => expect(tab).toHaveAttribute("data-state", "active"));
}
beforeEach(() => {
  vi.clearAllMocks();
  navigation.status = "idle";
  gateway.load.mockResolvedValue(loaded());
  gateway.save.mockImplementation(async ({ data }: { data: { document: TeacherPlanV1 } }) => ({
    ok: true,
    id: planId,
    revision: 4,
    savedAt: "2026-10-18T12:30:00Z",
    document: data.document,
  }));
});
afterEach(cleanup);

describe("instructor lesson planning", () => {
  it("fails closed on initial load failure and supports retry without replacing saved work", async () => {
    gateway.load.mockRejectedValue(new Error("connection lost"));
    render(<TeacherPlanner projectId={projectId} projectName="Teaching project" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("has not been replaced");
    expect(screen.queryByLabelText("Class / lesson name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save plan" })).toBeDisabled();
    gateway.load.mockResolvedValue(loaded(null));
    fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
    await screen.findByLabelText("Class / lesson name");
    expect(screen.getByRole("status")).toHaveTextContent("not saved yet");
    expect(gateway.save).not.toHaveBeenCalled();
  });
  it("saves all fields with explicit project ID, expected revision, and request token", async () => {
    await open();
    expect(gateway.load).toHaveBeenCalledWith({ data: { projectId } });
    changeName("Evidence workshop");
    const fields = [
      ["Who is this lesson for?", "First-year founders"],
      ["Learning objectives", "Trace a source\nExplain a revision"],
      ["Student task / assignment", "Write first, then compare evidence."],
      ["Session length (minutes)", "75"],
      ["Planned capacity", "45"],
      ["Planned date (optional)", "2026-10-19"],
      ["Assessment & feedback approach", "Peer observation and reflection"],
      ["Private facilitator notes", "Allow silent feedback"],
    ];
    for (const [label, value] of fields)
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved · revision 4"));
    expect(gateway.save).toHaveBeenCalledWith({
      data: {
        projectId,
        expectedRevision: 3,
        mutationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        document: {
          schemaVersion: 1,
          className: "Evidence workshop",
          audience: "First-year founders",
          learningObjectives: ["Trace a source", "Explain a revision"],
          assignment: "Write first, then compare evidence.",
          sessionMinutes: 75,
          plannedLearners: 45,
          scheduledOn: "2026-10-19",
          assessment: "Peer observation and reflection",
          facilitatorNotes: "Allow silent feedback",
        },
      },
    });
  });
  it("creates a new plan at revision zero and leaves optional capacity/date unknown", async () => {
    gateway.load.mockResolvedValue(loaded(null));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(gateway.save).toHaveBeenCalled());
    expect(gateway.save.mock.calls[0]![0].data).toMatchObject({
      expectedRevision: 0,
      document: { plannedLearners: null, scheduledOn: null },
    });
  });
  it("keeps the draft on an ambiguous failure and safely reuses the identical retry token", async () => {
    gateway.save.mockRejectedValue(new Error("response lost"));
    await open();
    changeName();
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("draft is still here");
    expect(screen.getByLabelText("Class / lesson name")).toHaveValue("My unsaved lesson");
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(gateway.save).toHaveBeenCalledTimes(2));
    expect(gateway.save.mock.calls[0]![0]).toEqual(gateway.save.mock.calls[1]![0]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save plan" })).toBeEnabled());
    changeName("A changed request");
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(gateway.save).toHaveBeenCalledTimes(3));
    expect(gateway.save.mock.calls[2]![0].data.mutationId).not.toBe(
      gateway.save.mock.calls[0]![0].data.mutationId,
    );
  });
  it("rejects invalid values locally while preserving the draft", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Session length (minutes)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your draft is still here");
    expect(gateway.save).not.toHaveBeenCalled();
  });
  it("preserves a conflicting draft until the instructor reviews and explicitly re-applies it", async () => {
    gateway.save.mockResolvedValue({ ok: false, code: "CONFLICT", currentRevision: 4 });
    await open();
    changeName();
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("needs your review");
    expect(screen.getByLabelText("Class / lesson name")).toHaveValue("My unsaved lesson");
    expect(screen.getByRole("button", { name: "Save plan" })).toBeDisabled();
    gateway.load.mockResolvedValue(
      loaded({ ...createEmptyTeacherPlan(), className: "Other saved lesson" }, 4),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review saved version" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Other saved lesson");
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep my draft for next save" }));
    expect(screen.getByLabelText("Class / lesson name")).toHaveValue("My unsaved lesson");
    expect(gateway.save).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(gateway.save).toHaveBeenCalledTimes(2));
    expect(gateway.save.mock.calls[1]![0].data).toMatchObject({
      expectedRevision: 4,
      document: { className: "My unsaved lesson" },
    });
  });
  it("can explicitly use the saved version after review without another write", async () => {
    gateway.save.mockResolvedValue({ ok: false, code: "CONFLICT" });
    await open();
    changeName();
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await screen.findByRole("alert");
    gateway.load.mockResolvedValue(
      loaded({ ...createEmptyTeacherPlan(), className: "Reviewed saved lesson" }, 7),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review saved version" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use saved version" }));
    expect(screen.getByLabelText("Class / lesson name")).toHaveValue("Reviewed saved lesson");
    expect(screen.getByRole("status")).toHaveTextContent("Saved · revision 7");
    expect(gateway.save).toHaveBeenCalledTimes(1);
  });
  it("keeps the local draft and conflict gate if reviewing the server version fails", async () => {
    gateway.save.mockResolvedValue({ ok: false, code: "CONFLICT" });
    await open();
    changeName();
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await screen.findByRole("alert");
    gateway.load.mockResolvedValue({ ok: false, code: "UNAVAILABLE" });
    fireEvent.click(screen.getByRole("button", { name: "Review saved version" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("has not been replaced"),
    );
    expect(screen.getByLabelText("Class / lesson name")).toHaveValue("My unsaved lesson");
    expect(screen.getByRole("button", { name: "Save plan" })).toBeDisabled();
  });
  it("fills blank lesson fields while preserving authored content and session settings", async () => {
    await open();
    changeName("My course");
    fireEvent.change(screen.getByLabelText("Session length (minutes)"), {
      target: { value: "90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fill empty fields from lesson" }));
    expect(screen.getByLabelText("Class / lesson name")).toHaveValue("My course");
    expect(screen.getByLabelText("Session length (minutes)")).toHaveValue(90);
    expect((screen.getByLabelText("Learning objectives") as HTMLTextAreaElement).value).toContain(
      "counterevidence",
    );
    expect(screen.getByLabelText("Planned capacity")).toHaveValue(null);
    expect(gateway.save).not.toHaveBeenCalled();
  });
  it("shows current draft student tasks without exposing private facilitator notes", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Student task / assignment"), {
      target: { value: "Read Nora’s counterexample" },
    });
    fireEvent.change(screen.getByLabelText("Private facilitator notes"), {
      target: { value: "PRIVATE FACILITATION NOTE" },
    });
    await clickTab("Student task preview");
    const preview = screen.getByRole("article", { name: "Student task preview" });
    expect(preview).toHaveTextContent("Read Nora’s counterexample");
    expect(preview).not.toHaveTextContent("PRIVATE FACILITATION NOTE");
    expect(screen.getByText("Preview only · nothing assigned or shared")).toBeInTheDocument();
  });
  it("links actual kit sources and distinguishes the fixed reference agenda from the planned length", async () => {
    await open();
    expect(
      screen.getByText(/Planning workspace — enrollment and student submissions/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open printable teaching kit" })).toHaveAttribute(
      "href",
      "/teaching/first-ten-teaching-kit.pdf",
    );
    fireEvent.change(screen.getByLabelText("Session length (minutes)"), {
      target: { value: "90" },
    });
    await clickTab("Agenda & feedback");
    expect(screen.getByText(/Your plan is 90 minutes; adapt the timings/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Read the full rubric & source notes" }),
    ).toHaveAttribute("href", "/teaching/first-ten-teaching-kit.html#assessment-rubric-1");
    expect(screen.getByText(/does not record or automate grades/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Peer check, revise, reflect" }),
    ).toBeInTheDocument();
  });
  it("guards dirty navigation and supplies explicit stay or discard actions", async () => {
    await open();
    changeName();
    const options = navigation.blocker.mock.calls.at(-1)![0];
    expect(options.enableBeforeUnload).toBe(true);
    expect(options.shouldBlockFn()).toBe(true);
    navigation.status = "blocked";
    changeName("Trigger blocked route render");
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(navigation.reset).toHaveBeenCalled();
    expect(screen.getByLabelText("Class / lesson name")).toHaveValue(
      "Trigger blocked route render",
    );
  });
});

it("shows the authored class preview only for the known presenter project and guards its local drafts", async () => {
  render(
    <TeacherPlanner
      projectId="f1d00000-0000-4000-8000-000000000010"
      projectName="Fictional workshop"
    />,
  );
  await screen.findByLabelText("Class / lesson name");
  fireEvent.change(screen.getByLabelText("Local feedback draft for StudyLoop"), {
    target: { value: "Local review practice" },
  });
  const options = navigation.blocker.mock.calls.at(-1)![0];
  expect(options.shouldBlockFn()).toBe(true);
  expect(options.enableBeforeUnload).toBe(true);
  expect(gateway.save).not.toHaveBeenCalled();
});
it("does not expose fictional cohort cards in an ordinary project planner", async () => {
  await open();
  expect(
    screen.queryByRole("navigation", { name: "Fictional team examples" }),
  ).not.toBeInTheDocument();
});
