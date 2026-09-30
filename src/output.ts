import type { SearchResponse, SearchResult } from "./normalize.js";
import { OPERATION_KEYS, type WebRunCommand } from "./commands.js";

export interface FormattedToolOutput {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
  isError?: boolean;
}

export function formatTerminalHyperlink(url: string, text: string): string {
  if (!url) return text;
  return `\u001b]8;;${url}\u001b\\${text}\u001b]8;;\u001b\\`;
}

export function cleanCitationMarkers(text: string, results: SearchResult[] = []): string {
  if (!text) return "";

  const refToEntryMap = new Map<string, { num: number; item: SearchResult }>();
  results.forEach((r, idx) => {
    const ref = r.ref_id;
    if (ref) {
      refToEntryMap.set(ref, { num: idx + 1, item: r });
    }
  });

  // 1. Matches Codex private Unicode citation markers: \uE200cite\uE202<ref>\uE201 or cite<ref>
  let cleaned = text.replace(/[\uE000-\uE2FF]?cite[\uE000-\uE2FF]?([^\uE000-\uE2FF\r\n]+)[\uE000-\uE2FF]?/gi, (_match: string, inner: string) => {
    const cleanInner = inner.trim();
    if (!cleanInner) return "";

    if (cleanInner.includes("†")) {
      const parts = cleanInner.split("†");
      const label = parts.slice(1).join("†").trim();
      return label ? `[${label}]` : "";
    }

    if (refToEntryMap.has(cleanInner)) {
      const entry = refToEntryMap.get(cleanInner)!;
      const label = `[${entry.num}]`;
      return entry.item.url ? formatTerminalHyperlink(entry.item.url, label) : label;
    }

    return `[${cleanInner}]`;
  });

  // 2. Converts raw turn references like [turn0search0, turn2view0] into clickable OSC 8 hyperlink brackets [1] [2]
  cleaned = cleaned.replace(/\[(turn\d+[a-z0-9_,\s]*)\]/gi, (_match: string, inner: string) => {
    const refs = inner.split(",").map((s) => s.trim());
    const formattedRefs = refs.map((ref) => {
      if (refToEntryMap.has(ref)) {
        const entry = refToEntryMap.get(ref)!;
        const label = `[${entry.num}]`;
        return entry.item.url ? formatTerminalHyperlink(entry.item.url, label) : label;
      }
      return `[${ref}]`;
    });
    return formattedRefs.join(" ");
  });

  return cleaned;
}

export function formatWebToolResult(command: WebRunCommand, response: SearchResponse): FormattedToolOutput {
  let primaryText = "";

  if (typeof response.output === "string" && response.output.trim().length > 0) {
    primaryText = cleanCitationMarkers(response.output.trim(), response.results);

    // Append formatted source reference list if results exist and aren't already formatted at end
    if (response.results && response.results.length > 0 && !primaryText.includes("Sources:")) {
      const sourcesList = response.results
        .filter((r): r is SearchResult & { url: string } => Boolean(r.url))
        .slice(0, 10)
        .map((r, idx) => {
          const num = idx + 1;
          const title = r.title ? r.title : r.url;
          const refStr = r.ref_id ? ` (${r.ref_id})` : "";
          const clickableUrl = formatTerminalHyperlink(r.url, r.url);
          return `[${num}] ${title}${refStr} - ${clickableUrl}`;
        });

      if (sourcesList.length > 0) {
        primaryText += `\n\nSources:\n${sourcesList.join("\n")}`;
      }
    }
  } else if (response.results && response.results.length > 0) {
    const formatted = response.results.map((item, idx) => {
      const num = idx + 1;
      const title = item.title ? item.title : item.url ?? `Result ${num}`;
      const clickableUrl = item.url ? formatTerminalHyperlink(item.url, item.url) : "";
      const urlLine = clickableUrl ? `   URL: ${clickableUrl}\n` : "";
      const refLine = item.ref_id ? `   Ref: [${num}] (${item.ref_id})\n` : "";
      const snippetLine = item.snippet ? cleanCitationMarkers(item.snippet, response.results) : "";
      return `[${num}] ${title}\n${refLine}${urlLine}${snippetLine ? "   " + snippetLine : ""}`.trim();
    });
    primaryText = `Web Search Results:\n\n${formatted.join("\n\n")}`;
  } else {
    primaryText = "No output or structured web results returned.";
  }

  const failure = detectOperationFailure(command, response);
  if (failure.whole && failure.message) {
    return {
      content: [{ type: "text", text: `Web action failed: ${failure.message}${FOLLOW_UP_HINT(failure.message)}` }],
      details: { command, results: response.results, error: failure.message },
      isError: true,
    };
  }
  if (failure.message) {
    primaryText = `Some operations failed (${failure.failedCount} of ${failure.totalCount}): ${failure.message}${FOLLOW_UP_HINT(failure.message)}\n\n${primaryText}`;
  }

  return {
    content: [
      {
        type: "text",
        text: primaryText,
      },
    ],
    details: {
      command,
      results: response.results,
      ...(failure.message ? { error: failure.message } : {}),
    },
  };
}

// Error envelopes observed from the endpoint. They are HTTP 200 and only recognisable by shape:
// the whole output starts with one of these prefixes, or a result is an "Internal Error" entry
// without a URL whose snippet starts with "Unable to resolve". Page text that merely quotes
// these phrases does not match.
const WHOLE_BODY_ERROR_PREFIXES = ["Found no tool response.", "Error parsing function call:"];

function FOLLOW_UP_HINT(message: string): string {
  return /invalid ref_id/i.test(message)
    ? " (the reference is unknown in this research session; search again or open the page by its full URL)"
    : "";
}

function isErrorResult(r: SearchResult): boolean {
  return r.title === "Internal Error" && !r.url && /^Unable to resolve\b/.test(r.snippet ?? "");
}

function countOperations(command: WebRunCommand): number {
  return OPERATION_KEYS.reduce((total, key) => total + (command[key]?.length ?? 0), 0);
}

function detectOperationFailure(
  command: WebRunCommand,
  response: SearchResponse
): { whole: boolean; message?: string; failedCount: number; totalCount: number } {
  const totalCount = countOperations(command);
  const output = (response.output ?? "").trim();
  // Whole-body envelopes come with no page results; a real page may have a title with the same words.
  const hasPageResult = (response.results ?? []).some((r) => Boolean(r.url));
  const prefix = !hasPageResult && WHOLE_BODY_ERROR_PREFIXES.find((p) => output.startsWith(p));
  if (prefix) {
    return { whole: true, message: output.split("\n")[0].slice(0, 300), failedCount: totalCount, totalCount };
  }

  const errors = (response.results ?? []).filter(isErrorResult);
  if (errors.length === 0) return { whole: false, failedCount: 0, totalCount };

  const message = [...new Set(errors.map((r) => r.snippet!))].join("; ");
  const failedCount = errors.length;
  return { whole: failedCount >= totalCount, message, failedCount, totalCount };
}
