import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const openHandsNavigationBridge = fileURLToPath(
  new URL("./src/web/openhands-navigation-context.tsx", import.meta.url),
);
const openHandsSidebarMobileNavBridge = fileURLToPath(
  new URL(
    "./src/web/openhands-sidebar-mobile-nav-context.tsx",
    import.meta.url,
  ),
);
const canvasChat = fileURLToPath(
  new URL("./src/web/canvas-chat.tsx", import.meta.url),
);
const canvasOutput = fileURLToPath(
  new URL("./canvas-app", import.meta.url),
);

function selfContainedCanvasApp() {
  return {
    name: "self-contained-canvas-app",
    enforce: "post" as const,
    generateBundle(_options: unknown, bundle: Record<string, any>) {
      const entry = Object.values(bundle).find(
        (item) => item.type === "chunk" && item.isEntry,
      );
      if (!entry) throw new Error("Canvas entrypoint was not generated.");
      const css = Object.values(bundle)
        .filter(
          (item) => item.type === "asset" && item.fileName.endsWith(".css"),
        )
        .map((item) => String(item.source))
        .join("\n");
      entry.code = entry.code.replace(
        JSON.stringify("__AVOOZL_BUNDLED_CSS__"),
        JSON.stringify(css),
      );
      for (const [key, item] of Object.entries(bundle)) {
        if (item.type === "asset" && item.fileName.endsWith(".css")) {
          delete bundle[key];
        }
      }
      if (entry.code.includes("__AVOOZL_BUNDLED_CSS__"))
        throw new Error("Canvas dependency CSS was not embedded.");
    },
    writeBundle(_options: unknown, bundle: Record<string, any>) {
      const entry = Object.values(bundle).find(
        (item) => item.type === "chunk" && item.isEntry,
      );
      if (!entry) throw new Error("Canvas entrypoint was not written.");
      const entryPath = path.join(canvasOutput, entry.fileName);
      let code = fs.readFileSync(entryPath, "utf8");
      const assets = path.join(canvasOutput, "assets");
      const workerFiles = fs.existsSync(assets)
        ? fs
            .readdirSync(assets)
            .filter((name) => /^editor\.worker-[^.]+\.js$/.test(name))
        : [];
      for (const name of workerFiles) {
        const fileName = `assets/${name}`;
        const workerPath = path.join(canvasOutput, fileName);
        const workerSource = fs.readFileSync(workerPath, "utf8");
        const encodedWorker = Buffer.from(workerSource).toString("base64");
        const workerUrl = `URL.createObjectURL(new Blob([Uint8Array.from(atob(${JSON.stringify(encodedWorker)}),c=>c.charCodeAt(0))],{type:"text/javascript"}))`;
        let replaced = false;
        for (const candidate of [
          `/${fileName}`,
          fileName,
          `./${fileName}`,
        ]) {
          const encoded = JSON.stringify(candidate);
          if (!code.includes(encoded)) continue;
          code = code.replaceAll(encoded, workerUrl);
          replaced = true;
          break;
        }
        if (!replaced)
          throw new Error(
            `Canvas entrypoint does not reference ${fileName}.`,
          );
        fs.unlinkSync(workerPath);
      }
      code = code.replace(/[ \t]+$/gm, "");
      fs.writeFileSync(entryPath, code);
      const staleCss = path.join(canvasOutput, "avoozl.css");
      if (fs.existsSync(staleCss)) fs.unlinkSync(staleCss);
      if (fs.existsSync(assets) && fs.readdirSync(assets).length === 0)
        fs.rmdirSync(assets);
      if (/\/assets\/editor\.worker-|__AVOOZL_BUNDLED_CSS__/.test(code))
        throw new Error("Canvas App still contains an external asset.");
    },
  };
}

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [
    {
      name: "openhands-navigation-bridge",
      enforce: "pre",
      resolveId(source, importer) {
        if (source === "./Chat" && importer?.endsWith("/src/web/App.tsx"))
          return canvasChat;
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
    selfContainedCanvasApp(),
  ],
  build: {
    target: "es2022",
    outDir: "canvas-app",
    emptyOutDir: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    lib: {
      entry: "src/web/canvas.tsx",
      formats: ["es"],
      fileName: () => "extension.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
