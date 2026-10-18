import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExistingKind } from "@/lib/prompts/private-v1";
const h = vi.hoisted(() => ({ prepare: vi.fn(), write: vi.fn(), request: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/prompts/provenance.server", () => ({ prepareProvenanceWriter: h.prepare }));
vi.mock("@/lib/ai/gateway.server", () => ({ requestStructuredDraft: h.request }));
vi.mock("@/lib/ai/demo-marketing.server", () => ({ generateFictionalMarketingPractice: vi.fn() }));
import { generateAI } from "@/lib/ai.functions";
import { getPrivateContract } from "@/lib/prompts/private-v1";

type Case = {
  id: string;
  kind: ExistingKind;
  system: string;
  user: string;
  schema: object;
  permission_context: unknown;
  input: {
    project: Record<string, string>;
    interviews: unknown[];
    learnings: unknown[];
    contacts: unknown[];
  };
};
const fixtures = JSON.parse(readFileSync("src/tests/ai-eval/fixtures.v3.json", "utf8")) as {
  cases: Case[];
};
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-fixture-key");
  vi.clearAllMocks();
  h.prepare.mockResolvedValue(h.write);
  h.write.mockResolvedValue("fa030000-0000-4000-8000-000000000001");
  h.request.mockResolvedValue({ data: { fixture: true } });
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
      await (generateAI as unknown as (args: unknown) => Promise<unknown>)({
        data: { kind: c.kind, projectId: project.id },
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
      if (c.id === "stage3-edge-v3") {
        const user = h.request.mock.calls[0]?.[0].user;
        expect(user).toContain("PRIVACY LIMITS");
        expect(user).not.toContain("WITHDRAWN_PRIVATE_NOTE");
        expect(user).not.toContain("WITHDRAWN_PRIVATE_QUOTE");
        expect(user).not.toContain("WITHDRAWN_DERIVED_SUMMARY");
        expect(user).not.toContain("WITHDRAWN_CONTACT_SOURCE");
      }
      expect(h.prepare).toHaveBeenCalledWith(
        expect.objectContaining({ contract: getPrivateContract(c.kind) }),
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
