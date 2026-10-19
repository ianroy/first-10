import { assembleAIContextV2 } from "../prompts/context-v2.ts";
import { budgetInputBinding } from "./budget-binding.ts";
import { runtimeEvaluationCases } from "./runtime-evaluation-cases.v7.ts";
import { runtimeCaseIdSchema, RUNTIME_EVALUATION_VERSION } from "./runtime-evaluation-contract.ts";

export function getRuntimeEvaluationCase(id: unknown) {
  const caseId = runtimeCaseIdSchema.parse(id);
  const source = runtimeEvaluationCases.find((c) => c.id === caseId);
  if (!source) throw new Error("Unknown fixed evaluation case");
  const context = assembleAIContextV2(
    source.permissionContext,
    source.permissionContext.projectId,
    source.kind,
  );
  return {
    id: caseId,
    kind: source.kind,
    reviewFocus: source.reviewFocus,
    ...context,
    binding: budgetInputBinding(context.assembled),
  };
}
export function runtimeEvaluationBindings() {
  return {
    version: RUNTIME_EVALUATION_VERSION,
    cases: runtimeCaseIdSchema.options.map((id) => {
      const c = getRuntimeEvaluationCase(id);
      return { id, kind: c.kind, ...c.binding, reviewFocus: c.reviewFocus };
    }),
  };
}
