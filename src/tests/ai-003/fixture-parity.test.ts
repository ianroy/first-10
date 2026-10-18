import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExistingKind } from "@/lib/prompts/private-v1";
const h = vi.hoisted(() => ({
  prepare: vi.fn(),
  write: vi.fn(),
  request: vi.fn(),
  budget: vi.fn(),
  claim: vi.fn(),
  settle: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/prompts/provenance.server", () => ({ prepareProvenanceWriter: h.prepare }));
vi.mock("@/lib/ai/gateway.server", () => ({ requestStructuredDraft: h.request }));
vi.mock("@/lib/ai/demo-marketing.server", () => ({ generateFictionalMarketingPractice: vi.fn() }));
vi.mock("@/lib/ai/budget.server", async (original) => ({
  ...(await original<typeof import("@/lib/ai/budget.server")>()),
  prepareAIBudget: h.budget,
}));
import { budgetInputBinding } from "@/lib/ai/budget.server";
import { budgetRoute, gatewayBilling } from "@/tests/ai-004/fixtures";
import { generateAI } from "@/lib/ai.functions";
import { getPrivateContractV2 } from "@/lib/prompts/private-v2";

type Case = {
  id: string;
  kind: ExistingKind;
  system: string;
  user: string;
  schema: object;
  permission_context: unknown;
  budget_binding_sha256: string;
  budget_input_bytes: number;
  selected_source_identities: unknown[];
  packing_omissions: Record<string, number>;
  input: {
    project: Record<string, string>;
    interviews: unknown[];
    learnings: unknown[];
    contacts: unknown[];
  };
};
const fixtures = JSON.parse(readFileSync("src/tests/ai-eval/fixtures.v5.json", "utf8")) as {
  cases: Case[];
};
const baseline = JSON.parse(readFileSync("evals/offline-baseline.v5.json", "utf8")) as {
  cases: { id: string; output: unknown }[];
};
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-fixture-key");
  vi.clearAllMocks();
  h.prepare.mockResolvedValue(h.write);
  h.write.mockResolvedValue("fa030000-0000-4000-8000-000000000001");
  h.request.mockResolvedValue({ ...gatewayBilling, data: { fixture: true } });
  h.budget.mockImplementation(async (scope) => ({
    route: { ...budgetRoute, kind: scope.kind },
    claim: h.claim,
    settle: h.settle,
    markUnknown: vi.fn(),
    cancelBeforeDispatch: vi.fn(),
  }));
});
describe("AI-003 reproducible evaluation inputs", () => {
  it.each(fixtures.cases)(
    "replays $id through the actual generateAI context assembly",
    async (c) => {
      const project = {
        ...c.input.project,
        id: "fa030000-0000-4000-8000-000000000002",
        user_id: "fa030000-0000-4000-8000-000000000003",
      };
      const from = (table: string) => {
        const rows =
          table === "interviews"
            ? c.input.interviews
            : table === "learnings"
              ? c.input.learnings
              : c.input.contacts;
        const q = {
          select: () => q,
          eq: () => q,
          single: async () => ({ data: project, error: null }),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: rows, error: null }).then(resolve),
        };
        return q;
      };
      h.request.mockImplementation(async (options) => ({
        ...gatewayBilling,
        data: options.outputValidator(baseline.cases.find((row) => row.id === c.id)!.output),
      }));
      await (generateAI as unknown as (args: unknown) => Promise<unknown>)({
        data: {
          kind: c.kind,
          projectId: project.id,
          operationId: "fa030000-0000-4000-8000-000000000004",
        },
        context: {
          supabase: {
            from,
            rpc: () => ({
              abortSignal: async () => ({
                data: { ok: true, data: c.permission_context },
                error: null,
              }),
            }),
          },
          userId: project.user_id,
        },
      });
      // Compare a boolean so even a broken environment stub never prints a real key.
      expect(h.request.mock.calls[0]?.[0].key === "synthetic-fixture-key").toBe(true);
      expect(h.request).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ kind: c.kind, system: c.system, user: c.user, schema: c.schema }),
      );
      const scope = h.budget.mock.calls[0]![0];
      expect(scope.operationId).toBe("fa030000-0000-4000-8000-000000000004");
      expect(budgetInputBinding(scope.context)).toEqual({
        contextSha256: c.budget_binding_sha256,
        inputBytes: c.budget_input_bytes,
      });
      expect(scope.contextFence.sources).toEqual(c.selected_source_identities);
      expect(scope.contextFence.omissions).toEqual(c.packing_omissions);
      expect(scope.contextFence.contextHash).toBe(c.budget_binding_sha256);
      expect(h.claim).toHaveBeenCalledOnce();
      expect(h.settle).toHaveBeenCalledWith(expect.objectContaining({ outputValid: true }));
      if (c.id === "stage3-edge-v5") {
        const user = h.request.mock.calls[0]?.[0].user;
        expect(user).toContain('"permission":');
        expect(user).not.toContain("WITHDRAWN_PRIVATE_NOTE");
        expect(user).not.toContain("WITHDRAWN_PRIVATE_QUOTE");
        expect(user).not.toContain("WITHDRAWN_DERIVED_SUMMARY");
        expect(user).not.toContain("WITHDRAWN_CONTACT_SOURCE");
      }
      expect(h.prepare).toHaveBeenCalledWith(
        expect.objectContaining({ contract: getPrivateContractV2(c.kind) }),
      );
    },
  );
  it("runs all offline scoring, binding, budget, failure and no-network checks under the normal Vitest command", () => {
    const output = execFileSync(process.execPath, ["--test", "src/tests/ai-eval/runner.test.mjs"], {
      encoding: "utf8",
      timeout: 20000,
    });
    expect(output).toContain("# tests 19");
    expect(output).toContain("# fail 0");
  }, 25000);
});
