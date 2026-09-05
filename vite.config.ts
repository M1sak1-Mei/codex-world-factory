import { defineConfig } from "vite";

export default defineConfig(({ command, isPreview }) => ({
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 4096,
  },
  server: {
    port: 5173,
    strictPort: true,
    // tool-driven file writes are missed by fsevents on this setup; poll so
    // the module graph never serves stale code (cost: dev-only CPU)
    watch: { usePolling: true, interval: 200 },
  },
  esbuild: {
    target: "esnext",
  },
  // Preview must serve the same subpath used in the built script URLs.
  base: command === "build" || isPreview ? "/codex-world-factory/" : "/",
}));
