import { resolve } from "node:path";
import tailwind from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Isolated visual fixture: no auth, backend or AI connection.
export default defineConfig({
  root: process.cwd(),
  plugins: [tailwind()],
  resolve: { alias: { "@": resolve("src") } },
  server: { host: "127.0.0.1", port: 8767, strictPort: true },
});
