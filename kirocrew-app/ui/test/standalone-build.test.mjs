// The built standalone page (SW2, SW6, SW12): its files, its stylesheet, its
// size, and what it must not hold. `npm run build` makes dist/standalone/.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseSync } from "rolldown/utils";
import {
  STANDALONE_NOTICES,
  missingNotices,
} from "../../../scripts/release-scan.mjs";
import { missingClasses } from "./class-tokens.mjs";
import { listStyleTexts } from "../../../scripts/standalone-styles.mjs";

const root = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const ui = path.join(root, "kirocrew-app", "ui");
const dist = path.join(ui, "dist");
const out = path.join(dist, "standalone");
const src = path.join(ui, "src");
const text = (file) => fs.readFileSync(file, "utf8");
const built = () => JSON.parse(text(path.join(dist, "standalone-build.json")));
const walk = (dir) =>
  fs
    .readdirSync(dir, { recursive: true })
    .map((name) => path.join(dir, name))
    .filter((file) => fs.statSync(file).isFile());
const stylesheet = (dir) => {
  const found = fs
    .readdirSync(path.join(dir, "assets"))
    .filter((n) => n.endsWith(".css"));
  assert.equal(found.length, 1, "one stylesheet");
  return text(path.join(dir, "assets", found[0]));
};
const pageSources = () =>
  fs
    .readdirSync(src, { recursive: true })
    .filter((name) => /\.tsx$/.test(name))
    .map((name) => [
      name.split(path.sep).join("/"),
      text(path.join(src, name)),
    ]);

test("the standalone folder is one page, one script, one stylesheet and fonts (SW2.1)", () => {
  const files = walk(out).map((file) =>
    path.relative(out, file).split(path.sep).join("/"),
  );
  assert.ok(files.includes("index.html"));
  assert.equal(files.filter((f) => f.endsWith(".js")).length, 1);
  assert.equal(files.filter((f) => f.endsWith(".css")).length, 1);
  assert.equal(files.filter((f) => f.endsWith(".mjs")).length, 0);
  for (const name of STANDALONE_NOTICES)
    assert.ok(files.includes(name), `${name} is in the bundle`);
  const html = text(path.join(out, "index.html"));
  assert.doesNotMatch(
    html.replace(/<script[^>]*\ssrc=[^>]*><\/script>/g, ""),
    /<script/,
    "no inline script",
  );
  assert.match(html, /name="avoozl-csrf"/);
});

test("the script is within its budget and holds no dashboard module (SW2.6)", () => {
  const budget = Number(
    text(path.join(ui, "standalone.config.ts"))
      .match(/SCRIPT_BUDGET_BYTES = ([\d_]+)/)[1]
      .replaceAll("_", ""),
  );
  const script = walk(out).find((f) => f.endsWith(".js"));
  assert.ok(
    fs.statSync(script).size <= budget,
    `script is over ${budget} bytes`,
  );
  const body = text(script);
  // The build lists the Kiro Crew modules it holds; none is the dashboard.
  const modules = built().kirocrewModules;
  assert.ok(
    modules.length > 10 && modules.length < 80,
    `${modules.length} Kiro Crew modules`,
  );
  const dashboard = modules.filter((file) =>
    /^website\/src\/(pages|pierre|chat-core|shell|store|apps)\//.test(file),
  );
  assert.deepEqual(dashboard, []);
});

test("the files hold no machine path (SW2.4)", () => {
  const needles = [
    os.homedir(),
    root,
    os.tmpdir() + path.sep + "kc-",
    process.env.XDG_CACHE_HOME,
  ].filter(Boolean);
  for (const file of walk(out)) {
    if (!/\.(js|css|html|md|txt)$/.test(file) && !/(LICENSE|NOTICE)/.test(file))
      continue;
    const body = text(file);
    for (const needle of needles)
      assert.ok(
        !body.includes(needle),
        `${path.relative(out, file)} holds ${needle}`,
      );
  }
});

test("every font the stylesheet names is in the bundle (SW6.4)", () => {
  const css = stylesheet(out);
  assert.doesNotMatch(css, /url\(data:/);
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) =>
    m[1].replace(/['"]/g, ""),
  );
  assert.ok(urls.length > 8);
  for (const url of urls) {
    assert.ok(url.startsWith("/apps/avoozl/"), url);
    assert.ok(
      fs.existsSync(path.join(out, url.slice("/apps/avoozl/".length))),
      `${url} is missing`,
    );
  }
});

// SW6.3: every var(--name) the page reads without a fallback is defined for the default palette,
// in both modes. Names the page sets itself are its own.
export function declared(css, mode) {
  const names = new Set();
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = block[1].split(",").map((s) => s.trim());
    if (
      !selectors.some(
        (s) =>
          s === ":root" ||
          s === `[data-theme=kiro-${mode}]` ||
          s === `[data-theme="kiro-${mode}"]`,
      )
    )
      continue;
    for (const name of block[2].matchAll(/(--[a-zA-Z0-9-]+)\s*:/g))
      names.add(name[1]);
  }
  return names;
}
export function usedVariables(sources) {
  const used = new Map(),
    own = new Set();
  for (const [file, body] of sources) {
    // A name inside another var()'s fallback is optional, like a name with one.
    for (const m of body.matchAll(/(?<!,)var\((--[a-zA-Z0-9-]*[a-zA-Z0-9])\)/g))
      used.set(m[1], [...(used.get(m[1]) ?? []), file]);
    // A name the page sets itself: a key, a quoted name, or a declaration.
    for (const m of body.matchAll(
      /['"`](--[a-zA-Z0-9-]+)['"`]|(--[a-zA-Z0-9-]+)\s*:/g,
    ))
      own.add(m[1] ?? m[2]);
  }
  return [...used].filter(([name]) => !own.has(name));
}

test("the built stylesheet defines every variable the page reads, in both modes (SW6.3)", () => {
  const css = stylesheet(out),
    missing = [];
  for (const mode of ["dark", "light"]) {
    const have = declared(css, mode);
    assert.ok(have.size > 50, `${mode} palette is read`);
    for (const [name, files] of usedVariables(pageSources()))
      if (!have.has(name))
        missing.push(`${mode} ${name}: ${[...new Set(files)].join(", ")}`);
  }
  assert.deepEqual(missing, []);
});

test("the variable check finds a missing name", () => {
  const css = "[data-theme=kiro-dark]{--a:1}:root{--b:2}";
  assert.deepEqual([...declared(css, "dark")].sort(), ["--a", "--b"]);
  assert.deepEqual([...declared(css, "light")], ["--b"]);
  assert.deepEqual(
    usedVariables([["X.tsx", "color: var(--zzz); --own: 1; var(--own)"]]),
    [["--zzz", ["X.tsx"]]],
  );
});

test("the page's classes are in the built stylesheet, with no skip (SW2.3)", () => {
  assert.deepEqual(
    // A class the page's own <style> texts define counts as defined.
    missingClasses(
      stylesheet(out) + built().styles.join("\n"),
      Object.fromEntries(pageSources()),
    ),
    [],
  );
});

test("Kiro Crew's own stylesheet, without the page, lacks a planted class (SW12.9)", () => {
  const css = stylesheet(path.join(dist, "kirocrew-only"));
  assert.ok(css.length > 100_000);
  assert.deepEqual(
    missingClasses(css, {
      "Planted.tsx": '<div className="flex avoozl-planted-class" />',
    }),
    ["avoozl-planted-class: Planted.tsx"],
  );
  // What the page uses that Kiro Crew's own stylesheet lacks is what
  // host-classes-known.json lists, and nothing else.
  const known = Object.keys(
    JSON.parse(text(path.join(ui, "test", "host-classes-known.json"))),
  );
  const lacking = missingClasses(css, Object.fromEntries(pageSources())).map(
    (line) => line.split(": ")[0],
  );
  assert.deepEqual(lacking.sort(), known.sort());
});

test("the styles the page renders are listed, and a run-time style fails the build (SW2.5)", () => {
  const listed = listStyleTexts(src);
  assert.equal(listed.length, 24);
  assert.deepEqual(
    [...new Set(listed.map((s) => s.text))].sort(),
    [...built().styles].sort(),
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kc-style-"));
  fs.writeFileSync(
    path.join(dir, "A.tsx"),
    "const f = () => 'x'\nexport const A = () => <style>{f()}</style>\n",
  );
  assert.throws(
    () => listStyleTexts(dir),
    /A\.tsx: a <style> text is built at run time/,
  );
});

test("the release scan fails with a notice removed (SW12.6)", () => {
  const all = [
    "kirocrew-app/ui/dist/standalone/index.html",
    ...STANDALONE_NOTICES.map((n) => `kirocrew-app/ui/dist/standalone/${n}`),
  ];
  assert.deepEqual(missingNotices(all), []);
  assert.deepEqual(missingNotices(all.filter((f) => !f.endsWith("/NOTICE"))), [
    "kirocrew-app/ui/dist/standalone/NOTICE",
  ]);
  assert.deepEqual(missingNotices(["README.md"]), []);
});

test("THIRD_PARTY_NOTICES.md names every package the bundle holds (SW12.6)", () => {
  const notices = text(path.join(root, "THIRD_PARTY_NOTICES.md"));
  const names = Object.keys(built().packages).map((n) => n.replace(/18$/, ""));
  for (const name of names)
    assert.ok(
      notices.includes(name),
      `${name} is not in THIRD_PARTY_NOTICES.md`,
    );
});

// SW2.2: the Kiro Crew bundle keeps its externals and takes nothing from the
// standalone entry.
export function importSpecifiers(file) {
  const { program } = parseSync(file, text(file), { lang: "js" });
  const found = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (
      /^(Import|ExportAll|ExportNamed)Declaration$/.test(node.type) &&
      node.source
    )
      found.add(node.source.value);
    if (node.type === "ImportExpression" && node.source?.type === "Literal")
      found.add(node.source.value);
    for (const key of Object.keys(node)) if (key !== "type") visit(node[key]);
  };
  visit(program);
  return [...found].sort();
}

test("the Kiro Crew bundles keep the import specifiers they had (SW2.2)", () => {
  const fixture = JSON.parse(
    text(path.join(ui, "test", "bundle-imports.json")),
  );
  assert.deepEqual(
    importSpecifiers(path.join(dist, "index.mjs")),
    fixture["index.mjs"],
  );
  assert.deepEqual(
    importSpecifiers(path.join(dist, "panel.mjs")),
    fixture["panel.mjs"],
  );
  assert.doesNotMatch(
    text(path.join(dist, "index.mjs")),
    /avoozl-csrf|AppApiProvider/,
  );
});
