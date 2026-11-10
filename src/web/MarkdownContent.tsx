import { createElement, type HTMLAttributes } from "react";
import ReactMarkdown from "react-markdown";

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

export default function MarkdownContent({
  text,
  anchored = false,
}: {
  text: string;
  anchored?: boolean;
}) {
  const counts = new Map<string, number>();
  const heading =
    (level: 1 | 2 | 3 | 4 | 5 | 6) =>
    ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) =>
      createElement(
        `h${level}`,
        anchored ? { ...props, id: headingId(String(children), counts) } : props,
        children,
      );
  return (
    <ReactMarkdown
      components={
        anchored
          ? {
              h1: heading(1),
              h2: heading(2),
              h3: heading(3),
              h4: heading(4),
              h5: heading(5),
              h6: heading(6),
            }
          : undefined
      }
    >
      {text}
    </ReactMarkdown>
  );
}
