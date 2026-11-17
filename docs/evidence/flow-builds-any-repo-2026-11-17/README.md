# Flow builds for a repository with no Radar crew (2026-11-17)

Flow's GitHub card now shows the Builds block for any repository with build
receipts, read from the stored observations. Before, the card was empty
unless the repository's coder was \`issue-radar\` (found by P65 on
mtdowling/avoozl). With no Radar repository the issue stages are hidden.

\`after/flow-*\`: the full app, Flow, a repository with receipts and no Radar
crew (\`&receipt=only\`), 1280 and 390, light and dark. Before this change the
card did not render at all, so there is no before shot.

    cd kirocrew-app/ui
    AVOOZL_HOST_CSS=<host css> node test/browser/flow-builds-shots.mjs <out>
