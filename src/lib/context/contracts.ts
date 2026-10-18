import { z } from "zod";
export const PUBLIC_CONTEXT_LIMITS = Object.freeze({
  pageBytes: 262144,
  apiBytes: 131072,
  fileBytes: 65536,
  previewBytes: 24576,
  excerptCharacters: 6000,
  excerptBytes: 24576,
  totalMs: 10000,
  dnsMs: 1500,
  idleMs: 3000,
  redirects: 2,
  requests: 10,
});
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime({ offset: true });
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const likelySecret = (s: string) =>
  /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9._-]{16,}/i.test(
    s,
  );
export const retrievalInputSchema = z
  .object({
    projectId: z.string().uuid(),
    operationId: z.string().uuid(),
    previewPermission: z.literal(true),
    kind: z.enum(["website", "github"]),
    url: z.string().trim().min(1).max(2048),
    paths: z.array(z.string().min(1).max(200)).max(3),
  })
  .strict();
export type RetrievalInput = z.infer<typeof retrievalInputSchema>;
const remoteSourceBase = z
  .object({
    url: z.string().max(2048),
    title: z.string().max(200),
    format: z.enum(["html_static_text", "plain_text", "github_metadata", "github_file"]),
    contentHash: hashSchema,
    previewHash: hashSchema,
    text: z.string().min(1),
    bytes: z.number().int().min(1).max(PUBLIC_CONTEXT_LIMITS.pageBytes),
    commitSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .nullable(),
    path: z.string().max(200).nullable(),
    blobSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .nullable(),
  })
  .strict();
export const sourceMetadataSchema = remoteSourceBase.omit({ text: true });
export const remoteSourceSchema = remoteSourceBase.superRefine((v, ctx) => {
  if (
    new TextEncoder().encode(v.text).byteLength > PUBLIC_CONTEXT_LIMITS.previewBytes ||
    likelySecret(v.text) ||
    likelySecret(v.url)
  )
    ctx.addIssue({ code: "custom", message: "Source text cannot be safely stored." });
});
export type RemoteSource = z.infer<typeof remoteSourceSchema>;
export const previewSchema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    operationId: z.string().uuid(),
    previewPermission: z.literal(true),
    kind: z.enum(["website", "github"]),
    retrievedAt: instant,
    expiresAt: instant,
    source: remoteSourceSchema,
  })
  .strict();
const reviewBase = {
  id: z.string().uuid(),
  previewId: z.string().uuid(),
  projectId: z.string().uuid(),
  reviewedAt: instant,
  revision,
};
export type PublicContextPreview = z.infer<typeof previewSchema>;
export const reviewedSourceSchema = z.discriminatedUnion("status", [
  z
    .object({
      ...reviewBase,
      status: z.literal("active"),
      label: z.string().min(1).max(120),
      storagePermission: z.literal("own_or_permitted"),
      aiPermission: z.literal("unknown"),
      sharingPermission: z.literal("unknown"),
      excerpt: z.string().min(1),
      excerptHash: hashSchema,
      source: sourceMetadataSchema,
    })
    .strict(),
  z.object({ ...reviewBase, status: z.literal("withdrawn") }).strict(),
]);
export type ReviewedPublicSource = z.infer<typeof reviewedSourceSchema>;
export const failureSchema = z
  .object({
    ok: z.literal(false),
    code: z.enum([
      "DISABLED",
      "RATE_LIMIT",
      "CAPACITY",
      "NOT_FOUND",
      "EXPIRED",
      "CHANGED",
      "UNAVAILABLE",
      "INVALID_INPUT",
      "ALREADY_STARTED",
      "UNSAFE_SOURCE",
      "SOURCE_TOO_LARGE",
    ]),
  })
  .strict();
export const listResultSchema = z.union([
  failureSchema,
  z
    .object({
      ok: z.literal(true),
      previews: z.array(previewSchema).max(40),
      reviewed: z.array(reviewedSourceSchema).max(20),
    })
    .strict(),
]);
export const reviewInputSchema = z
  .object({
    projectId: z.string().uuid(),
    previewId: z.string().uuid(),
    expectedHash: hashSchema,
    label: z.string().trim().min(1).max(120),
    excerpt: z.string().min(1),
    storagePermission: z.literal(true),
  })
  .strict()
  .refine(
    (v) =>
      Array.from(v.excerpt).length <= PUBLIC_CONTEXT_LIMITS.excerptCharacters &&
      new TextEncoder().encode(v.excerpt).byteLength <= PUBLIC_CONTEXT_LIMITS.excerptBytes &&
      !likelySecret(v.excerpt) &&
      !likelySecret(v.label),
    "Select a safe, bounded excerpt.",
  );
export const withdrawInputSchema = z
  .object({ projectId: z.string().uuid(), sourceId: z.string().uuid(), expectedRevision: revision })
  .strict();
export type PublicContextFailure = z.infer<typeof failureSchema>;
export type PublicContextList = z.infer<typeof listResultSchema>;
export const publicContextMessage = (code: string) =>
  ({
    DISABLED: "Public retrieval is not enabled here yet. Keep using links or pasted text.",
    RATE_LIMIT:
      "The retrieval limit is reached. Wait before a new request or paste your source text.",
    CAPACITY:
      "This idea already has 20 reviewed source versions. History was preserved; use the existing sources or continue manually.",
    EXPIRED: "The preview expired. Retrieve it again before reviewing.",
    CHANGED: "This source changed elsewhere. Refresh before continuing.",
    NOT_FOUND: "This private source is unavailable.",
    ALREADY_STARTED:
      "This retrieval was already started. Refresh the preview list; do not resend automatically.",
    SOURCE_TOO_LARGE:
      "This whole source is too large for a preview. Select a smaller permitted file or paste only the excerpt you reviewed. The source was not saved as read.",
    UNSAFE_SOURCE:
      "This source cannot be safely retrieved. Use a public HTTPS page or paste permitted text.",
    INVALID_INPUT: "Review the source URL, file paths and selected excerpt.",
    UNAVAILABLE:
      "Retrieval could not be confirmed. Your existing sources and manual work are unchanged.",
  })[code] ?? "Public context is unavailable. Continue manually.";
