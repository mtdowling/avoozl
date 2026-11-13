import fs from "node:fs";

// The Kiro Crew app folder (agents/, skills/, app.json). From a checkout it
// is kirocrew-app/ at the repository root. Installed, the app is that folder
// copied whole, and build-kirocrew-app.mjs puts this module at
// <app>/bin/lib/src/app/, so the app is four levels up.
const APP_ROOT = [
  new URL("../../kirocrew-app/", import.meta.url),
  new URL("../../../../", import.meta.url),
].find((root) => fs.existsSync(new URL("app.json", root)));

// The URL of a file in the app folder, such as "agents/avoozl-retro.json",
// or null when neither layout has the app.
export function appFile(relative) {
  return APP_ROOT ? new URL(relative, APP_ROOT) : null;
}
