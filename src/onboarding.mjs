const welcome = document.createElement("section");
welcome.id = "workspace-welcome";
welcome.className = "workspace-welcome";
welcome.hidden = true;
welcome.innerHTML =
  '<h2>Make room for your next project</h2><p>Add a task or write a plan to start. You can also explore a fictional product launch with epics, dependencies, and a walkthrough.</p><div class="intent-controls"><button class="button primary" data-welcome-task>Add a task</button><button class="button" data-welcome-plan>Write a plan</button><button class="button subtle" data-load-examples>Load examples</button></div><p class="example-feedback" role="status"></p>';
document.getElementById("main").prepend(welcome);
export function updateOnboarding(data) {
  welcome.hidden =
    data.tasks.length > 0 || Object.keys(data.documents).length > 0;
}
welcome.addEventListener("click", (event) => {
  if (event.target.closest("[data-welcome-task]"))
    document.getElementById("new-task").click();
  if (event.target.closest("[data-welcome-plan]"))
    window.dispatchEvent(new Event("nupp-write-plan"));
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-load-examples]");
  if (!button) return;
  button.disabled = true;
  const feedback = button
    .closest("section,dialog")
    ?.querySelector(".example-feedback");
  try {
    const response = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "workspace.seed",
        input: { example: "product-launch" },
      }),
    });
    const body = await response.json();
    if (!response.ok) throw Error(body.error);
    location.href = "/?view=strip&scope=all&q=tag%3Aproduct-launch";
  } catch (error) {
    if (feedback) feedback.textContent = error.message;
    button.disabled = false;
  }
});
