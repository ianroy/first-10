import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { TeachingPage } from "@/components/teaching/TeachingPage";
import { teachingKit } from "@/components/teaching/resources";
import { renderPage } from "@/test/render-page";
import { sources } from "@/lib/demo/studyloop";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function asset(path: string) {
  return resolve(process.cwd(), "public", path.replace(/^\//, "").split("#")[0]!);
}

describe("public teaching resources", () => {
  it("offers all six editable handouts and complete kit formats, with accurate version, sizes and anchors", async () => {
    renderPage(TeachingPage, "/teach");
    await screen.findByRole("heading", { level: 1, name: "Make the next decision teachable." });
    const html = new DOMParser().parseFromString(
      readFileSync(asset(teachingKit.printableHtml), "utf8"),
      "text/html",
    );
    expect(teachingKit.resources).toHaveLength(6);
    expect(teachingKit.resources.reduce((sum, r) => sum + r.printPages, 0)).toBe(9);
    for (const resource of teachingKit.resources) {
      const link = screen.getByRole("link", {
        name: new RegExp(
          `^Download ${resource.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(Markdown`,
        ),
      });
      expect(link).toHaveAttribute("href", resource.markdown);
      expect(link).toHaveAttribute("download");
      expect(statSync(asset(resource.markdown)).size).toBe(resource.bytes);
      expect(html.getElementById(resource.html.split("#")[1]!)).not.toBeNull();
      expect(screen.getByRole("link", { name: `Read ${resource.title} in HTML` })).toHaveAttribute(
        "href",
        resource.html,
      );
    }
    expect(readFileSync(asset(teachingKit.printablePdf)).subarray(0, 5).toString()).toBe("%PDF-");
    expect(statSync(asset(teachingKit.printablePdf)).size).toBe(teachingKit.printablePdfBytes);
    expect(statSync(asset(teachingKit.printableHtml)).size).toBe(teachingKit.printableHtmlBytes);
    expect(html.body.textContent).toContain(`Version ${teachingKit.version}`);
    expect(screen.getByRole("link", { name: /Get the teaching kit/ })).toHaveAttribute(
      "href",
      teachingKit.printablePdf,
    );
    expect(screen.getByRole("link", { name: "Read or print HTML" })).toHaveAttribute(
      "href",
      teachingKit.printableHtml,
    );
  });

  it("keeps the fictional source, six teaching practices, manual option and product-status boundaries visible", async () => {
    renderPage(TeachingPage, "/teach");
    await screen.findByRole("heading", { level: 1 });
    const preview = screen.getByRole("complementary", {
      name: "StudyLoop fictional classroom case",
    });
    expect(within(preview).getByText(`“${sources[0].text}”`)).toBeVisible();
    expect(within(preview).getByText("Fictional classroom case")).toBeVisible();
    for (const title of [
      "Experiential learning",
      "Generative, student-led thinking before AI",
      "Scaffolded practice",
      "Formative peer feedback",
      "Metacognition and reflection",
      "Responsible AI and human judgment",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeVisible();
    }
    expect(screen.getByText(/No account, AI subscription or outside contact/)).toBeVisible();
    expect(
      screen.getByText(/Assignment and manual saved Marketing Lab available now/),
    ).toBeVisible();
    expect(
      screen.getByText(/This is a planning example, not a tested class-size limit/),
    ).toBeVisible();
    const appSummary = screen.getByText("What is available in the app today?");
    fireEvent.click(appSummary);
    expect(appSummary.closest("details")).toHaveAttribute("open");
    expect(screen.getByText(/Individual work, available now/)).toBeVisible();
    expect(
      screen.getByText(/live class submissions, teacher access to student work/),
    ).toBeVisible();
    fireEvent.click(screen.getByText("How should we handle people and AI?"));
    expect(screen.getByText(/Class enrollment does not grant them/)).toBeVisible();
  });

  it("resolves page anchors and offers real demo, pitch and founder-entry destinations without fetching or saving", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("Teaching page requested an API");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const view = renderPage(TeachingPage, "/teach");
    await screen.findByRole("heading", { level: 1 });
    for (const link of view.container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      expect(view.container.querySelector(link.getAttribute("href")!)).not.toBeNull();
    }
    expect(screen.getByRole("link", { name: "Explore StudyLoop" })).toHaveAttribute(
      "href",
      "/demo",
    );
    expect(screen.getByRole("link", { name: "Start a project" })).toHaveAttribute("href", "/auth");
    expect(screen.getByRole("link", { name: "The short pitch" })).toHaveAttribute(
      "href",
      "/pitch/index.html",
    );
    expect(readFileSync(asset("/pitch/index.html"), "utf8")).toContain("<!doctype html>");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
  });
});
