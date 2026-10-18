import { useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BookOpen, Check, MessageSquare } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitFoundingPartner } from "@/lib/founding-partners.functions";

const linkClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

export function FoundingPartnersPage() {
  const submitRequest = useServerFn(submitFoundingPartner);
  const [kind, setKind] = useState<"interest" | "feedback">("interest");
  const [email, setEmail] = useState("");
  const [school, setSchool] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [received, setReceived] = useState<"interest" | "feedback" | null>(null);
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await submitRequest({
        data: { email: email.trim(), school: school.trim(), kind, note: note.trim(), website },
      });
      if (result.ok) setReceived(kind);
      else
        setError(
          result.code === "INVALID"
            ? "Check your email and school or institution, then try again. Your entries are still here."
            : result.code === "RATE_LIMITED"
              ? "Please wait a little before trying again. Your entries are still here."
              : "We could not confirm receipt. Your entries are still here; please try again.",
        );
    } catch {
      setError("We could not confirm receipt. Your entries are still here; please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#partner-request"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3"
      >
        Skip to partner request
      </a>
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <a href="/" aria-label="First Ten home">
          <BrandLogo className="h-9 w-auto" />
        </a>
        <nav
          aria-label="Partner page navigation"
          className="flex flex-wrap items-center gap-5 text-sm font-semibold"
        >
          <a href="/demo" className="underline-offset-4 hover:underline">
            Try the example
          </a>
          <a href="/teach" className="underline-offset-4 hover:underline">
            Teaching kit
          </a>
          <a href="/auth?view=educator" className="underline-offset-4 hover:underline">
            Educator sign in
          </a>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-5 pb-16 pt-7 sm:px-8 lg:pt-12">
        <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <section aria-labelledby="partner-title">
            <p className="mb-5 inline-flex rounded-full bg-accent px-4 py-2 text-xs font-bold uppercase tracking-widest text-accent-foreground">
              An invitation to educators
            </p>
            <h1
              id="partner-title"
              className="max-w-2xl font-display text-4xl font-extrabold leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl"
            >
              Teach with First Ten.{" "}
              <span className="text-primary">Help shape what comes next.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Give students a place to turn customer conversations into a next decision they can
              explain. Help us learn what supports your teaching—and what gets in the way.
            </p>
            <div className="mt-8 rounded-2xl bg-primary p-6 text-primary-foreground sm:p-7">
              <p className="text-sm font-semibold uppercase tracking-widest">
                The founding-partner offer
              </p>
              <p className="mt-3 font-display text-3xl font-bold leading-tight">
                Founding partners receive two semesters of free use.
              </p>
              <p className="mt-4 text-base leading-relaxed">
                In return, try First Ten in class and share candid feedback. We’ll coordinate the
                timing and classroom fit with you.
              </p>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Our target is a founding cohort of 10 schools for Spring 2027. This is an invitation,
              not a count of confirmed partners. Submitting interest starts a conversation; it does
              not automatically activate access.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="/demo" className={linkClass}>
                Explore the example <ArrowRight className="size-4" aria-hidden="true" />
              </a>
              <a href="/teach" className={linkClass}>
                Get the classroom kit <BookOpen className="size-4" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              No signup required for the fictional example or teaching kit.
            </p>
          </section>

          <section
            id="partner-request"
            aria-labelledby="request-title"
            className="scroll-mt-6 rounded-3xl border bg-card p-6 shadow-sm sm:p-8"
          >
            {received ? (
              <div role="status" className="py-8">
                <span className="mb-6 inline-flex size-14 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
                  <Check className="size-7" aria-hidden="true" />
                </span>
                <h2 id="request-title" className="font-display text-3xl font-bold">
                  {received === "interest" ? "Request received." : "Feedback received."}
                </h2>
                <p className="mt-4 text-lg leading-relaxed">
                  {received === "interest"
                    ? "We’ll coordinate your two free semesters and classroom feedback."
                    : "Thank you for sharing what worked and what got in the way. Your feedback is now with the First Ten team."}
                </p>
                <p className="mt-4 text-sm text-muted-foreground">
                  No account was created or access automatically granted. This form does not send an
                  automatic email.
                </p>
                <a href="/teach" className={`${linkClass} mt-7`}>
                  Plan your first lesson <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              </div>
            ) : (
              <form onSubmit={submit} aria-busy={busy}>
                <h2 id="request-title" className="font-display text-2xl font-bold">
                  Let’s make the next class useful.
                </h2>
                <p className="mb-6 mt-2 text-sm leading-relaxed text-muted-foreground">
                  Tell us where you teach, or share feedback from today’s workshop. No account
                  required.
                </p>
                <fieldset disabled={busy} className="space-y-5">
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-semibold">I’d like to</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(
                        [
                          ["interest", "Explore a partnership"],
                          ["feedback", "Share feedback"],
                        ] as const
                      ).map(([value, label]) => (
                        <label
                          key={value}
                          className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold ${kind === value ? "border-primary bg-secondary" : "bg-background"}`}
                        >
                          <input
                            type="radio"
                            name="kind"
                            value={value}
                            checked={kind === value}
                            onChange={() => setKind(value)}
                            className="accent-primary"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold">
                      Email <span className="font-normal">(required)</span>
                    </span>
                    <Input
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@school.edu"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold">
                      School or institution <span className="font-normal">(required)</span>
                    </span>
                    <Input
                      name="school"
                      autoComplete="organization"
                      required
                      maxLength={200}
                      value={school}
                      onChange={(event) => setSchool(event.target.value)}
                      placeholder="Where you teach"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold">
                      {kind === "interest"
                        ? "What would you like to try?"
                        : "What worked? Where did you get stuck?"}{" "}
                      <span className="font-normal">
                        {kind === "feedback" ? "(required)" : "(optional)"}
                      </span>
                    </span>
                    <Textarea
                      name="note"
                      rows={5}
                      maxLength={2000}
                      required={kind === "feedback"}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder={
                        kind === "interest"
                          ? "A course, a classroom challenge, or a question for us…"
                          : "A concrete moment, what you expected, and what happened…"
                      }
                    />
                    <span className="block text-xs text-muted-foreground">
                      Please leave out student names, private interview notes and other sensitive
                      information.
                    </span>
                  </label>
                  <div hidden aria-hidden="true">
                    <label>
                      Website
                      <Input
                        name="website"
                        tabIndex={-1}
                        autoComplete="off"
                        value={website}
                        onChange={(event) => setWebsite(event.target.value)}
                      />
                    </label>
                  </div>
                  <p id="partner-privacy" className="text-xs leading-relaxed text-muted-foreground">
                    Your email, school and note are stored privately for the First Ten team to
                    respond to this request and coordinate classroom feedback. This is not a public
                    post. No emails are automatically sent by this form.
                  </p>
                  {error && (
                    <p
                      role="alert"
                      className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive-soft-foreground"
                    >
                      {error}
                    </p>
                  )}
                  <Button
                    type="submit"
                    aria-describedby="partner-privacy"
                    className="min-h-12 w-full gap-2 text-base"
                  >
                    {busy
                      ? "Sending…"
                      : kind === "interest"
                        ? "Join founding partners"
                        : "Send feedback"}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                </fieldset>
              </form>
            )}
          </section>
        </div>
        <section
          aria-label="How we will learn together"
          className="mt-14 grid gap-6 border-t pt-8 md:grid-cols-3"
        >
          {[
            [
              "01",
              "Try a real lesson",
              "Use the fictional case, student-first thinking and classroom kit. Start with a small activity that fits your course.",
            ],
            [
              "02",
              "Tell us what happened",
              "Share useful moments, confusing steps and what students needed. Disagreement is useful feedback too.",
            ],
            [
              "03",
              "Help set the next priority",
              "Your classroom experience can inform what we improve. We’ll distinguish requests from features that are ready.",
            ],
          ].map(([number, title, description]) => (
            <div key={number}>
              <p className="text-xs font-bold tracking-widest text-primary">{number}</p>
              <h2 className="mt-2 text-xl font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
          ))}
        </section>
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <MessageSquare className="size-4" aria-hidden="true" />
            Your experience shapes the next useful step.
          </p>
          <a href="/pitch/index.html" className="font-semibold underline underline-offset-4">
            Return to the short pitch
          </a>
        </footer>
      </main>
    </div>
  );
}
