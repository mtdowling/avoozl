import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SidebarMobileNavValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const SidebarMobileNavContext = createContext<SidebarMobileNavValue | null>(
  null,
);

export function SidebarMobileNavProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((value) => !value), []);
  const value = useMemo(
    () => ({ isOpen, open, close, toggle }),
    [close, isOpen, open, toggle],
  );
  return (
    <SidebarMobileNavContext.Provider value={value}>
      {children}
    </SidebarMobileNavContext.Provider>
  );
}

export function useSidebarMobileNav() {
  const value = useContext(SidebarMobileNavContext);
  if (!value)
    throw Error(
      "useSidebarMobileNav must be used within SidebarMobileNavProvider",
    );
  return value;
}
