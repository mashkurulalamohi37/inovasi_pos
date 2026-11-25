import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  server: {
    port: 3005,
    host: true,
    // Proxy API to Pulse backend. Host port must stay outside Windows
    // Hyper-V excluded ranges (currently includes ~8937–9036; 9001 fails).
    // Use 127.0.0.1 (not localhost) to avoid Windows IPv6 (::1) ECONNREFUSED
    // AggregateError → browser 502 Bad Gateway from the Vite proxy.
    proxy: {
      "/api/v1": {
        target: "http://127.0.0.1:9200",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:9200",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
      server: { entry: "server" },
    }),
    viteReact(),
    mode === "production" ? nitro() : null,
  ].filter(Boolean),
}));
