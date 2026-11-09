"use strict";
// Opening the exact conversation a task owns.
//
// The only way to open a specific native chat on the tested builds is an
// internal workbench command that is not a published extension API. It is
// isolated here, behind three checks, with a fallback that always works:
//
//   1. The command must actually be registered in this build.
//   2. The build must be one this has been exercised against, unless the user
//      opts into trying anyway.
//   3. The command returning without throwing is not evidence that the
//      intended transcript opened. Where the facade manifest is configured,
//      identity is confirmed by asking the facade which chat channel a client
//      subscribed to after the command ran. Without that, the result is
//      reported as unverified rather than as success.
const vscode = require("vscode");
const fs = require("node:fs");
const http = require("node:http");

const NATIVE_COMMAND = "workbench.action.chat.openSessionInEditorGroup";
// Builds this navigation has been exercised against. A newer build is not
// assumed to work; it is attempted only with the user's agreement.
const TESTED_BUILDS = ["1.138.0", "1.142.0", "1.145.2"];

class ChatNavigator {
  constructor({ client, log, manifestPath }) {
    this.client = client;
    this.log = log;
    this.manifestPath = manifestPath;
    this.capability = null;
  }
  async probe() {
    if (this.capability) return this.capability;
    const commands = await vscode.commands.getCommands(true);
    const setting = vscode.workspace
      .getConfiguration("aicommander")
      .get("nativeChatNavigation", "auto");
    const manifest = this.manifest();
    this.capability = {
      command: NATIVE_COMMAND,
      registered: commands.includes(NATIVE_COMMAND),
      build: vscode.version,
      tested: TESTED_BUILDS.includes(vscode.version),
      setting,
      facade: manifest
        ? { url: manifest.url, workspaceId: manifest.workspaceId }
        : null,
      // Without the facade manifest the extension cannot confirm which
      // transcript opened, and says so instead of implying it checked.
      canVerifyIdentity: Boolean(manifest?.url),
    };
    return this.capability;
  }
  manifest() {
    const configured =
      this.manifestPath ||
      vscode.workspace
        .getConfiguration("aicommander")
        .get("facadeManifest", "");
    if (!configured) return null;
    try {
      return JSON.parse(fs.readFileSync(configured, "utf8"));
    } catch {
      return null;
    }
  }
  // The channels this host owns come from the host itself. The form the editor
  // registers them under is a different matter: desktop and browser surfaces
  // use different scheme prefixes, and there is no API to ask. Candidates are
  // therefore derived and then verified, in order, rather than assumed.
  async channels(runId) {
    const manifest = this.manifest();
    if (!manifest?.url) return null;
    const health = await facadeHealth(manifest);
    if (!health?.ok) return null;
    const entry = (health.sessions || []).find((s) => s.runId === runId);
    if (!entry) return null;
    const uuid = String(entry.session || "").split(":/")[1];
    return {
      session: entry.session,
      chat: entry.chat,
      provider: entry.provider,
      candidates: candidateResources(entry, uuid),
    };
  }
  async open(runId) {
    const capability = await this.probe();
    const report = {
      runId,
      attemptedAt: new Date().toISOString(),
      build: capability.build,
      tested: capability.tested,
      registered: capability.registered,
      used: null,
      verified: false,
      verification: "not attempted",
    };
    if (capability.setting === "never" || !capability.registered) {
      report.used = "picker";
      report.verification =
        capability.setting === "never"
          ? "native navigation is disabled by setting"
          : "the native command is not registered in this build";
      await this.fallback(runId, report.verification);
      this.log(JSON.stringify(report));
      return report;
    }
    if (!capability.tested && capability.setting !== "always") {
      const choice = await vscode.window.showWarningMessage(
        "Opening a specific conversation uses an internal VS Code command that has not been exercised on build " +
          capability.build +
          ".",
        "Try it anyway",
        "Use the session picker",
      );
      if (choice !== "Try it anyway") {
        report.used = "picker";
        report.verification = "untested build; the user chose the picker";
        await this.fallback(runId, report.verification);
        this.log(JSON.stringify(report));
        return report;
      }
    }
    const channels = await this.channels(runId);
    if (!channels) {
      report.used = "picker";
      report.verification =
        "no connected agent host reported a channel for this conversation";
      await this.fallback(runId, report.verification);
      this.log(JSON.stringify(report));
      return report;
    }
    report.chat = channels.chat;
    report.tried = [];
    for (const resource of channels.candidates) {
      let failure = null;
      try {
        // The command takes a Uri, not a string: it calls `.with()` on what it
        // is given. Passing a string fails with "o.with is not a function",
        // which is also why the fallback used to be the only path that worked.
        await vscode.commands.executeCommand(NATIVE_COMMAND, {
          resource: vscode.Uri.parse(resource),
        });
      } catch (error) {
        failure = error.message;
      }
      // The command returning is not evidence that the intended transcript
      // opened. Identity is confirmed against the host's own record of which
      // chat channel a client subscribed to after the attempt.
      const verified = failure
        ? { confirmed: false, detail: "the command failed: " + failure }
        : await this.confirmSubscription(channels.chat);
      report.tried.push({ resource, ...verified });
      if (verified.confirmed) {
        report.used = "native";
        report.resource = resource;
        report.verified = true;
        report.verification = verified.detail;
        this.log(JSON.stringify(report));
        return report;
      }
    }
    report.used = "picker";
    report.verification =
      "no candidate resource opened the conversation's own transcript";
    await this.fallback(runId, report.verification);
    this.log(JSON.stringify(report));
    return report;
  }
  async confirmSubscription(chatChannel) {
    const manifest = this.manifest();
    if (!manifest?.url)
      return {
        confirmed: false,
        detail:
          "no facade manifest is configured, so the opened transcript cannot be identified",
      };
    for (let attempt = 0; attempt < 14; attempt++) {
      const health = await facadeHealth(manifest);
      const subscribed = (health?.clients || []).some((client) =>
        (client.subscriptions || []).includes(chatChannel),
      );
      if (subscribed)
        return {
          confirmed: true,
          detail: "a connected client subscribed to " + chatChannel,
        };
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return {
      confirmed: false,
      detail: "no connected client subscribed to " + chatChannel,
    };
  }
  // Always available: pick the conversation and open it in the website, which
  // remains the supported surface until native navigation is proven here.
  async fallback(runId, reason) {
    const runs = await this.client.call("run.list", { archived: "all" });
    const items = runs.items.map((run) => ({
      label: run.title || run.id,
      description: run.state + " · " + (run.provider || ""),
      detail: run.id === runId ? "This task's conversation" : undefined,
      run,
    }));
    const picked = await vscode.window.showQuickPick(items, {
      title: "Open a conversation",
      placeHolder: reason,
      matchOnDetail: true,
    });
    if (!picked) return;
    const endpoint = this.client.origin;
    await vscode.env.openExternal(
      vscode.Uri.parse(
        endpoint + "/?view=tasks&session=" + encodeURIComponent(picked.run.id),
      ),
    );
  }
}

// Candidate resources for the conversation command, most likely first.
//
// The editor opens an agent host session from a URI shaped
// `agent-host-session://<provider>/<id>`: the authority is the chat-session
// provider and the path is the session identifier. Neither the provider name
// nor the identifier encoding is a published contract, and they differ between
// the editor's built-in host and a remote one, so each form is attempted and
// then verified rather than trusted.
function candidateResources(entry, uuid) {
  const providers = [entry.agentProvider, entry.provider]
    .filter(Boolean)
    .map((provider) => "agent-host-" + provider);
  // Observed encodings: a colon in an identifier is written as a double
  // underscore, and the bare identifier is also accepted in some builds.
  const identifiers = [
    ...(entry.session ? [String(entry.session).replaceAll(":", "__")] : []),
    ...(uuid ? [uuid] : []),
  ];
  const resources = [];
  for (const provider of providers)
    for (const identifier of identifiers)
      resources.push(
        "agent-host-session://" +
          provider +
          "/" +
          identifier.replace(/^\/+/, ""),
      );
  // Then the provider-scheme and raw host forms, which earlier builds accepted.
  for (const provider of providers)
    if (uuid) resources.push(provider + ":/" + uuid);
  if (entry.session) resources.push(entry.session);
  if (entry.chat) resources.push(entry.chat);
  return [...new Set(resources)];
}

function facadeHealth(manifest) {
  const client = manifest.clients?.editor || {};
  const address = client.address || manifest.url;
  let url;
  try {
    url = new URL(String(address).replace(/^ws/, "http"));
  } catch {
    return Promise.resolve(null);
  }
  url.pathname = "/health";
  // The facade authenticates every request, including diagnostics. Without
  // the token every verification would come back empty and each navigation
  // would be reported as unverifiable.
  const token =
    client.connectionToken ||
    (url.searchParams.get("tkn") ?? url.searchParams.get("token"));
  url.search = "";
  const headers = token ? { Authorization: "Bearer " + token } : {};
  return new Promise((resolve) => {
    const req = http.request(url, { method: "GET", headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.setTimeout(2000, () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

module.exports = { ChatNavigator, NATIVE_COMMAND, TESTED_BUILDS };
