import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  listGuestActivitySchema,
  loadGuestActivitySchema,
  saveGuestActivitySchema,
  guestActivityHeaderSchema,
  guestActivityRecordSchema,
  guestSaveReceiptSchema,
  previewGuestSubmissionSchema,
  guestSubmissionPreviewSchema,
  confirmGuestSubmissionSchema,
  guestSubmissionViewSchema,
  readGuestSubmissionSchema,
  listGuestSubmissionSchema,
  guestSubmissionPageSchema,
  withdrawGuestSubmissionSchema,
  guestSubmissionHeaderSchema,
  guestActivityResult,
} from "./contracts";
const identity = (v: unknown) => v;
const list = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      listGuestActivitySchema,
      guestActivityResult(z.array(guestActivityHeaderSchema).max(15)),
      "list_guest_learning_activities",
      () => ({}),
    );
  });
const load = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      loadGuestActivitySchema,
      guestActivityResult(guestActivityRecordSchema),
      "load_guest_learning_activity",
      (d) => ({ p_activity_id: d.activityId }),
    );
  });
const save = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      saveGuestActivitySchema,
      guestActivityResult(guestSaveReceiptSchema),
      "save_guest_learning_activity",
      (d) => ({
        p_activity_id: d.activityId,
        p_audience: d.audience,
        p_expected_revision: d.expectedRevision,
        p_mutation_id: d.mutationId,
        p_shared_confirmed: d.sharedAudienceConfirmed,
        p_document: d.document,
      }),
    );
  });
const preview = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      previewGuestSubmissionSchema,
      guestActivityResult(guestSubmissionPreviewSchema),
      "preview_guest_learning_submission",
      (d) => {
        const { csrf: _csrf, ...spec } = d;
        return { p_document: spec };
      },
    );
  });
const confirm = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      confirmGuestSubmissionSchema,
      guestActivityResult(guestSubmissionViewSchema),
      "confirm_guest_learning_submission",
      (d) => ({
        p_preview_id: d.previewId,
        p_preview_hash: d.previewHash,
        p_request_id: d.requestId,
      }),
    );
  });
const readSubmission = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      readGuestSubmissionSchema,
      guestActivityResult(guestSubmissionViewSchema),
      "get_guest_learning_submission",
      (d) => ({ p_snapshot_id: d.snapshotId, p_mode: d.mode }),
    );
  });
const listSubmissions = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      listGuestSubmissionSchema,
      guestActivityResult(guestSubmissionPageSchema),
      "list_guest_learning_submissions",
      (d) => ({ p_mode: d.mode, p_cursor: d.cursor ?? null }),
    );
  });
const withdraw = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      withdrawGuestSubmissionSchema,
      guestActivityResult(guestSubmissionHeaderSchema),
      "withdraw_guest_learning_submission",
      (d) => ({ p_snapshot_id: d.snapshotId, p_request_id: d.requestId }),
    );
  });
export const listGuestActivities = (input: { data: z.infer<typeof listGuestActivitySchema> }) =>
  list(input);
export const loadGuestActivity = (input: { data: z.infer<typeof loadGuestActivitySchema> }) =>
  load(input);
export const saveGuestActivity = (input: { data: z.infer<typeof saveGuestActivitySchema> }) =>
  save(input);
export const previewGuestSubmission = (input: {
  data: z.infer<typeof previewGuestSubmissionSchema>;
}) => preview(input);
export const confirmGuestSubmission = (input: {
  data: z.infer<typeof confirmGuestSubmissionSchema>;
}) => confirm(input);
export const getGuestSubmission = (input: { data: z.infer<typeof readGuestSubmissionSchema> }) =>
  readSubmission(input);
export const listGuestSubmissions = (input: { data: z.infer<typeof listGuestSubmissionSchema> }) =>
  listSubmissions(input);
export const withdrawGuestSubmission = (input: {
  data: z.infer<typeof withdrawGuestSubmissionSchema>;
}) => withdraw(input);
