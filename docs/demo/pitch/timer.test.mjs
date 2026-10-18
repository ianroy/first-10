import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const html = readFileSync(new URL("../../../public/pitch/index.html", import.meta.url), "utf8");
function pitch() {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  let now = 0;
  Object.defineProperty(dom.window.performance, "now", { value: () => now });
  dom.window.setInterval = () => 1;
  dom.window.eval(dom.window.document.querySelector("script").textContent);
  const doc = dom.window.document;
  return {
    dom,
    doc,
    text: (id) => doc.getElementById(id).textContent,
    click: (id) => doc.getElementById(id).click(),
    tick: (ms) => {
      now = ms;
      doc.dispatchEvent(new dom.window.Event("visibilitychange"));
    },
  };
}
test("title Next starts 90/60/30 segments and one continuous 3-minute clock", () => {
  const p = pitch();
  p.tick(5000);
  assert.equal(p.text("total-time"), "3:00");
  p.click("present");
  assert.equal(p.text("speaker-time"), "1:30");
  p.click("next");
  p.tick(65000);
  assert.equal(p.text("speaker-time"), "0:30");
  assert.equal(p.text("total-time"), "2:00");
  p.tick(95000);
  assert.equal(p.text("speaker-label"), "Speaker 2");
  assert.equal(p.text("speaker-time"), "1:00");
  assert.equal(p.text("total-time"), "1:30");
  p.click("next");
  p.tick(155000);
  assert.equal(p.text("speaker-label"), "Speaker 3");
  assert.equal(p.text("speaker-time"), "0:30");
  assert.equal(p.text("total-time"), "0:30");
  p.tick(185000);
  assert.equal(p.text("speaker-label"), "Pitch complete");
  assert.equal(p.text("total-time"), "0:00");
  assert.equal(p.text("speaker-time"), "0:00");
  p.tick(1000000);
  assert.equal(p.text("total-time"), "0:00");
  p.dom.window.close();
});
test("pause/resume and returning to the title never restart the clock; explicit Reset does", () => {
  const p = pitch();
  p.click("next");
  p.tick(10000);
  p.click("clock-pause");
  p.tick(100000);
  assert.equal(p.text("speaker-time"), "1:20");
  p.click("previous");
  p.click("next");
  assert.equal(p.text("total-time"), "2:50");
  p.click("clock-pause");
  p.tick(110000);
  assert.equal(p.text("speaker-time"), "1:10");
  p.click("clock-reset");
  assert.equal(p.text("position"), "1 / 13");
  assert.equal(p.text("total-time"), "3:00");
  p.click("next");
  p.tick(200000);
  assert.equal(p.text("speaker-label"), "Speaker 2");
  p.dom.window.close();
});
test("Right arrow from the title starts timing; End and presentation mode do not", () => {
  const p = pitch();
  const key = (value) =>
    p.doc.dispatchEvent(new p.dom.window.KeyboardEvent("keydown", { key: value, bubbles: true }));
  key("End");
  p.tick(10000);
  assert.equal(p.text("total-time"), "3:00");
  key("Home");
  key("ArrowRight");
  p.tick(11000);
  assert.equal(p.text("total-time"), "2:59");
  p.dom.window.close();
});
