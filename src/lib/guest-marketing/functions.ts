import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  guestActivityResult,
  guestMarketingHeaderSchema,
  guestMarketingReceiptSchema,
  guestMarketingRecordSchema,
  listGuestMarketingSchema,
  loadGuestMarketingSchema,
  saveGuestMarketingSchema,
} from "./contracts";
const identity = (v: unknown) => v;
// Dynamic import keeps the guest cookie/service helper out of client bundles.
const list = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("@/lib/guest-activities/server");
    return executeGuestActivity(
      data,
      listGuestMarketingSchema,
      guestActivityResult(z.array(guestMarketingHeaderSchema).max(8)),
      "list_guest_marketing_plans",
      () => ({}),
    );
  });
const load = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("@/lib/guest-activities/server");
    return executeGuestActivity(
      data,
      loadGuestMarketingSchema,
      guestActivityResult(guestMarketingRecordSchema),
      "load_guest_marketing_plan",
      (v) => ({ p_plan_id: v.planId }),
    );
  });
const save = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("@/lib/guest-activities/server");
    return executeGuestActivity(
      data,
      saveGuestMarketingSchema,
      guestActivityResult(guestMarketingReceiptSchema),
      "save_guest_marketing_plan",
      (v) => ({
        p_plan_id: v.planId,
        p_audience: v.audience,
        p_expected_revision: v.expectedRevision,
        p_mutation_id: v.mutationId,
        p_shared_confirmed: v.sharedAudienceConfirmed,
        p_document: v.document,
      }),
    );
  });
export const listGuestMarketing = (input: { data: z.infer<typeof listGuestMarketingSchema> }) =>
  list(input);
export const loadGuestMarketing = (input: { data: z.infer<typeof loadGuestMarketingSchema> }) =>
  load(input);
export const saveGuestMarketing = (input: { data: z.infer<typeof saveGuestMarketingSchema> }) =>
  save(input);
