import { useState } from "react";
import { Button } from "@/components/ui/button";
import { discoverySchema, type DiscoveryDocument } from "@/lib/discovery";
import { GuestField, GuestSelect } from "./GuestFields";
type Capture = DiscoveryDocument["contexts"][number];
export function GuestContext({
  document,
  update,
  disabled,
  onDraftChange,
  shared,
}: {
  document: DiscoveryDocument;
  update: (fn: (d: DiscoveryDocument) => void) => void;
  disabled: boolean;
  onDraftChange: (dirty: boolean) => void;
  shared: boolean;
}) {
  const [kind, setKind] = useState<Capture["kind"]>("website"),
    [label, setLabel] = useState(""),
    [value, setValue] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [permitted, setPermitted] = useState(false),
    [error, setError] = useState("");
  const link = kind === "website" || kind === "github";
  const change = (which: "label" | "value", v: string) => {
    if (which === "label") setLabel(v);
    else setValue(v);
    setReviewed(false);
    onDraftChange(!!v || !!(which === "label" ? value : label));
  };
  function add() {
    const now = new Date().toISOString();
    const c: Capture = {
      id: crypto.randomUUID(),
      kind,
      label,
      url: link ? value : null,
      text: link ? "" : value,
      capturedAt: now,
      reviewedAt: reviewed ? now : null,
      permission: permitted ? "own_or_permitted" : "unknown",
      retrieval: link ? "link_not_read" : "pasted_text",
    };
    const parsed = discoverySchema.safeParse({ ...document, contexts: [...document.contexts, c] });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the source.");
      return;
    }
    update((d) => {
      d.contexts.push(parsed.data.contexts.at(-1)!);
    });
    setLabel("");
    setValue("");
    setReviewed(false);
    setPermitted(false);
    setError("");
    onDraftChange(false);
  }
  return (
    <details className="rounded-2xl border bg-card p-5">
      <summary className="cursor-pointer py-2 font-semibold">
        Connect product context at any step
      </summary>
      <p className="my-3 text-sm text-muted-foreground">
        Save a public site or GitHub link, product description, prompt or model output. Links are
        stored, never fetched here. Pasted model output is an unverified draft, not customer
        evidence. No source is sent to AI.{" "}
        {shared
          ? "Everything added here is visible to current and future teammates."
          : "Captures stay in your principal-private activity."}{" "}
        Remove secrets and identifying participant details.
      </p>
      <fieldset disabled={disabled} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <GuestSelect
            label="Context type"
            value={kind}
            onChange={(v) => {
              const kinds: Capture["kind"][] = [
                "website",
                "github",
                "product_text",
                "prompt",
                "model_output",
                "other",
              ];
              const next = kinds.find((k) => k === v);
              if (next) {
                setKind(next);
                setValue("");
                setReviewed(false);
                onDraftChange(!!label);
              }
            }}
          >
            {["website", "github", "product_text", "prompt", "model_output", "other"].map((k) => (
              <option key={k} value={k}>
                {k.replaceAll("_", " ")}
              </option>
            ))}
          </GuestSelect>
          <GuestField
            label="Context label"
            value={label}
            max={120}
            onChange={(v) => change("label", v)}
          />
        </div>
        <GuestField
          label={link ? "Public URL (not read)" : "Pasted source text (unverified)"}
          value={value}
          max={link ? 2048 : 6000}
          onChange={(v) => change("value", v)}
        />
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I reviewed this exact source text or URL; a saved URL does not mean the page was read.
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={permitted}
            onChange={(e) => setPermitted(e.target.checked)}
          />
          I may store this material for the displayed activity audience. AI and sharing choices
          remain separate.
        </label>
        <Button
          variant="outline"
          disabled={!label.trim() || !value.trim() || document.contexts.length >= 20}
          onClick={add}
        >
          Add context to activity draft
        </Button>
        <p className="text-xs text-muted-foreground">
          Add, then Save activity. Unadded text stays local. Exclusion hides a capture from current
          use and PDFs; retained history is not deleted.
        </p>
        {error && <p role="alert">{error}</p>}
        {document.contexts.map((c, i) => (
          <article key={c.id} className="rounded-xl border p-4">
            {document.excludedContextIds.includes(c.id) ? (
              <p>Context {i + 1} excluded; retained history remains.</p>
            ) : (
              <>
                <p className="font-semibold">{c.label}</p>
                <p className="text-xs text-muted-foreground">
                  {c.retrieval === "link_not_read"
                    ? "Link stored; page not read"
                    : "Pasted text; unverified"}{" "}
                  · {c.reviewedAt ? "Reviewed" : "Not reviewed"} ·{" "}
                  {c.permission === "unknown"
                    ? "Storage permission unknown"
                    : "Storage permission reported"}
                </p>
                <pre className="my-3 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">
                  {c.url ?? c.text}
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update((d) => {
                      d.excludedContextIds.push(c.id);
                    })
                  }
                >
                  Exclude context {i + 1}
                </Button>
              </>
            )}
          </article>
        ))}
      </fieldset>
    </details>
  );
}
