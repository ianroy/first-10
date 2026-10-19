import { z } from "zod";
import { secretSchema } from "@/lib/guest-spaces/contracts";
import { guestGrowthKindSchema, GUEST_GROWTH_LIMITS } from "./contracts";
const uuid = z.string().uuid();
const saved = z
  .object({
    state: z.literal("saved"),
    artifactId: uuid,
    revision: z.number().int().min(1).max(GUEST_GROWTH_LIMITS.revisions),
    kind: guestGrowthKindSchema,
    audience: z.enum(["principal_private", "team_shared"]),
    authorPrincipalId: uuid,
    recordHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
const draft = z
  .object({ state: z.literal("draft"), localDraftId: uuid, kind: guestGrowthKindSchema })
  .strict();
/** Authority proof contains no unsaved document, interview text or credential-bearing source body. */
export const authorizeGuestGrowthExportSchema = z
  .object({
    csrf: secretSchema,
    scope: z
      .object({
        classId: uuid,
        teamId: uuid,
        principalId: uuid,
        accessExpiresAt: z.string().datetime({ offset: true }),
        contextHash: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict(),
    sources: z
      .array(z.discriminatedUnion("state", [saved, draft]))
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((v, ctx) => {
    const keys = v.sources.map((s) =>
      s.state === "saved" ? `saved:${s.artifactId}:${s.revision}` : `draft:${s.localDraftId}`,
    );
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: "custom", message: "Choose each exact source only once." });
  });
export const guestGrowthExportReceiptSchema = z.object({ ok: z.literal(true) }).strict();
export const historyGuestGrowthSchema = z.object({ csrf: secretSchema, artifactId: uuid }).strict();
/** Stable key order makes client/server hashing independent of JSON object property order. */
export function canonicalGrowthJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalGrowthJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (k) => `${JSON.stringify(k)}:${canonicalGrowthJson((value as Record<string, unknown>)[k])}`,
    )
    .join(",")}}`;
}
export async function growthRecordHash(record: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalGrowthJson(record));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
}

/** Hash only the metadata printed in a guest PDF, with no raw aliases sent to the server. */
export const growthContextHash = (scope: {
  classId: string;
  teamId: string;
  principalId: string;
  accessExpiresAt: string;
  className: string;
  teamAlias: string;
  principalAlias: string;
}) =>
  growthRecordHash({
    classId: scope.classId,
    teamId: scope.teamId,
    principalId: scope.principalId,
    accessExpiresAt: scope.accessExpiresAt,
    className: scope.className,
    teamAlias: scope.teamAlias,
    principalAlias: scope.principalAlias,
  });
