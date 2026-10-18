import { z } from "zod";

export const EXPORT_AUDIENCES = ["owner", "teacher", "team", "external"] as const;
export type ExportAudience = (typeof EXPORT_AUDIENCES)[number];
const key = z.string().regex(/^[a-zA-Z0-9_.:-]{1,80}$/);
const text = z.string().max(20_000);
const label = z.string().min(1).max(200);
const scalar = z.union([text, z.number().finite(), z.boolean(), z.null()]);
export type ExportValue = z.infer<typeof scalar>;
const blockSchema = z.discriminatedUnion("type", [
  z.object({ key, type: z.literal("text"), text }).strict(),
  z
    .object({
      key,
      type: z.literal("fields"),
      fields: z.array(z.object({ label, value: scalar }).strict()).max(100),
    })
    .strict(),
  z
    .object({
      key,
      type: z.literal("table"),
      columns: z.array(label).min(1).max(6),
      rows: z.array(z.array(scalar).max(6)).max(200),
    })
    .strict(),
]);
export const activityExportSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: label,
    teamLabel: z.string().max(120).optional(),
    capturedAt: z.string().datetime({ offset: true }),
    activities: z
      .array(
        z
          .object({
            key,
            title: label,
            kind: label,
            sourceScope: z.enum([
              "owner_private",
              "guest_principal_private",
              "guest_team_shared",
              "submitted_snapshot",
              "fictional",
            ]),
            status: z.enum(["draft", "reviewed", "submitted"]),
            fictional: z.boolean(),
            updatedAt: z.string().datetime({ offset: true }).nullable(),
            sections: z
              .array(z.object({ key, title: label, blocks: z.array(blockSchema).max(50) }).strict())
              .max(40),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    const checkKey = (value: string) => {
      if (seen.has(value)) ctx.addIssue({ code: "custom", message: "Export keys must be unique" });
      seen.add(value);
    };
    for (const activity of doc.activities) {
      checkKey(activity.key);
      if (activity.sourceScope === "fictional" && !activity.fictional)
        ctx.addIssue({ code: "custom", message: "Fictional sources must retain their marker" });
      for (const section of activity.sections) {
        checkKey(section.key);
        for (const block of section.blocks) {
          checkKey(block.key);
          if (
            block.type === "table" &&
            block.rows.some((row) => row.length !== block.columns.length)
          )
            ctx.addIssue({ code: "custom", message: "Each table row must match its columns" });
        }
      }
    }
    if (JSON.stringify(doc).length > 250_000)
      ctx.addIssue({
        code: "custom",
        message: "Select fewer activities for this export (250,000 character limit)",
      });
  });
export type ActivityExportV1 = z.infer<typeof activityExportSchema>;
export type ActivityExportBlock = z.infer<typeof blockSchema>;

/** Audience limits supplement fresh source authorization; they never grant access by themselves. */
export function permitsActivityAudience(
  sourceScope: ActivityExportV1["activities"][number]["sourceScope"],
  audience: ExportAudience,
): boolean {
  if (sourceScope === "owner_private" || sourceScope === "guest_principal_private")
    return audience === "owner";
  if (sourceScope === "guest_team_shared") return audience === "owner" || audience === "team";
  return true;
}

export type ExportSelection = {
  audience: ExportAudience;
  activityKeys: string[];
  sectionKeys: string[];
  excludedBlockKeys?: string[];
  redactions?: string[];
  includeTeamLabel?: boolean;
};
/** Supplied by an authorized adapter, never inferred from role labels or caller JSON. */
export type ExportPolicy = { allowedAudiences: readonly ExportAudience[] };
export type FrozenActivityExport = Readonly<ActivityExportV1 & { audience: ExportAudience }>;
const snapshots = new WeakSet<object>();
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function displayExportValue(value: ExportValue): string {
  if (value === null) return "Unknown / not recorded";
  if (typeof value === "string") return value.trim() ? value : "Not entered";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** Explicit selection creates a detached, immutable snapshot. This is not an authorization service. */
export function freezeActivityExport(
  input: unknown,
  selection: ExportSelection,
  policy: ExportPolicy,
): FrozenActivityExport {
  const doc = activityExportSchema.parse(input);
  if (
    !EXPORT_AUDIENCES.includes(selection.audience) ||
    !policy.allowedAudiences.includes(selection.audience)
  )
    throw new Error("This audience is not permitted for this export.");
  const activityKeys = new Set(doc.activities.map((a) => a.key));
  const sectionKeys = new Set(doc.activities.flatMap((a) => a.sections.map((s) => s.key)));
  const blockKeys = new Set(
    doc.activities.flatMap((a) => a.sections.flatMap((s) => s.blocks.map((b) => b.key))),
  );
  if (
    selection.activityKeys.some((k) => !activityKeys.has(k)) ||
    selection.sectionKeys.some((k) => !sectionKeys.has(k)) ||
    selection.excludedBlockKeys?.some((k) => !blockKeys.has(k))
  )
    throw new Error("The export selection is no longer available. Review the current activity.");
  const redactions = selection.redactions ?? [];
  if (redactions.length > 30 || redactions.some((r) => r.length > 200))
    throw new Error("Use up to 30 redaction phrases, each no longer than 200 characters.");
  const scrub = (s: string) => {
    let result = s.normalize("NFC");
    for (const phrase of [...redactions]
      .filter((s) => s.trim())
      .sort((a, b) => b.length - a.length))
      result = result.split(phrase.normalize("NFC")).join("[Redacted]");
    return result
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[Email removed]")
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        "[Identifier removed]",
      );
  };
  const scrubValue = (v: ExportValue) => (typeof v === "string" ? scrub(v) : v);
  const activities = doc.activities
    .filter((a) => selection.activityKeys.includes(a.key))
    .map((a) => {
      if (!permitsActivityAudience(a.sourceScope, selection.audience))
        throw new Error(
          "Private source material is available only in an owner export. Select an authorized submitted snapshot for other audiences.",
        );
      return {
        ...a,
        title: scrub(a.title),
        kind: scrub(a.kind),
        sections: a.sections
          .filter((s) => selection.sectionKeys.includes(s.key))
          .map((s) => ({
            ...s,
            title: scrub(s.title),
            blocks: s.blocks
              .filter((b) => !selection.excludedBlockKeys?.includes(b.key))
              .map((b): ActivityExportBlock => {
                if (b.type === "text") return { ...b, text: scrub(b.text) };
                if (b.type === "fields")
                  return {
                    ...b,
                    fields: b.fields.map((f) => ({
                      label: scrub(f.label),
                      value: scrubValue(f.value),
                    })),
                  };
                return {
                  ...b,
                  columns: b.columns.map(scrub),
                  rows: b.rows.map((r) => r.map(scrubValue)),
                };
              }),
          })),
      };
    });
  if (!activities.length || !activities.some((a) => a.sections.length))
    throw new Error("Select at least one activity section to export.");
  const snapshot = deepFreeze({
    schemaVersion: 1 as const,
    title: scrub(doc.title),
    capturedAt: doc.capturedAt,
    ...(selection.includeTeamLabel && doc.teamLabel ? { teamLabel: scrub(doc.teamLabel) } : {}),
    activities,
    audience: selection.audience,
  });
  snapshots.add(snapshot);
  return snapshot;
}

export function assertFrozenActivityExport(snapshot: FrozenActivityExport): void {
  if (!snapshots.has(snapshot))
    throw new Error("Create and review a frozen export snapshot before generating a PDF.");
}

export function exportSnapshotText(snapshot: FrozenActivityExport): string {
  assertFrozenActivityExport(snapshot);
  const lines = [
    snapshot.title,
    `Audience: ${snapshot.audience} | Format version 1`,
    `Snapshot: ${snapshot.capturedAt}`,
  ];
  if (snapshot.teamLabel) lines.push(`Team alias: ${snapshot.teamLabel}`);
  for (const a of snapshot.activities) {
    lines.push(
      "",
      a.title,
      `${a.kind} | ${a.status.toUpperCase()}${a.fictional ? " | FICTIONAL EXAMPLE" : ""}`,
      `Updated: ${a.updatedAt ?? "Not recorded"}`,
    );
    for (const s of a.sections) {
      lines.push("", s.title);
      if (!s.blocks.length) lines.push("No content selected.");
      for (const b of s.blocks) {
        if (b.type === "text") lines.push(displayExportValue(b.text));
        else if (b.type === "fields")
          lines.push(
            ...(b.fields.length
              ? b.fields.map((f) => `${f.label}: ${displayExportValue(f.value)}`)
              : ["No fields recorded."]),
          );
        else {
          lines.push(b.columns.join(" | "));
          lines.push(
            ...(b.rows.length
              ? b.rows.map((r) => r.map(displayExportValue).join(" | "))
              : ["No rows recorded."]),
          );
        }
      }
    }
  }
  return lines.join("\n");
}
