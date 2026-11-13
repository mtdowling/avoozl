# Third-party notices

Avoozl is MIT licensed (see [LICENSE](LICENSE)). This file lists the
third-party code copied into this repository or its packages.

## Bundled code

| Component | Version | License                                        | File             | npm package | App package |
| --------- | ------- | ---------------------------------------------- | ---------------- | ----------- | ----------- |
| Marked    | 18.1.3  | MIT; includes the Markdown BSD-3-Clause notice | `src/marked.mjs` | Yes         | No          |
| Prism     | 1.30.0  | MIT                                            | `kirocrew-app/ui/dist/` (page bundle) | Yes | Yes |

`src/marked.mjs` is byte-identical to `lib/marked.esm.js` in
`https://registry.npmjs.org/marked/-/marked-18.1.3.tgz` (integrity
`sha512-9ChMH8EVVgjgID49nsL6IWxWk5c6GtAsq/xw7U1ggkjkU5AGuv68oLTVlFRtvcUYZtpbNyjyvGo3YDu0fGapiw==`).
Its full license text, including the Markdown notice, is in
[src/MARKED-LICENSE.md](src/MARKED-LICENSE.md). That file differs from the
upstream `LICENSE` only in list markers.

The Kiro Crew app page bundles Prism's core and the language grammars listed
in `kirocrew-app/ui/src/prism/languages.ts`, taken unchanged from
`https://registry.npmjs.org/prismjs/-/prismjs-1.30.0.tgz` (integrity
`sha512-DEvV2ZF2r2/63V+tK8hQvrR2ZGn10srHbXviTlcv7Kpzw8jWiNTqbVgjO3IY8RxrrOUF8VPMQQFysYYYv0YZxw==`)
and minified by the page build. Its license text is in
[kirocrew-app/PRISM-LICENSE.md](kirocrew-app/PRISM-LICENSE.md), a copy of the
upstream `LICENSE`, so it ships with the app package.

Apart from Prism, the Kiro Crew app package (`kirocrew-app/`) contains no
third-party code. Its page bundle leaves `react`, `react-dom`, `react/jsx-runtime`,
`@kirocrew/app-sdk`, and `lucide-react` external; Kiro Crew provides them at
run time. Its `bin/lib` copy of the CLI is built from this repository's own
sources and has no npm dependency.

## Installed, not bundled

`npm install avoozl` also installs `react` (MIT) as a dependency. Development
tools (`vite`, `@vitejs/plugin-react`, `typescript`, `prettier`, and their
dependencies) are used only to build and check this repository; none of
their code is copied into either package. `prismjs` is a development
dependency too; only the parts named above reach the page bundle.

## Project assets

`kirocrew-app/assets/icon.png` was added with the app package and carries no
third-party attribution; it is treated as project work under the MIT license.
