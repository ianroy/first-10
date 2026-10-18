import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarketingLabDemo } from "@/components/marketing/MarketingLabDemo";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("offers a PDF from every public board and preserves the current local thought without any network or storage", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<MarketingLabDemo />);
  fireEvent.change(screen.getByLabelText(/Your first thought/), {
    target: { value: "My current club idea" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Explore channels" }));
  const details = screen.getByText("Export activity PDF").closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  fireEvent.click(await screen.findByRole("button", { name: "Review frozen copy" }));
  expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent("My current club idea");
  expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent("FICTIONAL EXAMPLE");
  expect(fetcher).not.toHaveBeenCalled();
});
