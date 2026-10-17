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
  return { type: "object", properties: props, required: Object.keys(props), additionalProperties: false };
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

async function callAI(system: string, user: string, kind: Kind) {
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) throw new Error("AI is not configured.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      Authorization: `Bearer ${key}`,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      instructions: system,
      input: user,
      reasoning: { effort: "low" },
      store: false,
      stream: true,
      text: { format: { type: "json_schema", name: kind, strict: true, schema: SCHEMAS[kind] } },
    }),
  });
  if (!res.ok || !res.body) {
    let msg = "The AI couldn't respond right now. Please try again in a moment.";
    if (res.status === 429) msg = "The AI is busy. Please wait a minute and try again.";
    if (res.status === 402) msg = "AI credits ran out. Add credits in Settings → Plans & credits.";
    try {
      const j = await res.json();
      if (res.status === 402 || res.status === 403) msg = j?.message ?? j?.error?.message ?? msg;
    } catch {}
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "response.output_text.delta") text += ev.delta;
        if (ev.type === "response.failed" || ev.type === "error")
          throw new Error("The AI couldn't finish. Please try again.");
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("The AI")) throw e;
      }
    }
  }
  if (!text) throw new Error("The AI returned nothing. Please try again.");
  return JSON.parse(text);
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
      sb.from("learnings").select("title,body,data,kind").eq("project_id", p.id).eq("accepted", true),
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
      data.kind === "stage2" ? `CONTACT SOURCES:\n${JSON.stringify(contacts ?? []).slice(0, 3000)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    return callAI(
      "You are a warm, practical coach helping a student founder find their first customers. Use plain, friendly language. No jargon.",
      `${TASKS[data.kind]}\n\n${ctx}`,
      data.kind,
    );
  });
