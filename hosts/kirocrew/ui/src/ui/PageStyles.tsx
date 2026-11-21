// The page's own stylesheet rules, each a constant text and the one <style>
// element that renders it (UC3.4). Views render the component; the text is
// here, so the standalone page's content security policy can list every
// style by hash (standalone-web, SW2.5).
import { NAV_PILL } from '../nav-style.ts'

// The mark's look: theme variables only, so it reads in light and dark.
export const CSS_CitedStyle = `
[data-cited="true"] { background: color-mix(in srgb, var(--accent) 14%, transparent); box-shadow: inset 3px 0 0 var(--accent); border-radius: 4px; padding-left: 10px; }
`

// A lane entry is a card, as Ultra Mode's Board draws a crew member: a
// hairline border, the host's large radius, a faint raised fill that deepens
// on hover, 8px by 12px of padding (6px in a narrow lane). Its left edge is a 3px rule in the lane's
// own color (--lane-line, set on the lane), as the Home page marks a Needs you
// card. The title is not underlined until hovered. The lane's heading takes
// the lane color mixed toward the text, the Board's status tone, so it reads
// in light and dark.
export const CSS_LaneStyle = `
[data-lane-card]{list-style:none;margin:0;padding:8px 12px;border:1px solid var(--border);border-left:3px solid var(--lane-line);border-radius:var(--radius-lg,12px);background:color-mix(in srgb,var(--bg-elevated) 40%,transparent);line-height:1.3;transition:background-color .12s}
[data-lane-compact] [data-lane-card]{padding:6px}
[data-lane-card]:hover{background:var(--bg-hover)}
[data-lane-card] [data-task-title]{text-decoration:none}
[data-lane-card] [data-task-title]:hover{text-decoration:underline}
[data-lane-card] :focus-visible{outline:2px solid var(--accent);outline-offset:1px}
[data-lane-head]{color:color-mix(in srgb,var(--lane-line) 45%,var(--text-strong,var(--text)))}
[data-lane-dot]{flex:none;width:8px;height:8px;border-radius:9999px;background:var(--lane-line)}
`

// Hover and keyboard focus use Kiro Crew's theme variables, as in Radar's
// sidebar. The selected item keeps its tint; a hover on it only deepens it.
export const CSS_NavStyle = `[data-nav-head]{display:flex;align-items:center;gap:6px;width:100%;min-width:0;flex-shrink:0;box-sizing:border-box;height:${NAV_PILL}px;padding:0 12px;border:0;background:none;color:var(--muted);font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;text-align:left;cursor:pointer;transition:background-color .12s,color .12s}
[data-nav-head]:hover{color:var(--text)}
[data-nav-head][data-open],[data-nav-head][data-selected]{color:var(--text)}
[data-nav-head][data-selected]{background:var(--accent-subtle,var(--bg-hover,var(--bg-elevated)))}
[data-nav-head][data-selected]:hover{background:color-mix(in srgb,var(--accent) 18%,var(--bg-elevated))}
[data-nav-item]:not([data-nav-head]){display:flex;align-items:center;gap:8px;width:100%;min-width:0;flex-shrink:0;box-sizing:border-box;height:${NAV_PILL}px;padding:0 8px;border:0;border-radius:8px;background:none;color:var(--muted);font-size:13px;text-align:left;cursor:pointer;transition:background-color .12s,color .12s}
[data-nav-text]{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-nav-item]:not([data-nav-head]):hover{background:var(--bg-hover);color:var(--text)}
[data-nav-item]:not([data-nav-head])[data-selected]{background:var(--accent-subtle,var(--bg-hover,var(--bg-elevated)));color:var(--text);font-weight:500}
[data-nav-item]:not([data-nav-head])[data-selected]:hover{background:color-mix(in srgb,var(--accent) 18%,var(--bg-elevated))}
[data-nav-head]:focus-visible,[data-nav-item]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
[data-nav-filters]>label{max-width:none!important;width:100%}
[data-nav-filters] label{font-size:12px}
[data-nav-filters] label>span:first-child,[data-nav-filters] legend{color:var(--muted)}
[data-nav-filters]>label select,[data-nav-filters] input[type=search],[data-nav-filters] input[type=text]{width:100%;min-width:0;box-sizing:border-box;font-size:12.5px}
[data-nav-chevron]{display:inline-flex;flex-shrink:0}
@media (prefers-reduced-motion:reduce){[data-nav-head],[data-nav-item],[data-nav-filters]>label{max-width:none!important;width:100%}
[data-nav-filters] label{font-size:12px}
[data-nav-filters] label>span:first-child,[data-nav-filters] legend{color:var(--muted)}
[data-nav-filters]>label select,[data-nav-filters] input[type=search],[data-nav-filters] input[type=text]{width:100%;min-width:0;box-sizing:border-box;font-size:12.5px}}`

// Radar's sizes: 12px headers at .05em, 13px rows 8px in, 6px corners.
export const CSS_RailCss = `[data-rail-head]{display:flex;align-items:center;gap:6px;margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
[data-rail-row]{display:flex;align-items:center;gap:8px;width:100%;min-width:0;box-sizing:border-box;height:${NAV_PILL}px;padding:0 8px;border:0;border-radius:6px;background:none;color:var(--muted);font:inherit;font-size:13px;text-align:left;cursor:pointer;transition:background-color .12s,color .12s}
[data-rail-row]:hover{background:var(--bg-hover);color:var(--text)}
[data-rail-row][aria-pressed=true]{background:var(--accent-subtle,var(--bg-hover));color:var(--text);font-weight:500}
[data-rail-row][aria-pressed=true]:hover{background:color-mix(in srgb,var(--accent) 18%,var(--bg-elevated))}
[data-rail-row]:disabled{opacity:.4;cursor:default}
[data-rail-chip]{display:inline-flex;align-items:center;gap:8px;max-width:100%;box-sizing:border-box;padding:4px 12px;border:0;border-radius:999px;color:var(--text);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:background-color .12s}
[data-rail-chip][aria-pressed=true]{font-weight:700}
[data-rail-icon]{display:inline-flex;padding:2px;border:0;border-radius:4px;background:none;color:var(--muted);cursor:pointer}
[data-rail-icon]:hover{color:var(--text);background:var(--bg-hover)}
[data-rail-icon][aria-expanded=true]{color:var(--accent)}
[data-rail-row]:focus-visible,[data-rail-chip]:focus-visible,[data-rail-icon]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
[data-rail-text]{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`

// The spec's details in one compact bordered box on the Overview: the rail's
// small labeled sections as a label/value grid, scrolling inside the box.
// The Overview's Spec details, read like GitHub's About box: one tight row
// per section, a small muted label in a column as wide as the longest label,
// the value beside it, and the Edit pencil at the row's end. A section's
// own small lists (Links, the state counts, the dates) run label beside
// value or on one wrapping line. The rows share the columns (subgrid), so
// every value starts at the same edge. Inline sizes on the rail's parts give
// way here (!important), so the rail keeps one markup.
export const CSS_DetailsStyle = `[data-spec-details-box] [data-spec-rail]{display:grid;grid-template-columns:minmax(6.5rem,max-content) minmax(0,1fr) auto;column-gap:14px;line-height:18px!important}
[data-spec-details-box] [data-rail-section]{display:grid;grid-column:1/-1;grid-template-columns:subgrid;align-items:start;min-width:0;padding:4px 0!important;margin:0!important;border-bottom:1px solid color-mix(in srgb,var(--border) 70%,transparent)!important}
[data-spec-details-box] [data-rail-section]:first-child{padding-top:0!important}
[data-spec-details-box] [data-rail-section]:last-child{border-bottom:0!important;padding-bottom:0!important}
[data-spec-details-box] [data-rail-head]{display:contents!important}
[data-spec-details-box] [data-rail-head]>h4{grid-column:1;grid-row:1;font-size:12px!important;font-weight:400!important;letter-spacing:0!important;text-transform:none!important;line-height:18px!important;white-space:nowrap}
[data-spec-details-box] [data-rail-head]>:not(h4){grid-column:3;grid-row:1;display:inline-flex;height:18px;align-items:center}
[data-spec-details-box] [data-rail-edit]{padding:0!important}
[data-spec-details-box] [data-rail-body]{grid-column:2;grid-row:1}
[data-spec-details-box] [data-spec-links] dl{display:grid!important;grid-template-columns:max-content minmax(0,1fr);gap:1px 10px!important}
[data-spec-details-box] [data-spec-links-row]{display:contents}
[data-spec-details-box] [data-rail-section=Progress] dl,[data-spec-details-box] [data-rail-section=Dates] [data-rail-body]>div{flex-direction:row!important;flex-wrap:wrap;gap:0 12px!important;margin-top:2px!important}
[data-spec-details-box] [data-state-count],[data-spec-details-box] [data-rail-date]{justify-content:flex-start!important;gap:4px!important}`

export const CSS_SpecRailStyle = `[data-spec-rail]>[data-rail-section]:last-child{border-bottom:0;margin-bottom:0;padding-bottom:0}
[data-rail-edit]{font-size:11.5px;color:var(--accent);background:none;border:0;padding:0;cursor:pointer}
[data-rail-edit]:hover{text-decoration:underline}
[data-rail-edit]:focus-visible,[data-spec-menu-item]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
[data-spec-menu-item]{display:flex;align-items:center;gap:8px;width:100%;height:28px;padding:0 8px;border:0;border-radius:6px;background:none;color:var(--text);font-size:13px;text-align:left;cursor:pointer;text-decoration:none;white-space:nowrap}
[data-spec-menu-item]:hover{background:var(--bg-hover)}
[data-spec-menu-item][aria-disabled=true]{color:var(--muted);cursor:default;background:none}
[data-spec-menu-item][data-danger]{color:var(--danger)}`

// One rule for every group; React keeps a single copy in the document.
export const CSS_FormSectionStyle = '[data-form-section] ~ [data-form-section] { border-top: 1px solid var(--border); padding-top: 16px; }'

// One column on a phone; role | harness | agent | model | source from 1000px.
export const CSS_ModelRowsStyle =
  '[data-model-role]{display:grid;grid-template-columns:minmax(0,1fr);gap:8px 16px}@media (min-width:1000px){[data-model-role]{grid-template-columns:11rem minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 10rem}}[data-model-role]~[data-model-role]{border-top:1px solid var(--border);padding-top:12px}'

export const CSS_TreeStyle = `[data-tree-node]:focus-visible > rect:last-of-type{stroke:var(--accent);stroke-width:2.5}[data-tree-row]:focus-visible{outline:2px solid var(--accent);outline-offset:1px}[data-tree-scroll][data-panning] *{cursor:grabbing!important}`

export const CSS_NeedsContextStyle = '[data-needs-context] :is(dl,dd,h4,p,ul){margin:0}[data-needs-context] dd{margin-left:0}'

export const CSS_PanningStyle = '[data-graph-view] svg[data-panning] *{cursor:grabbing!important}'

// A release row's state and title columns from the small breakpoint up, the
// widths Kiro Crew's stylesheet has no class for (sm:w-28, sm:w-1/3).
export const CSS_ReleaseRowStyle = '@media (min-width:40rem){[data-release-state]{width:7rem}[data-release-title]{width:33.333333%}}'

export function CitedStyle() {
  return <style>{CSS_CitedStyle}</style>
}

export function LaneStyle() {
  return <style>{CSS_LaneStyle}</style>
}

export function NavStyle() {
  return <style>{CSS_NavStyle}</style>
}

export function RailCss() {
  return <style>{CSS_RailCss}</style>
}

export function DetailsStyle() {
  return <style>{CSS_DetailsStyle}</style>
}

export function SpecRailStyle() {
  return <style>{CSS_SpecRailStyle}</style>
}

export function FormSectionStyle() {
  return (
    <style href="avoozl-form-section" precedence="default">
      {CSS_FormSectionStyle}
    </style>
  )
}

export function ModelRowsStyle() {
  return (
    <style href="avoozl-models-rows" precedence="default">
      {CSS_ModelRowsStyle}
    </style>
  )
}

export function TreeStyle() {
  return <style>{CSS_TreeStyle}</style>
}

export function NeedsContextStyle() {
  return <style>{CSS_NeedsContextStyle}</style>
}

export function PanningStyle() {
  return <style>{CSS_PanningStyle}</style>
}

export function ReleaseRowStyle() {
  return <style>{CSS_ReleaseRowStyle}</style>
}
