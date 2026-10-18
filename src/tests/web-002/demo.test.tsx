import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { StudyLoopDemo } from "@/components/demo/StudyLoopDemo";
import { choices, sources } from "@/lib/demo/studyloop";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function choose(title: string) {
  fireEvent.click(screen.getByRole("button", { name: "4. Choose" }));
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(title) }));
  fireEvent.click(screen.getByRole("button", { name: "Preview the next test" }));
}

describe("StudyLoop public example", () => {
  it("starts with Maya, exposes the other notes, and keeps the test gated by an explicit choice", () => {
    render(<StudyLoopDemo />);
    expect(screen.getByText(`“${sources[0].text}”`)).toBeVisible();
    expect(screen.getByRole("button", { name: "Maya" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /5\. Test/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Owen" }));
    expect(screen.getByText(sources[1].text)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Priya" }));
    expect(screen.getByText(sources[2].text)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Consider an interpretation" }));
    expect(
      screen.getByRole("heading", { name: "A different problem may be emerging." }),
    ).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Check what challenges it" }));
    expect(
      screen.getByRole("heading", { name: "Nora already has a system that works." }),
    ).toHaveFocus();
    expect(screen.getAllByText(sources[3].text)[0]).toBeVisible();
  });

  it.each(choices)(
    "shows a distinct proposed test for $title and never invents an outcome",
    (choice) => {
      render(<StudyLoopDemo />);
      choose(choice.title);
      expect(screen.getByText(choice.question)).toBeVisible();
      expect(screen.getByText(choice.action)).toBeVisible();
      expect(screen.getByText(choice.unknown)).toBeVisible();
      expect(screen.getByText("Proposed · Not run")).toBeVisible();
      expect(screen.getByText("No outcome recorded")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.getByRole("radio", { name: new RegExp(choice.title) })).toBeChecked();
    },
  );

  it("reset restores the full initial state, closes reviewed sources, and announces the reset", () => {
    render(<StudyLoopDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Owen" }));
    choose(choices[0].title);
    fireEvent.click(screen.getByText("Review all four sources"));
    fireEvent.click(screen.getByRole("button", { name: "Reset example" }));
    expect(screen.getByRole("heading", { name: "What did people describe?" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Maya" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Example reset.");
    expect(screen.getByRole("button", { name: /5\. Test/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "4. Choose" }));
    expect(
      screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Preview the next test" })).toBeDisabled();
    expect(screen.getByText("Review all four sources").closest("details")).not.toHaveAttribute(
      "open",
    );
  });

  it("does not fetch, persist, or carry the selection into another mounted example", () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("Demo attempted a network request");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const first = render(<StudyLoopDemo />);
    choose(choices[0].title);
    fireEvent.click(screen.getByRole("button", { name: "Reset example" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
    first.unmount();
    render(<StudyLoopDemo />);
    expect(screen.getByRole("button", { name: /5\. Test/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Maya" })).toHaveAttribute("aria-pressed", "true");
  });

  it("can be embedded twice without shared choices or radio groups", () => {
    render(
      <>
        <StudyLoopDemo />
        <StudyLoopDemo />
      </>,
    );
    const examples = screen.getAllByRole("region", { name: "StudyLoop interactive example" });
    fireEvent.click(within(examples[0]!).getByRole("button", { name: "4. Choose" }));
    fireEvent.click(
      within(examples[0]!).getByRole("radio", { name: /Test attendance confirmations/ }),
    );
    fireEvent.click(within(examples[1]!).getByRole("button", { name: "4. Choose" }));
    expect(
      within(examples[1]!)
        .getAllByRole("radio")
        .every((radio) => !(radio as HTMLInputElement).checked),
    ).toBe(true);
  });

  it("keeps the no-JavaScript text alternative complete and aligned with all source and plan fixtures", () => {
    const html = readFileSync("public/demo/studyloop.html", "utf8");
    const text = new DOMParser()
      .parseFromString(html, "text/html")
      .body.textContent!.replace(/\s+/g, " ");
    for (const source of sources) expect(text).toContain(source.text);
    for (const choice of choices)
      for (const field of ["question", "action", "observe", "reconsider", "unknown"] as const)
        expect(text).toContain(choice[field]);
    expect(html).toContain("Fictional demo data");
    expect(html).toContain("No outcome recorded");
    expect(html).not.toContain("<script");
  });
});
