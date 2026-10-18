import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
const css = readFileSync("src/styles.css", "utf8");
function tokens(selector: string): Record<string, string> {
  const block = css.slice(css.indexOf(`${selector} {`)).split("}")[0] ?? "";
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]),
  );
}
function color(values: Record<string, string>, key: string): string {
  const value = values[key];
  if (!value) throw new Error(`Missing color ${key}`);
  const alias = /^var\(--([\w-]+)\)$/.exec(value);
  if (alias?.[1]) return color(values, alias[1]);
  if (!/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(`Expected opaque sRGB color: ${key}=${value}`);
  return value;
}
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

const textPairs = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["primary", "background"],
  ["primary", "card"],
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-hover"],
  ["secondary-foreground", "secondary"],
  ["secondary-foreground", "secondary-hover"],
  ["accent-foreground", "accent"],
  ["success", "background"],
  ["success", "card"],
  ["success-foreground", "success"],
  ["success-soft-foreground", "success-soft"],
  ["draft-foreground", "draft"],
  ["destructive", "background"],
  ["destructive", "card"],
  ["destructive-foreground", "destructive"],
  ["destructive-foreground", "destructive-hover"],
  ["destructive-soft-foreground", "destructive-soft"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
] as const;

describe("Field notebook color contracts", () => {
  it("uses known luminance reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBe(21);
    expect(contrast("#245b49", "#245b49")).toBe(1);
  });
  for (const [name, palette] of Object.entries({
    light: tokens(":root"),
    dark: { ...tokens(":root"), ...tokens(".dark") },
  })) {
    it(`${name} keeps text, filled states and hover/disabled surfaces readable`, () => {
      for (const [fg, bg] of textPairs) {
        expect(
          contrast(color(palette, fg), color(palette, bg)),
          `${name}: ${fg} on ${bg}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${name} keeps focus, input boundaries and chart marks visible`, () => {
      for (const [fg, bg] of [
        ["input", "card"],
        ["input", "background"],
        ["ring", "background"],
        ["ring", "card"],
        ["ring", "muted"],
        ...[1, 2, 3, 4, 5].map((n) => [`chart-${n}`, "card"]),
      ]) {
        expect(
          contrast(color(palette, fg!), color(palette, bg!)),
          `${name}: ${fg} on ${bg}`,
        ).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
