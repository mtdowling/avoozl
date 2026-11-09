import test from "node:test";
import assert from "node:assert/strict";
import { documentHeadings, renderMarkdown } from "../../markdown.mjs";
import { documentPages } from "../../document-pages.mjs";

const ids = (html) =>
  [...html.matchAll(/<h[1-6] id="([^"]+)"/g)].map((match) => match[1]);
test("TOC discovery follows every heading form rendered by Markdown", () => {
  const source =
    "Title\n=====\n\n   ## Indented\n\n> ## Quoted\n>\n> Body.\n\n- Item\n\n  ### Nested\n\n## Repeat\n\nRepeat\n------\n\n```nupp\n## Not a heading\n```";
  const headings = documentHeadings(source);
  assert.deepEqual(
    headings.map((h) => h.id),
    ["title", "indented", "quoted", "nested", "repeat", "repeat-1"],
  );
  assert.deepEqual(
    ids(renderMarkdown(source)),
    headings.map((h) => h.id),
  );
});
test("paged Markdown preserves nested blocks and global heading identities", () => {
  const source = Array.from(
    { length: 12 },
    (_, i) =>
      "Repeated\n========\n\n> ## Quoted\n>\n> Paragraph " +
      i +
      ".\n\n- Item\n  - Nested\n    continued\n\n```nupp\n## Not a heading\n```\n",
  ).join("\n");
  const pages = documentPages(source, 10);
  assert(pages.length > 2);
  assert.equal(pages.map((page) => page.text).join("\n"), source);
  const rendered = pages.flatMap((page) =>
    ids(renderMarkdown(page.text, undefined, { headingIds: page.headings })),
  );
  assert.deepEqual(
    rendered,
    documentHeadings(source).map((h) => h.id),
  );
  assert.equal(new Set(rendered).size, rendered.length);
  for (const page of pages)
    assert.equal((page.text.match(/^```/gm) || []).length % 2, 0);
});
test("paging retains source bytes and TOC identity for CRLF documents", () => {
  const source = "Title\r\n=====\r\n\r\n## A\r\n\r\nParagraph.\r\n\r\n## A\r\n";
  const pages = documentPages(source, 3);
  assert.equal(pages.map((page) => page.text).join("\n"), source);
  assert.deepEqual(
    pages.flatMap((page) =>
      ids(renderMarkdown(page.text, undefined, { headingIds: page.headings })),
    ),
    ["title", "a", "a-1"],
  );
});
