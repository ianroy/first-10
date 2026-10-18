import {
  ArrowDown,
  ArrowRight,
  Database,
  LockKeyhole,
  Monitor,
  Server,
  Sparkles,
} from "lucide-react";

/** A public, source-aligned overview. Keep the text equivalent beside the visual. */
export function StackDiagram() {
  return (
    <figure aria-labelledby="stack-title" className="rounded-3xl border bg-card p-5 md:p-8">
      <figcaption className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Under the hood
        </p>
        <h3 id="stack-title" className="mt-2 text-2xl font-bold">
          A small stack. Clear responsibilities.
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Your workspace holds the learning. The server handles the AI request. You review the
          draft.
        </p>
      </figcaption>
      <div className="grid items-start gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <div className="rounded-2xl border bg-background p-5">
          <Monitor aria-hidden="true" className="mb-4 size-6 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            01 · Your workspace
          </p>
          <p className="mt-2 font-display text-lg font-bold">React + TanStack</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Capture conversations, review evidence and choose a next step.
          </p>
        </div>
        <ArrowRight
          aria-hidden="true"
          className="mt-12 hidden size-5 text-muted-foreground md:block"
        />
        <div>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <Server aria-hidden="true" className="mb-4 size-6 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              02 · Authenticated server
            </p>
            <p className="mt-2 font-display text-lg font-bold">One AI gateway</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Check the session, select project context and request a structured draft.
            </p>
          </div>
          <ArrowDown aria-hidden="true" className="mx-auto my-3 size-5 text-muted-foreground" />
          <div className="rounded-2xl border bg-background p-5">
            <Database aria-hidden="true" className="mb-3 size-6 text-primary" />
            <p className="font-display text-lg font-bold">Supabase</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Authentication and saved project records, with database access policies.
            </p>
          </div>
        </div>
        <ArrowRight
          aria-hidden="true"
          className="mt-12 hidden size-5 text-muted-foreground md:block"
        />
        <div className="rounded-2xl border bg-background p-5">
          <Sparkles aria-hidden="true" className="mb-4 size-6 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            03 · Draft assistance
          </p>
          <p className="mt-2 font-display text-lg font-bold">OpenRouter</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A model proposes questions, summaries or outreach. A fluent answer still needs your
            review.
          </p>
        </div>
      </div>
      <div className="mt-6 flex items-start gap-2 rounded-xl bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
          The provider key stays on the server. Requested AI processing sends selected context to
          OpenRouter and its model provider. The app does not send customer outreach.
        </p>
      </div>
      <p className="sr-only">
        The browser calls an authenticated TanStack server function. Supabase provides
        authentication and project storage. The server sends selected context to OpenRouter,
        receives a structured draft and returns it for human review. Vercel hosts the application.
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        Hosted on Vercel · Human-reviewed drafts · Current architecture
      </p>
    </figure>
  );
}
