import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AdminSnapshot } from "@/lib/admin.functions";

const h = vi.hoisted(() => ({
  report: {
    data: undefined as AdminSnapshot | undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  query: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useRouteContext: () => ({ user: { id: "fixture-presenter" } }),
  }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => {
    h.query(options);
    return h.report;
  },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/admin.functions", () => ({ getAdminSnapshot: vi.fn() }));
vi.mock("@/components/admin/PublicContextReadiness", () => ({
  PublicContextReadiness: () => <section>Public-source import readiness</section>,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/components/RequireProject", () => ({
  RequireProject: ({ children }: { children: (project: unknown) => ReactNode }) =>
    children({ id: "fixture" }),
}));
import { Route } from "@/routes/_authenticated/admin";
const Page = Route.options.component!;

beforeEach(() => {
  vi.clearAllMocks();
  h.report.isPending = false;
  h.report.isError = false;
  h.report.isFetching = false;
  h.report.data = {
    status: "partial",
    asOf: "2026-10-18T12:00:00.000Z",
    metrics: [
      { key: "projects", label: "Projects", total: 7, presenter: 2 },
      { key: "contacts", label: "Contact records", total: null, presenter: null },
    ],
  };
});
afterEach(cleanup);

describe("admin operational presentation", () => {
  it("distinguishes unavailable counts and uninstrumented funnel from real zeros", () => {
    render(<Page />);
    expect(screen.getByLabelText("Projects: 7")).toBeVisible();
    expect(screen.getByLabelText("Contact records: unavailable")).toHaveTextContent("—");
    expect(screen.getByText("Current presenter: 2 records")).toBeVisible();
    expect(screen.getAllByText("Unavailable · not instrumented here")).toHaveLength(5);
    expect(screen.getByText(/totals include demo\/test records/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Account tools" })).toHaveAttribute("href", "/account");
    expect(h.query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["admin-operational-counts", "fixture-presenter"],
        retry: false,
        gcTime: 0,
      }),
    );
  });
  it("hides previously loaded counts after an authorization or request error", () => {
    h.report.isError = true;
    render(<Page />);
    expect(screen.getByRole("alert")).toHaveTextContent("Admin access unavailable");
    expect(screen.queryByLabelText("Projects: 7")).not.toBeInTheDocument();
    expect(screen.queryByText("Server-verified admin access")).not.toBeInTheDocument();
    expect(screen.queryByText("Public-source import readiness")).not.toBeInTheDocument();
  });
  it("refreshes deliberately and disables repeated requests while fetching", () => {
    const view = render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh counts" }));
    expect(h.report.refetch).toHaveBeenCalledOnce();
    h.report.isFetching = true;
    view.rerender(<Page />);
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  });
  it("shows private intake counts separately from enrollment and unknown conversion", () => {
    h.report.data!.partners = {
      interestRequests: 0,
      feedbackSubmissions: 1,
      distinctRespondents: 1,
      excludedFixtures: 2,
    };
    render(<Page />);
    expect(screen.getByLabelText("Interest requests: 0")).toHaveTextContent("0");
    expect(screen.getByLabelText("Feedback submissions: 1")).toHaveTextContent("1");
    expect(screen.getByText(/Known fixture submissions excluded: 2/)).toBeVisible();
    expect(screen.getByText(/not confirmed partners or active classrooms/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open invitation" })).toHaveAttribute(
      "href",
      "/founding-partners",
    );
  });
});
