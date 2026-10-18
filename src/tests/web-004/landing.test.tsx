import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { LandingPage } from "@/components/marketing/LandingPage";
import { renderPage } from "@/test/render-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("connects the actual demo, teaching, pitch, stack and founder-entry journeys", async () => {
  const view = renderPage(LandingPage, "/");
  await screen.findByRole("heading", { level: 1, name: /Real conversations.*A clearer next move/ });
  expect(screen.getByRole("link", { name: "Explore the example" })).toHaveAttribute(
    "href",
    "/demo",
  );
  expect(screen.getByRole("link", { name: "Explore teaching resources" })).toHaveAttribute(
    "href",
    "/teach",
  );
  for (const link of screen.getAllByRole("link", { name: "Start my project" }))
    expect(link).toHaveAttribute("href", "/auth");
  expect(screen.getByRole("link", { name: "View the workshop pitch" })).toHaveAttribute(
    "href",
    "/pitch/index.html",
  );
  expect(screen.getByRole("link", { name: "Open the stack schematic" })).toHaveAttribute(
    "href",
    "/diagrams/current-stack.svg",
  );
  for (const link of view.container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
    expect(view.container.querySelector(link.getAttribute("href")!)).not.toBeNull();
});

it("exposes the six teaching concepts and keeps current versus proposed claims inspectable", async () => {
  renderPage(LandingPage, "/");
  await screen.findByRole("heading", { level: 1 });
  for (const name of [
    "Experiential learning",
    "Generative, student-led thinking before AI",
    "Scaffolded practice",
    "Formative peer feedback",
    "Metacognition and reflection",
    "Responsible AI and human judgment",
  ])
    expect(screen.getByRole("heading", { name })).toBeVisible();
  expect(screen.getByText(/learning gains have not been measured/)).toBeVisible();
  fireEvent.click(screen.getByText("Can teachers review a class?"));
  expect(screen.getByText(/Separate teacher panels, class submissions/)).toBeVisible();
  expect(screen.getByText(/The full saved in-app lab is being built/)).toBeVisible();
});

it("allows a visitor to inspect and reset the embedded example without fetching or saving", async () => {
  const fetchSpy = vi.fn(() => {
    throw Error("Unexpected landing API request");
  });
  vi.stubGlobal("fetch", fetchSpy);
  renderPage(LandingPage, "/");
  await screen.findByRole("heading", { level: 1 });
  fireEvent.click(screen.getByRole("button", { name: "Consider an interpretation" }));
  expect(
    screen.getByRole("heading", { name: "A different problem may be emerging." }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Reset example" }));
  expect(screen.getByRole("heading", { name: "What did people describe?" })).toBeVisible();
  expect(fetchSpy).not.toHaveBeenCalled();
});
