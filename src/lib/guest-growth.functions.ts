import { createServerFn } from "@tanstack/react-start";
import type { z } from "zod";
import type {
  listGuestGrowthSchema,
  loadGuestGrowthSchema,
  saveGuestGrowthSchema,
} from "./guest-growth/contracts";
import type {
  historyGuestGrowthSchema,
  authorizeGuestGrowthExportSchema,
} from "./guest-growth/transport";
const identity = (v: unknown) => v;
const list = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { runGuestGrowth } = await import("./guest-growth/server");
    return runGuestGrowth("list", data);
  });
const load = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { runGuestGrowth } = await import("./guest-growth/server");
    return runGuestGrowth("load", data);
  });
const history = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { runGuestGrowth } = await import("./guest-growth/server");
    return runGuestGrowth("history", data);
  });
const save = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { runGuestGrowth } = await import("./guest-growth/server");
    return runGuestGrowth("save", data);
  });
const authorize = createServerFn({ method: "POST" })
  .inputValidator(identity)
  .handler(async ({ data }) => {
    const { runGuestGrowth } = await import("./guest-growth/server");
    return runGuestGrowth("authorize", data);
  });
export const listGuestGrowth = (input: { data: z.infer<typeof listGuestGrowthSchema> }) =>
  list(input);
export const loadGuestGrowth = (input: { data: z.infer<typeof loadGuestGrowthSchema> }) =>
  load(input);
export const historyGuestGrowth = (input: { data: z.infer<typeof historyGuestGrowthSchema> }) =>
  history(input);
export const saveGuestGrowth = (input: { data: z.infer<typeof saveGuestGrowthSchema> }) =>
  save(input);
export const authorizeGuestGrowthExport = (input: {
  data: z.infer<typeof authorizeGuestGrowthExportSchema>;
}) => authorize(input);
