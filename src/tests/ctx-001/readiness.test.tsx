import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ probe: vi.fn() }));
vi.mock("@/lib/context.functions", () => ({ probePublicContextCapabilities: h.probe }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/components/AppShell", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));
import { PublicContextReadiness } from "@/components/admin/PublicContextReadiness";
const receipt = {
  ok: true,
  nodeVersion: "22.16.0",
  nodeMajor: 22,
  transportContract: "pinned-public-https-v1",
  apis: { dnsResolver: true, httpsRequest: true, blockList: true, isIP: true },
};
beforeEach(() => {
  vi.clearAllMocks();
  h.probe.mockResolvedValue(receipt);
});
afterEach(cleanup);
it("checks only on explicit request and distinguishes deployed capabilities from a network review", async () => {
  render(<PublicContextReadiness projectId="owned-idea" />);
  expect(h.probe).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check source import runtime" }));
  await screen.findByText(/Server Node.js 22.16.0/);
  expect(h.probe).toHaveBeenCalledWith({ data: { projectId: "owned-idea" } });
  expect(screen.getByText(/Capability availability is not a network safety test/)).toBeVisible();
  expect(screen.getByText("dnsResolver: available")).toBeVisible();
});
it("ignores a late receipt after the selected idea changes and fails closed on retry", async () => {
  let resolve!: (value: unknown) => void;
  h.probe.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = render(<PublicContextReadiness projectId="old-idea" />);
  fireEvent.click(screen.getByRole("button", { name: "Check source import runtime" }));
  expect(screen.getByRole("button", { name: "Checking runtime…" })).toBeDisabled();
  view.rerender(<PublicContextReadiness projectId="new-idea" />);
  await act(async () => {
    resolve(receipt);
  });
  expect(screen.queryByText(/Server Node.js/)).not.toBeInTheDocument();
  h.probe.mockRejectedValueOnce(new Error("private diagnostic must not render"));
  fireEvent.click(screen.getByRole("button", { name: "Check source import runtime" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Source import policy has not changed"),
  );
  expect(screen.queryByText(/private diagnostic/)).not.toBeInTheDocument();
});
