import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const server = process.env.WERK_SERVER ?? "http://localhost:8080";

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": server,
      "/maps": server,
      "/_matrix": process.env.WERK_MATRIX ?? "http://localhost:6167",
      "/livekit": { target: process.env.WERK_LIVEKIT ?? "ws://localhost:7880", ws: true, rewrite: (p) => p.replace(/^\/livekit/, "") },
      "/ws": { target: server.replace(/^http/, "ws"), ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
