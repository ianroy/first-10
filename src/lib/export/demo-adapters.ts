import {
  sources,
  choices,
  startingIdea,
  startingAssumption,
  interpretation,
  alternative,
  uncertainty,
  type ChoiceId,
  type SourceId,
} from "@/lib/demo/studyloop";
import {
  marketingScenarios,
  marketingChannels,
  sampleContent,
  sevenDayPlan,
  type MarketingChannelId,
} from "@/lib/demo/marketing";
import { classroomExamples, type ClassroomExampleId } from "@/lib/demo/classroom";
import { activity, section, type ActivityOffer } from "./adapters";

const fictional = {
  sourceScope: "fictional" as const,
  fictional: true,
  kind: "Fictional teaching example",
};
export function studyLoopActivities(state: {
  choiceId: ChoiceId | null;
  sourceId: SourceId;
  step: number;
}): ActivityOffer[] {
  const choice = choices.find((c) => c.id === state.choiceId);
  return [
    activity(
      "demo.assumption",
      "StudyLoop 1 - Starting assumption",
      [
        section("demo.assumption.fields", "Fictional starting point", [
          ["Idea", startingIdea],
          ["Assumption", startingAssumption],
          ["Current example step", state.step + 1],
        ]),
      ],
      fictional,
    ),
    ...sources.map((s, i) =>
      activity(
        `demo.source.${i}`,
        `StudyLoop source - ${s.name}`,
        [
          section(`demo.source.${i}.fields`, s.kind, [
            ["Fictional person", s.name],
            ["Lens", s.lens],
            ["Excerpt", s.text],
            ["Currently selected in example", state.sourceId === s.id],
          ]),
        ],
        fictional,
      ),
    ),
    activity(
      "demo.interpretation",
      "StudyLoop 2 - Interpretation and counterevidence",
      [
        section("demo.interpretation.fields", "Review the reasoning", [
          ["Interpretation", interpretation],
          ["Alternative", alternative],
          ["Uncertainty", uncertainty],
          ["Nora's counterexample", sources[3].text],
        ]),
      ],
      fictional,
    ),
    activity(
      "demo.decision",
      "StudyLoop 3 - Proposed next decision",
      [
        section("demo.decision.fields", "Current choice - no experiment has run", [
          ["Selected choice", choice?.title ?? null],
          ["Reasoning", choice?.feedback ?? null],
          ["Question", choice?.question ?? null],
          ["Proposed action", choice?.action ?? null],
          ["What to observe", choice?.observe ?? null],
          ["When to reconsider", choice?.reconsider ?? null],
          ["Still unknown", choice?.unknown ?? null],
        ]),
      ],
      fictional,
    ),
  ];
}
export function marketingDemoActivities(state: {
  choiceId: ChoiceId;
  channelId: MarketingChannelId;
  thought: string;
  sampleThinking: boolean;
  thinkingReady: boolean;
  draftOpen: boolean;
  peerNote: string;
  reflection: "repeat" | "revise" | "stop" | null;
  reason: string;
}): ActivityOffer[] {
  const scenario = marketingScenarios[state.choiceId],
    channel = marketingChannels.find((c) => c.id === state.channelId)!;
  return [
    activity(
      "demo-marketing.think",
      "Marketing example 1 - First thinking",
      [
        section("demo-marketing.think.fields", "Fictional case and current practice notes", [
          ["Your own starting thought", state.thought],
          ["Used authored sample", state.sampleThinking],
          [
            "Authored sample (not your writing)",
            state.sampleThinking ? scenario.firstThought : "Not selected",
          ],
          ["Thinking step continued", state.thinkingReady],
          ["Audience", scenario.audience],
          ["Useful action", scenario.usefulAction],
          ["Boundary / counterexample", scenario.boundary],
        ]),
      ],
      fictional,
    ),
    activity(
      "demo-marketing.channels",
      "Marketing example 2 - Channel comparison",
      marketingChannels.map((c, i) =>
        section(`demo-marketing.channels.${i}`, c.name, [
          ["Selected", c.id === state.channelId],
          ["Medium", c.medium],
          ["Role", c.role],
          ["Place to investigate", c.place],
          ["Fit", c.fit],
          ["Access", c.access],
          ["Question", c.question],
          ["Effort", c.effort],
          ["Resource", c.resource],
          ["Format", c.format],
        ]),
      ),
      fictional,
    ),
    activity(
      "demo-marketing.content",
      "Marketing example 3 - Sample draft",
      [
        section("demo-marketing.content.fields", "Authored draft - unsent and untested", [
          ["Sample opened", state.draftOpen],
          ["Channel", channel.name],
          ["Hook", scenario.hook],
          [
            "Authored sample body",
            state.draftOpen
              ? sampleContent(state.choiceId, state.channelId)
              : "Sample draft has not been opened",
          ],
          ["Call to action", scenario.cta],
        ]),
      ],
      fictional,
    ),
    activity(
      "demo-marketing.plan",
      "Marketing example 4 - Proposed seven days",
      sevenDayPlan(state.choiceId, state.channelId).map((day, i) =>
        section(`demo-marketing.plan.${i}`, `Day ${day.day}`, [
          ["Title", day.title],
          ["Proposed owner role", day.owner],
          ["Done means", day.done],
          ["Run state", "Proposed / not run"],
        ]),
      ),
      fictional,
    ),
    activity(
      "demo-marketing.reflection",
      "Marketing example 5 - Practice reflection",
      [
        section("demo-marketing.reflection.fields", "Current local practice - not saved or sent", [
          ["Measurement proposal", scenario.measurement],
          ["Observed result", null],
          ["Peer practice note", state.peerNote],
          ["Possible decision (not an outcome)", state.reflection],
          ["Authored criterion", state.reflection ? scenario[state.reflection] : null],
          ["Evidence you would need", state.reason],
        ]),
      ],
      fictional,
    ),
  ];
}
export function classroomExampleActivities(
  selected: ClassroomExampleId,
  comments: Partial<Record<ClassroomExampleId, string>>,
): ActivityOffer[] {
  return classroomExamples.map((t) =>
    activity(
      `classroom.${t.id}`,
      `Fictional team - ${t.name}`,
      [
        section(`classroom.${t.id}.work`, "Authored example - not an enrolled team or submission", [
          ["Selected example", selected === t.id],
          ["Idea", t.idea],
          ["Teaching focus", t.focus],
          ["Principle", t.principle],
          ["First thinking", t.firstThinking],
          ["Observation", t.observation],
          ["Assumption", t.assumption],
          ["Counterexample", t.counterexample],
          ["Decision", t.decision],
          ["Next step", t.nextStep],
          ["Authored work excerpt", t.workExcerpt],
          ["Feedback prompts", t.prompts.join("\n")],
          ["Your local feedback draft - unsaved and unsent", comments[t.id] ?? ""],
        ]),
      ],
      fictional,
    ),
  );
}
export function teachingReferenceActivities(
  agenda: readonly { time: string; title: string; detail: string; artifact: string }[],
  rubric: readonly { title: string; prompt: string }[],
) {
  return [
    activity(
      "teacher.reference",
      "Lesson reference agenda and peer rubric",
      [
        ...agenda.map((a, i) =>
          section(`teacher.reference.agenda.${i}`, `Agenda ${a.time}`, [
            ["Activity", a.title],
            ["Facilitation", a.detail],
            ["Artifact", a.artifact],
          ]),
        ),
        section(
          "teacher.reference.rubric",
          "Peer review rubric - teaching scaffold",
          rubric.map((r) => [r.title, r.prompt]),
        ),
      ],
      { kind: "Teaching reference" },
    ),
  ];
}
export function livePracticeActivities(
  result: {
    draft: {
      channel: string;
      hook: string;
      body: string;
      cta: string;
      accessCheck: string;
      peerCheck: string;
      measurement: string;
      uncertainty: string;
    };
    metadata: { promptVersion: string; model: string; provider: string; costUsd: number | null };
  },
  body: string,
  previousDrafts: string[],
): ActivityOffer[] {
  return [
    activity(
      "live-practice.current",
      "Temporary AI practice - current reviewed text",
      [
        section(
          "live-practice.current.fields",
          "Fictional, untested, unsent and not saved to the plan",
          [
            ["Proposed channel", result.draft.channel],
            ["Hook", result.draft.hook],
            ["Current edited body", body],
            ["Original AI body", result.draft.body],
            ["Call to action", result.draft.cta],
            ["Access to investigate", result.draft.accessCheck],
            ["Peer check", result.draft.peerCheck],
            ["What to measure", result.draft.measurement],
            ["Unknowns", result.draft.uncertainty],
            ["Prompt version", result.metadata.promptVersion],
            ["Model", result.metadata.model],
            ["Provider", result.metadata.provider],
            ["Reported cost USD", result.metadata.costUsd],
          ],
        ),
      ],
      fictional,
    ),
    ...previousDrafts.map((draft, i) =>
      activity(
        `live-practice.previous.${i}`,
        `Temporary AI practice - earlier review ${i + 1}`,
        [
          section(`live-practice.previous.${i}.text`, "Earlier local review text", [
            ["Body", draft],
            [
              "Origin limits",
              "This temporary history preserves only reviewed text. It does not retain the earlier request's model/version metadata; do not infer it from the latest draft.",
            ],
          ]),
        ],
        fictional,
      ),
    ),
  ];
}
