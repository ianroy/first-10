import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Isolated visual fixture: no TanStack Start server, authentication, DB or network writes.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@/components/AppShell",
        replacement: fileURLToPath(new URL("./preview-shell.tsx", import.meta.url)),
      },
      {
        find: "@/lib/teacher.functions",
        replacement: fileURLToPath(new URL("./preview-gateway.ts", import.meta.url)),
      },
      {
        find: "@tanstack/react-router",
        replacement: fileURLToPath(new URL("./preview-router.ts", import.meta.url)),
      },
      { find: "@", replacement: fileURLToPath(new URL("../../", import.meta.url)) },
    ],
  },
  server: { host: "127.0.0.1", port: 5189, strictPort: true },
});
