export const CLOZE_PROMPT_VERSION = "2026-05-03";

const MAX_PAGE_TEXT_CHARS = 24000;

export function buildClozePrompt({ title = "", url = "", text = "" } = {}) {
  const clippedText = normalizeWhitespace(text).slice(0, MAX_PAGE_TEXT_CHARS);

  return [
    "You are helping an internal medicine resident convert an MKSAP answer page into one Anki cloze card.",
    "",
    "Return exactly one concise Anki cloze note.",
    "The note must contain at least one cloze deletion using {{c1::...}} syntax.",
    "Synthesize the key clinical teaching point and what should be remembered.",
    "Do not copy long source passages.",
    "Do not include markdown fences, headings, explanations, commentary, or multiple cards.",
    "Return only JSON matching this shape: {\"cloze\":\"...\"}.",
    "",
    `Page title: ${title}`,
    `Page URL: ${url}`,
    "",
    "MKSAP page text:",
    clippedText
  ].join("\n");
}

export function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function extractClozeFromAgentText(agentText) {
  const trimmed = stripMarkdownFence(String(agentText ?? "").trim());
  if (!trimmed) {
    throw new Error("Codex returned an empty response.");
  }

  const jsonValue = parseJsonObject(trimmed);
  const cloze = typeof jsonValue?.cloze === "string" ? jsonValue.cloze.trim() : trimmed;

  if (!cloze.includes("{{c1::") || !cloze.includes("}}")) {
    throw new Error("Codex returned text, but it was not an Anki cloze card.");
  }

  return cloze;
}

function stripMarkdownFence(value) {
  const fenceMatch = value.match(/^```(?:json|text)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : value;
}

function parseJsonObject(value) {
  if (!value.startsWith("{")) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
