import { expect, it, vi } from "vitest";
import { requestStructuredDraft } from "@/lib/ai/gateway.server";
import { aiOutputSchemas } from "@/lib/ai/contracts";
const draft = {
  channel: "Proposed campus club organizer",
  hook: "How did your last meeting come together?",
  body: "We are a student team exploring an untested idea. Could we ask about a recent coordination episode?",
  cta: "Ask for permission to have a short conversation.",
  accessCheck: "Permission is unknown. Check the organizer rules.",
  peerCheck: "Can a peer explain who this is for?",
  measurement: "Count consenting relevant conversations manually; no result has been recorded.",
  uncertainty: "No test has run. Existing reliable groups may not need this.",
};
it("locks the low-cost synthetic route to one bounded provider attempt with privacy and price filters", async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          id: "fixture-generation",
          provider: "Google Vertex",
          model: "google/gemini-2.5-flash-lite",
          choices: [{ finish_reason: "stop", message: { content: JSON.stringify(draft) } }],
          usage: { cost: 0.0002 },
        }),
      ),
  );
  const result = await requestStructuredDraft({
    key: "fixture",
    kind: "marketing_demo",
    model: "expensive-ignore",
    policy: "synthetic-marketing-v1",
    system: "Fictional practice only",
    user: "Authored fictional case",
    schema: { type: "object" },
    fetcher,
  });
  const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
  expect(body.model).toBe("google/gemini-2.5-flash-lite");
  expect(body.max_tokens).toBe(1200);
  expect(body.provider).toEqual({
    require_parameters: true,
    only: ["google-vertex"],
    order: ["google-vertex"],
    allow_fallbacks: false,
    data_collection: "deny",
    zdr: true,
    max_price: { prompt: 0.1, completion: 0.4 },
  });
  expect(result.data).toEqual(draft);
  expect(result.provider).toBe("Google Vertex");
});
it("does not retry HTTP errors for the workshop-reserved route", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response("", { status: 429 }));
  const sleep = vi.fn();
  await expect(
    requestStructuredDraft({
      key: "fixture",
      kind: "marketing_demo",
      policy: "synthetic-marketing-v1",
      system: "Fixture",
      user: "Fixture",
      schema: {},
      fetcher,
      sleep,
    }),
  ).rejects.toMatchObject({ attempts: 1, code: "HTTP_429" });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(sleep).not.toHaveBeenCalled();
});
it("rejects invented destinations and extra output fields in the fixed-case draft", () => {
  expect(aiOutputSchemas.marketing_demo.safeParse(draft).success).toBe(true);
  expect(
    aiOutputSchemas.marketing_demo.safeParse({ ...draft, body: "Go to https://made-up.test" })
      .success,
  ).toBe(false);
  expect(aiOutputSchemas.marketing_demo.safeParse({ ...draft, customers: 500 }).success).toBe(
    false,
  );
  for (const destination of [
    "studyloop.app",
    "person@example.test",
    "mailto:organizer@example.test",
  ])
    expect(aiOutputSchemas.marketing_demo.safeParse({ ...draft, body: destination }).success).toBe(
      false,
    );
});
it("rejects missing/mismatched synthetic policy and oversized fixed context before network", async () => {
  const fetcher = vi.fn<typeof fetch>();
  for (const [kind, policy, user] of [
    ["marketing_demo", undefined, "Fixture"],
    ["questions", "synthetic-marketing-v1", "Fixture"],
    ["marketing_demo", "synthetic-marketing-v1", "x".repeat(12001)],
  ] as const) {
    await expect(
      requestStructuredDraft({
        key: "fixture",
        kind,
        ...(policy ? { policy } : {}),
        system: "Fixture",
        user,
        schema: {},
        fetcher,
      }),
    ).rejects.toThrow();
  }
  expect(fetcher).not.toHaveBeenCalled();
});
