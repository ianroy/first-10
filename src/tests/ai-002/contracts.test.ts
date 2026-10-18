import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPrivateContract, type ExistingKind } from "@/lib/prompts/private-v1";
import { requestStructuredDraft, DEFAULT_MODEL } from "@/lib/ai/gateway.server";
import { validateAIOutput } from "@/lib/ai/contracts";
import { budgetRoute } from "@/tests/ai-004/fixtures";
const legacy = JSON.parse(readFileSync("src/tests/ai-002/legacy-contracts.json", "utf8"));
const outputs = {
  questions: { questions: ["What happened last time?"] },
  synthesis: { problems: [], objections: [], best_fit: [], quotes: [], changes: [] },
  stage2: { channels: [], drafts: [], survey: [] },
  stage3: { channels: [], referral_asks: [], onboarding_questions: [] },
};
function strict(schema: object) {
  const s = schema as {
    type?: string;
    required?: string[];
    properties?: Record<string, object>;
    additionalProperties?: boolean;
    items?: object;
  };
  if (s.type === "object") {
    expect(s.required).toEqual(Object.keys(s.properties ?? {}));
    expect(s.additionalProperties).toBe(false);
    Object.values(s.properties ?? {}).forEach(strict);
  }
  if (s.items) strict(s.items);
}
describe("AI-002 frozen legacy contracts", () => {
  it.each(Object.keys(outputs) as ExistingKind[])(
    "preserves %s wording, schema and required-property parity",
    (kind) => {
      const contract = getPrivateContract(kind);
      expect(contract.system).toBe(legacy.system);
      expect(contract.task).toBe(legacy.tasks[kind]);
      expect(contract.schema).toEqual(legacy.schemas[kind]);
      expect(contract.promptId).toBe(`first-ten.${kind}`);
      expect(contract.schemaId).toBe(`first-ten.${kind}.output`);
      expect(contract.promptVersion).toBe(1);
      expect(contract.schemaVersion).toBe(1);
      strict(contract.schema);
      expect(validateAIOutput(kind, outputs[kind])).toEqual(outputs[kind]);
      expect(() => validateAIOutput(kind, { ...outputs[kind], provenance: "extra" })).toThrow();
    },
  );
  it.each([undefined, "actual-provider-model"])(
    "reports actual model separately without inventing a provider model (%s)",
    async (model) => {
      const result = await requestStructuredDraft({
        key: "fixture",
        kind: "questions",
        route: { ...budgetRoute, model: DEFAULT_MODEL },
        schema: getPrivateContract("questions").schema,
        system: "fixture",
        user: "fixture",
        fetcher: async () =>
          new Response(
            JSON.stringify({
              ...(model ? { model, provider: "Fixture provider", id: "provider-fixture" } : {}),
              choices: [
                { message: { content: JSON.stringify(outputs.questions) }, finish_reason: "stop" },
              ],
            }),
          ),
      });
      expect(result.requestedModel).toBe(DEFAULT_MODEL);
      expect(result.actualModel).toBe(model ?? null);
      expect(result.model).toBe(model ?? DEFAULT_MODEL); // Existing specialized consumer compatibility.
      expect(result.provider).toBe(model ? "Fixture provider" : null);
      expect(result.data).toEqual(outputs.questions);
    },
  );
});
