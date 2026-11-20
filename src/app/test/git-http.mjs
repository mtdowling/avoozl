// A fake smart-HTTP git remote for tests and proofs: `basicToken(req)` reads
// git's Basic credentials, and `serveGit(req, res, project, body)` runs
// `git http-backend` over the bare repositories under `project`. `body`, when
// given, is the request body already read; otherwise the request is piped.
import { spawn } from "node:child_process";

export function basicToken(req) {
  const [user, token] = Buffer.from(
    (req.headers.authorization || "").replace(/^Basic /, ""),
    "base64",
  )
    .toString("utf8")
    .split(":");
  return user === "x-access-token" ? token : null;
}

// `owner/name` of a smart-HTTP path such as /acme/api.git/info/refs.
export const repositoryOfPath = (pathname) =>
  pathname
    .split("/")
    .slice(1, 3)
    .join("/")
    .replace(/\.git$/, "");

export function challenge(res) {
  res.writeHead(401, { "WWW-Authenticate": 'Basic realm="fake"' });
  res.end();
}

export function serveGit(req, res, project, body) {
  const url = new URL(req.url, "http://x");
  const cgi = spawn("git", ["http-backend"], {
    env: {
      ...process.env,
      GIT_PROJECT_ROOT: project,
      GIT_HTTP_EXPORT_ALL: "1",
      PATH_INFO: url.pathname,
      QUERY_STRING: url.search.slice(1),
      REQUEST_METHOD: req.method,
      CONTENT_TYPE: req.headers["content-type"] || "",
      REMOTE_USER: "avoozl",
      REMOTE_ADDR: "127.0.0.1",
    },
  });
  if (body === undefined) req.pipe(cgi.stdin);
  else cgi.stdin.end(body);
  let head = Buffer.alloc(0),
    sent = false;
  cgi.stdout.on("data", (chunk) => {
    if (sent) return res.write(chunk);
    head = Buffer.concat([head, chunk]);
    const at = head.indexOf("\r\n\r\n");
    if (at < 0) return;
    const headers = {};
    let status = 200;
    for (const line of head.subarray(0, at).toString().split("\r\n")) {
      const [key, ...value] = line.split(":");
      if (key.toLowerCase() === "status")
        status = Number.parseInt(value.join(":"));
      else headers[key] = value.join(":").trim();
    }
    res.writeHead(status, headers);
    res.write(head.subarray(at + 4));
    sent = true;
  });
  cgi.on("close", () => res.end());
}
