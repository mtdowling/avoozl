export type RunSummary = {
  id: string;
  taskId?: string;
  planId?: string;
  state: string;
  mode?: string;
  provider?: string;
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
  status: string;
  epic?: string;
  track?: string;
  owner?: string;
  nextAction?: string;
  tags?: string[];
  acceptance?: string[];
  activity?: { owner?: string; status?: string };
};

export type State = {
  revision: number;
  project?: { name?: string; title?: string; workspaceName?: string };
  statuses: Array<{ id: string; label: string; complete?: boolean }>;
  epics: Array<{ id: string; title: string }>;
  tracks: Array<{ id: string; label: string }>;
  tasks: Task[];
  edges: Array<{ id?: string; from: string; to: string; kind: string; reason?: string }>;
  documents: Record<string, DocumentRecord>;
};

export type DocumentRecord = {
  id: string;
  path: string;
  title: string;
  text?: string;
  hash?: string;
  modifiedAt?: string;
  textLength?: number;
  taskIds?: string[];
  backlinks?: string[];
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
  approvals?: Array<{ hash?: string; approvedAt?: string; approvedBy?: string }>;
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
