import test from "node:test";
import assert from "node:assert/strict";
import gemini from "../src/lib/scrap/ai/gemini.js";

test("the supplied Gemini scraper is the active provider", () => {
  assert.equal(typeof gemini.chat, "function");
  assert.equal(typeof gemini.chatStream, "function");
});
