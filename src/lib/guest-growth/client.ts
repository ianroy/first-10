import type { GuestGrowthPorts } from "@/components/guest-growth/ports";
import {
  listGuestGrowth,
  loadGuestGrowth,
  historyGuestGrowth,
  saveGuestGrowth,
  authorizeGuestGrowthExport,
} from "@/lib/guest-growth.functions";
import { guestGrowthPdfSourceSchema, guestGrowthPdfScopeSchema } from "./pdf";
import {
  authorizeGuestGrowthExportSchema,
  guestGrowthExportReceiptSchema,
  growthRecordHash,
  growthContextHash,
} from "./transport";
/** No storage or browser actor: the server derives the actor from the current HttpOnly cookie. */
export function createGuestGrowthPorts(): GuestGrowthPorts {
  return {
    list: (data) => listGuestGrowth({ data }),
    load: (data) => loadGuestGrowth({ data }),
    history: (data) => historyGuestGrowth({ data }),
    save: (data) => saveGuestGrowth({ data }),
    authorizeExport: async ({ csrf, scope: rawScope, sources: rawSources }) => {
      const scope = guestGrowthPdfScopeSchema.parse(rawScope);
      if (rawSources.length < 1 || rawSources.length > 50)
        throw Error("Review the selected growth sources again.");
      const sources = await Promise.all(
        rawSources.map(async (raw) => {
          const s = guestGrowthPdfSourceSchema.parse(raw);
          if (s.state === "draft")
            return { state: "draft" as const, localDraftId: s.localDraftId, kind: s.document.kind };
          return {
            state: "saved" as const,
            artifactId: s.record.id,
            revision: s.record.revision,
            kind: s.record.kind,
            audience: s.record.audience,
            authorPrincipalId: s.record.authorPrincipalId,
            recordHash: await growthRecordHash(s.record),
          };
        }),
      );
      const data = authorizeGuestGrowthExportSchema.parse({
        csrf,
        scope: {
          classId: scope.classId,
          teamId: scope.teamId,
          principalId: scope.principalId,
          accessExpiresAt: scope.accessExpiresAt,
          contextHash: await growthContextHash(scope),
        },
        sources,
      });
      const receipt = await authorizeGuestGrowthExport({ data });
      if (!guestGrowthExportReceiptSchema.safeParse(receipt).success)
        throw Error("Current guest access to these exact growth sources could not be confirmed.");
    },
  };
}
