export type RunSummary = {
  id: string;
  taskId?: string;
  planId?: string;
  state: string;
  mode?: string;
  provider?: string;
  providerSessionId?: string;
  parentRunId?: string;
  parentProviderSessionId?: string;
  projectId?: string;
  model?: string;
  error?: string | { message?: string };
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  archivedAt?: string | null;
  branch?: string;
  worktree?: string;
  expectedCommit?: string;
  integratedCommit?: string;
  pullRequest?: PullRequestLink | string;
  pullRequests?: Array<PullRequestLink | string>;
};

export type DriverProject = {
  projectId: string;
  title?: string;
  root?: string;
  run?: RunSummary | null;
};

export type DriverList = {
  projects: DriverProject[];
  defaultProjectId?: string | null;
};

export type DriverOpenResult = {
  project: DriverProject;
  run: Run;
  created: boolean;
  handedOff?: boolean;
  previousRunId?: string;
};

export type OpenHandsAutomationTemplate = {
  id: string;
  name: string;
  description: string;
  version: string;
  estimatedSetupMinutes: number | null;
  path: string;
  requiresUserInput: true;
};

export type OpenHandsAutomationCapabilities = {
  available: boolean;
  reason?: string;
  endpoint?: string;
  nativeSetup: {
    templatesPath: string;
    listPath: string;
    templates: OpenHandsAutomationTemplate[];
  };
  installation: {
    mode: "native-setup";
    directInstall: false;
    reason: string;
  };
};

export type OpenHandsAutomationSetup = {
  action: "navigate";
  surface: "openhands";
  path: string;
  template: OpenHandsAutomationTemplate;
  createsAutomation: false;
  createsDraft?: false;
  requiresUserReview: true;
};

export type OpenHandsAutomationCoverageState =
  | "active"
  | "inactive"
  | "draft"
  | "recommended";

export type OpenHandsAutomationCoverage = {
  available: boolean;
  state?: "missing-control-plane-intake" | "covered";
  reason?: string;
  ownership: {
    continuousGitHubOwner: string;
    authorizationAndExecutionOwner: string;
    reconciliationOwner: string;
    reconciliationOperation: string;
    directIngest: {
      available: boolean;
      required: boolean;
      reason: string;
      safeFutureContract?: {
        implemented?: boolean;
      };
    };
  };
  repositories: Array<{
    repository: string;
    projectId?: string | null;
    eligible: boolean;
    reason?: string;
    controlPlane: OpenHandsAutomationControlPlane;
    recommendations: OpenHandsAutomationRecommendation[];
    relatedAutomations: OpenHandsAutomationRecommendation[];
    coverage?: Array<{
      role: string;
      templateId: string;
      satisfiesAvoozlIntake?: false;
      state: OpenHandsAutomationCoverageState;
      automations: Array<{
        id?: string | null;
        name?: string | null;
        state?: string | null;
      }>;
      drafts: Array<{
        id?: string | null;
        name?: string | null;
        dispatchable?: boolean;
      }>;
    }>;
  }>;
};

export type OpenHandsAutomationControlPlane = {
  id: string;
  role: "control-plane-intake";
  required: boolean;
  state: string;
  available: boolean;
  satisfiesAvoozlIntake: boolean;
  reason: string;
  handoff: null;
  automations?: Array<{
    id: string;
    name?: string | null;
    enabled?: boolean;
    state?: string | null;
    detailPath?: string | null;
  }>;
};

export type OpenHandsAutomationRecommendation = {
  role: string;
  summary: string;
  relationship?: "competing" | "supplemental";
  satisfiesAvoozlIntake?: false;
  warning?: string;
  effects?: string[];
  template: OpenHandsAutomationTemplate;
  handoff: OpenHandsAutomationSetup & {
    prefill?: {
      repository?: string;
      repositories?: string[];
      ref?: string;
    };
  };
};

export type OpenHandsIntakePreflight = {
  id: string;
  version?: string;
  repository?: string;
  readyToPrepareDraft?: boolean;
  readyToPrepare?: boolean;
  createsAutomation: boolean;
  createsDraft: false;
  enablesAutomation: false;
  prerequisites: Record<
    string,
    {
      status: string;
      reason?: string;
      [key: string]: unknown;
    }
  >;
  next?: string;
};

export type OpenHandsIntakePrepareResult = {
  repository: string;
  created: boolean;
  repaired?: boolean;
  replacedCapabilityId?: string;
  automation: {
    id: string;
    name?: string;
    enabled?: boolean;
    state?: string;
  };
  coverage?: OpenHandsAutomationCoverage;
  prerequisites?: OpenHandsIntakePreflight["prerequisites"];
};

export type Provider = {
  id?: string;
  name?: string;
  label?: string;
  models?: Array<{ id: string; name?: string } | string>;
};

export type ConfigurationMetadata = {
  version: number;
  schemaPath: string;
  files: {
    global: string;
    legacy?: string;
    repository: string;
  };
  sources: Array<{
    label: string;
    filename?: string | null;
  }>;
  repository: {
    filename: string;
    exists: boolean;
    hash?: string | null;
    loadedAt?: string | null;
    error?: {
      message: string;
      at: string;
    } | null;
  };
  restartRequired: string[];
};

export type WorkspaceProject = {
  id: string;
  name?: string;
  root?: string;
  path?: string;
  baseBranch?: string;
  worktreeRoot?: string;
  checks?: string[][];
  repository?: string | null;
};

export type WorkspaceRepository = {
  id: string;
  name: string;
  github?: string | null;
  localCheckout?: string | null;
  worktreeRoot?: string | null;
  planning: boolean;
  editable: boolean;
  baseBranch: string;
  checks: string[][];
  queue: {
    enabled: boolean;
    issues: boolean;
    pullRequests: boolean;
    visibility: "private" | "public" | null;
  };
  issueAuthorization: {
    enabled: boolean;
    assignee?: string;
    readyLabel?: string;
    allowedActors?: string[];
    minimumPermission?: "write" | "maintain" | "admin";
    autoStart?: boolean;
    provider?: string | null;
    model?: string | null;
  };
  labels: GitHubLabelBehaviors;
};

export type HostWorkspaceSummary = {
  id: string;
  name: string;
  root?: string;
  enabled: boolean;
  state:
    | "closed"
    | "opening"
    | "ready"
    | "draining"
    | "stopped"
    | "degraded"
    | "quarantined";
  revision?: number | null;
  instanceEpoch?: string | number | null;
  counts: {
    running: number;
    blocked: number;
    review: number;
    queue: number;
  };
  concurrency: {
    limit: number;
    active: number;
    queued?: number;
  };
};

export type HostWorkspaceList = {
  hostInstanceId: string;
  defaultWorkspace: string | null;
  hostConcurrency?: {
    limit: number;
    active: number;
  };
  items: HostWorkspaceSummary[];
};

export type Workspace = {
  mode?: string;
  revision: number;
  runs: RunSummary[];
  runTotal: number;
  plans: PlanSummary[];
  planTotal: number;
  requests: Array<{ id: string; runId: string; kind: string; method?: string }>;
  projects: WorkspaceProject[];
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
      model?: string | null;
      allowedActors?: string[];
      minimumPermission?: string;
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
    queue?: {
      enabled?: boolean;
      repositories?: Array<{
        id: string;
        repository?: string;
        projectId?: string | null;
        enabled?: boolean;
        includeIssues?: boolean;
        includePullRequests?: boolean;
        visibility?: "private" | "public";
        accessMode?: "private-read-only" | "public-read-only";
        canAuthorizeExecution?: boolean;
        labelBehaviors?: GitHubLabelBehaviors;
      }>;
      synchronizedAt?: string | null;
    };
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
  agentHost?: {
    connected?: boolean;
    draining?: boolean;
    active?: number;
    activeRuns?: Array<{
      id: string;
      taskId?: string;
      projectId?: string;
      provider?: string;
      state: string;
      title?: string;
      startedAt?: string;
      updatedAt?: string;
    }>;
    protectedOperations?: number;
  };
  conversationSettings?: {
    autoArchiveCompleted: boolean;
    driverAgentProfile?: string | null;
    driverModel?: string | null;
    routing?: {
      enabled: boolean;
      fallback: {
        agentProfile?: string | null;
        model?: string | null;
      };
      rules: Array<{
        id: string;
        priority: number;
        categories: string[];
        scopes: string[];
        risks: string[];
        contextRemainingAtMost?: number | null;
        agentProfile?: string | null;
        model?: string | null;
      }>;
    };
  };
  configuration?: ConfigurationMetadata | null;
  publication?: { pending?: unknown[]; last?: unknown[] };
  integrations?: unknown[];
  recentIntegrations?: unknown[];
};

export type QueueItem = {
  id: string;
  kind: "issue" | "pull-request" | "task";
  title: string;
  summary?: string;
  body?: string;
  repository?: string;
  projectId?: string;
  number?: number;
  url?: string;
  author?: string;
  assignees?: string[];
  assigned?: boolean;
  labels?: string[];
  normalizedState?: GitHubLabelBehavior | "unclassified";
  normalizedStates?: GitHubLabelBehavior[];
  state?: string;
  createdAt?: string;
  updatedAt?: string;
  attention?: "approval" | "ready";
  processed?: boolean;
  processedAt?: string;
  disposition?: string;
  taskId?: string;
  task?: Task;
  headBranch?: string;
  baseBranch?: string;
  overlapCandidates?: QueueOverlapCandidate[];
  associations?: QueueAssociation[];
  claim?: {
    login: string;
    claimedAt: string;
  };
};

export type GitHubLabelBehavior =
  | "ready"
  | "blocked"
  | "review"
  | "quarantined";

export type GitHubLabelBehaviors = Record<GitHubLabelBehavior, string[]>;

export type QueueComment = {
  id: string;
  body: string;
  author: string | null;
  authorUrl?: string | null;
  authorAssociation?: string | null;
  createdAt: string | null;
  updatedAt?: string | null;
  url?: string | null;
  kind?: "issue-comment" | "review-comment";
  nodeId?: string | null;
  databaseId?: number | null;
  threadId?: string | null;
  replyToId?: string | null;
  path?: string | null;
  line?: number | null;
  originalLine?: number | null;
  startLine?: number | null;
  side?: string | null;
  startSide?: string | null;
  commitId?: string | null;
  originalCommitId?: string | null;
  pullRequestReviewId?: number | null;
  diffHunk?: string | null;
  reactions?: Record<string, number>;
};

export type QueueComments = {
  item?: Pick<
    QueueItem,
    "id" | "kind" | "repository" | "number" | "title" | "url"
  >;
  available?: boolean;
  reason?: string | null;
  comments: QueueComment[];
  counts?: {
    issue: number;
    review: number;
    total: number;
  };
  fetchedAt?: string;
};

export type QueueDiffFile = {
  sha?: string | null;
  filename: string;
  previousFilename?: string | null;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  blobUrl?: string | null;
  rawUrl?: string | null;
  patch?: string | null;
  patchUnavailable?: boolean;
  patchTruncated?: boolean;
};

export type QueuePullRequestDiff = {
  item?: Pick<QueueItem, "id" | "repository" | "number" | "title" | "url">;
  files: QueueDiffFile[];
  counts: {
    files: number;
    additions: number;
    deletions: number;
  };
  truncated?: boolean;
  limits?: {
    files: number;
    patchCharacters: number;
    filePatchCharacters: number;
  };
  fetchedAt?: string;
};

export type QueueOverlapCandidate = {
  targetKind: "task" | "plan";
  targetId: string;
  projectId?: string | null;
  title: string;
  score: number;
  reasons: Array<{
    code: string;
    detail: string;
    weight: number;
  }>;
  unconfirmed: true;
};

export type QueueAssociation = {
  id?: string;
  targetKind: "task" | "plan";
  targetId: string;
  title: string;
  confirmedAt: string;
  confirmedBy?: string;
  queueItemId: string;
  repository?: string;
  kind?: "issue" | "pull-request";
  number?: number;
  url?: string;
  nodeId?: string | null;
  bodyHash?: string | null;
  source?: "task-origin" | "operator-confirmed";
};

export type QueueSnapshot = {
  available: boolean;
  enabled?: boolean;
  reason?: string;
  lastSync?: string | null;
  synchronizedAt?: string | null;
  repositories?: Array<{
    id: string;
    repository?: string;
    projectId?: string | null;
    enabled?: boolean;
    includeIssues?: boolean;
    includePullRequests?: boolean;
    visibility?: "private" | "public";
    accessMode?: "private-read-only" | "public-read-only";
    canAuthorizeExecution?: boolean;
    labelBehaviors?: GitHubLabelBehaviors;
  }>;
  items: QueueItem[];
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
  archivedAt?: string | null;
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
    worktree?: string;
    connection?: { runId?: string };
  };
  projectId?: string;
  github?: {
    repository?: string;
    nodeId?: string;
    number?: number;
    url?: string;
    origin?: string;
    pullRequests?: PullRequestLink[];
  };
  pullRequests?: PullRequestLink[];
};

export type PullRequestLink = {
  nodeId?: string | null;
  number?: number | null;
  url: string;
  title?: string;
  state?: string;
  repository?: string;
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
  executionLocation?: {
    branch?: string | null;
    worktree?: string | null;
  };
  codeChanges?: {
    commits: Array<{ sha: string; source?: string; url?: string }>;
    pullRequests: PullRequestLink[];
  };
};

export type State = {
  revision: number;
  project?: { name?: string; title?: string; workspaceName?: string };
  statuses: Array<{
    id: string;
    label: string;
    color?: string;
    complete?: boolean;
    archived?: boolean;
  }>;
  epics: Array<{
    id: string;
    title: string;
    summary?: string;
    scope?: string;
    color?: string;
    context?: string;
  }>;
  tracks: Array<{ id: string; label: string; color?: string }>;
  tasks: Task[];
  edges: Array<{
    id?: string;
    from: string;
    to: string;
    kind: string;
    reason?: string;
  }>;
  epicEdges?: Array<{
    id?: string;
    from: string;
    to: string;
    kind: string;
    reason?: string;
  }>;
  documents: Record<string, DocumentRecord>;
  taskAliases?: Record<string, string>;
  updatedAt?: string;
  savedSearches?: SavedSearch[];
  agentInstructions?: AgentInstruction[];
  agentInstructionSource?: {
    path: string;
    hash: string;
    revision?: string | null;
    synchronizedAt: string;
    ruleCount: number;
  };
  presentation?: {
    views?: SavedView[];
    tours?: SavedTour[];
  };
};

export type AgentInstruction = {
  id: string;
  title: string;
  category: string;
  selector: {
    kind: "all" | "scope" | "epic" | "track" | "tag";
    value?: string;
  };
  instruction: string;
  enabled: boolean;
  source?: { path: string; line?: number; hash?: string };
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
  steps?: Array<{
    view?: string;
    visualization?: string;
    visualizationId?: string;
  }>;
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
  projectId?: string;
};

export type Plan = PlanSummary & {
  text: string;
  prompt?: string;
  quality?: PlanQuality;
  approvals?: Array<{
    hash?: string;
    approvedAt?: string;
    approvedBy?: string;
  }>;
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
  deliveries: Array<{
    id: string;
    text: string;
    state: string;
    error?: string;
  }>;
  requests: RequestRecord[];
};
