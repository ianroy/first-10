import { z } from "zod";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const schema = z
  .object({
    interestRequests: count,
    feedbackSubmissions: count,
    distinctRespondents: count,
    excludedFixtures: count,
  })
  .strict();
export type PartnerCounts = z.infer<typeof schema>;

/** Never turn an error, extra/private field or malformed number into a zero. */
export function parsePartnerCounts(value: unknown): PartnerCounts | null {
  const result = schema.safeParse(value);
  if (!result.success) return null;
  if (
    result.data.distinctRespondents >
    result.data.interestRequests + result.data.feedbackSubmissions
  )
    return null;
  return result.data;
}
