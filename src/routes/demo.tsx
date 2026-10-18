import { BrandLogo } from "@/components/BrandLogo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, FileText } from "lucide-react";

import { StudyLoopDemo } from "@/components/demo/StudyLoopDemo";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "First Ten — Explore the StudyLoop example" },
      {
        name: "description",
        content:
          "Follow four fictional perspectives from an initial assumption to a proposed next test. No account or live AI call needed.",
      },
      { property: "og:title", content: "First Ten — Explore the StudyLoop example" },
      {
        property: "og:description",
        content:
          "A fictional customer-discovery example: inspect sources, consider disagreement and choose a small next test.",
      },
    ],
  }),
  component: DemoPage,
});

function DemoPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-8">
      <a href="#studyloop" className="sr-only focus:not-sr-only focus:inline-block focus:py-3">
        Skip to interactive example
      </a>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-5">
        <Link to="/" aria-label="First Ten home">
          <BrandLogo />
        </Link>
        <Link
          to="/auth"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-primary sm:text-base"
        >
          Start project
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      </header>
      <main>
        <div className="py-6 sm:py-7">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Explore a fictional case
          </p>
          <h1 className="mt-3 font-display text-2xl font-bold leading-tight sm:text-4xl">
            What if the first assumption changes?
          </h1>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <p className="max-w-2xl text-lg text-muted-foreground">
              Follow StudyLoop’s fictional path from four conversations to one proposed test.
            </p>
            <a
              href="/demo/studyloop.html"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg py-2 font-semibold text-primary underline underline-offset-4"
            >
              <FileText aria-hidden="true" className="size-4" />
              Read the example
            </a>
          </div>
        </div>
        <div id="studyloop" className="scroll-mt-4">
          <StudyLoopDemo />
        </div>
        <footer className="mt-6 flex flex-wrap justify-between gap-4 text-sm text-muted-foreground">
          <p className="max-w-3xl">
            A teaching example of the method. Source-linked review here does not represent every
            feature in the signed-in app. All people, excerpts and choices are fictional; no
            experiment has run.
          </p>
          <p>
            No account needed.
            <br />
            No live AI call.
          </p>
        </footer>
      </main>
    </div>
  );
}
