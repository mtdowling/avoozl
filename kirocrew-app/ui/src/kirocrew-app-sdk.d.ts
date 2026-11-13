declare module '@kirocrew/app-sdk' {
  // The host's permission-scoped client. A non-2xx rejects with an error
  // carrying `status` and the raw response text in `body`.
  export interface AppApi {
    request<T = unknown>(path: string, init?: RequestInit): Promise<T>
    get<T = unknown>(path: string, init?: RequestInit): Promise<T>
    post<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T>
    put<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T>
    del<T = unknown>(path: string, init?: RequestInit): Promise<T>
  }

  export function useAppApi(): AppApi
  // The host's own page navigation (a dashboard route such as /chat).
  export function useNavigate(): (path: string) => void
  export function useChatLauncher(): {
    openChat(input: {
      message: string
      autoSend?: boolean
      agent?: string
    }): void
  }
}

declare module '@kirocrew/app-sdk/ui' {
  import type {
    ButtonHTMLAttributes,
    ComponentType,
    CSSProperties,
    ForwardRefExoticComponent,
    InputHTMLAttributes,
    ReactNode,
    RefAttributes,
  } from 'react'

  export const PageHeader: ComponentType<{
    title: ReactNode
    subtitle?: string
    actions?: ReactNode
  }>
  export const EmptyState: ComponentType<{
    icon?: ReactNode
    title: ReactNode
    subtitle?: ReactNode
    action?: ReactNode
  }>
  export function SegmentedControl<K extends string>(props: {
    // The host renders the label as a child (<span>{label}</span>), so a
    // label may carry a count badge after its text.
    segments: { key: K; label: ReactNode; icon?: ReactNode; disabled?: boolean }[]
    value: K
    onChange(key: K): void
    ariaLabel?: string
    // The host animates the selected pill between controls that share this
    // id (default "segment"), so each control on the page needs its own.
    layoutId?: string
    // Host rule: compact shows a label only on the SELECTED segment; the
    // rest show their icon alone. Avoozl's segments have no icons, so
    // compact leaves them blank. Do not use it without icons.
    compact?: boolean
    wrap?: boolean
  }): ReactNode
  export const Card: ComponentType<{ children?: ReactNode; className?: string; style?: CSSProperties }>
  export const CardTitle: ComponentType<{ children?: ReactNode; className?: string }>
  export const Btn: ForwardRefExoticComponent<
    ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: string
      primary?: boolean
    } & RefAttributes<HTMLButtonElement>
  >
  export const Input: ForwardRefExoticComponent<
    InputHTMLAttributes<HTMLInputElement> & RefAttributes<HTMLInputElement>
  >
  // Host rule: any other variant renders as `warn` (yellow). Use ./Badge.tsx.
  export const Badge: ComponentType<{
    children?: ReactNode
    variant: 'ok' | 'err' | 'warn' | 'aim' | 'muted'
    className?: string
  }>
}

// Kiro Crew hands the page the whole lucide-react module at run time
// (window.__kirocrew_modules). Only the icons ui/src/icons.ts uses are typed.
declare module 'lucide-react' {
  import type { ComponentType, CSSProperties } from 'react'
  export type LucideIcon = ComponentType<{
    size?: number | string
    strokeWidth?: number
    className?: string
    style?: CSSProperties
    'aria-hidden'?: boolean | 'true' | 'false'
  }>
  export const Activity: LucideIcon
  export const ArrowDown: LucideIcon
  export const ArrowLeft: LucideIcon
  export const ArrowRight: LucideIcon
  export const ArrowUp: LucideIcon
  export const Archive: LucideIcon
  export const ArchiveRestore: LucideIcon
  export const Ban: LucideIcon
  export const BookOpen: LucideIcon
  export const Bot: LucideIcon
  export const CircleCheck: LucideIcon
  export const CircleHelp: LucideIcon
  export const Code: LucideIcon
  export const KeyRound: LucideIcon
  export const Laptop: LucideIcon
  export const Lock: LucideIcon
  export const ShieldCheck: LucideIcon
  export const UserRound: LucideIcon
  export const Users: LucideIcon
  export const Settings: LucideIcon
  export const Package: LucideIcon
  export const LayoutDashboard: LucideIcon
  export const HardDrive: LucideIcon
  export const GitBranch: LucideIcon
  export const FolderOpen: LucideIcon
  export const Folder: LucideIcon
  export const CircleAlert: LucideIcon
  export const CircleDot: LucideIcon
  export const GitPullRequest: LucideIcon
  export const GitPullRequestDraft: LucideIcon
  export const Inbox: LucideIcon
  export const Gauge: LucideIcon
  export const Radar: LucideIcon
  export const ScanSearch: LucideIcon
  export const Send: LucideIcon
  export const Check: LucideIcon
  export const ChevronRight: LucideIcon
  export const ClipboardCheck: LucideIcon
  export const Copy: LucideIcon
  export const Crosshair: LucideIcon
  export const Download: LucideIcon
  export const ExternalLink: LucideIcon
  export const Eye: LucideIcon
  export const FileText: LucideIcon
  export const History: LucideIcon
  export const Info: LucideIcon
  export const LayoutGrid: LucideIcon
  export const MessageSquare: LucideIcon
  export const MessagesSquare: LucideIcon
  export const Network: LucideIcon
  export const Pause: LucideIcon
  export const Pencil: LucideIcon
  export const Play: LucideIcon
  export const Plus: LucideIcon
  export const RefreshCw: LucideIcon
  export const RotateCcw: LucideIcon
  export const Trash2: LucideIcon
  export const Workflow: LucideIcon
  export const X: LucideIcon
}

// Prism's grammar files have no types; each only fills the global Prism.
declare module 'prismjs/components/*'

// The host maps react-dom to its own copy at run time (vendor/react-dom.mjs).
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react'
  export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactPortal
}
