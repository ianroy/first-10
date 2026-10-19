import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const generate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => generate }));
vi.mock("@/lib/ai.functions", () => ({ generateAI: vi.fn() }));
import { RuntimeAIEvaluation } from "@/components/admin/RuntimeAIEvaluation";
import { runtimeCaseOperationId, type RuntimeCaseId } from "@/lib/ai/runtime-evaluation-contract";
const projectId = "f1d00000-0000-4000-8000-000000000010";
const receipt = (caseId: RuntimeCaseId = "questions-typical-v7") => ({
  version: "first-ten-runtime-evaluation-v7",
  caseId,
  kind: "questions",
  operationId: runtimeCaseOperationId(caseId),
  contextSha256: "a".repeat(64),
  routeVersion: 1,
  model: "google/gemini-3.1-flash-lite",
  provider: "Google",
  generationId: "gen-fictional-ui",
  costUsd: 0.001,
  latencyMs: 1000,
  draft: { questions: ["What happened last time?"] },
  grounding: { observations: [], inferences: [], missingEvidence: ["Fictional software fixture"] },
  fictional: true,
});
beforeEach(() => {
  vi.resetAllMocks();
  generate.mockResolvedValue(receipt());
});
afterEach(cleanup);
it("requires deliberate selection, uses the stable case ID and prevents duplicate paid intents", async () => {
  render(<RuntimeAIEvaluation projectId={projectId} />);
  expect(generate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Run this fictional model check" }));
  await screen.findByText(/Fictional draft received/);
  expect(generate).toHaveBeenCalledExactlyOnceWith({
    data: {
      kind: "runtime_evaluation",
      projectId,
      evaluationCaseId: "questions-typical-v7",
      operationId: runtimeCaseOperationId("questions-typical-v7"),
    },
  });
  expect(screen.getByRole("button", { name: "Run this fictional model check" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Prepared case"), {
    target: { value: "questions-edge-v7" },
  });
  generate.mockResolvedValue(receipt("questions-edge-v7"));
  fireEvent.click(screen.getByRole("button", { name: "Run this fictional model check" }));
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
  expect(generate.mock.calls[1]![0].data.operationId).toBe(
    runtimeCaseOperationId("questions-edge-v7"),
  );
});
it("stops every further attempt after an ambiguous failure without retrying", async () => {
  generate.mockRejectedValue(new Error("PRIVATE PROVIDER ERROR"));
  render(<RuntimeAIEvaluation projectId={projectId} />);
  fireEvent.click(screen.getByRole("button", { name: "Run this fictional model check" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("combobox")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Run this fictional model check" })).toBeDisabled();
  expect(generate).toHaveBeenCalledOnce();
  expect(screen.queryByText(/PRIVATE PROVIDER ERROR/)).not.toBeInTheDocument();
});
it("withholds a mismatched case receipt", async () => {
  generate.mockResolvedValue(receipt("questions-edge-v7"));
  render(<RuntimeAIEvaluation projectId={projectId} />);
  fireEvent.click(screen.getByRole("button", { name: "Run this fictional model check" }));
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("button", { name: "Download model-check receipts" }),
  ).not.toBeInTheDocument();
});
it("keeps the checks disabled in another project", () => {
  render(<RuntimeAIEvaluation projectId="00000000-0000-4000-8000-000000000001" />);
  expect(screen.getByRole("button", { name: "Run this fictional model check" })).toBeDisabled();
  expect(generate).not.toHaveBeenCalled();
});
