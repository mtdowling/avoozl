"use strict";
// Workspace client for the extension.
//
// Every call goes through the workspace server's shared command endpoint, so
// the extension drives exactly the operations the website and CLI drive. It
// never writes a run record and never opens a provider session of its own.
const http = require("node:http");
const https = require("node:https");

// Mirrors `CLIENT_API_VERSION` in src/app/client.mjs. A workspace speaking a
// different major version is refused rather than driven on guesses.
const CLIENT_API_VERSION = "1.0.0";

class WorkspaceError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

class WorkspaceClient {
  constructor(endpoint) {
    this.endpoint = String(endpoint || "").replace(/\/$/, "");
    this.described = null;
  }
  get origin() {
    return this.endpoint;
  }
  async call(operation, input = {}, expectedRevision) {
    const body = JSON.stringify({ operation, input, expectedRevision });
    const response = await request(this.endpoint + "/api/command", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      body,
    });
    let parsed;
    try {
      parsed = JSON.parse(response.body || "{}");
    } catch {
      throw new WorkspaceError(
        "The workspace server returned a response that is not JSON.",
        response.status,
      );
    }
    if (response.status >= 400)
      throw new WorkspaceError(
        parsed.error || "Request failed.",
        response.status,
      );
    return parsed.result;
  }
  async describe() {
    const described = await this.call("client.describe");
    const major = String(described.apiVersion || "").split(".")[0];
    if (major !== CLIENT_API_VERSION.split(".")[0])
      throw new WorkspaceError(
        "This workspace speaks client API " +
          described.apiVersion +
          "; this extension speaks " +
          CLIENT_API_VERSION +
          ". Update the one that is behind.",
        409,
      );
    this.described = described;
    return described;
  }
  async health() {
    const response = await request(this.endpoint + "/api/health", {
      method: "GET",
    });
    return JSON.parse(response.body);
  }
  // Durable server-sequence event stream. Falls back to polling when the
  // stream cannot be opened, so the views still refresh.
  events({ after = 0, onEvent, onError }) {
    const url = new URL(this.endpoint + "/api/events");
    url.searchParams.set("after", String(after));
    url.searchParams.set("compact", "true");
    const client = url.protocol === "https:" ? https : http;
    let aborted = false;
    const req = client.request(
      url,
      { method: "GET", headers: { Accept: "text/event-stream" } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          onError?.(new Error("Event stream returned " + res.statusCode));
          return;
        }
        let buffer = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          buffer += chunk;
          let index;
          while ((index = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("");
            if (!data) continue;
            try {
              onEvent(JSON.parse(data));
            } catch {}
          }
        });
        res.on("end", () => {
          if (!aborted) onError?.(new Error("Event stream closed."));
        });
        res.on("error", (error) => {
          if (!aborted) onError?.(error);
        });
      },
    );
    req.on("error", (error) => {
      if (!aborted) onError?.(error);
    });
    req.end();
    return () => {
      aborted = true;
      req.destroy();
    };
  }
}

function request(url, { method, headers, body, timeoutMs = 30000 }) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(target, { method, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(
        new WorkspaceError(
          "The workspace server did not answer within " +
            timeoutMs +
            "ms. Durable state is unchanged; retry with the same submission IDs.",
          503,
        ),
      );
    });
    req.on("error", (error) =>
      reject(
        error instanceof WorkspaceError
          ? error
          : new WorkspaceError(
              "Cannot reach the workspace server at " +
                target.origin +
                ": " +
                error.message,
              503,
            ),
      ),
    );
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { WorkspaceClient, WorkspaceError, CLIENT_API_VERSION };
