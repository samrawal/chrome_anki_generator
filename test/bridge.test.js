import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { handleBridgeRequest, isOriginAllowed, parseAllowedOrigins } from "../scripts/bridge.js";

describe("bridge origin policy", () => {
  it("allows local clients without an Origin header", () => {
    assert.equal(isOriginAllowed(undefined, new Set()), true);
  });

  it("allows Chrome extension origins by default", () => {
    assert.equal(isOriginAllowed("chrome-extension://abcdefghijklmnop", new Set()), true);
    assert.equal(isOriginAllowed("https://example.com", new Set()), false);
  });

  it("uses exact origins when an allowlist is configured", () => {
    const allowedOrigins = parseAllowedOrigins(
      "chrome-extension://allowed-extension, chrome-extension://other-extension"
    );

    assert.equal(isOriginAllowed("chrome-extension://allowed-extension", allowedOrigins), true);
    assert.equal(isOriginAllowed("chrome-extension://not-allowed", allowedOrigins), false);
  });

  it("rejects disallowed browser origins before generation", async () => {
    let generated = false;
    const response = await requestBridge({
      origin: "https://example.com",
      options: {
        allowedOrigins: parseAllowedOrigins("chrome-extension://allowed-extension"),
        generate: async () => {
          generated = true;
          return "Use {{c1::test}}.";
        }
      }
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: "Origin is not allowed." });
    assert.equal(generated, false);
  });

  it("echoes an allowed browser origin", async () => {
    const response = await requestBridge({
      origin: "chrome-extension://allowed-extension",
      options: {
        allowedOrigins: parseAllowedOrigins("chrome-extension://allowed-extension"),
        generate: async () => "Use {{c1::test}}."
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.header("access-control-allow-origin"), "chrome-extension://allowed-extension");
    assert.deepEqual(response.json(), { cloze: "Use {{c1::test}}." });
  });
});

async function requestBridge({ origin, options }) {
  const request = new EventEmitter();
  request.method = "POST";
  request.url = "/generate-cloze";
  request.headers = origin ? { origin } : {};
  request.setEncoding = () => {};

  const response = createMockResponse();
  const handled = handleBridgeRequest(request, response, options);
  request.emit("data", JSON.stringify({ text: "Question text" }));
  request.emit("end");
  await handled;
  return response;
}

function createMockResponse() {
  return {
    body: "",
    headers: new Map(),
    statusCode: undefined,
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), String(value));
    },
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      for (const [name, value] of Object.entries(headers)) {
        this.setHeader(name, value);
      }
    },
    end(value = "") {
      this.body += value;
    },
    header(name) {
      return this.headers.get(name.toLowerCase());
    },
    json() {
      return JSON.parse(this.body);
    }
  };
}
