import { createServer } from "node:http";
import { InfraiError, InfraiLogs } from "./infrai_logs.js";
import { buildOrderEvents, orderJobSchema } from "./order_events.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const infrai = { logs: new InfraiLogs(apiKey) };

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/jobs/order") {
      const parsed = orderJobSchema.safeParse(await readJson(request));
      if (!parsed.success) return send(response, 400, { error: "invalid_order_job", issues: parsed.error.issues });

      const events = buildOrderEvents(parsed.data, new Date());
      await Promise.all(events.map((event, index) =>
        infrai.logs.ingest(event, `${parsed.data.order_id}:${event.service}:${index}`),
      ));
      return send(response, 202, { order_id: parsed.data.order_id, events_shipped: events.length });
    }

    if (request.method === "GET" && request.url?.startsWith("/logs/search?")) {
      const url = new URL(request.url, "http://localhost");
      const query = url.searchParams.get("query");
      if (!query) return send(response, 400, { error: "query_required" });
      return send(response, 200, await infrai.logs.search(query));
    }
    return send(response, 404, { error: "not_found" });
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { error: error.code, message: error.message });
    }
    return send(response, 500, { error: "internal_error" });
  }
}).listen(3000, () => {
  console.log("order log service listening on http://localhost:3000");
});
