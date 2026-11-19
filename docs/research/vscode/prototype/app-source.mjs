import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
export const appRoot = process.env.AICOMMANDER_ROOT;
if (!appRoot) throw Error("Set AICOMMANDER_ROOT to the AICommander checkout");
export const importApp = (file) =>
  import(pathToFileURL(path.join(appRoot, "src/app", file)).href);
export const appRequire = createRequire(path.join(appRoot, "package.json"));
export const importSdk = () =>
  import(
    pathToFileURL(appRequire.resolve("@anthropic-ai/claude-agent-sdk")).href
  );
