import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ accept: vi.fn() }));
vi.mock("@/lib/invitations.functions", () => ({ acceptInvitation: h.accept }));
import { ClassInvitationAcceptance } from "@/components/invitations/ClassInvitationAcceptance";
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it.each([
  ["NOT_FOUND", "unavailable, expired, revoked or intended for another account"],
  ["REVISION_CONFLICT", "Ask the owner for a new invitation"],
  ["AUTH_REQUIRED", "Sign in with the intended account"],
])("a %s invitation failure never implies enrollment or project sharing", async (code, message) => {
  h.accept.mockResolvedValue({ ok: false, code });
  const onAccepted = vi.fn();
  render(<ClassInvitationAcceptance token={"a".repeat(64)} onAccepted={onAccepted} />);
  expect(h.accept).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Your classroom alias"), {
    target: { value: "My alias" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Accept class invitation" }));
  expect(await screen.findByRole("status")).toHaveTextContent(message);
  expect(onAccepted).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Your classroom alias")).toHaveValue("My alias");
  expect(
    screen.getByText(/shares no private project, interview notes or AI permission/),
  ).toBeVisible();
});
