import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ prepare: vi.fn(), write: vi.fn(), request: vi.fn(), demo: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/prompts/provenance.server", () => ({ prepareProvenanceWriter: h.prepare }));
vi.mock("@/lib/ai/gateway.server", () => ({ requestStructuredDraft: h.request }));
vi.mock("@/lib/ai/demo-marketing.server", () => ({ generateFictionalMarketingPractice: h.demo }));
import { generateAI } from "@/lib/ai.functions";
import { validateAIOutput } from "@/lib/ai/contracts";
import type { ExistingKind } from "@/lib/prompts/private-v1";
const outputs = {
  questions: { questions: ["Recent situation?"] },
  synthesis: { problems: [], objections: [], best_fit: [], quotes: [], changes: [] },
  stage2: { channels: [], drafts: [], survey: [] },
  stage3: { channels: [], referral_asks: [], onboarding_questions: [] },
};
const project = {
  id: "f2000000-0000-4000-8000-000000000001",
  user_id: "f1000000-0000-4000-8000-000000000001",
  name: "Fixture",
  description: "PRIVATE",
  audience: "Students",
  problem: "Planning",
};
const sb = {
  from: (table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      single: async () => ({ data: project, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: table === "interviews" ? [{ answers: { note: "PRIVATE" }, tags: [] }] : [],
          error: null,
        }).then(resolve),
    };
    return q;
  },
};
const invoke = (kind: string) =>
  (generateAI as unknown as (args: unknown) => Promise<unknown>)({
    data: { kind, projectId: project.id },
    context: { supabase: sb, userId: project.user_id },
  });
beforeEach(() => {
  vi.clearAllMocks();
  h.prepare.mockResolvedValue(h.write);
  h.write.mockResolvedValue(undefined);
});
describe("generateAI legacy response compatibility", () => {
  it.each(Object.keys(outputs) as ExistingKind[])(
    "records successful %s metadata before returning unchanged strict output",
    async (kind) => {
      const result = {
        data: outputs[kind],
        requestedModel: "fixture",
        actualModel: null,
        provider: null,
        usage: null,
        generationId: null,
        attempts: 1,
      };
      h.request.mockResolvedValue(result);
      expect(validateAIOutput(kind, await invoke(kind))).toEqual(outputs[kind]);
      expect(h.prepare).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: project.id,
          userId: project.user_id,
          projectOwnerId: project.user_id,
        }),
      );
      expect(h.write).toHaveBeenCalledWith(result);
      expect(h.request.mock.calls[0]?.[0].user).toContain("APP: Fixture\nWhat it does: PRIVATE");
    },
  );
  it("never returns a successful draft when provenance cannot commit", async () => {
    h.request.mockResolvedValue({ data: outputs.questions });
    h.write.mockRejectedValue(new Error("Record failed"));
    await expect(invoke("questions")).rejects.toThrow("Record failed");
    expect(h.request).toHaveBeenCalledTimes(1);
  });
  it("does not persist a failed provider generation", async () => {
    h.request.mockRejectedValue(new Error("Provider failed"));
    await expect(invoke("questions")).rejects.toThrow("Provider failed");
    expect(h.write).not.toHaveBeenCalled();
  });
  it("keeps the specialized fictional marketing route separate", async () => {
    h.demo.mockResolvedValue({ body: "Fixture" });
    expect(await invoke("marketing_demo")).toEqual({ body: "Fixture" });
    expect(h.prepare).not.toHaveBeenCalled();
    expect(h.request).not.toHaveBeenCalled();
  });
});
