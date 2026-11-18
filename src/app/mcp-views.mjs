// MCP App views (R20, design 8.1): four small `ui://` views that Kiro Crew shows
// inside a chat. Each view's own tool names its resource; the buttons call
// other tools that name none (a button whose tool names the view does not
// redraw it). Every button goes through the same operation, and the same
// expected revision, as the CLI and the app page, so a stale view is refused.
// Person-only operations stay refused over MCP, so there is no Approve button.
// The page stays the main view.

const MIME = "text/html;profile=mcp-app";
const LIMIT = 25;

export const VIEW_URIS = {
  plans_graph: "ui://avoozl/graph",
  plans_preview: "ui://avoozl/preview",
  plans_project_preview: "ui://avoozl/project-preview",
  plans_decision: "ui://avoozl/decision",
};

const input = (properties, required = []) => ({
  type: "object",
  properties: {
    input: { type: "object", properties, additionalProperties: true },
  },
  required: required.length ? ["input"] : [],
  additionalProperties: false,
});

// Tools that exist only to carry a view.
export const VIEW_TOOLS = {
  plans_graph: {
    operation: "graph.view",
    description:
      "Show the dependency graph as a small view: ready, running, waiting with blockers, needs you, done. Input: {plan?, spec?}. Reads only.",
    inputSchema: input({ plan: { type: "string" }, spec: { type: "string" } }),
  },
  plans_preview: {
    operation: "plan.preview",
    description:
      "Show the tasks approving a plan would publish, with findings, as a small view. Input: {id}. Reads only; approval is a person's, in the Avoozl app.",
    inputSchema: input({ id: { type: "string" } }, ["id"]),
  },
  plans_project_preview: {
    operation: "github.project.preview",
    description:
      "Show every GitHub write projecting an approved plan would make, as a small view, without making any: issue creates and updates, sub-issue links, blocked-by edges, labels, and Project fields (Release, Wave, Iteration; never Status). Input: {planId, repository?}. Repositories this machine does not write are listed in previewOnly. Reads only.",
    inputSchema: input(
      { planId: { type: "string" }, repository: { type: "string" } },
      ["planId"],
    ),
  },
  plans_decision: {
    operation: "conflicts.view",
    description:
      "Show one open decision with a box for the answer, as a small view. Input: {taskId?}. The button settles it through plans_conflicts.",
    inputSchema: input({ taskId: { type: "string" } }),
  },
};

export const VIEW_URI_LIST = Object.values(VIEW_URIS);

export function viewToolList() {
  return Object.entries(VIEW_TOOLS).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: VIEW_URIS[name] } },
  }));
}

export const withViewLink = (tool) =>
  VIEW_URIS[tool.name]
    ? {
        ...tool,
        _meta: { ...tool._meta, ui: { resourceUri: VIEW_URIS[tool.name] } },
      }
    : tool;

// The operation and input a view tool calls, or {error}.
export function viewCall(name, args = {}) {
  const tool = VIEW_TOOLS[name],
    given = args.input ?? {};
  if (!given || typeof given !== "object" || Array.isArray(given))
    return { error: "input must be an object." };
  if (name === "plans_preview" && typeof given.id !== "string")
    return { error: "Name the plan: input.id." };
  return {
    operation: tool.operation,
    input: name === "plans_decision" ? {} : given,
  };
}

// Small answers for a chat: the graph is cut to LIMIT rows per state.
export function viewResult(name, result, given = {}) {
  if (name === "plans_graph") {
    const byId = new Map(result.tasks.map((task) => [task.id, task])),
      blockers = new Map();
    for (const edge of result.edges)
      if (edge.blocking && !edge.satisfied)
        blockers.set(edge.to, [...(blockers.get(edge.to) || []), edge.from]);
    const groups = {};
    for (const task of result.tasks) {
      const group = (groups[task.state] ??= { count: 0, tasks: [] });
      group.count++;
      if (group.tasks.length < LIMIT)
        group.tasks.push({
          id: task.id,
          title: task.title,
          blockers: (blockers.get(task.id) || []).map(
            (id) => byId.get(id)?.title ?? id,
          ),
        });
    }
    return { revision: result.revision, total: result.total, groups };
  }
  if (name === "plans_decision") {
    const items = result.items.filter(
        (item) =>
          item.kind === "decision" &&
          (!given.taskId || item.taskId === given.taskId),
      ),
      item = items[0] ?? null;
    return {
      revision: result.revision,
      open: items.length,
      decision: item && {
        taskId: item.taskId,
        title: item.title,
        detail: item.detail,
      },
    };
  }
  return result;
}

const STYLE = `
body{font:13px/1.4 system-ui,sans-serif;margin:0;padding:8px;color:var(--color-text-primary,#222);background:var(--color-background-primary,transparent)}
h2{font-size:14px;margin:8px 0 4px}h2 small{font-weight:400;opacity:.7}
ul{margin:0;padding-left:18px}li{margin:2px 0}.sub{opacity:.7}.bad{color:var(--color-text-danger,#b00020)}
button{font:inherit;padding:3px 10px;margin:4px 4px 4px 0;cursor:pointer}
textarea{width:100%;box-sizing:border-box;font:inherit}
`;

// The Kiro Crew host speaks MCP Apps (SEP-1865) over postMessage: ui/initialize,
// then ui/notifications/tool-result with the tool's result, and tools/call for
// buttons. Data is only ever set with textContent, so issue text stays escaped.
const CLIENT = `
const $=document.body,pending=new Map();let next=1,onResult=()=>{};
const send=(m)=>parent.postMessage(m,"*");
const ask=(method,params)=>new Promise((ok,no)=>{const id=next++;pending.set(id,{ok,no});send({jsonrpc:"2.0",id,method,params})});
addEventListener("message",(e)=>{const m=e.data;if(!m||m.jsonrpc!=="2.0")return;
if(m.id!==undefined&&!m.method){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.no(new Error(m.error.message)):p.ok(m.result)}return}
if(m.method==="ui/notifications/tool-result")onResult(m.params)});
ask("ui/initialize",{protocolVersion:"2026-01-26",appInfo:{name:"avoozl",version:"1"},appCapabilities:{}}).then(()=>send({jsonrpc:"2.0",method:"ui/notifications/initialized"})).catch(()=>{});
const data=(r)=>{if(r.isError)throw new Error(r.content?.[0]?.text||"Refused.");return r.structuredContent??JSON.parse(r.content[0].text)};
const call=(name,args)=>ask("tools/call",{name,arguments:args}).then(data);
const el=(tag,text,cls,parent=$)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;parent.append(n);return n};
const button=(label,fn,parent=$)=>{const b=el("button",label,"",parent);b.onclick=async()=>{b.disabled=true;try{await fn()}catch(e){status.textContent=e.message;status.className="bad"}b.disabled=false};return b};
let status;const reset=()=>{$.replaceChildren();status=document.createElement("div");status.className="sub"};
const show=(text,bad)=>{status.textContent=text;status.className=bad?"bad":"sub";$.append(status)};
`;

const page = (title, script) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${STYLE}</style></head><body><script>${CLIENT}${script}</script></body></html>`;

const GRAPH = `
const ORDER=[["ready","Ready"],["running","Running"],["waiting","Waiting"],["needs-you","Needs you"],["done","Done"],["deferred","Deferred"]];
const draw=(g)=>{reset();el("h2","Graph ").append(Object.assign(document.createElement("small"),{textContent:g.total+" tasks, revision "+g.revision}));
for(const [state,label] of ORDER){const group=g.groups[state];if(!group)continue;
el("h2",label+" ("+group.count+")");const ul=el("ul");
for(const t of group.tasks){const li=el("li",t.title,"",ul);if(t.blockers.length)el("span"," waits on "+t.blockers.join(", "),"sub",li)}
if(group.count>group.tasks.length)el("div","and "+(group.count-group.tasks.length)+" more","sub")}
button("Refresh",async()=>{const r=await call("plans_view",{action:"graph",input:{}});draw(shape(r))});$.append(status);};
const shape=(r)=>{const by=new Map(r.tasks.map(t=>[t.id,t])),bl=new Map(),groups={};
for(const e of r.edges)if(e.blocking&&!e.satisfied)bl.set(e.to,[...(bl.get(e.to)||[]),e.from]);
for(const t of r.tasks){const g=(groups[t.state]??={count:0,tasks:[]});g.count++;if(g.tasks.length<${LIMIT})g.tasks.push({id:t.id,title:t.title,blockers:(bl.get(t.id)||[]).map(i=>by.get(i)?.title??i)})}
return{revision:r.revision,total:r.total,groups}};
onResult=(r)=>draw(r.structuredContent);
`;

const PREVIEW = `
const draw=(p)=>{reset();el("h2","Plan "+p.planId+" ").append(Object.assign(document.createElement("small"),{textContent:p.state+(p.approved?", approved":", not approved")+", revision "+p.expectedRevision}));
el("h2","Tasks ("+p.tasks.length+")");const ul=el("ul");
for(const t of p.tasks.slice(0,${LIMIT})){const li=el("li",t.title+" ","",ul);el("span",t.existing?"exists":"new","sub",li)}
if(p.tasks.length>${LIMIT})el("div","and "+(p.tasks.length-${LIMIT})+" more","sub");
const q=p.quality||{},d=q.diagnostics||[];el("h2","Checks ("+d.length+")");
if(!d.length)el("div","No diagnostics.","sub");
const dl=el("ul");for(const x of d.slice(0,${LIMIT}))el("li",(x.severity?x.severity+": ":"")+(x.message||JSON.stringify(x)),x.severity==="error"?"bad":"",dl);
el("div","Approval is a person's. Approve this revision in the Avoozl app.","sub");
button("Refresh",async()=>{const r=await call("plans_plan",{action:"preview",input:{id:p.planId}});draw(r)});$.append(status)};
onResult=(r)=>draw(r.structuredContent);
`;

const PROJECT = `
const draw=(p)=>{reset();el("h2","GitHub writes ").append(Object.assign(document.createElement("small"),{textContent:p.writes.length+" for plan "+p.planId}));
const counts={};for(const w of p.writes)counts[w.kind||w.type||"write"]=(counts[w.kind||w.type||"write"]||0)+1;
const ul=el("ul");for(const [k,n] of Object.entries(counts))el("li",n+" x "+k,"",ul);
if(p.conflicts?.length)el("div",p.conflicts.length+" conflicts; Avoozl leaves those alone.","bad");
if(p.previewOnly?.length)el("div","Not written by this machine: "+p.previewOnly.join(", "),"sub");
let armed=false;const b=button("Project",async()=>{
if(!armed){armed=true;b.textContent="Confirm: write "+p.writes.length+" changes to GitHub";return}
const now=await call("plans_plan",{action:"project_preview",input:{planId:p.planId}});
if(now.planHash!==p.planHash){draw(now);show("The plan changed after this view. Check the new list and press Project again.",true);return}
const r=await call("plans_github",{action:"project",input:{planId:p.planId}});
show("Projected."+(r&&r.issues?" "+r.issues.length+" issues.":""))});
$.append(status)};
onResult=(r)=>draw(r.structuredContent);
`;

const DECISION = `
const draw=(d)=>{reset();if(!d.decision){el("h2","No open decision");el("div","Nothing waits on you here.","sub");button("Refresh",refresh);$.append(status);return}
el("h2",d.decision.title+" ");el("div",d.decision.detail);
if(d.open>1)el("div",(d.open-1)+" more open decisions.","sub");
const box=el("textarea");box.rows=3;box.placeholder="Your answer";
button("Settle",async()=>{const answer=box.value.trim();if(!answer){show("Write the answer first.",true);return}
const r=await call("plans_conflicts",{action:"settle",input:{action:"settle",items:[{taskId:d.decision.taskId}],answer},expectedRevision:d.revision});
if(r.refused?.length){show(r.refused[0].reason,true);return}
show("Settled.");box.disabled=true});
button("Refresh",refresh);$.append(status)};
const refresh=async()=>{const r=await call("plans_conflicts",{action:"view"});const i=r.items.filter(x=>x.kind==="decision");
draw({revision:r.revision,open:i.length,decision:i[0]&&{taskId:i[0].taskId,title:i[0].title,detail:i[0].detail}})};
onResult=(r)=>draw(r.structuredContent);
`;

const HTML = {
  [VIEW_URIS.plans_graph]: page("Avoozl graph", GRAPH),
  [VIEW_URIS.plans_preview]: page("Avoozl plan preview", PREVIEW),
  [VIEW_URIS.plans_project_preview]: page("Avoozl GitHub preview", PROJECT),
  [VIEW_URIS.plans_decision]: page("Avoozl decision", DECISION),
};

export function viewResources() {
  return VIEW_URI_LIST.map((uri) => ({
    uri,
    name: uri.slice("ui://avoozl/".length) + " view",
    mimeType: MIME,
  }));
}

// The resources/read answer for a ui:// URI, or null.
export function readView(uri) {
  const text = HTML[uri];
  return text ? { contents: [{ uri, mimeType: MIME, text }] } : null;
}
