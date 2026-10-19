import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GuestView } from "@/lib/guest-spaces/contracts";
const h = vi.hoisted(() => ({
  ports: vi.fn(),
  blocker: vi.fn(),
  reset: vi.fn(),
  proceed: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useBlocker: h.blocker }));
vi.mock("@/lib/guest-growth/client", () => ({ createGuestGrowthPorts: h.ports }));
vi.mock("@/components/guest-growth/GuestGrowthWorkspace", () => ({
  GuestGrowthWorkspace: ({
    view,
    onDirtyChange,
  }: {
    view: GuestView;
    onDirtyChange: (value: boolean) => void;
  }) => (
    <section>
      <p>{view.principalAlias}</p>
      <button onClick={() => onDirtyChange(true)}>Unconfirmed growth save</button>
      <button onClick={() => onDirtyChange(false)}>Growth save acknowledged</button>
    </section>
  ),
}));
import { ConnectedGuestGrowthWorkspace } from "@/components/guest-growth/ConnectedGuestGrowthWorkspace";
const view: GuestView = {
  classId: "fc270000-0000-4000-8000-000000000001",
  teamId: "fc270000-0000-4000-8000-000000000002",
  principalId: "fc270000-0000-4000-8000-000000000003",
  className: "Fictional workshop",
  teamAlias: "Fictional team",
  principalAlias: "Learner A",
  mode: "class",
  instructions: "Fictional",
  accessExpiresAt: "2027-01-01T00:00:00Z",
  retentionDays: 30,
  aiEnabled: false,
  assignments: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  h.ports.mockReturnValue({});
  h.blocker.mockReturnValue({ status: "idle", reset: h.reset, proceed: h.proceed });
});
afterEach(cleanup);
it("retains real client ports and guards navigation/unload until acknowledged, then resets for new genuine scope", () => {
  const report = vi.fn();
  const component = render(
    <ConnectedGuestGrowthWorkspace view={view} csrf={"a".repeat(64)} onDirtyChange={report} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Unconfirmed growth save" }));
  let options = h.blocker.mock.calls.at(-1)![0];
  expect(options.enableBeforeUnload).toBe(true);
  expect(options.shouldBlockFn()).toBe(true);
  expect(report).toHaveBeenLastCalledWith(true);
  expect(h.ports).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Growth save acknowledged" }));
  options = h.blocker.mock.calls.at(-1)![0];
  expect(options.enableBeforeUnload).toBe(false);
  expect(options.shouldBlockFn()).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Unconfirmed growth save" }));
  component.rerender(
    <ConnectedGuestGrowthWorkspace
      view={{
        ...view,
        principalId: "fc270000-0000-4000-8000-000000000004",
        principalAlias: "Learner B",
      }}
      csrf={"b".repeat(64)}
      onDirtyChange={report}
    />,
  );
  expect(screen.getByText("Learner B")).toBeVisible();
  expect(h.blocker.mock.calls.at(-1)![0].shouldBlockFn()).toBe(false);
  expect(h.ports).toHaveBeenCalledTimes(2);
});
it("offers explicit keep/leave actions for a blocked navigation", () => {
  h.blocker.mockReturnValue({ status: "blocked", reset: h.reset, proceed: h.proceed });
  render(<ConnectedGuestGrowthWorkspace view={view} csrf={"a".repeat(64)} />);
  fireEvent.click(screen.getByRole("button", { name: "Keep editing growth activities" }));
  expect(h.reset).toHaveBeenCalledOnce();
  expect(h.proceed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Leave growth activities" }));
  expect(h.proceed).toHaveBeenCalledOnce();
});
