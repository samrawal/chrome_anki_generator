import { generateClozeCard } from "./bridgeClient.js";

const MKSAP_APP_PREFIX = "https://mksap.acponline.org/app/";

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !isMksapAppUrl(tab.url)) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "mksap-anki:toggle-panel" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/contentScript.js"]
    });
    await chrome.tabs.sendMessage(tab.id, { type: "mksap-anki:toggle-panel" });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "mksap-anki:generate-cloze") {
    return false;
  }

  generateClozeCard(message.capture)
    .then((cloze) => sendResponse({ ok: true, cloze }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    );

  return true;
});

function isMksapAppUrl(url) {
  return typeof url === "string" && url.startsWith(MKSAP_APP_PREFIX);
}
