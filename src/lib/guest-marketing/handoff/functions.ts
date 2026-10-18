import { createServerFn } from "@tanstack/react-start";
import type { z } from "zod";
import {
  confirmMarketingSchema,
  guestActivityResult,
  listMarketingSubmissionsSchema,
  marketingChoiceSchema,
  marketingPreviewSchema,
  marketingSubmissionHeaderSchema,
  marketingSubmissionPageSchema,
  marketingSubmissionViewSchema,
  previewMarketingSchema,
  readMarketingChoiceSchema,
  readMarketingSubmissionSchema,
  saveMarketingChoiceSchema,
  withdrawMarketingSchema,
} from "./contracts";
const readMarketingChoiceFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("@/lib/guest-activities/server");
    return executeGuestActivity(
      data,
      readMarketingChoiceSchema,
      guestActivityResult(marketingChoiceSchema),
      "get_guest_marketing_sharing_choice",
      (d) => ({ p_plan_id: d.planId }),
    );
  });
export const readMarketingChoice = (input: { data: z.infer<typeof readMarketingChoiceSchema> }) =>
  readMarketingChoiceFn(input);
const saveMarketingChoiceFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("@/lib/guest-activities/server");
    return executeGuestActivity(
      data,
      saveMarketingChoiceSchema,
      guestActivityResult(marketingChoiceSchema),
      "save_guest_marketing_sharing_choice",
      (d) => ({
        p_plan_id: d.planId,
        p_choice: d.choice,
        p_expected_revision: d.expectedRevision,
        p_request_id: d.requestId,
      }),
    );
  });
export const saveMarketingChoice = (input: { data: z.infer<typeof saveMarketingChoiceSchema> }) =>
  saveMarketingChoiceFn(input);
const previewMarketingSubmissionFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("@/lib/guest-activities/server");
    return executeGuestActivity(
      data,
      previewMarketingSchema,
      guestActivityResult(marketingPreviewSchema),
      "preview_guest_marketing_submission",
      (d) => {
        const { csrf: _csrf, ...spec } = d;
        return { p_document: spec };
      },
    );
  });
export const previewMarketingSubmission = (input: {
  data: z.infer<typeof previewMarketingSchema>;
}) => previewMarketingSubmissionFn(input);
const confirmMarketingSubmissionFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("@/lib/guest-activities/server");
    return executeGuestActivity(
      data,
      confirmMarketingSchema,
      guestActivityResult(marketingSubmissionViewSchema),
      "confirm_guest_marketing_submission",
      (d) => ({
        p_preview_id: d.previewId,
        p_preview_hash: d.previewHash,
        p_request_id: d.requestId,
        p_confirmed: d.selectedCopyConfirmed,
      }),
    );
  });
export const confirmMarketingSubmission = (input: {
  data: z.infer<typeof confirmMarketingSchema>;
}) => confirmMarketingSubmissionFn(input);
const getMarketingSubmissionFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("@/lib/guest-activities/server");
    return executeGuestActivity(
      data,
      readMarketingSubmissionSchema,
      guestActivityResult(marketingSubmissionViewSchema),
      "get_guest_marketing_submission",
      (d) => ({ p_snapshot_id: d.snapshotId }),
    );
  });
export const getMarketingSubmission = (input: {
  data: z.infer<typeof readMarketingSubmissionSchema>;
}) => getMarketingSubmissionFn(input);
const listMarketingSubmissionsFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("@/lib/guest-activities/server");
    return executeGuestActivity(
      data,
      listMarketingSubmissionsSchema,
      guestActivityResult(marketingSubmissionPageSchema),
      "list_guest_marketing_submissions",
      (d) => ({ p_cursor: d.cursor ?? null }),
    );
  });
export const listMarketingSubmissions = (input: {
  data: z.infer<typeof listMarketingSubmissionsSchema>;
}) => listMarketingSubmissionsFn(input);
const withdrawMarketingSubmissionFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("@/lib/guest-activities/server");
    return executeGuestActivity(
      data,
      withdrawMarketingSchema,
      guestActivityResult(marketingSubmissionHeaderSchema),
      "withdraw_guest_marketing_submission",
      (d) => ({ p_snapshot_id: d.snapshotId, p_request_id: d.requestId }),
    );
  });
export const withdrawMarketingSubmission = (input: {
  data: z.infer<typeof withdrawMarketingSchema>;
}) => withdrawMarketingSubmissionFn(input);
