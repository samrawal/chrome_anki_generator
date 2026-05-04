import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generateClozeCard } from "../src/bridgeClient.js";

describe("bridgeClient.generateClozeCard", () => {
  it("posts the captured page to the local bridge", async () => {
    let requestUrl;
    let requestOptions;
    const cloze = await generateClozeCard(
      { title: "MKSAP", url: "https://mksap.acponline.org/app/q", text: "Question text" },
      {
        url: "http://127.0.0.1:4555/generate-cloze",
        fetchImpl: async (url, options) => {
          requestUrl = url;
          requestOptions = options;
          return new Response(JSON.stringify({ cloze: "Use {{c1::spironolactone}} in selected HFrEF patients." }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    );

    assert.equal(requestUrl, "http://127.0.0.1:4555/generate-cloze");
    assert.equal(requestOptions.method, "POST");
    assert.equal(requestOptions.headers["Content-Type"], "application/json");
    assert.match(requestOptions.body, /Question text/);
    assert.equal(cloze, "Use {{c1::spironolactone}} in selected HFrEF patients.");
  });

  it("shows the bridge startup command when fetch fails", async () => {
    await assert.rejects(
      () =>
        generateClozeCard(
          { title: "MKSAP", url: "https://mksap.acponline.org/app/q", text: "Question text" },
          {
            fetchImpl: async () => {
              throw new Error("connection refused");
            }
          }
        ),
      /Start it with: npm start/
    );
  });

  it("surfaces bridge errors", async () => {
    await assert.rejects(
      () =>
        generateClozeCard(
          { title: "MKSAP", url: "https://mksap.acponline.org/app/q", text: "Question text" },
          {
            fetchImpl: async () =>
              new Response(JSON.stringify({ error: "Codex app-server connection closed." }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
              })
          }
        ),
      /Codex app-server connection closed/
    );
  });
});
