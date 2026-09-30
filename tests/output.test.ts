import { test } from "node:test";
import assert from "node:assert/strict";
import { formatWebToolResult, cleanCitationMarkers, formatTerminalHyperlink } from "../src/output";

test("output - formatTerminalHyperlink formats valid OSC 8 sequence", () => {
  const link = formatTerminalHyperlink("https://example.com", "[1]");
  assert.equal(link, "\u001b]8;;https://example.com\u001b\\[1]\u001b]8;;\u001b\\");
});

test("output - cleanCitationMarkers replaces unicode citation markers with OSC 8 hyperlinked references", () => {
  const text = "OpenAI Codex \uE200cite\uE202turn0search0\uE201 L0: \uE200cite\uE2020†Skip to content\uE201";
  const results = [
    { ref_id: "turn0search0", title: "OpenAI Codex GitHub", url: "https://github.com/openai/codex" },
  ];

  const cleaned = cleanCitationMarkers(text, results);
  assert.equal(
    cleaned,
    "OpenAI Codex \u001b]8;;https://github.com/openai/codex\u001b\\[1]\u001b]8;;\u001b\\ L0: [Skip to content]"
  );
});

test("output - formatWebToolResult cleans citation markers and appends hyperlinked sources in response.output", () => {
  const cmd = { search_query: [{ q: "rust" }] };
  const response = {
    output: "Raw backend model output with citations \uE200cite\uE202turn0search0\uE201",
    results: [{ ref_id: "turn0search0", title: "Rust", url: "https://rust-lang.org" }],
  };

  const formatted = formatWebToolResult(cmd, response);
  assert.equal(
    formatted.content[0].text,
    "Raw backend model output with citations \u001b]8;;https://rust-lang.org\u001b\\[1]\u001b]8;;\u001b\\\n\nSources:\n[1] Rust (turn0search0) - \u001b]8;;https://rust-lang.org\u001b\\https://rust-lang.org\u001b]8;;\u001b\\"
  );
  assert.deepEqual(formatted.details.results, response.results);
});

test("output - formatWebToolResult falls back to formatted results if output is empty", () => {
  const cmd = { search_query: [{ q: "rust" }] };
  const response = {
    output: "",
    results: [{ title: "Rust", url: "https://rust-lang.org", snippet: "Rust lang" }],
  };

  const formatted = formatWebToolResult(cmd, response);
  assert.match(formatted.content[0].text, /Web Search Results:/);
  assert.match(formatted.content[0].text, /Rust/);
  assert.match(formatted.content[0].text, /https:\/\/rust-lang\.org/);
});

test("output - formatWebToolResult handles empty output and empty results", () => {
  const cmd = { search_query: [{ q: "nonexistent" }] };
  const response = { results: [] };

  const formatted = formatWebToolResult(cmd, response);
  assert.equal(formatted.content[0].text, "No output or structured web results returned.");
});

// Backend operation failures arrive as HTTP 200 bodies; these shapes were observed on the live endpoint.
const NO_RESPONSE = "Found no tool response. This likely means the arguments you provided were not valid.";
const badOpenBlock =
  "Internal Error ()\n\uE200cite\uE202turn1view0\uE201 [wordlim: 200] Unable to resolve open call due to invalid ref_id argument\nL0: Unable to resolve open call due to invalid ref_id argument\n";
const badOpenResult = {
  type: "text_result",
  ref_id: "turn1view0",
  title: "Internal Error",
  snippet: "Unable to resolve open call due to invalid ref_id argument",
};

test("output - HTTP 200 'no tool response' body is reported as an error", () => {
  const formatted = formatWebToolResult({ search_query: [{ q: "x" }] }, { output: NO_RESPONSE, results: [] });
  assert.equal(formatted.isError, true);
  assert.match(formatted.content[0].text, /not valid/);
});

test("output - HTTP 200 function-call parse error body is reported as an error", () => {
  const output = "Error parsing function call: Invalid function_name='run' call: kwargs={...}. Expected: type run = ...";
  const formatted = formatWebToolResult({ search_query: [{ q: "x" }] }, { output, results: [] });
  assert.equal(formatted.isError, true);
});

test("output - all operations failing with Internal Error results is reported as an error", () => {
  const formatted = formatWebToolResult(
    { open: [{ ref_id: "turn1view0" }] },
    { output: badOpenBlock, results: [badOpenResult] }
  );
  assert.equal(formatted.isError, true);
  assert.match(formatted.content[0].text, /invalid ref_id/);
  assert.match(formatted.content[0].text, /search again|open\(URL\)|open\(\{ ref_id: URL/i);
});

test("output - partial failure keeps successful content and flags the failed operation", () => {
  const output =
    "Rust (https://rust-lang.org)\n\uE200cite\uE202turn0search0\uE201 Rust release notes\n" +
    "--------------------------------------------------------------------------------\n" +
    badOpenBlock;
  const formatted = formatWebToolResult(
    { search_query: [{ q: "rust" }], open: [{ ref_id: "turn9view9" }] },
    {
      output,
      results: [
        { type: "text_result", ref_id: "turn0search0", title: "Rust", url: "https://rust-lang.org" },
        badOpenResult,
      ],
    }
  );
  assert.notEqual(formatted.isError, true);
  assert.match(formatted.content[0].text, /Rust release notes/);
  assert.match(formatted.content[0].text, /1 of 2 .*failed|Some operations failed/i);
  assert.match(formatted.content[0].text, /invalid ref_id/);
});

test("output - weather/image content with no structured results is a success", () => {
  const output = "\uE200cite\uE202turn0forecast0\uE201 Weather for Paris, France: Current Conditions: Rain, 70°F (21°C)";
  const formatted = formatWebToolResult({ weather: [{ location: "Paris" }] }, { output, results: [] });
  assert.notEqual(formatted.isError, true);
  assert.match(formatted.content[0].text, /Weather for Paris/);
});

test("output - an empty-but-valid search is not an error", () => {
  const output = "Empty search results\nNo results were found for the provided queries";
  const formatted = formatWebToolResult({ search_query: [{ q: "zzzz" }] }, { output, results: [] });
  assert.notEqual(formatted.isError, true);
  assert.match(formatted.content[0].text, /No results were found/);
});

test("output - a normal page that merely quotes error phrases is not an error", () => {
  const output =
    "Debugging tips (https://example.com/blog)\n\uE200cite\uE202turn0view0\uE201 L0: If you see \"Internal Error ()\" or " +
    `"${NO_RESPONSE}" in logs, retry.`;
  const formatted = formatWebToolResult(
    { open: [{ ref_id: "https://example.com/blog" }] },
    { output, results: [{ type: "text_result", ref_id: "turn0view0", title: "Debugging tips", url: "https://example.com/blog" }] }
  );
  assert.notEqual(formatted.isError, true);
});
