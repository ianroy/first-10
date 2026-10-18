import { useEffect, useId, useMemo, useState } from "react";
import { ActivityPdfExport } from "./ActivityPdfExport";
import { boundedOffers, section, type ActivityOffer } from "@/lib/export/adapters";
import type { ActivityExportV1 } from "@/lib/export/activity";
import { aiOriginSchema } from "@/lib/ai/saved-output";

export type OriginResolver = (originId: string) => Promise<unknown>;
export function ActivityExportLauncher({
  activities,
  resolveOrigin,
  allowPortfolio = false,
}: {
  activities: ActivityOffer[];
  resolveOrigin?: OriginResolver;
  allowPortfolio?: boolean;
}) {
  const id = useId();
  const serialized = JSON.stringify(activities);
  const offers = useMemo(
    () => boundedOffers(JSON.parse(serialized) as ActivityOffer[]),
    [serialized],
  );
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [portfolio, setPortfolio] = useState(false);
  const [batch, setBatch] = useState<string[]>([]);
  const [origins, setOrigins] = useState<{
    fingerprint: string;
    values: Record<string, unknown>;
  } | null>(null);
  const chosen = portfolio
    ? offers.filter((o) => batch.includes(o.activity.key))
    : offers.filter((o) => o.activity.key === (selected || offers[0]?.activity.key));
  const missingBatch =
    portfolio && batch.some((key) => !offers.some((o) => o.activity.key === key));
  const chosenKey = JSON.stringify(chosen);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const ids = [
      ...new Set(
        (JSON.parse(chosenKey) as ActivityOffer[]).flatMap((o) => (o.originId ? [o.originId] : [])),
      ),
    ];
    void Promise.all(
      ids.map(async (originId) => {
        try {
          return [originId, resolveOrigin ? await resolveOrigin(originId) : null] as const;
        } catch {
          return [originId, null] as const;
        }
      }),
    ).then((pairs) => {
      if (active) setOrigins({ fingerprint: chosenKey, values: Object.fromEntries(pairs) });
    });
    return () => {
      active = false;
    };
  }, [chosenKey, open, resolveOrigin]);
  const doc = useMemo<ActivityExportV1>(() => {
    const selected = JSON.parse(chosenKey) as ActivityOffer[];
    return {
      schemaVersion: 1,
      title: portfolio
        ? "First Ten - selected activity portfolio"
        : (selected[0]?.activity.title ?? "First Ten activity"),
      capturedAt: new Date().toISOString(),
      activities: selected.map((offer) => {
        if (!offer.originId) return offer.activity;
        const result = aiOriginSchema.safeParse(
          origins?.fingerprint === chosenKey ? origins.values[offer.originId] : null,
        );
        const meta = result.success ? result.data : null;
        return {
          ...offer.activity,
          sections: [
            ...offer.activity.sections,
            section(`${offer.activity.key}.ai-origin`, "Recorded AI draft origin", [
              ["Model requested", meta?.requestedModel ?? null],
              ["Model reported", meta?.actualModel ?? null],
              ["Provider reported", meta?.provider ?? null],
              ["Prompt", meta ? `${meta.promptId} / version ${meta.promptVersion}` : null],
              ["Schema", meta ? `${meta.schemaId} / version ${meta.schemaVersion}` : null],
              ["Generated", meta?.createdAt ?? null],
              ["Reported cost USD", meta?.costUsd ?? null],
              [
                "Limits",
                meta
                  ? "Recorded source draft; edits may differ and claims are not verified. Internal identifiers omitted."
                  : "A source origin is recorded, but metadata was unavailable for this snapshot. Do not infer a model, cost or verification.",
              ],
            ]),
          ],
        };
      }),
    };
  }, [chosenKey, origins, portfolio]);
  const ready = origins?.fingerprint === chosenKey;
  return (
    <details
      className="mt-5 rounded-xl border bg-card p-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary">
        Export activity PDF
      </summary>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose current work to review. PDFs may include unsaved edits and private notes; nothing
            is saved or sent by exporting. Large activities appear as named parts, with no silently
            omitted content.
          </p>
          {allowPortfolio && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={portfolio}
                onChange={(e) => {
                  setPortfolio(e.target.checked);
                  setBatch([]);
                }}
              />
              Choose a selected portfolio (up to 50 activities per PDF)
            </label>
          )}
          {portfolio ? (
            <fieldset className="max-h-72 overflow-auto rounded-lg border p-3">
              <legend className="px-2 text-sm font-semibold">
                Selected {batch.length} of {offers.length} available activities
              </legend>
              {offers.map((o) => (
                <label key={o.activity.key} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={batch.includes(o.activity.key)}
                    disabled={!batch.includes(o.activity.key) && batch.length >= 50}
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
            <div>
              <label htmlFor={id} className="mb-2 block text-sm font-semibold">
                Activity to export
              </label>
              <select
                id={id}
                value={selected || offers[0]?.activity.key || ""}
                onChange={(e) => setSelected(e.target.value)}
                className="min-h-11 w-full rounded-lg border bg-background px-3"
              >
                {offers.map((o) => (
                  <option key={o.activity.key} value={o.activity.key}>
                    {o.activity.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          {missingBatch ? (
            <p role="alert" className="text-sm">
              A selected activity changed or is no longer available.{" "}
              <button type="button" className="underline" onClick={() => setBatch([])}>
                Clear this selection and review the current activities
              </button>
              .
            </p>
          ) : !chosen.length ? (
            <p className="text-sm">
              Select an available activity. Unselected activities are not included.
            </p>
          ) : !ready ? (
            <p role="status" className="text-sm">
              Preparing the selected snapshot and available origin metadata…
            </p>
          ) : (
            <ActivityPdfExport
              key={`${portfolio ? "portfolio" : "one"}:${chosen.map((o) => o.activity.key).join(":")}`}
              document={doc}
              permittedAudiences={["owner"]}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Only the named selection is included. If a selected batch exceeds the 250,000-character
            or 120-page limit, choose a smaller batch; the export will fail visibly instead of
            truncating it.
          </p>
        </div>
      )}
    </details>
  );
}
