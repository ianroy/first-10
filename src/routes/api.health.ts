import { createFileRoute } from "@tanstack/react-router";
import { deploymentHealth } from "@/lib/deployment-health";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => {
        const health = deploymentHealth({
          // These exact Vite references inspect browser build configuration;
          // server fallbacks must not hide an unconfigured browser bundle.
          publicUrl: import.meta.env["VITE_SUPABASE_URL"],
          publicKey: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
          serverUrl: process.env["SUPABASE_URL"],
          serverKey: process.env["SUPABASE_PUBLISHABLE_KEY"],
        });
        return Response.json(health, {
          status: health.status === "ok" ? 200 : 503,
          headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
      },
    },
  },
});
