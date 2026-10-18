import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const h = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => h.generate }));
vi.mock("@/lib/ai.functions", () => ({ generateAI: vi.fn() }));
import { LiveMarketingPractice } from "@/components/marketing/LiveMarketingPractice";
const projectId = "f1d00000-0000-4000-8000-000000000010";
const response = () => ({
  draft: {
    channel: "Proposed organizer introduction",
    hook: "Who is coming to your next study meeting?",
    body: "We are a student team exploring a fictional, untested coordination idea.",
    cta: "Ask permission for a short conversation.",
    accessCheck: "Permission is unknown.",
    peerCheck: "Can a peer explain the audience and useful action?",
    measurement: "Manually record consenting relevant conversations.",
    uncertainty: "No test has run.",
  },
  metadata: {
    requestId: "a1111111-1111-4111-8111-111111111111",
    promptVersion: "fictional-marketing-v1",
    model: "google/gemini-2.5-flash-lite",
    provider: "Google Vertex",
    costUsd: 0.0002,
    reservedCents: 2,
    remainingCents: 98,
    latencyMs: 1500,
    fictional: true,
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  h.generate.mockResolvedValue(response());
});
afterEach(cleanup);
it("only calls the authorized gateway on explicit request and sends no editable plan text", async () => {
  render(<LiveMarketingPractice projectId={projectId} />);
  expect(h.generate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Draft a $0 invitation with AI" }));
  await screen.findByText("AI practice proposal · fictional, untested and unsent");
  expect(h.generate).toHaveBeenCalledWith({ data: { kind: "marketing_demo", projectId } });
  expect(screen.getByText("$0.000200")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Edit the AI practice draft" })).toHaveValue(
    response().draft.body,
  );
  expect(screen.getByText(/No content is posted or added to your saved plan/)).toBeVisible();
});
it("keeps the prior editable practice draft on a later request failure", async () => {
  render(<LiveMarketingPractice projectId={projectId} />);
  fireEvent.click(screen.getByRole("button", { name: "Draft a $0 invitation with AI" }));
  const input = await screen.findByRole("textbox", { name: "Edit the AI practice draft" });
  fireEvent.change(input, { target: { value: "My reviewed practice revision" } });
  h.generate.mockRejectedValueOnce(new Error("private provider detail"));
  fireEvent.click(screen.getByRole("button", { name: "Draft a $0 invitation with AI" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("previous draft are unchanged");
  expect(input).toHaveValue("My reviewed practice revision");
  expect(screen.queryByText("private provider detail")).not.toBeInTheDocument();
});
it("rejects incompatible provider output and leaves actual cost unknown when absent", async () => {
  h.generate.mockResolvedValueOnce({
    ...response(),
    draft: { ...response().draft, body: "Visit https://invented.example" },
  });
  render(<LiveMarketingPractice projectId={projectId} />);
  fireEvent.click(screen.getByRole("button", { name: "Draft a $0 invitation with AI" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  h.generate.mockResolvedValueOnce({
    ...response(),
    metadata: { ...response().metadata, costUsd: null },
  });
  fireEvent.click(screen.getByRole("button", { name: "Draft a $0 invitation with AI" }));
  await waitFor(() =>
    expect(screen.getByText("Unavailable; 2¢ reservation retained")).toBeVisible(),
  );
});

it("preserves edited prior drafts on regeneration and disables editing while the paid request is pending", async () => {
  render(<LiveMarketingPractice projectId={projectId} />);
  fireEvent.click(screen.getByRole("button", { name: "Draft a $0 invitation with AI" }));
  const editor = await screen.findByRole("textbox", { name: "Edit the AI practice draft" });
  fireEvent.change(editor, { target: { value: "My first reviewed draft must remain available" } });
  let resolveRequest!: (value: ReturnType<typeof response>) => void;
  h.generate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Draft a $0 invitation with AI" }));
  expect(editor).toBeDisabled();
  const next = response();
  next.draft.body = "A second fictional student invitation.";
  resolveRequest(next);
  await waitFor(() => expect(editor).toHaveValue(next.draft.body));
  const disclosure = screen.getByText("Previous practice drafts (1) · temporary");
  fireEvent.click(disclosure);
  expect(screen.getByText("My first reviewed draft must remain available")).toBeVisible();
});
