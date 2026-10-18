import { useEffect, useState } from "react";
import QRCode from "qrcode";
export function EntryLink({ url, label = "Class entry link" }: { url: string; label?: string }) {
  const [qr, setQr] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setQr("");
    void QRCode.toDataURL(url, { width: 320, margin: 2, errorCorrectionLevel: "M" })
      .then((value) => {
        if (active) setQr(value);
      })
      .catch(() => {
        if (active) setMessage("QR unavailable; use the complete link below.");
      });
    return () => {
      active = false;
    };
  }, [url]);
  return (
    <div className="grid gap-5 rounded-2xl border bg-white p-5 text-slate-900 md:grid-cols-[200px_1fr]">
      <div>
        {qr && (
          <img src={qr} width={200} height={200} alt="Scan to join this class without an account" />
        )}
      </div>
      <div className="space-y-3">
        <label className="block text-sm font-semibold">
          {label}
          <input
            readOnly
            autoComplete="off"
            value={url}
            className="mt-2 block w-full rounded-lg border p-3 font-mono text-xs"
          />
        </label>
        <button
          className="min-h-11 font-semibold underline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setMessage("Link copied.");
            } catch {
              setMessage("Select and copy the visible link.");
            }
          }}
        >
          Copy link
        </button>
        <p className="text-sm">
          Display this entry QR to create a new team. It cannot reveal a roster or read another
          team’s work.
        </p>
        {message && <p role="status">{message}</p>}
      </div>
    </div>
  );
}
