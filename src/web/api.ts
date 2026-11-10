export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

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

async function read<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = value as { error?: string; details?: unknown };
    throw new ApiError(body.error || `Request failed (${response.status})`, response.status, body.details);
  }
  return value as T;
}

export async function get<T>(path: string): Promise<T> {
  return read<T>(await fetch(path, { headers: { Accept: "application/json" } }));
}

export async function command<T>(
  operation: string,
  input: Record<string, unknown> = {},
  expectedRevision?: number,
): Promise<T> {
  const response = await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, input, expectedRevision }),
  });
  const body = await read<{ result: T }>(response);
  return body.result;
}

export function submissionId() {
  return crypto.randomUUID();
}
