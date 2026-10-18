import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), revoke: vi.fn(), accept: vi.fn() }));
vi.mock("@/lib/invitations.functions", () => ({
  createInvitation: h.create,
  listClassInvitations: h.list,
  revokeClassInvitation: h.revoke,
  acceptInvitation: h.accept,
}));
import { ClassInvitationPanel } from "@/components/invitations/ClassInvitationPanel";
import { ClassInvitationAcceptance } from "@/components/invitations/ClassInvitationAcceptance";
const id = "fc010000-0000-4000-8000-000000000001";
const next = "fc010000-0000-4000-8000-000000000002";
const item = {
  id,
  classId: id,
  recipientId: next,
  role: "student",
  expiresAt: "2026-10-25T12:00:00Z",
  createdAt: "2026-10-18T12:00:00Z",
  revokedAt: null,
  acceptedAt: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  h.list.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
});
afterEach(cleanup);
describe("class invitation components", () => {
  it("requires a chosen alias and explicit acceptance; no automatic joins", async () => {
    h.accept.mockResolvedValue({
      ok: true,
      data: { classId: id, invitationId: id, role: "student", membershipRevision: 1 },
    });
    const onAccepted = vi.fn();
    render(<ClassInvitationAcceptance token={"a".repeat(64)} onAccepted={onAccepted} />);
    expect(h.accept).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Accept class invitation" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your classroom alias"), {
      target: { value: " Classroom alias " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept class invitation" }));
    expect(await screen.findByRole("status")).toHaveTextContent("private projects remain private");
    expect(h.accept).toHaveBeenCalledWith({
      data: { targetType: "class", token: "a".repeat(64), displayLabel: "Classroom alias" },
    });
    expect(onAccepted).toHaveBeenCalledWith(id);
  });
  it("ignores late receipts when the parent remounts after account or token changes", async () => {
    let release: ((value: unknown) => void) | undefined;
    h.accept.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const onAccepted = vi.fn();
    const view = render(
      <ClassInvitationAcceptance key="accountA" token={"a".repeat(64)} onAccepted={onAccepted} />,
    );
    fireEvent.change(screen.getByLabelText("Your classroom alias"), {
      target: { value: "Old alias" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept class invitation" }));
    view.rerender(
      <ClassInvitationAcceptance key="accountB" token={"b".repeat(64)} onAccepted={onAccepted} />,
    );
    await act(async () => release?.({ ok: true, data: { classId: id } }));
    expect(onAccepted).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your classroom alias")).toHaveValue("");
  });
  it("shows class-specific one-time fragment only after explicit owner creation", async () => {
    h.create.mockResolvedValue({ ok: true, data: item, token: "b".repeat(64), replayed: false });
    render(<ClassInvitationPanel classId={id} />);
    fireEvent.change(screen.getByLabelText("Student account ID"), { target: { value: next } });
    fireEvent.click(screen.getByRole("button", { name: "Create student invitation" }));
    expect(await screen.findByLabelText("Private class invitation")).toHaveValue(
      `${window.location.origin}/invite#class-invite=${"b".repeat(64)}`,
    );
    expect(h.create.mock.calls[0]?.[0].data).toMatchObject({
      targetType: "class",
      targetId: id,
      recipientId: next,
      role: "student",
      expiresInDays: 7,
    });
  });
  it("retains request ID after an unconfirmed write, then cannot invent a secret on replay", async () => {
    h.create
      .mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" })
      .mockResolvedValueOnce({ ok: true, data: item, token: null, replayed: true });
    render(<ClassInvitationPanel classId={id} />);
    fireEvent.change(screen.getByLabelText("Student account ID"), { target: { value: next } });
    fireEvent.click(screen.getByRole("button", { name: "Create student invitation" }));
    expect(await screen.findByRole("status")).toHaveTextContent("could not be confirmed");
    fireEvent.click(screen.getByRole("button", { name: "Create student invitation" }));
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("status")).toHaveTextContent("secret cannot be recovered");
    expect(h.create.mock.calls[0]?.[0].data.requestId).toBe(
      h.create.mock.calls[1]?.[0].data.requestId,
    );
    expect(screen.queryByLabelText("Private class invitation")).not.toBeInTheDocument();
  });
  it("clears the old class link and ignores pending reads after class switching", async () => {
    h.create.mockResolvedValue({ ok: true, data: item, token: "b".repeat(64), replayed: false });
    const view = render(<ClassInvitationPanel classId={id} />);
    fireEvent.change(screen.getByLabelText("Student account ID"), { target: { value: next } });
    fireEvent.click(screen.getByRole("button", { name: "Create student invitation" }));
    await screen.findByLabelText("Private class invitation");
    let release: ((value: unknown) => void) | undefined;
    h.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    view.rerender(<ClassInvitationPanel classId={next} />);
    expect(screen.queryByLabelText("Private class invitation")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Student account ID")).toHaveValue("");
    view.rerender(<ClassInvitationPanel classId={id} />);
    await act(async () => release?.({ ok: true, data: { items: [item], nextCursor: null } }));
    expect(
      screen.queryByRole("button", { name: "Revoke class invitation" }),
    ).not.toBeInTheDocument();
  });
  it("offers actual revocation with owner class scope and no message sending", async () => {
    h.list.mockResolvedValueOnce({ ok: true, data: { items: [item], nextCursor: null } });
    h.revoke.mockResolvedValue({ ok: true, data: { ...item, revokedAt: item.createdAt } });
    render(<ClassInvitationPanel classId={id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke class invitation" }));
    expect(await screen.findByRole("status")).toHaveTextContent("revoked");
    expect(h.revoke.mock.calls[0]?.[0].data).toMatchObject({ classId: id, invitationId: id });
  });
});
