import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Project } from "@/lib/data";
import { CurrentProjectContext } from "@/lib/current-project";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
import { AppShell } from "@/components/AppShell";

afterEach(cleanup);
const project = (checklist: Project["checklist"]) => ({ id: "fixture", checklist }) as Project;
function Workspace({ value }: { value: Project | null }) {
  return (
    <CurrentProjectContext.Provider value={value}>
      <AppShell title="Learnings">Private page</AppShell>
    </CurrentProjectContext.Provider>
  );
}

describe("fictional presenter context", () => {
  it("keeps the fictional label visible on a generic page heading", () => {
    render(<Workspace value={project({ demo: { fictional: true } })} />);
    expect(screen.getByRole("note", { name: "Fictional demo workspace" })).toHaveTextContent(
      "not customer research or adoption",
    );
    expect(screen.getByRole("heading", { name: "Learnings" })).toBeInTheDocument();
  });
  it("does not carry a demo label into a different ordinary project", () => {
    const view = render(<Workspace value={project({ demo: { fictional: true } })} />);
    view.rerender(<Workspace value={project({})} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
  it("handles absent/malformed markers without labeling ordinary work fictional", () => {
    const view = render(<Workspace value={null} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    for (const marker of ["true", [], { fictional: "true" }]) {
      view.rerender(<Workspace value={project({ demo: marker })} />);
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    }
  });
});
