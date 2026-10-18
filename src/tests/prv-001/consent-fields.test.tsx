import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const h = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), userId: "owner-fixture" }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/project-selection", () => ({ useWorkspaceIdentity: () => ({ userId: h.userId }) }));
vi.mock("@/lib/consent.functions", () => ({
  getProcessingConsent: h.get,
  setProcessingConsent: h.set,
}));
import { ConsentFields, SavedConsentFields } from "@/components/ConsentFields";
import { unknownConsent, type ConsentRecord } from "@/lib/consent";
const scope = {
  projectId: "fa110000-0000-4000-8000-000000000001",
  targetKind: "project" as const,
  targetId: "fa110000-0000-4000-8000-000000000001",
};
let stored: ConsentRecord;
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SavedConsentFields scope={scope} label="This idea" />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  stored = {
    ...scope,
    ...unknownConsent,
    policyVersion: 1,
    revision: 0,
    evidenceInvalidated: false,
    reportedAt: null,
  };
  h.get.mockImplementation(async () => stored);
  h.set.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    stored = {
      ...stored,
      noteStatus: data["noteStatus"] as ConsentRecord["noteStatus"],
      aiStatus: data["aiStatus"] as ConsentRecord["aiStatus"],
      sharingStatus: data["sharingStatus"] as ConsentRecord["sharingStatus"],
      revision: stored.revision + 1,
      reportedAt: "2026-10-18T12:00:00.000Z",
    };
    return stored;
  });
});
afterEach(cleanup);
describe("separate, owner-reported processing choices", () => {
  it("changes only the selected purpose and uses distinct accessible labels", () => {
    function Form() {
      const [value, setValue] = useState(unknownConsent);
      return <ConsentFields value={value} onChange={setValue} />;
    }
    render(<Form />);
    fireEvent.change(screen.getByLabelText("Permission for external AI processing"), {
      target: { value: "granted" },
    });
    expect(screen.getByLabelText("Permission to keep notes")).toHaveValue("unknown");
    expect(screen.getByLabelText("Permission for reviewed sharing")).toHaveValue("unknown");
    expect(screen.getByText(/not independent verification/)).toBeVisible();
  });
  it("never creates a historical grant on load; explicit save persists separate choices and reloads", async () => {
    const first = mount();
    const ai = await screen.findByLabelText("Permission for external AI processing");
    expect(ai).toHaveValue("unknown");
    expect(h.set).not.toHaveBeenCalled();
    fireEvent.change(ai, { target: { value: "granted" } });
    fireEvent.click(screen.getByRole("button", { name: "Save privacy choices" }));
    await waitFor(() =>
      expect(h.set).toHaveBeenCalledWith({
        data: {
          ...scope,
          noteStatus: "unknown",
          aiStatus: "granted",
          sharingStatus: "unknown",
          policyVersion: 1,
          expectedRevision: 0,
        },
      }),
    );
    await screen.findByText(/Privacy choices saved/);
    first.unmount();
    mount();
    expect(await screen.findByLabelText("Permission for external AI processing")).toHaveValue(
      "granted",
    );
    expect(screen.getByLabelText("Permission for reviewed sharing")).toHaveValue("unknown");
  });
  it("keeps withdrawn learning restrictions visible and offers a manual path", async () => {
    stored = { ...stored, targetKind: "learning", evidenceInvalidated: true, revision: 2 };
    mount();
    expect(await screen.findByText(/Its AI permission cannot be restored/)).toBeVisible();
    expect(screen.getByText(/Keep working manually/)).toBeVisible();
  });
  it("shows a stale-save error and lets the owner reload without pretending it saved", async () => {
    h.set.mockRejectedValue(
      new Error("These privacy choices changed elsewhere. Reload them before saving again."),
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Save privacy choices" }));
    expect(await screen.findByText(/changed elsewhere/)).toBeVisible();
    expect(screen.queryByText(/Privacy choices saved/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload saved choices" }));
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));
  });
  it("fails closed on missing settings while retaining clear manual-work guidance", async () => {
    h.get.mockRejectedValue(new Error("private diagnostic"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Manual work remains available");
    expect(screen.queryByRole("button", { name: "Save privacy choices" })).not.toBeInTheDocument();
    expect(screen.queryByText("private diagnostic")).not.toBeInTheDocument();
  });
});
