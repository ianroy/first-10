import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { renderPage } from "@/test/render-page";

const h = vi.hoisted(() => ({ supabase: null as unknown as FakeSupabase }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return h.supabase;
  },
}));
vi.mock("@/lib/ai.functions", () => ({ generateAI: vi.fn() }));

import { Route as Landing } from "@/routes/index";
import { Route as Auth } from "@/routes/auth";
import { Route as Setup } from "@/routes/_authenticated/setup";
import { Route as Dashboard } from "@/routes/_authenticated/dashboard";
import { Route as Contacts } from "@/routes/_authenticated/contacts";
import { Route as Interview } from "@/routes/_authenticated/interview";
import { Route as Learnings } from "@/routes/_authenticated/learnings";
import { Route as Outreach } from "@/routes/_authenticated/outreach";

const project = {
  id: "p1",
  user_id: "user-1",
  name: "StudyBuddy",
  description: "Matches classmates into study groups",
  audience: "First-year students",
  problem: "Hard to find study partners",
  link: "",
  stage: 1,
  questions: ["When did you last study with someone?"],
  survey: [],
  checklist: {},
  created_at: "2026-10-01T00:00:00Z",
};

const page = (r: { options: { component?: unknown } }) =>
  r.options.component as Parameters<typeof renderPage>[0];

beforeEach(() => {
  h.supabase = createFakeSupabase({ projects: [project] });
});

describe("pages render", () => {
  it("landing", async () => {
    renderPage(page(Landing), "/");
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /Real conversations.*A clearer next move/,
      }),
    ).toBeInTheDocument();
  });

  it("auth", async () => {
    h.supabase = createFakeSupabase({}, null);
    renderPage(page(Auth), "/auth");
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Your next move starts with a real conversation.",
      }),
    ).toBeInTheDocument();
  });

  it("setup", async () => {
    renderPage(page(Setup), "/setup");
    expect(await screen.findByText(/tell us about your app/i)).toBeInTheDocument();
  });

  it("dashboard shows the project and next step", async () => {
    renderPage(page(Dashboard), "/dashboard");
    expect(
      await screen.findByRole("heading", { level: 1, name: "StudyBuddy" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/your next step/i)).toBeInTheDocument();
  });

  it("contacts", async () => {
    renderPage(page(Contacts), "/contacts");
    expect(await screen.findByText(/who do you already know/i)).toBeInTheDocument();
  });

  it("interview", async () => {
    renderPage(page(Interview), "/interview");
    expect(await screen.findByText(/your questions/i)).toBeInTheDocument();
  });

  it("learnings shows progress and the stage 1 checklist", async () => {
    renderPage(page(Learnings), "/learnings");
    expect(await screen.findByText("0/5 interviews done")).toBeInTheDocument();
    expect(screen.getByText(/ready for the next 50/i)).toBeInTheDocument();
  });

  it("outreach is locked at stage 1", async () => {
    renderPage(page(Outreach), "/outreach");
    expect(await screen.findByText(/unlocks after your first 10/i)).toBeInTheDocument();
  });

  it("sends a founder without a project to setup", async () => {
    h.supabase = createFakeSupabase({ projects: [] });
    renderPage(page(Dashboard), "/dashboard");
    expect(await screen.findByText("at /setup")).toBeInTheDocument();
  });
});
