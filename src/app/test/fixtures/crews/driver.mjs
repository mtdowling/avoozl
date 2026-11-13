// A test-only crew driver (task 11.9): it plays Kiro Crew's instance list,
// each crew's headroom snapshot, the remote dispatch switch, MC-10, and the
// remote sessions themselves. A remote worker commits in its own clone and
// either pushes its task branch to the bare remote (`push`) or leaves it in
// its folder for this machine to fetch over the fake ssh (`handback`).
// Every crew name is fake; no network and no real host.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { recordCrewSnapshot } from "../../../crews.mjs";

export const FAKE_SSH = path.join(import.meta.dirname, "fake-ssh.mjs");

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

export function crewDriver(store, { crews = {}, root, mc10 = true, remoteDispatch = true } = {}) {
  const state = {
    mc10,
    remoteDispatch,
    // id -> {name, ageSeconds, reachable, agents, headroom overrides}
    crews: structuredClone(crews),
    limits: { memoryGb: 2, diskGb: 5 },
  };
  const driver = {
    state,
    // Write what the app backend would read from Kiro Crew.
    record(now = Date.now()) {
      const entries = Object.entries(state.crews);
      return recordCrewSnapshot(store, {
        instances: entries.map(([id, c]) => ({
          id,
          name: c.name || id,
          ...(c.reachable === false ? { reachable: false } : {}),
        })),
        headroom: Object.fromEntries(
          entries
            .filter(([, c]) => c.reachable !== false)
            .map(([id, c]) => [
              id,
              {
                mem_free_gb: 24,
                disk_free_gb: 300,
                load_per_cpu: 0.2,
                cpu_count: 8,
                posture: "ok",
                ...(c.headroom || {}),
                measured_at: new Date(now - (c.ageSeconds ?? 5) * 1000).toISOString(),
              },
            ]),
        ),
        agents: Object.fromEntries(
          entries.filter(([, c]) => c.agents).map(([id, c]) => [id, c.agents]),
        ),
        remoteDispatch: state.remoteDispatch,
        limits: state.limits,
        mc10: state.mc10,
        ...(state.mc10 ? { attach: "/crews/{crew}/chat?sid={slot}" } : {}),
      });
    },
    set(id, patch) {
      state.crews[id] = { ...state.crews[id], ...patch };
      return driver.record();
    },
    // A remote session's own clone, under the fake crew's folder.
    clone(session, url, base) {
      const folder =
        session.placement?.back?.folder ||
        path.join(root, "remote", session.crew, `${session.task}-${session.attempt}`);
      if (!fs.existsSync(path.join(folder, ".git"))) {
        fs.mkdirSync(path.dirname(folder), { recursive: true });
        git(path.dirname(folder), "clone", "--quiet", url, folder);
        git(folder, "config", "user.name", "Remote");
        git(folder, "config", "user.email", "remote@example.test");
        git(folder, "checkout", "--quiet", "-B", `avoozl/${session.task}`, base);
      }
      return folder;
    },
    // The remote worker's commit: in its clone, then pushed or left there.
    remoteCommit(session, { url, base, file, text, push = false }) {
      const folder = driver.clone(session, url, base);
      fs.mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
      fs.writeFileSync(path.join(folder, file), text);
      git(folder, "add", ".");
      git(folder, "commit", "--quiet", "-m", `Remote ${session.task}`);
      if (push) git(folder, "push", "--quiet", "origin", `HEAD:refs/heads/avoozl/${session.task}`);
      return git(folder, "rev-parse", "HEAD");
    },
  };
  driver.record();
  return driver;
}
