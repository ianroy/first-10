import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { slides } from "./rebuild-live.mjs";
const root = new URL("../../../public/pitch/", import.meta.url);
const source = process.argv[2];
if (source) {
  await mkdir(new URL("slides/", root), { recursive: true });
  for (let n = 1; n <= slides.length; n++)
    await copyFile(
      `${source}/slide-${n}.png`,
      new URL(`slides/${String(n).padStart(2, "0")}.png`, root),
    );
}
const esc = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
let html = await readFile(new URL("index.html", root), "utf8");
const figures = slides
  .map(
    (
      s,
      i,
    ) => `        <figure class="slide${i === 0 ? " active" : ""}" aria-label="Slide ${i + 1} of ${slides.length}">
          <img src="slides/${String(i + 1).padStart(2, "0")}.png" width="1280" height="720" alt="${esc(s.title + ". " + s.caption)}" />
          <figcaption>${esc(s.caption)}${s.file ? ` <a href="https://first-10-three.vercel.app/pitch/demo/${s.file}.png">Open full-page capture</a>` : ""}</figcaption>
        </figure>`,
  )
  .join("\n");
html = html
  .replace(/(<section id="slides"[^>]*>)[\s\S]*?(<\/section>)/, `$1\n${figures}\n      $2`)
  .replace(/>1 \/ \d+<\/output>/, `>1 / ${slides.length}</output>`)
  .replace(
    /Print includes all (nine|twelve|thirteen) slides\./,
    "Print includes all thirteen slides.",
  )
  .replace(
    /<summary>90-second fallback script<\/summary>[\s\S]*?<\/details>/,
    `<summary>90-second fallback script</summary>
        <p>First Ten helps students take the next step after building a prototype. Choosing whom to approach, knowing what to ask and facing uncertain demand can be difficult. That is the teaching problem we want to investigate.</p>
        <p>The workflow connects a real conversation to a reviewed interpretation and a small test. Students look for counterexamples, test meaningful use and investigate willingness to pay through real commitments. StudyLoop is a fictional worked example, with no customer outcome implied.</p>
        <p>The deployed app includes private saved ideas, an interview and learning workflow, a manual five-step Marketing Lab and private teacher planning. The educator class examples are fictional. Admin shows protected aggregate counts. Presenter-only AI practice uses a fixed fictional case; general marketing AI remains planned.</p>
        <p>Students think before AI, check each other’s plans and reflect after a bounded test. Our proposed first teaching contexts are BUS 131A and BUS 232F at Brandeis, then interested educator collaborators. No adoption, buyer or learning gain is confirmed. Which student decision would you want to see more clearly?</p>
      </details>`,
  );
html = html.replace(
  '<a href="/">Visit First Ten</a>',
  '<a href="https://first-10-three.vercel.app/demo">Open product demo</a>',
);
await writeFile(new URL("index.html", root), html);
console.log(`Refreshed ${slides.length} slide captions and presentation navigation.`);
