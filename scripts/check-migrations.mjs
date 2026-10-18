#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const folder = "supabase/migrations";
const pattern = /^(\d{14})_[a-z0-9_]+\.sql$/;

export function checkMigrations(files, baseline = []) {
  const errors = [];
  const versions = new Set();
  const current = new Map(files.map((file) => [file.name, file]));
  const previous = new Map(baseline.map((file) => [file.name, file]));
  const previousMax = baseline.reduce((max, file) => {
    const version = file.name.match(pattern)?.[1] ?? "";
    return version > max ? version : max;
  }, "");
  for (const file of files) {
    const match = file.name.match(pattern);
    if (!match) {
      errors.push(`Invalid migration filename: ${file.name}`);
      continue;
    }
    const version = match[1];
    if (versions.has(version)) errors.push(`Duplicate migration version: ${version}`);
    versions.add(version);
    if (!file.content.trim()) errors.push(`Empty migration: ${file.name}`);
    if (!previous.has(file.name) && version <= previousMax)
      errors.push(`New migration predates the baseline: ${file.name}`);
  }
  for (const file of baseline) {
    const next = current.get(file.name);
    if (!next) errors.push(`Published migration removed or renamed: ${file.name}`);
    else if (next.content !== file.content)
      errors.push(`Published migration edited: ${file.name}; use a new forward migration.`);
  }
  return errors;
}

export function main(args = process.argv.slice(2)) {
  let baseline = [];
  if (args.length && (args.length !== 2 || args[0] !== "--base"))
    throw new Error("Usage: node scripts/check-migrations.mjs [--base <git-ref>]");
  if (args.length) {
    const commit = execFileSync("git", ["rev-parse", "--verify", `${args[1]}^{commit}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const names = execFileSync("git", ["ls-tree", "-r", "--name-only", commit, "--", folder], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    baseline = names.map((name) => ({
      name: name.slice(folder.length + 1),
      content: execFileSync("git", ["show", `${commit}:${name}`], { encoding: "utf8" }),
    }));
  }
  const files = readdirSync(folder)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({
      name,
      content: readFileSync(resolve(folder, name), "utf8"),
    }));
  const errors = checkMigrations(files, baseline);
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    `Migration history valid: ${files.length} files; ${baseline.length} baseline files protected.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Migration check failed.");
    process.exitCode = 1;
  }
}
