import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `host: true` exposes the dev server on the LAN so the prototype can be opened on a phone.
// VITE_BASE is "/gv90-story-book/" on GitHub Pages (see .github/workflows/pages.yml); "/" everywhere else.
// Some assets are kept out of the public repo (see .gitignore). Whether they exist is decided at build time, so the
// public build never asks for a file that is not there (no 404s) and falls back to placeholders / the procedural flame.
const has = (p: string) => existsSync(resolve(process.cwd(), p));

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  define: {
    __HAS_STILLS__: JSON.stringify(has("public/assets/stills/dba-1-lamps.jpg")),
    __HAS_FIRE_TEXTURE__: JSON.stringify(has("public/assets/fire/flame.webp")),
  },
  plugins: [react()],
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173 },
});
