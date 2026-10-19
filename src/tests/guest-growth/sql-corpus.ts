import { createEmptyGuestGrowth, type GuestGrowthDocument } from "@/lib/guest-growth/contracts";
import { documents, id } from "./fixture";
const learning = createEmptyGuestGrowth("learning"),
  survey = createEmptyGuestGrowth("survey");
export const growthSqlCorpus: { label: string; valid: boolean; document: unknown }[] = [
  ...["\u00a0", "\u2009", "\ufeff"].map((separator, i) => ({
    label: `unicode_phone_${i}`,
    valid: false,
    document: {
      ...createEmptyGuestGrowth("pipeline_contact"),
      alias: Array.from({ length: 10 }, (_, n) => String(n)).join(separator),
    },
  })),
  ...[
    ["İ", "i\u0307"],
    ["ΟΣ", "ος"],
    ["\u0345Σ", "\u0345σ"],
    ["AΣ\u0345", "aς\u0345"],
    ["\u1c89", "\u1c8a"],
    ["\ua7ce", "\ua7cf"],
    ["\ud81b\udea0", "\ud81b\udebb"],
  ].map((options, i) => ({
    label: `unicode_options_${i}`,
    valid: false,
    document: {
      ...survey,
      questions: [
        {
          id: id(401 + i),
          format: "single_choice",
          prompt: "Question",
          purpose: "Purpose",
          options,
        },
      ],
    },
  })),
  ...documents().map((document: GuestGrowthDocument) => ({
    label: document.kind,
    valid: true,
    document,
  })),
  { label: "blank_learning", valid: true, document: learning },
  {
    label: "whitespace",
    valid: true,
    document: {
      ...learning,
      title: "  Preserve authored whitespace  ",
      observations: "😀".repeat(3000),
    },
  },
  {
    label: "offset",
    valid: true,
    document: {
      ...learning,
      title: "Calendar",
      interpretation: "A report",
      nextTest: "One next test",
      reviewState: "reviewed",
      reviewedAt: "2026-10-18T10:00:00.123456789+0100",
    },
  },
  { label: "unknown", valid: false, document: { ...learning, rawAnswers: ["private"] } },
  { label: "bounds", valid: false, document: { ...learning, title: "😀".repeat(121) } },
  {
    label: "secret_boundary",
    valid: false,
    document: { ...learning, observations: "é" + "a".repeat(64) + "é" },
  },
  {
    label: "year_zero",
    valid: false,
    document: {
      ...learning,
      title: "Review",
      interpretation: "Report",
      nextTest: "Test",
      reviewState: "reviewed",
      reviewedAt: "0000-01-01T00:00:00Z",
    },
  },
  {
    label: "bad_offset",
    valid: false,
    document: {
      ...learning,
      title: "Review",
      interpretation: "Report",
      nextTest: "Test",
      reviewState: "reviewed",
      reviewedAt: "2026-10-18T00:00:00+99:99",
    },
  },
  {
    label: "bad_day",
    valid: false,
    document: {
      ...createEmptyGuestGrowth("experiment"),
      criterion: { ...createEmptyGuestGrowth("experiment").criterion, reviewOn: "2026-02-30" },
    },
  },
  {
    label: "false_result",
    valid: false,
    document: {
      ...createEmptyGuestGrowth("experiment"),
      reportedResult: { ...createEmptyGuestGrowth("experiment").reportedResult, count: 0 },
    },
  },
  {
    label: "duplicate_options",
    valid: false,
    document: {
      ...survey,
      questions: [
        {
          id: id(301),
          format: "single_choice",
          prompt: "Question",
          purpose: "Purpose",
          options: ["  SAME  ", "same"],
        },
      ],
    },
  },
  {
    label: "bad_uuid",
    valid: false,
    document: {
      ...survey,
      questions: [
        { id: "not-a-uuid", format: "open_text", prompt: "Question", purpose: "Purpose" },
      ],
    },
  },
  {
    label: "nil_uuid",
    valid: true,
    document: {
      ...survey,
      questions: [
        {
          id: "00000000-0000-0000-0000-000000000000",
          format: "open_text",
          prompt: "Question",
          purpose: "Purpose",
        },
      ],
    },
  },
  {
    label: "shape_uuid",
    valid: true,
    document: {
      ...survey,
      questions: [
        {
          id: "00000000-0000-0000-0000-000000000001",
          format: "open_text",
          prompt: "Question",
          purpose: "Purpose",
        },
      ],
    },
  },
  {
    label: "all_one_uuid",
    valid: true,
    document: {
      ...survey,
      questions: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          format: "open_text",
          prompt: "Question",
          purpose: "Purpose",
        },
      ],
    },
  },
  {
    label: "aggregate_utf8",
    valid: false,
    document: {
      ...learning,
      observations: "😀".repeat(3000),
      interpretation: "😀".repeat(3000),
      counterevidence: "😀".repeat(2000),
      uncertainty: "😀".repeat(2000),
    },
  },
];
