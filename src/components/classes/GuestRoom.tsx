import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { GuestMarketingWorkspace } from "@/components/guest-marketing/GuestMarketingWorkspace";
import { GuestLearningWorkspace } from "@/components/guest/GuestLearningWorkspace";
import { ConnectedGuestGrowthWorkspace } from "@/components/guest-growth/ConnectedGuestGrowthWorkspace";
import {
  bootstrapGuestSession,
  enterGuestSpace,
  manageGuestAccess,
} from "@/lib/guest-spaces.functions";
import {
  guestKindSchema,
  guestLink,
  guestMessage,
  takeGuestFragment,
  type GuestView,
  guestSecretsSchema,
} from "@/lib/guest-spaces/contracts";
import type { z } from "zod";
type Kind = z.infer<typeof guestKindSchema>;
type Keys = Partial<Record<"principal_recovery" | "team_return" | "team_invite", string>>;
const field = "mt-2 block min-h-12 w-full rounded-xl border bg-background p-3";
const button =
  "min-h-12 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50";
export function GuestRoom() {
  const [ready, setReady] = useState(false),
    [csrf, setCsrf] = useState(""),
    [view, setView] = useState<GuestView | null>(null);
  const [kind, setKind] = useState<Kind>("entry"),
    [code, setCode] = useState(""),
    [teamAlias, setTeamAlias] = useState(""),
    [alias, setAlias] = useState("");
  const [keys, setKeys] = useState<Keys>({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [studio, setStudio] = useState<"discovery" | "marketing" | "growth">("discovery");
  const [growthOpened, setGrowthOpened] = useState(false);
  const generation = useRef(0),
    alive = useRef(true),
    initialized = useRef(false),
    pendingLink = useRef(false);
  const workspaceDirty = useRef({ discovery: false, marketing: false, growth: false });
  const reportDirty = useCallback((dirty: boolean) => {
    workspaceDirty.current.discovery = dirty;
  }, []);
  const reportMarketingDirty = useCallback((dirty: boolean) => {
    workspaceDirty.current.marketing = dirty;
  }, []);
  const reportGrowthDirty = useCallback((dirty: boolean) => {
    workspaceDirty.current.growth = dirty;
  }, []);
  const confirmAccessChange = () =>
    !Object.values(workspaceDirty.current).some(Boolean) ||
    window.confirm(
      "Leave the guest editor with unsaved or unconfirmed work? Save or export first to keep local edits. A save already sent may still finish. Continue and leave this editor?",
    );
  useEffect(() => {
    alive.current = true;
    if (!initialized.current) {
      initialized.current = true;
      const cap = takeGuestFragment(window.location, window.history);
      pendingLink.current = Boolean(cap);
      if (cap) {
        setKind(cap.kind);
        setCode(cap.token);
      }
    }
    const load = async () => {
      const epoch = ++generation.current;
      const result = await bootstrapGuestSession();
      if (!alive.current || epoch !== generation.current) return;
      if (result.ok) {
        setCsrf(result.csrf);
        setView(pendingLink.current ? null : result.data);
      } else setMessage(guestMessage(result.code));
      setReady(true);
    };
    void load();
    const replace = () => {
      const cap = takeGuestFragment(window.location, window.history);
      if (!confirmAccessChange()) {
        setMessage(
          "Your current work is still here. Save or export it, then reopen the other access link.",
        );
        return;
      }
      pendingLink.current = Boolean(cap);
      generation.current++;
      setView(null);
      setKeys({});
      setMessage("");
      setReviewed(false);
      setBusy(false);
      setCode(cap?.token ?? "");
      setKind(cap?.kind ?? "entry");
      void load();
    };
    window.addEventListener("hashchange", replace);
    return () => {
      alive.current = false;
      // This is a request epoch, not a DOM reference; invalidate late receipts.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      window.removeEventListener("hashchange", replace);
    };
  }, []);
  const accept = async () => {
    if (busy || !reviewed) return;
    const epoch = ++generation.current;
    setBusy(true);
    setMessage("");
    setKeys({});
    setView(null);
    const result = await enterGuestSpace({
      data: { kind, token: code.trim(), teamAlias, principalAlias: alias, csrf },
    });
    if (!alive.current || epoch !== generation.current) return;
    setBusy(false);
    if (result.ok) {
      pendingLink.current = false;
      setView(result.data);
      setCsrf(result.csrf);
      setCode("");
      setReviewed(false);
      const secrets = zKeys(result.secrets);
      setKeys(secrets);
      setMessage(
        "You joined without a personal account. Save your private recovery key before leaving.",
      );
    } else setMessage(guestMessage(result.code));
  };
  const manage = async (
    operation: "logout" | "team_invite" | "rotate_team_return" | "rotate_principal_recovery",
  ) => {
    if (busy) return;
    if (!confirmAccessChange()) return;
    const epoch = generation.current;
    setBusy(true);
    setMessage("");
    const result = await manageGuestAccess({ data: { operation, csrf } });
    if (!alive.current || epoch !== generation.current) return;
    setBusy(false);
    if (result.ok) {
      setCsrf(result.csrf);
      if (operation === "logout") {
        generation.current++;
        setView(null);
        setKeys({});
        setMessage("This browser session ended. Use your separate recovery link to return.");
      } else if (result.token) {
        const key =
          operation === "rotate_team_return"
            ? "team_return"
            : operation === "rotate_principal_recovery"
              ? "principal_recovery"
              : "team_invite";
        setKeys((old) => ({ ...old, [key]: result.token! }));
        setMessage("New key shown once. Earlier keys of this type have been revoked.");
      }
    } else {
      setMessage(guestMessage(result.code));
      if (result.code === "NOT_FOUND") {
        setView(null);
        setKeys({});
      }
    }
  };
  return (
    <main
      className={`mx-auto min-h-screen px-6 py-10 lg:px-10 ${view ? "max-w-[1600px]" : "max-w-6xl"}`}
    >
      <header className="flex items-center justify-between gap-6">
        <Link to="/" aria-label="First Ten home">
          <BrandLogo className="h-10 w-auto" />
        </Link>
        <p className="text-sm font-semibold text-muted-foreground">
          A classroom. No student signup.
        </p>
      </header>
      <div
        className={view ? "my-10 space-y-8" : "my-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_330px]"}
      >
        <div className="space-y-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              {view ? view.mode : "Classes & hackathons"}
            </p>
            <h1 className="mt-3 text-4xl font-bold">
              {view ? view.className : "Start with your team, not an account."}
            </h1>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              Use a classroom alias. No email, password or real name is required. Team access and
              personal recovery stay separate.
            </p>
          </div>
          {!ready ? (
            <p role="status">Checking this browser’s guest session…</p>
          ) : view ? (
            <>
              <section className="rounded-2xl border bg-card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Your current scope
                    </p>
                    <h2 className="mt-2 text-2xl font-bold">{view.teamAlias}</h2>
                    <p className="mt-2 text-sm">Your alias: {view.principalAlias}</p>
                  </div>
                  <span className="rounded-full bg-secondary px-3 py-2 text-xs font-semibold">
                    AI off
                  </span>
                </div>
                <p className="mt-5 whitespace-pre-wrap text-sm">
                  {view.instructions || "Your teacher has not added class instructions."}
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  Class access ends {new Date(view.accessExpiresAt).toLocaleString()}. Browser
                  sessions last up to 24 hours. Requested retention: {view.retentionDays} days;
                  automatic deletion is not yet active.
                </p>
              </section>
              <section className="rounded-2xl border bg-card p-6">
                <h2 className="text-xl font-bold">Published assignments</h2>
                <div className="mt-4 space-y-4">
                  {view.assignments.map((a) => (
                    <article className="rounded-xl border p-4" key={a.id}>
                      <h3 className="font-bold">{a.title}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{a.instructions}</p>
                      {a.dueAt && (
                        <p className="mt-3 text-xs">Due {new Date(a.dueAt).toLocaleString()}</p>
                      )}
                    </article>
                  ))}
                  {view.assignments.length === 0 && (
                    <p className="text-sm text-muted-foreground">No published assignments yet.</p>
                  )}
                </div>
              </section>
              <section className="rounded-2xl border bg-card p-5">
                <nav aria-label="Learning studios" className="flex flex-wrap gap-3">
                  {(
                    [
                      ["discovery", "First conversations"],
                      ["marketing", "Next 50: $0 Marketing Lab"],
                      ["growth", "Learning & growth activities"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={studio === key}
                      aria-controls={`guest-${key}-studio`}
                      className={`min-h-12 rounded-xl border px-5 font-semibold ${studio === key ? "bg-primary text-primary-foreground" : "bg-background"}`}
                      onClick={() => {
                        if (key === "growth") setGrowthOpened(true);
                        setStudio(key);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                <p className="mt-3 text-sm text-muted-foreground">
                  Switch studios without losing local edits. Save before closing this browser. Each
                  studio keeps its own private or deliberately shared work.
                </p>
              </section>
              <div id="guest-discovery-studio" hidden={studio !== "discovery"}>
                <GuestLearningWorkspace view={view} csrf={csrf} onDirtyChange={reportDirty} />
              </div>
              <div id="guest-marketing-studio" hidden={studio !== "marketing"}>
                <GuestMarketingWorkspace
                  view={view}
                  csrf={csrf}
                  onDirtyChange={reportMarketingDirty}
                />
              </div>
              {growthOpened && (
                <div id="guest-growth-studio" hidden={studio !== "growth"}>
                  <ConnectedGuestGrowthWorkspace
                    view={view}
                    csrf={csrf}
                    onDirtyChange={reportGrowthDirty}
                  />
                </div>
              )}
              <section className="rounded-2xl border bg-card p-6">
                <h2 className="text-xl font-bold">Manage your access</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  A team invitation admits a new learner to shared team scope. It never restores
                  your private identity. Only your personal recovery key restores you; keep it
                  private.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    disabled={busy}
                    className={button}
                    onClick={() => void manage("team_invite")}
                  >
                    Make team invitation
                  </button>
                  <button
                    disabled={busy}
                    className="min-h-12 rounded-xl border px-4 text-sm font-semibold"
                    onClick={() => void manage("rotate_team_return")}
                  >
                    Replace team return key
                  </button>
                  <button
                    disabled={busy}
                    className="min-h-12 rounded-xl border px-4 text-sm font-semibold"
                    onClick={() => void manage("rotate_principal_recovery")}
                  >
                    Replace personal recovery key
                  </button>
                </div>
                <div className="mt-5 flex flex-wrap gap-5">
                  <button
                    disabled={busy}
                    className="min-h-11 underline"
                    onClick={() => {
                      if (!confirmAccessChange()) return;
                      generation.current++;
                      setView(null);
                      setKeys({});
                      setReviewed(false);
                      setCode("");
                      setMessage(
                        "Enter a new code or recovery link. Your previous keys still control their own scope.",
                      );
                    }}
                  >
                    Use another code
                  </button>
                  <button
                    disabled={busy}
                    className="min-h-11 underline"
                    onClick={() => void manage("logout")}
                  >
                    End this browser session
                  </button>
                </div>
              </section>
            </>
          ) : (
            <section className="rounded-2xl border bg-card p-6">
              <h2 className="text-xl font-bold">Enter or return</h2>
              <form
                className="mt-5 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void accept();
                }}
              >
                <label className="block text-sm font-semibold">
                  Access type
                  <select
                    value={kind}
                    onChange={(e) => {
                      setKind(e.target.value as Kind);
                      setCode("");
                      setReviewed(false);
                    }}
                    className={field}
                  >
                    <option value="entry">Class entry — create a new team</option>
                    <option value="team_invite">Team invitation — join an existing team</option>
                    <option value="team_return">
                      Shared team return — create a new learner alias
                    </option>
                    <option value="principal_recovery">
                      Personal recovery — restore only my private identity
                    </option>
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Private code
                  <input
                    required
                    autoComplete="off"
                    spellCheck={false}
                    value={code}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      try {
                        const url = new URL(value);
                        const cap = takeGuestFragment(
                          { pathname: "/join", hash: url.hash },
                          { replaceState: () => {} },
                        );
                        if (
                          url.origin === window.location.origin &&
                          url.pathname === "/join" &&
                          cap
                        ) {
                          setKind(cap.kind);
                          setCode(cap.token);
                          return;
                        }
                      } catch {
                        /* A raw code is expected. */
                      }
                      setCode(value);
                    }}
                    className={field + " font-mono text-xs"}
                    placeholder="Paste the full link or 64-character code"
                  />
                </label>
                {kind === "entry" && (
                  <label className="block text-sm font-semibold">
                    Team alias (optional)
                    <input
                      maxLength={80}
                      autoComplete="off"
                      value={teamAlias}
                      onChange={(e) => setTeamAlias(e.target.value)}
                      className={field}
                      placeholder="A project nickname; no real names needed"
                    />
                  </label>
                )}
                {kind !== "principal_recovery" && (
                  <label className="block text-sm font-semibold">
                    Your learner alias (optional)
                    <input
                      maxLength={80}
                      autoComplete="off"
                      value={alias}
                      onChange={(e) => setAlias(e.target.value)}
                      className={field}
                      placeholder="We can generate one for you"
                    />
                  </label>
                )}
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  I understand: a class code cannot read other teams; a shared team key does not
                  recover personal private work. I must save my personal recovery key; teachers
                  cannot retrieve it. Private drafts and deliberately shared work have separate
                  audiences.
                </label>
                <button disabled={busy || !csrf || !reviewed} className={button}>
                  {busy
                    ? "Checking access…"
                    : kind === "principal_recovery"
                      ? "Recover my identity"
                      : kind === "entry"
                        ? "Start a new team"
                        : "Join this team"}
                </button>
              </form>
            </section>
          )}
          {message && (
            <p role="status" className="rounded-xl border bg-secondary/30 p-4 text-sm">
              {message}
            </p>
          )}
        </div>
        <aside className={view ? "grid items-start gap-5 xl:grid-cols-3" : "space-y-5"}>
          <div className="rounded-2xl bg-primary p-6 text-primary-foreground">
            <h2 className="text-xl font-bold">Your recovery kit</h2>
            <p className="mt-3 text-sm leading-relaxed">
              Browser cookies expire. Save the keys shown here to return. Losing a personal recovery
              key loses that private identity; a team key cannot replace it.
            </p>
          </div>
          {Object.entries(keys).map(
            ([key, token]) =>
              token && (
                <RecoveryKey key={key + token} kind={key as Exclude<Kind, "entry">} token={token} />
              ),
          )}
          {Object.keys(keys).length === 0 && (
            <div className="rounded-2xl border p-5 text-sm text-muted-foreground">
              Keys appear once after entry or replacement. Only hashes are stored. They are never
              saved to browser local storage.
            </div>
          )}
          <div className="rounded-2xl border p-5 text-sm">
            <h3 className="font-semibold">What teachers can see</h3>
            <p className="mt-2">
              Team aliases, access state and only versions you deliberately review and submit to
              them. Private drafts, raw interviews and recovery secrets stay separate. Team planning
              is visible to current and future active teammates only when you explicitly create
              shared work.
            </p>
            <p className="mt-3">No external AI request is made from this space.</p>
          </div>
          <Link to="/auth" className="inline-flex min-h-11 items-center text-sm underline">
            Optional account sign-in
          </Link>
        </aside>
      </div>
    </main>
  );
}
function zKeys(secrets: z.infer<typeof guestSecretsSchema>): Keys {
  return {
    principal_recovery: secrets.principalRecovery,
    ...(secrets.teamReturn ? { team_return: secrets.teamReturn } : {}),
    ...(secrets.teamInvite ? { team_invite: secrets.teamInvite } : {}),
  };
}
function RecoveryKey({ kind, token }: { kind: Exclude<Kind, "entry">; token: string }) {
  const [message, setMessage] = useState("");
  const url = typeof window !== "undefined" ? guestLink(kind, token, window.location.origin) : "";
  const title = {
    principal_recovery: "Personal recovery — keep private",
    team_return: "Team return — shared team only",
    team_invite: "Team invitation — share intentionally",
  }[kind];
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h3 className="font-bold">{title}</h3>
      <p className="mt-2 text-xs text-muted-foreground">
        {kind === "principal_recovery"
          ? "One-use. Restoring rotates this key and ends your previous sessions. Never send it to a teammate."
          : kind === "team_invite"
            ? "Expires within 24 hours; admits new learner identities to this team."
            : "Expires within 30 days; creates a new learner identity. It cannot restore another learner’s private scope."}
      </p>
      <label className="mt-3 block text-xs">
        Recovery link
        <input readOnly autoComplete="off" value={url} className={field + " font-mono text-xs"} />
      </label>
      <div className="mt-3 flex flex-wrap gap-4">
        <button
          className="min-h-11 text-sm underline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setMessage("Copied. Store it somewhere private.");
            } catch {
              setMessage("Select the link and copy it manually.");
            }
          }}
        >
          Copy
        </button>
        <button
          className="min-h-11 text-sm underline"
          onClick={() => {
            const blob = new Blob(
              [
                title +
                  "\n\n" +
                  url +
                  "\n\nAnyone holding this key can use its described scope. Class closure or revocation ends access.\n",
              ],
              { type: "text/plain;charset=utf-8" },
            );
            const address = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = address;
            a.download = "first-ten-" + kind + "-key.txt";
            a.click();
            URL.revokeObjectURL(address);
          }}
        >
          Save key file
        </button>
      </div>
      {message && (
        <p role="status" className="mt-2 text-xs">
          {message}
        </p>
      )}
    </section>
  );
}
