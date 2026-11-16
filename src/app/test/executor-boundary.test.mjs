// P56's static boundary check. The live worker/receipt remains a separate proof.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const nativeCalls = new Set([
  "open_session",
  "send_to_session",
  "set_session_mode",
  "list_session_folders",
  "create_session_folder",
]);
const privatePath = (name) =>
  name === "src/app/executors/kirocrew.mjs" ||
  name.startsWith("src/app/executors/kirocrew/") ||
  name === "kirocrew-app/executors/kirocrew.py" ||
  name === "kirocrew-app/ui/src/executors/kirocrew.ts";
const pathProblem = (value) =>
  typeof value === "string" &&
  (/^Avoozl\//.test(value) ||
    /^\/api\/chat\/folders(?:\/|$)/.test(value) ||
    /(?:^|\/)agents\/.*\.json$/.test(value));

async function jsLeaks(source, name) {
  const { ast } = await prettier.__debug.parse(source, {
      parser: /\.tsx?$/.test(name) ? "babel-ts" : "babel",
    }),
    found = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (
      (node.type === "MemberExpression" ||
        node.type === "OptionalMemberExpression") &&
      nativeCalls.has(node.property?.name ?? node.property?.value)
    )
      found.push("native session API");
    if (
      ["ObjectProperty", "MemberExpression"].includes(node.type) &&
      ["folder_id", "project_dir"].includes(
        node.key?.name ??
          node.key?.value ??
          node.property?.name ??
          node.property?.value,
      )
    )
      found.push("native project field");
    if (node.type === "StringLiteral" && pathProblem(node.value))
      found.push("native asset/sidebar path");
    if (
      node.type === "TemplateLiteral" &&
      pathProblem(node.quasis.map((part) => part.value.raw).join("value"))
    )
      found.push("native asset/sidebar template");
    if (node.type === "CallExpression") {
      const fragments = [];
      function literals(value) {
        if (!value || typeof value !== "object") return;
        if (value.type === "StringLiteral") fragments.push(value.value);
        for (const [key, child] of Object.entries(value)) {
          if (["loc", "comments", "tokens"].includes(key)) continue;
          if (Array.isArray(child)) child.forEach(literals);
          else if (child && typeof child === "object") literals(child);
        }
      }
      node.arguments.forEach(literals);
      if (
        fragments.includes("agents") &&
        fragments.some((value) => value.endsWith(".json"))
      )
        found.push("native agent filename construction");
    }
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "comments", "tokens"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(ast.program);
  return found;
}

function files(directory) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, directory), {
    withFileTypes: true,
  })) {
    const name = `${directory}/${entry.name}`;
    if (["test", "tests", "node_modules", "__pycache__"].includes(entry.name))
      continue;
    if (["kirocrew-app/ui/dist", "kirocrew-app/bin/lib"].includes(name))
      continue;
    if (entry.isDirectory()) result.push(...files(name));
    else if (/\.(mjs|js|ts|tsx|py)$/.test(name) && !/\.test\./.test(name))
      result.push(name);
  }
  return result;
}

test("the runtime boundary rejects native folder/project/agent-file paths outside its executor", async () => {
  const leaked = [],
    python = [];
  for (const name of [
    ...files("src"),
    ...files("kirocrew-app/crons"),
    ...files("kirocrew-app/executors"),
    ...files("kirocrew-app/bin"),
    ...files("kirocrew-app/ui/src"),
    "cli.mjs",
  ]) {
    if (privatePath(name)) continue;
    if (name.endsWith(".py")) {
      python.push(path.join(root, name));
      continue;
    }
    const found = await jsLeaks(
      fs.readFileSync(path.join(root, name), "utf8"),
      name,
    );
    if (found.length) leaked.push([name, [...new Set(found)]]);
  }
  const tokens = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import ast,json,sys,tokenize
out=[]
for name in sys.argv[1:]:
    with tokenize.open(name) as f: source=f.read()
    rows=[]
    for token in tokenize.generate_tokens(iter(source.splitlines(True)).__next__):
        if token.type==tokenize.NAME: rows.append(["name",token.string])
        elif token.type==tokenize.STRING:
            try: rows.append(["string",ast.literal_eval(token.string)])
            except (ValueError,SyntaxError): pass
    out.append([name,rows])
print(json.dumps(out))
`,
        ...python,
      ],
      { encoding: "utf8" },
    ),
  );
  for (const [name, rows] of tokens)
    if (
      rows.some(([kind, value]) =>
        kind === "name"
          ? nativeCalls.has(value) ||
            ["folder_id", "project_dir"].includes(value)
          : pathProblem(value),
      )
    )
      leaked.push([path.relative(root, name), ["native Python detail"]]);
  assert.deepEqual(leaked, []);
});

test("the boundary detects executable leaks while ignoring descriptive comments", async () => {
  assert.deepEqual(
    await jsLeaks(
      "// ctx.open_session({folder_id:'x'}); new URL('agents/x.json');\nconst text='A descriptive note about folders.';",
      "sample.mjs",
    ),
    [],
  );
  for (const source of [
    "ctx.open_session('task')",
    "const request={folder_id:'x'}",
    "const location=`Avoozl/${id}`",
    "fs.readFileSync(path.join(root,'agents',name+'.json'))",
    "const asset=new URL('agents/worker.json',import.meta.url)",
  ])
    assert.ok((await jsLeaks(source, "sample.mjs")).length, source);
});
