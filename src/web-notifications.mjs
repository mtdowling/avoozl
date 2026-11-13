const attentionCopy = {
  "waiting-input": {
    title: "Avoozl needs your answer",
    body: (name) => `${name} is waiting for your response.`,
  },
  "waiting-approval": {
    title: "Avoozl needs your approval",
    body: (name) => `${name} is waiting for you to review an action.`,
  },
  completed: {
    title: "Avoozl has a result",
    body: (name) => `${name} has completed with a result ready to review.`,
  },
  failed: {
    title: "An Avoozl run failed",
    body: (name) => `${name} failed and needs your attention.`,
  },
};

function runName(run) {
  return run.title || run.taskId || "An Avoozl run";
}

function pendingRequest(run, requests) {
  return requests.find(
    (request) =>
      request.runId === run.id &&
      request.state !== "resolved" &&
      request.state !== "interrupted",
  );
}

function attentionKey(run, requests) {
  if (run.state === "waiting-input" || run.state === "waiting-approval") {
    const request = pendingRequest(run, requests);
    return `${run.state}:${request?.id || run.updatedAt || run.createdAt || ""}`;
  }
  return `${run.state}:${run.updatedAt || run.createdAt || ""}`;
}

export function webNotificationSignals(runs, requests = []) {
  return runs.flatMap((run) => {
    const copy = attentionCopy[run.state];
    if (!copy) return [];
    const name = runName(run);
    return [
      {
        runId: run.id,
        state: run.state,
        key: attentionKey(run, requests),
        title: copy.title,
        body: copy.body(name, run),
        tag: `avoozl-run-${run.id}`,
      },
    ];
  });
}

export function newWebNotificationSignals(previous, next) {
  if (!previous) return [];
  const seen = new Map(previous.map((signal) => [signal.runId, signal.key]));
  return next.filter((signal) => seen.get(signal.runId) !== signal.key);
}
