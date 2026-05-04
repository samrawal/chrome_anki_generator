import { BRIDGE_START_COMMAND, generateClozeCard } from "./bridgeClient.js";

const MKSAP_APP_PREFIX = "https://mksap.acponline.org/app/";

const elements = {
  generateButton: document.querySelector("#generateButton"),
  copyButton: document.querySelector("#copyButton"),
  cardOutput: document.querySelector("#cardOutput"),
  message: document.querySelector("#message"),
  statusText: document.querySelector("#statusText")
};

elements.generateButton.addEventListener("click", handleGenerateClick);
elements.copyButton.addEventListener("click", handleCopyClick);

export async function captureActiveTabText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !isMksapAppUrl(tab.url)) {
    throw new Error("Open an MKSAP answer page at mksap.acponline.org/app/ before generating a card.");
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      title: document.title,
      url: location.href,
      text: document.body?.innerText ?? ""
    })
  });

  const capture = result?.result;
  if (!capture?.text?.trim()) {
    throw new Error("Could not read meaningful page text from this MKSAP tab.");
  }

  return capture;
}

export async function copyCard(text) {
  await navigator.clipboard.writeText(text);
}

export function isMksapAppUrl(url) {
  return typeof url === "string" && url.startsWith(MKSAP_APP_PREFIX);
}

async function handleGenerateClick() {
  setBusy(true);
  setMessage("");
  elements.cardOutput.value = "";
  elements.copyButton.disabled = true;

  try {
    setStatus("Reading page");
    const capture = await captureActiveTabText();

    setStatus("Generating cloze");
    const cloze = await generateClozeCard(capture);

    elements.cardOutput.value = cloze;
    elements.copyButton.disabled = false;
    setStatus("Card ready");
    setMessage("Generated one cloze card.", "success");
  } catch (error) {
    const message = humanizeError(error);
    setStatus("Not ready");
    setMessage(message, "error");
  } finally {
    setBusy(false);
  }
}

async function handleCopyClick() {
  const text = elements.cardOutput.value.trim();
  if (!text) {
    return;
  }

  try {
    await copyCard(text);
    setStatus("Copied");
    setMessage("Copied card to clipboard.", "success");
  } catch {
    setMessage("Could not copy to clipboard. Select the card text and copy it manually.", "error");
  }
}

function setBusy(isBusy) {
  elements.generateButton.disabled = isBusy;
  elements.generateButton.textContent = isBusy ? "Generating..." : "Generate cloze";
}

function setStatus(status) {
  elements.statusText.textContent = status;
}

function setMessage(message, type = "") {
  elements.message.textContent = message;
  elements.message.hidden = !message;
  elements.message.className = `message${type ? ` ${type}` : ""}`;
}

function humanizeError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Could not connect to Codex app-server")) {
    return `${message}`;
  }

  if (message.includes("WebSocket is not open")) {
    return `Could not connect to the local MKSAP bridge. Start it with: ${BRIDGE_START_COMMAND}`;
  }

  return message;
}
