import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const openHandsNavigationBridge = fileURLToPath(
  new URL("./src/web/openhands-navigation-context.tsx", import.meta.url),
);
const openHandsSidebarMobileNavBridge = fileURLToPath(
  new URL("./src/web/openhands-sidebar-mobile-nav-context.tsx", import.meta.url),
);

export default defineConfig({
  root: "src/web",
  plugins: [
    {
      name: "openhands-navigation-bridge",
      enforce: "pre",
      resolveId(source, importer) {
        if (importer?.includes("/node_modules/@openhands/agent-canvas/dist/")) {
          if (/(?:^|\/)context\/navigation-context\.js$/.test(source))
            return openHandsNavigationBridge;
          if (/(?:^|\/)sidebar-mobile-nav-context\.js$/.test(source))
            return openHandsSidebarMobileNavBridge;
        }
        return null;
      },
    },
    react(),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:9428",
      "/source": "http://127.0.0.1:9428",
      "/plans": "http://127.0.0.1:9428",
    },
  },
  build: {
    outDir: "../app/ui-dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
