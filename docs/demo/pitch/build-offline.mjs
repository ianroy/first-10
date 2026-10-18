import { readFile, writeFile } from "node:fs/promises";
import { slides } from "./rebuild-live.mjs";
import { fileURLToPath } from "node:url";

// Run after refreshing the reviewed live-deck PNG exports. No network,
// participant content, key, account session or presentation API is involved.
const root = new URL("../../../public/pitch/", import.meta.url);
let html = await readFile(new URL("index.html", root), "utf8");
for (let i = 1; i <= slides.length; i++) {
  const name = `slides/${String(i).padStart(2, "0")}.png`;
  const png = await readFile(new URL(name, root));
  html = html.replace(`src="${name}"`, `src="data:image/png;base64,${png.toString("base64")}"`);
}
html = html.replace(/\s*<link rel="icon"[^>]+>/, "");
html = html.replace(
  '<a href="./offline.html" download="first-ten-pitch.html">Download offline deck</a>',
  "",
);
html = html.replace('href="/"', 'href="https://first-10-three.vercel.app/"');
const output = new URL("offline.html", root);
await writeFile(output, html);
console.log(`Wrote self-contained offline fallback: ${fileURLToPath(output)}`);
