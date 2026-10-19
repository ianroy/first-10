import type { z } from "zod";
import type {
  listGuestGrowthSchema,
  loadGuestGrowthSchema,
  saveGuestGrowthSchema,
} from "@/lib/guest-growth/contracts";
import type { GuestGrowthPdfScope, GuestGrowthPdfSource } from "@/lib/guest-growth/pdf";
/** Injection boundary only: no implementation, network, local persistence or authority is supplied. */
export type GuestGrowthPorts = {
  list: (input: z.infer<typeof listGuestGrowthSchema>) => Promise<unknown>;
  load: (input: z.infer<typeof loadGuestGrowthSchema>) => Promise<unknown>;
  history: (input: { csrf: string; artifactId: string }) => Promise<unknown>;
  save: (input: z.infer<typeof saveGuestGrowthSchema>) => Promise<unknown>;
  /** Must verify CURRENT cookie/CSRF/class scope and exact retained source(s) on every invocation.
   * Called before PDF generation AND delivery. A draft ID is local, never a claimed stored row.
   */
  authorizeExport: (input: {
    csrf: string;
    scope: GuestGrowthPdfScope;
    sources: readonly GuestGrowthPdfSource[];
  }) => Promise<void>;
};
