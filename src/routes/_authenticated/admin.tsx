import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { AppShell, Card } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { getAdminSnapshot } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "Operations — First Ten" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = Route.useRouteContext();
  const load = useServerFn(getAdminSnapshot);
  const report = useQuery({
    queryKey: ["admin-operational-counts", user.id],
    queryFn: () => load(),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const snapshot = report.isError ? undefined : report.data;
  return (
    <AppShell title="Operations">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Admin · saved records
          </p>
          <p className="mt-2 text-muted-foreground">
            A count-only view of the database. These totals include demo/test records and manually
            reported states; they are not customer, learning or retention outcomes.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => report.refetch()}
          disabled={report.isFetching}
          aria-busy={report.isFetching}
        >
          <RefreshCw aria-hidden="true" /> {report.isFetching ? "Checking…" : "Refresh counts"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-3 text-sm font-semibold">
        <Link
          to="/dashboard"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4"
        >
          Your project <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
        <a
          href="/account"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4"
        >
          Account tools <ArrowUpRight aria-hidden="true" className="size-4" />
        </a>
      </div>

      {report.isPending && (
        <Card>
          <p role="status" className="text-muted-foreground">
            Checking admin access and loading operational counts…
          </p>
        </Card>
      )}
      {report.isError && (
        <Card>
          <div role="alert">
            <h2 className="text-xl font-bold">Admin access unavailable</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              This request could not be authorized or verified. Access requires a server-assigned
              admin role; signing in or changing profile details does not grant it. Your individual
              project and account tools remain separate.
            </p>
          </div>
        </Card>
      )}
      {snapshot && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
            <p className="inline-flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="size-4" /> Server-verified admin access
            </p>
            <p>
              Checked{" "}
              <time dateTime={snapshot.asOf}>{new Date(snapshot.asOf).toLocaleString()}</time>
            </p>
          </div>
          {snapshot.status !== "ready" && (
            <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm">
              {snapshot.status === "unavailable"
                ? "Operational counts are unavailable. The service may need configuration or a retry. Missing values are not zero."
                : "Some counts could not be retrieved. Available values are shown; a dash means unavailable, not zero."}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {snapshot.metrics.map((metric) => (
              <Card key={metric.key} className="min-w-0">
                <Database aria-hidden="true" className="mb-4 size-5 text-primary" />
                <h2 className="text-base font-semibold">{metric.label}</h2>
                <p
                  className="mt-3 font-display text-4xl font-bold"
                  aria-label={`${metric.label}: ${metric.total === null ? "unavailable" : metric.total}`}
                >
                  {metric.total === null ? "—" : metric.total.toLocaleString()}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Current presenter:{" "}
                  {metric.presenter === null ? "unavailable" : metric.presenter.toLocaleString()}{" "}
                  records
                </p>
              </Card>
            ))}
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            “Current presenter” identifies records owned by this signed-in demo admin. Other
            demo/test accounts may still be included in the totals. Counts are read independently
            and can change while a refresh is running.
          </p>
        </>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold">Acquisition and return</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            The product does not yet record a comparable event funnel. Database rows cannot supply
            these measures.
          </p>
          <dl className="mt-5 divide-y divide-border">
            {[
              "Site visits",
              "Account signups",
              "First useful action",
              "Returning users",
              "Conversion rate",
            ].map((label) => (
              <div key={label} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
                <dt className="font-semibold">{label}</dt>
                <dd className="text-muted-foreground">Unavailable · not instrumented here</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <h2 className="text-xl font-bold">Read the numbers carefully</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li>Projects are saved projects, not unique or active founders.</li>
            <li>
              Completed interviews and accepted learnings are saved row states; they do not verify
              authenticity or quality.
            </li>
            <li>
              Logged experiments may have no result. Outreach drafts are not sent messages or
              acquired users.
            </li>
            <li>
              Stage 3 counts entered by a founder remain manual and are not aggregated into a
              fabricated funnel here.
            </li>
          </ul>
          <p className="mt-5 border-t border-border pt-4 text-sm font-semibold">
            No names, emails, interview content or raw-user exports are returned by this view.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
