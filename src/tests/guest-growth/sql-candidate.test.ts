import { readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  createEmptyGuestGrowth,
  GUEST_GROWTH_KINDS,
  guestGrowthDocumentSchema,
} from "@/lib/guest-growth/contracts";
import { growthSqlCorpus } from "./sql-corpus";
const migration = readFileSync("supabase/migrations/20261018027000_guest_growth.sql", "utf8");
it.each(growthSqlCorpus)(
  "keeps the intended strict TS verdict for $label",
  ({ valid, document }) => {
    expect(guestGrowthDocumentSchema.safeParse(document).success).toBe(valid);
  },
);
it("keeps the SQL canonical blank documents equal to actual six-kind factories", () => {
  const raw = /guest_growth_blank[\s\S]*?SELECT \('([^']+)'::jsonb\)/.exec(migration)![1]!;
  const blanks = JSON.parse(raw);
  for (const kind of GUEST_GROWTH_KINDS) expect(blanks[kind]).toEqual(createEmptyGuestGrowth(kind));
});
it("rejects text that PostgreSQL JSONB cannot represent, without rejecting ordinary astral Unicode", () => {
  const d = createEmptyGuestGrowth("learning");
  for (const title of ["bad\u0000text", "\ud800", "\udfff"])
    expect(guestGrowthDocumentSchema.safeParse({ ...d, title }).success).toBe(false);
  expect(guestGrowthDocumentSchema.safeParse({ ...d, title: "😀" }).success).toBe(true);
});
it("produces a reproducible strict-data corpus for future actual SQL execution only when explicitly requested", () => {
  const out = process.env["GUEST_GROWTH_CORPUS_OUTPUT"];
  if (out) writeFileSync(out, JSON.stringify(growthSqlCorpus));
  expect(growthSqlCorpus.filter((v) => v.valid).length).toBeGreaterThan(6);
});
it("keeps every executable SQL corpus literal equal to the reviewed TypeScript scenarios", () => {
  const sql = readFileSync("supabase/tests/cls-009.sql", "utf8");
  const rows = new Map(
    Array.from(sql.matchAll(/gg_docs VALUES\('([^']+)',(true|false),'((?:[^']|'')*)'\);/g), (m) => [
      m[1],
      { valid: m[2] === "true", document: JSON.parse(m[3]!.replaceAll("''", "'")) },
    ]),
  );
  for (const v of growthSqlCorpus)
    expect(rows.get(v.label), v.label).toEqual({ valid: v.valid, document: v.document });
});
