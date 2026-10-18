import { useMemo, useState } from "react";
import { ActivityPdfExport } from "@/components/export/ActivityPdfExport";
import { boundedOffers, type ActivityOffer } from "@/lib/export/adapters";
import type { ActivityExportV1, ExportAudience } from "@/lib/export/activity";
/** No account/project facade: acquisition and fresh authorization use the guest cookie scope. */
export function GuestActivityExport({
  offers,
  authorizeDownload,
  team = false,
}: {
  offers: ActivityOffer[];
  authorizeDownload: () => Promise<void>;
  team?: boolean;
}) {
  const serialized = JSON.stringify(offers),
    activities = useMemo(
      () => boundedOffers(JSON.parse(serialized) as ActivityOffer[]),
      [serialized],
    );
  const [selected, setSelected] = useState(""),
    [batch, setBatch] = useState<string[]>([]),
    [portfolio, setPortfolio] = useState(false),
    [open, setOpen] = useState(false);
  const chosen = portfolio
    ? activities.filter((o) => batch.includes(o.activity.key))
    : activities.filter((o) => o.activity.key === (selected || activities[0]?.activity.key));
  const chosenJson = JSON.stringify(chosen),
    document = useMemo<ActivityExportV1>(
      () => ({
        schemaVersion: 1,
        title: portfolio
          ? "First Ten - selected guest activity portfolio"
          : ((JSON.parse(chosenJson) as ActivityOffer[])[0]?.activity.title ??
            "First Ten - guest activity"),
        capturedAt: new Date().toISOString(),
        activities: (JSON.parse(chosenJson) as ActivityOffer[]).map((o) => o.activity),
      }),
      [chosenJson, portfolio],
    );
  const permitted: ExportAudience[] = team ? ["owner", "team"] : ["owner"];
  return (
    <details
      className="mt-5 rounded-2xl border bg-card p-5"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer py-2 font-semibold text-primary">
        Export activity PDFs
      </summary>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Take every activity, preserved hypothesis, exact script and blank worksheet, private
            draft, result or reviewed context with you. Current unsaved edits are labeled. Choose a
            smaller selection if a portfolio is too large; nothing is silently omitted. Export
            before class access ends.
          </p>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={portfolio}
              onChange={(e) => {
                setPortfolio(e.target.checked);
                setBatch([]);
              }}
            />
            Choose a selected activity portfolio (up to 50)
          </label>
          {portfolio ? (
            <fieldset className="max-h-72 overflow-auto rounded-xl border p-4">
              <legend>Selected {batch.length} activities</legend>
              {activities.map((o) => (
                <label key={o.activity.key} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={batch.includes(o.activity.key)}
                    disabled={batch.length >= 50 && !batch.includes(o.activity.key)}
                    onChange={(e) =>
                      setBatch((old) =>
                        e.target.checked
                          ? [...old, o.activity.key]
                          : old.filter((k) => k !== o.activity.key),
                      )
                    }
                  />
                  {o.activity.title}
                </label>
              ))}
            </fieldset>
          ) : (
            <label className="block space-y-2">
              <span className="text-sm font-semibold">Activity to export</span>
              <select
                className="min-h-11 w-full rounded-lg border bg-background px-3"
                value={selected || activities[0]?.activity.key || ""}
                onChange={(e) => setSelected(e.target.value)}
              >
                {activities.map((o) => (
                  <option key={o.activity.key} value={o.activity.key}>
                    {o.activity.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {portfolio && batch.some((key) => !activities.some((a) => a.activity.key === key)) ? (
            <p role="alert">
              A selected source changed. Clear the portfolio selection and review again.
            </p>
          ) : chosen.length ? (
            <ActivityPdfExport
              key={`${portfolio}:${chosen.map((a) => a.activity.key).join(":")}`}
              document={document}
              permittedAudiences={permitted}
              authorizeDownload={authorizeDownload}
            />
          ) : (
            <p>Select an activity for your PDF.</p>
          )}
        </div>
      )}
    </details>
  );
}
