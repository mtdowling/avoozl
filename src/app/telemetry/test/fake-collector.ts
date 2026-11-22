// A fake OTLP collector on 127.0.0.1 for tests. Each request is recorded; the
// reply is set by `behave`: a status, `{status, headers}`, "reset" to cut the
// connection, or "hold" to leave the request unanswered.
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { TestContext } from "node:test";

export type Reply =
  | number
  | { status: number; headers?: Record<string, string> }
  | "reset"
  | "hold";
export type Collector = {
  requests: {
    url?: string;
    headers: http.IncomingHttpHeaders;
    text: string;
    body: unknown;
  }[];
  behave: (n: number) => Reply;
  inflight: number;
  peak: number;
  url: string;
};

export async function startCollector(
  t: Pick<TestContext, "after">,
): Promise<Collector> {
  const held: http.ServerResponse[] = [];
  const collector: Collector = {
    requests: [],
    behave: () => 200,
    inflight: 0,
    peak: 0,
    url: "",
  };
  const { requests } = collector;
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      requests.push({
        url: request.url,
        headers: request.headers,
        text,
        body: text ? JSON.parse(text) : null,
      });
      collector.inflight++;
      collector.peak = Math.max(collector.peak, collector.inflight);
      const reply = collector.behave(requests.length);
      if (reply === "hold") {
        held.push(response);
        return;
      }
      collector.inflight--;
      if (reply === "reset") return request.socket.destroy();
      const { status, headers } =
        typeof reply === "number" ? { status: reply } : reply;
      response.writeHead(status, headers);
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  t.after(() => {
    for (const response of held) response.destroy();
    server.closeAllConnections();
    server.close();
  });
  collector.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return collector;
}
