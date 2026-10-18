import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildMarketingDestination } from "@/lib/marketing-destination";
export function DestinationBuilder({
  url,
  onAdopt,
  label,
}: {
  url: string | null;
  onAdopt: (url: string) => void;
  label: string;
}) {
  const [tags, setTags] = useState({ source: "", medium: "", campaign: "" });
  const [preview, setPreview] = useState<ReturnType<typeof buildMarketingDestination> | null>(null);
  const [basis, setBasis] = useState("");
  const fingerprint = JSON.stringify({ url, tags });
  const stale = basis !== fingerprint;
  return (
    <div className="mt-4 space-y-3 rounded-xl border bg-muted/30 p-4 lg:col-span-2">
      <h4 className="font-bold">{label}: Optional attribution tags</h4>
      <p className="text-sm text-muted-foreground">
        Start with your destination above. This strips credentials, existing query parameters and
        fragments before adding three labels. Check that the resulting page still works. Tags do not
        enable analytics or prove who participated. No link is opened or fetched here.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["source", "medium", "campaign"] as const).map((key) => (
          <label key={key} className="block space-y-2 text-sm">
            <span className="font-semibold">
              {label}: UTM {key}
            </span>
            <Input
              maxLength={80}
              value={tags[key]}
              placeholder={
                key === "source" ? "campus-club" : key === "medium" ? "flyer" : "week-one"
              }
              onChange={(e) => setTags({ ...tags, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Use generic labels, never names, email addresses, student IDs or private tokens. Inspect the
        path too: it is retained and may contain private information.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          setPreview(buildMarketingDestination({ url: url ?? "", ...tags }));
          setBasis(fingerprint);
        }}
      >
        Preview tagged URL
      </Button>
      {preview && !preview.ok && (
        <p role="alert" className="text-sm text-destructive">
          {preview.error}
        </p>
      )}
      {preview?.ok && (
        <>
          <label className="block space-y-2 text-sm">
            <span className="font-semibold">{label}: Tagged URL preview</span>
            <Input readOnly value={preview.url} />
          </label>
          <p className="text-xs">
            Removed: {preview.removed.join(", ") || "nothing"}.{" "}
            {stale
              ? "Inputs changed; refresh the preview before adopting."
              : "Adopting replaces only this draft’s destination. Save draft to keep it."}
          </p>
          <Button
            disabled={stale}
            onClick={() => {
              onAdopt(preview.url);
              setPreview(null);
            }}
          >
            Adopt reviewed destination
          </Button>
        </>
      )}
    </div>
  );
}
