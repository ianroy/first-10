import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoClassOverview } from "@/components/teaching/DemoClassOverview";
import { classroomExamples } from "@/lib/demo/classroom";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fictional educator class overview", () => {
  it("labels every team as authored practice instead of enrolled students or live submissions", () => {
    render(<DemoClassOverview />);
    expect(
      screen.getByText(
        "Fictional class preview — authored examples, not enrolled students or live activity",
      ),
    ).toBeVisible();
    const navigation = screen.getByRole("navigation", { name: "Fictional team examples" });
    expect(within(navigation).getAllByRole("button")).toHaveLength(4);
    for (const team of classroomExamples)
      expect(within(navigation).getByRole("button", { name: new RegExp(team.name) })).toBeVisible();
    expect(screen.getByText(/There are no submitted assignments/)).toBeVisible();
    expect(
      screen.getByText("Written for this demonstration; not a student quotation."),
    ).toBeVisible();
  });
  it("switches the inspected work and preserves counterevidence and unexecuted next steps", () => {
    render(<DemoClassOverview />);
    expect(screen.getByRole("article", { name: "StudyLoop authored work" })).toHaveTextContent(
      "Nora already has a reliable group",
    );
    fireEvent.click(screen.getByRole("button", { name: /QuietSpace/ }));
    const work = screen.getByRole("article", { name: "QuietSpace authored work" });
    expect(work).toHaveTextContent("noise, rather than seat availability");
    expect(work).toHaveTextContent("predictable early-morning routine");
    expect(work).toHaveTextContent("Proposed next step · not carried out");
    expect(
      screen.queryByRole("article", { name: "StudyLoop authored work" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /QuietSpace/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("keeps per-team feedback local across selection without fetching or storing it", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const onDraftChange = vi.fn();
    const view = render(<DemoClassOverview onDraftChange={onDraftChange} />);
    fireEvent.change(screen.getByLabelText("Local feedback draft for StudyLoop"), {
      target: { value: "What would make you stop?" },
    });
    expect(onDraftChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: /CampusSwap/ }));
    expect(screen.getByLabelText("Local feedback draft for CampusSwap")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Local feedback draft for CampusSwap"), {
      target: { value: "Which access is confirmed?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /StudyLoop/ }));
    expect(screen.getByLabelText("Local feedback draft for StudyLoop")).toHaveValue(
      "What would make you stop?",
    );
    expect(screen.getByText(/Saving your lesson plan does not save these comments/)).toBeVisible();
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    view.unmount();
    render(<DemoClassOverview />);
    expect(screen.getByLabelText("Local feedback draft for StudyLoop")).toHaveValue("");
  });
});
