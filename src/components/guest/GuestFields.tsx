import { useId, type ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
export function GuestField({
  label,
  value,
  onChange,
  max = 2000,
  hint,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="block space-y-2">
      <span className="block text-sm font-semibold">{label}</span>
      <Textarea
        id={id}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          if (Array.from(e.target.value).length <= max) onChange(e.target.value);
        }}
        className="min-h-24 bg-background"
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <span id={`${id}-hint`} className="block text-xs text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}
export function GuestSelect({
  label,
  value,
  onChange,
  children,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="block space-y-2">
      <span className="block text-sm font-semibold">{label}</span>
      <select
        id={id}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-lg border bg-background px-3"
      >
        {children}
      </select>
    </label>
  );
}
export function GuestChoice({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: "unknown" | "granted" | "withdrawn";
  onChange: (value: "unknown" | "granted" | "withdrawn") => void;
  disabled?: boolean;
}) {
  return (
    <GuestSelect
      label={label}
      value={value}
      disabled={disabled}
      onChange={(v) => {
        if (v === "unknown" || v === "granted" || v === "withdrawn") onChange(v);
      }}
    >
      <option value="unknown">Unknown / not asked</option>
      <option value="granted">Reported permission granted</option>
      <option value="withdrawn">Withdrawn</option>
    </GuestSelect>
  );
}
