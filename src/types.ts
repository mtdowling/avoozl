// The shapes of the workspace snapshot every read model works over: its
// tasks, the edges between them, the statuses they may hold and the
// documents they cite. Fields a module does not name stay open (`unknown`),
// so a new field is read with a check, never assumed.

// Where a task's text sits in a document, by line, and the approved text.
export interface SourceRef {
  document: string;
  lineStart?: number;
  lineEnd?: number;
  removed?: boolean;
  key?: string;
  approvedSource?: { text?: string } | null;
  [key: string]: unknown;
}

// What a worker last reported on a task (activity.ts).
export interface Activity {
  owner?: string;
  branch?: string;
  summary?: string;
  leaseId?: string;
  sessionId?: string;
  connection?: { runId?: string } | null;
  [key: string]: unknown;
}

// A task that waits on a task of another spec (spec-dependencies.ts).
export interface SpecDependency {
  spec?: string;
  taskId: string;
  kind: string;
  condition?: string;
  planId?: string;
  [key: string]: unknown;
}

export interface Task {
  id: string;
  title: string;
  status: string;
  scope?: string;
  kind?: string;
  summary?: string;
  nextAction?: string;
  notes?: string;
  tags?: string[];
  owner?: string;
  track?: string;
  epic?: string;
  planId?: string;
  needsReview?: boolean;
  planArchived?: boolean;
  decision?: unknown;
  completion?: unknown;
  source?: SourceRef | null;
  sourceReferences?: SourceRef[];
  approvedSource?: { text?: string; hash?: string } | null;
  activity?: Activity | null;
  activityHistory?: Activity[];
  dispatch?: { ready?: boolean; state?: string; reason?: string } | null;
  manual?: boolean;
  // The tasks.md phase heading a spec task sits under.
  phase?: { id: string; [key: string]: unknown } | null;
  manualDone?: { choice?: string; at?: string; [key: string]: unknown } | null;
  repository?: string | null;
  repositoryId?: string | null;
  authority?: string;
  route?: string;
  github?: {
    number?: number;
    nodeId?: string;
    url?: string;
    repository?: string;
    [key: string]: unknown;
  } | null;
  childrenComplete?: boolean;
  createdAt?: string;
  updatedAt?: string;
  labeledIssue?: { repository?: string; number?: number } | null;
  labelRank?: number;
  // The intake item a task came from (src/app/intake/intake.ts).
  intake?: {
    source: string;
    id: string;
    link: string;
    kind?: string;
    labels: string[];
    snapshotHash: string;
    snapshotTitle: string;
    rule: string | null;
    actor: string | null;
    eventId: string | null;
    by: string;
    confirmedHash?: string;
    confirmedAt?: string;
  };
  intakeHold?: { key: string; actor: string | null; decision: string };
  acceptanceEvidence?: {
    derivedFrom?: string[];
    acceptedBy?: string;
    [key: string]: unknown;
  } | null;
  integration?: {
    commit?: string | null;
    at?: string;
    [key: string]: unknown;
  } | null;
  intakeVerdict?: {
    state?: string;
    issue?: string;
    order?: { actor: string; reason: string; closedAt: string };
    [key: string]: unknown;
  } | null;
  evidence?: string[];
  // Why this task is not a duplicate of each named task.
  distinctFrom?: Record<string, string>;
  specDependencies?: SpecDependency[];
  pendingSpecDependencies?: SpecDependency[];
  [key: string]: unknown;
}

export interface Edge {
  id?: string;
  from: string;
  to: string;
  kind: string;
  condition?: string;
  planId?: string;
  [key: string]: unknown;
}

export interface Status {
  id: string;
  complete?: boolean;
  archived?: boolean;
  [key: string]: unknown;
}

export interface Document {
  path: string;
  hash: string;
  text?: string;
  historical?: boolean;
  plan?: { status?: string; [key: string]: unknown } | null;
  [key: string]: unknown;
}

export interface Snapshot {
  schemaVersion?: number;
  revision?: number;
  tasks: Task[];
  edges: Edge[];
  statuses: Status[];
  documents: Record<string, Document>;
  taskAliases?: Record<string, string>;
  tracks?: { id: string; [key: string]: unknown }[];
  presentation?: Record<string, unknown>;
  // Saved reports (report.save).
  savedSearches?: { id: string; [key: string]: unknown }[];
  [key: string]: unknown;
}
