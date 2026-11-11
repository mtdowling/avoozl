export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

let apiBaseUrl = "";
let activeWorkspaceId = "";

export function configureApiBaseUrl(value = "") {
  if (!value) {
    apiBaseUrl = "";
    return;
  }
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Use an HTTP or HTTPS Avoozl address.");
  if (url.username || url.password)
    throw new Error("Do not put credentials in the Avoozl address.");
  url.hash = "";
  url.search = "";
  apiBaseUrl = url.href.replace(/\/$/, "");
}

export function apiUrl(path: string) {
  if (!path.startsWith("/"))
    throw new Error("Avoozl API paths must be absolute.");
  return apiBaseUrl + path;
}

export function configureWorkspaceScope(value = "") {
  activeWorkspaceId = value.trim();
}

export function workspaceApiUrl(path: string) {
  if (!activeWorkspaceId) return apiUrl(path);
  const base = `/api/workspaces/${encodeURIComponent(activeWorkspaceId)}`;
  if (path === "/database.json") return apiUrl(base + "/database.json");
  if (path.startsWith("/source")) return apiUrl(base + path);
  if (path.startsWith("/api/")) return apiUrl(base + path.slice("/api".length));
  return apiUrl(path);
}

async function read<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = value as { error?: string; details?: unknown };
    throw new ApiError(
      body.error || `Request failed (${response.status})`,
      response.status,
      body.details,
    );
  }
  return value as T;
}

export async function get<T>(path: string): Promise<T> {
  return read<T>(
    await fetch(workspaceApiUrl(path), {
      headers: { Accept: "application/json" },
    }),
  );
}

export async function getHost<T>(path: string): Promise<T> {
  return read<T>(
    await fetch(apiUrl(path), { headers: { Accept: "application/json" } }),
  );
}

export async function command<T>(
  operation: string,
  input: Record<string, unknown> = {},
  expectedRevision?: number,
): Promise<T> {
  const qualified = Boolean(activeWorkspaceId);
  const response = await fetch(
    qualified
      ? apiUrl(
          `/api/workspaces/${encodeURIComponent(activeWorkspaceId)}/operations/${encodeURIComponent(operation)}`,
        )
      : apiUrl("/api/command"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        qualified
          ? { input, expectedRevision }
          : { operation, input, expectedRevision },
      ),
    },
  );
  const body = await read<{ result?: T } & T>(response);
  return Object.prototype.hasOwnProperty.call(body, "result")
    ? (body.result as T)
    : (body as T);
}

export function submissionId() {
  return crypto.randomUUID();
}
