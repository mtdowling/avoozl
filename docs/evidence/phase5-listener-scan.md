# Phase 5 task 5.8: listener scan and leftover cleanup

Task 5.8 [R24] (design §4.7): search the whole project for `listen(`,
`0.0.0.0`, `[::]`, and `--host`. Every hit is the loopback app backend or is
removed. Base: `kirocrew-native` at `7f0fea5`, after tasks 5.1 to 5.7 and the Phase 6 prep and reconciliation evidence.

## Search

```sh
git grep -n -I -e 'listen(' -e '0\.0\.0\.0' -e '\[::\]' -e '--host' -- . ':!package-lock.json'
grep -rn -I -E 'listen\(|0\.0\.0\.0|\[::\]|--host' kirocrew-app   # includes the ignored, generated bin/lib
```

Scope: `cli.mjs`, `src/`, `scripts/`, `kirocrew-app/` (source, `ui/dist`, and
the generated `bin/lib`), `examples/`, `plans/`, `package.json` scripts,
`README.md`, `AGENTS.md`, and `docs/`.

## Hits before this change

| Hit | Verdict |
|---|---|
| `src/app/app-backend.mjs:376` `server.listen(port, HOST)`, `HOST = "127.0.0.1"` | Kept. The loopback app backend. No host option |
| `kirocrew-app/bin/lib/src/app/app-backend.mjs` `server.listen(port, HOST)` | Kept. Generated copy of the same backend |
| `src/app/test/hub.test.mjs:9` `host: "0.0.0.0"` | Removed. It tested `networkPolicy` in `src/app/network.mjs`, the deleted website's request filter. Nothing imported `network.mjs` after task 5.3, so the module and its test are deleted |
| `src/app/cli.mjs:895` help text `--host` | Removed. No listener reads a host setting now |
| `README.md:107` `--host` | Removed, same reason |

`plans/`, `examples/`, `scripts/`, `package.json` scripts and `kirocrew-app`
source had no hits.

## Hits after this change

| Hit | Verdict |
|---|---|
| `src/app/app-backend.mjs:376` `server.listen(port, HOST)` on `127.0.0.1` | Loopback app backend |
| `kirocrew-app/bin/lib/src/app/app-backend.mjs` | Generated copy of the same |

## Historical hits (not changed, AGENTS.md)

| File | What it records |
|---|---|
| `docs/evidence/phase1-app-package.md:52,56` | Backend bind and an earlier sweep |
| `docs/evidence/phase1-core-runtime.md:37-49` | The Phase 1 sweep, including the since-deleted `scripts/vscode-*.mjs` and `server.mjs` `serve --host` |
| `docs/evidence/phase1-workspace-view.md:38,42` | Backend bind and sweep |
| `docs/evidence/phase2-dispatch-recovery.md:61` | Sweep naming the since-deleted `team-coordination.mjs` |
| `docs/evidence/phase2-model-validation.md:53` | Sweep |
| `docs/evidence/phase2-verify-integrate.md:79` | Sweep |
| `docs/evidence/phase2-views.md:60,63` | Backend bind and sweep |
| `docs/research/vscode/README.md:106` | VS Code Server research run with `--host 127.0.0.1` |

## Leftovers removed

| What | Why |
|---|---|
| `src/app/network.mjs` and its `hub.test.mjs` case | Website request filter; no importer after task 5.3 |
| `host`, `canvasOrigins`, `agentManifest` in the `workspaceConfig()` result (`src/app/config.mjs`) | Read only by the deleted website and agent host. `layered-config.mjs` and the schema still accept the keys, so old `.avoozl.json` files load; the value is ignored |
| `scripts/cdp.mjs` | Chrome DevTools client for the deleted `scripts/vscode-*.mjs` checks; nothing imports it |
| npm `dependencies`: `@assistant-ui/react`, `@assistant-ui/react-markdown`, `@monaco-editor/react`, `monaco-editor`, `lucide-react`, `react-dom`, `react-markdown`, `react-router`, `refractor`, `remark-gfm`, `ws` | No import in `cli.mjs`, `src`, `scripts`, or `kirocrew-app`. `lucide-react` and `react-dom` are host-provided externals in `kirocrew-app/ui/vite.config.ts`, not imports |
| npm `devDependencies`: `@types/react-dom`; `overrides.dompurify` | No `react-dom` import; `dompurify` came only through the removed editor packages |

`package-lock.json` lost 213 packages; no kept package changed version and none
was added. `react` and `@types/react` stay: the app UI imports `react`, and
`tsc` needs its types.

Scripts: every relative import in `scripts/*.mjs` resolves. The `vscode-*`
scripts that imported `server.mjs` were already deleted by task 5.2/5.4.

## Kept and noted

These front-end modules from the deleted website are now reached only by their
own tests: `src/agent-pins.mjs`, `src/band-paint.mjs`, `src/document-pages.mjs`,
`src/graph-layout.mjs`, `src/pan-momentum.mjs`, `src/strip-model.mjs`,
`src/web-notifications.mjs`. None opens a listener. They are outside 5.8's
listener and dependency scope and are left for a later cleanup.
`src/app/compat-cli.mjs` is a one-line compatibility entry point and stays.

## Checks

| Check | Result |
|---|---|
| `npm test` (runs `build:kirocrew-app` first) | 479 of 479 pass after rebasing onto `7f0fea5` |
| `git diff --check` | clean |
| `prettier --check` on changed files | clean |
| `node cli.mjs mcp` `tools/list` | 88 tools |
| `PORT=0 node cli.mjs app-backend`, then `lsof -iTCP -sTCP:LISTEN` for its PID | one listener, `TCP 127.0.0.1:<port>` |
| `kirocrew-app/` tracked files after the rebuild | unchanged |
