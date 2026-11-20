// A fake credentials provider for tests and proofs (plugin-credentials
// §D1). Every token is made up here, or minted by a fake GitHub on
// 127.0.0.1 when `config.mintUrl` names one. `config`:
//   logFile    a file each call appends one JSON line to
//   refuse     purposes to refuse, such as ["triage"]
//   mode       ok | crash | bad | narrow | broad | slow | leak
//   login      the token's login (default acme-bot[bot])
//   person     the person's login (default acme-dev; "" for none)
//   expiresIn  seconds until the token expires (default 3600)
import fs from "node:fs";

let count = 0,
  first = null;

export const credentials = {
  async token({ repository, owner, permissions, purpose }, { config }) {
    count += 1;
    if (config.logFile)
      fs.appendFileSync(
        config.logFile,
        JSON.stringify({
          pid: process.pid,
          repository,
          owner,
          permissions,
          purpose,
        }) + "\n",
      );
    if ((config.refuse || []).includes(purpose))
      throw Error(`acme does not allow ${purpose}.`);
    const mode = config.mode || "ok";
    if (mode === "crash") process.exit(3);
    if (mode === "slow") await new Promise((r) => setTimeout(r, 60_000));
    let token = `fake.${purpose}.${String(repository || owner).replace(/[^A-Za-z0-9]/g, "_")}.${process.pid}.${count}`;
    let granted = permissions;
    if (config.mintUrl) {
      const reply = await fetch(config.mintUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repositories: repository ? [repository.split("/")[1]] : [],
          owner,
          permissions,
          purpose,
        }),
      }).then((r) => r.json());
      token = reply.token;
      granted = reply.permissions;
    }
    // leak: the first call works; later ones fail quoting that token.
    if (mode === "leak" && count > 1)
      throw Error(`could not mint: held ${first} and ghp_${"a".repeat(36)}`);
    first ??= token;
    if (mode === "bad") token = "two words";
    if (mode === "narrow")
      granted = Object.fromEntries(
        Object.keys(permissions).map((name) => [name, "read"]),
      );
    if (mode === "broad") granted = "all";
    return {
      token,
      expiresAt: new Date(
        Date.now() + (config.expiresIn ?? 3600) * 1000,
      ).toISOString(),
      login: config.login || "acme-bot[bot]",
      ...(config.person === "" ? {} : { person: config.person || "acme-dev" }),
      granted,
    };
  },
};
