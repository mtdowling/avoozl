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

function resolveModule(from, specifier) {
  const base = path.resolve(path.dirname(from), specifier);
  for (const extension of EXTENSIONS) {
    const file = base + extension;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

class Module {
  constructor(file, modules) {
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
              name: specifier.imported.name ?? specifier.imported.value,
            });
    }
  }

  // The value of an expression, or throws when it is not known at build time.
  // Strings, numbers, arrays, objects, a few operators, `.map(arrow)` and
  // `.join(text)`: enough for a text made of constants.
  value(node, seen = new Set(), scope = new Map()) {
    const again = (child) => this.value(child, seen, scope);
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
        if (node.operator === "+") return left + right;
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
          node.properties.map((property) => [
            property.key.type === "Identifier" && !property.computed
              ? property.key.name
              : again(property.key),
            again(property.value),
          ]),
        );
      case "MemberExpression": {
        const object = again(node.object),
          key = node.computed ? again(node.property) : node.property.name;
        if (
          object !== null &&
          typeof object === "object" &&
          Object.hasOwn(object, key)
        )
          return object[key];
        break;
      }
      case "CallExpression": {
        const callee = node.callee;
        if (callee.type === "MemberExpression" && !callee.computed) {
          const target = again(callee.object);
          if (Array.isArray(target) && callee.property.name === "join")
            return target.join(
              node.arguments.length ? again(node.arguments[0]) : ",",
            );
          const fn = node.arguments[0];
          if (
            Array.isArray(target) &&
            callee.property.name === "map" &&
            fn?.type === "ArrowFunctionExpression" &&
            fn.expression &&
            fn.params.every((param) => param.type === "Identifier")
          )
            return target.map((item, index) => {
              const inner = new Map(scope);
              fn.params.forEach((param, at) =>
                inner.set(param.name, at ? index : item),
              );
              return this.value(fn.body, seen, inner);
            });
        }
        break;
      }
      case "Identifier":
        if (scope.has(node.name)) return scope.get(node.name);
        return this.identifier(node.name, seen);
    }
    throw new Error("not known at build time");
  }

  identifier(name, seen) {
    const key = `${this.file}:${name}`;
    if (seen.has(key)) throw new Error("not known at build time");
    seen.add(key);
    try {
      if (this.consts.has(name)) return this.value(this.consts.get(name), seen);
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
  cache = new Map();
  get(file) {
    if (!this.cache.has(file)) this.cache.set(file, new Module(file, this));
    return this.cache.get(file);
  }
}

function* elements(node) {
  if (Array.isArray(node)) for (const item of node) yield* elements(item);
  else if (node && typeof node === "object") {
    if (node.type === "JSXElement") yield node;
    for (const key of Object.keys(node))
      if (key !== "type") yield* elements(node[key]);
  }
}

// [{ file, text }] for every <style> in the page's own sources.
export function listStyleTexts(srcDir) {
  const modules = new Modules(),
    found = [],
    files = fs
      .readdirSync(srcDir, { recursive: true })
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
            text += String(module.value(child.expression));
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

export const styleHash = (text) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
