import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CREW_AGENT, BUILD_COMMAND, appBuildCheck } from "../crew-agent.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const app = path.join(
  fileURLToPath(new URL("../../../", import.meta.url)),
  "kirocrew-app",
);
const read = (file) =>
  JSON.parse(fs.readFileSync(path.join(app, file), "utf8"));

test("the crew agent is listed in the app and holds the D8 tools and skills", () => {
  const manifest = read("app.json"),
    spec = read("agents/avoozl-crew.json");
  assert.ok(manifest.agents.includes("agents/avoozl-crew.json"));
  assert.equal(spec.name, CREW_AGENT);
  assert.equal(spec.includeMcpJson, false);
  assert.ok(
    spec.tools.every(
      (t) =>
        !t.startsWith("@avoozl:avoozl/") ||
        t === "@avoozl:avoozl/plans_verify_issue",
    ),
  );
  for (const tool of [
    "@avoozl:avoozl/plans_verify_issue",
    "@kirocrew-core/skill_search",
    "@kirocrew-core/issue_radar_crew_read",
    "@kirocrew-core/issue_radar_crew_record",
  ])
    assert.ok(spec.tools.includes(tool), tool);
  for (const skill of ["avoozl", "avoozl-rules"]) {
    assert.ok(spec.resources.includes(`skill://skills/${skill}/SKILL.md`));
    assert.ok(fs.existsSync(path.join(app, "skills", skill, "SKILL.md")));
  }
});

test("an install with no bin/lib is refused and names the command", () => {
  const dir = temporaryDirectory();
  fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
  const refused = appBuildCheck(dir);
  assert.equal(refused.ok, false);
  assert.equal(refused.command, BUILD_COMMAND);
  assert.match(refused.message, /npm run build:kirocrew-app/);
  fs.mkdirSync(path.join(dir, "bin", "lib"));
  assert.equal(appBuildCheck(dir).ok, false, "an empty bin/lib is not a build");
  fs.writeFileSync(path.join(dir, "bin", "lib", "cli.mjs"), "");
  assert.equal(appBuildCheck(dir).ok, true);
});

test("the built app passes the build check", () => {
  assert.equal(appBuildCheck(app).ok, true);
});
