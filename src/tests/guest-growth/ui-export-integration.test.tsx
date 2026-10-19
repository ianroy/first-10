import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { saveGuestGrowthSchema } from "@/lib/guest-growth/contracts";
import type { GuestGrowthPorts } from "@/components/guest-growth/ports";
import { GuestGrowthWorkspace } from "@/components/guest-growth/GuestGrowthWorkspace";
import { view, csrf, time, type Saved } from "./fixture";
afterEach(cleanup);

function createPorts(): GuestGrowthPorts {
  const saved: Saved[] = [];
  const ports: GuestGrowthPorts = {
    list: vi.fn(async () => ({ ok: true, data: { items: [], nextCursor: null } })),
    save: vi.fn(async (input: z.infer<typeof saveGuestGrowthSchema>) => {
      const record: Saved = {
        id: input.artifactId,
        classId: view.classId,
        teamId: view.teamId,
        authorPrincipalId: view.principalId,
        audience: input.audience,
        kind: input.document.kind,
        revision: input.expectedRevision + 1,
        savedAt: time,
        aiEnabled: false,
        document: input.document,
      };
      saved.push(record);
      return { ok: true, data: { record, savedRevision: record.revision, replayed: false } };
    }),
    history: vi.fn(async () => ({
      ok: true,
      data: {
        artifactId: saved[0]!.id,
        versions: [...saved].reverse().map((record) => {
          const { document, ...header } = record;
          void document;
          return header;
        }),
      },
    })),
    load: vi.fn(async ({ revision }) => ({
      ok: true,
      data: saved.find((r) => r.revision === revision),
    })),
    authorizeExport: vi.fn(async () => {}),
  };
  return ports;
}

it("reviews real PDF selections across draft/save/revision/history identity changes without stale keys", async () => {
  const ports = createPorts();
  render(<GuestGrowthWorkspace view={view} csrf={csrf} ports={ports} fictional />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Refresh saved growth work" })).toBeEnabled(),
  );
  const review = (expected: string) => {
    fireEvent.click(screen.getByRole("button", { name: "Review frozen copy" }));
    expect(
      screen.queryByText(
        "The export selection is no longer available. Review the current activity.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent(expected);
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  };
  fireEvent.change(screen.getByLabelText("Growth activity title"), {
    target: { value: "Fictional source identity test" },
  });
  review("Unsaved local draft");
  fireEvent.click(screen.getByRole("button", { name: "Save growth revision" }));
  await screen.findByText("Saved revision 1 confirmed.");
  expect(screen.queryByLabelText("Frozen export preview")).not.toBeInTheDocument();
  review("Exact retained saved revision 1");
  fireEvent.change(screen.getByLabelText("Your interpretation"), {
    target: { value: "A revised authored hypothesis, not a measured outcome" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save growth revision" }));
  await screen.findByText("Saved revision 2 confirmed.");
  review("Exact retained saved revision 2");
  fireEvent.click(screen.getByRole("button", { name: "Load retained growth revisions" }));
  await screen.findByLabelText("Retained growth revision");
  fireEvent.change(screen.getByLabelText("Retained growth revision"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Open exact retained growth revision" }));
  await screen.findByText("Opened exact saved revision 1 for review and export.");
  review("Exact retained saved revision 1");
  expect(screen.getByLabelText("Growth activity title")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save growth revision" })).toBeDisabled();
  expect(ports.authorizeExport).not.toHaveBeenCalled(); // Review alone never sends a document or grants access.
});

it.each(["survey", "onboarding"] as const)(
  "acknowledges %s question content independent of JSON property order",
  async (kind) => {
    const ports = createPorts();
    render(<GuestGrowthWorkspace view={view} csrf={csrf} ports={ports} fictional />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Refresh saved growth work" })).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: kind === "survey" ? "Feedback survey draft" : "Onboarding research draft",
      }),
    );
    fireEvent.change(screen.getByLabelText("Growth activity title"), {
      target: { value: "Fictional typed question" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: kind === "survey" ? "Add survey question" : "Add onboarding question",
      }),
    );
    const prefix = kind === "survey" ? "Survey question 1" : "Onboarding question 1";
    fireEvent.change(screen.getByLabelText(`${prefix} prompt`), {
      target: { value: "What happened the last time you tried this?" },
    });
    fireEvent.change(screen.getByLabelText(`${prefix} purpose`), {
      target: { value: "Understand concrete behavior" },
    });
    if (kind === "survey") {
      fireEvent.change(screen.getByLabelText(`${prefix} format`), {
        target: { value: "single_choice" },
      });
      fireEvent.change(screen.getByLabelText(`${prefix} options — one per line`), {
        target: { value: "Completed\nDid not complete" },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "Save growth revision" }));
    await screen.findByText("Saved revision 1 confirmed.");
    expect(screen.queryByText(/newer local edits are still unsaved/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save growth revision" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Review frozen copy" }));
    expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent(
      "Exact retained saved revision 1",
    );
    expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent(
      "What happened the last time you tried this?",
    );
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  },
);
