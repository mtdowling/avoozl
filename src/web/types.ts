export type RunSummary = {
  id: string;
  taskId?: string;
  planId?: string;
  state: string;
  mode?: string;
  provider?: string;
  providerSessionId?: string;
  projectId?: string;
  model?: string;
  error?: string | { message?: string };
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  archivedAt?: string | null;
};

export type Provider = {
  id?: string;
  name?: string;
  label?: string;
  models?: Array<{ id: string; name?: string } | string>;
};

export type Workspace = {
  mode?: string;
  revision: number;
  runs: RunSummary[];
  runTotal: number;
  plans: PlanSummary[];
  planTotal: number;
  requests: Array<{ id: string; runId: string; kind: string; method?: string }>;
  projects: Array<{ id: string; name?: string; root?: string; path?: string }>;
  github?: {
    available: boolean;
    machine?: { id: string; name: string };
    repositories: Array<{
      id: string;
      projectId: string;
      assignee: string;
      label: string;
      autoStart?: boolean;
      provider?: string | null;
      activeMachine?: string | null;
    }>;
    issues: Array<{
      id: string;
      repository: string;
      taskId: string;
      number: number;
      title: string;
      state: string;
      reason?: string;
      url?: string;
      bodyHash?: string;
      labelEventId?: string;
    }>;
    lastSync?: { repositories?: Array<{ id: string; syncedAt: string }> };
  };
  workspaceRepository?: {
    configuration?: {
      root: string;
      remote: string;
      branch: string;
      directory: string;
      repository?: string;
    } | null;
    publication?: { commit: string; at: string } | null;
    import?: { commit: string; at: string } | null;
  };
  providers: Provider[];
  agentHost?: { connected?: boolean; draining?: boolean };
  publication?: { pending?: unknown[]; last?: unknown[] };
  integrations?: unknown[];
  recentIntegrations?: unknown[];
};

export type Task = {
  id: string;
  title: string;
  summary?: string;
  notes?: string;
  overview?: string;
  status: string;
  scope?: string;
  kind?: string;
  epic?: string;
  track?: string;
  owner?: string;
  nextAction?: string;
  tags?: string[];
  acceptance?: string[];
  evidence?: string[];
  resources?: string[];
  dependencies?: string[];
  needsReview?: boolean;
  progressPercent?: number;
  prompt?: string;
  createdAt?: string;
  updatedAt?: string;
  source?: TaskSource;
  approvedSource?: TaskSource & { text?: string };
  sourceReferences?: TaskSource[];
  contextDocuments?: string[];
  mergeReceipts?: string[];
  integration?: {
    commit?: string;
    at?: string;
    branch?: string;
    repo?: string;
    evidence?: string[];
    recordedAt?: string;
  };
  capture?: {
    submissionId?: string;
    at?: string;
    context?: {
      revision?: number;
      view?: string;
      selected?: string;
      document?: string | null;
      taskIds?: string[];
      filters?: Record<string, string>;
      url?: string;
    };
  };
  activity?: {
    owner?: string;
    status?: string;
    summary?: string;
    heartbeatAt?: string;
    sessionId?: string;
    branch?: string;
    connection?: { runId?: string };
  };
};

export type TaskSource = {
  document?: string;
  lineStart?: number;
  lineEnd?: number;
  key?: string;
  removed?: boolean;
  statusAtMerge?: string;
  progressAtMerge?: number;
};

export type EvidenceRecord = {
  id: string;
  kind?: string;
  taskId?: string;
  runId?: string;
  commit?: string;
  argv?: string[];
  exitCode?: number;
  at?: string;
  [key: string]: unknown;
};

export type TaskDetail = Task & {
  requestedId?: string;
  context?: string;
  relationships?: State["edges"];
  documents?: DocumentRecord[];
  runs?: RunSummary[];
  evidenceRecords?: EvidenceRecord[];
};

export type State = {
  revision: number;
  project?: { name?: string; title?: string; workspaceName?: string };
  statuses: Array<{ id: string; label: string; color?: string; complete?: boolean }>;
  epics: Array<{ id: string; title: string; summary?: string; scope?: string; color?: string; context?: string }>;
  tracks: Array<{ id: string; label: string; color?: string }>;
  tasks: Task[];
  edges: Array<{ id?: string; from: string; to: string; kind: string; reason?: string }>;
  epicEdges?: Array<{ id?: string; from: string; to: string; kind: string; reason?: string }>;
  documents: Record<string, DocumentRecord>;
  taskAliases?: Record<string, string>;
  updatedAt?: string;
  savedSearches?: SavedSearch[];
  presentation?: {
    views?: SavedView[];
    tours?: SavedTour[];
  };
};

export type SavedSearch = {
  id: string;
  title: string;
  view: "overview" | "tasks" | "epics" | "graph" | "documents";
  filters: {
    query?: string;
    scopes?: string[];
    work?: string[];
    statuses?: string[];
    epics?: string[];
    tracks?: string[];
    tags?: string[];
    activity?: string[];
    historical?: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type SavedView = {
  id: string;
  title: string;
  caption?: string;
  view?: string;
  filters?: {
    q?: string;
    scope?: string;
    status?: string;
    activity?: string;
    epic?: string;
    track?: string;
    tag?: string;
  };
  group?: string;
  detail?: string;
  selected?: string;
  zoom?: number;
  taskIds?: string[];
  stripOrder?: string;
  stripZoom?: number;
  stripAt?: number;
  focus?: string;
};

export type SavedTour = {
  id: string;
  title: string;
  steps?: Array<{ view?: string; visualization?: string; visualizationId?: string }>;
};

export type DocumentRecord = {
  id: string;
  path: string;
  title: string;
  status?: string;
  kind?: string;
  summary?: string;
  links?: string[];
  text?: string;
  hash?: string;
  modifiedAt?: string;
  textLength?: number;
  taskIds?: string[];
  backlinks?: string[];
  removed?: boolean;
  historical?: boolean;
  plan?: {
    status?: "done" | "not-started" | "started" | "abandoned";
    progressPercent?: number;
    category?: string;
    targetBranch?: string;
    taskIds?: string[];
    taskQuery?: string;
  };
};

export type DocumentPlanSummary = {
  id: string;
  title: string;
  total: number;
  done: number;
  status: "done" | "not-started" | "started" | "abandoned";
  percent: number;
  category: string;
  branch: string;
  basis: string;
};

export type PlanSummary = {
  id: string;
  title: string;
  state?: string;
  kind?: string;
  revision?: number;
  hash?: string;
  updatedAt?: string;
};

export type Plan = PlanSummary & {
  text: string;
  prompt?: string;
  quality?: PlanQuality;
  approvals?: Array<{ hash?: string; approvedAt?: string; approvedBy?: string }>;
  reviews?: ReviewThread[];
  reviewPipelines?: Array<{
    id: string;
    state: string;
    currentRunId?: string | null;
    rounds?: Array<{ provider: string; comments: number }>;
    stopReason?: string;
    error?: string;
  }>;
};

export type PlanDiagnostic = {
  id: string;
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  lineStart: number;
  lineEnd: number;
  taskId?: string;
  relatedTaskId?: string;
};

export type PlanQuality = {
  canApprove: boolean;
  counts: { error: number; warning: number; info: number };
  taskCount: number;
  diagnostics: PlanDiagnostic[];
};

export type ReviewThread = {
  id: string;
  revisionHash: string;
  quote: string;
  comment: string;
  suggestion?: string;
  severity: string;
  state: string;
  disposition?: string;
  author?: string;
  provider?: string | null;
  model?: string | null;
  stale?: boolean;
  replies?: Array<{ id: string; author: string; text: string; at: string }>;
};

export type RunEvent = {
  seq: number;
  runId?: string;
  kind: string;
  at?: string;
  text?: string;
  role?: "user" | "assistant";
  message?: string;
  tool?: string;
  delivery?: { id: string; text: string; state?: string };
};

export type RequestRecord = {
  id: string;
  runId: string;
  kind: "input" | "approval" | string;
  method?: string;
  payload?: Record<string, any>;
  state?: string;
};

export type Run = RunSummary & {
  prompt?: string;
  external?: boolean;
  approvalMode?: string;
  actualModel?: string;
  worktree?: string;
  events: RunEvent[];
  hasEarlier?: boolean;
  deliveries: Array<{ id: string; text: string; state: string; error?: string }>;
  requests: RequestRecord[];
};
