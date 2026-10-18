import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Project } from "@/lib/data";

const h = vi.hoisted(() => ({
  identity: { ready: true, userId: "owner-a" },
  query: { isPending: false, error: null as Error | null, data: [], refetch: vi.fn() },
  read: vi.fn(),
  build: vi.fn(),
  plans: vi.fn(),
  marketing: vi.fn(),
  teacher: vi.fn(),
  discovery: vi.fn(),
  discoveryLoad: vi.fn(),
  drafts: vi.fn(),
  draftLoad: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: h.plans }));
vi.mock("@/lib/export/plan-adapters", () => ({
  marketingActivities: h.marketing,
  teacherActivities: h.teacher,
}));
vi.mock("@/lib/marketing.functions", () => ({ loadMarketingPlan: vi.fn() }));
vi.mock("@/lib/teacher.functions", () => ({ loadTeacherPlan: vi.fn() }));
vi.mock("@/lib/discovery.functions", () => ({ loadDiscovery: h.discoveryLoad }));
vi.mock("@/lib/export/discovery-adapters", () => ({ discoveryActivities: h.discovery }));
vi.mock("@/lib/export/interview-draft-adapters", () => ({ interviewDraftActivities: h.drafts }));
vi.mock("@/lib/export/load-interview-drafts", () => ({
  loadPortfolioInterviewDrafts: h.draftLoad,
}));
vi.mock("@/lib/project-selection", () => ({ useWorkspaceIdentity: () => h.identity }));
vi.mock("@/lib/data", () => ({
  useContacts: () => h.read(),
  useInterviews: () => h.read(),
  useLearnings: () => h.read(),
  useExperiments: () => h.read(),
  useOutreach: () => h.read(),
}));
vi.mock("@/lib/export/adapters", () => ({ ownerPortfolioActivities: h.build }));
vi.mock("@/components/export/OwnerActivityExport", () => ({
  OwnerActivityExport: ({ project }: { project: Project }) => <div>Export {project.name}</div>,
}));
import { OwnerSavedWorkExport } from "@/components/OwnerSavedWorkExport";

const project = { id: "idea-a", user_id: "owner-a", name: "Idea A" } as Project;
beforeEach(() => {
  vi.clearAllMocks();
  h.identity = { ready: true, userId: "owner-a" };
  h.query = { isPending: false, error: null, data: [], refetch: vi.fn() };
  h.read.mockImplementation(() => h.query);
  h.build.mockReturnValue([]);
  h.plans.mockReturnValue({
    isPending: false,
    error: null,
    data: { marketing: null, teacher: null },
    refetch: vi.fn(),
  });
  h.marketing.mockReturnValue([]);
  h.teacher.mockReturnValue([]);
  h.discovery.mockReturnValue([]);
  h.drafts.mockReturnValue([]);
});
afterEach(cleanup);

describe("saved owner portfolio acquisition", () => {
  it("loads only after opening and never presents another account's project", () => {
    const { rerender } = render(<OwnerSavedWorkExport project={project} />);
    expect(h.read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open saved exports" }));
    expect(screen.getByText("Export Idea A")).toBeInTheDocument();
    expect(h.build).toHaveBeenCalledWith(expect.objectContaining({ project }));
    expect(h.plans).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["portfolio-plans", "owner-a", "idea-a"] }),
    );
    h.identity = { ready: true, userId: "owner-b" };
    rerender(<OwnerSavedWorkExport project={project} />);
    expect(screen.queryByText("Export Idea A")).not.toBeInTheDocument();
  });
  it("withholds the portfolio on a partial load instead of silently omitting activities", () => {
    h.query.error = new Error("Unavailable");
    render(<OwnerSavedWorkExport project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "Open saved exports" }));
    expect(screen.getByRole("alert")).toHaveTextContent("not created an incomplete portfolio");
    expect(h.build).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry activity records" }));
    expect(h.query.refetch).toHaveBeenCalledTimes(5);
  });
  it("withholds cached plans while refetching so newly saved activities cannot be silently omitted", () => {
    h.plans.mockReturnValue({
      isPending: false,
      isFetching: true,
      error: null,
      data: { marketing: null, teacher: null },
      refetch: vi.fn(),
    });
    const { rerender } = render(<OwnerSavedWorkExport project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "Open saved exports" }));
    expect(screen.getByRole("status")).toHaveTextContent("Opening your saved activity records");
    expect(h.build).not.toHaveBeenCalled();
    h.plans.mockReturnValue({
      isPending: false,
      isFetching: false,
      error: null,
      data: {
        marketing: { document: { schemaVersion: 1 }, savedAt: "2026-10-18T15:00:00Z", revision: 2 },
        teacher: null,
        discovery: { document: { schemaVersion: 1 }, savedAt: "2026-10-18T15:00:00Z", revision: 3 },
        drafts: [{ id: "saved-private-draft" }],
      },
      refetch: vi.fn(),
    });
    rerender(<OwnerSavedWorkExport project={project} />);
    expect(h.marketing).toHaveBeenCalledWith(
      { schemaVersion: 1 },
      { savedAt: "2026-10-18T15:00:00Z", revision: 2, dirty: false },
    );
    expect(screen.getByText(/Marketing Lab: saved plan included/)).toBeInTheDocument();
    expect(h.discovery).toHaveBeenCalledWith(
      { schemaVersion: 1 },
      { savedAt: "2026-10-18T15:00:00Z", revision: 3, dirty: false },
    );
    expect(screen.getByText(/Discovery cycle: saved workspace included/)).toBeInTheDocument();
    expect(h.drafts).toHaveBeenCalledWith(project, [{ id: "saved-private-draft" }]);
    expect(screen.getByText(/1 saved drafts included/)).toBeInTheDocument();
  });
  it("withholds the portfolio while loading or when adapter ownership checks reject records", () => {
    h.query.isPending = true;
    const { rerender } = render(<OwnerSavedWorkExport project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "Open saved exports" }));
    expect(screen.getByRole("status")).toHaveTextContent("Opening your saved activity records");
    expect(h.build).not.toHaveBeenCalled();
    h.query.isPending = false;
    h.build.mockImplementation(() => {
      throw new Error("Foreign owner");
    });
    rerender(<OwnerSavedWorkExport project={project} />);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be safely prepared");
  });
});
