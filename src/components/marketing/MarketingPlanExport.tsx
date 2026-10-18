import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { MarketingPlanV1 } from "@/lib/marketing-plan";
import { buildMarketingPlanMarkdown } from "@/lib/marketing-export";
export function MarketingPlanExport({
  plan,
  projectName,
  fictional = false,
}: {
  plan: MarketingPlanV1;
  projectName: string;
  fictional?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  return (
    <section aria-label="Export marketing plan" className="mt-6 space-y-4 border-t pt-6">
      <h4 className="text-xl font-bold">Take a readable copy</h4>
      <p className="text-sm text-muted-foreground">
        Review a snapshot of your current plan, including unsaved edits, before downloading. It
        contains your private plan text and source notes: check what you intend to share. Nothing is
        sent or posted, and downloading does not save changes to First Ten.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          setPreview(buildMarketingPlanMarkdown(plan, { projectName, fictional }));
          setStatus("");
        }}
      >
        {preview === null ? "Review Markdown export" : "Refresh export preview"}
      </Button>
      {preview !== null && (
        <>
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Markdown export preview</span>
            <Textarea readOnly rows={14} value={preview} className="font-mono text-xs" />
          </label>
          <p className="text-xs text-muted-foreground">
            The download contains exactly this preview. Refresh it after changing your plan. Source
            URLs are owner supplied, not verified. Temporary AI practice drafts are not included.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                let url: string | null = null;
                try {
                  const blob = new Blob([preview], { type: "text/markdown;charset=utf-8" });
                  url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = "first-ten-marketing-plan.md";
                  anchor.hidden = true;
                  document.body.appendChild(anchor);
                  try {
                    anchor.click();
                  } finally {
                    anchor.remove();
                  }
                  setStatus("Download requested. Your saved plan is unchanged.");
                } catch {
                  setStatus("Download unavailable. You can select and copy the preview text.");
                } finally {
                  if (url) {
                    const objectUrl = url;
                    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
                  }
                }
              }}
            >
              Download reviewed Markdown
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPreview(null);
                setStatus("");
              }}
            >
              Close export preview
            </Button>
          </div>
        </>
      )}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </section>
  );
}
