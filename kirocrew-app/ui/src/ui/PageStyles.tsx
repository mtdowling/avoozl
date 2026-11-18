// The page's own stylesheet rules, each a constant text and the one <style>
// element that renders it (UC3.4). Views render the component; the text is
// here, so the standalone page's content security policy can list every
// style by hash (standalone-web, SW2.5).
import { NAV_PILL } from '../nav-style.ts'
import { SEVERITIES, SEVERITY_INK } from '../review-view.ts'

// The mark's look: theme variables only, so it reads in light and dark.
export const CSS_CitedStyle = `
[data-cited="true"] { background: color-mix(in srgb, var(--accent) 14%, transparent); box-shadow: inset 3px 0 0 var(--accent); border-radius: 4px; padding-left: 10px; }
`

// The shared lane entry: no box, only a top rule in the lane's own color
// (--lane-line, set on the lane), flush to the lane's edges.
export const CSS_LaneStyle = `
[data-lane-card]{list-style:none;margin:0;padding:6px 0;border:0;border-top:1px solid var(--lane-line);line-height:1.3}
[data-lane-card] :focus-visible{outline:2px solid var(--accent);outline-offset:1px}
`

export const CSS_HomeCss = `
[data-home]{display:flex;flex-direction:column;gap:20px;min-width:0}
[data-home-tiles]{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
[data-home-tiles]>li>span{height:100%}
[data-home-section]{display:flex;flex-direction:column;min-width:0}
[data-home-head]{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 8px;min-width:0}
[data-home-head] h3{margin:0;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-strong,var(--muted))}
[data-home-hint]{font-size:11px;color:var(--muted);text-align:right;overflow-wrap:anywhere}
[data-home-hint] button{text-decoration:underline;color:inherit}
[data-home-pair]{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:stretch}
[data-home-box]{flex:1;min-height:0;border:1px solid var(--border);border-radius:10px;background:var(--card);padding:2px 14px;overflow-y:auto}
[data-home-pair] [data-home-box]{max-height:22rem}
[data-home-list]{margin:0;padding:0;list-style:none}
[data-home-row]{display:flex;gap:10px;align-items:baseline;padding:9px 0;border-top:1px solid var(--border);font-size:13px;min-width:0}
[data-home-row]:first-child{border-top:0}
[data-home-row-main]{flex:1;min-width:0;overflow-wrap:anywhere}
[data-home-row-side]{flex:none;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
[data-home-sub]{display:block;font-size:12px;color:var(--muted)}
[data-home-num]{flex:none;min-width:1.5em;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
[data-home-pr]{flex:none;font-size:12px;font-variant-numeric:tabular-nums;text-decoration:underline}
[data-home-empty]{margin:0;padding:10px 0;font-size:13px;color:var(--muted)}
[data-home-needs]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
[data-home-need]{display:flex;flex-direction:column;gap:6px;height:100%;padding:12px 14px;border:1px solid var(--border);border-left:3px solid var(--tile-orange,var(--warning));border-radius:10px;background:var(--card);min-width:0;overflow-wrap:anywhere}
[data-home-need-detail]{font-size:12px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
[data-home-need-foot]{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:4px}
@media (max-width:1180px){[data-home-tiles]{grid-template-columns:repeat(3,minmax(0,1fr))}[data-home-needs]{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:767px){[data-home]{gap:16px}[data-home-tiles]{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}[data-home-needs],[data-home-pair]{grid-template-columns:minmax(0,1fr)}[data-home-pair] [data-home-box]{max-height:none}}
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
[data-nav-chevron]{display:inline-flex;flex-shrink:0;transition:transform .15s}
@media (prefers-reduced-motion:reduce){[data-nav-head],[data-nav-item],[data-nav-filters]>label{max-width:none!important;width:100%}
[data-nav-filters] label{font-size:12px}
[data-nav-filters] label>span:first-child,[data-nav-filters] legend{color:var(--muted)}
[data-nav-filters]>label select,[data-nav-filters] input[type=search],[data-nav-filters] input[type=text]{width:100%;min-width:0;box-sizing:border-box;font-size:12.5px}
[data-nav-chevron]{transition:none}}`

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

// Every size and the phone rules live here once, keyed by data attributes.
export const CSS_PanelCss = `
[data-pp]{container-type:inline-size;font-size:12px;line-height:18px;min-width:0;max-width:100%;overflow-x:hidden;box-sizing:border-box;color:var(--text)}
[data-pp] *{box-sizing:border-box}
[data-pp-head]{display:flex;align-items:center;flex-wrap:nowrap;gap:6px;padding:6px 12px;border-bottom:1px solid var(--border);min-width:0}
[data-pp-head-name]{flex:0 1 auto;display:inline-flex;align-items:baseline;gap:4px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;color:var(--text-strong,var(--text))}
[data-pp-head-brand]{display:inline-flex;align-items:baseline;gap:4px;flex:none}
[data-pp-head-instance]{font-weight:400;color:var(--muted);flex:none}
[data-pp-head-workspace]{font-weight:400;color:var(--muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-pp-head-link]{padding:0;margin:0;background:none;border:0;font:inherit;color:inherit;cursor:pointer;text-decoration:none}
[data-pp-head-link]:hover,[data-pp-head-link]:focus-visible{color:var(--accent);text-decoration:underline}
[data-pp-head-tools]{flex:none;display:inline-flex;align-items:center;gap:2px}
[data-pp-head-end]{flex:none;display:inline-flex;align-items:center;gap:4px;margin-left:auto}
[data-pp-section]{border-bottom:1px solid var(--border)}
[data-pp-section-head]{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;background:transparent;border:0;border-radius:0;text-align:left;cursor:pointer;color:var(--text);font:inherit;font-size:12px;font-weight:600;transition:background-color .12s}
[data-pp-section-head]:hover{background:var(--bg-hover)}
[data-pp-section-head] [data-pp-chevron]{flex:none;color:var(--muted)}
[data-pp-section-title]{color:var(--text-strong,var(--text))}
[data-pp-summary]{margin-left:auto;max-width:55%;font-size:11px;font-weight:400;color:var(--muted);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
[data-pp-list]{list-style:none;margin:0;padding:0 0 8px}
[data-pp-row]{display:grid;grid-template-columns:14px minmax(0,1fr) auto;align-items:center;column-gap:8px;padding:4px 12px;transition:background-color .12s}
[data-pp-row]:hover{background:var(--bg-hover)}
[data-pp-row-icon]{display:inline-flex;color:var(--muted)}
[data-pp-row-main]{display:flex;flex-direction:column;min-width:0}
[data-pp-row-line]{display:flex;flex-wrap:nowrap;align-items:center;gap:0 6px;min-width:0;overflow:hidden}
[data-pp-row-title]{display:block;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
a[data-pp-row-title]{text-decoration:none}
a[data-pp-row-title]:hover{text-decoration:underline}
[data-pp-row-line]>[data-tooltip-anchor]{flex:0 0 auto;max-width:100%}
[data-pp-row-line]>[data-tooltip-anchor]:first-child{flex:0 1 auto;min-width:0}
[data-pp-row-line]>[data-tooltip-anchor]:has([data-pp-age]){margin-left:auto}
[data-pp-age]{flex:none;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
[data-pp-row-meta]{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
[data-pp-actions]{display:inline-flex;align-items:center;gap:4px;flex:none}
[data-pp-chip]{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;min-width:0;max-width:10rem;padding:2px 6px;border-radius:4px;font-size:10px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted);background:var(--bg-hover)}
[data-pp-chip][data-tone=ok]{color:var(--ok);background:color-mix(in srgb,var(--ok) 15%,transparent)}
[data-pp-chip][data-tone=warn]{color:var(--warning,#b7791f);background:color-mix(in srgb,var(--warning,#b7791f) 15%,transparent)}
[data-pp-chip][data-tone=danger]{color:var(--danger);background:color-mix(in srgb,var(--danger) 15%,transparent)}
[data-pp-chip][data-tone=info]{color:var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent)}
[data-pp-act],[data-pp-icon]{min-height:22px;background:transparent;display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:2px 8px;border:1px solid var(--border);border-radius:6px;color:var(--muted);font:inherit;font-size:11px;line-height:16px;text-decoration:none;white-space:nowrap;cursor:pointer;transition:background-color .12s,color .12s}
[data-pp-act]:hover,[data-pp-icon]:hover{background:var(--bg-hover);color:var(--text)}
[data-pp-act][data-pp-primary]{border-color:var(--accent);color:var(--accent)}
[data-pp-act]:disabled,[data-pp-icon]:disabled{opacity:.6;cursor:default}
[data-pp-icon][data-bare]{padding:2px 5px;border-color:transparent}
[data-pp-cells]{padding:0 12px 8px}
[data-pp-empty]{margin:0;padding:0 12px 12px;font-size:12px;color:var(--muted)}
@media (max-width:640px){
[data-pp-head-name]>[data-pp-head-brand]{display:none}
[data-pp-head-workspace]>[data-pp-head-dot]{display:none}
[data-pp-narrow-hide]{display:none}
[data-pp-act][data-narrow-icon]{padding:2px 6px}
}
@container (max-width:520px){
[data-pp-row-line]:has(>[data-tooltip-anchor]:nth-child(n+4)){flex-wrap:wrap}
[data-pp-row-line]:has(>[data-tooltip-anchor]:nth-child(n+4))>[data-tooltip-anchor]:first-child{max-width:100%}
}
@container (max-width:520px){
[data-pp-row][data-multi]{grid-template-columns:14px minmax(0,1fr)}
[data-pp-row][data-multi]>[data-pp-actions]{grid-column:2}
}
`

// Kiro Crew's own "AI is working" box (the Projects page's plan banner): a
// rounded box tinted 10% with a 50% border, and a band of the same tint
// sweeping across it for 2 s, ease-in-out. The hue is the theme's --aim, the
// purple Kiro Crew keeps for AI work in every theme. Reduced motion keeps the
// box and stops the sweep.
export const CSS_WorkingStyle = `
@keyframes avoozl-review-sweep { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
[data-review-working] { position: relative; overflow: hidden; border: 1px solid color-mix(in srgb, var(--aim, #7c3aed) 50%, transparent); background: color-mix(in srgb, var(--aim, #7c3aed) 10%, transparent); }
[data-review-working]::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--aim, #7c3aed) 10%, transparent), transparent); animation: avoozl-review-sweep 2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { [data-review-working]::before { animation: none; display: none; } }
`

// The spec's details in one compact bordered box on the Overview: the rail's
// small labeled sections as a label/value grid, scrolling inside the box.
export const CSS_DetailsStyle = `[data-spec-details-box] [data-spec-rail]{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));column-gap:20px;row-gap:14px;align-items:start}
[data-spec-details-box] [data-rail-section]{border-bottom:0!important;margin-bottom:0!important;padding-bottom:0!important;min-width:0}`

export const CSS_SpecRailStyle = `[data-spec-rail]>[data-rail-section]:last-child{border-bottom:0;margin-bottom:0;padding-bottom:0}
[data-rail-edit]{font-size:11.5px;color:var(--accent);background:none;border:0;padding:0;cursor:pointer}
[data-rail-edit]:hover{text-decoration:underline}
[data-rail-edit]:focus-visible,[data-spec-menu-item]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
[data-spec-menu-item]{display:flex;align-items:center;gap:8px;width:100%;height:28px;padding:0 8px;border:0;border-radius:6px;background:none;color:var(--text);font-size:13px;text-align:left;cursor:pointer;text-decoration:none;white-space:nowrap}
[data-spec-menu-item]:hover{background:var(--bg-hover)}
[data-spec-menu-item][aria-disabled=true]{color:var(--muted);cursor:default;background:none}
[data-spec-menu-item][data-danger]{color:var(--danger)}`

export const CSS_StatusCellsStyle = `
[data-sc-row]{container-type:inline-size}
[data-sc-grid]{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:8px}
@container (max-width:420px){[data-sc-grid]{grid-template-columns:minmax(0,1fr)}}
[data-sc]{display:flex;flex-wrap:nowrap;align-items:center;align-content:flex-start;gap:0 8px;min-width:0;padding:4px 8px;border:1px solid var(--border);border-radius:8px;font-size:12px;line-height:18px;color:var(--text)}
[data-sc-title]{flex:0 1 auto;display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;font-weight:600;color:var(--text-strong,var(--text));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-sc-dot]{flex:none;width:8px;height:8px;border-radius:50%;background:var(--muted)}
[data-sc-dot][data-tone=ok]{background:var(--ok)}
[data-sc-dot][data-tone=warn]{background:var(--warning,#b7791f)}
[data-sc-dot][data-tone=danger]{background:var(--danger)}
[data-sc-actions]{flex:none;display:inline-flex;flex-wrap:nowrap;align-items:center;gap:4px;margin-left:auto}
[data-sc-act]{display:inline-flex;align-items:center;justify-content:center;width:24px;height:22px;padding:0;background:transparent;border:1px solid transparent;border-radius:6px;color:var(--muted);font:inherit;text-decoration:none;cursor:pointer;transition:background-color .12s,color .12s}
[data-sc-act]:hover{background:var(--bg-hover);color:var(--text)}
[data-sc-act][data-primary]{color:var(--accent)}
[data-sc-act]:disabled{opacity:.6;cursor:default}
`

// One rule for every group; React keeps a single copy in the document.
export const CSS_FormSectionStyle = '[data-form-section] ~ [data-form-section] { border-top: 1px solid var(--border); padding-top: 16px; }'

// One column on a phone; role | harness | agent | model | source from 1000px.
export const CSS_ModelRowsStyle = '[data-model-role]{display:grid;grid-template-columns:minmax(0,1fr);gap:8px 16px}@media (min-width:1000px){[data-model-role]{grid-template-columns:11rem minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 10rem}}[data-model-role]~[data-model-role]{border-top:1px solid var(--border);padding-top:12px}'

export const CSS_TreeStyle = `.avoozl-tree-node:focus-visible > rect:last-of-type{stroke:var(--accent);stroke-width:2.5}.avoozl-tree-row:focus-visible{outline:2px solid var(--accent);outline-offset:1px}[data-tree-scroll][data-panning] *{cursor:grabbing!important}`

export const CSS_NeedsContextStyle = '[data-needs-context] :is(dl,dd,h4,p,ul){margin:0}[data-needs-context] dd{margin-left:0}'

export const CSS_WalkStyle = `[data-walk-slide]{animation:avoozl-walk 220ms ease}@keyframes avoozl-walk{from{opacity:.2;transform:translateX(12px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion: reduce){[data-walk-slide]{animation:none}}`

export const CSS_PanningStyle = '[data-graph-view] svg[data-panning] *{cursor:grabbing!important}'

// Kiro Crew's own accent for an action, as on its Needs your input cards.
export const REVIEW_ACCENT = 'color-mix(in srgb, var(--aim) 72%, var(--text-strong, var(--text)))'
// Every block a finding is anchored to is tinted by its severity and can be
// focused; the open finding's block is stronger.
const REVIEW_HIT = `[data-review-doc] [data-review-anchor]{cursor:pointer;border-radius:4px;box-shadow:-3px 0 0 var(--hit,var(--accent));background:color-mix(in srgb,var(--hit,var(--accent)) 10%,transparent)}
${SEVERITIES.map((s) => `[data-review-doc] [data-review-anchor][data-review-sev=${s}]{--hit:${SEVERITY_INK[s]}}`).join('\n')}
[data-review-doc] [data-review-anchor]:hover{background:color-mix(in srgb,var(--hit,var(--accent)) 16%,transparent)}
[data-review-doc] [data-review-anchor]:focus-visible{outline:2px solid var(--hit,var(--accent));outline-offset:2px}
[data-review-doc] [data-review-hit]{background:color-mix(in srgb,var(--hit,var(--accent)) 24%,transparent)!important}
[data-toc-item][aria-current=location]{color:var(--text-strong,var(--text));font-weight:600;box-shadow:inset 2px 0 0 var(--accent)}`
const REVIEW_CARD = `[data-finding-card] [data-card-btn]{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 8px;border-radius:6px;font-size:12px;font-weight:500;line-height:1;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;max-width:100%}
[data-finding-card] [data-card-btn]:hover:not(:disabled){background:var(--bg-hover)}
[data-finding-card] [data-card-btn]:disabled{opacity:.55;cursor:default}
[data-finding-card] [data-card-btn][data-main]{color:${REVIEW_ACCENT};border-color:color-mix(in srgb,${REVIEW_ACCENT} 45%,var(--border))}
[data-finding-card] [data-card-btn]:focus-visible{outline:2px solid ${REVIEW_ACCENT};outline-offset:1px}
[data-finding-card] [data-clamp]{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}`
export const CSS_ReviewCss = REVIEW_HIT + REVIEW_CARD

export function CitedStyle() {
  return <style>{CSS_CitedStyle}</style>
}

export function LaneStyle() {
  return <style>{CSS_LaneStyle}</style>
}

export function HomeCss() {
  return <style>{CSS_HomeCss}</style>
}

export function NavStyle() {
  return <style>{CSS_NavStyle}</style>
}

export function RailCss() {
  return <style>{CSS_RailCss}</style>
}

export function PanelCss() {
  return <style>{CSS_PanelCss}</style>
}

export function WorkingStyle() {
  return <style>{CSS_WorkingStyle}</style>
}

export function DetailsStyle() {
  return <style>{CSS_DetailsStyle}</style>
}

export function SpecRailStyle() {
  return <style>{CSS_SpecRailStyle}</style>
}

export function StatusCellsStyle() {
  return <style>{CSS_StatusCellsStyle}</style>
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

export function WalkStyle() {
  return <style>{CSS_WalkStyle}</style>
}

export function PanningStyle() {
  return <style>{CSS_PanningStyle}</style>
}

export function ReviewCss() {
  return <style>{CSS_ReviewCss}</style>
}
