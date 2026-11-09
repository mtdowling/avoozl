# Markdown parser

`marked.mjs` is the unmodified ES module from Marked 18.1.3, published at
https://registry.npmjs.org/marked/-/marked-18.1.3.tgz. Its license is in
MARKED-LICENSE.md. The package integrity is
`sha512-9ChMH8EVVgjgID49nsL6IWxWk5c6GtAsq/xw7U1ggkjkU5AGuv68oLTVlFRtvcUYZtpbNyjyvGo3YDu0fGapiw==`.

The application owns its HTML-escaping renderer, URL policy, heading identities,
and Nupp syntax highlighting in markdown.mjs. No package install, runtime CDN,
or build step is required to serve it.
