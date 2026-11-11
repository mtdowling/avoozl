const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (v) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
function chart(series, { id, title, keys, format = number }) {
  const width = 900,
    height = 235,
    left = 55,
    top = 22,
    bottom = 45,
    plot = height - top - bottom,
    span = width - left - 15,
    unit = span / Math.max(1, series.length),
    max = Math.max(
      1,
      ...series.map((row) => keys.reduce((a, k) => a + (row[k.key] || 0), 0)),
    ),
    total = series.reduce(
      (n, r) => n + keys.reduce((a, k) => a + (r[k.key] || 0), 0),
      0,
    );
  let bars = "";
  for (const [i, row] of series.entries()) {
    let y = height - bottom;
    for (const k of keys) {
      const value = row[k.key] || 0,
        h = (value / max) * plot;
      y -= h;
      if (h)
        bars += `<rect x="${left + i * unit + unit * 0.13}" y="${y}" width="${unit * 0.74}" height="${h}" fill="${k.color}"><title>${row.day} · ${esc(k.label)}: ${esc(format(value))}</title></rect>`;
    }
  }
  const ticks = [0, 0.5, 1]
    .map(
      (p) =>
        `<g><line x1="${left}" x2="${width - 15}" y1="${top + (1 - p) * plot}" y2="${top + (1 - p) * plot}" stroke="#33404a"/><text x="${left - 8}" y="${top + (1 - p) * plot + 4}" text-anchor="end">${esc(format(p * max))}</text></g>`,
    )
    .join("");
  const labels = series
    .filter(
      (_, i) =>
        i === 0 ||
        i === series.length - 1 ||
        i === Math.floor(series.length / 2),
    )
    .map((row) => {
      const i = series.indexOf(row);
      return `<text x="${left + (i + 0.5) * unit}" y="${height - 15}" text-anchor="middle">${row.day.slice(5)}</text>`;
    })
    .join("");
  return `<section class="usage-chart"><header><h2>${title}</h2><strong>${format(total)}</strong></header><div class="chart-legend">${keys.map((k) => `<span><i style="background:${k.color}"></i>${k.label}</span>`).join("")}</div><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title"><title id="${id}-title">${esc(title)} by day. Total ${esc(format(total))}.</title>${ticks}${bars}${labels}${!total ? '<text x="470" y="110" text-anchor="middle">No recorded activity in this period</text>' : ""}</svg></section>`;
}
export function renderUsage(result) {
  const series = result.series || [],
    coverage = result.usageCoverage || {},
    groupLabel =
      result.groupBy === "model"
        ? "model"
        : result.groupBy === "provider"
          ? "agent"
          : result.groupBy || "task",
    tokens = chart(series, {
      id: "tokens",
      title: "Tokens over time",
      keys: [
        {
          key: "inputTokens",
          label: "Input (including cache)",
          color: "#8fb9bd",
        },
        { key: "outputTokens", label: "Output", color: "#baabde" },
      ],
    }),
    time = chart(series, {
      id: "time",
      title: "Session time over time",
      keys: [
        { key: "agentMs", label: "Agent active", color: "#9ac9af" },
        {
          key: "waitingMs",
          label: "Waiting for input / approval",
          color: "#dfbc85",
        },
        {
          key: "otherMs",
          label: "Startup, idle, disconnected, checks",
          color: "#526373",
        },
      ],
      format: (v) =>
        v >= 3600000
          ? (v / 3600000).toFixed(1) + "h"
          : Math.round(v / 60000) + "m",
    });
  return (
    tokens +
    time +
    `<p class="usage-coverage">UTC days. ${number(coverage.reportedRuns || 0)} conversations reported usage; ${number(coverage.unreportedRuns || 0)} did not report it and remain unknown, not zero. Session wall time is observed activity, not human effort; concurrent sessions add together. Historical usage is not reconstructed. Costs are shown only when the provider reports them.</p><details class="usage-data"><summary>Daily data & ${esc(groupLabel)} totals</summary><div class="usage-table"><table><thead><tr><th>Day</th><th>Input</th><th>Output</th><th>Agent minutes</th><th>Waiting minutes</th><th>Reported cost</th></tr></thead><tbody>${series.map((r) => `<tr><td>${r.day}</td><td>${number(r.inputTokens)}</td><td>${number(r.outputTokens)}</td><td>${(r.agentMs / 60000).toFixed(1)}</td><td>${(r.waitingMs / 60000).toFixed(1)}</td><td>${r.estimatedCostUsd == null ? "—" : "$" + r.estimatedCostUsd.toFixed(3)}</td></tr>`).join("")}</tbody></table></div>${result.groups.map((g) => `<p>${esc(g.key)} · ${g.tokenCoverage === "not-reported" ? "Tokens unreported" : number(g.totalTokens) + " tokens" + (g.tokenCoverage === "partial" ? " (partial)" : "")} · ${g.estimatedCostUsd == null ? "Cost unreported" : "$" + g.estimatedCostUsd.toFixed(3) + " reported"}</p>`).join("")}</details>`
  );
}
