import type { MarketingAsset } from "@/lib/marketing-plan";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
export function ContentReadiness({
  asset,
  index,
  change,
}: {
  asset: MarketingAsset;
  index: number;
  change: (mutate: (asset: MarketingAsset) => void) => void;
}) {
  const label = `Draft ${index + 1}`;
  return (
    <div className="mt-5 space-y-4 rounded-xl border p-4">
      <h4 className="font-bold">Human launch review</h4>
      <p className="text-sm text-muted-foreground">
        Check the current draft yourself. These are your recorded checks, not a certification. After
        changing content or destination, review it again.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["truthful", "I can support the claims"],
            ["disclosedBuilder", "My role as builder is disclosed"],
            ["accessChecked", "I checked channel permission"],
            ["destinationChecked", "I checked the destination or physical next step"],
          ] as const
        ).map(([key, text]) => (
          <label key={key} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={asset.review[key]}
              onChange={(e) =>
                change((a) => {
                  a.review[key] = e.target.checked;
                  a.review.checkedAt = Object.values({ ...a.review, checkedAt: true }).every(
                    Boolean,
                  )
                    ? new Date().toISOString()
                    : null;
                })
              }
            />
            {label}: {text}
          </label>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block space-y-2 text-sm">
          <span className="font-semibold">{label}: Walkthrough mode</span>
          <select
            className="min-h-11 w-full rounded-lg border bg-background px-3"
            value={asset.walkthrough.mode ?? ""}
            onChange={(e) =>
              change((a) => {
                a.walkthrough.mode = (e.target.value ||
                  null) as MarketingAsset["walkthrough"]["mode"];
              })
            }
          >
            <option value="">Not recorded</option>
            <option value="peer">Peer walkthrough</option>
            <option value="self">Self walkthrough</option>
          </select>
        </label>
        <label className="block space-y-2 text-sm">
          <span className="font-semibold">{label}: Walkthrough date</span>
          <Input
            type="date"
            value={asset.walkthrough.checkedOn ?? ""}
            onChange={(e) =>
              change((a) => {
                a.walkthrough.checkedOn = e.target.value || null;
              })
            }
          />
        </label>
        {(
          [
            ["understoodAudience", "Who did they think this was for?"],
            ["actionObserved", "What action did they actually take?"],
            ["hesitation", "Where did they hesitate?"],
          ] as const
        ).map(([key, text]) => (
          <label key={key} className="block space-y-2 text-sm">
            <span className="font-semibold">
              {label}: {text}
            </span>
            <Textarea
              maxLength={500}
              value={asset.walkthrough[key]}
              onChange={(e) =>
                change((a) => {
                  a.walkthrough[key] = e.target.value;
                })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}
