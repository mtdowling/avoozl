export type SessionRun = {
  id: string;
  provider?: string | null;
  providerSessionId?: string | null;
  state?: string | null;
  error?: string | { message?: string } | null;
};

export function openHandsConversationPath(run?: SessionRun | null) {
  if (
    run?.provider !== "openhands" ||
    typeof run.providerSessionId !== "string" ||
    !run.providerSessionId ||
    run.providerSessionId.length > 240
  )
    return null;
  return `/conversations/${encodeURIComponent(run.providerSessionId)}`;
}

export async function resolveSessionRun<T extends SessionRun>({
  id,
  initial,
  load,
  attempts = 40,
  delay = (milliseconds) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)),
}: {
  id: string;
  initial?: T;
  load: (id: string) => Promise<T>;
  attempts?: number;
  delay?: (milliseconds: number) => Promise<void>;
}) {
  let run = initial;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (
      run &&
      (run.provider !== "openhands" ||
        Boolean(openHandsConversationPath(run)) ||
        run.state === "failed")
    )
      return run;
    if (attempt) await delay(250);
    try {
      run = await load(id);
      lastError = undefined;
    } catch (error) {
      lastError = error;
      if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 404
      )
        throw error;
    }
  }
  if (run) return run;
  throw (
    lastError ||
    new Error("Avoozl could not find the requested conversation record.")
  );
}
