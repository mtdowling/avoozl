// Lists the text of every <style> element the page renders (SW2.5), so the
// server's content security policy can allow each by hash. A text must be
// known when the page is built: a string, a template, a number, a `+` of
// those, or a number sum, or a top-level const (in the same file or an imported one) that is
// one. Any other child is a style built at run time, and the build fails on it.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseSync } from "rolldown/utils";

const EXTENSIONS = ["", ".tsx", ".ts", ".mjs", ".js"];

// The parsed program, and the expression nodes the evaluator reads.
type Program = ReturnType<typeof parseSync>["program"];
type Statement = Program["body"][number];
type Expression = NonNullable<
  Extract<
    Statement,
    { type: "VariableDeclaration" }
  >["declarations"][number]["init"]
>;

function resolveModule(from: string, specifier: string) {
  const base = path.resolve(path.dirname(from), specifier);
  for (const extension of EXTENSIONS) {
    const file = base + extension;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

class Module {
  file: string;
  modules: Modules;
  program: Program;
  consts: Map<string, Expression>;
  imports: Map<string, { from: string; name: string }>;
  constructor(file: string, modules: Modules) {
    this.file = file;
    this.modules = modules;
    const { program } = parseSync(file, fs.readFileSync(file, "utf8"), {
      lang: file.endsWith("x") ? "tsx" : "ts",
    });
    this.program = program;
    this.consts = new Map();
    this.imports = new Map();
    for (const node of program.body) {
      const declaration =
        node.type === "ExportNamedDeclaration" ? node.declaration : node;
      if (declaration?.type === "VariableDeclaration")
        for (const item of declaration.declarations)
          if (item.id.type === "Identifier" && item.init)
            this.consts.set(item.id.name, item.init);
      if (
        node.type === "ImportDeclaration" &&
        node.source.value.startsWith(".")
      )
        for (const specifier of node.specifiers)
          if (specifier.type === "ImportSpecifier")
            this.imports.set(specifier.local.name, {
              from: node.source.value,
              name:
                specifier.imported.type === "Identifier"
                  ? specifier.imported.name
                  : String(specifier.imported.value),
            });
    }
  }

  // The value of an expression, or throws when it is not known at build time.
  // Strings, numbers, arrays, objects, a few operators, `.map(arrow)` and
  // `.join(text)`: enough for a text made of constants.
  value(
    node: Expression,
    seen = new Set<string>(),
    scope = new Map<string, unknown>(),
  ): unknown {
    const again = (child: Expression | null | { type: string }): unknown =>
      child && isExpression(child)
        ? this.value(child, seen, scope)
        : unknownValue();
    switch (node.type) {
      case "Literal":
        return node.value;
      case "TemplateLiteral": {
        let out = "";
        node.quasis.forEach((quasi, index) => {
          out += quasi.value.cooked;
          if (node.expressions[index])
            out += String(again(node.expressions[index]));
        });
        return out;
      }
      case "BinaryExpression": {
        const left = again(node.left),
          right = again(node.right);
        if (node.operator === "+")
          return typeof left === "number" && typeof right === "number"
            ? left + right
            : String(left) + String(right);
        if (typeof left === "number" && typeof right === "number") {
          if (node.operator === "-") return left - right;
          if (node.operator === "*") return left * right;
        }
        break;
      }
      case "ParenthesizedExpression":
      case "TSAsExpression":
      case "TSSatisfiesExpression":
        return again(node.expression);
      case "ArrayExpression":
        return node.elements.map(again);
      case "ObjectExpression":
        return Object.fromEntries(
          node.properties.map((property) =>
            property.type === "Property"
              ? [
                  property.key.type === "Identifier" && !property.computed
                    ? property.key.name
                    : again(property.key),
                  again(property.value),
                ]
              : unknownValue(),
          ),
        );
      case "MemberExpression": {
        const object = again(node.object),
          key = node.computed
            ? again(node.property)
            : node.property.type === "Identifier"
              ? node.property.name
              : unknownValue();
        if (
          object !== null &&
          typeof object === "object" &&
          (typeof key === "string" || typeof key === "number") &&
          Object.hasOwn(object, key)
        )
          return Reflect.get(object, key);
        break;
      }
      case "CallExpression": {
        const callee = node.callee;
        if (callee.type === "MemberExpression" && !callee.computed) {
          const target = again(callee.object);
          const method =
            callee.property.type === "Identifier" ? callee.property.name : "";
          if (Array.isArray(target) && method === "join")
            return target.join(
              node.arguments.length ? String(again(node.arguments[0])) : ",",
            );
          const fn = node.arguments[0];
          if (
            Array.isArray(target) &&
            method === "map" &&
            fn?.type === "ArrowFunctionExpression" &&
            fn.expression
          ) {
            const names = fn.params.flatMap((param) =>
                param.type === "Identifier" ? [param.name] : [],
              ),
              body = fn.body;
            if (names.length === fn.params.length && isExpression(body))
              return target.map((item, index) => {
                const inner = new Map(scope);
                names.forEach((name, at) => inner.set(name, at ? index : item));
                return this.value(body, seen, inner);
              });
          }
        }
        break;
      }
      case "Identifier":
        if (scope.has(node.name)) return scope.get(node.name);
        return this.identifier(node.name, seen);
    }
    throw new Error("not known at build time");
  }

  identifier(name: string, seen: Set<string>): unknown {
    const key = `${this.file}:${name}`;
    if (seen.has(key)) throw new Error("not known at build time");
    seen.add(key);
    try {
      const local = this.consts.get(name);
      if (local) return this.value(local, seen);
      const imported = this.imports.get(name);
      if (imported) {
        const file = resolveModule(this.file, imported.from);
        if (file) return this.modules.get(file).identifier(imported.name, seen);
      }
      throw new Error("not known at build time");
    } finally {
      seen.delete(key);
    }
  }
}

class Modules {
  cache = new Map<string, Module>();
  get(file: string): Module {
    const module = this.cache.get(file) ?? new Module(file, this);
    this.cache.set(file, module);
    return module;
  }
}

// A JSX element node.
type JSXElement = Extract<Expression, { type: "JSXElement" }>;
// Every JSX element under a node, in source order.
function* elements(node: unknown): Generator<JSXElement> {
  if (Array.isArray(node)) for (const item of node) yield* elements(item);
  else if (node && typeof node === "object") {
    if (isJSXElement(node)) yield node;
    for (const [key, child] of Object.entries(node))
      if (key !== "type") yield* elements(child);
  }
}

// What a node's `type` says it is. The AST comes from the parser, so its
// type field names its shape.
function isExpression(node: { type: string }): node is Expression {
  return EXPRESSION_TYPES.has(node.type);
}
function isJSXElement(node: object): node is JSXElement {
  return "type" in node && node.type === "JSXElement";
}
// The node types value() reads; any other one is not known at build time.
const EXPRESSION_TYPES = new Set([
  "Literal",
  "TemplateLiteral",
  "BinaryExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "ArrayExpression",
  "ObjectExpression",
  "MemberExpression",
  "CallExpression",
  "Identifier",
]);
const unknownValue = (): never => {
  throw new Error("not known at build time");
};

// [{ file, text }] for every <style> in the page's own sources.
export function listStyleTexts(srcDir: string) {
  const modules = new Modules(),
    found: { file: string; text: string }[] = [],
    files = fs
      .readdirSync(srcDir, { recursive: true, encoding: "utf8" })
      .filter((name) => /\.tsx$/.test(name))
      .map((name) => path.join(srcDir, name))
      .sort();
  for (const file of files) {
    const module = modules.get(file);
    for (const element of elements(module.program)) {
      const open = element.openingElement;
      if (open.name.type !== "JSXIdentifier" || open.name.name !== "style")
        continue;
      let text = "";
      for (const child of element.children) {
        if (child.type === "JSXText") {
          // JSX drops text that is only whitespace around a line break.
          if (/^\s*\n\s*$/.test(child.value)) continue;
          text += child.value;
        } else if (child.type === "JSXExpressionContainer") {
          try {
            text += String(
              isExpression(child.expression)
                ? module.value(child.expression)
                : unknownValue(),
            );
          } catch {
            throw new Error(
              `${path.relative(srcDir, file)}: a <style> text is built at run time. The standalone page's content security policy allows each style text by hash, so it must be a string, a template of constants, or a const.`,
            );
          }
        }
      }
      found.push({
        file: path.relative(srcDir, file).split(path.sep).join("/"),
        text,
      });
    }
  }
  return found;
}

export const styleHash = (text: string) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
