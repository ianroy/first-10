import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MarketingLabDemo } from "@/components/marketing/MarketingLabDemo";
import { StudyLoopDemo } from "@/components/demo/StudyLoopDemo";
import { marketingScenarios, sampleContent } from "@/lib/demo/marketing";
import { choices, type ChoiceId } from "@/lib/demo/studyloop";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function beginSample() {
  fireEvent.click(screen.getByRole("button", { name: "View fictional student thinking" }));
  fireEvent.click(screen.getByRole("button", { name: "Explore channels" }));
}
function panel(name: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`Marketing \\d\\. ${name}$`) }));
}
function chooseDiscovery(title: string) {
  fireEvent.click(screen.getByRole("button", { name: "4. Choose" }));
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(title) }));
  fireEvent.click(screen.getByRole("button", { name: "Preview the next test" }));
}
function Combined({ initialChoiceId }: { initialChoiceId?: ChoiceId | undefined }) {
  return (
    <StudyLoopDemo
      initialChoiceId={initialChoiceId}
      continuation={({ choiceId, reset }) => (
        <MarketingLabDemo choiceId={choiceId} onReset={reset} />
      )}
    />
  );
}

describe("public marketing learning board", () => {
  it("withholds scaffolds until a practice thought or explicitly viewed fictional thought", () => {
    render(<MarketingLabDemo />);
    expect(screen.getByRole("button", { name: "Explore channels" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Marketing 2\. Channels/ })).toBeDisabled();
    expect(
      screen.queryByText(marketingScenarios.confirmations.firstThought),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Your first thought/), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Explore channels" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Your first thought/), {
      target: { value: "Ask a club organizer why attendance varies." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Explore channels" }));
    expect(
      screen.getByRole("heading", { name: "Where could this audience be reached?" }),
    ).toHaveFocus();
    fireEvent.click(screen.getByText("Starting thought"));
    expect(screen.getByText("Ask a club organizer why attendance varies.")).toBeVisible();
    expect(screen.getByText("Your practice note · Only in this tab")).toBeVisible();
  });

  it("keeps two distinct routes and changes the sample invitation when the primary changes", () => {
    render(<MarketingLabDemo />);
    beginSample();
    expect(screen.getByRole("radio", { name: /Campus club introduction/ })).toBeChecked();
    panel("Draft");
    expect(
      screen.queryByRole("article", { name: "Sample invitation draft" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View sample draft" }));
    expect(screen.getByRole("article", { name: "Sample invitation draft" })).toHaveTextContent(
      "Hello [organizer]",
    );
    panel("Channels");
    fireEvent.click(screen.getByRole("radio", { name: /Course community post/ }));
    expect(screen.getByRole("radio", { name: /Campus club introduction/ })).not.toBeChecked();
    expect(screen.getByText("Community rules and moderator permission unknown.")).toBeVisible();
    panel("Draft");
    expect(
      screen.queryByRole("article", { name: "Sample invitation draft" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View sample draft" }));
    expect(screen.getByRole("article", { name: "Sample invitation draft" })).toHaveTextContent(
      "Posted by the student team",
    );
    expect(screen.getByRole("article", { name: "Sample invitation draft" })).not.toHaveTextContent(
      "Hello [organizer]",
    );
  });

  it.each(choices)(
    "carries $title into its own audience, content and proposed action",
    (choice) => {
      render(<Combined />);
      chooseDiscovery(choice.title);
      expect(screen.getByText(marketingScenarios[choice.id].audience)).toBeVisible();
      expect(screen.getByText(marketingScenarios[choice.id].boundary)).toBeVisible();
      beginSample();
      panel("Draft");
      fireEvent.click(screen.getByRole("button", { name: "View sample draft" }));
      expect(
        screen.getByRole("article", { name: "Sample invitation draft" }).textContent,
      ).toContain(sampleContent(choice.id, "club"));
      panel("7 days");
      expect(screen.getByText(marketingScenarios[choice.id].dayFive)).toBeVisible();
      expect(
        screen.getAllByText(/^Proposed · Team|^Proposed · Student|^Proposed · Peer/),
      ).toHaveLength(7);
    },
  );

  it("keeps unknowns separate from zeros and reflection separate from results", () => {
    render(<MarketingLabDemo />);
    beginSample();
    panel("Review");
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Not measured")).toHaveLength(5);
    expect(table).not.toHaveTextContent(/\d|%/);
    expect(screen.getByText(/Unknown is not zero/)).toBeVisible();
    expect(screen.getByText(/No peer review has happened here/)).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "stop" }));
    expect(screen.getByRole("status")).toHaveTextContent(marketingScenarios.confirmations.stop);
    expect(within(table).getAllByText("Not measured")).toHaveLength(5);
  });

  it("resets the entire combined example, including notes, channels and reflections", () => {
    render(<Combined initialChoiceId="confirmations" />);
    beginSample();
    fireEvent.click(screen.getByRole("radio", { name: /Course community post/ }));
    panel("Review");
    fireEvent.change(screen.getByLabelText(/What might a peer misunderstand/), {
      target: { value: "Private practice" },
    });
    fireEvent.change(screen.getByLabelText("What evidence would support that choice?"), {
      target: { value: "My reason" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "revise" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset entire example" }));
    expect(screen.getByRole("heading", { name: "What did people describe?" })).toHaveFocus();
    expect(
      screen.queryByRole("region", { name: "$0 Marketing Lab example" }),
    ).not.toBeInTheDocument();
    chooseDiscovery(choices[0].title);
    beginSample();
    expect(screen.getByRole("radio", { name: /Campus club introduction/ })).toBeChecked();
    panel("Review");
    expect(screen.getByLabelText(/What might a peer misunderstand/)).toHaveValue("");
    expect(screen.getByLabelText("What evidence would support that choice?")).toHaveValue("");
    expect(
      screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked),
    ).toBe(true);
  });

  it("resets a standalone board and a changed discovery choice without carrying stale notes", () => {
    const example = render(<MarketingLabDemo />);
    beginSample();
    panel("Review");
    fireEvent.change(screen.getByLabelText(/What might a peer misunderstand/), {
      target: { value: "Old audience" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset marketing example" }));
    expect(screen.getByRole("heading", { name: "Start with your own thinking." })).toHaveFocus();
    expect(screen.getByLabelText(/Your first thought/)).toHaveValue("");
    beginSample();
    panel("Review");
    expect(screen.getByLabelText(/What might a peer misunderstand/)).toHaveValue("");
    example.rerender(<MarketingLabDemo choiceId="another-group" />);
    expect(screen.getByText(marketingScenarios["another-group"].audience)).toBeVisible();
    expect(screen.getByRole("button", { name: /Marketing 2\. Channels/ })).toBeDisabled();
  });

  it("does not make data requests, write storage or carry practice notes across remount", () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("Unexpected demo request");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, "open");
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const example = render(<MarketingLabDemo />);
    beginSample();
    panel("Draft");
    fireEvent.click(screen.getByRole("button", { name: "View sample draft" }));
    panel("Review");
    fireEvent.change(screen.getByLabelText(/What might a peer misunderstand/), {
      target: { value: "Not saved" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "repeat" }));
    example.unmount();
    render(<MarketingLabDemo />);
    expect(screen.getByLabelText(/Your first thought/)).toHaveValue("");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
  });
});

it("keeps the static fallback aligned with every fictional branch and both channel drafts", () => {
  const html = readFileSync("public/demo/studyloop.html", "utf8");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = doc.body.textContent!.replace(/\s+/g, " ");
  for (const choice of choices) {
    const scenario = marketingScenarios[choice.id];
    for (const field of [
      "audience",
      "boundary",
      "firstThought",
      "cta",
      "dayFive",
      "measurement",
      "repeat",
      "revise",
      "stop",
    ] as const)
      expect(text).toContain(scenario[field]);
    for (const channel of ["club", "community"] as const)
      expect(text).toContain(sampleContent(choice.id, channel).replace(/\s+/g, " "));
  }
  expect(doc.querySelectorAll("script")).toHaveLength(0);
  expect(text).toContain("Unknown is not zero");
});
