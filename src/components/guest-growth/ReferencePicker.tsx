import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { GuestSelect } from "@/components/guest/GuestFields";
import { guestActivityResult } from "@/lib/guest-activities/contracts";
import {
  guestGrowthHistorySchema,
  type guestGrowthHeaderSchema,
  type GuestGrowthReference,
} from "@/lib/guest-growth/contracts";
import type { GuestView } from "@/lib/guest-spaces/contracts";
import type { GuestGrowthPorts } from "./ports";
type Header = z.infer<typeof guestGrowthHeaderSchema>;
type Props = {
  label: string;
  target: GuestGrowthReference["kind"];
  value: GuestGrowthReference | null;
  headers: readonly Header[];
  view: GuestView;
  csrf: string;
  audience: "principal_private" | "team_shared";
  ports: GuestGrowthPorts;
  onChange: (v: GuestGrowthReference | null) => void;
  disabled?: boolean;
};
export function ReferencePicker(props: Props) {
  const { view, csrf, target, audience } = props;
  return (
    <Picker
      key={`${view.classId}:${view.teamId}:${view.principalId}:${csrf}:${view.accessExpiresAt}:${target}:${audience}`}
      {...props}
    />
  );
}
function Picker({
  label,
  target,
  value,
  headers,
  view,
  csrf,
  audience,
  ports,
  onChange,
  disabled = false,
}: Props) {
  const [artifact, setArtifact] = useState(value?.artifactId ?? ""),
    [versions, setVersions] = useState<Header[]>([]),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const life = useRef({ alive: true, epoch: 0 });
  useEffect(() => {
    const s = life.current;
    s.alive = true;
    return () => {
      s.alive = false;
      s.epoch++;
    };
  }, []);
  const allowed = (h: Header) =>
    h.kind === target &&
    h.classId === view.classId &&
    h.teamId === view.teamId &&
    (h.audience === "team_shared" ||
      (audience === "principal_private" && h.authorPrincipalId === view.principalId));
  const options = headers.filter(allowed);
  async function load() {
    if (!artifact || busy || Date.now() >= Date.parse(view.accessExpiresAt)) return;
    const token = ++life.current.epoch;
    setBusy(true);
    setMessage("");
    setVersions([]);
    setSelected("");
    const raw = await ports.history({ csrf, artifactId: artifact }).catch(() => null);
    if (!life.current.alive || token !== life.current.epoch) return;
    if (Date.now() >= Date.parse(view.accessExpiresAt)) {
      setBusy(false);
      setMessage("Guest access ended before these revisions could be confirmed.");
      return;
    }
    setBusy(false);
    const r = guestActivityResult(guestGrowthHistorySchema).safeParse(raw);
    if (
      !r.success ||
      !r.data.ok ||
      r.data.data.artifactId !== artifact ||
      r.data.data.versions.some((h) => !allowed(h))
    ) {
      setMessage("These retained revisions could not be confirmed in this guest scope.");
      return;
    }
    setVersions(r.data.data.versions);
  }
  return (
    <div className="space-y-3 rounded-xl border bg-background p-4">
      <h5 className="font-semibold">{label}</h5>
      {value && (
        <p className="text-xs text-muted-foreground">
          Linked {value.kind.replaceAll("_", " ")} · exact retained revision {value.revision}.
          Linked content is not copied.
        </p>
      )}
      <GuestSelect
        label={`${label} artifact`}
        value={artifact}
        disabled={disabled || busy}
        onChange={(v) => {
          life.current.epoch++;
          setBusy(false);
          setArtifact(v);
          setVersions([]);
          setSelected("");
          setMessage("");
        }}
      >
        <option value="">Choose an authorized saved artifact</option>
        {options.map((h, i) => (
          <option key={h.id} value={h.id}>
            {target.replaceAll("_", " ")} {i + 1} · current revision {h.revision} ·{" "}
            {h.audience === "team_shared" ? "team" : "private"}
          </option>
        ))}
      </GuestSelect>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || busy || !artifact}
          onClick={() => void load()}
        >
          {busy ? "Checking revisions…" : "Load retained reference revisions"}
        </Button>
        {value && (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || busy}
            onClick={() => onChange(null)}
          >
            Remove reference
          </Button>
        )}
      </div>
      {versions.length > 0 && (
        <>
          <GuestSelect
            label={`${label} retained revision`}
            value={selected}
            disabled={disabled || busy}
            onChange={setSelected}
          >
            <option value="">Choose an exact retained revision</option>
            {versions.map((h) => (
              <option key={h.revision} value={h.revision}>
                Revision {h.revision} · {new Date(h.savedAt).toLocaleString()}
              </option>
            ))}
          </GuestSelect>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || busy || !selected}
            onClick={() => {
              const h = versions.find((v) => v.revision === Number(selected));
              if (h && allowed(h) && Date.now() < Date.parse(view.accessExpiresAt))
                onChange({ kind: target, artifactId: h.id, revision: h.revision });
            }}
          >
            Use this exact reference
          </Button>
        </>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Choose from actually loaded saved metadata. Availability is checked again when saving. No
        interview, account or cross-studio attachment.
      </p>
    </div>
  );
}
