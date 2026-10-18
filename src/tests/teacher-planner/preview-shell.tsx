import type { ReactNode } from "react";
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="bg-primary px-6 py-3 text-center text-sm text-primary-foreground">
        UI test fixture · local in-memory responses · no real class or saved data
      </div>
      <div className="mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-border p-7 lg:block">
          <img src="/brand/wordmark.svg" alt="First Ten" className="w-36" />
          <p className="mt-10 font-semibold text-primary">Instructor planner</p>
          <p className="mt-4 text-sm text-muted-foreground">Visual test fixture</p>
        </aside>
        <main className="min-w-0 p-5 lg:p-10">{children}</main>
      </div>
    </>
  );
}
