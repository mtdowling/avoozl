// The icons the page draws, all from the lucide-react module Kiro Crew
// provides at run time. Each name was checked against the module the host
// (Kiro Crew 0.12.2.3) exports; keep new ones to names it has.
export {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Archive,
  ArchiveRestore,
  Ban,
  BookOpen,
  Bot,
  CircleCheck,
  CircleHelp,
  // CirclePlus is in the host's lucide-react export (checked 2026-11-15).
  CirclePlus,
  Code,
  KeyRound,
  Laptop,
  Lock,
  ShieldCheck,
  UserRound,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleAlert,
  CircleDot,
  ClipboardCheck,
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Gauge,
  GitBranch,
  GitPullRequest,
  GitPullRequestDraft,
  HardDrive,
  History,
  // Hourglass is in the host's lucide-react export (checked 2026-11-17).
  Hourglass,
  Inbox,
  Info,
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  MessagesSquare,
  ListFilter,
  Network,
  PanelLeftOpen,
  Package,
  Pause,
  Pencil,
  Play,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Send,
  Settings,
  Trash2,
  Users,
  Workflow,
  X,
  Menu,
  Link2,
  Ellipsis,
  // The Specs rail's icons, as Radar's Issues rail (lucide 1.7, checked 2026-11-16).
  ArrowUpDown,
  CaseSensitive,
  Clock,
  Layers,
  ListChecks,
  Search,
  Tag,
} from 'lucide-react'
export type { LucideIcon } from 'lucide-react'

import { Info } from 'lucide-react'
// The one icon for every button that opens details or shows an item (the
// task drawer, a plan's view). Eye stays only for buttons that show or hide
// something on the page.
export const DetailsIcon = Info

import { CircleAlert, CircleCheck, FileText, Gauge, GitPullRequest, HardDrive, History, Inbox, LayoutDashboard, LayoutGrid, Network, Settings } from 'lucide-react'
// One icon per top-level view, shared by its nav tab and its page heading.
// Network and LayoutGrid match the Graph and Delivery row buttons.
export const VIEW_ICONS = {
  dashboard: LayoutDashboard,
  plans: FileText,
  graph: Network,
  delivery: LayoutGrid,
  // Dashboards' Lanes and CI, and the Issues and Pull requests pages; all
  // in the host's lucide-react export list (kirocrew-app-sdk.d.ts).
  lanes: LayoutGrid,
  ci: CircleCheck,
  // GitPullRequest is in the host's lucide-react export list (checked 2026-11-17).
  landing: GitPullRequest,
  // Gauge is in the host's lucide-react export list (checked 2026-11-13).
  flow: Gauge,
  // HardDrive is already in the list above: crews are machines.
  routing: HardDrive,
  conflicts: CircleAlert,
  untriaged: Inbox,
  // Needs you reuses the Conflicts icon.
  waiting: CircleAlert,
  // History is in the list above: the log of what happened.
  activity: History,
  settings: Settings,
} as const
