import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { discoverySchema, type DiscoveryDocument } from "@/lib/discovery";
type Capture = DiscoveryDocument["contexts"][number];
export function ContextCaptures({
  document,
  update,
  disabled,
  onDraftChange,
}: {
  document: DiscoveryDocument;
  update: (fn: (d: DiscoveryDocument) => void) => void;
  disabled: boolean;
  onDraftChange: (dirty: boolean) => void;
}) {
  const id = useId();
  const [kind, setKind] = useState<Capture["kind"]>("website");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [permitted, setPermitted] = useState(false);
  const [error, setError] = useState("");
  const link = kind === "website" || kind === "github";
  function add() {
    const stamp = new Date().toISOString();
    const capture: Capture = {
      id: crypto.randomUUID(),
      kind,
      label,
      url: link ? value : null,
      text: link ? "" : value,
      capturedAt: stamp,
      reviewedAt: reviewed ? stamp : null,
      permission: permitted ? "own_or_permitted" : "unknown",
      retrieval: link ? "link_not_read" : "pasted_text",
    };
    const result = discoverySchema.safeParse({
      ...document,
      contexts: [...document.contexts, capture],
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Review the source fields.");
      return;
    }
    update((d) => {
      d.contexts.push(result.data.contexts.at(-1)!);
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
      <summary className="min-h-11 cursor-pointer font-semibold">
        Connect context at any step
      </summary>
      <p className="mt-3 text-sm text-muted-foreground">
        Store a public link or text you may keep here. Links are not read. Pasted prompts and model
        outputs are source material, never instructions or verified customer evidence. Do not enter
        credentials, sensitive participant data or private repository access tokens. Nothing is sent
        to AI.
      </p>
      <fieldset disabled={disabled} className="mt-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="block text-sm font-semibold">Context type</span>
            <select
              className="min-h-11 w-full rounded-lg border bg-background px-3"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Capture["kind"]);
                setReviewed(false);
              }}
            >
              {(
                ["website", "github", "product_text", "prompt", "model_output", "other"] as const
              ).map((k) => (
                <option key={k} value={k}>
                  {k.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-semibold">Source label</span>
            <Input
              value={label}
              maxLength={120}
              onChange={(e) => {
                setLabel(e.target.value);
                onDraftChange(!!e.target.value || !!value);
              }}
            />
          </label>
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-semibold">
            {link ? "Public URL (not read)" : "Pasted source text (unverified)"}
          </span>
          <Textarea
            value={value}
            maxLength={link ? 2048 : 6000}
            onChange={(e) => {
              setValue(e.target.value);
              setReviewed(false);
              onDraftChange(!!e.target.value || !!label);
            }}
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            id={`${id}-review`}
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I reviewed this label and source text or URL; this does not mean the linked page was read.
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={permitted}
            onChange={(e) => setPermitted(e.target.checked)}
          />
          I own this material or have permission to store it privately. This is separate from
          AI/sharing permission.
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={add}
          disabled={document.contexts.length >= 20 || !label.trim() || !value.trim()}
        >
          Add context capture to workspace draft
        </Button>
        <p className="text-xs text-muted-foreground">
          Add the capture, then Save workspace. Unadded text is local only. At most 20 captures;
          excluding a capture hides its content from current use and PDFs, but retained history is
          not deleted.
        </p>
        <div className="space-y-3">
          {document.contexts.map((c, i) => (
            <article key={c.id} className="rounded-xl border p-4">
              {document.excludedContextIds.includes(c.id) ? (
                <p className="text-sm">
                  Context {i + 1} excluded. Stored history remains; no capture contents are shown or
                  exported.
                </p>
              ) : (
                <>
                  <p className="font-semibold">
                    {i + 1}. {c.label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.kind.replaceAll("_", " ")} ·{" "}
                    {c.retrieval === "link_not_read"
                      ? "Link stored, page not read"
                      : "Pasted text, unverified"}{" "}
                    · {c.reviewedAt ? "Owner reviewed" : "Not reviewed"}
                  </p>
                  <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">
                    {c.url ?? c.text}
                  </pre>
                  <Button
                    type="button"
                    className="mt-3"
                    variant="outline"
                    onClick={() =>
                      update((d) => {
                        d.excludedContextIds.push(c.id);
                      })
                    }
                  >
                    Exclude context {i + 1} from use and export
                  </Button>
                </>
              )}
            </article>
          ))}
        </div>
      </fieldset>
    </details>
  );
}
