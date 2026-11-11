import {
  Children,
  isValidElement,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import type { ExtraProps } from "react-markdown";
import bash from "refractor/bash";
import clike from "refractor/clike";
import css from "refractor/css";
import go from "refractor/go";
import java from "refractor/java";
import javascript from "refractor/javascript";
import json from "refractor/json";
import jsx from "refractor/jsx";
import markdown from "refractor/markdown";
import markup from "refractor/markup";
import python from "refractor/python";
import rust from "refractor/rust";
import sql from "refractor/sql";
import tsx from "refractor/tsx";
import typescript from "refractor/typescript";
import yaml from "refractor/yaml";
import { refractor } from "refractor/core";
import type { RootContent } from "hast";

const languages = {
  bash,
  clike,
  css,
  go,
  java,
  javascript,
  json,
  jsx,
  markdown,
  markup,
  python,
  rust,
  sql,
  tsx,
  typescript,
  yaml,
};

for (const grammar of Object.values(languages)) {
  refractor.register(grammar);
}

const languageAliases: Record<string, keyof typeof languages> = {
  c: "clike",
  cpp: "clike",
  h: "clike",
  html: "markup",
  js: "javascript",
  md: "markdown",
  py: "python",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  yml: "yaml",
};

function textContent(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (!value) return "";
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(value)) {
    return textContent(value.props.children);
  }
  return "";
}

function highlightedNode(node: RootContent, key: number): ReactNode {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return null;
  const className = Array.isArray(node.properties.className)
    ? node.properties.className.join(" ")
    : String(node.properties.className || "");
  return (
    <span className={className || undefined} key={key}>
      {node.children.map(highlightedNode)}
    </span>
  );
}

type MarkdownPreProps = ComponentPropsWithoutRef<"pre"> & ExtraProps;

export function MarkdownCodeBlock({
  children,
  node: _node,
  ...props
}: MarkdownPreProps) {
  const child = Children.count(children) === 1 ? Children.only(children) : null;
  if (!isValidElement<{ children?: ReactNode; className?: string }>(child)) {
    return <pre {...props}>{children}</pre>;
  }

  const requestedLanguage =
    /(?:^|\s)language-([A-Za-z0-9#+.-]+)/
      .exec(child.props.className || "")?.[1]
      ?.toLowerCase() || "";
  const language =
    languageAliases[requestedLanguage] ||
    (requestedLanguage in languages
      ? (requestedLanguage as keyof typeof languages)
      : null);
  if (!language) return <pre {...props}>{children}</pre>;

  const code = textContent(child.props.children).replace(/\n$/, "");
  const highlighted = refractor.highlight(code, language);
  return (
    <div
      className="markdown-code-block"
      data-language={requestedLanguage}
      aria-label={`${requestedLanguage} code`}
    >
      <span className="markdown-code-language" aria-hidden="true">
        {requestedLanguage}
      </span>
      <pre {...props}>
        <code className={child.props.className}>
          {highlighted.children.map(highlightedNode)}
        </code>
      </pre>
    </div>
  );
}
