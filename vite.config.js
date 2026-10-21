import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const builderRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    preact(),
    {
      name: "include-routine-link-entry",
      closeBundle() {
        copyFileSync(
          resolve(builderRoot, "../../public/routine-link.html"),
          resolve(builderRoot, "site/routine-link.html"),
        );
      },
    },
  ],
  base: "/ProFit/",
  build: {
    outDir: "site",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.endsWith("/src/i18n.js")) return "app-i18n";
          if (id.endsWith("/src/exercise-library.json")) return "exercise-library";
        },
      },
    },
  },
});
