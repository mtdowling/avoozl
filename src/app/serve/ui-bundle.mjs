// The installed page must come from the page source installed beside it.
// `kirocrew app update` copies kirocrew-app as it lies in the checkout and does
// not build, and ui/dist is not in git, so a pull without `npm run build` left
// an older page installed with nothing saying so. The build stamps the hash of
// ui/src into ui/dist; the backend compares it with the ui/src it was
// installed with and refuses the page's requests when they differ.
// shortcut: covers the page only; bin/lib has no source in the installed copy
// to compare with. Stamp the repository's src too if a stale backend recurs.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const UI_STAMP = "build.json";
export const UPDATE_COMMAND = "npm run build && kirocrew app update avoozl";

// One hash of every file under ui/src, by its forward-slash relative path.
// Skips dot files and the folders Kiro Crew's install does not copy, so a
// Finder .DS_Store in the checkout does not read as a stale page.
const UNCOPIED = new Set(["node_modules", "__pycache__"]);
function uiSourceHash(uiDir) {
  const source = path.join(uiDir, "src"),
    hash = crypto.createHash("sha256");
  const files = fs
    .readdirSync(source, { recursive: true })
    .map((name) => String(name).split(path.sep).join("/"))
    .filter(
      (name) =>
        !name
          .split("/")
          .some((part) => part.startsWith(".") || UNCOPIED.has(part)) &&
        fs.statSync(path.join(source, name)).isFile(),
    )
    .sort();
  for (const name of files)
    hash
      .update(name)
      .update("\0")
      .update(fs.readFileSync(path.join(source, name)))
      .update("\0");
  return hash.digest("hex");
}

export function writeUiStamp(uiDir) {
  fs.writeFileSync(
    path.join(uiDir, "dist", UI_STAMP),
    JSON.stringify({ source: uiSourceHash(uiDir) }, null, 2) + "\n",
  );
}

// null when the built page matches ui/src, else the sentence a person sees.
export function uiBundleProblem(uiDir) {
  let stamp;
  try {
    stamp = JSON.parse(
      fs.readFileSync(path.join(uiDir, "dist", UI_STAMP), "utf8"),
    );
    if (!fs.existsSync(path.join(uiDir, "dist", "index.mjs"))) stamp = null;
  } catch {
    stamp = null;
  }
  if (!stamp)
    return `This Avoozl install has no built page (kirocrew-app/ui/dist). In the Avoozl checkout, run: ${UPDATE_COMMAND}`;
  if (stamp.source !== uiSourceHash(uiDir))
    return `This Avoozl page is out of date: kirocrew-app/ui/dist was built from other source than kirocrew-app/ui/src. In the Avoozl checkout, run: ${UPDATE_COMMAND}`;
  return null;
}

// The ui folder that holds the built standalone page: beside the checkout's
// src/app, or beside the installed app's bin/lib copy of it.
export function standaloneUiDirectory(here = import.meta.dirname) {
  const candidates = [
    path.join(here, "..", "..", "..", "kirocrew-app", "ui"),
    path.join(here, "..", "..", "..", "..", "..", "ui"),
    path.join(here, "..", "..", "..", "..", "..", "..", "ui"),
  ];
  const found = candidates.find((dir) =>
    fs.existsSync(path.join(dir, "dist", "standalone", "index.html")),
  );
  if (!found)
    throw Error("The standalone page is not built. Run npm run build.");
  return found;
}
