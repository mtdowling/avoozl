// A Storage kept in a Map, for the tests of what the page saves in
// localStorage. `values` is the Map, so a test can plant or read an entry.
export function memoryStorage(values = new Map<string, string>()): Storage & { values: Map<string, string> } {
  return {
    values,
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, String(value)),
  }
}
