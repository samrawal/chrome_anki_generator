export const CODEX_BRIDGE_URL = "http://127.0.0.1:4555/generate-cloze";
export const BRIDGE_START_COMMAND = "npm start";

export async function generateClozeCard(pageCapture, options = {}) {
  const {
    url = CODEX_BRIDGE_URL,
    fetchImpl = globalThis.fetch
  } = options;

  if (!fetchImpl) {
    throw new Error("Fetch is not available in this environment.");
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pageCapture)
    });
  } catch {
    throw new Error(
      `Please start the MKSAP extension bridge so this extension can communicate with Codex. In the repo, run ${BRIDGE_START_COMMAND}, then try generating the card again. Bridge URL: ${url}`
    );
  }

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Bridge request failed with status ${response.status}.`);
  }

  if (typeof payload?.cloze !== "string" || !payload.cloze.trim()) {
    throw new Error("The local MKSAP bridge returned an empty cloze card.");
  }

  return payload.cloze.trim();
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
