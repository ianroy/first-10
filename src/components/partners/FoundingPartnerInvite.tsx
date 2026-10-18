import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

export function FoundingPartnerInvite() {
  return (
    <section
      aria-labelledby="founding-invite-title"
      className="my-10 rounded-3xl border border-primary/20 bg-secondary p-6 text-secondary-foreground sm:p-10"
    >
      <p className="text-xs font-bold uppercase tracking-widest">An invitation to educators</p>
      <div className="mt-4 grid items-center gap-6 lg:grid-cols-[1fr_auto]">
        <div>
          <h2 id="founding-invite-title" className="max-w-2xl text-3xl font-bold">
            Shape the next classroom. Two semesters free.
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed">
            Become a founding partner: try First Ten in your classes and tell us what works, what
            confuses students and what to improve. We’ll coordinate your two free semesters with
            you.
          </p>
          <p className="mt-3 text-sm">
            Our Spring 2027 target is ten schools. Partners are not yet confirmed; submitting
            interest starts a conversation.
          </p>
        </div>
        <Link
          to="/founding-partners"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
        >
          Become a founding partner <ArrowRight className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
