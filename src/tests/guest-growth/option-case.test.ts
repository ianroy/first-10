import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { OPTION_CASE_DATA, OPTION_CASE_DATA_SHA256 } from "@/lib/guest-growth/option-case-data";
import {
  growthOptionKey,
  growthOptionLower,
  growthCaseRange,
} from "@/lib/guest-growth/option-case";
it("pins the generated Unicode17 policy and exact SQL data independently of database locale", () => {
  expect(process.versions["unicode"]).toBe("17.0");
  const generated = execFileSync(
    process.execPath,
    ["src/lib/guest-growth/generate-option-case-data.mjs", "--json"],
    { encoding: "utf8" },
  );
  expect(JSON.parse(generated)).toEqual(OPTION_CASE_DATA);
  expect(createHash("sha256").update(generated).digest("hex")).toBe(OPTION_CASE_DATA_SHA256);
  const sql = readFileSync("supabase/migrations/20261018027000_guest_growth.sql", "utf8");
  const embedded = /guest_growth_option_case_data\(\)[\s\S]*?SELECT '([^']+)'::jsonb/.exec(
    sql,
  )![1]!;
  expect(JSON.parse(embedded)).toEqual(OPTION_CASE_DATA);
});
it("matches the Unicode17 native oracle for all1,112,063 non-NUL Unicode scalar mappings and properties", () => {
  let checked = 0;
  const mismatches: number[] = [];
  for (let n = 1; n <= 0x10ffff; n++) {
    if (n >= 0xd800 && n <= 0xdfff) continue;
    checked++;
    const c = String.fromCodePoint(n);
    if (
      growthOptionLower(c) !== c.toLowerCase() ||
      growthCaseRange(n, OPTION_CASE_DATA.cased) !== /\p{Cased}/u.test(c) ||
      growthCaseRange(n, OPTION_CASE_DATA.ignorable) !== /\p{Case_Ignorable}/u.test(c)
    ) {
      if (mismatches.length < 20) mismatches.push(n);
    }
  }
  expect(checked).toBe(1112063);
  expect(mismatches).toEqual([]);
}, 20000);
it("matches contextual Final_Sigma including characters that are both Cased and Case_Ignorable", () => {
  const atoms = [
    "",
    "A",
    "a",
    "Σ",
    "σ",
    "ς",
    "1",
    " ",
    "'",
    "\u0345",
    "\u200d",
    "\u0301",
    "\u02b0",
  ];
  for (const before of atoms)
    for (const after of atoms)
      for (const middle of ["Σ", "Σ\u0345Σ", "\u0345Σ\u0345"]) {
        const s = before + middle + after;
        expect(growthOptionLower(s), JSON.stringify(s)).toBe(s.toLowerCase());
      }
  for (const [lo, hi] of OPTION_CASE_DATA.cased)
    for (let n = lo; n <= hi; n++)
      if (growthCaseRange(n, OPTION_CASE_DATA.ignorable)) {
        const c = String.fromCodePoint(n);
        for (const s of [c + "Σ", "AΣ" + c, "A" + c + "Σ", c + "Σ" + c, "AΣ" + c + "B"])
          expect(growthOptionLower(s), JSON.stringify(s)).toBe(s.toLowerCase());
      }
});
it("retains international duplicate semantics, dotted-I expansion and new16/17 case pairs without changing authored text", () => {
  expect(growthOptionKey(" \u0130 ")).toBe("i\u0307");
  expect(growthOptionKey("ΟΣ")).toBe("ος");
  for (const n of [0x1c89, 0xa7cb, 0xa7ce, 0x10d50, 0x16ea0]) {
    const s = String.fromCodePoint(n);
    expect(growthOptionLower(s)).toBe(s.toLowerCase());
    expect(growthOptionLower(s)).not.toBe(s);
  }
  expect(growthOptionKey("\u00a0\u2009É\ufeff")).toBe("é");
  expect(() => growthOptionLower("A".repeat(121))).toThrow("closed120");
});
