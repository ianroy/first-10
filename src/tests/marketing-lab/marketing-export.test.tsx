import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MarketingPlanExport } from "@/components/marketing/MarketingPlanExport";
import { createEmptyMarketingPlan } from "@/lib/marketing-plan";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("requires review, freezes exactly the preview until refresh, and downloads locally only on request", () => {
  vi.useFakeTimers();
  const create = vi.fn(() => "blob:local-export");
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const plan = createEmptyMarketingPlan();
  plan.reflection.nextAction = "Original next action";
  const view = render(<MarketingPlanExport plan={plan} projectName="Practice" fictional />);
  expect(
    screen.queryByRole("button", { name: "Download reviewed Markdown" }),
  ).not.toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Review Markdown export" }));
  const preview = screen.getByLabelText("Markdown export preview") as HTMLTextAreaElement;
  expect(preview.readOnly).toBe(true);
  expect(preview.value).toContain("Original next action");
  const changed = structuredClone(plan);
  changed.reflection.nextAction = "Changed next action";
  view.rerender(<MarketingPlanExport plan={changed} projectName="Practice" fictional />);
  expect(preview.value).not.toContain("Changed next action");
  fireEvent.click(screen.getByRole("button", { name: "Refresh export preview" }));
  expect(preview.value).toContain("Changed next action");
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Download reviewed Markdown" }));
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ type: "text/markdown;charset=utf-8" }),
  );
  expect(click).toHaveBeenCalledOnce();
  expect(click.mock.instances[0]).toHaveAttribute("download", "first-ten-marketing-plan.md");
  expect(click.mock.instances[0]).toHaveAttribute("href", "blob:local-export");
  expect(screen.getByRole("status")).toHaveTextContent("Download requested");
  vi.advanceTimersByTime(1000);
  expect(revoke).toHaveBeenCalledWith("blob:local-export");
  fireEvent.click(screen.getByRole("button", { name: "Close export preview" }));
  expect(screen.queryByLabelText("Markdown export preview")).not.toBeInTheDocument();
});
it("preserves readable text if the browser cannot create a download", () => {
  vi.stubGlobal("URL", {
    createObjectURL: () => {
      throw new Error("unavailable");
    },
    revokeObjectURL: vi.fn(),
  });
  render(<MarketingPlanExport plan={createEmptyMarketingPlan()} projectName="My plan" />);
  fireEvent.click(screen.getByRole("button", { name: "Review Markdown export" }));
  fireEvent.click(screen.getByRole("button", { name: "Download reviewed Markdown" }));
  expect(screen.getByRole("status")).toHaveTextContent("select and copy");
  expect(screen.getByLabelText("Markdown export preview")).toBeInTheDocument();
});
