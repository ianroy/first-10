import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  actor: vi.fn(),
  read: vi.fn(),
  associate: vi.fn(),
  scope: [] as Array<{ table: string; filters: Record<string, unknown>; selection: string }>,
  preview: [] as unknown[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: h.actor },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let selection = "";
      const q = {
        select: (v: string) => {
          selection = v;
          return q;
        },
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        is: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        order: () => q,
        limit: () => q,
        range: () => q,
        abortSignal: () => q,
        single: () => {
          filters["single"] = true;
          return q;
        },
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          h.scope.push({ table, filters, selection });
          return Promise.resolve(h.read(table, filters, selection)).then(resolve, reject);
        },
      };
      return q;
    },
  },
}));
vi.mock("@/lib/classes.functions", () => ({ associateClassProject: h.associate }));
vi.mock("@/components/ConsentFields", () => ({
  SavedConsentFields: ({ label }: { label: string }) => <p>Saved choices: {label}</p>,
}));
vi.mock("@/components/classes/SubmissionPreview", () => ({
  SubmissionPreview: (props: {
    sourceOptions: Array<{ label: string }>;
    onSubmitted: () => void;
  }) => {
    h.preview.push(props);
    return (
      <section>
        <p>Exact source review</p>
        {props.sourceOptions.map((o) => (
          <p key={o.label}>{o.label}</p>
        ))}
        <button onClick={props.onSubmitted}>Simulate reviewed submission</button>
      </section>
    );
  },
}));
import { AccountSubmissionWorkspace } from "@/components/classes/AccountSubmissionWorkspace";
import type { ClassDetail, ClassAssignment } from "@/lib/classes";
const user = "c2120000-0000-4000-8000-000000000001",
  pid = "c2120000-0000-4000-8000-000000000002",
  cid = "c2120000-0000-4000-8000-000000000003",
  aid = "c2120000-0000-4000-8000-000000000004";
const detail = { id: cid, role: "student", projectAssociation: null } as unknown as ClassDetail;
const assignment = {
  id: aid,
  title: "One useful conversation",
  state: "published",
} as ClassAssignment;
const props = {
  userId: user,
  detail,
  assignments: [assignment],
  onAssociated: vi.fn(),
  onSubmitted: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  h.scope.length = 0;
  h.preview.length = 0;
  h.actor.mockResolvedValue({ data: { user: { id: user } }, error: null });
  h.associate.mockResolvedValue({
    ok: true,
    data: { id: cid, projectId: pid, active: true, revision: 1 },
  });
  h.read.mockImplementation((table, filters, selection) => ({
    error: null,
    data:
      table === "projects"
        ? filters.single
          ? {
              id: pid,
              user_id: user,
              archived_at: null,
              name: "My idea",
              description: "",
              audience: "Students",
              problem: "Real saved problem",
            }
          : [{ id: pid, user_id: user, archived_at: null, name: "My idea" }]
        : [],
  }));
});
afterEach(cleanup);
describe("account classroom authoring", () => {
  it("requires an explicit own-idea choice and deliberate association before acquiring sources", async () => {
    render(<AccountSubmissionWorkspace {...props} />);
    await screen.findByRole("option", { name: "My idea" });
    expect(screen.getByRole("button", { name: "Connect this idea to the class" })).toBeDisabled();
    expect(screen.queryByText("Exact source review")).toBeNull();
    fireEvent.change(screen.getByLabelText("Choose your own active idea"), {
      target: { value: pid },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect this idea to the class" }));
    await waitFor(() => expect(props.onAssociated).toHaveBeenCalledTimes(1));
    expect(h.associate.mock.calls[0]?.[0].data).toMatchObject({
      classId: cid,
      projectId: pid,
      expectedRevision: 0,
    });
    expect(h.scope.every((s) => s.filters["user_id"] === user)).toBe(true);
  });
  it("acquires saved sources with both owner and project scope and requires a published assignment", async () => {
    const linked = {
      ...detail,
      projectAssociation: { id: cid, projectId: pid, active: true, revision: 1 },
    };
    render(<AccountSubmissionWorkspace {...props} detail={linked} />);
    await screen.findByLabelText("Published assignment");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Reload saved sources and start a fresh review" }),
      ).toBeEnabled(),
    );
    expect(screen.queryByText("Exact source review")).toBeNull();
    fireEvent.change(screen.getByLabelText("Published assignment"), { target: { value: aid } });
    await screen.findByText("Exact source review");
    expect(screen.getByText("Idea · problem")).toBeVisible();
    expect(
      h.scope
        .filter((s) => s.table !== "projects")
        .every((s) => s.filters["user_id"] === user && s.filters["project_id"] === pid),
    ).toBe(true);
    expect(h.preview.at(-1)).toMatchObject({
      source: { type: "account_project", projectId: pid },
      classId: cid,
      assignmentId: aid,
    });
    fireEvent.click(screen.getByRole("button", { name: "Simulate reviewed submission" }));
    expect(props.onSubmitted).toHaveBeenCalled();
  });
  it("does not silently substitute another project for an unavailable explicit association", async () => {
    const linked = {
      ...detail,
      projectAssociation: { id: cid, projectId: aid, active: true, revision: 1 },
    };
    render(<AccountSubmissionWorkspace {...props} detail={linked} />);
    await screen.findByText(/explicitly associated idea is unavailable/);
    expect(screen.queryByLabelText("Published assignment")).toBeNull();
    expect(h.scope.every((s) => s.table === "projects")).toBe(true);
  });
  it("fresh identity mismatch denies owner-source acquisition", async () => {
    h.actor.mockResolvedValue({ data: { user: { id: aid } }, error: null });
    render(<AccountSubmissionWorkspace {...props} />);
    await screen.findByText(/own ideas could not be verified/);
    expect(h.read).not.toHaveBeenCalled();
    expect(h.associate).not.toHaveBeenCalled();
  });
  it("rejects a foreign child response instead of offering it as selectable work", async () => {
    const previous = h.read.getMockImplementation()!;
    h.read.mockImplementation((table, ...rest) =>
      table === "interviews"
        ? {
            error: null,
            data: [{ id: aid, user_id: aid, project_id: pid, completed: true, answers: [] }],
          }
        : previous(table, ...rest),
    );
    const linked = {
      ...detail,
      projectAssociation: { id: cid, projectId: pid, active: true, revision: 1 },
    };
    render(<AccountSubmissionWorkspace {...props} detail={linked} />);
    await screen.findByText(/Saved source work could not be verified/);
    expect(screen.queryByText("Exact source review")).toBeNull();
  });
});
