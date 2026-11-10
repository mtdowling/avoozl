import { useMemo } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import {
  AgentServerUIProviders,
  createAgentServerI18n,
  OPENHANDS_I18N_NAMESPACE,
  translationResources,
} from "@openhands/agent-canvas";
import { ConversationView } from "@openhands/agent-canvas/conversation";
import "@openhands/agent-canvas/styles.css";
import { NavigationProvider } from "./openhands-navigation-context";
import { SidebarMobileNavProvider } from "./openhands-sidebar-mobile-nav-context";
import type { OpenHandsSurfaceCapability } from "./OpenHandsSurface";

const openHandsI18n = createAgentServerI18n();
for (const [language, resources] of Object.entries(translationResources))
  openHandsI18n.addResourceBundle(
    language,
    OPENHANDS_I18N_NAMESPACE,
    resources,
    true,
    true,
  );

function ConversationUnavailable() {
  return (
    <div className="center-state">
      This OpenHands conversation is no longer available.
    </div>
  );
}

function OpenHandsConversation({
  conversationId,
}: {
  conversationId: string;
}) {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const navigation = useMemo(
    () => ({
      currentPath: location.pathname,
      conversationId,
      isNavigating: false,
      navigate: (to: string, options?: { replace?: boolean }) => {
        void routerNavigate(to, { replace: options?.replace });
      },
    }),
    [conversationId, location.pathname, routerNavigate],
  );
  return (
    <NavigationProvider value={navigation}>
      <SidebarMobileNavProvider>
        <ConversationView />
      </SidebarMobileNavProvider>
    </NavigationProvider>
  );
}

export default function OpenHandsCanvas({
  surface,
}: {
  surface: OpenHandsSurfaceCapability;
}) {
  return (
    <AgentServerUIProviders
      analytics={false}
      i18n={openHandsI18n}
      resolveCloudOrganization={false}
    >
      <MemoryRouter
        initialEntries={[
          `/conversations/${encodeURIComponent(surface.conversationId)}`,
        ]}
      >
        <Routes>
          <Route
            path="/conversations/:conversationId/*"
            element={
              <OpenHandsConversation conversationId={surface.conversationId} />
            }
          />
          <Route path="*" element={<ConversationUnavailable />} />
        </Routes>
      </MemoryRouter>
    </AgentServerUIProviders>
  );
}
