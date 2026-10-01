import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `host: true` exposes the dev server on the LAN so the prototype can be opened on a phone.
// VITE_BASE is "/gv90-story-book/" on GitHub Pages (see .github/workflows/pages.yml); "/" everywhere else.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173 },
});
