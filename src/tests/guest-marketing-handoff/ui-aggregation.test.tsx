import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ list: vi.fn(), load: vi.fn(), block: vi.fn(), choice: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (v: unknown) => {
    h.block(v);
    return { status: "idle" };
  },
}));
vi.mock("@/lib/guest-marketing/functions", () => ({
  listGuestMarketing: h.list,
  loadGuestMarketing: h.load,
  saveGuestMarketing: vi.fn(),
}));
vi.mock("@/lib/guest-marketing/handoff/functions", () => ({
  readMarketingChoice: h.choice,
  saveMarketingChoice: vi.fn(),
  previewMarketingSubmission: vi.fn(),
  confirmMarketingSubmission: vi.fn(),
  listMarketingSubmissions: vi.fn(),
  getMarketingSubmission: vi.fn(),
  withdrawMarketingSubmission: vi.fn(),
}));
vi.mock("@/components/guest/GuestActivityExport", () => ({ GuestActivityExport: () => null }));
import { GuestMarketingWorkspace } from "@/components/guest-marketing/GuestMarketingWorkspace";
import { view, csrf, record } from "./fixture";
afterEach(cleanup);
it("real handoff child becoming clean cannot clear an independently dirty plan guard", async () => {
  h.list.mockResolvedValue({ ok: true, data: [record] });
  h.load.mockResolvedValue({ ok: true, data: record });
  h.choice.mockResolvedValue({
    ok: true,
    data: { planId: record.id, choice: "granted", revision: 1 },
  });
  const report = vi.fn();
  render(<GuestMarketingWorkspace view={view} csrf={csrf} onDirtyChange={report} />);
  fireEvent.click(await screen.findByRole("button", { name: "Private plan 1 · revision 2" }));
  await screen.findByText("granted");
  fireEvent.change(screen.getByLabelText("Marketing plan title"), {
    target: { value: "Keep unsaved marketing edits" },
  });
  fireEvent.change(screen.getByLabelText("Submission title"), {
    target: { value: "Temporary handoff draft" },
  });
  await waitFor(() => expect(report).toHaveBeenLastCalledWith(true));
  fireEvent.change(screen.getByLabelText("Submission title"), { target: { value: "" } });
  await waitFor(() => expect(h.block.mock.lastCall?.[0].shouldBlockFn()).toBe(true));
  expect(report).toHaveBeenLastCalledWith(true);
  expect(screen.getByDisplayValue("Keep unsaved marketing edits")).toBeInTheDocument();
});
