const literalMarker = " — literal excerpt";
const sectionLabel =
  /^(learning|experiment|pipeline_contact|survey|referral|onboarding) - [a-z_]+$/;
const label = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
/** Presentation only: stored text/hash is unchanged; literal excerpts are never parsed. */
export function growthExcerptDisplay(e: { label: string; text: string }): string {
  if (e.label.endsWith(literalMarker) || !sectionLabel.test(e.label)) return e.text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(e.text);
  } catch {
    return e.text;
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return e.text;
  const forbidden =
    /^(id|artifactId|questionId|experimentRef|learningRefs|contactRef|document|payload)$/;
  if (Object.keys(parsed).some((k) => forbidden.test(k))) return e.text;
  const lines: string[] = [];
  const walk = (value: unknown, title: string, depth: number) => {
    if (depth > 12) throw Error("Excerpt presentation nesting exceeds its safe bound");
    if (value === null) lines.push(`${title}: Not recorded`);
    else if (Array.isArray(value)) {
      if (!value.length) lines.push(`${title}: None recorded`);
      else value.forEach((v, i) => walk(v, `${title} ${i + 1}`, depth + 1));
    } else if (typeof value === "object") {
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) =>
        walk(v, `${title}${title ? " · " : ""}${label(k)}`, depth + 1),
      );
    } else
      lines.push(
        `${title}: ${typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}`,
      );
  };
  try {
    walk(parsed, "", 0);
    return lines.join("\n");
  } catch {
    return e.text;
  }
}
