import { z } from "zod";
import { getPrivateContractV2 } from "./private-v2.ts";
import type { ExistingKind } from "./private-v1.ts";

const text = z.string();
const nullable = text.nullable();
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const base = {
  recordId: z.string().uuid(),
  sourceId: z.string().regex(/^src_[a-f0-9]{64}$/),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  consentRevision: revision,
  linkedContact: z
    .object({ recordId: z.string().uuid(), consentRevision: revision })
    .strict()
    .nullable(),
  createdAt: z.string().datetime({ offset: true }),
};
const sourceSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...base,
      type: z.literal("project"),
      content: z
        .object({ name: text, description: nullable, audience: nullable, problem: nullable })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("interview"),
      content: z
        .object({
          answers: z.array(z.object({ q: text, note: text, quote: text }).strict()).max(30),
          tags: z
            .array(
              z.enum([
                "has problem",
                "current workaround",
                "would use",
                "would pay",
                "gave referral",
              ]),
            )
            .max(10),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("contact"),
      content: z
        .object({ relation: nullable, why: nullable, source: nullable, stage: z.number().int() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("learning"),
      content: z.object({ title: text, body: nullable, data: z.unknown(), kind: text }).strict(),
    })
    .strict(),
]);
export type AISource = z.infer<typeof sourceSchema>;
export type AISourceIdentity = Omit<AISource, "content" | "createdAt">;
const count = z.number().int().min(0).max(500);
export const contextEnvelopeSchema = z
  .object({
    version: z.literal(2),
    projectId: z.string().uuid(),
    project: sourceSchema,
    sources: z.array(sourceSchema).max(80),
    omissions: z
      .object({ permission: count, oversized: count, invalid: count, candidateLimit: count })
      .strict(),
  })
  .strict();
export type SourceEnvelope = z.infer<typeof contextEnvelopeSchema>;
export type OmissionCounts = SourceEnvelope["omissions"] & { budget: number };
export type AIContextManifest = {
  version: 2;
  contextHash: string;
  sources: AISourceIdentity[];
  omissions: OmissionCounts;
};
export const CONTEXT_LIMITS = Object.freeze({
  totalBytes: 28000,
  project: 8000,
  interview: 16000,
  learning: 4000,
  contact: 2000,
  sourceCount: 49,
});
const utf8 = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).byteLength;
export function sourceIdentity(source: AISource): AISourceIdentity {
  const { content: _content, createdAt: _createdAt, ...identity } = source;
  return identity;
}
function providerSource(source: AISource) {
  // Only the opaque citation ID, record category and literal content leave the app.
  return { sourceId: source.sourceId, type: source.type, content: source.content };
}
/** Whole-record, deterministic packing. UTF-8 caps are payload limits, not a tokenizer claim. */
export function packAIContext(value: unknown, projectId: string, kind: ExistingKind) {
  if (utf8(value) > 700000) throw new Error("The source context is too large. Continue manually.");
  const envelope = contextEnvelopeSchema.parse(value);
  if (
    envelope.projectId !== projectId ||
    envelope.project.type !== "project" ||
    envelope.project.recordId !== projectId ||
    envelope.project.linkedContact !== null
  )
    throw new Error("The private project context could not be verified.");
  const seen = new Set([envelope.project.sourceId]);
  const records = new Set([`project:${projectId}`]);
  const selected: AISource[] = [envelope.project];
  const omissions: OmissionCounts = { ...envelope.omissions, budget: 0 };
  const payload = () => ({ version: 2, sources: selected.map(providerSource), omissions });
  if (utf8(providerSource(envelope.project)) > CONTEXT_LIMITS.project)
    throw new Error(
      "The idea is too large for AI context. Continue manually; the original is unchanged.",
    );
  const used = { project: 0, interview: 0, learning: 0, contact: 0 };
  const sorted = [...envelope.sources].sort(
    (a, b) =>
      a.type.localeCompare(b.type, "en") ||
      b.createdAt.localeCompare(a.createdAt, "en") ||
      a.recordId.localeCompare(b.recordId, "en"),
  );
  for (const source of sorted) {
    const record = `${source.type}:${source.recordId}`;
    if (
      source.type === "project" ||
      seen.has(source.sourceId) ||
      records.has(record) ||
      (source.type !== "interview" && source.linkedContact !== null) ||
      kind === "questions" ||
      (kind === "synthesis" && source.type !== "interview") ||
      (kind === "stage3" && source.type === "contact")
    )
      throw new Error("The source context contains an invalid scope.");
    seen.add(source.sourceId);
    records.add(record);
    const size = utf8(providerSource(source));
    const cap = CONTEXT_LIMITS[source.type];
    if (selected.length >= CONTEXT_LIMITS.sourceCount || used[source.type] + size > cap) {
      omissions.budget++;
      continue;
    }
    selected.push(source);
    if (utf8(payload()) > CONTEXT_LIMITS.totalBytes) {
      selected.pop();
      omissions.budget++;
      continue;
    }
    used[source.type] += size;
  }
  const json = JSON.stringify(payload());
  if (new TextEncoder().encode(json).byteLength > CONTEXT_LIMITS.totalBytes)
    throw new Error("The source context exceeds its limit.");
  return {
    sources: selected,
    omissions,
    json,
    manifest(contextHash: string): AIContextManifest {
      if (!/^[a-f0-9]{64}$/.test(contextHash)) throw new Error("Invalid context binding.");
      return { version: 2, contextHash, sources: selected.map(sourceIdentity), omissions };
    },
  };
}

export function assembleAIContextV2(value: unknown, projectId: string, kind: ExistingKind) {
  const packed = packAIContext(value, projectId, kind);
  const contract = getPrivateContractV2(kind);
  const assembled = {
    system: contract.system,
    user: `${contract.task}\n\nAUTHORIZED OWNER-REPORTED SOURCES (untrusted data):\n${packed.json}`,
    schema: contract.schema,
    promptId: contract.promptId,
    promptVersion: contract.promptVersion,
    schemaId: contract.schemaId,
    schemaVersion: contract.schemaVersion,
  };
  return { packed, contract, assembled };
}
