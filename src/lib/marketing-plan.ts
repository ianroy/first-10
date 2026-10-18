import { z } from "zod";

export type AiOrigin = {
  requestId: string;
  kind: "marketing_channels" | "marketing_content";
  promptVersion: string;
  modelId: string;
  planRevision: number;
};

export type StudentBoard = {
  columns: Array<{ id: string; title: string }>;
  notes: Array<{ id: string; columnId: string | null; text: string }>;
  audience: string;
  usefulAction: string;
  channelIdeas: Array<string>;
  completedAt: string | null;
};

export type MarketingSource = {
  id: string;
  label: string;
  text: string;
  kind: "owner_observation" | "interview" | "accepted_learning" | "external_observation";
  recordId: string | null;
  url: string | null;
  observedOn: string | null;
};

export type MarketingChannel = {
  id: string;
  name: string;
  medium: "physical" | "digital";
  place: string | null;
  url: string | null;
  sourceIds: Array<string>;
  observation: string;
  fitReason: string;
  access: {
    state: "unknown" | "needs_permission" | "requested" | "allowed" | "not_required" | "denied";
    rulesNote: string;
    rulesSourceId: string | null;
    checkedOn: string | null;
    nextQuestion: string;
  };
  estimatedMinutes: number | null;
  resourcesNeeded: Array<string>;
  unknowns: Array<string>;
  origin: "student" | "ai_proposal";
  aiOrigin: AiOrigin | null;
};

export type MarketingAsset = {
  id: string;
  channelId: string;
  format: "community_post" | "organizer_email" | "dm" | "social_caption" | "flyer" | "demo_script";
  ownHook: string;
  truthfulSupport: string;
  supportSourceIds: Array<string>;
  body: string;
  builderDisclosure: string;
  cta: string;
  destinationUrl: string | null;
  firstUsefulAction: string;
  aiOrigin: AiOrigin | null;
  review: {
    truthful: boolean;
    disclosedBuilder: boolean;
    accessChecked: boolean;
    destinationChecked: boolean;
    checkedAt: string | null;
  };
  walkthrough: {
    mode: "peer" | "self" | null;
    understoodAudience: string;
    actionObserved: string;
    hesitation: string;
    revisionMade: string;
    checkedOn: string | null;
  };
};

export type MarketingTask = {
  id: string;
  channelId: string | null;
  assetId: string | null;
  kind:
    | "investigate"
    | "permission"
    | "make"
    | "peer_check"
    | "manual_outreach"
    | "observe"
    | "reflect";
  title: string;
  ownerLabel: string;
  dueOn: string | null;
  dependsOn: Array<string>;
  doneMeans: string;
  estimatedMinutes: number | null;
  status: "todo" | "doing" | "done" | "blocked";
  completionNote: string;
};

export type MarketingMeasurement = {
  id: string;
  channelId: string;
  assetId: string | null;
  metric: "relevant_reach" | "visits" | "useful_action" | "return" | "referral";
  cohort: "peer_test" | "classmate" | "external" | "automated" | "mixed_unknown";
  from: string;
  to: string;
  unit: "unique_people" | "sessions" | "events";
  count: number | null;
  source: string;
  sourceUrl: string | null;
  recordedOn: string;
  limitations: string;
};

export type MarketingRate = {
  id: string;
  numeratorId: string;
  denominatorId: string;
  label: string;
  subsetConfirmed: boolean;
};

export type MarketingPlanV1 = {
  schemaVersion: 1;
  studentFirst: StudentBoard;
  audience: {
    beachhead: string;
    situation: string;
    usefulAction: string;
    valueProposition: string;
    sourceIds: Array<string>;
    assumptions: Array<string>;
    unknowns: Array<string>;
  };
  sources: Array<MarketingSource>;
  channels: Array<MarketingChannel>;
  selection: { primaryId: string | null; alternativeId: string | null; reason: string };
  assets: Array<MarketingAsset>;
  resources: {
    cashBudgetCents: 0;
    availableMinutes: number | null;
    existingResources: Array<string>;
    limitations: Array<string>;
    aiUse: "manual_only" | "existing_allowance";
    fallback: string;
  };
  test: {
    state: "draft" | "ready_to_review" | "running" | "reviewed";
    startOn: string | null;
    endOn: string | null;
    reviewOn: string | null;
    startedAt: string | null;
    primaryMetric: "relevant_reach" | "visits" | "useful_action" | "return" | "referral";
    baselineMeasurementId: string | null;
    target: number | null;
    unknownBaselineOrTarget: string;
    measurementPlan: string;
    repeatIf: string;
    reviseIf: string;
    stopIf: string;
    tasks: Array<MarketingTask>;
  };
  measurements: Array<MarketingMeasurement>;
  rates: Array<MarketingRate>;
  reflection: {
    decision: "repeat" | "revise" | "stop" | null;
    evidenceIds: Array<string>;
    learned: string;
    uncertainty: string;
    nextAction: string;
    reviewedOn: string | null;
  };
};

export const MARKETING_SHAPE = {
  AiOrigin: {
    type: "object",
    properties: {
      requestId: { type: "string", maxLength: 36, format: "uuid" },
      kind: { type: "string", enum: ["marketing_channels", "marketing_content"] },
      promptVersion: { type: "string", maxLength: 500 },
      modelId: { type: "string", maxLength: 500 },
      planRevision: { type: "integer", minimum: 1, maximum: 9007199254740991 },
    },
  },
  StudentBoard: {
    type: "object",
    properties: {
      columns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", maxLength: 36, format: "uuid" },
            title: { type: "string", maxLength: 120 },
          },
        },
        maxItems: 8,
      },
      notes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", maxLength: 36, format: "uuid" },
            columnId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
            text: { type: "string", maxLength: 1000 },
          },
        },
        maxItems: 24,
      },
      audience: { type: "string", maxLength: 500 },
      usefulAction: { type: "string", maxLength: 500 },
      channelIdeas: { type: "array", items: { type: "string", maxLength: 300 }, maxItems: 8 },
      completedAt: { type: "string", maxLength: 35, format: "instant", nullable: true },
    },
  },
  MarketingSource: {
    type: "object",
    properties: {
      id: { type: "string", maxLength: 36, format: "uuid" },
      label: { type: "string", maxLength: 120 },
      text: { type: "string", maxLength: 1000 },
      kind: {
        type: "string",
        enum: ["owner_observation", "interview", "accepted_learning", "external_observation"],
      },
      recordId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
      url: { type: "string", maxLength: 2048, format: "url", nullable: true },
      observedOn: { type: "string", maxLength: 10, format: "day", nullable: true },
    },
  },
  MarketingChannel: {
    type: "object",
    properties: {
      id: { type: "string", maxLength: 36, format: "uuid" },
      name: { type: "string", maxLength: 120 },
      medium: { type: "string", enum: ["physical", "digital"] },
      place: { type: "string", maxLength: 500, nullable: true },
      url: { type: "string", maxLength: 2048, format: "url", nullable: true },
      sourceIds: {
        type: "array",
        items: { type: "string", maxLength: 36, format: "uuid" },
        maxItems: 20,
      },
      observation: { type: "string", maxLength: 1000 },
      fitReason: { type: "string", maxLength: 1000 },
      access: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: ["unknown", "needs_permission", "requested", "allowed", "not_required", "denied"],
          },
          rulesNote: { type: "string", maxLength: 1000 },
          rulesSourceId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
          checkedOn: { type: "string", maxLength: 10, format: "day", nullable: true },
          nextQuestion: { type: "string", maxLength: 500 },
        },
      },
      estimatedMinutes: { type: "integer", minimum: 0, maximum: 10080, nullable: true },
      resourcesNeeded: { type: "array", items: { type: "string", maxLength: 300 }, maxItems: 8 },
      unknowns: { type: "array", items: { type: "string", maxLength: 300 }, maxItems: 8 },
      origin: { type: "string", enum: ["student", "ai_proposal"] },
      aiOrigin: { ref: "AiOrigin", nullable: true },
    },
  },
  MarketingAsset: {
    type: "object",
    properties: {
      id: { type: "string", maxLength: 36, format: "uuid" },
      channelId: { type: "string", maxLength: 36, format: "uuid" },
      format: {
        type: "string",
        enum: ["community_post", "organizer_email", "dm", "social_caption", "flyer", "demo_script"],
      },
      ownHook: { type: "string", maxLength: 500 },
      truthfulSupport: { type: "string", maxLength: 1000 },
      supportSourceIds: {
        type: "array",
        items: { type: "string", maxLength: 36, format: "uuid" },
        maxItems: 20,
      },
      body: { type: "string", maxLength: 4000 },
      builderDisclosure: { type: "string", maxLength: 500 },
      cta: { type: "string", maxLength: 500 },
      destinationUrl: { type: "string", maxLength: 2048, format: "url", nullable: true },
      firstUsefulAction: { type: "string", maxLength: 500 },
      aiOrigin: { ref: "AiOrigin", nullable: true },
      review: {
        type: "object",
        properties: {
          truthful: { type: "boolean" },
          disclosedBuilder: { type: "boolean" },
          accessChecked: { type: "boolean" },
          destinationChecked: { type: "boolean" },
          checkedAt: { type: "string", maxLength: 35, format: "instant", nullable: true },
        },
      },
      walkthrough: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["peer", "self"], nullable: true },
          understoodAudience: { type: "string", maxLength: 500 },
          actionObserved: { type: "string", maxLength: 500 },
          hesitation: { type: "string", maxLength: 500 },
          revisionMade: { type: "string", maxLength: 500 },
          checkedOn: { type: "string", maxLength: 10, format: "day", nullable: true },
        },
      },
    },
  },
  MarketingTask: {
    type: "object",
    properties: {
      id: { type: "string", maxLength: 36, format: "uuid" },
      channelId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
      assetId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
      kind: {
        type: "string",
        enum: [
          "investigate",
          "permission",
          "make",
          "peer_check",
          "manual_outreach",
          "observe",
          "reflect",
        ],
      },
      title: { type: "string", maxLength: 120 },
      ownerLabel: { type: "string", maxLength: 120 },
      dueOn: { type: "string", maxLength: 10, format: "day", nullable: true },
      dependsOn: {
        type: "array",
        items: { type: "string", maxLength: 36, format: "uuid" },
        maxItems: 20,
      },
      doneMeans: { type: "string", maxLength: 500 },
      estimatedMinutes: { type: "integer", minimum: 0, maximum: 10080, nullable: true },
      status: { type: "string", enum: ["todo", "doing", "done", "blocked"] },
      completionNote: { type: "string", maxLength: 500 },
    },
  },
  MarketingMeasurement: {
    type: "object",
    properties: {
      id: { type: "string", maxLength: 36, format: "uuid" },
      channelId: { type: "string", maxLength: 36, format: "uuid" },
      assetId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
      metric: {
        type: "string",
        enum: ["relevant_reach", "visits", "useful_action", "return", "referral"],
      },
      cohort: {
        type: "string",
        enum: ["peer_test", "classmate", "external", "automated", "mixed_unknown"],
      },
      from: { type: "string", maxLength: 10, format: "day" },
      to: { type: "string", maxLength: 10, format: "day" },
      unit: { type: "string", enum: ["unique_people", "sessions", "events"] },
      count: { type: "integer", minimum: 0, maximum: 1000000000, nullable: true },
      source: { type: "string", maxLength: 1000 },
      sourceUrl: { type: "string", maxLength: 2048, format: "url", nullable: true },
      recordedOn: { type: "string", maxLength: 10, format: "day" },
      limitations: { type: "string", maxLength: 1000 },
    },
  },
  MarketingRate: {
    type: "object",
    properties: {
      id: { type: "string", maxLength: 36, format: "uuid" },
      numeratorId: { type: "string", maxLength: 36, format: "uuid" },
      denominatorId: { type: "string", maxLength: 36, format: "uuid" },
      label: { type: "string", maxLength: 120 },
      subsetConfirmed: { type: "boolean" },
    },
  },
  MarketingPlanV1: {
    type: "object",
    properties: {
      schemaVersion: { type: "integer", const: 1 },
      studentFirst: { ref: "StudentBoard" },
      audience: {
        type: "object",
        properties: {
          beachhead: { type: "string", maxLength: 500 },
          situation: { type: "string", maxLength: 500 },
          usefulAction: { type: "string", maxLength: 500 },
          valueProposition: { type: "string", maxLength: 500 },
          sourceIds: {
            type: "array",
            items: { type: "string", maxLength: 36, format: "uuid" },
            maxItems: 20,
          },
          assumptions: { type: "array", items: { type: "string", maxLength: 300 }, maxItems: 8 },
          unknowns: { type: "array", items: { type: "string", maxLength: 300 }, maxItems: 8 },
        },
      },
      sources: { type: "array", items: { ref: "MarketingSource" }, maxItems: 20 },
      channels: { type: "array", items: { ref: "MarketingChannel" }, maxItems: 12 },
      selection: {
        type: "object",
        properties: {
          primaryId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
          alternativeId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
          reason: { type: "string", maxLength: 500 },
        },
      },
      assets: { type: "array", items: { ref: "MarketingAsset" }, maxItems: 10 },
      resources: {
        type: "object",
        properties: {
          cashBudgetCents: { type: "integer", const: 0 },
          availableMinutes: { type: "integer", minimum: 0, maximum: 10080, nullable: true },
          existingResources: {
            type: "array",
            items: { type: "string", maxLength: 300 },
            maxItems: 8,
          },
          limitations: { type: "array", items: { type: "string", maxLength: 300 }, maxItems: 8 },
          aiUse: { type: "string", enum: ["manual_only", "existing_allowance"] },
          fallback: { type: "string", maxLength: 500 },
        },
      },
      test: {
        type: "object",
        properties: {
          state: { type: "string", enum: ["draft", "ready_to_review", "running", "reviewed"] },
          startOn: { type: "string", maxLength: 10, format: "day", nullable: true },
          endOn: { type: "string", maxLength: 10, format: "day", nullable: true },
          reviewOn: { type: "string", maxLength: 10, format: "day", nullable: true },
          startedAt: { type: "string", maxLength: 35, format: "instant", nullable: true },
          primaryMetric: {
            type: "string",
            enum: ["relevant_reach", "visits", "useful_action", "return", "referral"],
          },
          baselineMeasurementId: { type: "string", maxLength: 36, format: "uuid", nullable: true },
          target: { type: "integer", minimum: 0, maximum: 1000000000, nullable: true },
          unknownBaselineOrTarget: { type: "string", maxLength: 500 },
          measurementPlan: { type: "string", maxLength: 500 },
          repeatIf: { type: "string", maxLength: 500 },
          reviseIf: { type: "string", maxLength: 500 },
          stopIf: { type: "string", maxLength: 500 },
          tasks: { type: "array", items: { ref: "MarketingTask" }, maxItems: 24 },
        },
      },
      measurements: { type: "array", items: { ref: "MarketingMeasurement" }, maxItems: 80 },
      rates: { type: "array", items: { ref: "MarketingRate" }, maxItems: 10 },
      reflection: {
        type: "object",
        properties: {
          decision: { type: "string", enum: ["repeat", "revise", "stop"], nullable: true },
          evidenceIds: {
            type: "array",
            items: { type: "string", maxLength: 36, format: "uuid" },
            maxItems: 20,
          },
          learned: { type: "string", maxLength: 500 },
          uncertainty: { type: "string", maxLength: 500 },
          nextAction: { type: "string", maxLength: 500 },
          reviewedOn: { type: "string", maxLength: 10, format: "day", nullable: true },
        },
      },
    },
  },
} as const;

export const MARKETING_LIMITS = {
  requestBytes: 262_144,
  clientDocumentBytes: 122_880,
  storedDocumentBytes: 131_072,
  historyEntries: 3,
} as const;
type Shape = {
  ref?: string;
  type?: string;
  nullable?: boolean;
  const?: number;
  enum?: readonly string[];
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  format?: string;
  properties?: Readonly<Record<string, Shape>>;
  items?: Shape;
  maxItems?: number;
};
const shapes: Readonly<Record<string, Shape>> = MARKETING_SHAPE;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const marketingIdSchema = z
  .string()
  .trim()
  .regex(uuidPattern)
  .transform((value) => value.toLowerCase());

export function jsonBytes(value: unknown): number {
  try {
    const text = JSON.stringify(value);
    return typeof text === "string" ? new TextEncoder().encode(text).byteLength : Infinity;
  } catch {
    return Infinity;
  }
}
export function isCalendarDay(value: string): boolean {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function isUtcInstant(value: string): boolean {
  return (
    /^(?!0000)\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/.test(value) &&
    isCalendarDay(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}

function hasUnsafeUrlCharacters(value: string): boolean {
  return Array.from(value).some(
    (character) =>
      character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127 || character === "\\",
  );
}

export function isPublicMarketingUrl(value: string): boolean {
  if (hasUnsafeUrlCharacters(value)) return false;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!host || host === "localhost" || /\.(localhost|local|internal|lan|home)$/.test(host))
      return false;
    if (host.startsWith("[")) {
      // Restrict literal IPv6 to the global-unicast allocation, excluding reserved
      // documentation space. No network request or DNS assertion is made.
      return /^[23][0-9a-f]{0,3}:/.test(host.slice(1)) && !host.startsWith("[2001:db8:");
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a = 0, b = 0] = host.split(".").map(Number);
      return (
        a !== 0 &&
        a !== 10 &&
        a !== 127 &&
        a < 224 &&
        !(a === 169 && b === 254) &&
        !(a === 172 && b >= 16 && b <= 31) &&
        !(a === 192 && (b === 168 || b === 0)) &&
        !(a === 100 && b >= 64 && b <= 127) &&
        !(a === 198 && (b === 18 || b === 19))
      );
    }
    return (
      host.includes(".") &&
      !/^[\d.]+$/.test(host) &&
      !host.split(".").some((label) => !label || label.startsWith("-") || label.endsWith("-"))
    );
  } catch {
    return false;
  }
}

function schemaFor(shape: Shape): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  if (shape.ref) schema = schemaFor(shapes[shape.ref]!);
  else if (shape.const !== undefined) schema = z.literal(shape.const);
  else if (shape.type === "object")
    schema = z
      .object(
        Object.fromEntries(
          Object.entries(shape.properties ?? {}).map(([key, child]) => [key, schemaFor(child)]),
        ),
      )
      .strict();
  else if (shape.type === "array") schema = z.array(schemaFor(shape.items!)).max(shape.maxItems!);
  else if (shape.type === "boolean") schema = z.boolean();
  else if (shape.type === "integer")
    schema = z
      .number()
      .int()
      .min(shape.minimum ?? 0)
      .max(shape.maximum ?? Number.MAX_SAFE_INTEGER);
  else {
    schema = z
      .string()
      .superRefine((value, context) => {
        if (shape.format === "url" && hasUnsafeUrlCharacters(value))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Use a public HTTP(S) URL without credentials or control characters.",
          });
      })
      .transform((value) => value.trim())
      .superRefine((value, context) => {
        const invalid =
          (shape.maxLength !== undefined && Array.from(value).length > shape.maxLength) ||
          (shape.enum && !shape.enum.includes(value)) ||
          (shape.format === "uuid" && !uuidPattern.test(value)) ||
          (shape.format === "day" && !isCalendarDay(value)) ||
          (shape.format === "instant" && !isUtcInstant(value)) ||
          (shape.format === "url" && !isPublicMarketingUrl(value));
        if (invalid)
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid field format or length.",
          });
      })
      .transform((value) =>
        shape.format === "uuid"
          ? value.toLowerCase()
          : shape.format === "url" && isPublicMarketingUrl(value)
            ? new URL(value).href
            : value,
      );
  }
  return shape.nullable ? schema.nullable() : schema;
}

function refinePlan(plan: MarketingPlanV1, context: z.RefinementCtx) {
  const fail = (message: string, path: (string | number)[] = []) =>
    context.addIssue({ code: z.ZodIssueCode.custom, message, path });
  const collections = [
    plan.studentFirst.columns,
    plan.studentFirst.notes,
    plan.sources,
    plan.channels,
    plan.assets,
    plan.test.tasks,
    plan.measurements,
    plan.rates,
  ];
  for (const collection of collections)
    if (new Set(collection.map((item) => item.id)).size !== collection.length)
      fail("Entity ids must be unique within their collection.");
  const columns = new Set(plan.studentFirst.columns.map((item) => item.id));
  const sources = new Set(plan.sources.map((item) => item.id));
  const channels = new Map(plan.channels.map((item) => [item.id, item]));
  const assets = new Map(plan.assets.map((item) => [item.id, item]));
  const tasks = new Map(plan.test.tasks.map((item) => [item.id, item]));
  const measurements = new Map(plan.measurements.map((item) => [item.id, item]));
  const refs = (ids: string[], allowed: { has: (id: string) => boolean }) => {
    if (new Set(ids).size !== ids.length || ids.some((id) => !allowed.has(id)))
      fail("References must exist and must not be duplicated.");
  };
  for (const note of plan.studentFirst.notes)
    if (note.columnId && !columns.has(note.columnId)) fail("A note references a missing column.");
  for (const source of plan.sources)
    if (["interview", "accepted_learning"].includes(source.kind) !== (source.recordId !== null))
      fail("Database source kinds require a record id; other sources cannot carry one.");
  refs(plan.audience.sourceIds, sources);
  for (const channel of plan.channels) {
    refs(channel.sourceIds, sources);
    if (channel.access.rulesSourceId && !sources.has(channel.access.rulesSourceId))
      fail("Missing rules source.");
    if (
      ["allowed", "not_required"].includes(channel.access.state) &&
      (!channel.access.checkedOn || (!channel.access.rulesNote && !channel.access.rulesSourceId))
    )
      fail("Access checks need a date and recorded basis.");
    if ((channel.origin === "ai_proposal") !== (channel.aiOrigin !== null))
      fail("AI proposals need trusted provenance; manual channels must not claim it.");
  }
  for (const id of [plan.selection.primaryId, plan.selection.alternativeId])
    if (id && !channels.has(id)) fail("Selected channel is missing.");
  if (plan.selection.primaryId && plan.selection.primaryId === plan.selection.alternativeId)
    fail("Choose distinct primary and alternative channels.");
  for (const asset of plan.assets) {
    if (!channels.has(asset.channelId)) fail("Asset channel is missing.");
    refs(asset.supportSourceIds, sources);
  }
  for (const task of plan.test.tasks) {
    if (task.channelId && !channels.has(task.channelId)) fail("Task channel is missing.");
    if (task.assetId && assets.get(task.assetId)?.channelId !== task.channelId)
      fail("Task asset and channel must match.");
    refs(task.dependsOn, tasks);
    if (task.dependsOn.includes(task.id)) fail("A task cannot depend on itself.");
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const dependency of tasks.get(id)?.dependsOn ?? []) if (!visit(dependency)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  if (plan.test.tasks.some((task) => !visit(task.id))) fail("Task dependencies must be acyclic.");
  for (const measurement of plan.measurements) {
    if (!channels.has(measurement.channelId)) fail("Measurement channel is missing.");
    if (measurement.assetId && assets.get(measurement.assetId)?.channelId !== measurement.channelId)
      fail("Measurement asset and channel must match.");
    if (measurement.from > measurement.to) fail("Measurement dates are reversed.");
  }
  for (const rate of plan.rates)
    if (
      rate.numeratorId === rate.denominatorId ||
      !measurements.has(rate.numeratorId) ||
      !measurements.has(rate.denominatorId)
    )
      fail("Rate references must identify two existing measurements.");
  refs(plan.reflection.evidenceIds, measurements);
  if (
    plan.test.baselineMeasurementId &&
    measurements.get(plan.test.baselineMeasurementId)?.metric !== plan.test.primaryMetric
  )
    fail("Baseline must measure the primary metric.");
  if (
    plan.test.target !== null &&
    plan.test.primaryMetric === "useful_action" &&
    !plan.audience.usefulAction
  )
    fail("Define the useful action before setting a target.");
  if (
    plan.test.startOn &&
    plan.test.endOn &&
    Date.parse(`${plan.test.endOn}T00:00:00Z`) - Date.parse(`${plan.test.startOn}T00:00:00Z`) !==
      6 * 86_400_000
  )
    fail("The test must span seven inclusive calendar days.");
  if (plan.test.endOn && plan.test.reviewOn && plan.test.reviewOn < plan.test.endOn)
    fail("Review date must follow the test window.");
  if (plan.studentFirst.completedAt && !canCompleteStudentFirst(plan.studentFirst))
    fail("Completed first thinking needs a note, audience, useful action and channel idea.");
  if (plan.test.state !== "draft") {
    const primaryAsset = plan.assets.find(
      (asset) =>
        asset.channelId === plan.selection.primaryId &&
        asset.body &&
        asset.cta &&
        asset.firstUsefulAction,
    );
    if (
      !plan.studentFirst.completedAt ||
      !plan.audience.beachhead ||
      !plan.audience.usefulAction ||
      !plan.selection.primaryId ||
      !plan.selection.alternativeId ||
      !primaryAsset ||
      plan.resources.availableMinutes === null ||
      !plan.resources.fallback ||
      !plan.test.startOn ||
      !plan.test.endOn ||
      !plan.test.reviewOn ||
      !plan.test.measurementPlan ||
      !plan.test.repeatIf ||
      !plan.test.reviseIf ||
      !plan.test.stopIf ||
      !plan.test.tasks.some((task) => task.title && task.ownerLabel && task.doneMeans) ||
      !plan.audience.unknowns.some(Boolean) ||
      ((plan.test.baselineMeasurementId === null || plan.test.target === null) &&
        !plan.test.unknownBaselineOrTarget)
    )
      fail("Complete the review-ready plan or keep it as a draft.");
    if (plan.test.state === "running") {
      const access = channels.get(plan.selection.primaryId ?? "")?.access;
      const launchAsset = plan.assets.some(
        (asset) =>
          asset.channelId === plan.selection.primaryId &&
          asset.body &&
          asset.cta &&
          asset.firstUsefulAction &&
          asset.review.truthful &&
          asset.review.disclosedBuilder &&
          asset.review.accessChecked &&
          asset.review.destinationChecked &&
          asset.review.checkedAt &&
          asset.walkthrough.mode &&
          asset.walkthrough.checkedOn &&
          asset.walkthrough.understoodAudience &&
          asset.walkthrough.actionObserved,
      );
      if (
        !plan.test.startedAt ||
        !launchAsset ||
        !access ||
        !["allowed", "not_required"].includes(access.state) ||
        !plan.test.tasks.some(
          (task) =>
            ["todo", "doing"].includes(task.status) &&
            task.title &&
            task.ownerLabel &&
            task.doneMeans &&
            task.dueOn,
        )
      )
        fail(
          "Running needs a reviewed asset, permission basis, walkthrough, manual start time and next task.",
        );
    }
    if (
      plan.test.state === "reviewed" &&
      (!plan.reflection.decision ||
        !plan.reflection.learned ||
        !plan.reflection.uncertainty ||
        !plan.reflection.nextAction ||
        !plan.reflection.reviewedOn)
    )
      fail("A reviewed plan needs a reflection, even with no participants.");
  }
}

export function canCompleteStudentFirst(board: StudentBoard): boolean {
  return (
    board.notes.some((note) => Boolean(note.text.trim())) &&
    Boolean(board.audience.trim()) &&
    Boolean(board.usefulAction.trim()) &&
    board.channelIdeas.some((idea) => Boolean(idea.trim()))
  );
}
export const marketingPlanSchema = (
  schemaFor(shapes["MarketingPlanV1"]!) as z.ZodType<MarketingPlanV1>
).superRefine(refinePlan);

function emptyValue(shape: Shape): unknown {
  if (shape.nullable) return null;
  if (shape.ref) return emptyValue(shapes[shape.ref]!);
  if (shape.const !== undefined) return shape.const;
  if (shape.enum) return shape.enum[0];
  if (shape.type === "object")
    return Object.fromEntries(
      Object.entries(shape.properties ?? {}).map(([key, child]) => [key, emptyValue(child)]),
    );
  if (shape.type === "array") return [];
  if (shape.type === "boolean") return false;
  if (shape.type === "integer") return shape.minimum ?? 0;
  return "";
}
export function createEmptyMarketingPlan(): MarketingPlanV1 {
  const plan = emptyValue(shapes["MarketingPlanV1"]!) as MarketingPlanV1;
  plan.test.primaryMetric = "useful_action";
  return plan;
}
export const loadMarketingPlanSchema = z.object({ projectId: marketingIdSchema }).strict();
export const saveMarketingPlanSchema = z
  .object({
    projectId: marketingIdSchema,
    expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    mutationId: marketingIdSchema,
    completeStudentFirst: z.boolean(),
    document: marketingPlanSchema,
  })
  .strict()
  .superRefine((request, context) => {
    if (
      jsonBytes(request) > MARKETING_LIMITS.requestBytes ||
      jsonBytes(request.document) > MARKETING_LIMITS.clientDocumentBytes
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "This plan is too large to save. No saved content was changed.",
      });
  });
export type SaveMarketingPlanInput = z.infer<typeof saveMarketingPlanSchema>;
export type MarketingFailure = {
  ok: false;
  code:
    | "UNAUTHENTICATED"
    | "NOT_FOUND"
    | "STAGE_LOCKED"
    | "INVALID_PLAN"
    | "CONFLICT"
    | "IDEMPOTENCY_CONFLICT"
    | "UNAVAILABLE";
  currentRevision?: number;
};
export type SaveMarketingPlanResult =
  | MarketingFailure
  | { ok: true; id: string; revision: number; savedAt: string; document: MarketingPlanV1 };
export type MarketingPlanSnapshot = {
  revision: number;
  savedAt: string;
  document: MarketingPlanV1;
};
export type MarketingPlanRecord = {
  id: string;
  revision: number;
  savedAt: string;
  document: MarketingPlanV1;
  history: MarketingPlanSnapshot[];
};
export type MarketingSourceStatus = {
  sourceId: string;
  status: "available" | "missing" | "not_accepted";
};
export type LoadMarketingPlanResult =
  | MarketingFailure
  | {
      ok: true;
      plan: MarketingPlanRecord | null;
      stage: number;
      canWrite: boolean;
      sourceStatus: MarketingSourceStatus[];
    };
