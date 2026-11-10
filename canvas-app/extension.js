const STORAGE_PREFIX = "avoozl.canvas.url";
const DEFAULT_URL = "http://127.0.0.1:9428";

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

function element(name, text, css) {
  const node = document.createElement(name);
  if (text) node.textContent = text;
  if (css) node.style.cssText = css;
  return node;
}

function setupView(host, container, connect) {
  const shell = element(
    "main",
    "",
    "min-height:100vh;display:grid;place-items:center;padding:32px;box-sizing:border-box;background:#09090b;color:#fafafa;font:14px/1.5 ui-sans-serif,system-ui,sans-serif",
  );
  const panel = element(
    "section",
    "",
    "width:min(100%,560px);padding:32px;border:1px solid #27272a;border-radius:14px;background:#111113;box-sizing:border-box",
  );
  const title = element("h1", "Connect Avoozl", "margin:0;font-size:25px");
  const copy = element(
    "p",
    "Avoozl remains a machine-local control plane. Start it, then connect this trusted Canvas App to its address.",
    "margin:10px 0 24px;color:#a1a1aa",
  );
  const label = element(
    "label",
    "Avoozl address",
    "display:flex;flex-direction:column;gap:8px;font-weight:600",
  );
  const input = element(
    "input",
    "",
    "height:44px;padding:0 12px;border:1px solid #52525b;border-radius:8px;background:#18181b;color:#fafafa;font:inherit",
  );
  input.type = "url";
  input.required = true;
  input.value = localStorage.getItem(storageKey(host)) || DEFAULT_URL;
  input.placeholder = DEFAULT_URL;
  const note = element(
    "span",
    "The address is stored only in this browser for the selected OpenHands backend. Tokens and provider credentials are never stored here.",
    "font-size:12px;font-weight:400;color:#71717a",
  );
  label.append(input, note);
  const error = element(
    "p",
    "",
    "min-height:21px;margin:12px 0 0;color:#fda4af",
  );
  error.setAttribute("role", "alert");
  const button = element(
    "button",
    "Open Avoozl",
    "margin-top:12px;min-height:42px;padding:0 18px;border:0;border-radius:8px;background:#f3ce49;color:#18181b;font:inherit;font-weight:700;cursor:pointer",
  );
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
  container.replaceChildren(shell);
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
    const shell = element(
      "div",
      "",
      "height:100vh;min-height:680px;width:100%;display:flex;flex-direction:column;background:#09090b",
    );
    const toolbar = element(
      "div",
      "",
      "height:40px;flex:0 0 40px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid #27272a;color:#a1a1aa;background:#111113;font:12px ui-sans-serif,system-ui,sans-serif;box-sizing:border-box",
    );
    const location = element("span", url);
    const change = element(
      "button",
      "Change connection",
      "border:0;background:transparent;color:#f3ce49;font:inherit;cursor:pointer",
    );
    change.type = "button";
    change.addEventListener("click", () => setupView(host, container, connect));
    toolbar.append(location, change);
    frame = element(
      "iframe",
      "",
      "display:block;flex:1;min-height:0;width:100%;border:0;background:#09090b",
    );
    frame.title = "Avoozl workspace";
    const target = new URL(url);
    target.searchParams.set("canvas", "1");
    frame.src = target.href;
    frame.referrerPolicy = "no-referrer";
    shell.append(toolbar, frame);
    container.replaceChildren(shell);
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
  return host.registerPage("workspace", ({ container }) =>
    workspaceView(host, container),
  );
}
