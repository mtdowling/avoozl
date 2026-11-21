// An in-memory store for one test, closed when the test ends, and a table's
// rows as SQLite returns them.
import type { TestContext } from "node:test";
import { Store } from "../../store/store.ts";

export function open(t: TestContext) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  return store;
}

export const rows = (store: Store, table: string) =>
  store.db.prepare(`SELECT * FROM ${table}`).all();
