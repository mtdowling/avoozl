import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import { configureApiBaseUrl, get } from "./api";
import appStyles from "./styles.css?inline";

const STORAGE_PREFIX = "avoozl.canvas.url";
const DEFAULT_URL = "http://127.0.0.1:9428";
const APP_VERSION = "0.1.4";
const bundledDependencyStyles = "__AVOOZL_BUNDLED_CSS__";

type CanvasHost = {
  apiVersion: string;
  extension: { name: string; version: string };
  backend: { id: string; orgId?: string | null };
  agentServer?: {
    request: <T>(input: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      path: string;
      body?: unknown;
    }) => Promise<T>;
  };
  appBackendView?: {
    mount: (input: { container: HTMLElement }) => () => void;
  };
  registerPage: (
    id: string,
    mount: (input: {
      container: HTMLElement;
      path: string;
      navigate: (path: string) => void;
    }) => void | (() => void) | Promise<void | (() => void)>,
  ) => () => void;
};

const shellStyles = `
:host {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: var(--oh-foreground, #eef2f7);
  font-family: var(--oh-font-body, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
}
.avoozl-canvas-root {
  width: 100%;
  height: 100%;
  min-width: 320px;
  min-height: 0;
  overflow: hidden;
  color-scheme: dark;
  --bg: var(--oh-color-base, #0b0e14);
  --panel: var(--oh-color-base-secondary, #21252f);
  --panel-2: var(--oh-surface-raised, #2c313f);
  --panel-3: var(--oh-interactive-hover, #383f50);
  --line: var(--oh-border, #4b5468);
  --border: var(--oh-border, #4b5468);
  --muted: var(--oh-muted, #a3b0c4);
  --text: var(--oh-foreground, #eef2f7);
  --bright: var(--oh-contrast, #fff);
  --accent: var(--oh-color-primary, #c9b974);
  --accent-2: var(--oh-color-primary, #c9b974);
  --selected: var(--oh-color-primary, #c9b974);
  --danger: var(--oh-danger, #e76a5e);
  --on: var(--oh-success, #a5e75e);
  --landed: var(--oh-success, #a5e75e);
}
.avoozl-canvas-root .app-shell.canvas-host,
.avoozl-canvas-root .app-main {
  height: 100%;
  min-height: 0;
}
.avoozl-canvas-root .canvas-host .app-main {
  overflow: auto;
}
.avoozl-canvas-root .canvas-host .screen {
  height: calc(100% - 40px);
}
.avoozl-canvas-setup {
  min-height: min(680px, calc(100dvh - 48px));
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--oh-color-base, #0b0e14);
}
.avoozl-canvas-card {
  width: min(100%, 560px);
  padding: 24px;
  border: 1px solid var(--oh-border, #4b5468);
  border-radius: 12px;
  background: var(--oh-color-base-secondary, #21252f);
}
.avoozl-canvas-card h1 {
  margin: 0;
  color: var(--oh-contrast, #fff);
  font-size: 20px;
  font-weight: 600;
}
.avoozl-canvas-card > p {
  margin: 8px 0 20px;
  color: var(--oh-muted, #a3b0c4);
  font-size: 14px;
  line-height: 1.5;
}
.avoozl-canvas-field {
  display: grid;
  gap: 8px;
  color: var(--oh-contrast, #fff);
  font-size: 14px;
  font-weight: 500;
}
.avoozl-canvas-field input,
.avoozl-canvas-button {
  min-height: 36px;
  border-radius: 8px;
  font: inherit;
}
.avoozl-canvas-field input {
  width: 100%;
  padding: 0 12px;
  border: 1px solid var(--oh-border, #4b5468);
  background: var(--oh-color-base-secondary, #21252f);
  color: var(--oh-contrast, #fff);
}
.avoozl-canvas-hint {
  color: var(--oh-muted, #a3b0c4);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}
.avoozl-canvas-error {
  min-height: 18px;
  margin: 10px 0 0;
  color: var(--oh-danger, #e76a5e);
  font-size: 12px;
}
.avoozl-canvas-button {
  margin-top: 10px;
  padding: 0 12px;
  border: 0;
  background: var(--oh-color-primary, #c9b974);
  color: var(--oh-accent-foreground, #0b0e14);
  cursor: pointer;
}
`;

function canvasStyles() {
  return appStyles
    .replace(":root {", ".avoozl-canvas-root {")
    .replace("html, body, #root {", ".avoozl-canvas-root {")
    .replace("body {", ".avoozl-canvas-root {")
    .replaceAll("body.resizing-panels", ".avoozl-canvas-root.resizing-panels");
}

function storageKey(host: CanvasHost) {
  return `${STORAGE_PREFIX}:${host.backend.id}:${host.backend.orgId || "local"}`;
}

function normalizedUrl(value: string) {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Use an HTTP or HTTPS Avoozl address.");
  if (url.username || url.password)
    throw new Error("Do not put credentials in the Avoozl address.");
  url.hash = "";
  url.search = "";
  return url.href.replace(/\/$/, "");
}

function element<K extends keyof HTMLElementTagNameMap>(
  name: K,
  text = "",
  className = "",
) {
  const node = document.createElement(name);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function createSurface(container: HTMLElement) {
  const host = document.createElement("div");
  host.style.width = "100%";
  host.style.height = "100%";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = shellStyles;
  shadow.append(style);
  container.replaceChildren(host);
  return { host, shadow };
}

function setupView(
  host: CanvasHost,
  shadow: ShadowRoot,
  connect: (url: string) => Promise<void>,
  initialError = "",
) {
  const shell = element("div", "", "avoozl-canvas-setup");
  const panel = element("section", "", "avoozl-canvas-card");
  const title = element("h1", "Connect Avoozl");
  const copy = element(
    "p",
    "Start the machine-local Avoozl server, then connect this trusted OpenHands App.",
  );
  const label = element("label", "Avoozl address", "avoozl-canvas-field");
  const input = element("input");
  input.type = "url";
  input.required = true;
  input.value = localStorage.getItem(storageKey(host)) || DEFAULT_URL;
  input.placeholder = DEFAULT_URL;
  const note = element(
    "span",
    `Avoozl must allow this exact Canvas origin: ${window.location.origin}`,
    "avoozl-canvas-hint",
  );
  label.append(input, note);
  const error = element("p", initialError, "avoozl-canvas-error");
  error.setAttribute("role", "alert");
  const button = element("button", "Open Avoozl", "avoozl-canvas-button");
  button.type = "button";
  const open = async () => {
    button.disabled = true;
    error.textContent = "";
    try {
      await connect(normalizedUrl(input.value));
    } catch (cause) {
      error.textContent =
        cause instanceof Error ? cause.message : String(cause);
      button.disabled = false;
    }
  };
  button.addEventListener("click", () => void open());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void open();
  });
  panel.append(title, copy, label, error, button);
  shell.append(panel);
  shadow.replaceChildren(shadow.firstChild!, shell);
}

function workspaceView(
  host: CanvasHost,
  container: HTMLElement,
  navigate: (path: string) => void,
) {
  let disposed = false;
  let root: Root | null = null;
  const surface = createSurface(container);
  const connect = async (url: string) => {
    configureApiBaseUrl(url);
    await get("/api/health");
    if (disposed) return;
    localStorage.setItem(storageKey(host), url);
    const style = document.createElement("style");
    style.textContent = canvasStyles() + bundledDependencyStyles + shellStyles;
    const mount = element("div", "", "avoozl-canvas-root");
    surface.shadow.replaceChildren(style, mount);
    root = createRoot(mount);
    root.render(
      <StrictMode>
        <App canvas={{ serverUrl: url, navigate }} />
      </StrictMode>,
    );
  };
  const saved = localStorage.getItem(storageKey(host));
  if (saved) {
    connect(normalizedUrl(saved)).catch((cause) => {
      if (!disposed)
        setupView(
          host,
          surface.shadow,
          connect,
          cause instanceof Error ? cause.message : String(cause),
        );
    });
  } else setupView(host, surface.shadow, connect);
  return () => {
    disposed = true;
    root?.unmount();
    container.replaceChildren();
  };
}

type OwnedBackendStatus = {
  state?:
    | "missing"
    | "stopped"
    | "starting"
    | "ready"
    | "unhealthy"
    | "unsupported";
};

async function canvasWorkspaceView(
  host: CanvasHost,
  container: HTMLElement,
  navigate: (path: string) => void,
) {
  if (host.appBackendView && host.agentServer) {
    const status = await host.agentServer
      .request<OwnedBackendStatus>({
        path: `/api/canvas-extensions/installed/${encodeURIComponent(host.extension.name)}/backend`,
      })
      .catch(() => null);
    if (status && !["missing", "unsupported"].includes(status.state || "")) {
      return host.appBackendView.mount({ container });
    }
  }
  return workspaceView(host, container, navigate);
}

export function activate(host: CanvasHost) {
  if (host.apiVersion !== "1")
    throw new Error(
      `Avoozl requires Canvas host API 1; found ${host.apiVersion}.`,
    );
  return host.registerPage("workspace", ({ container, navigate }) =>
    canvasWorkspaceView(host, container, navigate),
  );
}

export { APP_VERSION };
