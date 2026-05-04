import crypto from "node:crypto";
import net from "node:net";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export class NoOriginWebSocketTransport {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "ws:") {
      throw new Error("NoOriginWebSocketTransport supports ws:// URLs only.");
    }

    this.url = parsedUrl;
    this.readyState = NoOriginWebSocketTransport.CONNECTING;
    this.listeners = new Map();
    this.buffer = Buffer.alloc(0);
    this.handshakeComplete = false;
    this.secWebSocketKey = crypto.randomBytes(16).toString("base64");

    this.socket = net.createConnection(
      {
        host: parsedUrl.hostname,
        port: Number(parsedUrl.port || 80)
      },
      () => this.writeHandshake()
    );

    this.socket.on("data", (chunk) => this.handleData(chunk));
    this.socket.on("error", (error) => this.handleError(error));
    this.socket.on("close", () => this.handleClose());
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
    if (this.readyState !== NoOriginWebSocketTransport.OPEN) {
      throw new Error("Codex app-server WebSocket is not open.");
    }

    this.socket.write(encodeFrame(Buffer.from(String(message), "utf8"), 0x1));
  }

  close() {
    if (this.readyState === NoOriginWebSocketTransport.CLOSED) {
      return;
    }

    if (this.readyState === NoOriginWebSocketTransport.OPEN) {
      this.readyState = NoOriginWebSocketTransport.CLOSING;
      this.socket.write(encodeFrame(Buffer.alloc(0), 0x8));
    }

    this.socket.end();
    this.socket.destroy();
    this.handleClose();
  }

  writeHandshake() {
    const path = `${this.url.pathname || "/"}${this.url.search}`;
    const headers = [
      `GET ${path} HTTP/1.1`,
      `Host: ${this.url.host}`,
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Key: ${this.secWebSocketKey}`,
      "Sec-WebSocket-Version: 13",
      "",
      ""
    ];

    this.socket.write(headers.join("\r\n"));
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    if (!this.handshakeComplete) {
      if (!this.tryCompleteHandshake()) {
        return;
      }
    }

    this.readFrames();
  }

  tryCompleteHandshake() {
    const separatorIndex = this.buffer.indexOf("\r\n\r\n");
    if (separatorIndex === -1) {
      return false;
    }

    const headerText = this.buffer.slice(0, separatorIndex).toString("utf8");
    this.buffer = this.buffer.slice(separatorIndex + 4);

    const [statusLine, ...headerLines] = headerText.split("\r\n");
    if (!statusLine.includes(" 101 ")) {
      this.handleError(new Error(`Codex app-server rejected WebSocket handshake: ${statusLine}`));
      this.close();
      return false;
    }

    const headers = Object.fromEntries(
      headerLines.map((line) => {
        const separator = line.indexOf(":");
        return [line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim()];
      })
    );
    const expectedAccept = crypto
      .createHash("sha1")
      .update(`${this.secWebSocketKey}${WS_GUID}`)
      .digest("base64");

    if (headers["sec-websocket-accept"] !== expectedAccept) {
      this.handleError(new Error("Codex app-server returned an invalid WebSocket accept header."));
      this.close();
      return false;
    }

    this.handshakeComplete = true;
    this.readyState = NoOriginWebSocketTransport.OPEN;
    this.emit("open", {});
    return true;
  }

  readFrames() {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      const opcode = firstByte & 0x0f;
      const masked = Boolean(secondByte & 0x80);
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < offset + 2) {
          return;
        }
        payloadLength = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (this.buffer.length < offset + 8) {
          return;
        }
        payloadLength = Number(this.buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      const maskOffset = offset;
      let maskKey = null;
      if (masked) {
        maskKey = this.buffer.slice(maskOffset, maskOffset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + payloadLength) {
        return;
      }

      let payload = this.buffer.slice(offset, offset + payloadLength);
      this.buffer = this.buffer.slice(offset + payloadLength);

      if (masked) {
        payload = applyMask(payload, maskKey);
      }

      if (opcode === 0x1) {
        this.emit("message", { data: payload.toString("utf8") });
      } else if (opcode === 0x8) {
        this.close();
        return;
      } else if (opcode === 0x9) {
        this.socket.write(encodeFrame(payload, 0x0a));
      }
    }
  }

  handleError(error) {
    if (this.readyState === NoOriginWebSocketTransport.CLOSED) {
      return;
    }

    this.emit("error", { error });
  }

  handleClose() {
    if (this.readyState === NoOriginWebSocketTransport.CLOSED) {
      return;
    }

    this.readyState = NoOriginWebSocketTransport.CLOSED;
    this.emit("close", {});
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function encodeFrame(payload, opcode) {
  const mask = crypto.randomBytes(4);
  const payloadLength = payload.length;
  let header;

  if (payloadLength < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | payloadLength;
  } else if (payloadLength < 65536) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payloadLength, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payloadLength), 2);
  }

  header[0] = 0x80 | opcode;
  return Buffer.concat([header, mask, applyMask(payload, mask)]);
}

function applyMask(payload, mask) {
  const output = Buffer.alloc(payload.length);

  for (let index = 0; index < payload.length; index += 1) {
    output[index] = payload[index] ^ mask[index % 4];
  }

  return output;
}
