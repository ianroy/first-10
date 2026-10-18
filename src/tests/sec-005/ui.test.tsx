import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const h = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  revoke: vi.fn(),
  accept: vi.fn(),
  getUser: vi.fn(),
  authEvent: null as null | ((event: string, session: { user: { id: string } } | null) => void),
}));
vi.mock("@/lib/invitations.functions", () => ({
  createInvitation: h.create,
  listInvitations: h.list,
  revokeInvitation: h.revoke,
  acceptInvitation: h.accept,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: h.getUser,
      onAuthStateChange: (fn: typeof h.authEvent) => {
        h.authEvent = fn;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
import { InvitationPage } from "@/routes/invite";
import { InvitationPanel } from "@/components/invitations/InvitationPanel";
const project = "f9500000-0000-4000-8000-000000000001";
const recipient = "f1000000-0000-4000-8000-000000000003";
const item = {
  id: project,
  projectId: project,
  recipientId: recipient,
  role: "viewer",
  expiresAt: "2026-10-25T12:00:00Z",
  revokedAt: null,
  acceptedAt: null,
  createdAt: "2026-10-18T12:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  h.authEvent = null;
  window.history.replaceState(null, "", "/invite");
  h.getUser.mockResolvedValue({ data: { user: { id: recipient } }, error: null });
  h.list.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
});
afterEach(cleanup);
describe("invitation review and one-time links", () => {
  it("strips fragment before authentication and never accepts automatically", async () => {
    window.history.replaceState(null, "", `/invite?tracking=ignored#invite=${"a".repeat(64)}`);
    h.getUser.mockImplementation(async () => {
      expect(window.location.hash).toBe("");
      expect(window.location.search).toBe("");
      return { data: { user: { id: recipient } }, error: null };
    });
    h.accept.mockResolvedValue({ ok: false, code: "FEATURE_DISABLED" });
    render(<InvitationPage />);
    const accept = await screen.findByRole("button", { name: "Accept project invitation" });
    expect(h.accept).not.toHaveBeenCalled();
    await act(async () => h.authEvent?.("INITIAL_SESSION", { user: { id: recipient } }));
    expect(accept).toBeVisible();
    fireEvent.click(accept);
    expect(await screen.findByRole("status")).toHaveTextContent("not enabled");
    expect(h.accept).toHaveBeenCalledWith({
      data: { targetType: "project", token: "a".repeat(64) },
    });
  });
  it("asks signed-out invitees to reopen the original link after sign-in without storing the secret", async () => {
    window.history.replaceState(null, "", `/invite#invite=${"a".repeat(64)}`);
    h.getUser.mockResolvedValue({ data: { user: null }, error: null });
    render(<InvitationPage />);
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth");
    expect(screen.getByText(/reopen the original invitation link/)).toBeVisible();
    expect(window.location.hash).toBe("");
    expect(h.accept).not.toHaveBeenCalled();
  });
  it("ignores a late acceptance receipt after the account changes", async () => {
    window.history.replaceState(null, "", `/invite#invite=${"a".repeat(64)}`);
    let release: ((value: unknown) => void) | undefined;
    h.accept.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<InvitationPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept project invitation" }));
    act(() => h.authEvent?.("SIGNED_OUT", null));
    await act(async () => release?.({ ok: true, data: { role: "viewer" } }));
    expect(screen.queryByText(/Invitation accepted as/)).not.toBeInTheDocument();
    expect(screen.getByText(/Your account changed/)).toBeVisible();
  });
  it("shows a first-create fragment link only after explicit creation", async () => {
    h.create.mockResolvedValue({ ok: true, data: item, token: "b".repeat(64), replayed: false });
    render(<InvitationPanel projectId={project} />);
    fireEvent.change(screen.getByLabelText("Recipient account ID"), {
      target: { value: recipient },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create private invite link" }));
    expect(await screen.findByLabelText("Private invitation link")).toHaveValue(
      `${window.location.origin}/invite#invite=${"b".repeat(64)}`,
    );
    expect(h.create.mock.calls[0]?.[0].data).toMatchObject({
      recipientId: recipient,
      role: "viewer",
      expiresInDays: 7,
    });
  });
  it("does not fabricate a link from hash-only replay metadata", async () => {
    h.create.mockResolvedValue({ ok: true, data: item, token: null, replayed: true });
    render(<InvitationPanel projectId={project} />);
    fireEvent.change(screen.getByLabelText("Recipient account ID"), {
      target: { value: recipient },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create private invite link" }));
    expect(await screen.findByRole("status")).toHaveTextContent("secret cannot be recovered");
    expect(screen.queryByLabelText("Private invitation link")).not.toBeInTheDocument();
  });
  it("does not carry an old project link into a changed project", async () => {
    h.create.mockResolvedValue({ ok: true, data: item, token: "b".repeat(64), replayed: false });
    const view = render(<InvitationPanel projectId={project} />);
    fireEvent.change(screen.getByLabelText("Recipient account ID"), {
      target: { value: recipient },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create private invite link" }));
    await screen.findByLabelText("Private invitation link");
    view.rerender(<InvitationPanel projectId="f9500000-0000-4000-8000-000000000002" />);
    await waitFor(() =>
      expect(screen.queryByLabelText("Private invitation link")).not.toBeInTheDocument(),
    );
  });
  it("replaces an in-memory capability when another invite opens in the same page", async () => {
    window.history.replaceState(null, "", `/invite#invite=${"a".repeat(64)}`);
    h.accept.mockResolvedValue({ ok: false, code: "FEATURE_DISABLED" });
    render(<InvitationPage />);
    await screen.findByRole("button", { name: "Accept project invitation" });
    act(() => {
      window.history.replaceState(null, "", `/invite#invite=${"c".repeat(64)}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(window.location.hash).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Accept project invitation" }));
    await waitFor(() =>
      expect(h.accept).toHaveBeenCalledWith({
        data: { targetType: "project", token: "c".repeat(64) },
      }),
    );
  });
});
