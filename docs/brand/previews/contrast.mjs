import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const directory = new URL("./", import.meta.url);
const themes = JSON.parse(await readFile(new URL("tokens.json", directory), "utf8"));
function luminance(hex) {
  const rgb = hex
    .slice(1)
    .match(/.{2}/g)
    .map((part) => parseInt(part, 16) / 255);
  const linear = rgb.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function ratio(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
assert.equal(ratio("#000000", "#FFFFFF"), 21);
assert.equal(ratio("#245B49", "#245B49"), 1);
const pairs = [
  ["foreground", "background", 4.5],
  ["foreground", "card", 4.5],
  ["muted_foreground", "background", 4.5],
  ["muted_foreground", "card", 4.5],
  ["muted_foreground", "muted", 4.5],
  ["primary_foreground", "primary", 4.5],
  ["primary", "background", 4.5],
  ["primary", "card", 4.5],
  ["secondary_foreground", "secondary", 4.5],
  ["accent_foreground", "accent", 4.5],
  ["draft_foreground", "draft", 4.5],
  ["success_foreground", "success", 4.5],
  ["destructive_foreground", "destructive", 4.5],
  ["input", "background", 3],
  ["input", "card", 3],
  ["ring", "background", 3],
  ["ring", "card", 3],
  ["ring", "muted", 3],
  ["primary", "muted", 3],
];
let failures = 0;
const rows = pairs.map(([fg, bg, minimum]) => {
  const values = Object.values(themes).map((tokens) => {
    const actual = ratio(tokens[fg], tokens[bg]);
    if (actual < minimum) failures++;
    return `${actual.toFixed(2)}:1${actual < minimum ? " FAIL" : ""}`;
  });
  return `| ${fg} / ${bg} | ${minimum}:1 | ${values.join(" | ")} |`;
});
const report = `# Measured contrast\n\nCalculated from the exact six-digit sRGB tokens in tokens.json. Thresholds use unrounded values; display rounds to two decimals. ${pairs.length * Object.keys(themes).length} checks; ${failures} failures.\n\n| Pair | Minimum | Notebook light | Notebook dark | Ledger light | Ledger dark |\n| --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\nBorder is a decorative separator; input identifies controls. These results cover the listed opaque pairings, not every possible use or a complete accessibility audit.\n`;
if (process.argv.includes("--write")) {
  const css = Object.entries(themes)
    .map(([name, tokens]) => {
      const [direction, mode] = name.split("-");
      return `:root[data-direction="${direction}"][data-mode="${mode}"] {\n${Object.entries(tokens)
        .map(([key, value]) => `  --${key.replaceAll("_", "-")}: ${value};`)
        .join("\n")}\n  color-scheme: ${mode};\n}`;
    })
    .join("\n\n");
  await writeFile(
    new URL("themes.css", directory),
    `/* Generated from tokens.json by node contrast.mjs --write. */\n${css}\n`,
  );
  await writeFile(new URL("contrast-results.md", directory), report);
}
console.log(report);
process.exitCode = failures ? 1 : 0;
