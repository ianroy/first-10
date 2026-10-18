import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Kind = "questions" | "synthesis" | "stage2" | "stage3";

const str = { type: "string" };
const strArr = { type: "array", items: str };
const titled = {
  type: "array",
  items: {
    type: "object",
    properties: { title: str, body: str },
    required: ["title", "body"],
    additionalProperties: false,
  },
};
function obj(props: Record<string, unknown>) {
  return {
    type: "object",
    properties: props,
    required: Object.keys(props),
    additionalProperties: false,
  };
}

const SCHEMAS: Record<Kind, object> = {
  questions: obj({ questions: strArr }),
  synthesis: obj({
    problems: strArr,
    objections: strArr,
    best_fit: strArr,
    quotes: strArr,
    changes: titled,
  }),
  stage2: obj({ channels: titled, drafts: titled, survey: strArr }),
  stage3: obj({ channels: titled, referral_asks: strArr, onboarding_questions: strArr }),
};

const TASKS: Record<Kind, string> = {
  questions:
    "Write 9 in-person customer interview questions in the style of The Mom Test. Ask about past behavior, real recent situations, current workarounds, and what it cost them. NEVER pitch the app, never ask hypotheticals like 'would you use'. Keep each question short and casual for a student to say out loud. The LAST question must be: 'Who else should I talk to about this?'",
  synthesis:
    "Synthesize the interviews. Give: top problems (3-5), objections or hesitations (2-4), best-fit users (2-3 short descriptions), customer quotes in their own words (3-6, copied from notes/quotes), and exactly 3 suggested changes to the app or pitch (title + why, referencing evidence).",
  stage2:
    "Plan outreach to the next 50 people. channels: 4-6 concrete places (referrals given in interviews, online communities, campus groups) with a short how-to. drafts: 3 short friendly outreach messages (DM, campus group post, referral intro) written using the customers' own words, no hype. survey: 5-6 short feedback questions for people who tried the app, based on stage 1 learnings.",
  stage3:
    "Plan growth to the next 100 users. channels: 4-5 scalable channels a student can run (with how-to). referral_asks: 3 short scripts asking happy users to refer friends. onboarding_questions: 4-5 short questions to ask new users right after signup to find onboarding friction.",
};

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("The AI returned something unreadable. Please try again.");
  }
}

async function fetchWithRetry(url: string, init: RequestInit, tries = 3) {
  let res!: Response;
  for (let i = 0; i < tries; i++) {
    try {
      res = await fetch(url, init);
    } catch (e) {
      if (i === tries - 1) throw new Error("The AI timed out. Please try again.");
      continue;
    }
    if (res.status !== 429 && res.status < 500) return res;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 800 * 2 ** i));
  }
  return res;
}

async function callAI(system: string, user: string, kind: Kind) {
  const key = process.env["OPENROUTER_API_KEY"];
  if (!key) throw new Error("AI is not configured. Set OPENROUTER_API_KEY.");
  const res = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env["APP_URL"] ?? "https://first-10-three.vercel.app",
      "X-Title": "First Ten",
    },
    body: JSON.stringify({
      model: process.env["OPENROUTER_MODEL"] ?? DEFAULT_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: kind, strict: true, schema: SCHEMAS[kind] },
      },
      provider: { require_parameters: true },
    }),
  });
  if (!res.ok) {
    let msg = "The AI couldn't respond right now. Please try again in a moment.";
    if (res.status === 429) msg = "The AI is busy. Please wait a minute and try again.";
    if (res.status === 402) msg = "AI credits ran out. Add credits on OpenRouter.";
    if (res.status === 401) msg = "The AI key is invalid. Check OPENROUTER_API_KEY.";
    throw new Error(msg);
  }
  const j = await res.json();
  const text: string | undefined = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error("The AI returned nothing. Please try again.");
  return parseJson(text);
}

export const generateAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind: Kind; projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: p } = await sb.from("projects").select("*").eq("id", data.projectId).single();
    if (!p) throw new Error("Project not found");
    const [{ data: interviews }, { data: learnings }, { data: contacts }] = await Promise.all([
      sb.from("interviews").select("answers,tags").eq("project_id", p.id).eq("completed", true),
      sb
        .from("learnings")
        .select("title,body,data,kind")
        .eq("project_id", p.id)
        .eq("accepted", true),
      sb.from("contacts").select("relation,why,source,stage").eq("project_id", p.id),
    ]);
    const ctx = [
      `APP: ${p.name}\nWhat it does: ${p.description}\nWho it's for: ${p.audience}\nProblem: ${p.problem}`,
      data.kind !== "questions" && interviews?.length
        ? `INTERVIEWS:\n${JSON.stringify(interviews).slice(0, 14000)}`
        : "",
      data.kind !== "questions" && data.kind !== "synthesis" && learnings?.length
        ? `ACCEPTED LEARNINGS:\n${JSON.stringify(learnings).slice(0, 6000)}`
        : "",
      data.kind === "stage2"
        ? `CONTACT SOURCES:\n${JSON.stringify(contacts ?? []).slice(0, 3000)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    return callAI(
      "You are a warm, practical coach helping a student founder find their first customers. Use plain, friendly language. No jargon.",
      `${TASKS[data.kind]}\n\n${ctx}`,
      data.kind,
    );
  });
