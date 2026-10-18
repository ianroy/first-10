import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => submit }));
vi.mock("@/lib/founding-partners.functions", () => ({ submitFoundingPartner: vi.fn() }));
import { FoundingPartnersPage } from "@/components/partners/FoundingPartnersPage";
afterEach(cleanup);
beforeEach(() => {
  submit.mockReset();
});
function fill() {
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "teacher@example.edu" } });
  fireEvent.change(screen.getByLabelText(/School or institution/), {
    target: { value: "Example School" },
  });
}
it("offers a public example and educator destination with honest partner terms", () => {
  render(<FoundingPartnersPage />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Teach with First Ten.");
  expect(screen.getByText("Founding partners receive two semesters of free use.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Explore the example" })).toHaveAttribute(
    "href",
    "/demo",
  );
  expect(screen.getByRole("link", { name: "Educator sign in" })).toHaveAttribute(
    "href",
    "/auth?view=educator",
  );
  expect(screen.getByText(/No signup required/)).toBeVisible();
  expect(screen.getByText(/not a count of confirmed partners/)).toBeVisible();
  expect(screen.getByText(/stored privately/)).toBeVisible();
  expect(submit).not.toHaveBeenCalled();
});
it("sends explicit interest once, disables repeated submission, and acknowledges only confirmed receipt", async () => {
  let resolve!: (value: { ok: true }) => void;
  submit.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<FoundingPartnersPage />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Join founding partners" }));
  expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  expect(screen.queryByText("Request received.")).not.toBeInTheDocument();
  expect(submit).toHaveBeenCalledExactlyOnceWith({
    data: {
      email: "teacher@example.edu",
      school: "Example School",
      kind: "interest",
      note: "",
      website: "",
    },
  });
  resolve({ ok: true });
  await screen.findByRole("heading", { name: "Request received." });
  expect(screen.getByText(/No account was created or access automatically granted/)).toBeVisible();
});
it.each(["INVALID", "UNAVAILABLE", "RATE_LIMITED"])(
  "preserves entries after %s so the user can retry",
  async (code) => {
    submit.mockResolvedValue({ ok: false, code });
    render(<FoundingPartnersPage />);
    fill();
    fireEvent.change(screen.getByLabelText(/What would you like to try/), {
      target: { value: "My entrepreneurship class" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join founding partners" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText(/Email/)).toHaveValue("teacher@example.edu");
    expect(screen.getByLabelText(/What would you like to try/)).toHaveValue(
      "My entrepreneurship class",
    );
    expect(screen.queryByText("Request received.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join founding partners" })).toBeEnabled();
  },
);
it("requires a concrete feedback note and preserves it after a network failure", async () => {
  submit.mockRejectedValue(new Error("network"));
  render(<FoundingPartnersPage />);
  fill();
  fireEvent.click(screen.getByLabelText("Share feedback"));
  const note = screen.getByLabelText(/What worked/);
  expect(note).toBeRequired();
  expect(note).toHaveAttribute("maxlength", "2000");
  fireEvent.change(note, {
    target: { value: "The counterexample helped us narrow our audience." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("could not confirm receipt"),
  );
  expect(note).toHaveValue("The counterexample helped us narrow our audience.");
  expect(submit).toHaveBeenCalledWith({
    data: expect.objectContaining({
      kind: "feedback",
      note: "The counterexample helped us narrow our audience.",
    }),
  });
});
