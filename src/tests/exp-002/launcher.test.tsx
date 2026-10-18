import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActivityExportLauncher } from "@/components/export/ActivityExportLauncher";
import { OwnerActivityExport } from "@/components/export/OwnerActivityExport";
import { activity, section } from "@/lib/export/adapters";
const h = vi.hoisted(() => ({
  create: vi.fn(),
  download: vi.fn(),
  rpc: vi.fn(),
  identity: { ready: true, error: null, userId: "owner", selectedProjectId: "project" },
}));
vi.mock("@/lib/export/pdf", () => ({
  createActivityPdf: h.create,
  downloadActivityPdf: h.download,
}));
vi.mock("@/lib/project-selection", () => ({ useProjectSelection: () => h.identity }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc } }));
const offers = (text = "Current edited text") => [
  activity("first", "First activity", [
    section("first.details", "First details", [["Note", text]]),
  ]),
  activity("second", "Second activity", [
    section("second.details", "Second details", [["Other", "Second text"]]),
  ]),
];
async function open() {
  const summary = screen.getByText("Export activity PDF");
  const details = summary.closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  await screen.findByRole("button", { name: "Review frozen copy" });
}
beforeEach(() => {
  vi.clearAllMocks();
  h.identity = { ready: true, error: null, userId: "owner", selectedProjectId: "project" };
  h.create.mockResolvedValue({ bytes: new Uint8Array([1]), pageCount: 1, filename: "a.pdf" });
});
afterEach(cleanup);
it("keeps review valid on identical rerenders but invalidates changed current edits and prevents stale downloads", async () => {
  const view = render(<ActivityExportLauncher activities={offers()} />);
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Review frozen copy" }));
  const preview = screen.getByLabelText("Frozen export preview").textContent;
  expect(preview).toContain("Current edited text");
  view.rerender(<ActivityExportLauncher activities={offers()} />);
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  expect(screen.getByLabelText("Frozen export preview").textContent).toBe(preview);
  let resolve!: (v: unknown) => void;
  h.create.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
  await waitFor(() => expect(h.create).toHaveBeenCalledOnce());
  view.rerender(<ActivityExportLauncher activities={offers("Revised current body")} />);
  await act(async () => resolve({ bytes: new Uint8Array([1]), pageCount: 1, filename: "old.pdf" }));
  expect(h.download).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Review frozen copy" }));
  expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent("Revised current body");
});
it("selects a named activity or an explicit batch; missing batch members block rather than silently omit", async () => {
  const view = render(<ActivityExportLauncher activities={offers()} allowPortfolio />);
  await open();
  fireEvent.change(screen.getByLabelText("Activity to export"), { target: { value: "second" } });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Review frozen copy" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review frozen copy" }));
  expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent("Second text");
  expect(screen.getByLabelText("Frozen export preview")).not.toHaveTextContent(
    "Current edited text",
  );
  fireEvent.click(screen.getByLabelText(/Choose a selected portfolio/));
  fireEvent.click(screen.getByLabelText("First activity"));
  fireEvent.click(screen.getByLabelText("Second activity"));
  await screen.findByRole("button", { name: "Review frozen copy" });
  fireEvent.click(screen.getByRole("button", { name: "Review frozen copy" }));
  expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent("Current edited text");
  view.rerender(<ActivityExportLauncher activities={[offers()[0]!]} allowPortfolio />);
  expect(screen.getByRole("alert")).toHaveTextContent("no longer available");
  expect(screen.queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
});
it("never fetches records for public examples and fetches only selected owner origin metadata, failing closed on scope changes", async () => {
  const privateOffers = offers();
  privateOffers[0]!.originId = "origin";
  h.rpc.mockResolvedValue({ data: null, error: null });
  const view = render(
    <OwnerActivityExport
      project={{ id: "project", user_id: "owner" }}
      activities={privateOffers}
    />,
  );
  expect(h.rpc).not.toHaveBeenCalled();
  await open();
  expect(h.rpc).toHaveBeenCalledExactlyOnceWith("get_ai_generation_origin", {
    p_project_id: "project",
    p_origin_id: "origin",
  });
  fireEvent.click(screen.getByRole("button", { name: "Review frozen copy" }));
  expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent(
    "metadata was unavailable",
  );
  h.identity = { ...h.identity, userId: "different-owner" };
  view.rerender(
    <OwnerActivityExport
      project={{ id: "project", user_id: "owner" }}
      activities={privateOffers}
    />,
  );
  expect(screen.queryByText("Export activity PDF")).not.toBeInTheDocument();
  view.unmount();
  h.rpc.mockClear();
  render(<ActivityExportLauncher activities={offers()} />);
  await open();
  expect(h.rpc).not.toHaveBeenCalled();
});
it("caps portfolio selection at 50 without silently selecting or omitting the remaining offers", async () => {
  render(
    <ActivityExportLauncher
      activities={Array.from({ length: 51 }, (_, i) =>
        activity(`a${i}`, `Activity ${i}`, [section(`s${i}`, `Section ${i}`, [["Value", i]])]),
      )}
      allowPortfolio
    />,
  );
  await open();
  fireEvent.click(screen.getByLabelText(/Choose a selected portfolio/));
  for (let i = 0; i < 50; i++)
    fireEvent.click(screen.getAllByLabelText(`Activity ${i}`, { exact: true })[0]!);
  expect(screen.getAllByLabelText("Activity 50", { exact: true })[0]).toBeDisabled();
  expect(screen.getByText("Selected 50 of 51 available activities")).toBeInTheDocument();
});
it("defers owner adapters until verified and contains scope failures inside the export panel", () => {
  const read = vi.fn(() => {
    throw new Error("Activity source does not belong");
  });
  h.identity = { ...h.identity, userId: "another-account" };
  const view = render(
    <OwnerActivityExport project={{ id: "project", user_id: "owner" }} activities={read} />,
  );
  expect(read).not.toHaveBeenCalled();
  h.identity = { ...h.identity, userId: "owner" };
  view.rerender(
    <OwnerActivityExport project={{ id: "project", user_id: "owner" }} activities={read} />,
  );
  expect(read).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert")).toHaveTextContent("source scope could not be verified");
  expect(screen.queryByText("Export activity PDF")).not.toBeInTheDocument();
  expect(h.rpc).not.toHaveBeenCalled();
});
