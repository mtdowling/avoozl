import { randomUUID } from "./task-identity.mjs";
import { queryTasks } from "./query.mjs";
import { includeHistorical, isHistoricalTask } from "./browse-model.mjs";
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const queryTerms = (q) => (q || "").match(/(?:[^\s"]+|"[^"]*")+/g) || [];
const keyOf = (term) =>
  term.includes(":") ? term.slice(0, term.indexOf(":")) : "";
export const exclusiveFacets = new Set([
  "scope",
  "status",
  "epic",
  "track",
  "activity",
  "ready",
  "inflight",
]);
export function addQueryFacet(query, term) {
  const key = keyOf(term),
    terms = queryTerms(query).filter(
      (t) => t !== term && (!exclusiveFacets.has(key) || keyOf(t) !== key),
    );
  return [...terms, term].join(" ");
}
export function removeQueryFacet(query, term) {
  return queryTerms(query)
    .filter((t) => t !== term)
    .join(" ");
}
export function createFacetSearch({ state, getData, change, promptResult }) {
  const root = document.getElementById("search-facets"),
    input = document.getElementById("search"),
    bank = document.getElementById("facet-bank"),
    chips = document.getElementById("query-tokens");
  let timer,
    submissionId = randomUUID(),
    promptDraft = "",
    pending = false,
    groups = [],
    counts = new Map(),
    lastSignature = "";
  const expanded = new Set(["scope", "status", "epic"]),
    searches = new Map(),
    pages = new Map(),
    sizes = new Map();
  const allTerms = () => [
    ...["scope", "status", "epic", "track", "tag", "activity"]
      .filter((k) => state[k] && (k !== "scope" || state[k] !== "all"))
      .map((k) => k + ":" + state[k]),
    ...queryTerms(state.q).filter((t) => keyOf(t)),
  ];
  function valuesFor(key) {
    return [
      ...new Set(
        allTerms()
          .filter((t) => keyOf(t) === key)
          .flatMap((t) =>
            t
              .slice(t.indexOf(":") + 1)
              .replace(/^"|"$/g, "")
              .split("|"),
          ),
      ),
    ];
  }
  function term(key, values) {
    return (
      key +
      ":" +
      (values.some((v) => /\s/.test(v))
        ? JSON.stringify(values.join("|"))
        : values.join("|"))
    );
  }
  function mutate(fn) {
    promptDraft = "";
    root.classList.remove("prompt-search");
    change(fn);
    render();
  }
  function toggle(key, value, checked) {
    mutate(() => {
      let values = valuesFor(key).filter((v) => v !== value);
      if (checked) values.push(value);
      if (key === "scope") values = checked ? [value] : [];
      if (key in state) state[key] = key === "scope" ? "all" : "";
      state.q = queryTerms(state.q)
        .filter((t) => keyOf(t) !== key)
        .concat(values.length ? [term(key, values)] : [])
        .join(" ");
    });
  }
  function buildGroups(data) {
    return [
      {
        key: "scope",
        title: "Collection",
        values: [
          ["all", "All plans"],
          ["runtime", "Runtime tasks"],
        ],
      },
      {
        key: "work",
        title: "Work state",
        values: [
          ["ready:true", "Ready to start"],
          ["inflight:true", "In progress"],
          ["status:needs-review", "Needs review"],
        ],
      },
      {
        key: "status",
        title: "Status",
        values: data.statuses.map((s) => [s.id, s.label]),
      },
      {
        key: "epic",
        title: "Epic",
        search: true,
        values: data.epics.map((e) => [e.id, e.title]),
      },
      {
        key: "track",
        title: "Track",
        search: true,
        values: data.tracks.map((t) => [t.id, t.label]),
      },
      {
        key: "tag",
        title: "Tags",
        search: true,
        values: [...new Set(data.tasks.flatMap((t) => t.tags || []))]
          .sort()
          .filter((t) => t !== "historical")
          .map((t) => [t, t]),
      },
      {
        key: "activity",
        title: "Check-in",
        values: [
          ["active", "Fresh"],
          ["stale", "Expired"],
          ["paused", "Paused"],
        ],
      },
    ];
  }
  function countGroups(data) {
    counts = new Map();
    for (const group of groups) {
      const options = {
        scope: state.scope,
        status: state.status,
        epic: state.epic,
        track: state.track,
        tag: state.tag,
        activity: state.activity,
        historical: includeHistorical(state),
        q: queryTerms(state.q)
          .filter((t) =>
            group.key === "work"
              ? !["ready", "inflight"].includes(keyOf(t))
              : keyOf(t) !== group.key,
          )
          .join(" "),
      };
      if (group.key in options)
        options[group.key] = group.key === "scope" ? "all" : "";
      if (state.searchIds)
        options.q = queryTerms(options.q)
          .filter((t) => keyOf(t))
          .join(" ");
      const matched = state.searchIds ? new Set(state.searchIds) : null,
        rows = queryTasks(data, options).filter(
          (t) => !matched || matched.has(t.id),
        ),
        map = new Map();
      if (group.key === "work") {
        for (const value of group.values)
          map.set(
            value[0],
            queryTasks(data, { ...options, q: [options.q, value[0]].join(" ") })
              .length,
          );
      } else
        for (const task of rows) {
          const values =
            group.key === "scope"
              ? ["all", ...(task.scope === "runtime" ? ["runtime"] : [])]
              : group.key === "tag"
                ? [...new Set(task.tags || [])]
                : [
                    group.key === "activity"
                      ? task.activity?.state === "active"
                        ? Date.parse(task.activity.expiresAt) > Date.now()
                          ? "active"
                          : "stale"
                        : task.activity?.state
                      : task[group.key],
                  ];
          for (const value of values) map.set(value, (map.get(value) || 0) + 1);
        }
      counts.set(group.key, map);
    }
  }
  function selected(group, value) {
    if (group.key === "scope")
      return (
        valuesFor("scope").includes(value) ||
        (!valuesFor("scope").length && state.scope === value)
      );
    if (group.key === "work") return allTerms().includes(value);
    return valuesFor(group.key).includes(value);
  }
  function renderOptions(group, container) {
    const q = (searches.get(group.key) || "").toLowerCase(),
      all = group.values.filter(
        ([value, label]) =>
          !q || (label + " " + value).toLowerCase().includes(q),
      ),
      size = sizes.get(group.key) || 8,
      page = pages.get(group.key) || 0,
      start = page * size,
      items = all.slice(start, start + size),
      map = counts.get(group.key) || new Map();
    container.innerHTML =
      items
        .map(([value, label]) => {
          const checked = selected(group, value),
            count = map.get(value) || 0;
          return `<label class="facet-option ${checked ? "selected" : ""}"><input type="checkbox" data-facet-key="${group.key}" data-facet-value="${esc(value)}" ${checked ? "checked" : ""} ${!count && !checked && group.key !== "scope" ? "disabled" : ""}><span>${esc(label)}</span><small>${count.toLocaleString()}</small></label>`;
        })
        .join("") || '<p class="facet-empty">No matching values</p>';
    if (all.length > size)
      container.insertAdjacentHTML(
        "beforeend",
        size === 8
          ? `<button class="facet-more" data-facet-expand="${group.key}">Show more (${all.length})</button>`
          : `<div class="facet-value-pager"><button data-facet-page="${group.key}" data-page="${Math.max(0, page - 1)}" ${page === 0 ? "disabled" : ""}>←</button><small>${start + 1}–${Math.min(all.length, start + size)} of ${all.length}</small><button data-facet-page="${group.key}" data-page="${page + 1}" ${start + size >= all.length ? "disabled" : ""}>→</button></div>`,
      );
  }
  function render() {
    const data = getData();
    if (!data) return;
    groups = buildGroups(data);
    const signature = [
      data.revision,
      state.q,
      state.scope,
      state.status,
      state.epic,
      state.track,
      state.tag,
      state.activity,
      state.historical,
      state.searchIds?.length,
    ].join("\0");
    if (signature !== lastSignature) {
      countGroups(data);
      lastSignature = signature;
    }
    const labels = new Map(
        groups.flatMap((g) =>
          g.values.map(([value, label]) => [
            g.key === "work" ? value : g.key + ":" + value,
            label,
          ]),
        ),
      ),
      terms = allTerms().filter((t) => t !== "scope:all");
    chips.innerHTML =
      (terms.length || state.taskIds.length
        ? '<div class="applied-heading"><span>Applied filters</span><button data-clear-applied>Clear all</button></div>'
        : "") +
      terms
        .map((t) => {
          const key = keyOf(t),
            values = t
              .slice(t.indexOf(":") + 1)
              .replace(/^"|"$/g, "")
              .split("|");
          return values
            .map(
              (v) =>
                `<button class="applied-filter" data-remove-key="${esc(key)}" data-remove-value="${esc(v)}">${esc(labels.get(key + ":" + v) || key + ": " + v)} <span aria-hidden="true">×</span></button>`,
            )
            .join("");
        })
        .join("") +
      (state.taskIds.length
        ? `<button class="applied-filter" data-remove-results>Prompt results <span>×</span></button>`
        : "");
    if (document.activeElement !== input && !promptDraft)
      input.value = queryTerms(state.q)
        .filter((t) => !keyOf(t))
        .join(" ");
    const focused = document.activeElement?.dataset.facetSearch,
      position = document.activeElement?.selectionStart;
    bank.innerHTML =
      groups
        .map(
          (g) =>
            `<details class="shopping-facet" data-facet-group="${g.key}" ${expanded.has(g.key) ? "open" : ""}><summary>${g.title}</summary><div class="facet-body">${expanded.has(g.key) && g.search ? `<input type="search" class="facet-find" data-facet-search="${g.key}" value="${esc(searches.get(g.key) || "")}" placeholder="Find ${g.title.toLowerCase()}…" aria-label="Find ${g.title.toLowerCase()}">` : ""}<div class="facet-options"></div></div></details>`,
        )
        .join("") +
      `<section class="history-facet"><label class="facet-option"><input type="checkbox" data-include-history ${includeHistorical(state) ? "checked" : ""}><span>Include historical records</span><small>${data.tasks.filter((t) => isHistoricalTask(data, t)).length.toLocaleString()}</small></label></section>`;
    for (const g of groups)
      if (expanded.has(g.key))
        renderOptions(
          g,
          bank.querySelector(
            '[data-facet-group="' + g.key + '"] .facet-options',
          ),
        );
    if (focused) {
      const el = bank.querySelector('[data-facet-search="' + focused + '"]');
      el?.focus();
      if (position != null && el?.type === "text")
        el.setSelectionRange(position, position);
    }
  }
  root.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.facetKey) {
      const key = el.dataset.facetKey,
        value = el.dataset.facetValue;
      if (key === "work") {
        const colon = value.indexOf(":");
        toggle(value.slice(0, colon), value.slice(colon + 1), el.checked);
      } else toggle(key, value, el.checked);
    }
    if (el.hasAttribute("data-include-history"))
      mutate(() => {
        state.historical = el.checked;
        state.q = queryTerms(state.q)
          .filter((t) => keyOf(t) !== "historical" && t !== "tag:historical")
          .join(" ");
        if (state.tag === "historical") state.tag = "";
      });
  });
  root.addEventListener("click", (e) => {
    const remove = e.target.closest("[data-remove-key]"),
      expand = e.target.closest("[data-facet-expand]"),
      page = e.target.closest("[data-facet-page]");
    if (remove)
      toggle(remove.dataset.removeKey, remove.dataset.removeValue, false);
    if (e.target.closest("[data-clear-applied]"))
      mutate(() => {
        for (const key of ["q", "status", "epic", "track", "tag", "activity"])
          state[key] = "";
        state.scope = "all";
        state.taskIds = [];
        state.visualization = "";
      });
    if (e.target.closest("[data-remove-results]"))
      mutate(() => {
        state.taskIds = [];
        state.visualization = "";
      });
    if (expand) {
      sizes.set(expand.dataset.facetExpand, 20);
      const g = groups.find((g) => g.key === expand.dataset.facetExpand);
      renderOptions(g, expand.closest(".facet-options"));
    }
    if (page) {
      pages.set(page.dataset.facetPage, Number(page.dataset.page));
      const g = groups.find((g) => g.key === page.dataset.facetPage);
      renderOptions(g, page.closest(".facet-options"));
    }
  });
  bank.addEventListener(
    "toggle",
    (e) => {
      const d = e.target,
        key = d.dataset.facetGroup;
      if (!key) return;
      if (d.open) {
        expanded.add(key);
        const group = groups.find((g) => g.key === key),
          body = d.querySelector(".facet-body");
        body.innerHTML =
          (group.search
            ? `<input type="search" class="facet-find" data-facet-search="${key}" value="${esc(searches.get(key) || "")}" placeholder="Find ${group.title.toLowerCase()}…" aria-label="Find ${group.title.toLowerCase()}">`
            : "") + '<div class="facet-options"></div>';
        renderOptions(group, body.querySelector(".facet-options"));
      } else {
        expanded.delete(key);
        d.querySelector(".facet-body").replaceChildren();
      }
    },
    true,
  );
  bank.addEventListener("input", (e) => {
    const key = e.target.dataset.facetSearch;
    if (!key) return;
    searches.set(key, e.target.value);
    pages.set(key, 0);
    const group = groups.find((g) => g.key === key);
    renderOptions(
      group,
      e.target.closest(".facet-body").querySelector(".facet-options"),
    );
  });
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const isPrompt = /^\/prompt(?:\s|$)/.test(input.value);
    root.classList.toggle("prompt-search", isPrompt);
    input.rows = isPrompt ? 5 : 2;
    document.getElementById("prompt-search-controls").hidden = !isPrompt;
    if (isPrompt) {
      promptDraft = input.value;
      configurePrompt();
      return;
    }
    promptDraft = "";
    timer = setTimeout(
      () =>
        change(() => {
          state.q = [
            ...queryTerms(state.q).filter((t) => keyOf(t)),
            input.value,
          ]
            .filter(Boolean)
            .join(" ");
        }),
      200,
    );
  });
  input.addEventListener("blur", render);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (/^\/prompt(?:\s|$)/.test(input.value)) submitPrompt();
      else {
        clearTimeout(timer);
        change(() => {
          state.q = [
            ...queryTerms(state.q).filter((t) => keyOf(t)),
            input.value,
          ]
            .filter(Boolean)
            .join(" ");
        });
        input.blur();
        render();
      }
    }
  });
  async function call(operation, input) {
    const r = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation, input }),
    });
    const value = await r.json();
    if (!r.ok) throw Error(value.error);
    return value.result;
  }
  let configuring = null;
  function configurePrompt() {
    return (
      configuring ||
      (configuring = loadConfiguration().finally(() => {
        configuring = null;
      }))
    );
  }
  async function loadConfiguration() {
    if (root.dataset.configured) return;
    try {
      const w = await call("workspace", {}),
        project = document.getElementById("prompt-search-project");
      let saved = {};
      try {
        saved = JSON.parse(
          sessionStorage.getItem("nupp-workspace-session-v1") || "{}",
        );
      } catch {}
      project.innerHTML =
        w.projects
          .map((p) => `<option value="${esc(p.id)}">${esc(p.id)}</option>`)
          .join("") || '<option value="">Configure a project</option>';
      if (w.projects.some((p) => p.id === saved.project))
        project.value = saved.project;
      document.getElementById("prompt-search-provider").value =
        saved.provider || "codex";
      if (w.projects.length) root.dataset.configured = "yes";
    } catch (e) {
      document.getElementById("prompt-search-state").textContent = e.message;
    }
  }
  async function submitPrompt() {
    if (pending) return;
    pending = true;
    const button = document.getElementById("prompt-search-submit"),
      feedback = document.getElementById("prompt-search-state");
    button.disabled = true;
    try {
      await configurePrompt();
      const prompt = input.value.replace(/^\/prompt\s*/, "").trim();
      if (!prompt) throw Error("Describe the tasks you want to find.");
      let saved = {};
      try {
        saved = JSON.parse(
          sessionStorage.getItem("nupp-workspace-session-v1") || "{}",
        );
      } catch {}
      const provider = document.getElementById("prompt-search-provider").value,
        run = await call("search.prompt", {
          prompt,
          provider,
          projectId: document.getElementById("prompt-search-project").value,
          model: saved.models?.[provider],
          submissionId,
          context: {
            view: state.view,
            group: state.group,
            filters: { scope: state.scope, q: state.q },
          },
        });
      feedback.textContent = "Searching with " + provider + "…";
      while (pending) {
        await new Promise((r) => setTimeout(r, 1500));
        if (document.hidden) continue;
        const result = await call("search.result", { id: run.id });
        if (result.pending) continue;
        promptDraft = "";
        input.value = "";
        input.rows = 2;
        root.classList.remove("prompt-search");
        document.getElementById("prompt-search-controls").hidden = true;
        promptResult(result.view);
        feedback.textContent = result.explanation;
        submissionId = randomUUID();
        break;
      }
    } catch (e) {
      feedback.textContent = e.message;
    } finally {
      pending = false;
      button.disabled = false;
    }
  }
  document.getElementById("prompt-search-submit").onclick = submitPrompt;
  return { render };
}
