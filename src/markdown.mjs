import { Marked, Renderer } from "./marked.mjs";
import { escapeHTML, codeBlock } from "./highlight.mjs";
const headingTitle = (text) =>
  text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*]/g, "");
function headingId(title, counts) {
  const base =
      headingTitle(title)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-") || "section",
    count = counts.get(base) || 0;
  counts.set(base, count + 1);
  return base + (count ? "-" + count : "");
}
export function documentBlocks(text) {
  const lexer = new Marked({ gfm: true }),
    counts = new Map();
  let line = 0;
  return lexer.lexer(protectTablePipes(String(text))).map((token) => {
    const block = { line, type: token.type, headings: [] };
    lexer.walkTokens([token], (child) => {
      if (child.type === "heading")
        block.headings.push({
          id: headingId(child.text, counts),
          title: headingTitle(child.text),
          level: child.depth,
          line: block.line,
        });
    });
    line += (token.raw.match(/\n/g) || []).length;
    return block;
  });
}
export function documentHeadings(text) {
  return documentBlocks(text).flatMap((block) =>
    block.headings.map(({ line, ...heading }) => heading),
  );
}

function safeHref(value) {
  try {
    const clean = String(value).replace(/[\x00-\x20]/g, "");
    return ["http:", "https:", "mailto:"].includes(
      new URL(clean, "http://plans.local/").protocol,
    )
      ? String(value)
      : null;
  } catch {
    return null;
  }
}
function parser({ inline, rewriteHref = (value) => value, headingIds } = {}) {
  const counts = new Map();
  let heading = 0;
  return new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      table(token) {
        return (
          '<div class="markdown-table">' +
          Renderer.prototype.table.call(this, token) +
          "</div>"
        );
      },
      html({ text }) {
        return escapeHTML(text);
      },
      code({ text, lang }) {
        return codeBlock(text, lang || "");
      },
      heading({ text, tokens, depth }) {
        const generated = headingId(text, counts),
          id = headingIds?.[heading++];
        return (
          "<h" +
          depth +
          ' id="' +
          escapeHTML(typeof id === "object" ? id.id : id || generated) +
          '">' +
          this.parser.parseInline(tokens) +
          "</h" +
          depth +
          ">\n"
        );
      },
      link({ href, title, tokens, text }) {
        const safe = safeHref(rewriteHref(href));
        if (!safe) return this.parser.parseInline(tokens);
        if (inline) return inline("[" + text + "](" + safe + ")");
        return (
          '<a href="' +
          escapeHTML(safe) +
          '"' +
          (title ? ' title="' + escapeHTML(title) + '"' : "") +
          (/^https?:/.test(safe)
            ? ' target="_blank" rel="noopener noreferrer"'
            : "") +
          ">" +
          this.parser.parseInline(tokens) +
          "</a>"
        );
      },
      image({ text, href }) {
        const safe = safeHref(rewriteHref(href));
        return safe
          ? '<a class="markdown-image-link" href="' +
              escapeHTML(safe) +
              '" target="_blank" rel="noopener noreferrer">' +
              escapeHTML(text || "Image") +
              " ↗</a>"
          : escapeHTML(text || "Image");
      },
    },
  });
}
export function renderInline(text, options = {}) {
  return parser(options).parseInline(String(text));
}
export function renderMarkdown(text, inline, options = {}) {
  return parser({ ...options, inline }).parse(protectTablePipes(String(text)));
}
function protectTablePipes(text) {
  let fence = null;
  return text
    .split("\n")
    .map((line) => {
      const mark = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (mark) {
        if (!fence) fence = mark[1][0];
        else if (fence === mark[1][0]) fence = null;
        return line;
      }
      if (fence || !line.trim().startsWith("|")) return line;
      return line.replace(
        /(`+)(.*?)(\1)/g,
        (_, mark, code, end) => mark + code.replace(/(?<!\\)\|/g, "\\|") + end,
      );
    })
    .join("\n");
}

export const copyIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg>';
export async function copyMarkdown(text, button) {
  let copied = false;
  if (navigator.clipboard?.writeText)
    try {
      await navigator.clipboard.writeText(String(text));
      copied = true;
    } catch {}
  if (!copied) {
    const previous = document.activeElement,
      area = document.createElement("textarea");
    area.value = String(text);
    area.readOnly = true;
    area.setAttribute("aria-label", "Copy Markdown");
    area.style.cssText =
      "position:fixed;left:-10000px;top:0;width:1px;height:1px";
    (previous?.closest("dialog[open]") || document.body).append(area);
    const onCopy = (event) => {
      if (event.clipboardData) {
        event.clipboardData.setData("text/plain", String(text));
        event.preventDefault();
      }
    };
    document.addEventListener("copy", onCopy, { capture: true });
    try {
      area.focus({ preventScroll: true });
      area.select();
      area.setSelectionRange(0, area.value.length);
      copied = document.execCommand("copy");
    } finally {
      document.removeEventListener("copy", onCopy, { capture: true });
      area.remove();
      previous?.focus({ preventScroll: true });
    }
    if (!copied) throw Error("Could not copy Markdown.");
  }
  if (button) {
    const html = button.innerHTML,
      label = button.getAttribute("aria-label"),
      title = button.title;
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m5 12 4 4L19 6"/></svg>';
    button.title = "Copied";
    button.setAttribute("aria-label", "Copied");
    setTimeout(() => {
      if (button.isConnected) {
        button.innerHTML = html;
        button.title = title;
        button.setAttribute("aria-label", label);
      }
    }, 1200);
  }
}
