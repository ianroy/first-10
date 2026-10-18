import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  input: {
    project: Record<string, string>;
    interviews: unknown[];
    learnings: unknown[];
    contacts: unknown[];
  };
};
const fixtures = JSON.parse(readFileSync("src/tests/ai-eval/fixtures.v2.json", "utf8")) as {
  cases: Case[];
};
beforeEach(() => {
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
        context: { supabase: { from }, userId: project.user_id },
      });
      expect(h.request).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ kind: c.kind, system: c.system, user: c.user, schema: c.schema }),
      );
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
