import { buildClozePrompt, extractClozeFromAgentText } from "./prompt.js";

export const CODEX_APP_SERVER_URL = "ws://127.0.0.1:4500";
export const CODEX_START_COMMAND = "codex app-server --listen ws://127.0.0.1:4500";
export const CODEX_MODEL = "gpt-5.5";
export const CODEX_REASONING_EFFORT = "xhigh";

const CLIENT_INFO = {
  name: "mksap_anki_chrome_extension",
  title: "MKSAP Anki Cloze Chrome Extension",
  version: "0.1.0"
};

const CLOZE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    cloze: { type: "string" }
  },
  required: ["cloze"],
  additionalProperties: false
};

export async function generateClozeCard(pageCapture, options = {}) {
  const client = new CodexAppServerClient(options);

  try {
    await client.connect();
    await client.initialize();
    const threadId = await client.startThread();
    return await client.startClozeTurn(threadId, pageCapture);
  } finally {
    client.close();
  }
}

export class CodexAppServerClient {
  constructor({
    url = CODEX_APP_SERVER_URL,
    WebSocketCtor = globalThis.WebSocket,
    timeoutMs = 120000,
    requestTimeoutMs = 30000
  } = {}) {
    if (!WebSocketCtor) {
      throw new Error("WebSocket is not available in this environment.");
    }

    this.url = url;
    this.WebSocketCtor = WebSocketCtor;
    this.timeoutMs = timeoutMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.notifications = [];
    this.notificationListeners = new Set();
    this.socket = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = new this.WebSocketCtor(this.url);
      this.socket = socket;

      const failToConnect = () => {
        reject(
          new Error(
            `Could not connect to Codex app-server at ${this.url}. Start it with: ${CODEX_START_COMMAND}`
          )
        );
      };

      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", failToConnect, { once: true });
      socket.addEventListener("message", (event) => this.handleMessage(event));
      socket.addEventListener("close", () => this.rejectPending("Codex app-server connection closed."));
    });
  }

  async initialize() {
    await this.request("initialize", { clientInfo: CLIENT_INFO });
    this.notify("initialized", {});
  }

  async startThread() {
    const response = await this.request("thread/start", {
      serviceName: CLIENT_INFO.name
    });
    const threadId = response?.thread?.id;

    if (!threadId) {
      throw new Error("Codex app-server did not return a thread id.");
    }

    return threadId;
  }

  async startClozeTurn(threadId, pageCapture) {
    let latestAgentText = "";
    const prompt = buildClozePrompt(pageCapture);

    const unsubscribe = this.onNotification((message) => {
      if (message.method !== "item/completed") {
        return;
      }

      const item = message.params?.item ?? message.params;
      if (item?.type === "agentMessage" && typeof item.text === "string") {
        latestAgentText = item.text;
      }
    });

    try {
      await this.request("turn/start", {
        threadId,
        model: CODEX_MODEL,
        effort: CODEX_REASONING_EFFORT,
        input: [{ type: "text", text: prompt }],
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly" },
        outputSchema: CLOZE_OUTPUT_SCHEMA
      });

      const completion = await this.waitForNotification(
        (message) => message.method === "turn/completed" && matchesThread(message, threadId),
        this.timeoutMs
      );
      const status = completion.params?.turn?.status ?? completion.params?.status ?? "completed";

      if (status !== "completed") {
        const error = completion.params?.turn?.error ?? completion.params?.error;
        throw new Error(`Codex turn ended with status "${status}"${error ? `: ${error}` : "."}`);
      }

      return extractClozeFromAgentText(latestAgentText);
    } finally {
      unsubscribe();
    }
  }

  request(method, params = {}) {
    const id = this.nextId++;
    this.send({ method, id, params });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Codex response to ${method}.`));
      }, this.requestTimeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  notify(method, params = {}) {
    this.send({ method, params });
  }

  send(message) {
    if (!this.socket || this.socket.readyState !== this.WebSocketCtor.OPEN) {
      throw new Error("Codex app-server WebSocket is not open.");
    }

    this.socket.send(JSON.stringify(message));
  }

  handleMessage(event) {
    let message;

    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(message, "id")) {
      this.handleResponse(message);
      return;
    }

    this.notifications.push(message);
    for (const listener of this.notificationListeners) {
      listener(message);
    }
  }

  handleResponse(message) {
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message ?? `Codex JSON-RPC error for id ${message.id}.`));
      return;
    }

    pending.resolve(message.result);
  }

  onNotification(listener) {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  waitForNotification(predicate, timeoutMs) {
    const existing = this.notifications.find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error("Timed out waiting for Codex to finish generating the card."));
      }, timeoutMs);

      const unsubscribe = this.onNotification((message) => {
        if (!predicate(message)) {
          return;
        }

        clearTimeout(timeout);
        unsubscribe();
        resolve(message);
      });
    });
  }

  rejectPending(message) {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
      this.pending.delete(id);
    }
  }

  close() {
    if (this.socket && this.socket.readyState !== this.WebSocketCtor.CLOSED) {
      this.socket.close();
    }
    this.socket = null;
  }
}

function matchesThread(message, threadId) {
  const messageThreadId = message.params?.threadId ?? message.params?.turn?.threadId;
  return !messageThreadId || messageThreadId === threadId;
}
