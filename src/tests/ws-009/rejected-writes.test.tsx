import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { renderPage } from "@/test/render-page";
const h = vi.hoisted(() => ({
  client: null as unknown as FakeSupabase,
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return h.client;
  },
}));
vi.mock("sonner", () => ({ toast: { error: h.error, success: h.success } }));
vi.mock("@/lib/ai.functions", () => ({ generateAI: vi.fn() }));
vi.mock("@/components/AIOrigin", () => ({ AIOrigin: () => null }));
vi.mock("@/components/ConsentFields", () => ({ SavedConsentFields: () => null }));
import { Route as Contacts } from "@/routes/_authenticated/contacts";
import { Route as Outreach } from "@/routes/_authenticated/outreach";
const project = {
  id: "p1",
  user_id: "user-1",
  name: "Fictional freeze test",
  description: "",
  audience: "",
  problem: "",
  link: "",
  stage: 2,
  questions: [],
  survey: ["Saved question"],
  checklist: {},
  created_at: "2026-10-18T00:00:00Z",
};
const page = (route: { options: { component?: unknown } }) =>
  route.options.component as Parameters<typeof renderPage>[0];
function rejectingClient(tables: Parameters<typeof createFakeSupabase>[0]) {
  const client = createFakeSupabase(tables);
  const from = client.from;
  client.from = (table) => {
    const query = from(table);
    let writing = false;
    for (const name of ["insert", "update", "delete"] as const) {
      const original = query[name];
      Object.assign(query, {
        [name]: (...args: unknown[]) => {
          writing = true;
          return Reflect.apply(original, query, args);
        },
      });
    }
    const then = query.then;
    query.then = (resolve, reject) =>
      writing
        ? Promise.resolve({
            data: null,
            error: { code: "PT409", message: "WORKSPACE_ARCHIVED" },
          }).then(resolve, reject)
        : then(resolve, reject);
    return query;
  };
  return client;
}
beforeEach(() => {
  h.error.mockReset();
  h.success.mockReset();
});
afterEach(cleanup);
describe("archive races preserve the current form", () => {
  it("keeps the new person fields after an archive rejects their insert", async () => {
    h.client = rejectingClient({ projects: [project], contacts: [] });
    renderPage(page(Contacts), "/contacts");
    const first = await screen.findByLabelText("First name");
    fireEvent.change(first, { target: { value: "Unsent alias" } });
    fireEvent.change(screen.getByLabelText("Why this person?"), {
      target: { value: "Still local reasoning" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith(expect.stringMatching(/archived/i)));
    expect(first).toHaveValue("Unsent alias");
    expect(screen.getByLabelText("Why this person?")).toHaveValue("Still local reasoning");
    expect(h.success).not.toHaveBeenCalled();
  });
  it("keeps a changed outreach body and survey after rejected saves", async () => {
    h.client = rejectingClient({
      projects: [project],
      contacts: [],
      outreach: [
        {
          id: "o1",
          user_id: "user-1",
          project_id: "p1",
          stage: 2,
          kind: "draft",
          title: "Fictional message",
          body: "Old text",
          created_at: "2026-10-18T00:00:00Z",
        },
      ],
    });
    renderPage(page(Outreach), "/outreach");
    const body = await screen.findByLabelText("Fictional message");
    fireEvent.change(body, { target: { value: "Unsaved revised message" } });
    fireEvent.blur(body);
    await waitFor(() => expect(h.error).toHaveBeenCalledTimes(1));
    expect(body).toHaveValue("Unsaved revised message");
    const survey = screen.getByRole("textbox", { name: "Feedback survey" });
    fireEvent.change(survey, { target: { value: "Unsaved survey question" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.error).toHaveBeenCalledTimes(2));
    expect(survey).toHaveValue("Unsaved survey question");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(h.success).not.toHaveBeenCalled();
  });
});
