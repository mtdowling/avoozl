// The standalone page's build: `vite build --mode standalone` into
// kirocrew-app/ui/dist/standalone/, on Kiro Crew's source at the pin. It runs
// after the Kiro Crew bundles are built and stamped, so a machine that cannot
// fetch that source still has them (SW12.2); this step then fails saying so.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export async function buildStandalone({
  ui = path.join(root, "kirocrew-app", "ui"),
} = {}) {
  await build({
    configFile: path.join(ui, "vite.config.ts"),
    mode: "standalone",
    logLevel: "warn",
  });
  // Kiro Crew's stylesheet by itself, for the class check (SW12.9).
  await build({
    configFile: path.join(ui, "vite.config.ts"),
    mode: "standalone-css",
    logLevel: "silent",
  });
}
