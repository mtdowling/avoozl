import { useEffect, useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AgentServerUIProviders } from "@openhands/agent-canvas";
import { ConversationView } from "@openhands/agent-canvas/conversation";
import "@openhands/agent-canvas/styles.css";

type Surface = {
  host: string;
  apiKey: string;
  conversationId: string;
  expiresAt: string;
};

export default function OpenHandsSurface({ runId }: { runId: string }) {
  const [surface, setSurface] = useState<Surface | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setSurface(null);
    setError("");
    fetch("/api/openhands-surface", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok)
          throw Error(value.error || "OpenHands surface failed.");
        return value as Surface;
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
      <AgentServerUIProviders
        analytics={false}
        resolveCloudOrganization={false}
      >
        <MemoryRouter
          initialEntries={[
            `/conversations/${encodeURIComponent(surface.conversationId)}`,
          ]}
        >
          <Routes>
            <Route
              path="/conversations/:conversationId"
              element={<ConversationView />}
            />
          </Routes>
        </MemoryRouter>
      </AgentServerUIProviders>
    </div>
  );
}
