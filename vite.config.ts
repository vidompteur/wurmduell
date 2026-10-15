import { defineConfig } from "vitest/config";

// `base: "./"` macht den Build unabhängig vom Deploy-Pfad (z. B. wisp.place unter
// https://sites.wisp.place/<HANDLE>/wurmduell/).
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
