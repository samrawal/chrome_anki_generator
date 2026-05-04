import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildClozePrompt, extractClozeFromAgentText } from "../src/prompt.js";

describe("buildClozePrompt", () => {
  it("includes the one-card cloze and no-commentary constraints", () => {
    const prompt = buildClozePrompt({
      title: "MKSAP question",
      url: "https://mksap.acponline.org/app/test",
      text: "A patient has a clinical syndrome."
    });

    assert.match(prompt, /exactly one concise Anki cloze note/);
    assert.match(prompt, /\{\{c1::\.\.\.\}\}/);
    assert.match(prompt, /Do not include markdown fences, headings, explanations, commentary, or multiple cards/);
    assert.match(prompt, /Synthesize the key clinical teaching point/);
  });
});

describe("extractClozeFromAgentText", () => {
  it("extracts the cloze field from JSON", () => {
    assert.equal(
      extractClozeFromAgentText('{"cloze":"Use {{c1::beta blockers}} after MI when tolerated."}'),
      "Use {{c1::beta blockers}} after MI when tolerated."
    );
  });

  it("accepts a plain cloze response", () => {
    assert.equal(
      extractClozeFromAgentText("Treat hyperkalemia with {{c1::calcium gluconate}} when ECG changes are present."),
      "Treat hyperkalemia with {{c1::calcium gluconate}} when ECG changes are present."
    );
  });

  it("rejects malformed non-cloze output", () => {
    assert.throws(
      () => extractClozeFromAgentText('{"cloze":"This is not a cloze."}'),
      /not an Anki cloze card/
    );
  });
});
