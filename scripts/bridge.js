import http from "node:http";

import { generateClozeCard } from "../src/codexClient.js";
import { NoOriginWebSocketTransport } from "./noOriginWebSocketTransport.js";

const HOST = "127.0.0.1";
const PORT = 4555;
const MAX_BODY_BYTES = 2_000_000;
const CODEX_APP_SERVER_URL = process.env.CODEX_APP_SERVER_URL ?? "ws://127.0.0.1:4500";

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/healthz") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method !== "POST" || request.url !== "/generate-cloze") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  try {
    const pageCapture = await readJsonBody(request);
    const cloze = await generateClozeCard(pageCapture, {
      url: CODEX_APP_SERVER_URL,
      WebSocketCtor: NoOriginWebSocketTransport,
      timeoutMs: 120000,
      requestTimeoutMs: 60000
    });

    sendJson(response, 200, { cloze });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MKSAP Anki bridge listening at http://${HOST}:${PORT}`);
  console.log(`Forwarding to Codex app-server at ${CODEX_APP_SERVER_URL}`);
});

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "content-type");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }

      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}
