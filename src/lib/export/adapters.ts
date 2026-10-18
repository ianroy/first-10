import type {
  Project,
  Contact,
  Interview,
  Learning,
  Experiment,
  Outreach,
  Answer,
} from "@/lib/data";
import type { ActivityExportV1, ActivityExportBlock, ExportValue } from "./activity";
import type { ConsentChoices } from "@/lib/consent";

export type PdfActivity = ActivityExportV1["activities"][number];
export type ActivityOffer = { activity: PdfActivity; originId?: string | null };
export type IdeaBrief = {
  name: string;
  description: string;
  audience: string;
  problem: string;
  link: string;
};
export type ExportProject = Pick<
  Project,
  | "id"
  | "user_id"
  | "name"
  | "description"
  | "audience"
  | "problem"
  | "link"
  | "stage"
  | "checklist"
  | "questions"
  | "questions_origin_id"
  | "survey"
  | "survey_origin_id"
  | "updated_at"
>;
export type SaveState = {
  savedAt: string | null;
  revision?: number;
  dirty?: boolean;
  fictional?: boolean;
};

/** Conservative presentation marker only. It never grants access or sharing permission. */
export function isFictionalExportProject(project: { user_id: string; checklist?: unknown }) {
  return (
    project.user_id === "f1d00000-0000-4000-8000-000000000001" ||
    record(record(project.checklist)["demo"])["fictional"] === true
  );
}
export function markProjectOffers(
  project: { user_id: string; checklist?: unknown },
  offers: ActivityOffer[],
): ActivityOffer[] {
  return isFictionalExportProject(project)
    ? offers.map((offer) => ({ ...offer, activity: { ...offer.activity, fictional: true } }))
    : offers;
}

export function assertOwnedRows(
  project: Pick<Project, "id" | "user_id">,
  rows: readonly { project_id: string; user_id: string }[],
) {
  if (rows.some((r) => r.project_id !== project.id || r.user_id !== project.user_id))
    throw new Error("Activity source does not belong to this selected owner project.");
}
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function scalar(value: unknown): ExportValue {
  return typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
    ? value
    : null;
}
export function list(value: unknown): string {
  if (!Array.isArray(value))
    return value == null ? "" : "Unrecognized legacy list; review the source record.";
  return value
    .map((v) => (typeof v === "string" ? v : "Unrecognized legacy item; review the source record."))
    .join("\n");
}
/** Split long text without truncation, including surrogate-pair boundaries. */
function chunks(value: string, maximum = 19_900) {
  const parts: string[] = [];
  let remaining = value;
  while (remaining.length > maximum) {
    const end = /[\uD800-\uDBFF]/.test(remaining[maximum - 1]!) ? maximum - 1 : maximum;
    parts.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  parts.push(remaining);
  return parts;
}
export function fields(key: string, entries: Array<[string, ExportValue]>): ActivityExportBlock[] {
  const values = entries.flatMap(([label, value]) =>
    typeof value === "string" && value.length > 19_900
      ? chunks(value).map((part, i) => ({ label: `${label} (part ${i + 1})`, value: part }))
      : [{ label, value }],
  );
  const blocks: ActivityExportBlock[] = [];
  let group: typeof values = [];
  for (const value of values) {
    if (
      group.length &&
      (group.length >= 100 || JSON.stringify([...group, value]).length > 50_000)
    ) {
      blocks.push({ key: `${key}.${blocks.length}`, type: "fields", fields: group });
      group = [];
    }
    group.push(value);
  }
  if (group.length) blocks.push({ key: `${key}.${blocks.length}`, type: "fields", fields: group });
  return blocks;
}

/** Named parts preserve every value when one activity exceeds the engine's per-document bounds. */
export function boundedOffers(offers: ActivityOffer[]): ActivityOffer[] {
  return offers.flatMap((offer) => {
    const sections: PdfActivity["sections"] = [];
    for (const s of offer.activity.sections) {
      let group: ActivityExportBlock[] = [];
      const parts: ActivityExportBlock[][] = [];
      for (const b of s.blocks) {
        if (group.length && (group.length >= 35 || JSON.stringify([...group, b]).length > 90_000)) {
          parts.push(group);
          group = [];
        }
        group.push(b);
      }
      parts.push(group);
      parts.forEach((blocks, i) =>
        sections.push({
          ...s,
          title: parts.length > 1 ? `${s.title} (part ${i + 1}/${parts.length})` : s.title,
          blocks,
        }),
      );
    }
    const groups: PdfActivity["sections"][] = [];
    let group: PdfActivity["sections"] = [];
    for (const s of sections) {
      if (group.length && (group.length >= 35 || JSON.stringify([...group, s]).length > 180_000)) {
        groups.push(group);
        group = [];
      }
      group.push(s);
    }
    groups.push(group);
    return groups.map((sections, i) => {
      const key = groups.length > 1 ? `${offer.activity.key}.part${i + 1}` : offer.activity.key;
      return {
        ...offer,
        activity: {
          ...offer.activity,
          key,
          title:
            groups.length > 1
              ? `${offer.activity.title} (part ${i + 1}/${groups.length})`
              : offer.activity.title,
          sections: sections.map((s, j) => ({
            ...s,
            key: `${key}.s${j}`,
            blocks: s.blocks.map((b, k) => ({ ...b, key: `${key}.s${j}.b${k}` })),
          })),
        },
      };
    });
  });
}
export function section(key: string, title: string, entries: Array<[string, ExportValue]>) {
  return { key, title, blocks: fields(`${key}.fields`, entries) };
}
export function activity(
  key: string,
  title: string,
  sections: PdfActivity["sections"],
  options: Partial<
    Pick<PdfActivity, "kind" | "status" | "updatedAt" | "fictional" | "sourceScope">
  > = {},
): ActivityOffer {
  return {
    activity: {
      key,
      title,
      kind: "Owner-recorded activity",
      sourceScope: "owner_private",
      status: "draft",
      fictional: false,
      updatedAt: null,
      sections,
      ...options,
    },
  };
}
export function sourceState(key: string, state: SaveState) {
  return section(`${key}.state`, "Snapshot and limits", [
    [
      "Source",
      state.dirty
        ? "Current unsaved edits; exporting does not save them"
        : state.savedAt
          ? "Current saved work; not independently verified"
          : "Current in-memory work; no confirmed save",
    ],
    ["Last confirmed save", state.savedAt],
    ["Saved revision", state.revision ?? null],
  ]);
}
function originNote(originId: string | null | undefined): ExportValue {
  return originId
    ? "Recorded AI source draft. Current wording may include human edits. Origin details are loaded separately when available."
    : "No recorded AI origin; may be legacy or manually written work.";
}

export function ideaBriefActivity(brief: IdeaBrief, fictional = false): ActivityOffer {
  return activity(
    "idea-form",
    "Idea and audience - current form",
    [
      section("idea-form.brief", "Starting assumptions to test", [
        ["App name", brief.name],
        ["What it does", brief.description],
        ["Audience", brief.audience],
        ["Problem", brief.problem],
        ["Owner-supplied URL (not verified)", brief.link],
        [
          "Save state",
          "Current form contents; may include unsaved edits. Exporting does not create or save an idea.",
        ],
      ]),
    ],
    { kind: "Idea preparation", fictional },
  );
}

export function projectActivities(p: ExportProject): ActivityOffer[] {
  const checklist = record(p.checklist),
    metrics = record(checklist["metrics"]);
  const manualLabels: [string, string][] = [
    ["s1_fit", "I can describe my best-fit user"],
    ["s1_change", "I made or scheduled a change"],
    ["s2_read", "I read the survey answers and know what to fix"],
  ];
  return [
    activity(
      "idea",
      "Idea and audience brief",
      [
        section("idea.brief", "Current idea", [
          ["Name", p.name],
          ["What it does", p.description],
          ["Audience", p.audience],
          ["Problem", p.problem],
          ["Owner-supplied URL (not verified)", p.link],
          ["Current stage", p.stage],
        ]),
      ],
      { updatedAt: p.updated_at, kind: "Idea brief" },
    ),
    {
      ...activity(
        "questions",
        "Interview preparation questions",
        [
          section("questions.list", "Questions to review", [
            ["Questions", list(p.questions)],
            ["AI source", originNote(p.questions_origin_id)],
          ]),
        ],
        { updatedAt: p.updated_at, kind: "Question preparation" },
      ),
      originId: p.questions_origin_id,
    },
    {
      ...activity(
        "survey",
        "Feedback survey draft",
        [
          section("survey.list", "Survey questions - unsent", [
            ["Questions", list(p.survey)],
            ["AI source", originNote(p.survey_origin_id)],
            ["Collection status", "This app does not collect survey responses automatically."],
          ]),
        ],
        { updatedAt: p.updated_at, kind: "Feedback survey" },
      ),
      originId: p.survey_origin_id,
    },
    activity(
      "checklist",
      "Stage checklist and learning limits",
      [
        section("checklist.manual", "Manual checklist records", [
          ["Current stage", p.stage],
          ...manualLabels.map(([key, label]): [string, ExportValue] => [
            label,
            typeof checklist[key] === "boolean" ? (checklist[key] as boolean) : null,
          ]),
          [
            "Interpretation",
            "These are self-reported ticks, not evidence of demand. Computed interview, accepted-summary and experiment checks are derived from their source activities; missing ticks remain unknown.",
          ],
        ]),
      ],
      { updatedAt: p.updated_at, kind: "Stage reflection" },
    ),
    activity(
      "metrics",
      "Next 100 manual counts",
      [
        section("metrics.counts", "Manually recorded counts", [
          ["Sign-ups", scalar(metrics["signups"])],
          ["Active", scalar(metrics["active"])],
          ["Returning", scalar(metrics["returning"])],
          [
            "Scope and limits",
            "The legacy count fields do not store a cohort, date window or denominator. No rates are inferred; missing values remain unknown, not zero.",
          ],
        ]),
      ],
      { updatedAt: p.updated_at, kind: "Manual metrics" },
    ),
  ];
}

export function contactActivities(
  p: Pick<Project, "id" | "user_id">,
  contacts: Contact[],
): ActivityOffer[] {
  assertOwnedRows(p, contacts);
  return contacts.map((c, index) =>
    activity(
      `contact.${c.id}`,
      `Person ${index + 1} - Stage ${c.stage}`,
      [
        section(`contact.${c.id}.details`, "Relevance and manually recorded status", [
          ["First name / alias", c.first_name],
          ["Relationship", c.relation],
          ["Why relevant", c.why],
          ["Source", c.source],
          ["Status (self-reported)", c.status],
          ["Stage", c.stage],
          ["Created", c.created_at],
          [
            "Limits",
            "Knowing the founder does not establish fit. A pipeline status is not independently verified use or payment.",
          ],
        ]),
      ],
      { kind: "Contact and relevance" },
    ),
  );
}

export function contactDraftActivity(
  draft: { first_name: string; relation: string; why: string },
  stage: number,
) {
  return activity(
    "contact-draft",
    "New person - unsaved draft",
    [
      section("contact-draft.details", "Current form", [
        ["First name / alias", draft.first_name],
        ["Relationship", draft.relation],
        ["Why relevant", draft.why],
        ["Stage", stage],
        ["Save state", "Not yet added to the contact list"],
      ]),
    ],
    { kind: "Contact preparation" },
  );
}

export function interviewDraftActivity(
  _p: Pick<Project, "id" | "user_id">,
  draft: {
    questions: string[];
    answers: Answer[];
    tags: string[];
    contactAlias?: string;
    noteTakingPermission?: boolean;
    consentChoices?: ConsentChoices;
  },
) {
  return activity(
    "interview-draft",
    "Interview in progress - unsaved",
    [
      section("interview-draft.context", "Draft status and permission", [
        ["Participant alias", draft.contactAlias ?? null],
        ["Questions", draft.questions.join("\n")],
        ["Tags (self-reported)", draft.tags.join("\n")],
        ["Permission to take notes (local checkbox)", draft.noteTakingPermission ?? null],
        ["Note-taking choice (owner reported)", draft.consentChoices?.noteStatus ?? null],
        ["AI-processing choice (owner reported)", draft.consentChoices?.aiStatus ?? null],
        ["Sharing choice (owner reported)", draft.consentChoices?.sharingStatus ?? null],
        [
          "Permission limits",
          "These are current self-reported choices, not independently verified consent or an access grant. Note-taking permission does not establish permission for AI, sharing or publication. This draft is not marked complete or saved by exporting.",
        ],
      ]),
      ...draft.answers.map((answer, i) =>
        section(`interview-draft.answer.${i}`, `Question ${i + 1}`, [
          ["Question", answer.q],
          ["Observation / note", answer.note],
          ["Quoted words (verify against source)", answer.quote],
        ]),
      ),
    ],
    { kind: "Interview draft" },
  );
}

export function interviewActivities(
  p: Pick<Project, "id" | "user_id">,
  interviews: Interview[],
): ActivityOffer[] {
  assertOwnedRows(p, interviews);
  return interviews.map((iv, index) => {
    const answers = Array.isArray(iv.answers) ? iv.answers : [];
    const key = `interview.${iv.id}`;
    return activity(
      key,
      `Interview ${index + 1}`,
      [
        section(`${key}.context`, "Recorded interview", [
          ["Completed (owner recorded)", iv.completed],
          ["Created", iv.created_at],
          ["Tags (self-reported)", iv.tags.join("\n")],
          ["Participant", "Contact identity omitted by default"],
          [
            "Consent record",
            "Permission choices, when recorded, are stored separately. Completion or this export does not establish note-taking, AI or sharing permission; historical absence is unknown.",
          ],
          [
            "Legacy format",
            Array.isArray(iv.answers)
              ? "Question / note / quote fields below"
              : "Unrecognized answer format; review source before using this export",
          ],
        ]),
        ...answers.map((answer, i) => {
          const a = record(answer);
          return section(`${key}.answer.${i}`, `Question ${i + 1}`, [
            ["Question", scalar(a["q"])],
            ["Observation / note", scalar(a["note"])],
            ["Quoted words (verify against source)", scalar(a["quote"])],
          ]);
        }),
      ],
      { kind: "Interview record" },
    );
  });
}

export function learningActivities(
  p: Pick<Project, "id" | "user_id">,
  learnings: Learning[],
): ActivityOffer[] {
  assertOwnedRows(p, learnings);
  return learnings.map((l, index) => {
    const key = `learning.${l.id}`,
      data = record(l.data);
    const sections = [
      section(`${key}.context`, "Learning record", [
        ["Title", l.title],
        ["Body", l.body],
        ["Kind", l.kind],
        ["Stage", l.stage],
        ["Accepted by owner", l.accepted],
        ["Created", l.created_at],
        ["AI source", originNote(l.generation_origin_id)],
      ]),
    ];
    if (l.kind === "synthesis") {
      sections.push(
        section(`${key}.patterns`, "Reviewed interpretation", [
          ["Problems", list(data["problems"])],
          ["Objections", list(data["objections"])],
          ["Best fit", list(data["best_fit"])],
          ["Quoted words - check original notes", list(data["quotes"])],
        ]),
      );
      const changes = Array.isArray(data["changes"]) ? data["changes"] : [];
      changes.forEach((change, i) => {
        const c = record(change);
        sections.push(
          section(`${key}.change.${i}`, `Suggested change ${i + 1}`, [
            ["Title", scalar(c["title"])],
            ["Reason and next step", scalar(c["body"])],
          ]),
        );
      });
    }
    return {
      ...activity(
        key,
        `${l.kind === "synthesis" ? "Synthesis" : "Learning"} ${index + 1}`,
        sections,
        {
          kind: l.kind === "synthesis" ? "Interview synthesis" : "Learning",
          status: l.accepted ? "reviewed" : "draft",
        },
      ),
      originId: l.generation_origin_id,
    };
  });
}

export function experimentActivities(
  p: Pick<Project, "id" | "user_id">,
  experiments: Experiment[],
): ActivityOffer[] {
  assertOwnedRows(p, experiments);
  return experiments.map((e, index) =>
    experimentDraftActivity(
      { hypothesis: e.hypothesis, change: e.change, result: e.result },
      e.stage,
      `experiment.${e.id}`,
      `Experiment ${index + 1}`,
      e.created_at,
    ),
  );
}
export function experimentDraftActivity(
  draft: Pick<Experiment, "hypothesis" | "change" | "result">,
  stage: number,
  key = "experiment-draft",
  title = "New experiment - unsaved",
  createdAt: string | null = null,
) {
  return activity(
    key,
    title,
    [
      section(`${key}.details`, "Hypothesis, action and observed result", [
        ["Hypothesis", draft.hypothesis],
        ["Change to test", draft.change],
        ["Result", draft.result],
        ["Stage", stage],
        ["Created", createdAt],
        [
          "Limits",
          "An empty result does not mean the test failed or ran. Records are manually reported, not verified outcomes.",
        ],
      ]),
    ],
    { kind: "Experiment" },
  );
}

export function outreachActivities(
  p: Pick<Project, "id" | "user_id">,
  outreach: Outreach[],
): ActivityOffer[] {
  assertOwnedRows(p, outreach);
  return outreach.map((o, index) => ({
    ...activity(
      `outreach.${o.id}`,
      `${o.kind === "channel" ? "Channel to investigate" : o.kind === "referral" ? "Referral request" : o.kind === "onboarding" ? "Onboarding question" : "Outreach message"} ${index + 1} - Stage ${o.stage}`,
      [
        section(`outreach.${o.id}.draft`, "Current unsent draft", [
          ["Title", o.title],
          ["Body", o.body],
          ["Kind", o.kind],
          ["Stage", o.stage],
          ["Created", o.created_at],
          ["AI source", originNote(o.generation_origin_id)],
          ["Status", "Draft only; channel access, claims and sending are not verified."],
        ]),
      ],
      { kind: "Outreach draft" },
    ),
    originId: o.generation_origin_id,
  }));
}

export function ownerPortfolioActivities(input: {
  project: ExportProject;
  contacts: Contact[];
  interviews: Interview[];
  learnings: Learning[];
  experiments: Experiment[];
  outreach: Outreach[];
}): ActivityOffer[] {
  const offers = [
    ...projectActivities(input.project),
    ...contactActivities(input.project, input.contacts),
    ...interviewActivities(input.project, input.interviews),
    ...learningActivities(input.project, input.learnings),
    ...experimentActivities(input.project, input.experiments),
    ...outreachActivities(input.project, input.outreach),
  ];
  const checklist = offers.find((o) => o.activity.key === "checklist")!;
  checklist.activity.sections.push(
    section("checklist.computed", "Computed from this saved source selection", [
      ["Completed interview records", input.interviews.filter((i) => i.completed).length],
      [
        "Accepted synthesis exists",
        input.learnings.some((l) => l.kind === "synthesis" && l.accepted),
      ],
      ["Stage 1 experiment exists", input.experiments.some((e) => e.stage === 1)],
      ["Stage 2 experiment exists", input.experiments.some((e) => e.stage === 2)],
      [
        "Stage 2 contacts marked tried / active / paying",
        input.contacts.filter(
          (c) => c.stage === 2 && ["tried", "active", "paying"].includes(c.status),
        ).length,
      ],
      [
        "Survey questions recorded",
        Array.isArray(input.project.survey) ? input.project.survey.length : null,
      ],
      [
        "Limits",
        "These are application record counts and manual status checks, not verified people, customer demand or learning outcomes.",
      ],
    ]),
  );
  return markProjectOffers(input.project, offers);
}
