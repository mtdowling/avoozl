const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function installSessionLinks({ call, openSession }) {
  const dialog = document.createElement("dialog");
  dialog.className = "session-link-dialog";
  dialog.setAttribute("aria-label", "Link an existing Claude session");
  document.body.append(dialog);
  let task,
    version = 0,
    offset = 0;
  dialog.innerHTML =
    '<header class="dialog-heading"><h2>Link Claude session</h2><button class="button" data-link-close aria-label="Close session picker">×</button></header><p>Read its transcript here. The worker keeps running in Claude.</p><p data-link-feedback role="status"></p><section data-link-options></section>';
  const options = dialog.querySelector("[data-link-options]"),
    feedback = dialog.querySelector("[data-link-feedback]");
  async function page() {
    const request = ++version;
    feedback.textContent = "Finding existing sessions…";
    options.replaceChildren();
    try {
      const result = await call("session.discover", {
        taskId: task.id,
        offset,
        limit: 20,
      });
      if (request !== version || !dialog.open) return;
      feedback.textContent = task.title;
      options.innerHTML =
        result.items
          .map(
            (s) =>
              `<button class="execution-plan-row" data-link-parent="${esc(s.providerSessionId)}"><b>${esc(s.title)}</b><small>${esc(s.branch || "")} · ${esc(s.worktree)}</small></button>`,
          )
          .join("") ||
        "<p>No local Claude sessions found. Register the real session UUID through the CLI or MCP.</p>";
      options.insertAdjacentHTML(
        "beforeend",
        `<div class="list-pager"><button class="button" data-link-page="${Math.max(0, offset - 20)}" ${offset ? "" : "disabled"}>Previous</button><button class="button" data-link-page="${offset + 20}" ${result.hasMore ? "" : "disabled"}>Next</button></div>`,
      );
    } catch (e) {
      if (request === version) feedback.textContent = e.message;
    }
  }
  async function show(id) {
    const request = ++version;
    offset = 0;
    options.replaceChildren();
    feedback.textContent = "Loading task…";
    if (!dialog.open) dialog.showModal();
    try {
      const found = await call("task.get", { id });
      if (request !== version || !dialog.open) return;
      task = found;
      if (!task.activity?.leaseId)
        throw Error("Claim this task before linking its worker session.");
      await page();
    } catch (e) {
      feedback.textContent = e.message;
    }
  }
  dialog.addEventListener("close", () => {
    version++;
  });
  dialog.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-link-close")) {
      dialog.close();
      return;
    }
    b.disabled = true;
    try {
      if (b.dataset.linkPage !== undefined) {
        offset = Number(b.dataset.linkPage);
        await page();
        return;
      }
      if (b.dataset.linkParent) {
        const request = ++version,
          id = b.dataset.linkParent,
          childOffset = Number(b.dataset.childOffset) || 0,
          result = await call("session.discover", {
            taskId: task.id,
            providerSessionId: id,
            offset: childOffset,
            limit: 40,
          });
        if (request !== version || !dialog.open) return;
        options.innerHTML =
          `<button class="button" data-link-back>← Sessions</button><button class="execution-plan-row" data-link-register="${esc(id)}">Link main session transcript</button>` +
          result.subagents
            .map(
              (agent) =>
                `<button class="execution-plan-row" data-link-register="${esc(id)}" data-agent-id="${esc(agent)}">Link subagent <code>${esc(agent)}</code></button>`,
            )
            .join("") +
          `<div class="list-pager"><button class="button" data-link-parent="${esc(id)}" data-child-offset="${Math.max(0, childOffset - 40)}" ${childOffset ? "" : "disabled"}>Previous subagents</button><button class="button" data-link-parent="${esc(id)}" data-child-offset="${childOffset + 40}" ${result.hasMore ? "" : "disabled"}>Next subagents</button></div>`;
        feedback.textContent =
          "Choose the worker’s transcript. Subagents have their own history.";
        return;
      }
      if (b.hasAttribute("data-link-back")) {
        await page();
        return;
      }
      if (b.dataset.linkRegister) {
        const request = ++version,
          run = await call("session.register", {
            taskId: task.id,
            leaseId: task.activity.leaseId,
            provider: "claude",
            providerSessionId: b.dataset.linkRegister,
            agentId: b.dataset.agentId,
          });
        if (request !== version || !dialog.open) return;
        dialog.close();
        await openSession(run.id);
      }
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      b.disabled = false;
    }
  });
  window.addEventListener("nupp-link-session", (e) => show(e.detail.taskId));
}
