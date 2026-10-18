import { fileURLToPath } from "node:url";
// Run this callback inside the existing connected Artifact Session, in small batches.
// It preserves the deck and its first nine slide IDs while replacing the requested narrative.
const cream = "#F7F5EC",
  ink = "#173D35",
  forest = "#102820",
  gold = "#F2CB6B";
const root = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
const sources = {
  event:
    "https://www.babson.edu/professional/entrepreneurship-education/faculty-and-staff-programs/ai-for-entrepreneurship-educators/",
  pedagogy:
    "https://entrepreneurship.babson.edu/four-approaches-to-teaching-an-entrepreneurship-method/",
  eef: "https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/metacognition",
  orbit: "https://news.mit.edu/2024/new-ai-jetpack-accelerates-entrepreneurial-process-0919",
  venturekit: "https://www.venturekit.ai/business-plan",
  canvas: "https://www.d-eship.com/stepdecanvas/",
  bus131:
    "https://www.brandeis.edu/programs/business/course-schedule/course?acad_year=2026&class_section=1&crse_id=DEFINITION-3-13833&strm=1253",
  bus232: "https://www.brandeis.edu/global/impact/2023/asper-center.pdf",
};
export const slides = [
  {
    title: "First Ten",
    caption:
      "Built by Ian Roy, Jungsoo Ahn, Harini Mittal, José Pedro Carreón Gutiérrez, Anna M. Pietraszek and Raquel M. Richardson for the Babson AI Academy. Workshop context does not imply institutional endorsement.",
  },
  {
    title: "The first conversation is hard",
    caption:
      "Teaching problem to investigate: students may feel nervous approaching people, struggle to choose whom to ask and confuse a finished prototype with evidence of demand. This is a teaching hypothesis, not a measured prevalence claim.",
  },
  {
    title: "Real features. Real people. A useful test.",
    caption:
      "First Ten supports interviewing, reviewing learning and planning a small experiment. Students test meaningful use and willingness to pay through appropriate behavior and commitments. A positive interview answer does not establish product-market fit.",
  },
  {
    title: "A clearer next move",
    caption:
      "The candidate value is continuity from what a person said to an interpretation, counterexample, decision and next experiment. StudyLoop is an authored fictional example. Try the no-login walkthrough at https://first-10-three.vercel.app/demo.",
  },
  {
    title: "Student workspace",
    file: "student",
    caption:
      "Actual deployed workspace with fictional StudyLoop fixture data. Contact and interview work, reviewed learning and experiments remain connected to the selected private idea. Stage targets are workflow scaffolds, not verified traction.",
  },
  {
    title: "The $0 Marketing Lab",
    file: "marketing",
    caption:
      "Actual saved manual lab. Think first, map channels, make content, plan a test and review learning. Students verify access and publish their own work. Zero cash still costs time. Optional presenter-only AI practice now works on a fixed fictional case. General marketing AI remains planned.",
  },
  {
    title: "Educator planner and class preview",
    file: "educator",
    caption:
      "Actual owner-private lesson planner and four authored fictional teams. Planned class capacity is not enrollment. Student assignment preview excludes facilitator notes. The team examples are not live submissions; practice feedback is temporary.",
  },
  {
    title: "An honest operational view",
    file: "admin",
    caption:
      "Actual protected, aggregate-only admin view. Counts include labeled fictional fixture contributions. Uninstrumented funnel metrics remain unavailable. The presenter flag grants a narrow count view, not general student or account access.",
  },
  {
    title: "Market opportunity: a focused teaching loop",
    caption:
      "Illustrative positioning based on public product descriptions. Axes describe scope and delivery, not quality or efficacy. MIT Orbit / AI JetPack includes testing within broader Disciplined Entrepreneurship guidance. First Ten is an unvalidated working prototype.",
  },
  {
    title: "The technology is the engine. Pedagogy is the moat.",
    caption:
      "Architecture illustration requested by the owner. React/TanStack/Tailwind, Supabase private data, Vercel and one server OpenRouter gateway. Live fictional practice: google/gemini-2.5-flash-lite. Private-workflow code default: anthropic/claude-sonnet-4.5. The owner describes ten years of classroom-tested proprietary pedagogy; this is teaching history and positioning, not a measured learning result for First Ten.",
  },
  {
    title: "Teaching built into the workflow",
    caption:
      "React/TanStack, Supabase owner-scoped storage, Vercel and one server-side OpenRouter gateway support the workflow. Six teaching concepts map to student activities. These design choices have not established learning gains.",
  },
  {
    title: "Crossing the Chasm",
    caption:
      "Editable adaptation of Geoffrey Moore’s adoption curve. Our proposed entry is classroom pilots with early adopters; the intended bridge is a repeatable teaching package. Timeline: October 2026 tests in BUS 131A / BUS 232F at Brandeis; November–December refinement; Spring 2027 release target of ten schools represented at the Babson workshop. Dates and ten-school target are plans, not confirmed commitments.",
  },
  {
    title: "Questions",
    caption:
      "Which student decision would you want to see more clearly? Explore the fictional demo, adapt the teaching kit or discuss a small pilot. Outcomes and willingness to pay remain research questions.",
  },
];
export default async function rebuild({ presentation, input }) {
  const text = (s, content, x, y, w, h, size = 24, color = ink, bold = false) => {
    const sh = s.shapes.add({
      geometry: "textbox",
      position: { left: x, top: y, width: w, height: h },
      fill: "none",
      line: { fill: "none", width: 0 },
    });
    sh.text = content;
    sh.text.style = {
      fontFamily: bold ? "Bricolage Grotesque" : "Figtree",
      fontSize: size,
      bold,
      color,
    };
    return sh;
  };
  const image = (s, name, x, y, w, h, alt, fit = "contain") =>
    s.images.add({
      path: `${root}/public/${name}`,
      position: { left: x, top: y, width: w, height: h },
      fit,
      alt,
    });
  const header = (s, kicker, title, dark = false) => {
    text(s, kicker, 72, 42, 1136, 28, 18, dark ? gold : ink, true);
    text(s, title, 72, 96, 1136, 100, 44, dark ? cream : ink, true);
  };
  const footer = (s, c, dark = false) =>
    text(s, c, 72, 657, 1136, 40, 16, dark ? "#B9D3C3" : "#4D655A");
  while (presentation.slides.items.length < 13)
    presentation.slides.add({ width: 1280, height: 720 });
  for (let i = input.from; i <= input.to; i++) {
    const s = presentation.slides.getItem(i);
    const snap = s.toSnapshot();
    presentation.delete(
      [...snap.shapes, ...snap.images, ...snap.charts, ...snap.tables].map((x) => x.aid),
    );
    s.background.fill = [1, 10, 12].includes(i) ? forest : cream;
    let notes = slides[i].caption;
    if (i === 0) {
      image(s, "brand/wordmark.png", 72, 48, 315, 70, "First Ten original logo");
      text(s, "Customer conversations.\nA clearer next move.", 72, 177, 1136, 168, 64, ink, true);
      text(s, "Babson AI for Entrepreneurship Educators", 76, 389, 1100, 44, 28, ink, true);
      text(
        s,
        "Ian Roy  ·  Jungsoo Ahn  ·  Harini Mittal\nJosé Pedro Carreón Gutiérrez\nAnna M. Pietraszek  ·  Raquel M. Richardson",
        76,
        470,
        1100,
        120,
        25,
        ink,
      );
      footer(s, "Babson AI Academy team  /  October 18, 2026");
      notes += " Event source: " + sources.event;
    } else if (i === 1) {
      header(s, "THE TEACHING PROBLEM", "The first conversation is hard", true);
      text(
        s,
        "“Who should I talk to?”\n“What should I ask?”\n“What if nobody wants it?”",
        76,
        224,
        1050,
        235,
        48,
        cream,
        true,
      );
      text(
        s,
        "Unsure where to start testing product–market fit.\nWill relevant people actually use it?",
        76,
        506,
        1080,
        100,
        29,
        cream,
      );
      footer(s, "Problem framing to investigate. No prevalence or product-market fit claim.", true);
    } else if (i === 2) {
      header(s, "THE SOLUTION", "Real features. Real people. A useful test.");
      text(s, "Students bring something they can show.", 76, 224, 1080, 60, 36, ink, true);
      text(
        s,
        "Interview people with the problem.\nReview what supports and challenges the idea.\nChoose one change or one small experiment.",
        76,
        318,
        1080,
        178,
        31,
        ink,
      );
      text(
        s,
        "Test actual use and willingness to pay through real commitments.",
        76,
        548,
        1080,
        68,
        30,
        ink,
        true,
      );
      footer(s, "A learning workflow. Conversation counts and stated intent do not prove demand.");
    } else if (i === 3) {
      header(s, "THE VALUE PROPOSITION", "A clearer next move");
      const rows = [
        ["Observation", "Maya needs to know who will show up."],
        ["Counterexample", "Nora already has a reliable study group."],
        ["Decision", "Test attendance confirmation with existing groups."],
        ["Next experiment", "Invite one group to try a bounded session."],
      ];
      rows.forEach((r, j) => {
        text(s, r[0], 76, 224 + j * 83, 240, 45, 23, ink, true);
        text(s, r[1], 338, 224 + j * 83, 850, 60, 28, ink);
      });
      text(s, "Live walkthrough: first-10-three.vercel.app/demo", 76, 579, 1100, 42, 26, ink, true);
      footer(s, "StudyLoop is fictional. This experiment has no customer result.");
    } else if (i >= 4 && i <= 7) {
      header(s, "PRODUCT DEMO", slides[i].title);
      const f = slides[i].file;
      if (i === 4) {
        image(s, `pitch/demo/${f}.png`, 185, 178, 910, 466, slides[i].caption);
      } else if (i === 6) {
        image(
          s,
          "pitch/demo/educator-viewport.png",
          62,
          187,
          970,
          450,
          "Educator planner readable viewport, fictional case",
        );
        image(
          s,
          "pitch/demo/educator.png",
          1090,
          186,
          120,
          456,
          "Complete educator page, fictional example",
        );
      } else {
        image(s, `pitch/demo/${f}-viewport.png`, 62, 187, 970, 450, slides[i].caption);
        image(
          s,
          `pitch/demo/${f}.png`,
          1090,
          186,
          120,
          456,
          "Complete " + f + " page with fictional fixture data",
        );
      }
      footer(
        s,
        "Actual deployed screens with fictional fixture data. Full-page captures: /pitch/demo/" +
          f +
          ".png",
      );
      notes +=
        " Source: deployed app, 2026-10-18 synthetic presenter walkthrough; source code and access tests. Full-page image: https://first-10-three.vercel.app/pitch/demo/" +
        f +
        ".png";
    } else if (i === 8) {
      header(s, "MARKET OPPORTUNITY", "A focused customer-discovery teaching loop");
      // Explicitly requested editable 2×2 comparison. Positions are qualitative, not measured.
      const line = (x, y, w, h) =>
        s.shapes.add({
          geometry: "line",
          position: { left: x, top: y, width: w, height: h },
          fill: "none",
          line: { fill: "#8AA696", width: 2 },
        });
      line(245, 223, 0, 345);
      line(245, 568, 910, 0);
      line(700, 223, 0, 345);
      line(245, 394, 910, 0);
      text(s, "Instructor\nfacilitated", 72, 255, 155, 85, 23, ink, true);
      text(s, "Software\nguided", 72, 449, 155, 85, 23, ink, true);
      text(s, "Whole-venture planning", 245, 586, 450, 44, 22, ink, true);
      text(s, "Focused discovery / test loop", 722, 586, 470, 44, 22, ink, true);
      text(s, "Facilitated DE\nCanvas workshop", 302, 267, 360, 90, 26, ink, true);
      text(s, "Customer-discovery\nclass / whiteboard", 752, 267, 375, 90, 26, ink, true);
      text(s, "Venturekit\nMIT Orbit / AI JetPack", 300, 432, 370, 100, 26, ink, true);
      text(s, "First Ten prototype", 753, 440, 390, 60, 31, ink, true);
      text(s, "Optional classroom use", 755, 499, 390, 38, 21, ink);
      footer(
        s,
        "Illustrative focus and delivery, not a benchmark. Alternatives also support testing.",
      );
      notes +=
        " Public sources, checked 2026-10-18: " +
        sources.orbit +
        " ; https://orbit.mit.edu/login ; " +
        sources.venturekit +
        " ; " +
        sources.canvas +
        ". Offline facilitated uses are illustrative teaching formats, not separate software offerings. No exclusive feature or superior outcome is claimed.";
    } else if (i === 9) {
      image(
        s,
        "pitch/architecture-magic.png",
        0,
        0,
        1280,
        720,
        "Technology architecture and owner-stated moat: ten years of classroom-tested proprietary pedagogy. React, TanStack and Tailwind; Supabase private data; server AI gateway; OpenRouter; Gemini Flash-Lite fictional practice and Claude Sonnet private-flow default.",
      );
      text(
        s,
        "Live fictional practice: google/gemini-2.5-flash-lite",
        76,
        665,
        1135,
        25,
        17,
        ink,
        true,
      );
      text(
        s,
        "Private-workflow code default: anthropic/claude-sonnet-4.5",
        76,
        689,
        1135,
        25,
        17,
        ink,
        true,
      );
      notes +=
        " Visual generated with the built-in ImageGen tool at the owner’s explicit request, 2026-10-18. The ten years of classroom-tested proprietary pedagogy is an owner-stated teaching-history and competitive-positioning claim, not a measured learning outcome for the new app or an independently verified IP/exclusivity finding. Logos identify depicted technologies and do not imply endorsement. The diagram is conceptual; human review happens after the server returns a draft. Current code default for four private workflows is anthropic/claude-sonnet-4.5; environment configuration may select another model. Restricted live fictional practice uses google/gemini-2.5-flash-lite with the Google Vertex route. Exact IDs are editable native text. No private project text enters the synthetic practice request.";
    } else if (i === 10) {
      header(s, "TEACHING DESIGN", "Teaching built into the workflow", true);
      text(
        s,
        "Students do the thinking. AI drafts remain optional.",
        76,
        198,
        1130,
        88,
        29,
        cream,
        true,
      );
      const rows = [
        ["Experiential learning", "A real conversation or small test"],
        [
          "Generative, student-led thinking before AI",
          "An initial explanation in the student’s own words",
        ],
        ["Scaffolded practice", "A bounded sequence from evidence to action"],
        ["Formative peer feedback", "A peer checks the plan and next step"],
        ["Metacognition and reflection", "What changed? What would change it again?"],
        ["Responsible AI and human judgment", "Review claims, permissions and drafts"],
      ];
      rows.forEach((r, j) => {
        text(s, r[0], 76, 310 + j * 49, 585, 42, 21, gold, true);
        text(s, r[1], 684, 310 + j * 49, 510, 42, 21, cream);
      });
      footer(
        s,
        "Owner-private saved work. Teaching design commitments; learning effects remain unmeasured.",
        true,
      );
      notes +=
        " Sources: current repository ProductSpec and pedagogy-map; " +
        sources.pedagogy +
        " ; " +
        sources.eef +
        ". EEF addresses school settings, not First Ten university efficacy. Owner-supplied BUS131 Week 6 activities inspired the marketing sequence. The main lab works manually. Presenter-only synthetic practice uses Gemini 2.5 Flash-Lite through OpenRouter on Google Vertex. The owner verified one production draft on 2026-10-18 at reported provider cost $0.000106. That single observed cost is not a forecast or a promise for other flows. General marketing AI remains planned; the existing four private AI kinds retain their separate baseline. A live AI call is not required for this presentation.";
    } else if (i === 11) {
      header(s, "GO TO MARKET", "Crossing the Chasm");
      // Editable adaptation of Moore's adoption lifecycle. No measured percentages.
      const curve = (x, w, y0, c1, c2, y1, fill) =>
        s.shapes.add({
          geometry: "custom",
          position: { left: x, top: 200, width: w, height: 225 },
          fill,
          line: { fill: cream, width: 2 },
          customPaths: [
            {
              width: w,
              height: 225,
              commands: [
                { moveTo: { x: 0, y: 225 } },
                { lineTo: { x: 0, y: y0 } },
                { cubicBezTo: { x1: w * 0.35, y1: c1, x2: w * 0.7, y2: c2, x: w, y: y1 } },
                { lineTo: { x: w, y: 225 } },
                { close: {} },
              ],
            },
          ],
        });
      curve(92, 130, 225, 224, 213, 204, "#B9D3C3");
      curve(222, 168, 204, 186, 140, 105, "#2B7058");
      curve(488, 238, 105, 51, 1, 1, "#A4C4AE");
      curve(726, 238, 1, 0, 115, 183, "#C7D8C6");
      curve(964, 226, 183, 210, 224, 225, "#DFE6D8");
      const rule = (x, y, w, h, color = ink, width = 2) =>
        s.shapes.add({
          geometry: "line",
          position: { left: x, top: y, width: w, height: h },
          fill: "none",
          line: { fill: color, width },
        });
      rule(92, 425, 298, 0);
      rule(488, 425, 702, 0);
      text(s, "Innovators", 80, 439, 160, 45, 21, ink, true);
      text(s, "Early adopters", 244, 439, 165, 55, 21, ink, true);
      text(s, "Early majority", 540, 439, 190, 45, 21, ink, true);
      text(s, "Late majority", 784, 439, 190, 45, 21, ink, true);
      text(s, "Laggards", 1058, 439, 145, 45, 21, ink, true);
      text(s, "CHASM", 397, 353, 94, 40, 18, "#A24328", true);
      text(s, "Our proposed entry:\nclassroom pilots", 76, 197, 310, 72, 23, ink, true);
      s.shapes.add({
        geometry: "ellipse",
        position: { left: 322, top: 314, width: 16, height: 16 },
        fill: gold,
        line: { fill: ink, width: 2 },
      });
      rule(278, 273, 50, 42, ink, 2);
      text(s, "Bridge: repeatable teaching package", 386, 177, 700, 44, 25, ink, true);
      const a = s.shapes.add({
        geometry: "rect",
        position: { left: 364, top: 263, width: 1, height: 1 },
        fill: "none",
        line: { fill: "none", width: 0 },
      });
      const b = s.shapes.add({
        geometry: "rect",
        position: { left: 554, top: 263, width: 1, height: 1 },
        fill: "none",
        line: { fill: "none", width: 0 },
      });
      s.shapes.connect(a, b, {
        kind: "straight",
        fromSide: "right",
        toSide: "left",
        line: { fill: "#B98A29", width: 5 },
        tail: { type: "arrow", width: "med", length: "med" },
      });
      rule(76, 525, 1126, 0, "#8AA696", 2);
      const timeline = [
        ["OCTOBER 2026", "Tests begin", "BUS 131A / BUS 232F, Brandeis"],
        ["NOV–DEC 2026", "Refine the teaching package", "Use pilot feedback"],
        ["SPRING 2027", "Release target: 10 schools", "Schools represented in this room"],
      ];
      timeline.forEach((r, j) => {
        const x = 76 + j * 388;
        text(s, r[0], x, 541, 370, 35, 21, ink, true);
        text(s, r[1], x, 583, 370, 45, 25, ink, true);
        text(s, r[2], x, 625, 370, 34, 18, ink);
      });
      text(
        s,
        "Adapted from Geoffrey Moore. Planned dates and target, not confirmed school commitments.",
        76,
        680,
        1135,
        28,
        16,
        "#4D655A",
      );
      notes +=
        " Primary sources checked 2026-10-18: https://geoffreyamoore.com/book/crossing-the-chasm/ and https://crossingthechasmbymoore.com/book/ (official book site with adoption-curve illustration). The gap separates visionary early adopters from pragmatist early-majority customers. Editable qualitative adaptation, not measured adoption data; no exact percentages or claim that First Ten has crossed it. Our proposed classroom-pilot entry and repeatable teaching-package bridge are strategic hypotheses. Owner-requested timeline: tests start October 2026 in BUS 131A and BUS 232F Brandeis teaching contexts, refine November–December using pilot feedback, Spring 2027 release target of ten schools represented at the Babson workshop. Ten is an ambition, not ten confirmed commitments or institutional endorsement. Course sources: " +
        sources.bus131 +
        " ; " +
        sources.bus232 +
        ".";
    } else if (i === 12) {
      image(s, "brand/wordmark-on-dark.png", 72, 48, 315, 70, "First Ten original logo on dark");
      text(s, "Questions", 76, 195, 1100, 100, 72, cream, true);
      text(
        s,
        "Which student decision would you\nwant to see more clearly?",
        76,
        330,
        1100,
        130,
        44,
        cream,
        true,
      );
      text(
        s,
        "first-10-three.vercel.app/demo\nfirst-10-three.vercel.app/teach",
        76,
        520,
        1100,
        90,
        30,
        gold,
        true,
      );
      footer(s, "A working prototype. Fictional demo. Proposed classroom pilots.", true);
    }
    s.speakerNotes.text = notes;
  }
  return { slides: presentation.slides.items.length, updated: [input.from + 1, input.to + 1] };
}
