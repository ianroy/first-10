import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePlatformAdmin } from "./admin-auth.server";
import { auditPlatformAdminAction } from "./admin-audit.server";
import { parsePartnerCounts, type PartnerCounts } from "./admin-partners";

export type AdminMetric = {
  key: string;
  label: string;
  total: number | null;
  presenter: number | null;
};

export type AdminSnapshot = {
  status: "ready" | "partial" | "unavailable";
  asOf: string;
  metrics: AdminMetric[];
  partners?: PartnerCounts | null;
};

/** Count-only operational view. No client-supplied role, filters or target user IDs. */
export const getAdminSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminSnapshot> => {
    const { getRequest, setResponseHeader, setResponseStatus } =
      await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    const deny = (): never => {
      setResponseStatus(403);
      throw new Error("Admin access denied.");
    };
    const bearer = /^Bearer ([^\s,]+)$/i.exec(getRequest().headers.get("authorization") ?? "");
    const token = bearer?.[1];
    if (!token || token.length > 16384) return deny();

    const url = process.env["SUPABASE_URL"]?.trim();
    const publicKey = process.env["SUPABASE_PUBLISHABLE_KEY"]?.trim();
    if (!url || !publicKey) {
      setResponseStatus(503);
      throw new Error("Admin access cannot be checked right now.");
    }
    // Fresh /auth/v1/user lookup, not client metadata or a locally decoded JWT.
    // Revoking the trusted app_metadata role takes effect on the next request.
    const { createClient } = await import("@supabase/supabase-js");
    const verifier = createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
      },
    });
    const verified = await verifier.auth.getUser(token).catch(() => deny());
    const user = verified.data.user;
    if (verified.error || !user?.id) return deny();
    const demoAccess = user.app_metadata?.["firstten_demo_admin"] === true;
    if (!demoAccess) {
      try {
        await requirePlatformAdmin(verifier, `Bearer ${token}`);
      } catch {
        return deny();
      }
    }
    // Presenter remains a separate narrow permission, never an automatic platform grant.
    const presenterUserId = demoAccess ? user.id : "f1d00000-0000-4000-8000-000000000001";
    const finish = async (snapshot: AdminSnapshot): Promise<AdminSnapshot> => {
      if (!demoAccess) {
        try {
          await auditPlatformAdminAction(verifier, {
            operation: "operational_snapshot",
            outcome: snapshot.status,
            requestId: crypto.randomUUID(),
          });
        } catch {
          setResponseStatus(503);
          throw new Error(
            "Admin action could not be recorded. No aggregate response is available.",
          );
        }
      }
      return snapshot;
    };

    const definitions = [
      { key: "projects", label: "Projects", table: "projects" },
      { key: "contacts", label: "Contact records", table: "contacts" },
      { key: "interviews", label: "Completed interview records", table: "interviews" },
      { key: "learnings", label: "Accepted learning records", table: "learnings" },
      { key: "experiments", label: "Experiments logged", table: "experiments" },
      { key: "outreach", label: "Outreach draft records", table: "outreach" },
    ] as const;
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim()) {
      return finish({
        status: "unavailable",
        asOf: new Date().toISOString(),
        metrics: definitions.map(({ key, label }) => ({
          key,
          label,
          total: null,
          presenter: null,
        })),
      });
    }
    // The privileged module is imported only after a fresh trusted-role check.
    // It is never imported by the route or evaluated in the browser.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const count = async (table: (typeof definitions)[number]["table"], presenterOnly: boolean) => {
      try {
        const selection = { count: "exact", head: true } as const;
        let query =
          table === "interviews"
            ? supabaseAdmin.from("interviews").select("id", selection).eq("completed", true)
            : table === "learnings"
              ? supabaseAdmin.from("learnings").select("id", selection).eq("accepted", true)
              : supabaseAdmin.from(table).select("id", selection);
        if (presenterOnly) query = query.eq("user_id", presenterUserId);
        const result = await query.abortSignal(AbortSignal.timeout(8000));
        return !result.error && Number.isSafeInteger(result.count) && result.count! >= 0
          ? result.count
          : null;
      } catch {
        return null;
      }
    };
    const partnerCounts = async (): Promise<PartnerCounts | null> => {
      try {
        const client = supabaseAdmin as unknown as Pick<SupabaseClient, "rpc">;
        const result = await client
          .rpc("get_founding_partner_counts")
          .abortSignal(AbortSignal.timeout(8000));
        return result.error ? null : parsePartnerCounts(result.data);
      } catch {
        return null;
      }
    };
    const [partners, metrics] = await Promise.all([
      partnerCounts(),
      Promise.all(
        definitions.map(async ({ key, label, table }) => {
          const [total, presenter] = await Promise.all([count(table, false), count(table, true)]);
          return { key, label, total, presenter };
        }),
      ),
    ]);
    return finish({
      status:
        partners !== null &&
        metrics.every((metric) => metric.total !== null && metric.presenter !== null)
          ? "ready"
          : metrics.every((metric) => metric.total === null)
            ? "unavailable"
            : "partial",
      asOf: new Date().toISOString(),
      metrics,
      partners,
    });
  },
);
