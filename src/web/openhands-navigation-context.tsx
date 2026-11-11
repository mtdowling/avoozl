import { createContext, useContext, type ReactNode } from "react";

export type OpenHandsNavigationValue = {
  currentPath: string;
  conversationId: string | null;
  isNavigating: boolean;
  navigate: (to: string, options?: { replace?: boolean }) => void;
};

const OpenHandsNavigationContext = createContext<OpenHandsNavigationValue>({
  currentPath: "/",
  conversationId: null,
  isNavigating: false,
  navigate: () => {},
});

export function NavigationProvider({
  value,
  children,
}: {
  value: OpenHandsNavigationValue;
  children: ReactNode;
}) {
  return (
    <OpenHandsNavigationContext.Provider value={value}>
      {children}
    </OpenHandsNavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(OpenHandsNavigationContext);
}
