import {
  createElement,
  isValidElement,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";

function headingId(title: string, counts: Map<string, number>) {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "section";
  const count = counts.get(base) || 0;
  counts.set(base, count + 1);
  return `${base}${count ? `-${count}` : ""}`;
}

function headingText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(headingText).join("");
  if (isValidElement<{ children?: ReactNode }>(node))
    return headingText(node.props.children);
  return "";
}

export default function MarkdownContent({
  text,
  anchored = false,
  headingIds,
}: {
  text: string;
  anchored?: boolean;
  headingIds?: string[];
}) {
  const counts = new Map<string, number>();
  let headingIndex = 0;
  const heading =
    (level: 1 | 2 | 3 | 4 | 5 | 6) =>
    ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) =>
      createElement(
        `h${level}`,
        anchored
          ? {
              ...props,
              id:
                headingIds?.[headingIndex++] ||
                headingId(headingText(children), counts),
            }
          : props,
        children,
      );
  const components: Components = {
    pre: MarkdownCodeBlock,
    table: ({ children, ...props }) => (
      <div className="markdown-table-scroll">
        <table {...props}>{children}</table>
      </div>
    ),
    ...(anchored
      ? {
          h1: heading(1),
          h2: heading(2),
          h3: heading(3),
          h4: heading(4),
          h5: heading(5),
          h6: heading(6),
        }
      : {}),
  };
  return (
    <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
      {text}
    </ReactMarkdown>
  );
}
