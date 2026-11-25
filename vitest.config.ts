import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), viteReact()] as any,
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts", "./src/test/msw/setup.ts"],
    include: ["src/test/**/*.test.{ts,tsx}", "src/test/integration/**/*.test.{ts,tsx}"],
    globals: false,
    // Align with app production default (9001). MSW handlers must match this base.
    // Port 8000 is Windows-reserved and is rejected by resolveApiBase().
    env: {
      VITE_API_URL: "http://localhost:9001/api/v1",
    },
  },
});
