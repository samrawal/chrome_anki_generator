import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CodexAppServerClient, generateClozeCard } from "../src/codexClient.js";

describe("CodexAppServerClient", () => {
  it("sends initialize, initialized, thread/start, and turn/start in order", async () => {
    const sockets = [];
    const WebSocketCtor = createMockWebSocketCtor(sockets);
    const promise = generateClozeCard(
      { title: "Question", url: "https://mksap.acponline.org/app/q", text: "Question text" },
      { WebSocketCtor, timeoutMs: 1000, requestTimeoutMs: 1000 }
    );

    const socket = sockets[0];
    socket.open();
    await flushMicrotasks();

    const initialize = socket.nextSent();
    assert.equal(initialize.method, "initialize");
    socket.receive({ id: initialize.id, result: { userAgent: "test" } });
    await flushMicrotasks();

    const initialized = socket.nextSent();
    assert.equal(initialized.method, "initialized");
    assert.equal(initialized.id, undefined);

    const threadStart = socket.nextSent();
    assert.equal(threadStart.method, "thread/start");
    socket.receive({ id: threadStart.id, result: { thread: { id: "thread-1" } } });
    await flushMicrotasks();

    const turnStart = socket.nextSent();
    assert.equal(turnStart.method, "turn/start");
    assert.equal(turnStart.params.threadId, "thread-1");
    assert.equal(turnStart.params.approvalPolicy, "never");
    assert.deepEqual(turnStart.params.sandboxPolicy, { type: "readOnly" });
    assert.equal(turnStart.params.input[0].type, "text");
    assert.match(turnStart.params.input[0].text, /Return exactly one concise Anki cloze note/);
    assert.deepEqual(turnStart.params.outputSchema.required, ["cloze"]);

    socket.receive({ id: turnStart.id, result: { turn: { id: "turn-1", status: "inProgress" } } });
    socket.receive({
      method: "item/completed",
      params: {
        threadId: "thread-1",
        item: {
          type: "agentMessage",
          text: '{"cloze":"Give {{c1::ceftriaxone}} for empiric inpatient pyelonephritis."}'
        }
      }
    });
    socket.receive({
      method: "turn/completed",
      params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } }
    });

    assert.equal(await promise, "Give {{c1::ceftriaxone}} for empiric inpatient pyelonephritis.");
    assert.equal(socket.closed, true);
  });

  it("reports a helpful error when the server is unavailable", async () => {
    const sockets = [];
    const WebSocketCtor = createMockWebSocketCtor(sockets);
    const promise = generateClozeCard(
      { title: "Question", url: "https://mksap.acponline.org/app/q", text: "Question text" },
      { WebSocketCtor, timeoutMs: 1000, requestTimeoutMs: 1000 }
    );

    sockets[0].error();

    await assert.rejects(promise, /Start it with: codex app-server --listen ws:\/\/127\.0\.0\.1:4500/);
  });

  it("surfaces JSON-RPC errors", async () => {
    const sockets = [];
    const WebSocketCtor = createMockWebSocketCtor(sockets);
    const client = new CodexAppServerClient({ WebSocketCtor, requestTimeoutMs: 1000 });
    const connect = client.connect();
    sockets[0].open();
    await connect;

    const request = client.request("thread/start", {});
    const sent = sockets[0].nextSent();
    sockets[0].receive({ id: sent.id, error: { code: 123, message: "no auth" } });

    await assert.rejects(request, /no auth/);
  });

  it("rejects malformed final output", async () => {
    const sockets = [];
    const WebSocketCtor = createMockWebSocketCtor(sockets);
    const promise = generateClozeCard(
      { title: "Question", url: "https://mksap.acponline.org/app/q", text: "Question text" },
      { WebSocketCtor, timeoutMs: 1000, requestTimeoutMs: 1000 }
    );

    const socket = sockets[0];
    socket.open();
    await flushMicrotasks();
    socket.receive({ id: socket.nextSent().id, result: {} });
    await flushMicrotasks();
    socket.nextSent();
    socket.receive({ id: socket.nextSent().id, result: { thread: { id: "thread-1" } } });
    await flushMicrotasks();
    socket.receive({ id: socket.nextSent().id, result: { turn: { id: "turn-1" } } });
    socket.receive({
      method: "item/completed",
      params: {
        threadId: "thread-1",
        item: { type: "agentMessage", text: '{"cloze":"plain text"}' }
      }
    });
    socket.receive({ method: "turn/completed", params: { threadId: "thread-1", status: "completed" } });

    await assert.rejects(promise, /not an Anki cloze card/);
  });

  it("rejects failed turns", async () => {
    const sockets = [];
    const WebSocketCtor = createMockWebSocketCtor(sockets);
    const promise = generateClozeCard(
      { title: "Question", url: "https://mksap.acponline.org/app/q", text: "Question text" },
      { WebSocketCtor, timeoutMs: 1000, requestTimeoutMs: 1000 }
    );

    const socket = sockets[0];
    socket.open();
    await flushMicrotasks();
    socket.receive({ id: socket.nextSent().id, result: {} });
    await flushMicrotasks();
    socket.nextSent();
    socket.receive({ id: socket.nextSent().id, result: { thread: { id: "thread-1" } } });
    await flushMicrotasks();
    socket.receive({ id: socket.nextSent().id, result: { turn: { id: "turn-1" } } });
    socket.receive({
      method: "turn/completed",
      params: { threadId: "thread-1", turn: { id: "turn-1", status: "failed", error: "rate limited" } }
    });

    await assert.rejects(promise, /status "failed": rate limited/);
  });
});

function createMockWebSocketCtor(sockets) {
  return class MockWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.CONNECTING;
      this.listeners = new Map();
      this.sent = [];
      this.closed = false;
      sockets.push(this);
    }

    addEventListener(type, listener, options = {}) {
      const wrapped = options.once
        ? (event) => {
            this.removeEventListener(type, wrapped);
            listener(event);
          }
        : listener;

      const listeners = this.listeners.get(type) ?? [];
      listeners.push(wrapped);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      this.listeners.set(
        type,
        listeners.filter((candidate) => candidate !== listener)
      );
    }

    send(message) {
      this.sent.push(JSON.parse(message));
    }

    close() {
      this.closed = true;
      this.readyState = MockWebSocket.CLOSED;
    }

    open() {
      this.readyState = MockWebSocket.OPEN;
      this.emit("open", {});
    }

    error() {
      this.emit("error", {});
    }

    receive(message) {
      this.emit("message", { data: JSON.stringify(message) });
    }

    nextSent() {
      const message = this.sent.shift();
      assert.ok(message, "expected a sent message");
      return message;
    }

    emit(type, event) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
