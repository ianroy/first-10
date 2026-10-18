import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage } from "@/test/render-page";
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  signUp: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
import { AuthPage } from "@/routes/auth";
beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});
afterEach(cleanup);
it.each([
  ["%2Fclasses", "/classes"],
  ["https%3A%2F%2Fexample.invalid", "/teacher"],
])("limits educator return destinations to the classroom route (%s)", async (next, destination) => {
  auth.signInWithPassword.mockResolvedValue({
    data: { user: { id: "ordinary-teacher" } },
    error: null,
  });
  renderPage(AuthPage, "/auth", `/auth?view=educator&next=${next}`);
  await screen.findByRole("heading", { name: "Continue your learning" });
  fireEvent.change(screen.getByLabelText("Email or demo username"), {
    target: { value: "teacher@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "test-secret" },
  });
  fireEvent.submit(screen.getByLabelText("Password", { exact: true }).closest("form")!);
  expect(await screen.findByText(`at ${destination}`)).toBeInTheDocument();
});
it("keeps sign-in available for an existing account instead of redirecting into setup", async () => {
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: "ordinary-user" } } } });
  renderPage(AuthPage, "/auth");
  expect(await screen.findByText(/An account is already signed in/)).toBeInTheDocument();
  expect(screen.getByLabelText("Email or demo username")).toBeInTheDocument();
  expect(screen.queryByText("at /dashboard")).not.toBeInTheDocument();
});
it.each([
  ["Admin", "/admin"],
  ["Educator", "/teacher"],
  ["Student", "/dashboard"],
])(
  "opens the selected %s dashboard after signing into the seeded presenter account",
  async (role, destination) => {
    const userId = "f1d00000-0000-4000-8000-000000000001";
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    renderPage(AuthPage, "/auth");
    await screen.findByRole("heading", { name: "Continue your learning" });
    fireEvent.click(screen.getByRole("button", { name: role }));
    fireEvent.change(screen.getByLabelText("Email or demo username"), {
      target: { value: "ianroy" },
    });
    fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
      target: { value: "test-secret" },
    });
    fireEvent.submit(screen.getByLabelText("Password", { exact: true }).closest("form")!);
    expect(await screen.findByText(`at ${destination}`)).toBeInTheDocument();
    expect(localStorage.getItem(`firstten:selected-project:${userId}`)).toBe(
      "f1d00000-0000-4000-8000-000000000010",
    );
  },
);
it("uses the dedicated demo identity for username sign-in and retains errors without exposing a password", async () => {
  auth.signInWithPassword.mockResolvedValue({ error: new Error("Invalid login credentials") });
  renderPage(AuthPage, "/auth");
  await screen.findByRole("heading", { name: "Continue your learning" });
  fireEvent.change(screen.getByLabelText("Email or demo username"), {
    target: { value: "ianroy" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "test-secret" },
  });
  fireEvent.submit(screen.getByLabelText("Password", { exact: true }).closest("form")!);
  await waitFor(() =>
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "workshop-presenter@firstten-demo.invalid",
      password: "test-secret",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid login credentials");
  expect(screen.queryByText("test-secret")).not.toBeInTheDocument();
  expect(auth.signUp).not.toHaveBeenCalled();
});
it("creates ordinary accounts with email and no client-provided admin role", async () => {
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  renderPage(AuthPage, "/auth");
  await screen.findByRole("heading", { name: "Continue your learning" });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  fireEvent.change(screen.getByLabelText("Your email"), {
    target: { value: "student@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "test-secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create my account" }));
  await waitFor(() =>
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "student@example.test",
      password: "test-secret",
      options: { emailRedirectTo: `${window.location.origin}/auth?callback=true&view=student` },
    }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("Check your inbox");
});
it("keeps the password-free email link and public example available", async () => {
  auth.signInWithOtp.mockResolvedValue({ error: null });
  renderPage(AuthPage, "/auth");
  await screen.findByRole("heading", { name: "Continue your learning" });
  expect(screen.getByRole("link", { name: /Explore the example first/ })).toHaveAttribute(
    "href",
    "/demo",
  );
  fireEvent.click(screen.getByRole("button", { name: "Email link" }));
  expect(screen.queryByLabelText("Password", { exact: true })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Your email"), {
    target: { value: "student@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Email me a magic link" }));
  await waitFor(() =>
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "student@example.test",
      options: { emailRedirectTo: `${window.location.origin}/auth?callback=true&view=student` },
    }),
  );
});
