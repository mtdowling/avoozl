import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { apiUrl } from "./api";

export type OpenHandsSurfaceCapability = {
  host: string;
  apiKey: string;
  conversationId: string;
  expiresAt: string;
};

const OpenHandsCanvas = lazy(() => import("./OpenHandsCanvas"));

class OpenHandsErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || "OpenHands workspace failed." };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("OpenHands workspace failed", error, info);
  }

  render() {
    if (this.state.error)
      return (
        <div className="center-state error">
          OpenHands workspace unavailable: {this.state.error}
        </div>
      );
    return this.props.children;
  }
}

export default function OpenHandsSurface({ runId }: { runId: string }) {
  const [surface, setSurface] =
    useState<OpenHandsSurfaceCapability | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setSurface(null);
    setError("");
    fetch(apiUrl("/api/openhands-surface"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok)
          throw Error(value.error || "OpenHands surface failed.");
        return value as OpenHandsSurfaceCapability;
      })
      .then((value) => {
        const backend = {
          id: "avoozl-" + runId,
          name: "Avoozl run",
          host: value.host,
          apiKey: value.apiKey,
          kind: "local",
          authMode: "api-key",
          connectionRevision: Date.now(),
        };
        let backends: unknown[] = [];
        try {
          const stored = JSON.parse(
            localStorage.getItem("openhands-backends") || "[]",
          );
          if (Array.isArray(stored)) backends = stored;
        } catch {
          // Replace malformed Canvas state with the run-scoped backend.
        }
        localStorage.setItem(
          "openhands-backends",
          JSON.stringify([
            ...backends.filter(
              (entry) =>
                !entry ||
                typeof entry !== "object" ||
                !("id" in entry) ||
                entry.id !== backend.id,
            ),
            backend,
          ]),
        );
        const selected = JSON.stringify({
          backendId: backend.id,
          orgId: null,
        });
        localStorage.setItem("openhands-active-backend", selected);
        sessionStorage.setItem("openhands-active-backend", selected);
        setSurface(value);
      })
      .catch((cause) => {
        if ((cause as Error).name !== "AbortError")
          setError((cause as Error).message);
      });
    return () => controller.abort();
  }, [runId]);

  if (error)
    return (
      <div className="center-state">
        OpenHands workspace unavailable: {error}
      </div>
    );
  if (!surface)
    return <div className="center-state">Opening OpenHands workspace…</div>;
  return (
    <div className="openhands-surface">
      <OpenHandsErrorBoundary key={surface.conversationId}>
        <Suspense
          fallback={
            <div className="center-state">Opening OpenHands workspace…</div>
          }
        >
          <OpenHandsCanvas surface={surface} />
        </Suspense>
      </OpenHandsErrorBoundary>
    </div>
  );
}
