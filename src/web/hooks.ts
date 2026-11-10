import { useCallback, useEffect, useRef, useState } from "react";
import { command, get } from "./api";

export function useRemote<T>(loader: () => Promise<T>, dependencies: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const version = useRef(0);

  const reload = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    try {
      const next = await loader();
      if (version.current === current) {
        setData(next);
        setError(null);
      }
      return next;
    } catch (cause) {
      if (version.current === current) setError(cause as Error);
      throw cause;
    } finally {
      if (version.current === current) setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    void reload().catch(() => {});
  }, [reload]);

  return { data, setData, error, loading, reload };
}

export function useWorkspaceEvents(onEvent: () => void, runId?: string) {
  const callback = useRef(onEvent);
  callback.current = onEvent;

  useEffect(() => {
    let timer: number | undefined;
    const query = runId ? `?run=${encodeURIComponent(runId)}&compact=true` : "?compact=true";
    const source = new EventSource("/api/events" + query);
    source.onmessage = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback.current(), 80);
    };
    source.onerror = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback.current(), 500);
    };
    return () => {
      window.clearTimeout(timer);
      source.close();
    };
  }, [runId]);
}

export const loadWorkspace = () => get<import("./types").Workspace>("/api/workspace");
export const loadState = () => get<import("./types").State>("/api/view-state");
export const loadRun = (id: string, before?: number) =>
  command<import("./types").Run>("run.get", {
    id,
    compact: true,
    limit: 200,
    ...(before ? { before } : {}),
  });
