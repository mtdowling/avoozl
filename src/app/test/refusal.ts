// An error an operation throws with its HTTP status.
export type Refusal = Error & { status?: number };

// A check for assert.throws or assert.rejects: the error has status `code`
// and, when `pattern` is given, a message it matches.
export const withStatus =
  (code: number, pattern?: RegExp) => (error: Refusal) =>
    error.status === code && (!pattern || pattern.test(error.message));
