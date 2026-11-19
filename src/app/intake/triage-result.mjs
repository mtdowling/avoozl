// The triage agent's one result (triage-agent design §D3): one shape for
// every class, checked by one validator. A chat's plans_submit_triage call
// and a child's output file are both checked here before anything is kept.
export const CLASSES = Object.freeze([
  "question",
  "bug",
  "optimization",
  "feature",
  "pull-request",
  "unclear",
]);
const OUTPUT_LIMIT = 262_144;
const TEXT_LIMIT = 65_536;
const REASON_LIMIT = 500;
const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const RESULT_KEYS = [
  "class",
  "reason",
  "labels",
  "duplicateOf",
  "answer",
  "question",
  "reproduction",
  "fix",
  "review",
  "toOwner",
];

const text = (value, label, limit, { line = false } = {}) => {
  if (typeof value !== "string" || !value.trim())
    throw Error(`${label} must be text.`);
  if (value.length > limit)
    throw Error(`${label} is over ${limit} characters.`);
  if (line && /[\r\n]/.test(value)) throw Error(`${label} must be one line.`);
  return value.trim();
};
const only = (value, keys, label) => {
  if (!record(value)) throw Error(`${label} must be an object.`);
  for (const key of Object.keys(value))
    if (!keys.includes(key)) throw Error(`${label}.${key} is not allowed.`);
  return value;
};
const relative = (value, label) => {
  const file = text(value, label, 300, { line: true }).replace(/\\/g, "/");
  if (
    file.startsWith("/") ||
    file.split("/").includes("..") ||
    /^[A-Za-z]:/.test(file)
  )
    throw Error(`${label} must be a path inside the repository.`);
  return file;
};

// One triage result, checked whole. Returns the cleaned value; throws the
// first reason it is refused.
export function validateTriageResult(value) {
  only(value, RESULT_KEYS, "the result");
  if (!CLASSES.includes(value.class))
    throw Error(`class must be one of ${CLASSES.join(", ")}.`);
  const out = {
    class: value.class,
    reason: text(value.reason, "reason", REASON_LIMIT, { line: true }),
    labels: [],
    duplicateOf: null,
    answer: null,
    question: null,
    reproduction: null,
    fix: null,
    review: null,
    toOwner: null,
  };
  if (value.labels !== undefined && value.labels !== null) {
    if (!Array.isArray(value.labels) || value.labels.length > 10)
      throw Error("labels must be a list of at most 10 names.");
    out.labels = value.labels.map((name) =>
      text(name, "a label", 50, { line: true }),
    );
  }
  if (value.duplicateOf != null) {
    if (!Number.isSafeInteger(value.duplicateOf) || value.duplicateOf < 1)
      throw Error("duplicateOf must be an item number.");
    out.duplicateOf = value.duplicateOf;
  }
  if (value.answer != null) {
    only(value.answer, ["body", "citations"], "answer");
    out.answer = {
      body: text(value.answer.body, "answer.body", TEXT_LIMIT),
      citations: (Array.isArray(value.answer.citations)
        ? value.answer.citations
        : []
      )
        .slice(0, 20)
        .map((entry, index) =>
          relative(
            record(entry) ? entry.path : entry,
            `answer.citations[${index}]`,
          ),
        ),
    };
  }
  if (value.question != null)
    out.question = text(value.question, "question", 4000);
  if (value.reproduction != null) {
    only(value.reproduction, ["path", "text"], "reproduction");
    out.reproduction = {
      path: relative(value.reproduction.path, "reproduction.path"),
      text: text(value.reproduction.text, "reproduction.text", TEXT_LIMIT),
    };
  }
  if (value.fix != null) {
    only(value.fix, ["bounded", "why"], "fix");
    if (typeof value.fix.bounded !== "boolean")
      throw Error("fix.bounded must be true or false.");
    out.fix = {
      bounded: value.fix.bounded,
      why: text(value.fix.why, "fix.why", REASON_LIMIT),
    };
  }
  if (value.review != null) {
    only(value.review, ["body", "comments", "partial", "notCovered"], "review");
    const comments = value.review.comments ?? [];
    if (!Array.isArray(comments) || comments.length > 50)
      throw Error("review.comments must be a list of at most 50.");
    out.review = {
      body: text(value.review.body, "review.body", TEXT_LIMIT),
      partial: value.review.partial === true,
      notCovered: (Array.isArray(value.review.notCovered)
        ? value.review.notCovered
        : []
      )
        .slice(0, 50)
        .map((entry, index) =>
          text(entry, `review.notCovered[${index}]`, 300, { line: true }),
        ),
      comments: comments.map((comment, index) => {
        only(
          comment,
          ["path", "line", "side", "body"],
          `review.comments[${index}]`,
        );
        if (!Number.isSafeInteger(comment.line) || comment.line < 1)
          throw Error(`review.comments[${index}].line must be a line number.`);
        if (
          comment.side !== undefined &&
          !["LEFT", "RIGHT"].includes(comment.side)
        )
          throw Error(`review.comments[${index}].side must be LEFT or RIGHT.`);
        return {
          path: relative(comment.path, `review.comments[${index}].path`),
          line: comment.line,
          side: comment.side ?? "RIGHT",
          body: text(comment.body, `review.comments[${index}].body`, 8000),
        };
      }),
    };
  }
  if (value.toOwner != null) {
    only(value.toOwner, ["reason"], "toOwner");
    out.toOwner = {
      reason: text(value.toOwner.reason, "toOwner.reason", REASON_LIMIT),
    };
  }
  const needs = {
    question: out.answer || out.toOwner,
    bug: out.reproduction || out.question || out.toOwner,
    optimization: out.reproduction || out.question || out.toOwner,
    feature: out.toOwner,
    "pull-request": out.review,
    unclear: out.toOwner,
  };
  if (!needs[out.class])
    throw Error(
      {
        question: "A question needs an answer or toOwner.",
        bug: "A bug needs a reproduction, a question or toOwner.",
        optimization:
          "An optimization needs a reproduction, a question or toOwner.",
        feature: "A feature needs toOwner.",
        "pull-request": "A pull request needs a review.",
        unclear: "An unclear item needs toOwner.",
      }[out.class],
    );
  return out;
}

// The role row's output check: the file holds the JSON result.
export function triageOutput(textValue) {
  return validateTriageResult(JSON.parse(textValue));
}
export const TRIAGE_OUTPUT_LIMIT = OUTPUT_LIMIT;
