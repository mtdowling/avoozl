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

function pythonLeaks(sources) {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import ast,json,re,sys
native={"open_session","send_to_session","set_session_mode","list_session_folders","create_session_folder"}
fields={"folder_id","project_dir"}
def path_problem(value):
    return isinstance(value,str) and (value.startswith("Avoozl/") or re.match(r"^/api/chat/folders(?:/|$)",value) or re.search(r"(?:^|/)agents/.*[.]json$",value))
out=[]
for name,source in json.load(sys.stdin):
    found=set()
    def visit(node):
        # Standalone strings include module, class and function docstrings.
        if isinstance(node,ast.Expr) and isinstance(node.value,ast.Constant) and isinstance(node.value.value,str): return
        if isinstance(node,ast.Attribute) and node.attr in native: found.add("native session API")
        if isinstance(node,ast.Name) and node.id in native: found.add("native session API")
        if isinstance(node,ast.Attribute) and node.attr in fields: found.add("native project field")
        if isinstance(node,ast.keyword) and node.arg in fields: found.add("native project field")
        if isinstance(node,ast.Dict) and any(isinstance(key,ast.Constant) and key.value in fields for key in node.keys): found.add("native project field")
        if isinstance(node,ast.Constant) and path_problem(node.value): found.add("native asset/sidebar path")
        if isinstance(node,ast.JoinedStr):
            joined="".join(value.value if isinstance(value,ast.Constant) and isinstance(value.value,str) else "value" for value in node.values)
            if path_problem(joined): found.add("native asset/sidebar f-string")
        if isinstance(node,ast.Call):
            strings=[value.value for arg in node.args for value in ast.walk(arg) if isinstance(value,ast.Constant) and isinstance(value.value,str)]
            if "agents" in strings and any(value.endswith(".json") for value in strings): found.add("native agent filename construction")
        for child in ast.iter_child_nodes(node): visit(child)
    visit(ast.parse(source,filename=name))
    if found: out.append([name,sorted(found)])
print(json.dumps(out))
`,
      ],
      { input: JSON.stringify(sources), encoding: "utf8" },
    ),
  );
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
      python.push([name, fs.readFileSync(path.join(root, name), "utf8")]);
      continue;
    }
    const found = await jsLeaks(
      fs.readFileSync(path.join(root, name), "utf8"),
      name,
    );
    if (found.length) leaked.push([name, [...new Set(found)]]);
  }
  leaked.push(...pythonLeaks(python));
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

test("the Python boundary detects f-strings and constructed paths without flagging prose", () => {
  assert.deepEqual(
    pythonLeaks([
      [
        "prose.py",
        '# ctx.open_session(folder_id="x")\n"""Avoozl/{repository} and agents/old.json describe old behavior."""\ndef read():\n    """ctx.open_session(project_dir="x")"""\n    return None\n',
      ],
    ]),
    [],
  );
  for (const source of [
    'folder=f"Avoozl/{repository}"',
    'asset=f"{root}/agents/{role}.json"',
    'asset=os.path.join(root,"agents",role+".json")',
    'ctx.open_session("task",folder_id="x")',
    'request={"project_dir":"x"}',
  ])
    assert.ok(pythonLeaks([["leak.py", source]]).length, source);
});
