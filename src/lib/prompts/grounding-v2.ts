import { z } from "zod";
import { validateAIOutput } from "../ai/contracts.ts";
import type { ExistingKind } from "./private-v1.ts";
import type { AISource, OmissionCounts } from "./context-v2.ts";
const sourceId = z.string().regex(/^src_[a-f0-9]{64}$/);
const path = z
  .string()
  .max(120)
  .regex(/^(\/[a-z_]+|\/[0-9]+){1,4}$/);
const observation = z.object({ path, sourceId, quote: z.string().min(1).max(2400) }).strict();
const inference = z
  .object({
    path,
    category: z.enum(["inference", "proposal"]),
    sourceIds: z.array(sourceId).max(8),
  })
  .strict();
export const missingReasons = [
  "authenticity_unverified",
  "omitted_sources",
  "insufficient_evidence",
  "contradictory_evidence",
] as const;
const missing = z
  .object({ reason: z.enum(missingReasons), message: z.string().trim().min(1).max(500) })
  .strict();
const grounding = z
  .object({
    observations: z.array(observation).max(20),
    inferences: z.array(inference).max(140),
    missingEvidence: z.array(missing).min(1).max(4),
  })
  .strict();
export type GroundingReceipt = {
  path: string;
  category: "observation" | "inference" | "proposal" | "missing_evidence";
  sourceIds: string[];
}[];
const string = { type: "string" };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const groundingJSONSchema = obj({
  observations: {
    type: "array",
    maxItems: 20,
    items: obj({ path: string, sourceId: string, quote: string }),
  },
  inferences: {
    type: "array",
    maxItems: 140,
    items: obj({
      path: string,
      category: { enum: ["inference", "proposal"] },
      sourceIds: { type: "array", maxItems: 8, items: string },
    }),
  },
  missingEvidence: {
    type: "array",
    minItems: 1,
    maxItems: 4,
    items: obj({ reason: { enum: missingReasons }, message: string }),
  },
});
function leaves(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${prefix}/${i}`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => leaves(v, `${prefix}/${k}`));
  return [];
}
const whitespace = (s: string) => s.replace(/\s+/gu, " ").trim();
/** IDs bind only to authorized literal records; this validates references, never respondent authenticity. */
export function validateGroundedOutput(
  kind: ExistingKind,
  value: unknown,
  sources: AISource[],
  omissions: OmissionCounts,
) {
  const wrapper = z.object({ draft: z.unknown(), grounding }).strict().parse(value);
  const draft = validateAIOutput(kind, wrapper.draft);
  const paths = new Map(leaves(draft));
  const catalog = new Map(sources.map((s) => [s.sourceId, s]));
  const seen = new Set<string>();
  const receipt: GroundingReceipt = [];
  for (const obs of wrapper.grounding.observations) {
    const source = catalog.get(obs.sourceId);
    // Only explicitly recorded quote fields qualify as quotations, never notes, names or model summaries.
    if (
      kind !== "synthesis" ||
      !/^\/quotes\/\d+$/.test(obs.path) ||
      seen.has(obs.path) ||
      source?.type !== "interview" ||
      !source.content.answers.some(
        (a) => whitespace(a.quote) && whitespace(a.quote) === whitespace(obs.quote),
      ) ||
      whitespace(paths.get(obs.path) ?? "") !== whitespace(obs.quote)
    )
      throw new Error("A quotation could not be matched to the authorized source.");
    seen.add(obs.path);
    receipt.push({ path: obs.path, category: "observation", sourceIds: [obs.sourceId] });
  }
  for (const inf of wrapper.grounding.inferences) {
    if (
      !paths.has(inf.path) ||
      seen.has(inf.path) ||
      /^\/quotes\//.test(inf.path) ||
      new Set(inf.sourceIds).size !== inf.sourceIds.length ||
      inf.sourceIds.some((id) => !catalog.has(id))
    )
      throw new Error("A draft reference could not be verified.");
    if (
      inf.category === "inference" &&
      !inf.sourceIds.some((id) => ["interview", "learning"].includes(catalog.get(id)!.type))
    )
      throw new Error("An inference needs authorized interview or learning evidence.");
    if (kind === "questions" && inf.category !== "proposal")
      throw new Error("Questions must be labeled as proposals.");
    seen.add(inf.path);
    receipt.push({ path: inf.path, category: inf.category, sourceIds: inf.sourceIds });
  }
  if (paths.size !== seen.size || [...paths.keys()].some((p) => !seen.has(p)))
    throw new Error("Every draft field needs a grounded or proposed label.");
  const reasons = wrapper.grounding.missingEvidence.map((m) => m.reason);
  if (
    new Set(reasons).size !== reasons.length ||
    !reasons.includes("authenticity_unverified") ||
    (Object.values(omissions).some((n) => n > 0) && !reasons.includes("omitted_sources"))
  )
    throw new Error("The draft must disclose source limitations.");
  wrapper.grounding.missingEvidence.forEach((_, i) =>
    receipt.push({ path: `/missing_evidence/${i}`, category: "missing_evidence", sourceIds: [] }),
  );
  return { draft, grounding: wrapper.grounding, receipt };
}
