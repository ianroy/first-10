import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityPdfExport } from "@/components/export/ActivityPdfExport";
import { exportFixture } from "./fixture";
const h = vi.hoisted(() => ({ create: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/export/pdf", () => ({
  createActivityPdf: h.create,
  downloadActivityPdf: h.download,
}));
beforeEach(() => {
  vi.clearAllMocks();
  h.create.mockResolvedValue({ bytes: new Uint8Array([1]), pageCount: 2, filename: "safe.pdf" });
});
afterEach(cleanup);
describe("reviewed PDF selection", () => {
  it("requires a fresh preview, redacts exact text and downloads only the reviewed snapshot", async () => {
    render(<ActivityPdfExport document={exportFixture()} permittedAudiences={["owner"]} />);
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Remove words or phrases"), {
      target: { value: "Élodie" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review frozen copy" }));
    expect(screen.getByLabelText("Frozen export preview")).not.toHaveTextContent("Élodie");
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(h.download).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("Nothing was submitted");
    fireEvent.click(screen.getByLabelText("What we heard"));
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  });
  it("never offers unpermitted audiences and keeps private source unavailable to teacher", () => {
    const doc = exportFixture();
    doc.activities[0]!.sourceScope = "owner_private";
    render(<ActivityPdfExport document={doc} permittedAudiences={["teacher"]} />);
    expect(screen.queryByRole("option", { name: "My private copy" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Listen before deciding")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Review frozen copy" }));
    expect(screen.getByLabelText("Frozen export preview")).not.toHaveTextContent(
      "Listen before deciding",
    );
    expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent("$0 Marketing Lab");
    expect(h.create).not.toHaveBeenCalled();
  });
  it("discards an in-flight PDF if the source or permissions change before completion", async () => {
    let resolve!: (value: unknown) => void;
    h.create.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const doc = exportFixture();
    const { rerender } = render(
      <ActivityPdfExport document={doc} permittedAudiences={["owner"]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Review frozen copy" }));
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    rerender(
      <ActivityPdfExport
        document={{ ...doc, title: "New source revision" }}
        permittedAudiences={[]}
      />,
    );
    await act(async () =>
      resolve({ bytes: new Uint8Array([1]), pageCount: 1, filename: "old.pdf" }),
    );
    expect(h.download).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  });
  it("retains the reviewed snapshot and selection when generation fails", async () => {
    h.create.mockRejectedValue(new Error("Unsupported character U+4E2D"));
    render(<ActivityPdfExport document={exportFixture()} permittedAudiences={["owner"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Review frozen copy" }));
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unsupported character");
    expect(screen.getByLabelText("Frozen export preview")).toBeInTheDocument();
    expect(h.download).not.toHaveBeenCalled();
  });
});
