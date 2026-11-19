import { documentBlocks } from "./markdown.mjs";
export function documentPages(text, maxLines = 350) {
  const lines = text.split("\n"),
    blocks = documentBlocks(text);
  let start = 0,
    pageHeadings = [],
    pages = [];
  const push = (end) => {
    pages.push({
      start,
      end,
      text: lines.slice(start, end).join("\n"),
      headings: pageHeadings,
    });
    start = end;
    pageHeadings = [];
  };
  for (const block of blocks) {
    // Split between complete Markdown blocks, retaining nested lists and fences.
    if (block.type !== "space" && block.line - start >= maxLines)
      push(block.line);
    pageHeadings.push(...block.headings);
  }
  if (start < lines.length || !pages.length) push(lines.length);
  return pages;
}
