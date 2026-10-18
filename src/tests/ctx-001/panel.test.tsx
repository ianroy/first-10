import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  load: vi.fn(),
  retrieve: vi.fn(),
  review: vi.fn(),
  withdraw: vi.fn(),
}));
vi.mock("@/lib/context.functions", () => ({
  loadPublicContext: h.load,
  retrievePublicContext: h.retrieve,
  reviewPublicContext: h.review,
  withdrawPublicContext: h.withdraw,
}));
import { RemoteContextPanel } from "@/components/discovery/RemoteContextPanel";
vi.mock("@/components/export/OwnerActivityExport", () => ({
  OwnerActivityExport: () => <div>Private source PDF export</div>,
}));
const projectId = "fa190000-0000-4000-8000-000000000010",
  ownerId = "fa190000-0000-4000-8000-000000000001";
const preview = {
  id: "fa190000-0000-4000-8000-000000000020",
  projectId,
  previewPermission: true,
  operationId: "fa190000-0000-4000-8000-000000000021",
  kind: "website",
  retrievedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 900000).toISOString(),
  source: {
    url: "https://product.example.org/",
    title: "Public product",
    format: "plain_text",
    contentHash: "a".repeat(64),
    previewHash: "b".repeat(64),
    text: "A public unverified author claim.",
    bytes: 33,
    commitSha: null,
    path: null,
    blobSha: null,
  },
};
const source = {
  id: "fa190000-0000-4000-8000-000000000030",
  previewId: preview.id,
  projectId,
  reviewedAt: new Date().toISOString(),
  revision: 1,
  status: "active",
  label: "Reviewed product",
  excerpt: preview.source.text,
  excerptHash: "c".repeat(64),
  storagePermission: "own_or_permitted",
  aiPermission: "unknown",
  sharingPermission: "unknown",
  source: { ...preview.source, text: undefined },
};
function open() {
  const result = render(<RemoteContextPanel projectId={projectId} ownerId={ownerId} />);
  result.container.querySelector("details")!.open = true;
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  h.load.mockResolvedValue({ ok: true, previews: [preview], reviewed: [] });
  h.retrieve.mockResolvedValue({ ok: true });
  h.review.mockResolvedValue({ ok: true, source });
  h.withdraw.mockResolvedValue({
    ok: true,
    source: {
      id: source.id,
      previewId: source.previewId,
      projectId,
      reviewedAt: source.reviewedAt,
      revision: 2,
      status: "withdrawn",
    },
  });
});
describe("CTX001 desktop public source review panel", () => {
  it("requires explicit preview storage permission before retrieval and leaves manual links unchanged", async () => {
    open();
    await screen.findByLabelText("Retrieved text (untrusted, not reviewed)");
    const button = screen.getByRole("button", { name: "Retrieve public preview" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Public HTTPS URL"), {
      target: { value: "https://another.example.org/" },
    });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I may retrieve and store/));
    fireEvent.click(button);
    await waitFor(() => expect(h.retrieve).toHaveBeenCalledOnce());
    expect(h.retrieve.mock.calls[0]![0].data).toMatchObject({
      projectId,
      kind: "website",
      url: "https://another.example.org/",
      paths: [],
      previewPermission: true,
    });
    expect(h.retrieve.mock.calls[0]![0].data.operationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(screen.getByText(/Existing stored links stay unread/)).toBeInTheDocument();
  });
  it("requires reading and separate storage permission, saves an exact excerpt and labels AI exclusion", async () => {
    open();
    await screen.findByLabelText("Retrieved text (untrusted, not reviewed)");
    fireEvent.click(screen.getByRole("button", { name: "Use entire preview" }));
    fireEvent.change(screen.getByLabelText("Your source label"), {
      target: { value: "Reviewed product" },
    });
    const save = screen.getByRole("button", { name: "Save reviewed source" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I read this excerpt/));
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I own this material or have permission/));
    fireEvent.click(save);
    await screen.findByText("Owner reviewed · AI excluded");
    expect(h.review).toHaveBeenCalledWith({
      data: {
        projectId,
        previewId: preview.id,
        expectedHash: preview.source.previewHash,
        label: "Reviewed product",
        excerpt: preview.source.text,
        storagePermission: true,
      },
    });
    expect(
      screen.queryByLabelText("Retrieved text (untrusted, not reviewed)"),
    ).not.toBeInTheDocument();
  });
  it("protects a local review draft during refresh and preserves it after capacity failure", async () => {
    h.review.mockResolvedValue({ ok: false, code: "CAPACITY" });
    open();
    await screen.findByLabelText("Retrieved text (untrusted, not reviewed)");
    fireEvent.click(screen.getByRole("button", { name: "Use entire preview" }));
    fireEvent.change(screen.getByLabelText("Your source label"), {
      target: { value: "Keep this draft" },
    });
    expect(screen.getByRole("button", { name: "Refresh sources" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I read this excerpt/));
    fireEvent.click(screen.getByLabelText(/I own this material or have permission/));
    fireEvent.click(screen.getByRole("button", { name: "Save reviewed source" }));
    await screen.findByText(/already has 20 reviewed source versions/);
    expect(screen.getByLabelText("Your source label")).toHaveValue("Keep this draft");
    expect(screen.getByLabelText("Exact excerpt to keep (up to 6,000 characters)")).toHaveValue(
      preview.source.text,
    );
  });
  it("withdraws on an archived project and removes source contents immediately", async () => {
    h.load.mockResolvedValue({ ok: true, previews: [], reviewed: [source] });
    const result = render(<RemoteContextPanel projectId={projectId} ownerId={ownerId} archived />);
    result.container.querySelector("details")!.open = true;
    await screen.findByText("Reviewed product");
    expect(screen.getByRole("button", { name: "Retrieve public preview" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw Reviewed product" }));
    await screen.findByText(/Withdrawn source · contents hidden/);
    expect(screen.queryByText(preview.source.text)).not.toBeInTheDocument();
    expect(h.withdraw).toHaveBeenCalledWith({
      data: { projectId, sourceId: source.id, expectedRevision: 1 },
    });
  });
  it("ignores a late response from a previous owner/project without loading its sources again", async () => {
    let resolve!: (v: unknown) => void;
    h.retrieve.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const result = open();
    await screen.findByLabelText("Retrieved text (untrusted, not reviewed)");
    fireEvent.change(screen.getByLabelText("Public HTTPS URL"), {
      target: { value: "https://another.example.org/" },
    });
    fireEvent.click(screen.getByLabelText(/I may retrieve and store/));
    fireEvent.click(screen.getByRole("button", { name: "Retrieve public preview" }));
    await waitFor(() => expect(h.retrieve).toHaveBeenCalledOnce());
    h.load.mockResolvedValue({ ok: true, previews: [], reviewed: [] });
    result.rerender(
      <RemoteContextPanel
        key="new-idea"
        projectId="fa190000-0000-4000-8000-000000000099"
        ownerId={ownerId}
      />,
    );
    result.container.querySelector("details")!.open = true;
    await screen.findByText(/No public-source previews/);
    await act(async () => resolve({ ok: true }));
    expect(h.load).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(preview.source.text)).not.toBeInTheDocument();
  });
  it("shows the safe disabled fallback without losing an entered URL", async () => {
    h.retrieve.mockResolvedValue({ ok: false, code: "DISABLED" });
    open();
    await screen.findByLabelText("Retrieved text (untrusted, not reviewed)");
    fireEvent.change(screen.getByLabelText("Public HTTPS URL"), {
      target: { value: "https://another.example.org/" },
    });
    fireEvent.click(screen.getByLabelText(/I may retrieve and store/));
    fireEvent.click(screen.getByRole("button", { name: "Retrieve public preview" }));
    await screen.findByText(/Public retrieval is not enabled here yet/);
    expect(screen.getByLabelText("Public HTTPS URL")).toHaveValue("https://another.example.org/");
    expect(screen.getByLabelText("Retrieved text (untrusted, not reviewed)")).toHaveValue(
      preview.source.text,
    );
  });
});
