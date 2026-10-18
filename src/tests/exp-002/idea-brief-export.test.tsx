import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { IdeaBriefExport } from "@/components/IdeaBriefExport";
afterEach(cleanup);
it("exports current form wording and fictional status, and requires renewed review after an edit", () => {
  const brief = {
    name: "StudyLoop",
    description: "Original description",
    audience: "Groups",
    problem: "Attendance",
    link: "https://example.com",
  };
  const { rerender } = render(<IdeaBriefExport brief={brief} fictional />);
  fireEvent.click(screen.getByText("Export this idea brief as PDF"));
  fireEvent.click(screen.getByRole("button", { name: "Review frozen copy" }));
  expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent("Original description");
  expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent("FICTIONAL EXAMPLE");
  expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent(
    "does not create or save",
  );
  rerender(
    <IdeaBriefExport brief={{ ...brief, description: "Revised problem framing" }} fictional />,
  );
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Review frozen copy" }));
  expect(screen.getByLabelText("Frozen export preview")).toHaveTextContent(
    "Revised problem framing",
  );
  expect(screen.getByLabelText("Frozen export preview")).not.toHaveTextContent(
    "Original description",
  );
});
