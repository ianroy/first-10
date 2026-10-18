import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OwnerActivityExport } from "@/components/export/OwnerActivityExport";
import { publicContextActivities } from "@/lib/export/public-context-adapters";
import {
  loadPublicContext,
  retrievePublicContext,
  reviewPublicContext,
  withdrawPublicContext,
} from "@/lib/context.functions";
import {
  publicContextMessage,
  type PublicContextPreview,
  type ReviewedPublicSource,
} from "@/lib/context/contracts";
const noop = (_dirty: boolean) => {};
type Rows = { previews: PublicContextPreview[]; reviewed: ReviewedPublicSource[] };
export function RemoteContextPanel({
  projectId,
  ownerId,
  archived = false,
  disabled = false,
  onDirtyChange = noop,
}: {
  projectId: string;
  ownerId: string;
  archived?: boolean;
  disabled?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [rows, setRows] = useState<Rows>({ previews: [], reviewed: [] });
  const [kind, setKind] = useState<"website" | "github">("website"),
    [url, setUrl] = useState(""),
    [paths, setPaths] = useState("README.md"),
    [previewPermission, setPreviewPermission] = useState(false);
  const [selected, setSelected] = useState(""),
    [label, setLabel] = useState(""),
    [excerpt, setExcerpt] = useState(""),
    [read, setRead] = useState(false),
    [permitted, setPermitted] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const previewText = useRef<HTMLTextAreaElement>(null),
    mounted = useRef(false),
    active = useRef(false),
    epoch = useRef(0),
    scope = useRef(`${ownerId}:${projectId}`);
  scope.current = `${ownerId}:${projectId}`;
  const draftDirty = !!label || !!excerpt || read || permitted;
  const preview = rows.previews.find((p) => p.id === selected);
  useEffect(() => {
    onDirtyChange(busy || !!url.trim() || draftDirty);
  }, [busy, url, draftDirty, onDirtyChange]);
  useEffect(() => {
    mounted.current = true;
    active.current = true;
    const version = ++epoch.current;
    const identity = `${ownerId}:${projectId}`;
    setRows({ previews: [], reviewed: [] });
    setSelected("");
    setUrl("");
    setLabel("");
    setExcerpt("");
    setRead(false);
    setPermitted(false);
    setPreviewPermission(false);
    setMessage("");
    setBusy(true);
    void loadPublicContext({ data: { projectId } })
      .then((result) => {
        if (!mounted.current || epoch.current !== version || scope.current !== identity) return;
        if (result.ok) {
          setRows(result);
          setSelected(result.previews[0]?.id ?? "");
        } else setMessage(publicContextMessage(result.code));
      })
      .catch(() => {
        if (mounted.current && epoch.current === version)
          setMessage(publicContextMessage("UNAVAILABLE"));
      })
      .finally(() => {
        if (mounted.current && epoch.current === version) {
          active.current = false;
          setBusy(false);
        }
      });
    return () => {
      mounted.current = false;
      onDirtyChange(false);
    };
  }, [projectId, ownerId, onDirtyChange]);
  function clearReview() {
    setLabel("");
    setExcerpt("");
    setRead(false);
    setPermitted(false);
  }
  async function run<T>(
    work: () => Promise<T>,
    apply: (result: T, current: () => boolean) => void | Promise<void>,
  ) {
    if (active.current || disabled) return;
    active.current = true;
    setBusy(true);
    setMessage("");
    const version = epoch.current,
      identity = scope.current;
    const current = () =>
      mounted.current && epoch.current === version && scope.current === identity;
    try {
      const result = await work();
      if (current()) await apply(result, current);
    } catch {
      if (current()) setMessage(publicContextMessage("UNAVAILABLE"));
    } finally {
      if (current()) {
        active.current = false;
        setBusy(false);
      }
    }
  }
  function refresh() {
    if (draftDirty) return;
    void run(
      () => loadPublicContext({ data: { projectId } }),
      (result) => {
        if (result.ok) {
          setRows(result);
          setSelected(
            result.previews.some((p) => p.id === selected)
              ? selected
              : (result.previews[0]?.id ?? ""),
          );
        } else setMessage(publicContextMessage(result.code));
      },
    );
  }
  function retrieve() {
    if (archived || draftDirty || !url.trim() || !previewPermission) return;
    const operationId = crypto.randomUUID();
    void run(
      () =>
        retrievePublicContext({
          data: {
            projectId,
            operationId,
            kind,
            url,
            paths:
              kind === "github"
                ? paths
                    .split(/\r?\n/)
                    .map((p) => p.trim())
                    .filter(Boolean)
                : [],
            previewPermission: true,
          },
        }),
      async (result, current) => {
        if (!result.ok) {
          setMessage(publicContextMessage(result.code));
          return;
        }
        setUrl("");
        setPreviewPermission(false);
        const list = await loadPublicContext({ data: { projectId } });
        if (!current()) return;
        if (list.ok) {
          setRows(list);
          setSelected(list.previews[0]?.id ?? "");
          setMessage(
            "Preview retrieved. Read it and select an excerpt before saving a reviewed source.",
          );
        } else
          setMessage(
            "The preview was saved. Refresh sources to view it; existing sources are unchanged.",
          );
      },
    );
  }
  function review() {
    if (!preview || !read || !permitted || archived || !label.trim() || !excerpt) return;
    void run(
      () =>
        reviewPublicContext({
          data: {
            projectId,
            previewId: preview.id,
            expectedHash: preview.source.previewHash,
            label,
            excerpt,
            storagePermission: true,
          },
        }),
      (result) => {
        if (!result.ok) {
          setMessage(publicContextMessage(result.code));
          return;
        }
        setRows((r) => ({
          previews: r.previews.filter((p) => p.id !== preview.id),
          reviewed: [result.source, ...r.reviewed.filter((s) => s.id !== result.source.id)],
        }));
        setSelected(rows.previews.find((p) => p.id !== preview.id)?.id ?? "");
        clearReview();
        setMessage(
          "Reviewed source saved privately. AI and sharing remain disabled for this source.",
        );
      },
    );
  }
  function withdraw(source: ReviewedPublicSource) {
    if (source.status !== "active") return;
    void run(
      () =>
        withdrawPublicContext({
          data: { projectId, sourceId: source.id, expectedRevision: source.revision },
        }),
      (result) => {
        if (!result.ok) {
          setMessage(publicContextMessage(result.code));
          return;
        }
        setRows((r) => ({
          ...r,
          reviewed: r.reviewed.map((s) => (s.id === result.source.id ? result.source : s)),
        }));
        setMessage("Source withdrawn from current use. Retained history has not been deleted.");
      },
    );
  }
  function selectExcerpt(all = false) {
    if (!preview) return;
    const element = previewText.current;
    const selectedText = all
      ? preview.source.text
      : element
        ? preview.source.text.slice(element.selectionStart, element.selectionEnd)
        : "";
    if (
      !selectedText ||
      Array.from(selectedText).length > 6000 ||
      new TextEncoder().encode(selectedText).byteLength > 24576
    ) {
      setMessage("Select an excerpt of at most 6,000 characters from the preview.");
      return;
    }
    setExcerpt(selectedText);
    setRead(false);
    setPermitted(false);
  }
  return (
    <details className="rounded-2xl border bg-card p-5">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Read a public site or GitHub source
      </summary>
      <p className="mt-3 text-sm text-muted-foreground">
        Retrieve a limited public preview, then choose what to keep. Static text and repository
        descriptions are unverified author claims, never customer evidence. No scripts run and
        nothing here is sent to AI. Existing stored links stay unread.
      </p>
      {archived && (
        <p className="mt-3 text-sm">
          This idea is archived. You can read saved sources and withdraw them; restore the idea
          before retrieving or reviewing new material.
        </p>
      )}
      <fieldset disabled={busy || disabled || archived} className="mt-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
          <label className="space-y-2">
            <span className="block text-sm font-semibold">Public source type</span>
            <select
              className="min-h-11 w-full rounded-lg border bg-background px-3"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="website">Public website</option>
              <option value="github">Public GitHub repository</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-semibold">Public HTTPS URL</span>
            <Input
              type="url"
              value={url}
              maxLength={2048}
              onChange={(e) => {
                setUrl(e.target.value);
                setPreviewPermission(false);
              }}
              placeholder={
                kind === "github"
                  ? "https://github.com/owner/repository"
                  : "https://your-public-product.com/"
              }
            />
          </label>
        </div>
        {kind === "github" && (
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Up to three text files, one path per line</span>
            <Textarea
              value={paths}
              maxLength={602}
              rows={3}
              onChange={(e) => {
                setPaths(e.target.value);
                setPreviewPermission(false);
              }}
            />
            <span className="block text-xs text-muted-foreground">
              README.md by default. Root files or one directory, such as src/App.tsx. No private
              repositories, tokens, symlinks, submodules or dependency folders. Whole file text must
              fit 24 KiB. For a larger README, select a smaller permitted file or paste an excerpt
              you reviewed into the manual context activity.
            </span>
          </label>
        )}
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={previewPermission}
            onChange={(e) => setPreviewPermission(e.target.checked)}
          />
          I may retrieve and store a private preview of this public material. It contains no
          credentials or sensitive participant data.
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={retrieve}
            disabled={!url.trim() || !previewPermission || draftDirty}
          >
            Retrieve public preview
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setUrl("");
                setPreviewPermission(false);
              }}
            >
              Clear URL draft
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          HTTPS only, without query parameters or credentials. One static page or a few
          commit-pinned files; unsupported, large or rate-limited sources can still be pasted
          manually below. Preview access expires after 15 minutes; this is not a promise of physical
          deletion.
        </p>
      </fieldset>
      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Private previews and reviewed sources</p>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || disabled || draftDirty}
          onClick={refresh}
        >
          Refresh sources
        </Button>
      </div>
      {message && (
        <p role="status" className="mt-3 rounded-lg bg-secondary p-3 text-sm">
          {message}
        </p>
      )}
      {busy && (
        <p role="status" className="mt-3 text-sm">
          Checking public source…
        </p>
      )}
      {!!rows.previews.length && (
        <div className="mt-4 space-y-4 rounded-xl border p-4">
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Choose a retrieved preview</span>
            <select
              className="min-h-11 w-full rounded-lg border bg-background px-3"
              value={selected}
              disabled={busy || disabled || draftDirty}
              onChange={(e) => setSelected(e.target.value)}
            >
              {rows.previews.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.source.title} · not reviewed
                </option>
              ))}
            </select>
          </label>
          {preview && (
            <>
              <p className="break-all text-xs text-muted-foreground">
                {preview.source.url}
                <br />
                Retrieved {new Date(preview.retrievedAt).toLocaleString()} ·{" "}
                {preview.source.format === "html_static_text"
                  ? "Extracted static text, not a rendered page"
                  : preview.source.format.replaceAll("_", " ")}
                {preview.source.commitSha && <> · commit {preview.source.commitSha}</>}
              </p>
              <label className="block space-y-2">
                <span className="text-sm font-semibold">
                  Retrieved text (untrusted, not reviewed)
                </span>
                <Textarea
                  ref={previewText}
                  readOnly
                  value={preview.source.text}
                  rows={8}
                  className="font-mono text-xs"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || disabled || archived}
                  onClick={() => selectExcerpt()}
                >
                  Use highlighted text
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={
                    busy || disabled || archived || Array.from(preview.source.text).length > 6000
                  }
                  onClick={() => selectExcerpt(true)}
                >
                  Use entire preview
                </Button>
              </div>
              <fieldset disabled={busy || disabled || archived} className="space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-semibold">Your source label</span>
                  <Input
                    value={label}
                    maxLength={120}
                    onChange={(e) => {
                      setLabel(e.target.value);
                      setRead(false);
                    }}
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-semibold">
                    Exact excerpt to keep (up to 6,000 characters)
                  </span>
                  <Textarea
                    value={excerpt}
                    rows={5}
                    onChange={(e) => {
                      setExcerpt(e.target.value);
                      setRead(false);
                      setPermitted(false);
                    }}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={read}
                    onChange={(e) => setRead(e.target.checked)}
                  />
                  I read this excerpt and understand it is an unverified public source.
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={permitted}
                    onChange={(e) => setPermitted(e.target.checked)}
                  />
                  I own this material or have permission to keep this excerpt privately. This does
                  not authorize AI or sharing.
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={review}
                    disabled={!read || !permitted || !label.trim() || !excerpt}
                  >
                    Save reviewed source
                  </Button>
                  <Button type="button" variant="ghost" onClick={clearReview}>
                    Discard review draft
                  </Button>
                </div>
              </fieldset>
              <p className="text-xs text-muted-foreground">
                One immutable reviewed excerpt per preview, up to 20 versions per idea. A changed
                selection needs a new retrieval. Existing manual links and pasted sources are
                independent.
              </p>
            </>
          )}
        </div>
      )}
      <div className="mt-4 space-y-3">
        {rows.reviewed.map((source) => (
          <article key={source.id} className="rounded-xl border p-4">
            {source.status === "withdrawn" ? (
              <p className="text-sm">
                Withdrawn source · contents hidden. Retained history has not been deleted.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">{source.label}</h3>
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                    Owner reviewed · AI excluded
                  </span>
                </div>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  {source.source.url}
                  <br />
                  {source.source.format.replaceAll("_", " ")} · reviewed{" "}
                  {new Date(source.reviewedAt).toLocaleString()}
                  {source.source.commitSha && <> · commit {source.source.commitSha}</>}
                </p>
                <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">
                  {source.excerpt}
                </pre>
                <p className="mt-3 break-all text-xs text-muted-foreground">
                  Excerpt SHA-256: {source.excerptHash}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  disabled={busy || disabled}
                  onClick={() => withdraw(source)}
                >
                  Withdraw {source.label}
                </Button>
              </>
            )}
          </article>
        ))}
      </div>
      {!busy && !rows.previews.length && !rows.reviewed.length && (
        <p className="mt-4 text-sm text-muted-foreground">
          No public-source previews or reviewed excerpts are saved for this idea.
        </p>
      )}
      {!busy && (rows.previews.length > 0 || rows.reviewed.length > 0) && (
        <OwnerActivityExport
          project={{ id: projectId, user_id: ownerId }}
          activities={() =>
            publicContextActivities(
              { id: projectId, user_id: ownerId },
              { ok: true, ...rows },
              preview && draftDirty
                ? { previewId: preview.id, label, excerpt, read, permitted }
                : undefined,
            )
          }
          allowPortfolio
        />
      )}
    </details>
  );
}
