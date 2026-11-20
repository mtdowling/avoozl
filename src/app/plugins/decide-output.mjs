// The one answer a plugin check's decide call may give (plugin-checks
// PK3.2): exactly {needed: boolean, reason: 1 to 300 characters}. Read by
// the role table (a child's output file) and by plans_submit_decide.
export function decideOutput(text) {
  const value = typeof text === "string" ? JSON.parse(text) : text;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== "needed,reason" ||
    typeof value.needed !== "boolean" ||
    typeof value.reason !== "string" ||
    !value.reason.trim() ||
    value.reason.length > 300
  )
    throw Error(
      'write exactly {"needed": true | false, "reason": "<1 to 300 characters>"}',
    );
  return { needed: value.needed, reason: value.reason.trim() };
}
