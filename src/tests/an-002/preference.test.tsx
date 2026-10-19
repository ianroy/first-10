import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const h = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/events.functions", () => ({
  getMeasurementPreference: h.read,
  saveMeasurementPreference: h.save,
}));
import { MeasurementPreference } from "@/components/account/MeasurementPreference";
const unknown = {
  choice: "unknown",
  revision: 0,
  policyVersion: 1,
  collectionEnabled: false,
  changedAt: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  h.read.mockResolvedValue({ ok: true, data: unknown });
});
afterEach(cleanup);
describe("separate optional measurement choice", () => {
  it("starts unknown with no automatic opt-in and keeps collection disabled", async () => {
    render(<MeasurementPreference userId="owner" />);
    await screen.findByText(/Saved choice: unknown/);
    expect(screen.getByLabelText("Your product measurement choice")).toHaveValue("unknown");
    expect(screen.getByRole("button", { name: "Save measurement choice" })).toBeDisabled();
    expect(screen.getByText(/This choice is separate from interview notes/)).toBeVisible();
    expect(h.save).not.toHaveBeenCalled();
  });
  it("retains exact uncertain intent and acknowledges only persisted choice", async () => {
    h.save
      .mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" })
      .mockResolvedValueOnce({ ok: true, data: { ...unknown, choice: "granted", revision: 1 } });
    render(<MeasurementPreference userId="owner" />);
    await screen.findByText(/Saved choice: unknown/);
    fireEvent.change(screen.getByLabelText("Your product measurement choice"), {
      target: { value: "granted" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save measurement choice" }));
    await screen.findByText(/The result is unconfirmed/);
    expect(screen.getByText(/Saved choice: unknown/)).toBeVisible();
    expect(screen.getByLabelText("Your product measurement choice")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry exact measurement choice" }));
    await screen.findByText(/Choice saved. Earlier activity is never backfilled/);
    expect(h.save.mock.calls[0]![0]).toEqual(h.save.mock.calls[1]![0]);
  });
  it("a concurrent choice conflict requires explicit reload instead of overwrite", async () => {
    h.save.mockResolvedValue({ ok: false, code: "CONFLICT" });
    render(<MeasurementPreference userId="owner" />);
    await screen.findByText(/Saved choice: unknown/);
    fireEvent.change(screen.getByLabelText("Your product measurement choice"), {
      target: { value: "withdrawn" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save measurement choice" }));
    await screen.findByText(/Your choice changed elsewhere/);
    expect(h.save).toHaveBeenCalledOnce();
    h.read.mockResolvedValue({ ok: true, data: { ...unknown, choice: "withdrawn", revision: 2 } });
    fireEvent.click(screen.getByRole("button", { name: "Reload saved choice" }));
    await screen.findByText(/Saved choice: withdrawn/);
  });
  it("account changes discard prior account state and delayed acknowledgement", async () => {
    let resolve!: (value: unknown) => void;
    h.save.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = render(<MeasurementPreference userId="owner-a" />);
    await screen.findByText(/Saved choice: unknown/);
    fireEvent.change(screen.getByLabelText("Your product measurement choice"), {
      target: { value: "granted" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save measurement choice" }));
    view.rerender(<MeasurementPreference userId="owner-b" />);
    await screen.findByText(/Saved choice: unknown/);
    resolve({ ok: true, data: { ...unknown, choice: "granted", revision: 1 } });
    await waitFor(() =>
      expect(screen.queryByText(/Saved choice: granted/)).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Your product measurement choice")).toHaveValue("unknown");
  });
});
