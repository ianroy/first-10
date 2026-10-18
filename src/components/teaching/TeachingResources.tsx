import { ArrowUpRight, Download, FileText } from "lucide-react";
import { resourceSize, teachingKit } from "./resources";

export function TeachingResources() {
  const totalPages = teachingKit.resources.reduce(
    (total, resource) => total + resource.printPages,
    0,
  );
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-5 rounded-2xl border border-primary/25 bg-secondary p-5 sm:p-7">
        <div>
          <h3 className="text-xl font-bold">The complete teaching kit</h3>
          <p className="mt-2 text-sm text-secondary-foreground">
            Version {teachingKit.version} · Updated{" "}
            <time dateTime={teachingKit.updated}>18 October 2026</time> · {totalPages} print pages
          </p>
          <p className="mt-2 max-w-xl text-sm text-secondary-foreground">
            A ready-to-print PDF, a readable HTML edition and editable Markdown sources. Adapt the
            dates and private submission route for your class.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href={teachingKit.printablePdf}
            download
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <Download className="size-4" aria-hidden="true" /> Download PDF{" "}
            <span className="font-normal">· {resourceSize(teachingKit.printablePdfBytes)}</span>
          </a>
          <a
            href={teachingKit.printableHtml}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 bg-card px-4 py-3 text-sm font-semibold text-primary hover:bg-background"
          >
            <FileText className="size-4" aria-hidden="true" /> Read or print HTML
          </a>
        </div>
      </div>
      <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {teachingKit.resources.map((resource, index) => (
          <article
            key={resource.id}
            aria-labelledby={`resource-${resource.id}`}
            className="flex flex-col rounded-2xl border border-border bg-card p-5 sm:p-6"
          >
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
              <span aria-hidden="true">HANDOUT 0{index + 1}</span>
              <span>
                {resource.printPages} print {resource.printPages === 1 ? "page" : "pages"}
              </span>
            </div>
            <h3 id={`resource-${resource.id}`} className="mt-5 text-xl font-bold">
              {resource.title}
            </h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
              {resource.description}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 border-t border-border pt-3">
              <a
                href={resource.markdown}
                download
                aria-label={`Download ${resource.title} (Markdown, ${resourceSize(resource.bytes)})`}
                className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-primary underline decoration-primary/40 underline-offset-4"
              >
                <Download className="size-4" aria-hidden="true" /> Markdown ·{" "}
                {resourceSize(resource.bytes)}
              </a>
              <a
                href={resource.html}
                aria-label={`Read ${resource.title} in HTML`}
                className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-semibold text-primary"
              >
                Read <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Markdown is plain text you can edit in a text editor or adapt into your own accessible
        document. Give worksheet A first; reveal the structured pages and facilitator reasoning only
        after students think and choose.
      </p>
    </>
  );
}
