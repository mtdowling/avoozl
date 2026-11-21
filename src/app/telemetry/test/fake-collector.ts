// @ts-nocheck: typing debt
// A fake OTLP collector on 127.0.0.1 for tests. Each request is recorded; the
// reply is set by `behave`: a status, `{status, headers}`, "reset" to cut the
// connection, or "hold" to leave the request unanswered.
import http from "node:http";

export async function startCollector(t) {
  const requests = [];
  const held = [];
  const collector = {
    requests,
    behave: () => 200,
    inflight: 0,
    peak: 0,
  };
  const server = http.createServer((request, response) => {
    const chunks = [];
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
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    for (const response of held) response.destroy();
    server.closeAllConnections();
    server.close();
  });
  collector.url = `http://127.0.0.1:${server.address().port}`;
  return collector;
}
