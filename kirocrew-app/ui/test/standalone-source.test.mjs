// The standalone page builds on Kiro Crew's own source at a pin (SW12). These
// tests check the pin, the fetch, the paths and names the build depends on, the
// package versions, and that no view knows about the standalone build (SW1).
// They fetch the pinned source into the cache on first run.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseSync } from "rolldown/utils";
import {
  checkDigest,
  fetchKiroCrewUi,
  readPin,
  treeDigest,
} from "../../../scripts/fetch-kirocrew-ui.mjs";

const root = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const ui = path.join(root, "kirocrew-app", "ui");
const pin = readPin();
const source = () => fetchKiroCrewUi();

// Export names of a TypeScript file (values and types).
export function exportNames(file) {
  const { program } = parseSync(file, fs.readFileSync(file, "utf8"), {
    lang: file.endsWith("x") ? "tsx" : "ts",
  });
  const names = new Set();
  for (const node of program.body) {
    if (node.type === "ExportDefaultDeclaration") names.add("default");
    if (node.type !== "ExportNamedDeclaration") continue;
    const declaration = node.declaration;
    if (declaration?.type === "VariableDeclaration")
      for (const item of declaration.declarations) names.add(item.id.name);
    else if (declaration?.id) names.add(declaration.id.name);
    for (const specifier of node.specifiers)
      names.add(specifier.exported.name ?? specifier.exported.value);
  }
  return names;
}

// Every Kiro Crew path and export the build depends on (SW12.4). A release
// that moves one fails on its line here and nowhere else.
export const CONTRACT = {
  paths: [
    "LICENSE",
    "NOTICE",
    "THIRD-PARTY-NOTICES",
    "website/package.json",
    "website/package-lock.json",
    "website/src/index.css",
    "website/src/tailwind-theme.css",
    "website/src/styles/font-faces.css",
    "website/public/fonts/jetbrains-mono/OFL.txt",
    "website/public/fonts/opendyslexic/OFL.txt",
    "website/public/fonts/space-grotesk/OFL.txt",
  ],
  exports: {
    "website/src/app-sdk/index.ts": [
      "AppApiProvider",
      "useAppApi",
      "useNavigate",
      "useChatLauncher",
    ],
    "website/src/components/ui.tsx": [
      "Card",
      "CardTitle",
      "Btn",
      "Input",
      "Badge",
      "EmptyState",
      "PageHeader",
    ],
    "website/src/components/SegmentedControl.tsx": ["default"],
  },
};

export function contractProblems(folder, contract = CONTRACT) {
  const problems = [];
  for (const entry of contract.paths)
    if (!fs.existsSync(path.join(folder, entry)))
      problems.push(`missing path ${entry}`);
  for (const [file, wanted] of Object.entries(contract.exports)) {
    const full = path.join(folder, file);
    if (!fs.existsSync(full)) {
      problems.push(`missing path ${file}`);
      continue;
    }
    const found = exportNames(full);
    for (const name of wanted)
      if (!found.has(name)) problems.push(`${file} no longer exports ${name}`);
  }
  return problems;
}

test("the pin names a release, a commit and a digest", () => {
  assert.match(pin.tag, /^v\d+\.\d+\.\d+/);
  assert.match(pin.commit, /^[0-9a-f]{40}$/);
  assert.match(pin.digest, /^sha256:[0-9a-f]{64}$/);
});

test("the pin is not older than the Kiro Crew the app asks for (SW12.8)", () => {
  const minimum = JSON.parse(
    fs.readFileSync(path.join(root, "kirocrew-app", "app.json"), "utf8"),
  ).minKiroCrewVersion;
  const parts = (version) => version.replace(/^v/, "").split(".").map(Number);
  const [a, b] = [parts(pin.tag), parts(minimum)];
  const at = a.findIndex((n, index) => n !== b[index]);
  assert.ok(at < 0 || a[at] > b[at], `pin ${pin.tag} is older than ${minimum}`);
});

test("the README names the pin beside the Kiro Crew version it asks for (SW12.8)", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.ok(readme.includes(pin.tag), `README.md does not name ${pin.tag}`);
  assert.match(readme, /standalone page/i);
});

test("the fetch refuses a tree whose digest differs", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "kc-pin-"));
  fs.mkdirSync(path.join(folder, "website", "src"), { recursive: true });
  fs.writeFileSync(path.join(folder, "LICENSE"), "not Kiro Crew's license\n");
  assert.throws(
    () => fetchKiroCrewUi({ pin, env: { AVOOZL_KIROCREW_SOURCE: folder } }),
    /does not match the pin/,
  );
});

test("a source that cannot be had fails saying so", () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "kc-none-"));
  assert.throws(
    () =>
      fetchKiroCrewUi({
        pin: { ...pin, repository: path.join(cache, "no-such-repo.git") },
        env: {},
        cache,
      }),
    /could not be had/,
  );
});

test("the build script builds Kiro Crew's bundles before the standalone page and still stamps them", () => {
  const script = fs.readFileSync(
    path.join(root, "scripts", "build-kirocrew-app.mjs"),
    "utf8",
  );
  const at = (text) => script.indexOf(text);
  assert.ok(at("writeUiStamp(ui)") > 0);
  assert.ok(at("buildStandalone(") > at("writeUiStamp(ui)"));
  assert.match(script, /standaloneError/);
});

test("the cache is the pinned tree, byte for byte (SW12.2)", () => {
  checkDigest(source(), pin);
  assert.equal(treeDigest(source()), pin.digest);
});

test("no Kiro Crew file is in git (SW12.1)", () => {
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  const bad = tracked.filter((file) =>
    /(^|\/)website\/(src|public)\/|(^|\/)(THIRD-PARTY-NOTICES|NOTICE)$/.test(
      file,
    ),
  );
  assert.deepEqual(bad, []);
});

test("every path and export the build depends on is in the pinned source", () => {
  assert.deepEqual(contractProblems(source()), []);
});

test("the contract test names a moved path or export", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "kc-contract-"));
  fs.mkdirSync(path.join(folder, "a"));
  fs.writeFileSync(path.join(folder, "a", "x.ts"), "export const Kept = 1\n");
  const problems = contractProblems(folder, {
    paths: ["gone.css"],
    exports: { "a/x.ts": ["Kept", "Moved"], "a/y.ts": ["Any"] },
  });
  assert.deepEqual(problems, [
    "missing path gone.css",
    "a/x.ts no longer exports Moved",
    "missing path a/y.ts",
  ]);
});

// Packages the page takes from Kiro Crew's lockfile (SW12.5): each installed
// version must equal the version the pin's own lockfile resolves.
const ALIASES = { react18: "react", "react-dom18": "react-dom" };
export function versionProblems(lock, installed) {
  const problems = [];
  for (const [name, version] of Object.entries(installed)) {
    const lockName = ALIASES[name] ?? name;
    const wanted = lock.packages[`node_modules/${lockName}`]?.version;
    // Packages that are not Kiro Crew's own (the page's Prism) have no entry.
    if (wanted && wanted !== version)
      problems.push(`${name} is ${version}; the pin's lockfile has ${wanted}`);
  }
  return problems;
}

test("every bundled package is at the version the pin's lockfile resolves", () => {
  const lock = JSON.parse(
    fs.readFileSync(
      path.join(source(), "website", "package-lock.json"),
      "utf8",
    ),
  );
  const built = JSON.parse(
    fs.readFileSync(path.join(ui, "dist", "standalone-build.json"), "utf8"),
  );
  assert.deepEqual(versionProblems(lock, built.packages), []);
  assert.ok(Object.keys(built.packages).length > 8);
});

test("the version test fails on a package that differs", () => {
  const lock = { packages: { "node_modules/react": { version: "18.3.1" } } };
  assert.deepEqual(versionProblems(lock, { react18: "19.0.0" }), [
    "react18 is 19.0.0; the pin's lockfile has 18.3.1",
  ]);
});

// SW1.7: nothing under standalone/ may export a name the SDK exports, and no
// view may import a Kiro Crew file by path.
export function sdkNames(folder) {
  return new Set([
    ...exportNames(path.join(folder, "website/src/app-sdk/index.ts")),
    ...exportNames(path.join(folder, "website/src/kirocrew-ui/index.ts")),
  ]);
}
export function clashes(dir, names) {
  const found = [];
  for (const name of fs.readdirSync(dir))
    if (/\.tsx?$/.test(name))
      for (const exported of exportNames(path.join(dir, name)))
        if (names.has(exported) && exported !== "default")
          found.push(`${name} exports ${exported}`);
  return found;
}

test("nothing under standalone/ exports a name the SDK exports (SW1.7)", () => {
  assert.deepEqual(
    clashes(path.join(ui, "src", "standalone"), sdkNames(source())),
    [],
  );
});

test("the clash check finds a planted export", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kc-clash-"));
  fs.writeFileSync(path.join(dir, "x.ts"), "export const Btn = 1\n");
  assert.deepEqual(clashes(dir, new Set(["Btn"])), ["x.ts exports Btn"]);
});

// A view reaches Kiro Crew only through @kirocrew/app-sdk, never by path.
export function pathImports(dir) {
  const found = [];
  for (const name of fs.readdirSync(dir, { recursive: true }))
    if (/\.tsx?$/.test(name) && !name.startsWith(`standalone${path.sep}`)) {
      const text = fs.readFileSync(path.join(dir, name), "utf8");
      for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g))
        if (
          !match[1].startsWith("@kirocrew/") &&
          (/(^|\/)website\/|kirocrew-ui|app-sdk/.test(match[1]) ||
            match[1].startsWith("@/"))
        )
          found.push(`${name}: ${match[1]}`);
    }
  return found;
}

test("no view imports a Kiro Crew file by path (SW1.2)", () => {
  assert.deepEqual(pathImports(path.join(ui, "src")), []);
});

test("no view tests which build it runs in (SW1.2); the host comes from instance.view (SW10.3)", () => {
  const dir = path.join(ui, "src");
  const found = [];
  for (const name of fs.readdirSync(dir, { recursive: true }))
    if (/\.tsx?$/.test(name) && !name.startsWith(`standalone${path.sep}`)) {
      const text = fs.readFileSync(path.join(dir, name), "utf8");
      if (
        /__[A-Z_]*STANDALONE|isStandalone|import\.meta\.env|process\.env/.test(
          text,
        )
      )
        found.push(name);
    }
  assert.deepEqual(found, []);
});
