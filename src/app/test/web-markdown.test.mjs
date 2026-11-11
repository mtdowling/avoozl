import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");

test("shared Markdown rendering highlights fenced code in plans and Queue content", () => {
  const content = fs.readFileSync(
    path.join(root, "src/web/MarkdownContent.tsx"),
    "utf8",
  );
  const editor = fs.readFileSync(
    path.join(root, "src/web/Editors.tsx"),
    "utf8",
  );
  const code = fs.readFileSync(
    path.join(root, "src/web/MarkdownCodeBlock.tsx"),
    "utf8",
  );

  assert.match(content, /pre: MarkdownCodeBlock/);
  assert.match(editor, /<MarkdownContent text=\{text\} \/>/);
  assert.match(code, /refractor\.register/);
  assert.match(code, /refractor\.highlight/);
  assert.match(code, /languageAliases/);
  assert.match(code, /requestedLanguage in languages/);
  assert.match(code, /className="markdown-code-block"/);
});

test("shared Markdown rendering enables GitHub-flavored constructs", () => {
  const content = fs.readFileSync(
    path.join(root, "src/web/MarkdownContent.tsx"),
    "utf8",
  );
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );

  assert.equal(manifest.dependencies["remark-gfm"], "^4.0.1");
  assert.match(content, /import remarkGfm from "remark-gfm"/);
  assert.match(content, /remarkPlugins=\{\[remarkGfm\]\}/);
  assert.match(content, /className="markdown-table-scroll"/);
  assert.match(styles, /\.prose \.task-list-item/);
  assert.match(styles, /\.markdown-table-scroll/);
});

test("plan contents navigation targets headings inside the embedded app root", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const content = fs.readFileSync(
    path.join(root, "src/web/MarkdownContent.tsx"),
    "utf8",
  );

  assert.match(app, /className="document-reading" ref=\{readingRef\}/);
  assert.match(app, /readingRef\.current\?\.querySelectorAll\("\[id\]"\)/);
  assert.doesNotMatch(app, /document\.getElementById\(item\.id\)/);
  assert.match(app, /reader\.scrollTo\(\{ top: Math\.max\(0, top\)/);
  assert.match(app, /headingIds=\{headings/);
  assert.match(content, /headingIds\?\.\[headingIndex\+\+\]/);
  assert.match(content, /headingText\(node: ReactNode\)/);
});

test("the selected highlighter emits semantic tokens for a supported language", async () => {
  const [{ refractor }, { default: typescript }] = await Promise.all([
    import("refractor/core"),
    import("refractor/typescript"),
  ]);
  refractor.register(typescript);

  const tree = refractor.highlight(
    "const answer: number = await Promise.resolve(42);",
    "typescript",
  );
  const classes = tree.children.flatMap((node) =>
    node.type === "element" && Array.isArray(node.properties.className)
      ? node.properties.className
      : [],
  );

  assert.ok(classes.includes("token"));
  assert.ok(classes.includes("keyword"));
});
