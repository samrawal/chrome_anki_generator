(() => {
if (globalThis.__mksapAnkiPanelLoaded) {
  return;
}
globalThis.__mksapAnkiPanelLoaded = true;

const HOST_ID = "mksap-anki-cloze-panel-host";
const PANEL_VISIBLE_CLASS = "is-visible";
const GENERATING_CLASS = "is-generating";

let panel;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "mksap-anki:toggle-panel") {
    return false;
  }

  togglePanel();
  return false;
});

function togglePanel() {
  const panelState = getPanel();
  const willShow = !panelState.host.classList.contains(PANEL_VISIBLE_CLASS);

  panelState.host.classList.toggle(PANEL_VISIBLE_CLASS);

  if (willShow) {
    maybeAutoGenerate(panelState.refs);
  }
}

function getPanel() {
  if (panel) {
    return panel;
  }

  panel = createPanel();
  document.documentElement.append(panel.host);
  return panel;
}

function createPanel() {
  const host = document.createElement("div");
  host.id = HOST_ID;

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        bottom: 18px;
        box-sizing: border-box;
        color: #18202c;
        display: none;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        position: fixed;
        right: 18px;
        width: min(390px, calc(100vw - 32px));
        z-index: 2147483647;
      }

      :host(.${PANEL_VISIBLE_CLASS}) {
        display: block;
      }

      * {
        box-sizing: border-box;
      }

      button,
      textarea {
        font: inherit;
      }

      .panel {
        background: #f7f8f5;
        border: 1px solid #c8d0ca;
        border-radius: 8px;
        box-shadow: 0 16px 48px rgba(20, 30, 24, 0.22);
        overflow: hidden;
        position: relative;
      }

      .panel::before {
        background: linear-gradient(90deg, #2b8073, #e3c46f, #7aa6a0, #2b8073);
        background-size: 240% 100%;
        content: "";
        display: block;
        height: 3px;
        opacity: 0;
        transition: opacity 160ms ease;
      }

      :host(.${GENERATING_CLASS}) .panel::before {
        animation: mksap-gradient-sweep 2.6s ease-in-out infinite;
        opacity: 1;
      }

      .header {
        align-items: center;
        background: #ffffff;
        border-bottom: 1px solid #dce1dc;
        display: flex;
        gap: 10px;
        justify-content: space-between;
        padding: 12px 12px 10px;
      }

      .brand {
        align-items: center;
        display: flex;
        gap: 10px;
        min-width: 0;
      }

      .brand-icon {
        border-radius: 8px;
        display: block;
        flex: 0 0 auto;
        height: 32px;
        width: 32px;
      }

      .brand-text {
        min-width: 0;
      }

      .title {
        margin: 0;
        color: #18202c;
        font-size: 15px;
        font-weight: 750;
        letter-spacing: 0;
        line-height: 1.2;
      }

      .status {
        color: #5d6675;
        font-size: 12px;
        line-height: 1.3;
        margin-top: 3px;
      }

      .icon-button {
        align-items: center;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        color: #54605a;
        cursor: pointer;
        display: inline-flex;
        height: 30px;
        justify-content: center;
        width: 30px;
      }

      .icon-button:hover {
        background: #eef2ef;
        border-color: #d7ded8;
      }

      .body {
        background: linear-gradient(120deg, rgba(255,255,255,0), rgba(43,128,115,0), rgba(227,196,111,0));
        background-size: 260% 260%;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
      }

      :host(.${GENERATING_CLASS}) .body {
        animation: mksap-soft-wash 3.4s ease-in-out infinite;
        background-image: linear-gradient(120deg, rgba(255,255,255,0.35), rgba(43,128,115,0.08), rgba(227,196,111,0.12), rgba(255,255,255,0.35));
      }

      .message {
        background: #ffffff;
        border: 1px solid #d7dacf;
        border-radius: 6px;
        color: #384050;
        display: none;
        font-size: 13px;
        line-height: 1.4;
        padding: 8px 9px;
      }

      .message.is-visible {
        display: block;
      }

      .message.error {
        background: #fff7f4;
        border-color: #e0b4a8;
        color: #7a2f22;
      }

      .message.success {
        background: #f3fbf5;
        border-color: #b7d4bf;
        color: #245b35;
      }

      .actions {
        display: grid;
        gap: 8px;
        grid-template-columns: 1fr auto;
      }

      .button {
        background: #ffffff;
        border: 1px solid #bac2bd;
        border-radius: 6px;
        color: #18202c;
        cursor: pointer;
        font-weight: 650;
        min-height: 36px;
        padding: 0 12px;
      }

      .button:hover:not(:disabled) {
        background: #f1f4ef;
        border-color: #6c7a70;
      }

      .button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .primary {
        background: #1f6f62;
        border-color: #1f6f62;
        color: #ffffff;
      }

      .primary:hover:not(:disabled) {
        background: #195c52;
        border-color: #195c52;
      }

      :host(.${GENERATING_CLASS}) .primary {
        animation: mksap-button-pulse 1.8s ease-in-out infinite;
        background-image: linear-gradient(90deg, #1f6f62, #2b8073, #6d8f73, #1f6f62);
        background-size: 220% 100%;
        border-color: #2b8073;
      }

      .output {
        background: #ffffff;
        border: 1px solid #cfd5ce;
        border-radius: 6px;
        color: #18202c;
        line-height: 1.45;
        min-height: 155px;
        padding: 10px;
        resize: vertical;
        width: 100%;
      }

      :host(.${GENERATING_CLASS}) .output {
        animation: mksap-output-breathe 2.2s ease-in-out infinite;
        background-image: linear-gradient(120deg, #ffffff 0%, #f5faf7 40%, #fff9ea 58%, #ffffff 100%);
        background-size: 240% 100%;
      }

      .output:focus,
      .button:focus-visible,
      .icon-button:focus-visible {
        outline: 2px solid #2b8073;
        outline-offset: 2px;
      }

      @keyframes mksap-gradient-sweep {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }

      @keyframes mksap-soft-wash {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }

      @keyframes mksap-button-pulse {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }

      @keyframes mksap-output-breathe {
        0% {
          background-position: 0% 50%;
          border-color: #cfd5ce;
        }
        50% {
          background-position: 100% 50%;
          border-color: #9fc8bd;
        }
        100% {
          background-position: 0% 50%;
          border-color: #cfd5ce;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        :host(.${GENERATING_CLASS}) .panel::before,
        :host(.${GENERATING_CLASS}) .body,
        :host(.${GENERATING_CLASS}) .primary,
        :host(.${GENERATING_CLASS}) .output {
          animation: none;
        }
      }
    </style>
    <section class="panel" role="dialog" aria-label="MKSAP cloze generator">
      <header class="header">
        <div class="brand">
          <img
            class="brand-icon"
            src="${chrome.runtime.getURL("assets/icon32.png")}"
            srcset="${chrome.runtime.getURL("assets/icon32.png")} 1x, ${chrome.runtime.getURL("assets/icon48.png")} 1.5x, ${chrome.runtime.getURL("assets/icon128.png")} 4x"
            width="32"
            height="32"
            alt=""
            aria-hidden="true"
          />
          <div class="brand-text">
            <h2 class="title">MKSAP Cloze</h2>
            <div id="status" class="status">Ready</div>
          </div>
        </div>
        <button id="closeButton" class="icon-button" type="button" aria-label="Hide panel" title="Hide panel">x</button>
      </header>
      <div class="body">
        <div id="message" class="message"></div>
        <div class="actions">
          <button id="generateButton" class="button primary" type="button">Generate cloze</button>
          <button id="copyButton" class="button" type="button" disabled>Copy</button>
        </div>
        <textarea id="cardOutput" class="output" spellcheck="false" placeholder="Generated cloze card will appear here."></textarea>
      </div>
    </section>
  `;

  const refs = {
    status: shadow.querySelector("#status"),
    message: shadow.querySelector("#message"),
    generateButton: shadow.querySelector("#generateButton"),
    copyButton: shadow.querySelector("#copyButton"),
    closeButton: shadow.querySelector("#closeButton"),
    cardOutput: shadow.querySelector("#cardOutput"),
    host,
    hasGenerated: false,
    isGenerating: false
  };

  refs.generateButton.addEventListener("click", () => handleGenerate(refs, { clearExisting: true }));
  refs.copyButton.addEventListener("click", () => handleCopy(refs));
  refs.closeButton.addEventListener("click", () => host.classList.remove(PANEL_VISIBLE_CLASS));

  return { host, refs };
}

function maybeAutoGenerate(refs) {
  if (refs.isGenerating || refs.hasGenerated || refs.cardOutput.value.trim()) {
    return;
  }

  handleGenerate(refs, { clearExisting: true });
}

async function handleGenerate(refs, { clearExisting } = { clearExisting: true }) {
  if (refs.isGenerating) {
    return;
  }

  setBusy(refs, true);
  setMessage(refs, "");
  if (clearExisting) {
    refs.cardOutput.value = "";
  }
  refs.copyButton.disabled = true;

  try {
    setStatus(refs, "Reading page");
    const capture = capturePageText();

    setStatus(refs, "Generating cloze");
    const response = await chrome.runtime.sendMessage({
      type: "mksap-anki:generate-cloze",
      capture
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "Could not generate a cloze card.");
    }

    refs.cardOutput.value = response.cloze;
    refs.hasGenerated = true;
    refs.copyButton.disabled = false;
    setStatus(refs, "Card ready");
    setMessage(refs, "Generated one cloze card.", "success");
  } catch (error) {
    setStatus(refs, "Not ready");
    setMessage(refs, error instanceof Error ? error.message : String(error), "error");
  } finally {
    setBusy(refs, false);
  }
}

async function handleCopy(refs) {
  const text = refs.cardOutput.value.trim();
  if (!text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus(refs, "Copied");
    setMessage(refs, "Copied card to clipboard.", "success");
  } catch {
    refs.cardOutput.focus();
    refs.cardOutput.select();
    setMessage(refs, "Could not copy automatically. The card text is selected.", "error");
  }
}

function capturePageText() {
  const text = document.body?.innerText?.trim() ?? "";
  if (!text) {
    throw new Error("Could not read meaningful page text from this MKSAP tab.");
  }

  return {
    title: document.title,
    url: location.href,
    text
  };
}

function setBusy(refs, isBusy) {
  refs.isGenerating = isBusy;
  refs.host.classList.toggle(GENERATING_CLASS, isBusy);
  refs.host.setAttribute("aria-busy", String(isBusy));
  refs.generateButton.disabled = isBusy;
  refs.generateButton.textContent = isBusy ? "Generating..." : "Generate cloze";
  refs.cardOutput.placeholder = isBusy ? "Generating cloze..." : "Generated cloze card will appear here.";
}

function setStatus(refs, status) {
  refs.status.textContent = status;
}

function setMessage(refs, message, type = "") {
  refs.message.textContent = message;
  refs.message.className = `message${message ? " is-visible" : ""}${type ? ` ${type}` : ""}`;
}
})();
