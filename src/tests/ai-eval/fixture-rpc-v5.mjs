import { createHash } from "node:crypto";
export const EVAL_PROJECT_ID = "fa030000-0000-4000-8000-000000000002";
const digest = (value) => createHash("sha256").update(value).digest("hex");
// PostgreSQL jsonb text key order/spacing for the literal fixture values (no floats).
const pgJson = (value) =>
  Array.isArray(value)
    ? `[${value.map(pgJson).join(", ")}]`
    : value !== null && typeof value === "object"
      ? `{${Object.keys(value)
          .sort(
            (a, b) =>
              Buffer.byteLength(a) - Buffer.byteLength(b) ||
              Buffer.compare(Buffer.from(a), Buffer.from(b)),
          )
          .map((k) => `${JSON.stringify(k)}: ${pgJson(value[k])}`)
          .join(", ")}}`
      : JSON.stringify(value);
function record(type, index, content) {
  const recordId =
    type === "project"
      ? EVAL_PROJECT_ID
      : `fa170000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const linkedContact = null;
  const contentHash = digest(pgJson({ content, linkedContact }));
  return {
    type,
    recordId,
    sourceId: `src_${digest(`${EVAL_PROJECT_ID}:${type}:${recordId}:${contentHash}`)}`,
    contentHash,
    consentRevision: 1,
    linkedContact,
    createdAt: "2026-10-18T00:00:00+00:00",
    content,
  };
}
/** Synthetic RPC acknowledgment projection, not a substitute for real SQL permission tests. */
export function derivePermissionFixtureV5(c) {
  const omitted = { permission: 0, oversized: 0, invalid: 0, candidateLimit: 0 };
  const kept = (key) =>
    c.input[key]
      .map((row, index) => ({ row, index }))
      .filter(({ index }) => !c.withheld_records[key].includes(index));
  const sources = [];
  const add = (type, rows, start, cap, maxCount) => {
    let selected = 0;
    rows.forEach(({ content, index }) => {
      if (Buffer.byteLength(pgJson(content)) > cap) {
        omitted.oversized++;
        return;
      }
      if (selected >= maxCount) {
        omitted.candidateLimit++;
        return;
      }
      sources.push(record(type, start + index, content));
      selected++;
    });
  };
  if (c.kind !== "questions") {
    omitted.permission += c.withheld_records.interviews.length;
    add(
      "interview",
      kept("interviews").map(({ row: i, index }) => ({
        index,
        content: {
          answers: i.answers.map((a) => ({
            q: a.q ?? "",
            note: a.note ?? "",
            quote: a.quote ?? "",
          })),
          tags: i.tags,
        },
      })),
      100,
      12000,
      32,
    );
    if (c.kind === "stage2") {
      omitted.permission += c.withheld_records.contacts.length;
      add(
        "contact",
        kept("contacts").map(({ row: c, index }) => ({
          index,
          content: { relation: c.relation, why: c.why, source: c.source, stage: c.stage },
        })),
        200,
        2000,
        32,
      );
    }
    if (c.kind !== "synthesis") {
      const eligible =
        c.withheld_records.interviews.length + c.withheld_records.contacts.length === 0
          ? kept("learnings")
          : [];
      omitted.permission += c.input.learnings.length - eligible.length;
      add(
        "learning",
        eligible.map(({ row: l, index }) => ({
          index,
          content: { title: l.title, body: l.body, data: l.data, kind: l.kind },
        })),
        300,
        6000,
        16,
      );
    }
  }
  return {
    version: 2,
    projectId: EVAL_PROJECT_ID,
    project: record("project", 1, c.input.project),
    sources: sources.sort(
      (a, b) => a.type.localeCompare(b.type, "en") || a.recordId.localeCompare(b.recordId, "en"),
    ),
    omissions: omitted,
  };
}
export function sourceCatalog(packed) {
  return packed.sources
    .filter((s) => s.type === "interview")
    .flatMap((s) =>
      s.content.answers
        .filter((a) => a.quote.trim())
        .map((a) => ({ id: s.sourceId, quote: a.quote })),
    );
}
export function groundedFixtureOutput(c, draft) {
  const observations = [];
  const inferences = [];
  const leaves = (value, path = "") => {
    if (typeof value === "string") {
      if (c.kind === "synthesis" && /^\/quotes\/\d+$/.test(path)) {
        const source = c.source_catalog.find(
          (s) => s.quote.trim().replace(/\s+/g, " ") === value.trim().replace(/\s+/g, " "),
        );
        observations.push({ path, sourceId: source?.id ?? `src_${"f".repeat(64)}`, quote: value });
      } else inferences.push({ path, category: "proposal", sourceIds: [] });
    } else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}/${i}`));
    else if (value && typeof value === "object")
      Object.entries(value).forEach(([k, v]) => leaves(v, `${path}/${k}`));
  };
  leaves(draft);
  const missingEvidence = [
    {
      reason: "authenticity_unverified",
      message: "These fictional owner-reported records do not verify respondent authenticity.",
    },
  ];
  if (Object.values(c.packing_omissions).some((n) => n > 0))
    missingEvidence.push({
      reason: "omitted_sources",
      message: "Some records were withheld or omitted; this is not complete evidence.",
    });
  return { draft, grounding: { observations, inferences, missingEvidence } };
}
