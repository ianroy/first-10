import { createServerFn } from "@tanstack/react-start";
import type { z } from "zod";
import {
  confirmGrowthSchema,
  guestActivityResult,
  listGrowthSubmissionsSchema,
  growthChoiceSchema,
  growthPreviewSchema,
  growthSubmissionHeaderSchema,
  growthSubmissionPageSchema,
  growthSubmissionViewSchema,
  previewGrowthSchema,
  readGrowthChoiceSchema,
  readGrowthSubmissionSchema,
  saveGrowthChoiceSchema,
  withdrawGrowthSchema,
} from "./contracts";
const readGrowthChoiceFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeHandoff: executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      readGrowthChoiceSchema,
      guestActivityResult(growthChoiceSchema),
      "get_guest_growth_sharing_choice",
      (d) => ({ p_artifact_id: d.artifactId }),
    );
  });
export const readGrowthChoice = (input: { data: z.infer<typeof readGrowthChoiceSchema> }) =>
  readGrowthChoiceFn(input);
const saveGrowthChoiceFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeHandoff: executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      saveGrowthChoiceSchema,
      guestActivityResult(growthChoiceSchema),
      "save_guest_growth_sharing_choice",
      (d) => ({
        p_artifact_id: d.artifactId,
        p_choice: d.choice,
        p_expected_revision: d.expectedRevision,
        p_request_id: d.requestId,
      }),
    );
  });
export const saveGrowthChoice = (input: { data: z.infer<typeof saveGrowthChoiceSchema> }) =>
  saveGrowthChoiceFn(input);
const previewGrowthSubmissionFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeHandoff: executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      previewGrowthSchema,
      guestActivityResult(growthPreviewSchema),
      "preview_guest_growth_submission",
      (d) => {
        const { csrf: _csrf, ...spec } = d;
        return { p_document: spec };
      },
    );
  });
export const previewGrowthSubmission = (input: { data: z.infer<typeof previewGrowthSchema> }) =>
  previewGrowthSubmissionFn(input);
const confirmGrowthSubmissionFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeHandoff: executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      confirmGrowthSchema,
      guestActivityResult(growthSubmissionViewSchema),
      "confirm_guest_growth_submission",
      (d) => ({
        p_preview_id: d.previewId,
        p_preview_hash: d.previewHash,
        p_request_id: d.requestId,
        p_confirmed: d.selectedCopyConfirmed,
      }),
    );
  });
export const confirmGrowthSubmission = (input: { data: z.infer<typeof confirmGrowthSchema> }) =>
  confirmGrowthSubmissionFn(input);
const getGrowthSubmissionFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeHandoff: executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      readGrowthSubmissionSchema,
      guestActivityResult(growthSubmissionViewSchema),
      "get_guest_growth_submission",
      (d) => ({ p_snapshot_id: d.snapshotId }),
    );
  });
export const getGrowthSubmission = (input: { data: z.infer<typeof readGrowthSubmissionSchema> }) =>
  getGrowthSubmissionFn(input);
const listGrowthSubmissionsFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeHandoff: executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      listGrowthSubmissionsSchema,
      guestActivityResult(growthSubmissionPageSchema),
      "list_guest_growth_submissions",
      (d) => ({ p_cursor: d.cursor ?? null }),
    );
  });
export const listGrowthSubmissions = (input: {
  data: z.infer<typeof listGrowthSubmissionsSchema>;
}) => listGrowthSubmissionsFn(input);
const withdrawGrowthSubmissionFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeHandoff: executeGuestActivity } = await import("./server");
    return executeGuestActivity(
      data,
      withdrawGrowthSchema,
      guestActivityResult(growthSubmissionHeaderSchema),
      "withdraw_guest_growth_submission",
      (d) => ({ p_snapshot_id: d.snapshotId, p_request_id: d.requestId }),
    );
  });
export const withdrawGrowthSubmission = (input: { data: z.infer<typeof withdrawGrowthSchema> }) =>
  withdrawGrowthSubmissionFn(input);

const sourcesFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => v)
  .handler(async ({ data }) => {
    const { executeHandoff } = await import("./server");
    const { readSourcesSchema, sourceRosterSchema } = await import("./contracts");
    return executeHandoff(
      data,
      readSourcesSchema,
      guestActivityResult(sourceRosterSchema),
      "get_guest_growth_handoff_sources",
      (d) => ({ p_artifact_id: d.artifactId, p_revision: d.revision }),
    );
  });
export const getGrowthHandoffSources = (input: {
  data: import("zod").z.infer<typeof import("./contracts").readSourcesSchema>;
}) => sourcesFn(input);
