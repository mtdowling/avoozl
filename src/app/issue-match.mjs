// A trigger rule's `match`: a GitHub issue-search line (design §4.4). Only the
// qualifiers below are read; any other token is refused by name, never
// skipped, because a skipped token would make a rule match more than its
// author wrote. Labels compare without case, as GitHub search does.
//
//   label:x           has x (repeat for all of them)
//   label:a,b         has a or b (one such group per rule)
//   -label:x / -label:a,b   has none of them
//   assignee:name     assigned to name
//   no:assignee       assigned to nobody
//   "quoted values"   for names with spaces or commas
import { fail } from "./store.mjs";

const QUALIFIER = /^(-?)([A-Za-z]+):(.*)$/s;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const MATCH_HELP =
  "Same syntax as GitHub's issue search. Supported: label:, -label:, assignee:, no:assignee.";

// Splits on spaces outside double quotes.
function tokens(text) {
  const found = [];
  let current = "",
    quoted = false;
  for (const character of text) {
    if (character === '"') quoted = !quoted;
    if (!quoted && /\s/.test(character)) {
      if (current) found.push(current);
      current = "";
    } else current += character;
  }
  if (quoted) fail(`Match has an unclosed quote in ${current}.`);
  if (current) found.push(current);
  return found;
}

// `a,"b c",d` -> ["a", "b c", "d"]. Quotes wrap one whole value.
function values(text, token) {
  const items = [];
  let current = "",
    quoted = false,
    wasQuoted = false;
  const push = () => {
    if (!current.trim()) fail(`Match token ${token} has an empty value.`);
    items.push(current.trim());
    current = "";
    wasQuoted = false;
  };
  for (const character of text) {
    if (character === '"') {
      if (!quoted && current) fail(`Match token ${token} has a stray quote.`);
      quoted = !quoted;
      wasQuoted = true;
    } else if (character === "," && !quoted) push();
    else if (wasQuoted && !quoted)
      fail(`Match token ${token} has text after a closing quote.`);
    else current += character;
  }
  push();
  return items;
}

const lower = (value) => value.toLocaleLowerCase();
function addLabels(list, items) {
  for (const item of items)
    if (!list.some((entry) => lower(entry) === lower(item))) list.push(item);
}

// Parses `match` into the rule fields evaluation already reads. A trigger
// rule needs a `label:` term, so it never matches every open issue; the
// Untriaged filter (design §8.5) passes `needLabel: false`.
export function parseMatch(text, label = "match", { needLabel = true } = {}) {
  if (typeof text !== "string" || !text.trim())
    fail(`${label} must be a non-empty GitHub search line.`);
  const parsed = {
    labelsAll: [],
    labelsAny: [],
    labelsNone: [],
    assignee: null,
    unassigned: false,
  };
  for (const token of tokens(text.trim())) {
    const part = QUALIFIER.exec(token);
    if (!part)
      fail(
        `${label} cannot use ${token}: free text is not supported. ${MATCH_HELP}`,
      );
    const [, negated, qualifier, rest] = part;
    const key = `${negated}${qualifier}`;
    if (key === "label" || key === "-label") {
      const items = values(rest, token);
      if (negated) addLabels(parsed.labelsNone, items);
      else if (items.length === 1) addLabels(parsed.labelsAll, items);
      else {
        if (parsed.labelsAny.length)
          fail(`${label} cannot use ${token}: only one label:a,b group is supported.`);
        addLabels(parsed.labelsAny, items);
      }
    } else if (key === "assignee") {
      const items = values(rest, token);
      if (items.length !== 1 || !LOGIN.test(items[0]))
        fail(`${label} cannot use ${token}: assignee: takes one GitHub login.`);
      if (parsed.assignee && lower(parsed.assignee) !== lower(items[0]))
        fail(`${label} cannot use ${token}: only one assignee: is supported.`);
      if (parsed.unassigned)
        fail(`${label} cannot use ${token} with no:assignee.`);
      parsed.assignee = items[0];
    } else if (key === "no" && rest === "assignee") {
      if (parsed.assignee)
        fail(`${label} cannot use ${token} with assignee:.`);
      parsed.unassigned = true;
    } else
      fail(`${label} cannot use ${token}: it is not supported. ${MATCH_HELP}`);
  }
  if (needLabel && !parsed.labelsAll.length && !parsed.labelsAny.length)
    fail(`${label} needs at least one label: term.`);
  return parsed;
}

const quote = (value) =>
  /[\s,"]/.test(value) || !value ? `"${value}"` : value;

// The `match` line for parsed fields, so an old rule can be shown and saved
// as `match`.
export function formatMatch({
  labelsAll = [],
  labelsAny = [],
  labelsNone = [],
  assignee = null,
  unassigned = false,
} = {}) {
  for (const value of [...labelsAll, ...labelsAny, ...labelsNone])
    if (value.includes('"'))
      fail(`Label ${value} has a double quote, which match cannot write.`);
  return [
    ...labelsAll.map((value) => `label:${quote(value)}`),
    ...(labelsAny.length ? [`label:${labelsAny.map(quote).join(",")}`] : []),
    ...(labelsNone.length ? [`-label:${labelsNone.map(quote).join(",")}`] : []),
    ...(assignee ? [`assignee:${assignee}`] : []),
    ...(unassigned ? ["no:assignee"] : []),
  ].join(" ");
}

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PREVIEW_LIMIT = 10;

// Settings > Triggers preview: the parsed line, then (when GitHub is signed
// in and the line parses) up to 10 open issues GitHub's own search returns
// for it. A parse error is an answer, not a failure, so the field can show it.
// `untriaged: true` previews an Untriaged filter (design §8.5): no `label:`
// term is needed, and pull requests count too.
export async function triggerPreview(github, input = {}) {
  const repository = input.repository;
  if (
    repository !== undefined &&
    repository !== "" &&
    (typeof repository !== "string" || !REPOSITORY.test(repository))
  )
    fail("Name one repository as owner/repository.");
  const result = {
    repository: repository || null,
    match: typeof input.match === "string" ? input.match.trim() : "",
    parsed: null,
    error: null,
    total: null,
    issues: [],
    searchError: null,
  };
  try {
    result.parsed = parseMatch(input.match, "match", {
      needLabel: input.untriaged !== true,
    });
  } catch (error) {
    result.error = error.message;
    return result;
  }
  // No repository yet: the parse is the whole answer.
  if (!repository) return result;
  if (!github?.available?.()) {
    result.searchError = "GitHub is not signed in, so matches cannot be shown.";
    return result;
  }
  try {
    const untriaged = input.untriaged === true;
    const found = await github.searchOpenIssues(repository, result.match, {
      perPage: PREVIEW_LIMIT,
      ...(untriaged ? { pullRequests: true } : {}),
    });
    result.total = found?.total_count ?? 0;
    result.issues = (found?.items || [])
      .filter((item) => untriaged || !item.pull_request)
      .slice(0, PREVIEW_LIMIT)
      .map((item) => ({
        number: item.number,
        title: item.title,
        url: item.html_url,
      }));
  } catch (error) {
    result.searchError = `GitHub search failed: ${error.message}`;
  }
  return result;
}
