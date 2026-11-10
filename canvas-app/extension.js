const STORAGE_PREFIX = "avoozl.canvas.url";
const DEFAULT_URL = "http://127.0.0.1:9428";
const STYLE_MARKER = "avoozl";
const STYLES = `
.avoozl-canvas {
  min-height: 100%;
  color: var(--oh-foreground, #eef2f7);
  font-family: var(--oh-font-body, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
}
.avoozl-canvas,
.avoozl-canvas * {
  box-sizing: border-box;
}
.avoozl-canvas__setup {
  min-height: min(680px, calc(100dvh - 48px));
  display: grid;
  place-items: center;
  padding: 24px;
}
.avoozl-canvas__card {
  width: min(100%, 560px);
  padding: 24px;
  border: 1px solid var(--oh-border, #4b5468);
  border-radius: 12px;
  background: var(--oh-color-base-secondary, #21252f);
}
.avoozl-canvas__card h1 {
  margin: 0;
  color: var(--oh-contrast, #fff);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.avoozl-canvas__card > p {
  margin: 8px 0 20px;
  color: var(--oh-muted, #a3b0c4);
  font-size: 14px;
  line-height: 1.5;
}
.avoozl-canvas__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--oh-contrast, #fff);
  font-size: 14px;
  font-weight: 500;
}
.avoozl-canvas__field input,
.avoozl-canvas__button {
  min-height: 36px;
  border-radius: 8px;
  font: inherit;
  transition: background-color 75ms, border-color 75ms, box-shadow 75ms, opacity 75ms;
}
.avoozl-canvas__field input {
  width: 100%;
  padding: 0 12px;
  border: 1px solid var(--oh-border, #4b5468);
  background: var(--oh-color-base-secondary, #21252f);
  color: var(--oh-contrast, #fff);
}
.avoozl-canvas__field input:focus-visible,
.avoozl-canvas__button:focus-visible,
.avoozl-canvas__change:focus-visible {
  outline: 2px solid var(--oh-focus, #fff);
  outline-offset: 2px;
}
.avoozl-canvas__hint {
  color: var(--oh-muted, #a3b0c4);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}
.avoozl-canvas__error {
  min-height: 18px;
  margin: 10px 0 0;
  color: var(--oh-danger, #e76a5e);
  font-size: 12px;
}
.avoozl-canvas__button {
  margin-top: 10px;
  padding: 0 12px;
  border: 0;
  background: var(--oh-color-primary, #c9b974);
  color: var(--oh-accent-foreground, #0b0e14);
  cursor: pointer;
}
.avoozl-canvas__button:hover {
  opacity: 0.8;
}
.avoozl-canvas__workspace {
  height: 100dvh;
  min-height: 680px;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--oh-color-base, #0b0e14);
}
.avoozl-canvas__toolbar {
  min-height: 36px;
  flex: 0 0 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border-bottom: 1px solid var(--oh-border-subtle, #383f50);
  background: var(--oh-color-base-secondary, #21252f);
  color: var(--oh-muted, #a3b0c4);
  font-size: 12px;
}
.avoozl-canvas__location {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.avoozl-canvas__change {
  flex: none;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--oh-contrast, #fff);
  font: inherit;
  cursor: pointer;
}
.avoozl-canvas__change:hover {
  background: var(--oh-surface-raised, #2c313f);
}
.avoozl-canvas__frame {
  display: block;
  min-height: 0;
  width: 100%;
  flex: 1;
  border: 0;
  background: var(--oh-color-base, #0b0e14);
}
@media (prefers-reduced-motion: reduce) {
  .avoozl-canvas__field input,
  .avoozl-canvas__button {
    transition: none;
  }
}
`;

const THEME_PROPERTIES = Object.freeze({
  "--bg": ["--oh-color-base", "#0b0e14"],
  "--panel": ["--oh-color-base-secondary", "#21252f"],
  "--panel-2": ["--oh-surface-raised", "#2c313f"],
  "--panel-3": ["--oh-interactive-hover", "#383f50"],
  "--line": ["--oh-border", "#4b5468"],
  "--border": ["--oh-border", "#4b5468"],
  "--muted": ["--oh-muted", "#a3b0c4"],
  "--text": ["--oh-foreground", "#eef2f7"],
  "--bright": ["--oh-contrast", "#fff"],
  "--accent": ["--oh-color-primary", "#c9b974"],
  "--accent-2": ["--oh-color-primary", "#c9b974"],
  "--selected": ["--oh-color-primary", "#c9b974"],
  "--danger": ["--oh-danger", "#e76a5e"],
  "--on": ["--oh-success", "#a5e75e"],
  "--landed": ["--oh-success", "#a5e75e"],
});

function installStyles() {
  if (typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.dataset.canvasAppStyle = STYLE_MARKER;
  style.textContent = STYLES;
  document.head.append(style);
  return () => style.remove();
}

function canvasTheme() {
  const computed = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(THEME_PROPERTIES).map(([target, [source, fallback]]) => [
      target,
      computed.getPropertyValue(source).trim() || fallback,
    ]),
  );
}

function storageKey(host) {
  return `${STORAGE_PREFIX}:${host.backend.id}:${host.backend.orgId || "local"}`;
}

function normalizedUrl(value) {
  const url = new URL(String(value || "").trim());
  if (!["http:", "https:"].includes(url.protocol))
    throw Error("Use an HTTP or HTTPS Avoozl address.");
  if (url.username || url.password)
    throw Error("Do not put credentials in the Avoozl address.");
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

function element(name, text, className) {
  const node = document.createElement(name);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function setupView(host, container, connect) {
  const root = element("div", "", "avoozl-canvas");
  const shell = element("div", "", "avoozl-canvas__setup");
  const panel = element("section", "", "avoozl-canvas__card");
  const title = element("h1", "Connect Avoozl");
  const copy = element(
    "p",
    "Avoozl remains a machine-local control plane. Start it, then connect this trusted Canvas App to its address.",
  );
  const label = element("label", "Avoozl address", "avoozl-canvas__field");
  const input = element("input");
  input.type = "url";
  input.required = true;
  input.value = localStorage.getItem(storageKey(host)) || DEFAULT_URL;
  input.placeholder = DEFAULT_URL;
  const note = element(
    "span",
    "The address is stored only in this browser for the selected OpenHands backend. Tokens and provider credentials are never stored here.",
    "avoozl-canvas__hint",
  );
  label.append(input, note);
  const error = element("p", "", "avoozl-canvas__error");
  error.setAttribute("role", "alert");
  const button = element("button", "Open Avoozl", "avoozl-canvas__button");
  button.type = "button";
  button.addEventListener("click", () => {
    try {
      const url = normalizedUrl(input.value);
      localStorage.setItem(storageKey(host), url);
      connect(url);
    } catch (cause) {
      error.textContent = cause.message;
    }
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") button.click();
  });
  panel.append(title, copy, label, error, button);
  shell.append(panel);
  root.append(shell);
  container.replaceChildren(root);
}

function workspaceView(host, container) {
  let disposed = false;
  let frame;
  const openConversation = (event) => {
    if (
      disposed ||
      event.source !== frame?.contentWindow ||
      event.origin !== new URL(frame.src).origin ||
      event.data?.type !== "avoozl:openhands-conversation" ||
      typeof event.data.conversationId !== "string"
    )
      return;
    host.navigate(
      `/conversations/${encodeURIComponent(event.data.conversationId)}`,
    );
  };
  window.addEventListener("message", openConversation);
  const connect = (url) => {
    if (disposed) return;
    const root = element("div", "", "avoozl-canvas");
    const shell = element("div", "", "avoozl-canvas__workspace");
    const toolbar = element("div", "", "avoozl-canvas__toolbar");
    const location = element("span", url, "avoozl-canvas__location");
    const change = element(
      "button",
      "Change connection",
      "avoozl-canvas__change",
    );
    change.type = "button";
    change.addEventListener("click", () => setupView(host, container, connect));
    toolbar.append(location, change);
    frame = element("iframe", "", "avoozl-canvas__frame");
    frame.title = "Avoozl workspace";
    const target = new URL(url);
    target.searchParams.set("canvas", "1");
    frame.src = target.href;
    frame.referrerPolicy = "no-referrer";
    frame.addEventListener("load", () => {
      frame?.contentWindow?.postMessage(
        { type: "avoozl:canvas-theme", theme: canvasTheme() },
        target.origin,
      );
    });
    shell.append(toolbar, frame);
    root.append(shell);
    container.replaceChildren(root);
  };

  const saved = localStorage.getItem(storageKey(host));
  if (saved) {
    try {
      connect(normalizedUrl(saved));
    } catch {
      localStorage.removeItem(storageKey(host));
      setupView(host, container, connect);
    }
  } else setupView(host, container, connect);

  return () => {
    disposed = true;
    window.removeEventListener("message", openConversation);
    container.replaceChildren();
  };
}

export function activate(host) {
  if (host.apiVersion !== "1")
    throw Error(`Avoozl requires Canvas host API 1; found ${host.apiVersion}.`);
  const disposeStyles = installStyles();
  const unregister = host.registerPage("workspace", ({ container }) =>
    workspaceView(host, container),
  );
  return () => {
    unregister();
    disposeStyles();
  };
}
