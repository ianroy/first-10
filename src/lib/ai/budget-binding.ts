import { createHash } from "node:crypto";
export type AIContextBindingInput = {
  system: string;
  user: string;
  schema: object;
  promptId: string;
  promptVersion: number;
  schemaId: string;
  schemaVersion: number;
};
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Budget binding requires literal JSON values.");
}
export function budgetInputBinding(context: AIContextBindingInput) {
  // Canonical object keys; preserve literal strings and array order. No credentials belong here.
  const serialized = canonicalJson({
    system: context.system,
    user: context.user,
    schema: context.schema,
    promptId: context.promptId,
    promptVersion: context.promptVersion,
    schemaId: context.schemaId,
    schemaVersion: context.schemaVersion,
  });
  return {
    contextSha256: createHash("sha256").update(serialized, "utf8").digest("hex"),
    inputBytes: Buffer.byteLength(serialized, "utf8"),
  };
}
