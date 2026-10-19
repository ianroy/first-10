import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MEASUREMENT_DISCLOSURE, MEASUREMENT_RETENTION } from "@/lib/analytics";
import { getMeasurementPreference, saveMeasurementPreference } from "@/lib/events.functions";
import type { MeasurementPreference as Preference } from "@/lib/analytics-contracts";

export function MeasurementPreference({ userId }: { userId: string }) {
  return <ScopedMeasurementPreference key={userId} />;
}
function ScopedMeasurementPreference() {
  const [value, setValue] = useState<Preference | null>(null);
  const [choice, setChoice] = useState<Preference["choice"]>("unknown");
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const alive = useRef(true);
  const sending = useRef(false);
  const pending = useRef<Parameters<typeof saveMeasurementPreference>[0] | null>(null);
  useEffect(() => {
    alive.current = true;
    let current = true;
    setBusy(true);
    getMeasurementPreference()
      .then((result) => {
        if (!current || !alive.current) return;
        if (result.ok) {
          setValue(result.data);
          setChoice(result.data.choice);
          setError("");
          setStale(false);
        } else setError("Your measurement choice could not be loaded. Nothing was changed.");
      })
      .catch(() => {
        if (current && alive.current) setError("Your measurement choice could not be loaded.");
      })
      .finally(() => {
        if (current && alive.current) setBusy(false);
      });
    return () => {
      current = false;
      alive.current = false;
    };
  }, [reload]);
  async function save() {
    if (!value || sending.current) return;
    if (!pending.current)
      pending.current = {
        data: {
          choice,
          expectedRevision: value.revision,
          requestId: crypto.randomUUID(),
        },
      };
    sending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await saveMeasurementPreference(pending.current).catch(() => null);
    if (!alive.current) return;
    sending.current = false;
    setBusy(false);
    if (result?.ok) {
      setValue(result.data);
      setChoice(result.data.choice);
      pending.current = null;
      setNotice(
        result.data.choice === "granted"
          ? "Choice saved. Earlier activity is never backfilled."
          : "Choice saved. Optional measurement is off and attributable measurement rows were removed.",
      );
    } else if (result && result.code !== "UNAVAILABLE") {
      pending.current = null;
      setStale(true);
      setError(
        result.code === "CONFLICT"
          ? "Your choice changed elsewhere. Reload it before choosing again."
          : "Your choice could not be saved. Reload and review it; your app work is unchanged.",
      );
    } else
      setError(
        "The result is unconfirmed. Retry the exact choice; it will not create another change.",
      );
  }
  return (
    <section aria-label="Optional product measurement" className="rounded-2xl border bg-card p-6">
      <h2 className="text-xl font-bold">Optional product measurement</h2>
      <p className="mt-3 text-sm text-muted-foreground">{MEASUREMENT_DISCLOSURE}</p>
      <p className="mt-3 text-sm text-muted-foreground">{MEASUREMENT_RETENTION}</p>
      <p className="mt-3 text-sm">
        This choice is separate from interview notes, AI processing and sharing.
      </p>
      {value && (
        <p className="mt-3 text-sm">
          Saved choice: {value.choice} · revision {value.revision}.
          {value.collectionEnabled
            ? " Collection is enabled for eligible future milestones."
            : " Collection is currently disabled."}
        </p>
      )}
      <label className="mt-4 block text-sm font-semibold">
        Your product measurement choice
        <select
          className="mt-2 block min-h-12 w-full rounded-lg border bg-background px-3"
          value={choice}
          disabled={!value || busy || stale || Boolean(pending.current)}
          onChange={(event) => {
            setChoice(event.target.value as Preference["choice"]);
            setNotice("");
          }}
        >
          <option value="unknown">Not decided</option>
          <option value="granted">Allow optional product measurement</option>
          <option value="withdrawn">Do not measure / withdraw</option>
        </select>
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm">
          {notice}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          disabled={!value || busy || stale || (choice === value.choice && !pending.current)}
          onClick={() => void save()}
        >
          {busy
            ? "Checking…"
            : pending.current
              ? "Retry exact measurement choice"
              : "Save measurement choice"}
        </Button>
        <Button
          variant="outline"
          disabled={busy || Boolean(pending.current)}
          onClick={() => setReload((n) => n + 1)}
        >
          Reload saved choice
        </Button>
      </div>
    </section>
  );
}
