// Prism's core and grammars talk through a global `Prism`. This module runs
// first: it keeps any Prism the host already has, and asks for manual mode,
// so Prism never scans the page on its own. after.ts puts the host's back.
const scope = globalThis as { Prism?: unknown; __avoozlPrismPrevious?: unknown }
scope.__avoozlPrismPrevious = scope.Prism
scope.Prism = { manual: true, disableWorkerMessageHandler: true }
export {}
